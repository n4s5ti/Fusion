import { describe, expect, it } from "vitest";
import {
  compareTaskPriority,
  compareTasksByPriorityThenAgeAndId,
  getTaskPriorityRank,
  isTaskPriority,
  normalizeTaskPriority,
  sortTasksByPriorityThenAgeAndId,
} from "../task-priority.js";
import {
  DEFAULT_TASK_PRIORITY,
  TASK_PRIORITIES,
  type TaskPriority,
} from "../types.js";
import * as core from "../index.js";

describe("task-priority", () => {
  it("defines the bounded priority contract in order", () => {
    expect(TASK_PRIORITIES).toEqual(["low", "normal", "high", "urgent"]);
    expect(DEFAULT_TASK_PRIORITY).toBe("normal");
  });

  it("normalizes missing or invalid values to default", () => {
    expect(normalizeTaskPriority(undefined)).toBe("normal");
    expect(normalizeTaskPriority(null)).toBe("normal");
    expect(normalizeTaskPriority("")).toBe("normal");
  });

  it("identifies valid task priorities", () => {
    for (const value of TASK_PRIORITIES) {
      expect(isTaskPriority(value)).toBe(true);
    }
    expect(isTaskPriority("in_progress")).toBe(false);
  });

  it("provides deterministic ranks and priority comparator", () => {
    const orderedByRank: TaskPriority[] = ["low", "normal", "high", "urgent"];
    expect(orderedByRank.map((priority) => getTaskPriorityRank(priority))).toEqual([0, 1, 2, 3]);
    expect(compareTaskPriority("urgent", "low")).toBeLessThan(0);
    expect(compareTaskPriority(undefined, "normal")).toBe(0);
  });

  it("sorts tasks by priority desc then createdAt asc then id asc", () => {
    const tasks = [
      { id: "FN-002", createdAt: "2026-01-01T00:00:00.000Z", priority: "high" as TaskPriority },
      { id: "FN-001", createdAt: "2026-01-01T00:00:00.000Z", priority: "high" as TaskPriority },
      { id: "FN-009", createdAt: "2026-01-02T00:00:00.000Z", priority: "urgent" as TaskPriority },
      { id: "FN-003", createdAt: "2026-01-01T00:00:00.000Z", priority: undefined },
    ];

    const sorted = sortTasksByPriorityThenAgeAndId(tasks);
    expect(sorted.map((task) => task.id)).toEqual(["FN-009", "FN-001", "FN-002", "FN-003"]);

    // comparator function should match sorted behavior
    expect(compareTasksByPriorityThenAgeAndId(tasks[0], tasks[1])).toBeGreaterThan(0);
  });

  it("re-exports priority helpers from the core index", () => {
    expect(core.TASK_PRIORITIES).toEqual(TASK_PRIORITIES);
    expect(core.DEFAULT_TASK_PRIORITY).toBe("normal");
    expect(core.normalizeTaskPriority("bogus")).toBe(DEFAULT_TASK_PRIORITY);
  });
});
