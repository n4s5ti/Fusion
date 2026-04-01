import { useState, useEffect, useCallback, useRef } from "react";
import type { ActivityFeedEntry } from "../api";
import { fetchActivityFeed } from "../api";

export interface UseActivityLogResult {
  /** Activity log entries */
  entries: ActivityFeedEntry[];
  /** Loading state */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually refresh activity log */
  refresh: () => Promise<void>;
  /** Clear all entries from state */
  clear: () => void;
  /** Whether there are more entries to load */
  hasMore: boolean;
  /** Load more (older) entries */
  loadMore: () => Promise<void>;
}

const POLL_INTERVAL_MS = 5000; // 5 seconds

export interface UseActivityLogOptions {
  /** Filter by project ID */
  projectId?: string;
  /** Filter by event type */
  type?: ActivityFeedEntry["type"];
  /** Number of entries to fetch per page */
  limit?: number;
  /** Whether to auto-refresh */
  autoRefresh?: boolean;
}

/**
 * Hook for fetching and managing the activity log.
 * Automatically polls for updates every 5 seconds when enabled.
 * Supports filtering by project and event type.
 */
export function useActivityLog(options: UseActivityLogOptions = {}): UseActivityLogResult {
  const { projectId, type, limit = 50, autoRefresh = true } = options;
  
  const [entries, setEntries] = useState<ActivityFeedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTimestampRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchActivityFeed({ limit, projectId, type });
      setEntries(data);
      setHasMore(data.length === limit);
      
      if (data.length > 0) {
        lastTimestampRef.current = data[data.length - 1].timestamp;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity log");
    } finally {
      setLoading(false);
    }
  }, [limit, projectId, type]);

  const loadMore = useCallback(async () => {
    if (!lastTimestampRef.current) return;
    
    try {
      setLoading(true);
      
      const data = await fetchActivityFeed({ 
        limit, 
        projectId, 
        type, 
        since: lastTimestampRef.current 
      });
      
      setEntries((prev) => [...prev, ...data]);
      setHasMore(data.length === limit);
      
      if (data.length > 0) {
        lastTimestampRef.current = data[data.length - 1].timestamp;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more entries");
    } finally {
      setLoading(false);
    }
  }, [limit, projectId, type]);

  const clear = useCallback(() => {
    setEntries([]);
    setHasMore(false);
    lastTimestampRef.current = undefined;
  }, []);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;

    intervalRef.current = setInterval(() => {
      refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refresh]);

  return {
    entries,
    loading,
    error,
    refresh,
    clear,
    hasMore,
    loadMore,
  };
}
