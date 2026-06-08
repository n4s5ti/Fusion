// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { WorkflowIr } from "../workflow-ir-types.js";
import { createTaskStoreTestHarness } from "./store-test-helpers.js";

function browserDemoLifecycleIr(): WorkflowIr {
  return {
    version: "v2",
    name: "browser-demo-lifecycle",
    columns: [
      { id: "todo", name: "Todo", traits: [{ trait: "intake" }] },
      { id: "in-progress", name: "In Progress", traits: [{ trait: "wip" }] },
      { id: "in-review", name: "In Review", traits: [{ trait: "merge-blocker" }] },
      { id: "qa", name: "QA", traits: [] },
      { id: "publish", name: "Publish", traits: [{ trait: "complete" }] },
    ],
    nodes: [
      { id: "start", kind: "start", column: "todo" },
      { id: "implement", kind: "prompt", column: "in-progress", config: { prompt: "Implement" } },
      { id: "review", kind: "prompt", column: "in-review", config: { prompt: "Review" } },
      { id: "qa-check", kind: "gate", column: "qa", config: { scriptName: "test", name: "QA" } },
      { id: "end", kind: "end", column: "publish" },
    ],
    edges: [
      { from: "start", to: "implement", condition: "success" },
      { from: "implement", to: "review", condition: "success" },
      { from: "review", to: "qa-check", condition: "success" },
      { from: "qa-check", to: "end", condition: "success" },
    ],
  };
}

describe("browser demo lifecycle workflow", () => {
  const harness = createTaskStoreTestHarness();
  let store: ReturnType<typeof harness.store>;

  beforeEach(async () => {
    await harness.beforeEach();
    store = harness.store();
    await store.updateGlobalSettings({ experimentalFeatures: { workflowColumns: true } });
  });

  afterEach(async () => {
    await harness.afterEach();
  });

  it("supports the Todo → In Progress → In Review → QA → Publish board walkthrough", async () => {
    const workflow = await store.createWorkflowDefinition({
      name: "Browser Demo Lifecycle",
      ir: browserDemoLifecycleIr(),
    });
    const task = await store.createTask({ description: "Browser walkthrough task", title: "Demo lifecycle" });

    const selection = await store.selectTaskWorkflowAndReconcile(task.id, workflow.id);
    expect(selection.reconciliation).toEqual({ preserved: false, fromColumn: "triage", toColumn: "todo" });
    expect((await store.getTask(task.id)).column).toBe("todo");

    await store.moveTask(task.id, "in-progress", { moveSource: "user" });
    await store.moveTask(task.id, "in-review", { moveSource: "user", allowDirectInReviewMove: true });
    await store.moveTask(task.id, "qa", { moveSource: "user" });
    await store.moveTask(task.id, "publish", { moveSource: "user" });

    const detail = await store.getTask(task.id);
    expect(detail.column).toBe("publish");

    const listed = await store.listTasks({ column: "publish" });
    expect(listed.map((item) => item.id)).toContain(task.id);
  });
});
