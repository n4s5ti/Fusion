import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(actual.existsSync) };
});

const { logger } = vi.hoisted(() => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../logger.js", () => ({
  createLogger: vi.fn(() => logger),
  schedulerLog: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../worktree-pool.js", () => ({
  WorktreePool: vi.fn(),
  RemovalReason: {},
  scanIdleWorktrees: vi.fn().mockResolvedValue([]),
  cleanupOrphanedWorktrees: vi.fn().mockResolvedValue(0),
  isUsableTaskWorktree: vi.fn().mockResolvedValue(true),
  removeWorktree: vi.fn().mockResolvedValue(undefined),
  resolveWorktreeBackend: vi.fn(),
}));

vi.mock("../merger.js", () => ({ classifyOwnedLandedEvidence: vi.fn() }));

import { SelfHealingManager } from "../self-healing.js";
import type { Settings, Task, TaskStore } from "@fusion/core";

const PARK_ERROR =
  "Workflow graph failure surfaced after paused engine abort during pause/resume in 'todo' at node 'execute' — operator action required; retry or explicitly unpause/resume after inspecting the task";

function createMockStore(tasks: Task[]): TaskStore & EventEmitter {
  const emitter = new EventEmitter();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return Object.assign(emitter, {
    getSettings: vi.fn().mockResolvedValue({
      autoMerge: true,
      globalPause: false,
      enginePaused: false,
      maintenanceIntervalMs: 0,
    } as unknown as Settings),
    listTasks: vi.fn().mockResolvedValue(tasks),
    getTask: vi.fn(async (id: string) => byId.get(id) ?? null),
    updateTask: vi.fn().mockResolvedValue({} as Task),
    logEntry: vi.fn().mockResolvedValue(undefined),
    moveTask: vi.fn().mockResolvedValue(undefined),
    recordRunAuditEvent: vi.fn().mockResolvedValue(undefined),
    getRootDir: vi.fn().mockReturnValue("/tmp/test-project"),
  }) as unknown as TaskStore & EventEmitter;
}

function parkTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-7000",
    column: "todo",
    paused: false,
    userPaused: false,
    status: "failed",
    error: PARK_ERROR,
    steps: [{ status: "pending" }],
    title: "parked task",
    ...overrides,
  } as unknown as Task;
}

describe("recoverPausedAbortFailures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T02:30:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("clears a todo-column pause-abort park to schedulable (status:null) without moving it", async () => {
    const store = createMockStore([parkTask({ id: "FN-7000", column: "todo" })]);
    const clearBinding = vi.fn().mockReturnValue(true);
    const manager = new SelfHealingManager(store, {
      rootDir: "/tmp/test-project",
      getExecutingTaskIds: () => new Set<string>(),
      clearPhantomExecutorBinding: clearBinding as (taskId: string) => boolean | void,
    });

    const recovered = await manager.recoverPausedAbortFailures();

    expect(recovered).toBe(1);
    expect(store.updateTask).toHaveBeenCalledWith("FN-7000", { status: null, error: null });
    // Already in todo — must NOT be moved.
    expect(store.moveTask).not.toHaveBeenCalled();
    // FNXC:WorkflowLifecycle A1 releases via the wired clearPhantomExecutorBinding,
    // not the dead releaseExecutorWorktreeOwnership option (PR #1687 review).
    expect(clearBinding).toHaveBeenCalledWith("FN-7000");
    expect(store.recordRunAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ mutationType: "task:auto-recover-paused-abort-park", target: "FN-7000" }),
    );
  });

  it("rehomes an in-progress pause-abort park back to todo", async () => {
    const store = createMockStore([parkTask({ id: "FN-7001", column: "in-progress" })]);
    const manager = new SelfHealingManager(store, {
      rootDir: "/tmp/test-project",
      getExecutingTaskIds: () => new Set<string>(),
    });

    const recovered = await manager.recoverPausedAbortFailures();

    expect(recovered).toBe(1);
    expect(store.moveTask).toHaveBeenCalledWith(
      "FN-7001",
      "todo",
      { preserveProgress: true, moveSource: "engine", recoveryRehome: true },
    );
  });

  it("skips paused, executing, in-review, and non-pause-abort failures", async () => {
    const store = createMockStore([
      parkTask({ id: "FN-A", paused: true }),
      parkTask({ id: "FN-B", column: "in-progress" }), // executing (below)
      parkTask({ id: "FN-C", column: "in-review" }), // in-review park left for operator
      parkTask({ id: "FN-D", error: "some other failure", status: "failed" }),
    ]);
    const manager = new SelfHealingManager(store, {
      rootDir: "/tmp/test-project",
      getExecutingTaskIds: () => new Set<string>(["FN-B"]),
    });

    const recovered = await manager.recoverPausedAbortFailures();

    expect(recovered).toBe(0);
    expect(store.updateTask).not.toHaveBeenCalled();
  });

  // FNXC:WorkflowLifecycle greptile P1 (PR #1687): the method self-guards on
  // global/engine pause at its own entry, so calling it directly (test/API path)
  // while the operator has frozen the board must be a no-op.
  it("self-guards: does nothing while globalPause is set", async () => {
    const store = createMockStore([parkTask({ id: "FN-7000", column: "todo" })]);
    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      autoMerge: true,
      globalPause: true,
      enginePaused: false,
      maintenanceIntervalMs: 0,
    } as unknown as Settings);
    const manager = new SelfHealingManager(store, {
      rootDir: "/tmp/test-project",
      getExecutingTaskIds: () => new Set<string>(),
    });

    const recovered = await manager.recoverPausedAbortFailures();

    expect(recovered).toBe(0);
    expect(store.updateTask).not.toHaveBeenCalled();
    expect(store.moveTask).not.toHaveBeenCalled();
  });
});
