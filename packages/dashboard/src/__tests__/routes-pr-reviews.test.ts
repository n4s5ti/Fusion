// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskStore } from "@fusion/core";
import { createServer } from "../server.js";
import { get as performGet, request as performRequest } from "../test-request.js";
import { GitHubClient } from "../github.js";
import { githubRateLimiter } from "../github-poll.js";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-001",
    title: "Task",
    description: "desc",
    column: "in-review",
    status: "in-review",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    prInfo: {
      url: "https://github.com/owner/repo/pull/1",
      number: 1,
      status: "open",
      title: "PR",
      headBranch: "feature",
      baseBranch: "main",
      commentCount: 0,
    },
    comments: [],
    ...overrides,
  } as Task;
}

function createStore(task: Task): TaskStore {
  return {
    getTask: vi.fn().mockResolvedValue(task),
    updatePrInfo: vi.fn().mockResolvedValue(undefined),
    updatePrInfoByNumber: vi.fn().mockResolvedValue(undefined),
    addPrInfo: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue(task),
    moveTask: vi.fn().mockResolvedValue({ ...task, column: "todo" }),
    upsertTaskDocument: vi.fn().mockResolvedValue({ key: "review-feedback" }),
    getRootDir: vi.fn().mockReturnValue("/tmp/project"),
    listTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    mergeTask: vi.fn(),
    archiveTask: vi.fn(),
    unarchiveTask: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn(),
    logEntry: vi.fn(),
    getAgentLogs: vi.fn().mockResolvedValue([]),
    addSteeringComment: vi.fn(),
    updateIssueInfo: vi.fn(),
    getFusionDir: vi.fn().mockReturnValue("/tmp/project/.fusion"),
    getDatabase: vi.fn().mockReturnValue({
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        run: vi.fn().mockReturnValue({ changes: 0 }),
        get: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
    }),
    getMissionStore: vi.fn().mockReturnValue({ listMissions: vi.fn().mockReturnValue([]) }),
    on: vi.fn(),
    off: vi.fn(),
    recordRunAuditEvent: vi.fn(),
  } as unknown as TaskStore;
}

describe("PR reviews routes", () => {
  beforeEach(() => {
    vi.spyOn(githubRateLimiter, "canMakeRequest").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns review snapshot and fused comments", async () => {
    const task = createTask({
      comments: [{ id: "1", text: "review", author: "github:a", createdAt: new Date().toISOString(), source: "github-review", externalId: "x" }],
    });
    const store = createStore(task);
    vi.spyOn(GitHubClient.prototype, "getPrReviewSnapshot").mockResolvedValue({
      decision: "COMMENTED",
      checks: [],
      items: [],
      prInfo: task.prInfo!,
      commentCount: 0,
    } as never);

    const app = createServer(store);
    const response = await performGet(app, "/api/tasks/FN-001/pr/reviews");

    expect(response.status).toBe(200);
    expect(response.body.comments).toHaveLength(1);
  });

  it("moves in-review task to todo once on changes-requested refresh", async () => {
    const task = createTask();
    const store = createStore(task);
    vi.spyOn(GitHubClient.prototype, "getPrReviewSnapshot").mockResolvedValue({
      decision: "CHANGES_REQUESTED",
      checks: [],
      items: [{ id: "gh-review-1", body: "Please fix", author: { login: "alice" }, state: "CHANGES_REQUESTED", createdAt: new Date().toISOString() }],
      prInfo: task.prInfo!,
      commentCount: 0,
      summary: { reviewDecision: "CHANGES_REQUESTED", reviewers: [], blockingReasons: [], checks: [] },
    } as never);
    vi.spyOn(GitHubClient.prototype, "getPrMergeStatus").mockResolvedValue({
      prInfo: task.prInfo!, reviewDecision: "CHANGES_REQUESTED", checks: [], mergeReady: false, blockingReasons: ["changes requested"],
    });

    const app = createServer(store);
    const response = await performRequest(app, "POST", "/api/tasks/FN-001/pr/refresh", "{}", { "content-type": "application/json" });

    expect(response.status).toBe(200);
    expect(store.moveTask).toHaveBeenCalledTimes(1);
    expect(store.moveTask).toHaveBeenCalledWith("FN-001", "todo", expect.objectContaining({ preserveProgress: true, preserveWorktree: true }));
  });
});
