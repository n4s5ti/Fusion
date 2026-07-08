import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadAllAppCss, loadStylesCss } from "../test/cssFixture";
import { render, screen, act } from "@testing-library/react";
import { QuickEntryBox } from "../components/QuickEntryBox";
import type { Task } from "@fusion/core";
import type { BoardWorkflowDefinition } from "../api";
import { fetchAgents } from "../api";

/*
FNXC:QuickAddWorkflow 2026-07-08-00:00:
FN-7677 regression coverage. The workflow trigger shares `.dep-trigger` with
InlineCreateCard/NewTaskModal/TaskDetailModal/TaskForm, whose global rule sets
`padding: 3px 8px` and overrides `.btn-sm`'s `padding: 4px 10px`. That made the
quick-add trigger ~2px shorter than the sibling Save/Fast/Subtask `.btn.btn-sm`
buttons. These tests assert the local `.quick-entry-workflow-trigger` override
re-asserts `.btn-sm`'s own padding value (not a new hardcoded literal) so the
box heights resolve equal, and that the fix holds at desktop widths (not just
inside the mobile touch-target `min-height` media block), and that the shared
global `.dep-trigger` rule itself remains untouched for other surfaces.
*/

const mockTasks: Task[] = [
  {
    id: "FN-001",
    title: "Test task 1",
    description: "First test task",
    column: "todo",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

const WORKFLOW_A: BoardWorkflowDefinition = {
  id: "builtin:coding",
  name: "Coding",
  columns: [],
};

const WORKFLOW_B: BoardWorkflowDefinition = {
  id: "wf-custom-long-name",
  name: "A Rather Long Custom Workflow Name That Should Truncate",
  columns: [],
};

vi.mock("../api", () => ({
  fetchModels: vi.fn().mockResolvedValue({
    models: [],
    favoriteProviders: [],
    favoriteModels: [],
  }),
  fetchSettings: vi.fn().mockResolvedValue({
    modelPresets: [],
    autoSelectModelPreset: false,
    defaultPresetBySize: {},
    maxConcurrent: 2,
    maxWorktrees: 4,
    pollIntervalMs: 30000,
    groupOverlappingFiles: true,
    autoMerge: true,
  }),
  fetchAgents: vi.fn().mockResolvedValue([]),
  fetchWorkflowOptionalSteps: vi.fn().mockResolvedValue([]),
  uploadAttachment: vi.fn().mockResolvedValue({}),
  updateGlobalSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock("lucide-react", () => ({
  Link: () => null,
  Paperclip: () => null,
  Brain: () => null,
  Lightbulb: () => null,
  ListTree: () => null,
  Sparkles: () => null,
  Save: () => null,
  X: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  ChevronRight: () => null,
  Bot: () => null,
  Server: () => null,
  Flag: () => null,
  Maximize2: () => null,
  Minimize2: () => null,
}));

vi.mock("../components/ModelSelectionModal", () => ({
  ModelSelectionModal: () => null,
}));

vi.mock("../components/CustomModelDropdown", () => ({
  CustomModelDropdown: ({
    value,
    label,
  }: {
    value: string;
    onChange: (value: string) => void;
    label: string;
  }) => <div data-testid={`mock-dropdown-${label}`}>{value || "none"}</div>,
}));

function mockDesktopViewport() {
  Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
  return vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderQuickEntryBox(props: Record<string, unknown> = {}) {
  const defaultProps = {
    onCreate: vi.fn().mockResolvedValue(undefined),
    addToast: vi.fn(),
    tasks: mockTasks,
    projectId: "test-proj",
    workflowId: WORKFLOW_A.id,
    defaultWorkflowId: WORKFLOW_A.id,
    workflowOptions: [WORKFLOW_A, WORKFLOW_B],
  };
  return render(<QuickEntryBox {...defaultProps} {...props} />);
}

describe("quick-entry-workflow-trigger height parity (FN-7677)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    vi.mocked(fetchAgents).mockResolvedValue([]);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:mock"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    localStorage.clear();
  });

  it("renders the workflow trigger and Save button as siblings in the same action row when ≥2 workflow options exist", () => {
    mockDesktopViewport();
    renderQuickEntryBox();

    const trigger = screen.getByTestId("quick-entry-workflow-trigger");
    const saveButton = screen.getByTestId("quick-entry-save");

    expect(trigger.classList.contains("btn")).toBe(true);
    expect(trigger.classList.contains("btn-sm")).toBe(true);
    expect(trigger.classList.contains("dep-trigger")).toBe(true);
    expect(saveButton.classList.contains("btn")).toBe(true);
    expect(saveButton.classList.contains("btn-sm")).toBe(true);

    // Both controls must live in the same .quick-entry-actions row.
    const actionsRow = trigger.closest(".quick-entry-actions");
    expect(actionsRow).not.toBeNull();
    expect(actionsRow?.contains(saveButton)).toBe(true);
  });

  it("does not render a workflow trigger when fewer than 2 real workflow options exist (no layout regression)", () => {
    mockDesktopViewport();
    renderQuickEntryBox({ workflowOptions: [WORKFLOW_A] });

    expect(screen.queryByTestId("quick-entry-workflow-trigger")).toBeNull();
    expect(screen.getByTestId("quick-entry-save")).toBeInTheDocument();
  });

  it("re-asserts .btn-sm's own padding on .quick-entry-workflow-trigger instead of inheriting the shorter shared .dep-trigger padding", () => {
    const cssContent = loadAllAppCss();

    // .btn-sm establishes the padding contract the Save/Fast/Subtask buttons resolve.
    const btnSmMatch = cssContent.match(/\.btn-sm\s*\{[^}]*padding:\s*([^;]+);/);
    expect(btnSmMatch).not.toBeNull();
    const btnSmPadding = btnSmMatch![1].trim();
    expect(btnSmPadding).toBe("4px 10px");

    // The shared global .dep-trigger rule sets a shorter padding and MUST remain
    // untouched — other surfaces (InlineCreateCard, NewTaskModal, TaskDetailModal,
    // TaskForm) still depend on its 3px/8px sizing.
    const depTriggerMatch = cssContent.match(
      /\.dep-trigger,\s*\n\s*\.inline-create-model-trigger\s*\{[^}]*padding:\s*([^;]+);/,
    );
    expect(depTriggerMatch).not.toBeNull();
    expect(depTriggerMatch![1].trim()).toBe("3px 8px");

    // .quick-entry-workflow-trigger must locally re-assert the .btn-sm padding
    // value (not a new arbitrary literal) so cascade order resolves it to the
    // same box height as its .btn.btn-sm siblings.
    const triggerMatch = cssContent.match(
      /\.quick-entry-workflow-trigger\s*\{[^}]*padding:\s*([^;]+);/,
    );
    expect(triggerMatch).not.toBeNull();
    const triggerPadding = triggerMatch![1].trim();
    expect(triggerPadding).toBe(btnSmPadding);
    expect(triggerPadding).not.toBe(depTriggerMatch![1].trim());
  });

  it("keeps the height-parity override in the base (non-media-query) rule so desktop widths are covered too, not only the ≤768px touch-target block", () => {
    const cssContent = loadAllAppCss();

    // Strip everything inside @media blocks to isolate base/desktop rules.
    const withoutMediaBlocks = cssContent.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");

    const baseTriggerMatch = withoutMediaBlocks.match(
      /\.quick-entry-workflow-trigger\s*\{[^}]*padding:\s*([^;]+);/,
    );
    expect(baseTriggerMatch).not.toBeNull();
    expect(baseTriggerMatch![1].trim()).toBe("4px 10px");
  });

  it("does not modify the shared global .dep-trigger rule's selector list (InlineCreateCard/NewTaskModal/TaskDetailModal/TaskForm still share it)", () => {
    const stylesCssContent = loadStylesCss();
    const depTriggerMatches = stylesCssContent.match(/\.dep-trigger,\s*\n\s*\.inline-create-model-trigger\s*\{/g);
    expect(depTriggerMatches).not.toBeNull();
    expect(depTriggerMatches!.length).toBe(1);
  });

  it("keeps the workflow icon, truncating label, and chevron intact when the trigger renders (long label)", () => {
    mockDesktopViewport();
    renderQuickEntryBox({ workflowOptions: [WORKFLOW_A, WORKFLOW_B], workflowId: WORKFLOW_B.id, defaultWorkflowId: WORKFLOW_B.id });

    const trigger = screen.getByTestId("quick-entry-workflow-trigger");
    const label = trigger.querySelector(".quick-entry-workflow-label");
    expect(label).not.toBeNull();
    expect(label?.textContent).toBeTruthy();
    // Chevron rendered via mocked lucide-react (ChevronDown -> null), so assert
    // the trigger still has non-empty content (icon slot + label), i.e. it is
    // not an empty shell.
    expect(trigger.textContent?.length ?? 0).toBeGreaterThan(0);
  });
});
