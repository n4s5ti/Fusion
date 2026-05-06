import { describe, expect, it } from "vitest";
import { createDatabase, EvalStore, runScheduledEvalBatch, type TaskDetail } from "@fusion/core";
import { HybridEvaluatorService, buildEvaluationPrompt, parseAiResponse, resolveEvaluatorModel } from "../evaluator.js";

function makeTask(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: "FN-101",
    description: "desc",
    column: "done",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [{ timestamp: "1", action: "[timing] build in 50ms" }],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T01:00:00.000Z",
    prompt: "prompt",
    ...overrides,
  } as TaskDetail;
}

describe("evaluator", () => {
  it("resolves explicit complete model override before validator lane", () => {
    expect(resolveEvaluatorModel({ validatorProvider: "anthropic", validatorModelId: "claude" }, { provider: "openai", modelId: "gpt-4o" }))
      .toEqual({ provider: "openai", modelId: "gpt-4o" });
  });

  it("ignores partial override and falls back to validator lane", () => {
    expect(resolveEvaluatorModel({ validatorProvider: "anthropic", validatorModelId: "claude" }, { provider: "openai" }))
      .toEqual({ provider: "anthropic", modelId: "claude" });
  });

  it("parses strict AI JSON response", () => {
    const parsed = parseAiResponse('{"overallScore":0.8,"categoryScores":{"quality":0.8},"rationale":"ok","evidence":[],"followUpDrafts":[]}');
    expect(parsed.overallScore).toBe(0.8);
    expect(parsed.rationale).toBe("ok");
  });

  it("throws on malformed AI JSON response", () => {
    expect(() => parseAiResponse("not-json")).toThrow(/not valid JSON/);
  });

  it("builds prompt with deterministic signal bundle", () => {
    const task = makeTask();
    const prompt = buildEvaluationPrompt(task, { runId: "ER-1", startedAt: "2026-05-02T00:00:00.000Z" }, {
      taskId: task.id,
      column: "done",
      workflowSummary: { total: 0, passed: 0, failed: 0, pending: 0 },
      commitSummary: { commitCount: 0 },
      logSummary: { errorCount: 0, warningCount: 0, timingEntries: 1 },
      evidence: [],
    });
    expect(prompt).toContain("Deterministic signals");
    expect(prompt).toContain("ER-1");
  });

  it("returns merged evaluation payload shape for persistence", async () => {
    const service = new HybridEvaluatorService({
      cwd: process.cwd(),
      runPrompt: async () => '{"overallScore":0.9,"categoryScores":{"quality":0.9},"rationale":"Great","evidence":[{"kind":"task","label":"done"}],"followUpDrafts":[{"title":"Add tests","description":"More tests","reason":"coverage","evidenceRefs":["task:done"]}]}'
    });
    const result = await service.evaluateTask(makeTask(), { runId: "ER-1", startedAt: "2026-05-01T00:00:00.000Z" }, {});
    expect(result.status).toBe("scored");
    expect(result.overallScore).toBe(0.9);
    expect(result.categoryScores?.[0]?.category).toBe("quality");
    expect(result.followUps?.[0]?.title).toBe("Add tests");
    expect((result.metadata as any).hybridEvaluation).toBeDefined();
  });

  it("integrates scheduled batch with evaluator and persists one result per run/task", async () => {
    const db = createDatabase("/tmp/fn-evaluator-integration", { inMemory: true });
    db.init();
    const evalStore = new EvalStore(db);
    const doneTask = makeTask({ executionCompletedAt: "2026-05-01T00:04:00.000Z" });

    const service = new HybridEvaluatorService({
      cwd: process.cwd(),
      runPrompt: async () => '{"overallScore":0.7,"categoryScores":{"quality":0.7},"rationale":"Solid","evidence":[],"followUpDrafts":[]}'
    });

    const mockStore = {
      listTasks: async () => [doneTask],
      getEvalStore: () => evalStore,
    };

    const run1 = await runScheduledEvalBatch({
      store: mockStore,
      projectId: "proj-1",
      startedAt: "2026-05-02T00:00:00.000Z",
      evaluator: async ({ task, run }) => service.evaluateTask(task as TaskDetail, { runId: run.id, startedAt: run.startedAt ?? "" }, {}),
    });

    const run2 = await runScheduledEvalBatch({
      store: mockStore,
      projectId: "proj-1",
      startedAt: "2026-05-02T00:00:00.000Z",
      evaluator: async ({ task, run }) => service.evaluateTask(task as TaskDetail, { runId: run.id, startedAt: run.startedAt ?? "" }, {}),
    });

    expect(run1.status).toBe("completed");
    expect(run2.tasksSelected).toBe(0);
    const all = evalStore.listTaskResults({ taskId: doneTask.id });
    expect(all).toHaveLength(1);
    expect(all[0]?.overallScore).toBe(0.7);
  });
});
