import { useState, useEffect, useRef, useCallback } from "react";
import type { ProjectHealth } from "../api";
import { fetchProjectHealth } from "../api";

export interface UseProjectHealthResult {
  /** Current health metrics */
  health: ProjectHealth | null;
  /** Project status derived from health */
  status: "active" | "paused" | "errored" | "initializing" | null;
  /** Number of active tasks */
  activeTasks: number;
  /** Last activity timestamp */
  lastActivityAt: string | null;
  /** Loading state */
  loading: boolean;
  /** Manually refresh health */
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 10000; // 10 seconds

/**
 * Hook for polling project health metrics.
 * Automatically polls every 10 seconds when the project is active.
 * Stops polling when component unmounts.
 */
export function useProjectHealth(projectId: string | null): UseProjectHealthResult {
  const [health, setHealth] = useState<ProjectHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      const data = await fetchProjectHealth(projectId);
      setHealth(data);
    } catch (err) {
      // Silently fail - don't clear health on error
      console.error("Failed to fetch project health:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Initial fetch
  useEffect(() => {
    if (!projectId) {
      setHealth(null);
      return;
    }

    refresh();
  }, [projectId, refresh]);

  // Polling when project is active
  useEffect(() => {
    if (!projectId) return;
    
    // Stop any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only poll when project is active
    const shouldPoll = !health || health.status === "active" || health.status === "initializing";
    
    if (shouldPoll) {
      intervalRef.current = setInterval(() => {
        refresh();
      }, POLL_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [projectId, health?.status, refresh]);

  // Derived values
  const status = health?.status ?? null;
  const activeTasks = health?.activeTaskCount ?? 0;
  const lastActivityAt = health?.lastActivityAt ?? null;

  return {
    health,
    status,
    activeTasks,
    lastActivityAt,
    loading,
    refresh,
  };
}
