import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Header } from "../Header";
import { ResearchView } from "../ResearchView";

const mockUseResearch = vi.fn();

vi.mock("../../hooks/useResearch", () => ({
  useResearch: (...args: unknown[]) => mockUseResearch(...args),
}));

vi.mock("../../api", () => ({
  fetchScripts: vi.fn().mockResolvedValue({}),
}));

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    Search: () => null,
    Loader2: ({ className }: { className?: string }) => <span data-testid="loader-icon" className={className}>Loader</span>,
  };
});

function mockMatchMediaDesktop() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("Research navigation", () => {
  it("shows research in header overflow and activates view change", async () => {
    mockMatchMediaDesktop();
    const onChangeView = vi.fn();

    render(
      <Header
        onOpenSettings={vi.fn()}
        onOpenGitHubImport={vi.fn()}
        globalPaused={false}
        enginePaused={false}
        onToggleGlobalPause={vi.fn()}
        onToggleEnginePause={vi.fn()}
        view="board"
        onChangeView={onChangeView}
        experimentalFeatures={{ researchView: true }}
      />,
    );

    fireEvent.click(screen.getByTestId("view-toggle-overflow-trigger"));
    await waitFor(() => expect(screen.getByTestId("view-overflow-research")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("view-overflow-research"));
    expect(onChangeView).toHaveBeenCalledWith("research");
  });
});

describe("ResearchView", () => {
  const baseHookValue = {
    runs: [],
    selectedRun: null,
    selectedRunId: null,
    setSelectedRunId: vi.fn(),
    availability: { available: true, supportedProviders: ["web-search"], supportedExportFormats: ["markdown", "json", "html"] },
    loading: false,
    error: null,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    createRun: vi.fn(),
    cancelRun: vi.fn().mockResolvedValue({}),
    retryRun: vi.fn().mockResolvedValue({}),
    exportRun: vi.fn().mockResolvedValue({ filename: "run.md", content: "# test", format: "markdown" }),
    createTaskFromRun: vi.fn().mockResolvedValue({}),
    attachRunToTask: vi.fn().mockResolvedValue({}),
    statusCounts: { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
    refresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseResearch.mockReturnValue(baseHookValue);
  });

  it("renders empty state", () => {
    render(<ResearchView projectId="p1" />);
    expect(screen.getByTestId("research-state-empty")).toBeInTheDocument();
  });

  it("renders selected run details", () => {
    mockUseResearch.mockReturnValue({
      ...baseHookValue,
      runs: [{ id: "RR-1", title: "t", query: "q", status: "running" }],
      selectedRun: { id: "RR-1", title: "t", query: "q", status: "running", events: [], results: { summary: "Summary", findings: [], citations: [] } },
      selectedRunId: "RR-1",
      statusCounts: { pending: 0, running: 1, completed: 0, failed: 0, cancelled: 0 },
    });

    render(<ResearchView projectId="p1" />);
    expect(screen.getByTestId("research-state-results")).toHaveTextContent("Summary");
  });

  it("triggers lifecycle/task/export actions", async () => {
    const cancelRun = vi.fn().mockResolvedValue({});
    const retryRun = vi.fn().mockResolvedValue({});
    const createTaskFromRun = vi.fn().mockResolvedValue({});
    const attachRunToTask = vi.fn().mockResolvedValue({});
    const exportRun = vi.fn().mockResolvedValue({ filename: "run.md", content: "# test", format: "markdown" });

    mockUseResearch.mockReturnValue({
      ...baseHookValue,
      runs: [{ id: "RR-1", title: "t", query: "q", status: "pending" }],
      selectedRun: { id: "RR-1", title: "t", query: "q", status: "pending", events: [{ id: "E-1", message: "queued" }], results: { summary: "Summary", findings: [], citations: [] } },
      selectedRunId: "RR-1",
      cancelRun,
      retryRun,
      createTaskFromRun,
      attachRunToTask,
      exportRun,
    });

    render(<ResearchView projectId="p1" />);

    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByText("Retry"));
    fireEvent.click(screen.getByText("Create Task"));
    fireEvent.change(screen.getByPlaceholderText("Task ID"), { target: { value: "FN-1" } });
    fireEvent.click(screen.getByText("Attach to Task"));
    fireEvent.click(screen.getByText("Export MD"));

    await waitFor(() => {
      expect(cancelRun).toHaveBeenCalled();
      expect(retryRun).toHaveBeenCalled();
      expect(createTaskFromRun).toHaveBeenCalled();
      expect(attachRunToTask).toHaveBeenCalled();
      expect(exportRun).toHaveBeenCalled();
    });
  });

  it("renders unavailable state without interactive workflow controls", () => {
    mockUseResearch.mockReturnValue({ ...baseHookValue, availability: { available: false, reason: "disabled" } });
    render(<ResearchView projectId="p1" />);
    expect(screen.getByTestId("research-state-unavailable")).toBeInTheDocument();
    expect(screen.queryByLabelText("Query")).not.toBeInTheDocument();
    expect(screen.queryByText("Create Run")).not.toBeInTheDocument();
  });

  it("renders human-readable provider labels", () => {
    mockUseResearch.mockReturnValue({
      ...baseHookValue,
      availability: { available: true, supportedProviders: ["web-search", "page-fetch", "llm-synthesis"] },
    });
    render(<ResearchView projectId="p1" />);
    expect(screen.getByText("Web Search")).toBeInTheDocument();
    expect(screen.getByText("Page Fetch")).toBeInTheDocument();
    expect(screen.getByText("LLM Synthesis")).toBeInTheDocument();
  });

  it("includes mobile layout media rule", async () => {
    const css = await import("../ResearchView.css?inline");
    expect(css.default).toContain("@media (max-width: 768px)");
    expect(css.default).toContain(".research-view__layout");
  });
});
