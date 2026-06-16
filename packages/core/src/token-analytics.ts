import type { Database } from "./db.js";

/**
 * Token-consumption analytics over the `tasks` table, generalizing the fixed
 * 24h/7d/all-time windows of `agent-token-usage.ts` to an arbitrary `(from, to)`
 * range. Sums the `tokenUsage*` columns filtered by `tokenUsageLastUsedAt` and
 * groups by model / provider / node / agent.
 *
 * Inclusivity: `from`/`to` bounds are **inclusive** (`>= from AND <= to`),
 * matching `usage-events.ts` and the range-scan house style. A task whose
 * `tokenUsageLastUsedAt` is exactly equal to `from` is therefore included.
 *
 * Pure read-only aggregation: takes a `Database` handle and returns plain data.
 */

/** Dimension to group token totals by. */
export type TokenGroupBy = "model" | "provider" | "node" | "agent";

/** Summed token counts for a group (or the grand total). */
export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  /** Number of tasks that contributed to these totals. */
  nTasks: number;
}

/** One group's token totals, keyed by the grouped dimension value. */
export interface TokenGroupSummary extends TokenTotals {
  /** The group key (model id, provider, nodeId, or agentId); null when unset. */
  key: string | null;
}

/** Result of {@link aggregateTokenAnalytics}. */
export interface TokenAnalytics {
  from: string | null;
  to: string | null;
  groupBy: TokenGroupBy | null;
  /** Grand total across all matched tasks. */
  totals: TokenTotals;
  /** Per-group totals; empty array when no `groupBy` requested. */
  groups: TokenGroupSummary[];
}

export interface TokenAnalyticsQuery {
  /** ISO-8601 lower bound (inclusive) on `tokenUsageLastUsedAt`. */
  from?: string;
  /** ISO-8601 upper bound (inclusive) on `tokenUsageLastUsedAt`. */
  to?: string;
  groupBy?: TokenGroupBy;
}

function emptyTotals(): TokenTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    nTasks: 0,
  };
}

interface TaskTokenRow {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
  modelProvider: string | null;
  modelId: string | null;
  checkoutNodeId: string | null;
  assignedAgentId: string | null;
}

function groupKeyFor(row: TaskTokenRow, groupBy: TokenGroupBy): string | null {
  switch (groupBy) {
    case "model":
      return row.modelId;
    case "provider":
      return row.modelProvider;
    case "node":
      return row.checkoutNodeId;
    case "agent":
      return row.assignedAgentId;
  }
}

function addRow(totals: TokenTotals, row: TaskTokenRow): void {
  totals.inputTokens += row.inputTokens ?? 0;
  totals.outputTokens += row.outputTokens ?? 0;
  totals.cachedTokens += row.cachedTokens ?? 0;
  totals.cacheWriteTokens += row.cacheWriteTokens ?? 0;
  // Prefer the persisted total when present; otherwise derive it from the parts
  // so callers always get a coherent `totalTokens` even on older rows.
  const persistedTotal = row.totalTokens;
  totals.totalTokens +=
    persistedTotal ??
    (row.inputTokens ?? 0) +
      (row.outputTokens ?? 0) +
      (row.cachedTokens ?? 0) +
      (row.cacheWriteTokens ?? 0);
  totals.nTasks += 1;
}

/**
 * Aggregate per-task token usage over a date range, optionally grouped.
 *
 * Tasks are matched by `tokenUsageLastUsedAt` within `[from, to]` (inclusive).
 * Tasks with no token usage (`tokenUsageLastUsedAt IS NULL`) are excluded. An
 * empty range yields zeroed `totals` and an empty `groups` array — never nulls.
 */
export function aggregateTokenAnalytics(
  db: Database,
  query: TokenAnalyticsQuery = {},
): TokenAnalytics {
  const clauses: string[] = ["tokenUsageLastUsedAt IS NOT NULL"];
  const params: string[] = [];
  if (query.from !== undefined) {
    clauses.push("tokenUsageLastUsedAt >= ?");
    params.push(query.from);
  }
  if (query.to !== undefined) {
    clauses.push("tokenUsageLastUsedAt <= ?");
    params.push(query.to);
  }
  const where = `WHERE ${clauses.join(" AND ")}`;

  const rows = db
    .prepare(
      `SELECT
         tokenUsageInputTokens   AS inputTokens,
         tokenUsageOutputTokens  AS outputTokens,
         tokenUsageCachedTokens  AS cachedTokens,
         tokenUsageCacheWriteTokens AS cacheWriteTokens,
         tokenUsageTotalTokens   AS totalTokens,
         modelProvider,
         modelId,
         checkoutNodeId,
         assignedAgentId
       FROM tasks ${where}`,
    )
    .all(...params) as TaskTokenRow[];

  const totals = emptyTotals();
  const groupMap = new Map<string | null, TokenGroupSummary>();
  const groupBy = query.groupBy;

  for (const row of rows) {
    addRow(totals, row);
    if (groupBy) {
      const key = groupKeyFor(row, groupBy);
      let group = groupMap.get(key);
      if (!group) {
        group = { key, ...emptyTotals() };
        groupMap.set(key, group);
      }
      addRow(group, row);
    }
  }

  const groups = [...groupMap.values()].sort(
    (a, b) => b.totalTokens - a.totalTokens,
  );

  return {
    from: query.from ?? null,
    to: query.to ?? null,
    groupBy: groupBy ?? null,
    totals,
    groups,
  };
}
