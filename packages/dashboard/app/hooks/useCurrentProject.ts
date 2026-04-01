import { useState, useEffect, useCallback } from "react";
import type { ProjectInfo } from "../api";

const STORAGE_KEY = "kb-dashboard-current-project";

export interface UseCurrentProjectResult {
  /** Currently selected project or null if none selected */
  currentProject: ProjectInfo | null;
  /** Set the current project */
  setCurrentProject: (project: ProjectInfo | null) => void;
  /** Clear the current project selection */
  clearCurrentProject: () => void;
  /** Whether we're still loading from localStorage */
  loading: boolean;
}

/**
 * Hook for managing the currently selected project.
 * Persists selection to localStorage and validates the project still exists.
 */
export function useCurrentProject(availableProjects: ProjectInfo[]): UseCurrentProjectResult {
  const [currentProject, setCurrentProjectState] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ProjectInfo;
        setCurrentProjectState(parsed);
      }
    } catch {
      // Ignore localStorage errors
    } finally {
      setLoading(false);
    }
  }, []);

  // Validate project still exists and persist to localStorage
  useEffect(() => {
    if (loading) return;

    if (currentProject) {
      // Validate project still exists in available projects
      const stillExists = availableProjects.some((p) => p.id === currentProject.id);
      if (!stillExists && availableProjects.length > 0) {
        // Project was unregistered - clear selection and default to first active
        const firstActive = availableProjects.find((p) => p.status === "active");
        setCurrentProjectState(firstActive || availableProjects[0] || null);
        return;
      }
      
      // Persist to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentProject));
      } catch {
        // Ignore localStorage errors
      }
    } else if (availableProjects.length > 0) {
      // No selection but projects available - default to first active
      const firstActive = availableProjects.find((p) => p.status === "active");
      if (firstActive) {
        setCurrentProjectState(firstActive);
      }
    }
  }, [currentProject, availableProjects, loading]);

  const setCurrentProject = useCallback((project: ProjectInfo | null) => {
    setCurrentProjectState(project);
    if (project) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      } catch {
        // Ignore localStorage errors
      }
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore localStorage errors
      }
    }
  }, []);

  const clearCurrentProject = useCallback(() => {
    setCurrentProjectState(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  return {
    currentProject,
    setCurrentProject,
    clearCurrentProject,
    loading,
  };
}
