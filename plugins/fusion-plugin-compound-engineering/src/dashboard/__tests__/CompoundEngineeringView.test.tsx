import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiscoveryResult } from "../../artifacts/discovery.js";

// Mock the network layer so the view renders from seeded discovery results.
const listArtifacts = vi.fn(async (): Promise<DiscoveryResult> => {
  throw new Error("listArtifacts mock not configured");
});
vi.mock("../hooks/api.js", () => ({
  listArtifacts: () => listArtifacts(),
  getArtifactPreviewUrl: (id: string) => `/preview/${id}`,
}));

import { CompoundEngineeringView } from "../CompoundEngineeringView.js";
import { __test_clearArtifactsCache } from "../hooks/useArtifacts.js";

const ALL_STAGES: Array<{ stage: DiscoveryResult["groups"][number]["stage"]; label: string }> = [
  { stage: "strategy", label: "Strategy" },
  { stage: "ideation", label: "Ideation" },
  { stage: "brainstorm", label: "Brainstorms" },
  { stage: "plan", label: "Plans" },
  { stage: "solution", label: "Solutions" },
  { stage: "concepts", label: "Concepts" },
];

function makeResult(overrides: Partial<Record<DiscoveryResult["groups"][number]["stage"], DiscoveryResult["groups"][number]["entries"]>>): DiscoveryResult {
  const groups = ALL_STAGES.map(({ stage, label }) => ({
    stage,
    label,
    present: Boolean(overrides[stage]?.length),
    entries: overrides[stage] ?? [],
  }));
  let totalArtifacts = 0;
  let totalErrors = 0;
  for (const g of groups) {
    for (const e of g.entries) {
      if (e.kind === "artifact") totalArtifacts += 1;
      else totalErrors += 1;
    }
  }
  return { groups, totalArtifacts, totalErrors };
}

describe("CompoundEngineeringView", () => {
  beforeEach(() => {
    __test_clearArtifactsCache();
    listArtifacts.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it("renders the empty / first-run state with an orientation + start action", async () => {
    listArtifacts.mockResolvedValue(makeResult({}));
    render(<CompoundEngineeringView projectId="p1" enabledOverride />);

    await screen.findByTestId("ce-empty-state");
    expect(screen.getByText(/Start your compounding pipeline/i)).toBeInTheDocument();
    const start = screen.getByTestId("ce-start-action");
    expect(start).toBeInTheDocument();
    // Start affordance is wired to a placeholder (toast); clicking does not throw.
    fireEvent.click(start);
  });

  it("renders the partial-discovery state (some categories present, others empty)", async () => {
    listArtifacts.mockResolvedValue(
      makeResult({
        strategy: [
          { kind: "artifact", id: "strategy:STRATEGY.md", stage: "strategy", path: "STRATEGY.md", name: "STRATEGY.md", size: 10, updatedAt: 1 },
        ],
        plan: [
          { kind: "artifact", id: "plan:docs/plans/p.md", stage: "plan", path: "docs/plans/p.md", name: "p.md", size: 5, updatedAt: 2 },
        ],
      }),
    );
    render(<CompoundEngineeringView projectId="p1" enabledOverride />);

    await screen.findByTestId("ce-summary");
    // Partial flag surfaces in the summary and on the groups container.
    expect(screen.getByTestId("ce-summary").textContent).toMatch(/partial/i);
    const groups = screen.getByTestId("ce-summary").closest(".ce-view")!.querySelector(".ce-groups");
    expect(groups?.getAttribute("data-partial")).toBe("true");
    // Populated groups render artifacts; empty ones render an empty hint.
    expect(screen.getAllByTestId("ce-artifact")).toHaveLength(2);
    expect(screen.getAllByTestId("ce-group-empty").length).toBeGreaterThan(0);
  });

  it("renders an error entry for an unreadable artifact (not a crash or silent drop)", async () => {
    listArtifacts.mockResolvedValue(
      makeResult({
        plan: [
          { kind: "error", id: "plan:docs/plans/bad.md", stage: "plan", path: "docs/plans/bad.md", name: "bad.md", error: "EIO: simulated read failure" },
        ],
      }),
    );
    render(<CompoundEngineeringView projectId="p1" enabledOverride />);

    const errorEntry = await screen.findByTestId("ce-artifact-error");
    expect(errorEntry).toBeInTheDocument();
    expect(errorEntry.textContent).toMatch(/simulated read failure/i);
    // Surfaced as an unreadable count in the summary.
    expect(screen.getByTestId("ce-summary").textContent).toMatch(/unreadable/i);
  });

  it("does not fetch when the viewport-gated flag is disabled", async () => {
    listArtifacts.mockResolvedValue(makeResult({}));
    render(<CompoundEngineeringView projectId="p1" enabledOverride={false} />);
    // Give effects a tick.
    await waitFor(() => expect(screen.getByTestId("compound-engineering-view")).toBeInTheDocument());
    expect(listArtifacts).not.toHaveBeenCalled();
  });
});
