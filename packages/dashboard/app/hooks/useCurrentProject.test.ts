import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCurrentProject } from "./useCurrentProject";
import type { ProjectInfo } from "../api";

describe("useCurrentProject", () => {
  const mockProjects: ProjectInfo[] = [
    {
      id: "proj_1",
      name: "Project One",
      path: "/path/one",
      status: "active",
      isolationMode: "in-process",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "proj_2",
      name: "Project Two",
      path: "/path/two",
      status: "paused",
      isolationMode: "child-process",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("initializes with null when no saved project and no available projects", async () => {
    const { result } = renderHook(() => useCurrentProject([]));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.currentProject).toBeNull();
  });

  it("defaults to first active project when projects available but no selection", async () => {
    const { result } = renderHook(() => useCurrentProject(mockProjects));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should default to first active project
    await waitFor(() => {
      expect(result.current.currentProject?.id).toBe("proj_1");
    });
  });

  it("loads saved project from localStorage", async () => {
    localStorage.setItem("kb-dashboard-current-project", JSON.stringify(mockProjects[0]));

    const { result } = renderHook(() => useCurrentProject(mockProjects));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // After validation, it should have the saved project
    await waitFor(() => {
      expect(result.current.currentProject).not.toBeNull();
    });
  });

  it("defaults to first active project when no selection", async () => {
    const { result } = renderHook(() => useCurrentProject(mockProjects));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should default to first active project
    await waitFor(() => {
      expect(result.current.currentProject?.id).toBe("proj_1");
    });
  });

  it("clears selection when project no longer exists", async () => {
    const unregisteredProject: ProjectInfo = {
      id: "proj_old",
      name: "Old Project",
      path: "/old/path",
      status: "active",
      isolationMode: "in-process",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    localStorage.setItem("kb-dashboard-current-project", JSON.stringify(unregisteredProject));

    const { result } = renderHook(() => useCurrentProject(mockProjects));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should clear and default to first active
    await waitFor(() => {
      expect(result.current.currentProject?.id).toBe("proj_1");
    });
  });

  it("setCurrentProject updates selection and saves to localStorage", async () => {
    const { result } = renderHook(() => useCurrentProject(mockProjects));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setCurrentProject(mockProjects[1]);
    });

    expect(result.current.currentProject?.id).toBe("proj_2");
    expect(localStorage.getItem("kb-dashboard-current-project")).toContain("proj_2");
  });

  it("clearCurrentProject removes selection and re-defaults when projects available", async () => {
    localStorage.setItem("kb-dashboard-current-project", JSON.stringify(mockProjects[1]));

    const { result } = renderHook(() => useCurrentProject(mockProjects));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // After loading, we should have proj_2 from localStorage
    await waitFor(() => {
      expect(result.current.currentProject?.id).toBe("proj_2");
    });

    act(() => {
      result.current.clearCurrentProject();
    });

    // With available projects, it re-defaults to first active and saves to localStorage
    await waitFor(() => {
      expect(result.current.currentProject?.id).toBe("proj_1");
    });
    
    // After re-defaulting, localStorage should have the default project
    expect(localStorage.getItem("kb-dashboard-current-project")).toContain("proj_1");
  });

  it("handles localStorage errors gracefully", async () => {
    // Mock localStorage to throw
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = vi.fn(() => {
      throw new Error("Storage error");
    });

    const { result } = renderHook(() => useCurrentProject(mockProjects));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setCurrentProject(mockProjects[0]);
    });

    // Should still update state even if localStorage fails
    expect(result.current.currentProject?.id).toBe("proj_1");

    // Restore
    localStorage.setItem = originalSetItem;
  });
});
