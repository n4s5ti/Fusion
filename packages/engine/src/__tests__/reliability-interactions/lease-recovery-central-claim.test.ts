import { describe, expect, it, vi } from "vitest";
import type { CentralClaimStore, Task, TaskStore } from "@fusion/core";
import { Scheduler } from "../../scheduler.js";
import { SelfHealingManager } from "../../self-healing.js";
import { MeshLeaseManager } from "../../mesh-lease-manager.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-X",
    description: "x",
    column: "todo",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    checkedOutBy: "agent-1",
    checkedOutAt: "2026-05-01T00:00:00.000Z",
    checkoutLeaseRenewedAt: "2026-05-01T00:00:00.000Z",
    checkoutLeaseEpoch: 1,
    checkoutNodeId: "node-a",
    ...overrides,
  };
}

describe("reliability interactions: lease recovery central claim", () => {
  it("scheduler invokes reconcile once when lease recovery returns false", async () => {
    const task = makeTask();
    const store = {
      listTasks: vi.fn().mockResolvedValue([task]),
      getTask: vi.fn().mockResolvedValue(task),
      updateTask: vi.fn().mockResolvedValue(task),
      updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      logEntry: vi.fn().mockResolvedValue(undefined),
      moveTask: vi.fn().mockResolvedValue(task),
      getSettings: vi.fn().mockResolvedValue({ maxConcurrent: 1, maxWorktrees: 1 }),
      parseFileScopeFromPrompt: vi.fn().mockResolvedValue([]),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as TaskStore;

    const reconcileLeaseRow = vi.fn().mockResolvedValue(true);
    const scheduler = new Scheduler(store, {
      leaseManager: {
        recoverAbandonedLease: vi.fn().mockResolvedValue(false),
        reconcileLeaseRow,
      } as any,
    });
    (scheduler as any).running = true;

    await scheduler.schedule();

    expect(reconcileLeaseRow).toHaveBeenCalledTimes(1);
    expect(reconcileLeaseRow).toHaveBeenCalledWith("FN-X");
  });

  it("self-healing orphan recovery invokes reconcile once when recovery returns false", async () => {
    const task = makeTask({ column: "in-progress", worktree: undefined, updatedAt: "2026-01-01T00:00:00.000Z" });
    const store = {
      listTasks: vi.fn().mockResolvedValue([task]),
      updateTask: vi.fn().mockResolvedValue(task),
      logEntry: vi.fn().mockResolvedValue(undefined),
      moveTask: vi.fn().mockResolvedValue(task),
    } as unknown as TaskStore;

    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    const reconcileLeaseRow = vi.fn().mockResolvedValue(true);
    const manager = new SelfHealingManager(store, {
      rootDir: "/tmp/test-project",
      getExecutingTaskIds: () => new Set<string>(),
      leaseManager: {
        recoverAbandonedLease: vi.fn().mockResolvedValue(false),
        reconcileLeaseRow,
      } as any,
    });

    const recovered = await manager.recoverOrphanedExecutions();
    expect(recovered).toBe(1);
    expect(reconcileLeaseRow).toHaveBeenCalledWith("FN-X");
    manager.stop();
    vi.useRealTimers();
  });

  it("reconciles split-brain state after central release succeeds but local update initially fails", async () => {
    const current = makeTask({ column: "in-progress" });
    const updateTask = vi
      .fn()
      .mockRejectedValueOnce(new Error("write failed"))
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValue(current);
    const taskStore = {
      getTask: vi.fn().mockResolvedValue(current),
      updateTask,
      moveTask: vi.fn().mockResolvedValue(current),
      logEntry: vi.fn().mockResolvedValue(undefined),
      recordRunAuditEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as TaskStore;
    const centralClaimStore: CentralClaimStore = {
      tryClaimTask: vi.fn() as any,
      renewTaskClaim: vi.fn() as any,
      getTaskClaim: vi.fn().mockReturnValue(null),
      releaseTaskClaim: vi.fn().mockReturnValue({ ok: true }),
    };

    const manager = new MeshLeaseManager({ taskStore, centralClaimStore, projectId: "project-1" });

    const recovered = await manager.recoverAbandonedLease("FN-X", "stale-heartbeat");
    expect(recovered).toBe(false);

    updateTask.mockResolvedValueOnce(current);
    const reconciled = await manager.reconcileLeaseRow("FN-X");
    expect(reconciled).toBe(true);
    expect(updateTask).toHaveBeenCalled();
  });
});
