import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentStore, ChatStore, TaskStore } from "@fusion/core";
import { HeartbeatMonitor } from "../agent-heartbeat.js";

const sessionCapture = vi.hoisted(() => ({
  prompt: "",
  customTools: [] as Array<{ name: string; execute: (...args: any[]) => Promise<any> }>,
}));

vi.mock("../logger.js", async () => {
  const { createMockLogger, formatMockError } = await import("./heartbeat-test-helpers.js");
  return {
    createLogger: vi.fn(() => createMockLogger()),
    heartbeatLog: createMockLogger(),
    formatError: formatMockError,
    runtimeLog: createMockLogger(),
  };
});

vi.mock("../pi.js", () => ({
  promptWithFallback: vi.fn(async (session: any, prompt: string) => {
    await session.prompt(prompt);
  }),
}));

vi.mock("../agent-session-helpers.js", async () => {
  const actual = await vi.importActual<typeof import("../agent-session-helpers.js")>("../agent-session-helpers.js");
  return {
    ...actual,
    createResolvedAgentSession: vi.fn(async (options: any) => {
      sessionCapture.customTools = options.customTools ?? [];
      return {
        session: {
          prompt: async (prompt: string) => {
            sessionCapture.prompt = prompt;
          },
          dispose: vi.fn(),
          getSessionStats: () => ({ tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }),
        },
      };
    }),
  };
});

type Harness = {
  rootDir: string;
  globalDir: string;
  taskStore: TaskStore;
  agentStore: AgentStore;
  chatStore: ChatStore;
  agentId: string;
};

async function createHarness(): Promise<Harness> {
  const rootDir = mkdtempSync(join(tmpdir(), "hb-room-root-"));
  const globalDir = mkdtempSync(join(tmpdir(), "hb-room-global-"));
  const taskStore = new TaskStore(rootDir, globalDir, { inMemoryDb: true });
  await taskStore.init();
  const agentStore = new AgentStore({ rootDir: taskStore.getFusionDir(), taskStore, inMemoryDb: true });
  const chatStore = new ChatStore(taskStore.getFusionDir(), taskStore.getDatabase());
  const agent = await agentStore.createAgent({
    name: "Room Heartbeat Agent",
    role: "engineer",
    soul: "Surfaces relevant room updates.",
    runtimeConfig: { enabled: true },
  });
  return { rootDir, globalDir, taskStore, agentStore, chatStore, agentId: agent.id };
}

describe("heartbeat room messages", () => {
  let harness: Harness | null = null;

  beforeEach(() => {
    sessionCapture.prompt = "";
    sessionCapture.customTools = [];
  });

  afterEach(() => {
    if (harness) {
      rmSync(harness.rootDir, { recursive: true, force: true });
      rmSync(harness.globalDir, { recursive: true, force: true });
      harness = null;
    }
  });

  it("omits room section and tool when no chatStore is configured", async () => {
    harness = await createHarness();
    const monitor = new HeartbeatMonitor({
      store: harness.agentStore,
      taskStore: harness.taskStore,
      rootDir: harness.rootDir,
    });

    await monitor.executeHeartbeat({ agentId: harness.agentId, source: "timer" as any });

    expect(sessionCapture.prompt).not.toContain("Pending Room Messages:");
    expect(sessionCapture.customTools.map((tool) => tool.name)).not.toContain("fn_post_room_message");
  });

  it("shows only rooms with new messages", async () => {
    harness = await createHarness();
    const staleRoom = harness.chatStore.createRoom({ name: "stale-room", memberAgentIds: [harness.agentId] });
    const freshRoom = harness.chatStore.createRoom({ name: "fresh-room", memberAgentIds: [harness.agentId] });

    harness.chatStore.addRoomMessage(staleRoom.id, { role: "user", content: "too old" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const sinceIso = new Date().toISOString();
    await harness.agentStore.saveRun({
      id: "run-prev-fresh",
      agentId: harness.agentId,
      startedAt: new Date(Date.now() - 1_000).toISOString(),
      endedAt: sinceIso,
      status: "completed",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const freshMessage = harness.chatStore.addRoomMessage(freshRoom.id, { role: "user", content: "needs review" });

    const monitor = new HeartbeatMonitor({
      store: harness.agentStore,
      taskStore: harness.taskStore,
      rootDir: harness.rootDir,
      chatStore: harness.chatStore,
    });

    await monitor.executeHeartbeat({ agentId: harness.agentId, source: "timer" as any });

    expect(sessionCapture.prompt).toContain("Pending Room Messages:");
    expect(sessionCapture.prompt).toContain(`fresh-room (${freshRoom.id})`);
    expect(sessionCapture.prompt).toContain(freshMessage.id);
    expect(sessionCapture.prompt).not.toContain(`stale-room (${staleRoom.id})`);
  });

  it("excludes messages older than the lookback cutoff", async () => {
    harness = await createHarness();
    const room = harness.chatStore.createRoom({ name: "lookback", memberAgentIds: [harness.agentId] });

    harness.chatStore.addRoomMessage(room.id, { role: "user", content: "old room note" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const cutoff = new Date().toISOString();
    await harness.agentStore.saveRun({
      id: "run-prev-lookback",
      agentId: harness.agentId,
      startedAt: new Date(Date.now() - 1_000).toISOString(),
      endedAt: cutoff,
      status: "completed",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    harness.chatStore.addRoomMessage(room.id, { role: "user", content: "fresh room note" });

    const monitor = new HeartbeatMonitor({
      store: harness.agentStore,
      taskStore: harness.taskStore,
      rootDir: harness.rootDir,
      chatStore: harness.chatStore,
    });

    await monitor.executeHeartbeat({ agentId: harness.agentId, source: "timer" as any });

    expect(sessionCapture.prompt).toContain("fresh room note");
    expect(sessionCapture.prompt).not.toContain("old room note");
  });

  it("shows a truncated marker when total surfaced room messages overflow the cap", async () => {
    harness = await createHarness();
    for (let roomIndex = 0; roomIndex < 4; roomIndex += 1) {
      const room = harness.chatStore.createRoom({ name: `overflow-${roomIndex}`, memberAgentIds: [harness.agentId] });
      for (let messageIndex = 0; messageIndex < 10; messageIndex += 1) {
        harness.chatStore.addRoomMessage(room.id, {
          role: "user",
          content: `message ${roomIndex}-${messageIndex}`,
        });
      }
    }

    const monitor = new HeartbeatMonitor({
      store: harness.agentStore,
      taskStore: harness.taskStore,
      rootDir: harness.rootDir,
      chatStore: harness.chatStore,
    });

    await monitor.executeHeartbeat({ agentId: harness.agentId, source: "timer" as any });

    expect(sessionCapture.prompt).toContain("(10 more truncated)");
  });

  it("registers fn_post_room_message and posts through the real ChatStore", async () => {
    harness = await createHarness();
    const room = harness.chatStore.createRoom({ name: "reply-room", memberAgentIds: [harness.agentId] });
    harness.chatStore.addRoomMessage(room.id, { role: "user", content: "can you confirm?" });

    const monitor = new HeartbeatMonitor({
      store: harness.agentStore,
      taskStore: harness.taskStore,
      rootDir: harness.rootDir,
      chatStore: harness.chatStore,
    });

    await monitor.executeHeartbeat({ agentId: harness.agentId, source: "timer" as any });

    const postTool = sessionCapture.customTools.find((tool) => tool.name === "fn_post_room_message");
    expect(postTool).toBeDefined();

    const result = await postTool!.execute("call-1", {
      roomId: room.id,
      content: "Confirmed.",
      replyToMessageId: "rmsg-parent",
    });

    const posted = harness.chatStore.getRoomMessages(room.id).find((message) => message.id === result.details.messageId);
    expect(posted).toMatchObject({
      senderAgentId: harness.agentId,
      content: "Confirmed.",
      metadata: { replyToMessageId: "rmsg-parent" },
    });
  });
});
