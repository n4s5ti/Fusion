import type { Database } from "./db.js";

/**
 * Activity analytics: distinct active nodes/agents per day, sessions, messages,
 * and stickiness (DAU/MAU) over an arbitrary date range.
 *
 * Sessions come from `cli_sessions` (by `createdAt`); messages and node/agent
 * activity come from `usage_events`. Inclusivity: `from`/`to` are inclusive,
 * matching `usage-events.ts`.
 *
 * **MTTR seam (U13).** Mean-time-to-resolve aggregation is deliberately NOT
 * implemented here yet — it depends on the deployments/incidents tables U13
 * introduces. {@link aggregateActivityAnalytics} returns an `mttr` field set to
 * the documented "unavailable" sentinel so the shape is stable now and U13 can
 * fill it in without changing callers. See {@link MttrSummary}.
 */

export interface ActivityAnalyticsQuery {
  /** ISO-8601 lower bound (inclusive). */
  from?: string;
  /** ISO-8601 upper bound (inclusive). */
  to?: string;
}

/** Distinct active nodes/agents and message count for a single UTC day. */
export interface DailyActivity {
  /** UTC date, `YYYY-MM-DD`. */
  day: string;
  activeNodes: number;
  activeAgents: number;
  messages: number;
}

/**
 * MTTR summary placeholder. U13 will populate `value` (mean minutes to resolve)
 * once deployments/incidents land; until then it is the documented unavailable
 * sentinel — `null` value with `unavailable: true`, never `0`.
 */
export interface MttrSummary {
  /** Mean minutes to resolve; null until U13 provides incident data. */
  value: number | null;
  /** True when MTTR cannot be computed (no incident data source yet). */
  unavailable: boolean;
}

export interface ActivityAnalytics {
  from: string | null;
  to: string | null;
  /** Total `session_start` events from `cli_sessions` in range. */
  sessions: number;
  /** Total `user_message` events in range. */
  messages: number;
  /** Distinct nodes with any usage_event in range. */
  activeNodes: number;
  /** Distinct agents with any usage_event in range. */
  activeAgents: number;
  /** Per-day breakdown, ascending by day. */
  daily: DailyActivity[];
  /**
   * Stickiness = DAU/MAU. DAU = mean distinct-active-agents-per-day over the
   * range; MAU = distinct active agents over the whole range. 0 when MAU is 0.
   */
  stickiness: number;
  /** MTTR placeholder (U13 seam). */
  mttr: MttrSummary;
}

interface CountRow {
  count: number;
}

interface DistinctRow {
  count: number;
}

interface DayAggRow {
  day: string;
  activeNodes: number;
  activeAgents: number;
  messages: number;
}

function rangeClauses(
  column: string,
  query: ActivityAnalyticsQuery,
): { where: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (query.from !== undefined) {
    clauses.push(`${column} >= ?`);
    params.push(query.from);
  }
  if (query.to !== undefined) {
    clauses.push(`${column} <= ?`);
    params.push(query.to);
  }
  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

/**
 * Aggregate activity (sessions, messages, active nodes/agents, daily breakdown,
 * stickiness) over a date range. Empty range yields zeroed structures and an
 * empty `daily` array — never nulls. `mttr` is the U13 unavailable seam.
 */
export function aggregateActivityAnalytics(
  db: Database,
  query: ActivityAnalyticsQuery = {},
): ActivityAnalytics {
  // Sessions from cli_sessions (by createdAt).
  const sessionRange = rangeClauses("createdAt", query);
  const sessions = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM cli_sessions ${sessionRange.where}`)
      .get(...sessionRange.params) as CountRow
  ).count;

  // Messages from usage_events (kind = user_message).
  const eventRange = rangeClauses("ts", query);
  const eventWhereWith = (extra: string): string =>
    eventRange.where
      ? `${eventRange.where} AND ${extra}`
      : `WHERE ${extra}`;

  const messages = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM usage_events ${eventWhereWith("kind = 'user_message'")}`,
      )
      .get(...eventRange.params) as CountRow
  ).count;

  // Distinct active nodes/agents over the whole range.
  const activeNodes = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT nodeId) AS count FROM usage_events ${eventWhereWith("nodeId IS NOT NULL")}`,
      )
      .get(...eventRange.params) as DistinctRow
  ).count;
  const activeAgents = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT agentId) AS count FROM usage_events ${eventWhereWith("agentId IS NOT NULL")}`,
      )
      .get(...eventRange.params) as DistinctRow
  ).count;

  // Per-day distinct nodes/agents + message count. substr(ts,1,10) is the UTC
  // day key (ISO-8601 timestamps).
  const dailyRows = db
    .prepare(
      `SELECT
         substr(ts, 1, 10) AS day,
         COUNT(DISTINCT nodeId) AS activeNodes,
         COUNT(DISTINCT agentId) AS activeAgents,
         SUM(CASE WHEN kind = 'user_message' THEN 1 ELSE 0 END) AS messages
       FROM usage_events ${eventRange.where}
       GROUP BY day
       ORDER BY day ASC`,
    )
    .all(...eventRange.params) as DayAggRow[];
  const daily: DailyActivity[] = dailyRows.map((r) => ({
    day: r.day,
    activeNodes: r.activeNodes,
    activeAgents: r.activeAgents,
    messages: r.messages ?? 0,
  }));

  // Stickiness = DAU/MAU. DAU = mean distinct-active-agents-per-day; MAU =
  // distinct active agents over the range.
  const dau =
    daily.length > 0
      ? daily.reduce((sum, d) => sum + d.activeAgents, 0) / daily.length
      : 0;
  const mau = activeAgents;
  const stickiness = mau > 0 ? dau / mau : 0;

  return {
    from: query.from ?? null,
    to: query.to ?? null,
    sessions,
    messages,
    activeNodes,
    activeAgents,
    daily,
    stickiness,
    // U13 seam: no incident data source yet — unavailable, not 0.
    mttr: { value: null, unavailable: true },
  };
}
