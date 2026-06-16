import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Database } from "../db.js";
import { emitUsageEvent } from "../usage-events.js";
import { aggregateActivityAnalytics } from "../activity-analytics.js";

function insertCliSession(db: Database, id: string, createdAt: string): void {
  db.prepare(
    `INSERT INTO cli_sessions
       (id, purpose, projectId, adapterId, agentState, createdAt, updatedAt)
     VALUES (?, 'task', 'proj-1', 'claude-local', 'running', ?, ?)`,
  ).run(id, createdAt, createdAt);
}

describe("activity-analytics", () => {
  let tmpDir: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "kb-activity-analytics-"));
    db = new Database(join(tmpDir, ".fusion"));
    db.init();
  });

  afterEach(async () => {
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("counts sessions, messages, and distinct active nodes/agents over a range", () => {
    insertCliSession(db, "s1", "2026-03-01T00:00:00.000Z");
    insertCliSession(db, "s2", "2026-03-02T00:00:00.000Z");
    // session outside range
    insertCliSession(db, "s-old", "2025-01-01T00:00:00.000Z");

    emitUsageEvent(db, { kind: "user_message", agentId: "agent-1", nodeId: "node-1", ts: "2026-03-01T00:00:00.000Z" });
    emitUsageEvent(db, { kind: "user_message", agentId: "agent-2", nodeId: "node-1", ts: "2026-03-01T01:00:00.000Z" });
    emitUsageEvent(db, { kind: "tool_call", agentId: "agent-2", nodeId: "node-2", ts: "2026-03-02T00:00:00.000Z" });

    const result = aggregateActivityAnalytics(db, { from: "2026-03-01T00:00:00.000Z", to: "2026-03-31T00:00:00.000Z" });
    expect(result.sessions).toBe(2);
    expect(result.messages).toBe(2);
    expect(result.activeNodes).toBe(2); // node-1, node-2
    expect(result.activeAgents).toBe(2); // agent-1, agent-2
  });

  it("produces a per-day breakdown ascending by day", () => {
    emitUsageEvent(db, { kind: "user_message", agentId: "agent-1", nodeId: "node-1", ts: "2026-03-01T08:00:00.000Z" });
    emitUsageEvent(db, { kind: "tool_call", agentId: "agent-1", nodeId: "node-1", ts: "2026-03-01T09:00:00.000Z" });
    emitUsageEvent(db, { kind: "user_message", agentId: "agent-2", nodeId: "node-2", ts: "2026-03-02T08:00:00.000Z" });

    const result = aggregateActivityAnalytics(db, { from: "2026-03-01T00:00:00.000Z", to: "2026-03-31T00:00:00.000Z" });
    expect(result.daily.map((d) => d.day)).toEqual(["2026-03-01", "2026-03-02"]);
    expect(result.daily[0]).toMatchObject({ day: "2026-03-01", activeNodes: 1, activeAgents: 1, messages: 1 });
    expect(result.daily[1]).toMatchObject({ day: "2026-03-02", activeNodes: 1, activeAgents: 1, messages: 1 });
  });

  it("computes stickiness = DAU/MAU", () => {
    // Day 1: agents a,b active. Day 2: agent a active. MAU = {a,b} = 2.
    // DAU = mean(2, 1) = 1.5. stickiness = 1.5 / 2 = 0.75.
    emitUsageEvent(db, { kind: "tool_call", agentId: "a", nodeId: "n1", ts: "2026-03-01T00:00:00.000Z" });
    emitUsageEvent(db, { kind: "tool_call", agentId: "b", nodeId: "n1", ts: "2026-03-01T01:00:00.000Z" });
    emitUsageEvent(db, { kind: "tool_call", agentId: "a", nodeId: "n1", ts: "2026-03-02T00:00:00.000Z" });

    const result = aggregateActivityAnalytics(db, { from: "2026-03-01T00:00:00.000Z", to: "2026-03-31T00:00:00.000Z" });
    expect(result.activeAgents).toBe(2);
    expect(result.stickiness).toBeCloseTo(0.75, 5);
  });

  it("empty range returns zeroed structures, not nulls", () => {
    insertCliSession(db, "s1", "2026-03-01T00:00:00.000Z");
    emitUsageEvent(db, { kind: "user_message", agentId: "a", nodeId: "n1", ts: "2026-03-01T00:00:00.000Z" });

    const result = aggregateActivityAnalytics(db, { from: "2027-01-01T00:00:00.000Z", to: "2027-12-31T00:00:00.000Z" });
    expect(result.sessions).toBe(0);
    expect(result.messages).toBe(0);
    expect(result.activeNodes).toBe(0);
    expect(result.activeAgents).toBe(0);
    expect(result.daily).toEqual([]);
    expect(result.stickiness).toBe(0);
  });

  it("leaves a clean MTTR seam for U13 (unavailable, not 0)", () => {
    const result = aggregateActivityAnalytics(db, {});
    expect(result.mttr).toEqual({ value: null, unavailable: true });
  });
});
