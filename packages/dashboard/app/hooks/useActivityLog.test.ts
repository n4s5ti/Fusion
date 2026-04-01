import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useActivityLog } from "./useActivityLog";
import type { ActivityFeedEntry } from "../api";

function mockFetchResponse(
  ok: boolean,
  body: unknown,
  status = ok ? 200 : 500,
  contentType = "application/json"
) {
  const bodyText = JSON.stringify(body);
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? contentType : null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(bodyText),
  } as unknown as Response);
}

describe("useActivityLog", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("initializes with empty entries and loads on mount", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(true, []));

    const { result } = renderHook(() => useActivityLog());

    expect(result.current.loading).toBe(true);
    expect(result.current.entries).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entries).toEqual([]);
  });

  it("fetches and displays activity entries", async () => {
    const mockEntries: ActivityFeedEntry[] = [
      {
        id: "entry_1",
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "task:created",
        projectId: "proj_123",
        projectName: "Test Project",
        taskId: "FN-001",
        details: "Task created",
      },
    ];
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(true, mockEntries));

    const { result } = renderHook(() => useActivityLog());

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });

    expect(result.current.entries[0].type).toBe("task:created");
    expect(result.current.entries[0].projectName).toBe("Test Project");
  });

  it("filters by projectId", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(true, []));

    renderHook(() => useActivityLog({ projectId: "proj_123" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("projectId=proj_123"),
        expect.any(Object)
      );
    });
  });

  it("filters by type", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(true, []));

    renderHook(() => useActivityLog({ type: "task:created" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("type=task%3Acreated"),
        expect.any(Object)
      );
    });
  });

  it("respects custom limit", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(true, []));

    renderHook(() => useActivityLog({ limit: 100 }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=100"),
        expect.any(Object)
      );
    });
  });

  it("does not auto-refresh when disabled", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(true, []));

    renderHook(() => useActivityLog({ autoRefresh: false }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    // Fast forward time (but not using fake timers for this test)
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 100));

    // Should still be 1
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("refresh function manually refreshes data", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(true, []));

    const { result } = renderHook(() => useActivityLog({ autoRefresh: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it("clear removes all entries", async () => {
    const mockEntries: ActivityFeedEntry[] = [
      {
        id: "entry_1",
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "task:created",
        projectId: "proj_123",
        projectName: "Test Project",
        details: "Task created",
      },
    ];
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(true, mockEntries));

    const { result } = renderHook(() => useActivityLog());

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.entries).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it("handles errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(false, { error: "Server error" }, 500));

    const { result } = renderHook(() => useActivityLog());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).not.toBeNull();
  });

  it("sets hasMore when entries equal limit", async () => {
    const mockEntries: ActivityFeedEntry[] = Array.from({ length: 50 }, (_, i) => ({
      id: `entry_${i}`,
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "task:created" as const,
      projectId: "proj_123",
      projectName: "Test Project",
      details: "Task created",
    }));
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(true, mockEntries));

    const { result } = renderHook(() => useActivityLog({ limit: 50 }));

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(50);
    });

    expect(result.current.hasMore).toBe(true);
  });

  it("sets hasMore to false when fewer entries than limit", async () => {
    const mockEntries: ActivityFeedEntry[] = Array.from({ length: 30 }, (_, i) => ({
      id: `entry_${i}`,
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "task:created" as const,
      projectId: "proj_123",
      projectName: "Test Project",
      details: "Task created",
    }));
    globalThis.fetch = vi.fn().mockReturnValue(mockFetchResponse(true, mockEntries));

    const { result } = renderHook(() => useActivityLog({ limit: 50 }));

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(30);
    });

    expect(result.current.hasMore).toBe(false);
  });
});
