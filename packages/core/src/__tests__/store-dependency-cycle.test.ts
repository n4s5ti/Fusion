import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DependencyCycleError,
  detectDependencyCycle,
} from "../store.js";
import { createTaskStoreTestHarness } from "./store-test-helpers.js";

describe("detectDependencyCycle", () => {
  const lookup = (graph: Record<string, string[]>) => (taskId: string) => graph[taskId];

  it("detects direct self-edge", () => {
    expect(detectDependencyCycle("A", ["A"], lookup({}))).toEqual(["A", "A"]);
  });

  it("detects 2-node cycle", () => {
    expect(detectDependencyCycle("A", ["B"], lookup({ B: ["A"] }))).toEqual(["A", "B", "A"]);
  });

  it("detects 3-node cycle", () => {
    expect(detectDependencyCycle("FN-5240", ["FN-5241"], lookup({
      "FN-5241": ["FN-5242"],
      "FN-5242": ["FN-5240"],
    }))).toEqual(["FN-5240", "FN-5241", "FN-5242", "FN-5240"]);
  });

  it("returns null for diamond non-cycle", () => {
    expect(detectDependencyCycle("A", ["B", "C"], lookup({ B: ["D"], C: ["D"], D: [] }))).toBeNull();
  });

  it("ignores missing dependencies", () => {
    expect(detectDependencyCycle("A", ["MISSING"], lookup({}))).toBeNull();
  });

  it("supports candidate not yet persisted", () => {
    expect(detectDependencyCycle("A", ["B"], lookup({ B: ["C"], C: [] }))).toBeNull();
  });
});

describe("TaskStore dependency cycle guard", () => {
  const harness = createTaskStoreTestHarness();

  beforeEach(async () => {
    await harness.beforeEach();
  });

  afterEach(async () => {
    await harness.afterEach();
  });

  it("rejects cycle-forming update and preserves persisted dependencies", async () => {
    const store = harness.store();
    const a = await store.createTask({ title: "A", description: "A" });
    const b = await store.createTask({ title: "B", description: "B", dependencies: [a.id] });

    await expect(store.updateTask(a.id, { dependencies: [b.id] })).rejects.toBeInstanceOf(DependencyCycleError);

    const refreshedA = await store.getTask(a.id);
    expect(refreshedA.dependencies).toEqual([]);

    const rows = (store as any).db.prepare(`SELECT mutationType FROM runAuditEvents WHERE taskId = ? AND mutationType = ?`).all(a.id, "task:dependency-cycle-rejected");
    expect(rows).toHaveLength(1);
  });

  it("accepts umbrella parent depending on children with no back-edge", async () => {
    const store = harness.store();
    const childA = await store.createTask({ title: "child-a", description: "a" });
    const childB = await store.createTask({ title: "child-b", description: "b" });

    const parent = await store.createTask({
      title: "umbrella",
      description: "parent",
      dependencies: [childA.id, childB.id],
    });

    expect(parent.dependencies).toEqual([childA.id, childB.id]);
  });

  it("accepts non-cyclic updates", async () => {
    const store = harness.store();
    const a = await store.createTask({ title: "A", description: "A" });
    const b = await store.createTask({ title: "B", description: "B" });

    const updated = await store.updateTask(b.id, { dependencies: [a.id] });
    expect(updated.dependencies).toEqual([a.id]);
  });
});
