import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useResearch } from "../useResearch";

const mockListResearchRuns = vi.fn();
const mockGetResearchRun = vi.fn();

vi.mock("../../api", () => ({
  listResearchRuns: (...args: unknown[]) => mockListResearchRuns(...args),
  getResearchRun: (...args: unknown[]) => mockGetResearchRun(...args),
  createResearchRun: vi.fn(),
  cancelResearchRun: vi.fn(),
  retryResearchRun: vi.fn(),
  exportResearchRun: vi.fn(),
  createTaskFromResearchRun: vi.fn(),
  attachResearchRunToTask: vi.fn(),
}));

vi.mock("../../sse-bus", () => ({
  subscribeSse: vi.fn(() => () => {}),
}));

describe("useResearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads research runs and availability", async () => {
    mockListResearchRuns.mockResolvedValue({
      runs: [
        {
          id: "RR-1",
          query: "query",
          title: "query",
          status: "running",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      availability: { available: true },
    });

    const { result } = renderHook(() => useResearch({ projectId: "p1" }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.runs).toHaveLength(1);
      expect(result.current.availability.available).toBe(true);
    });
  });

  it("loads selected run detail", async () => {
    mockListResearchRuns.mockResolvedValue({ runs: [], availability: { available: true } });
    mockGetResearchRun.mockResolvedValue({ run: { id: "RR-2", title: "t" }, availability: { available: true } });

    const { result } = renderHook(() => useResearch({ projectId: "p1" }));

    act(() => {
      result.current.setSelectedRunId("RR-2");
    });

    await waitFor(() => {
      expect(mockGetResearchRun).toHaveBeenCalledWith("RR-2", "p1");
    });
  });
});
