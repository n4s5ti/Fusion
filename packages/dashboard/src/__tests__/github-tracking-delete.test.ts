import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "@fusion/core";
import { GitHubTrackingStateService } from "../github-tracking-state.js";

const { mockSetIssueState, mockGetIssue, mockResolveGithubTrackingAuth } = vi.hoisted(() => ({
  mockSetIssueState: vi.fn(),
  mockGetIssue: vi.fn(),
  mockResolveGithubTrackingAuth: vi.fn(),
}));

vi.mock("../github.js", () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    setIssueState: (...args: unknown[]) => mockSetIssueState(...args),
    getIssue: (...args: unknown[]) => mockGetIssue(...args),
  })),
}));

vi.mock("../github-auth.js", () => ({
  resolveGithubTrackingAuth: (...args: unknown[]) => mockResolveGithubTrackingAuth(...args),
}));

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "kb-dashboard-github-tracking-delete-test-"));
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("github tracking delete flow", () => {
  let rootDir: string;
  let globalDir: string;
  let store: TaskStore;
  let stateService: GitHubTrackingStateService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResolveGithubTrackingAuth.mockReturnValue({ ok: true, auth: { mode: "token", token: "token" } });
    mockGetIssue.mockResolvedValue({ state: "open" });
    rootDir = makeTmpDir();
    globalDir = makeTmpDir();
    store = new TaskStore(rootDir, globalDir, { inMemoryDb: true });
    await store.init();
    stateService = new GitHubTrackingStateService(store);
    stateService.start();
  });

  afterEach(async () => {
    stateService.stop();
    await flushAsync();
    store.close();
    await rm(rootDir, { recursive: true, force: true });
    await rm(globalDir, { recursive: true, force: true });
  });

  it("closes the linked issue as not_planned when a tracked task is deleted", async () => {
    const task = await store.createTask({
      description: "delete tracked task",
      githubTracking: { enabled: true },
    });

    await store.linkGithubIssue(task.id, {
      owner: "octocat",
      repo: "hello-world",
      number: 7,
      url: "https://github.com/octocat/hello-world/issues/7",
      createdAt: new Date().toISOString(),
    });

    await store.deleteTask(task.id);
    await flushAsync();

    expect(mockSetIssueState).toHaveBeenCalledTimes(1);
    expect(mockSetIssueState).toHaveBeenCalledWith("octocat", "hello-world", 7, "closed", "not_planned");
  });

  it("does not call GitHub when deleting a task with tracking disabled", async () => {
    const task = await store.createTask({
      description: "delete untracked task",
      githubTracking: { enabled: false },
    });

    await store.deleteTask(task.id);
    await flushAsync();

    expect(mockSetIssueState).not.toHaveBeenCalled();
  });

  it("does not call GitHub when deleting a tracked task without a linked issue", async () => {
    const task = await store.createTask({
      description: "delete tracked task without issue",
      githubTracking: { enabled: true },
    });

    await store.deleteTask(task.id);
    await flushAsync();

    expect(mockSetIssueState).not.toHaveBeenCalled();
  });

  it("does not trigger an unhandled rejection when closing linked issue fails on delete", async () => {
    const task = await store.createTask({
      description: "delete tracked task with close failure",
      githubTracking: { enabled: true },
    });

    await store.linkGithubIssue(task.id, {
      owner: "octocat",
      repo: "hello-world",
      number: 8,
      url: "https://github.com/octocat/hello-world/issues/8",
      createdAt: new Date().toISOString(),
    });

    mockSetIssueState.mockRejectedValueOnce(new Error("close failed"));
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      await store.deleteTask(task.id);
      await flushAsync();
      expect(mockSetIssueState).toHaveBeenCalledWith("octocat", "hello-world", 8, "closed", "not_planned");
      expect(unhandledRejections).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("emits github issue action event on successful close-on-delete", async () => {
    const task = await store.createTask({
      description: "delete tracked task emits github issue close event",
      githubTracking: { enabled: true },
    });

    await store.linkGithubIssue(task.id, {
      owner: "octocat",
      repo: "hello-world",
      number: 9,
      url: "https://github.com/octocat/hello-world/issues/9",
      createdAt: new Date().toISOString(),
    });

    const events: Array<Record<string, unknown>> = [];
    (store as unknown as { on: (event: string, listener: (payload: Record<string, unknown>) => void) => void }).on(
      "github-issue:action",
      (payload) => {
        events.push(payload);
      },
    );

    await store.deleteTask(task.id);
    await flushAsync();

    expect(events).toContainEqual({
      taskId: task.id,
      action: "close",
      owner: "octocat",
      repo: "hello-world",
      number: 9,
      outcome: "success",
    });
  });
});
