import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  logEntry: vi.fn(),
  listTasks: vi.fn(),
  getSettings: vi.fn(),
  getGlobalSettings: vi.fn(),
}));

vi.mock("@fusion/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fusion/core")>();
  return {
    ...actual,
    TaskStore: vi.fn(function TaskStore() {
      return {
        init: vi.fn(),
        getSettings: mocks.getSettings,
        getGlobalSettingsStore: () => ({ getSettings: mocks.getGlobalSettings }),
        listTasks: mocks.listTasks,
        createTask: mocks.createTask,
        logEntry: mocks.logEntry,
      };
    }),
  };
});

vi.mock("@fusion/dashboard", () => {
  class GitLabClient {
    auth: any;
    constructor(auth: any) { this.auth = auth; }
    async listProjectIssues(project: string, options: any = {}) {
      const response = await fetch(`https://gitlab.example.com/api/v4/projects/${encodeURIComponent(project)}/issues?per_page=${options.limit ?? 30}&page=1&state=opened`);
      return response.json();
    }
    async listGroupIssues(group: string, options: any = {}) {
      const response = await fetch(`https://gitlab.example.com/api/v4/groups/${encodeURIComponent(group)}/issues?per_page=${options.limit ?? 30}&page=1&state=opened`);
      return response.json();
    }
    async listMergeRequests(project: string, options: any = {}) {
      const response = await fetch(`https://gitlab.example.com/api/v4/projects/${encodeURIComponent(project)}/merge_requests?per_page=${options.limit ?? 30}&page=1&state=opened`);
      return response.json();
    }
  }
  return {
    registerGithubTrackingHook: vi.fn(),
    resolveGitlabAuth: vi.fn(() => ({ ok: true, auth: { apiBaseUrl: "https://gitlab.example.com/api/v4", webBaseUrl: "https://gitlab.example.com", token: "token", tokenType: "personal", headerName: "PRIVATE-TOKEN" } })),
    GitLabClient,
    buildGitLabTaskDescription: (item: any) => `${item.description?.trim() || "(no description)"}\n\nSource: ${item.webUrl ?? item.web_url}`,
    buildGitLabTaskProvenance: ({ resourceType, item }: any) => ({ sourceIssue: { provider: "gitlab", repository: String(item.projectPath ?? item.project_id ?? "unknown"), externalIssueId: resourceType === "merge_request" ? `gitlab:mr:${item.project_id}:${item.id}` : String(item.id), issueNumber: item.iid, url: item.webUrl ?? item.web_url }, sourceMetadata: { provider: "gitlab", resourceType, iid: item.iid, webUrl: item.webUrl ?? item.web_url } }),
    isGitLabAlreadyImported: (task: any, provenance: any) => task.description?.includes(provenance.sourceIssue.url) || task.sourceIssue?.externalIssueId === provenance.sourceIssue.externalIssueId,
  };
});

import { runTaskImportFromGitLab } from "../commands/task.js";

describe("fn task import-gitlab", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.getSettings.mockResolvedValue({ gitlabAuthToken: "token", gitlabInstanceUrl: "https://gitlab.example.com" });
    mocks.getGlobalSettings.mockResolvedValue({});
    mocks.listTasks.mockResolvedValue([]);
    mocks.createTask.mockImplementation(async (input) => ({ id: "FN-001", ...input }));
    fetchSpy = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify([{ id: 1, iid: 2, project_id: 3, title: "GitLab issue", description: null, webUrl: "https://gitlab.example.com/g/p/-/issues/2", web_url: "https://gitlab.example.com/g/p/-/issues/2", state: "opened", labels: [] }]), { status: 200 })));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("imports GitLab project issues with gitlab provenance", async () => {
    await runTaskImportFromGitLab("g/p", { resource: "project-issues", limit: 1 });
    expect(fetchSpy.mock.calls[0][0]).toContain("/projects/g%2Fp/issues?");
    expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      sourceIssue: expect.objectContaining({ provider: "gitlab", issueNumber: 2 }),
      source: expect.objectContaining({ sourceType: "gitlab_import", sourceMetadata: expect.objectContaining({ resourceType: "project_issue" }) }),
    }));
  });

  it("skips duplicates by GitLab source URL", async () => {
    mocks.listTasks.mockResolvedValue([{ id: "FN-OLD", description: "Source: https://gitlab.example.com/g/p/-/issues/2" }]);
    await runTaskImportFromGitLab("g/p", { resource: "project-issues", limit: 1 });
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("uses group issue and merge request endpoints", async () => {
    await runTaskImportFromGitLab("g", { resource: "group-issues", limit: 1 });
    expect(fetchSpy.mock.calls.at(-1)?.[0]).toContain("/groups/g/issues?");
    await runTaskImportFromGitLab("g/p", { resource: "merge-requests", limit: 1 });
    expect(fetchSpy.mock.calls.at(-1)?.[0]).toContain("/projects/g%2Fp/merge_requests?");
  });
});
