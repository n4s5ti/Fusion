import { beforeEach, describe, expect, it, vi } from "vitest";
import { Scheduler } from "../../scheduler.js";
import type { Task, TaskStore } from "@fusion/core";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-001",
    title: "task",
    description: "",
    column: "todo",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Task;
}

function createStore(tasks: Task[], scopes: Record<string, string[]>) {
  const updateTask = vi.fn(async (id: string, patch: Partial<Task>) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (task) Object.assign(task, patch);
    return task as Task;
  });
  const moveTask = vi.fn(async (id: string, column: Task["column"]) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (task) task.column = column;
    return task as Task;
  });
  const store = {
    listTasks: vi.fn(async () => tasks),
    getSettings: vi.fn(async () => ({ maxConcurrent: 10, maxWorktrees: 10, groupOverlappingFiles: true })),
    parseFileScopeFromPrompt: vi.fn(async (id: string) => scopes[id] ?? []),
    updateTask,
    moveTask,
    getTask: vi.fn(async (id: string) => tasks.find((task) => task.id === id) ?? null),
    logEntry: vi.fn(async () => undefined),
    getRootDir: vi.fn(() => "/tmp/project"),
    getTasksDir: vi.fn(() => "/tmp/project/.fusion/tasks"),
    on: vi.fn(),
    off: vi.fn(),
    recordRunAuditEvent: vi.fn(async () => undefined),
  } as unknown as TaskStore;
  return { store, updateTask, moveTask };
}

describe("reliability interactions: FN-5325 scheduler overlap priority inversion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Scheduler.prototype as any, "validateTaskFilesystem").mockResolvedValue({ valid: true });
  });

  it("defers lower-priority overlap while urgent queued task dispatches first", async () => {
    const tasks = [
      makeTask({ id: "FN-1", priority: "urgent", status: "queued", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeTask({ id: "FN-2", priority: "normal", createdAt: "2026-01-01T00:01:00.000Z" }),
    ];
    const { store, moveTask, updateTask } = createStore(tasks, { "FN-1": ["src/a.ts"], "FN-2": ["src/a.ts"] });

    const scheduler = new Scheduler(store);
    (scheduler as any).running = true;
    await scheduler.schedule();

    expect(moveTask).toHaveBeenCalledWith("FN-1", "in-progress", expect.anything());
    expect(updateTask).toHaveBeenCalledWith("FN-2", expect.objectContaining({ status: "queued", overlapBlockedBy: "FN-1" }));
  });

  it("uses createdAt tiebreaker for equal-priority overlap", async () => {
    const tasks = [
      makeTask({ id: "FN-1", priority: "normal", status: "queued", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeTask({ id: "FN-2", priority: "normal", createdAt: "2026-01-01T00:05:00.000Z" }),
    ];
    const { store } = createStore(tasks, { "FN-1": ["src/a.ts"], "FN-2": ["src/a.ts"] });

    const scheduler = new Scheduler(store);
    (scheduler as any).running = true;
    await scheduler.schedule();

    expect(store.logEntry).toHaveBeenCalledWith("FN-2", "queued — blocked by active file-scope lease FN-1 (column=in-progress)");
  });

  it("preserves FN-4969 fanout ordering and only defers when overlap exists", async () => {
    const sharedStamp = "2026-01-01T00:00:00.000Z";
    const tasks = [
      makeTask({ id: "FN-10", priority: "normal", createdAt: sharedStamp }),
      makeTask({ id: "FN-11", priority: "normal", createdAt: sharedStamp }),
      makeTask({ id: "FN-21", dependencies: ["FN-10"] }),
      makeTask({ id: "FN-22", dependencies: ["FN-10"] }),
    ];
    const { store, moveTask, updateTask } = createStore(tasks, {
      "FN-10": ["src/a.ts"],
      "FN-11": ["src/b.ts"],
      "FN-21": ["src/c.ts"],
      "FN-22": ["src/d.ts"],
    });

    const scheduler = new Scheduler(store);
    (scheduler as any).running = true;
    await scheduler.schedule();

    expect(moveTask.mock.calls[0][0]).toBe("FN-10");
    expect(moveTask).toHaveBeenCalledWith("FN-11", "in-progress", expect.anything());
    expect(updateTask).not.toHaveBeenCalledWith("FN-11", expect.objectContaining({ overlapBlockedBy: expect.any(String) }));

    tasks.find((task) => task.id === "FN-11")!.column = "todo";
    tasks.find((task) => task.id === "FN-10")!.column = "in-progress";
    (store.parseFileScopeFromPrompt as any).mockImplementation(async (id: string) => ({ "FN-10": ["src/a.ts"], "FN-11": ["src/a.ts"] }[id] ?? ["src/x.ts"]));
    await scheduler.schedule();

    expect(updateTask).toHaveBeenCalledWith("FN-11", expect.objectContaining({ status: "queued", overlapBlockedBy: "FN-10" }));
  });

  it("emits one inversion audit event per pass for running lower-priority blocker", async () => {
    const tasks = [
      makeTask({ id: "FN-1", column: "in-progress", priority: "normal", createdAt: "2026-01-01T00:01:00.000Z" }),
      makeTask({ id: "FN-2", priority: "urgent", status: "queued", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const { store } = createStore(tasks, { "FN-1": ["src/a.ts"], "FN-2": ["src/a.ts"] });

    const scheduler = new Scheduler(store);
    (scheduler as any).running = true;
    await scheduler.schedule();

    const calls = (store.recordRunAuditEvent as any).mock.calls.filter(
      (call: any[]) => call[0]?.mutationType === "scheduler:overlap-priority-inversion",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatchObject({
      target: "FN-2",
      metadata: expect.objectContaining({
        candidateId: "FN-2",
        blockerId: "FN-1",
        candidatePriority: "urgent",
        blockerPriority: "normal",
        blockerColumn: "in-progress",
      }),
    });
  });
});
