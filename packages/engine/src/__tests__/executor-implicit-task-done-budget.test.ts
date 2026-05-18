import { beforeEach, describe, expect, it, vi } from "vitest";
import "./executor-test-helpers.js";
import { TaskExecutor } from "../executor.js";
import { executorLog } from "../logger.js";
import { createMockStore, resetExecutorMocks } from "./executor-test-helpers.js";

function refusal() {
  return {
    ok: false as const,
    refusalClass: "pending-code-review-revise" as const,
    reason: "Step 1 has pending REVISE",
    message: "fn_task_done refused (pending-code-review-revise): Step 1 has pending REVISE",
  };
}

function task(retryCount: number) {
  return {
    id: "FN-4946-B",
    title: "Budget",
    description: "",
    column: "in-progress",
    worktree: "/repo/.worktrees/swift-falcon",
    branch: "fusion/fn-4946-b",
    baseCommitSha: "abc123",
    taskDoneRetryCount: retryCount,
    dependencies: [],
    steps: [{ name: "Step 1", status: "in-progress" as const }],
    currentStep: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
}

describe("FN-4946 implicit refusal budget handling", () => {
  beforeEach(() => {
    resetExecutorMocks();
  });

  it("requeues to todo under budget", async () => {
    const store = createMockStore();
    const executor = new TaskExecutor(store as any, "/repo");

    await (executor as any).handleImplicitTaskDoneRefusal(task(2), "/repo/.worktrees/swift-falcon", refusal());

    expect(store.updateTask).toHaveBeenCalledWith("FN-4946-B", expect.objectContaining({ taskDoneRetryCount: 3, status: "failed" }));
    expect(store.moveTask).toHaveBeenCalledWith("FN-4946-B", "todo", { preserveProgress: true });
    expect(executorLog.error).toHaveBeenCalledWith(expect.stringContaining("(implicit completion)"));
  });

  it("escalates to in-review at budget limit", async () => {
    const store = createMockStore();
    const executor = new TaskExecutor(store as any, "/repo");
    const persistSpy = vi.spyOn(executor as any, "persistTokenUsage").mockResolvedValue(undefined);

    await (executor as any).handleImplicitTaskDoneRefusal(task(3), "/repo/.worktrees/swift-falcon", refusal());

    expect(store.updateTask).toHaveBeenCalledWith("FN-4946-B", expect.objectContaining({ status: "failed" }));
    expect(store.moveTask).toHaveBeenCalledWith("FN-4946-B", "in-review");
    expect(persistSpy).toHaveBeenCalledWith("FN-4946-B");
  });
});
