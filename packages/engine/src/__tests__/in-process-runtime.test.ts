import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { InProcessRuntime } from "../runtimes/in-process-runtime.js";

describe("InProcessRuntime onStart duplicate guard", () => {
  it("contains a taskAgentMap guard before creating task-worker agents", () => {
    const source = readFileSync(join(process.cwd(), "src/runtimes/in-process-runtime.ts"), "utf-8");
    expect(source).toContain("if (this.taskAgentMap.has(task.id))");
    expect(source).toContain("Skipping task-worker creation for");
  });

  it("exposes getChatStore and wires HeartbeatMonitor to the runtime chatStore instance", () => {
    const source = readFileSync(join(process.cwd(), "src/runtimes/in-process-runtime.ts"), "utf-8");
    expect(source).toContain("this.chatStore ??= new ChatStore(this.taskStore.getFusionDir(), this.taskStore.getDatabase());");
    expect(source).toContain("chatStore: this.chatStore,");
    expect(source).toContain("getChatStore(): import(\"@fusion/core\").ChatStore | undefined {");
    expect(source).toContain("return this.chatStore;");
  });

  it("rehydrates autopilot mission watches during startup recovery", () => {
    const source = readFileSync(join(process.cwd(), "src/runtimes/in-process-runtime.ts"), "utf-8");
    expect(source).toContain("activeMissionAutopilot.recoverMissions(activeMissionStore)");
  });

  it("forwards task:deleted events with and without githubIssueAction metadata", () => {
    const runtime = new InProcessRuntime(
      {
        projectId: "proj-test",
        workingDirectory: process.cwd(),
        isolationMode: "in-process",
        maxConcurrent: 1,
        maxWorktrees: 1,
      },
      {
        getGlobalConcurrencyState: vi.fn(),
        recordTaskCompletion: vi.fn(),
      } as any,
    );

    const taskStore = new EventEmitter();
    const emitSpy = vi.spyOn(runtime, "emit");
    (runtime as any).taskStore = taskStore;
    (runtime as any).setupEventForwarding();

    const task = { id: "FN-1", title: "task" };
    const meta = { githubIssueAction: "auto" };

    taskStore.emit("task:deleted", task, meta);
    taskStore.emit("task:deleted", task);

    expect(emitSpy).toHaveBeenCalledWith("task:deleted", task, meta);
    expect(emitSpy).toHaveBeenCalledWith("task:deleted", task, undefined);
  });
});
