import {
  collectDeterministicSignals,
  resolveValidatorSettingsModel,
  type DeterministicSignals,
  type EvalTaskResultCreateInput,
  type EvaluationEvidenceRef,
  type FollowUpDraft,
  type Settings,
  type TaskDetail,
} from "@fusion/core";
import { createFnAgent, promptWithFallback } from "./pi.js";
import { createLogger } from "./logger.js";

const log = createLogger("evaluator");

export interface EvalRunContext {
  runId: string;
  startedAt: string;
}

export interface EvaluatorModelOverride {
  provider?: string;
  modelId?: string;
}

export interface EvaluatorDeps {
  cwd: string;
  runPrompt?: (prompt: string, provider?: string, modelId?: string) => Promise<string>;
}

interface EvaluatorAiResponse {
  overallScore: number;
  categoryScores: Record<string, number>;
  rationale: string;
  evidence: EvaluationEvidenceRef[];
  followUpDrafts: FollowUpDraft[];
}

export function resolveEvaluatorModel(
  settings: Partial<Settings>,
  override?: EvaluatorModelOverride,
): { provider?: string; modelId?: string } {
  if (override?.provider && override?.modelId) {
    return { provider: override.provider, modelId: override.modelId };
  }
  // Temporary fallback until FN-3393 introduces dedicated evaluator settings.
  return resolveValidatorSettingsModel(settings);
}

export class HybridEvaluatorService {
  constructor(private readonly deps: EvaluatorDeps) {}

  async evaluateTask(
    task: TaskDetail,
    run: EvalRunContext,
    settings: Partial<Settings>,
    modelOverride?: EvaluatorModelOverride,
  ): Promise<Omit<EvalTaskResultCreateInput, "taskId" | "taskSnapshot">> {
    const deterministicSignals = collectDeterministicSignals(task, run);
    const model = resolveEvaluatorModel(settings, modelOverride);
    const prompt = buildEvaluationPrompt(task, run, deterministicSignals);
    const responseText = await this.runPrompt(prompt, model.provider, model.modelId);
    const ai = parseAiResponse(responseText);

    return {
      status: "scored",
      overallScore: ai.overallScore,
      categoryScores: Object.entries(ai.categoryScores).map(([category, score]) => ({ category, score })),
      rationale: ai.rationale,
      summary: ai.rationale,
      evidence: ai.evidence.map((ev) => ({ type: "other", ref: `${ev.kind}:${ev.label}`, excerpt: ev.value })),
      deterministicSignals: deterministicSignalsToEvalSignals(deterministicSignals),
      followUps: ai.followUpDrafts.map((draft) => ({
        title: draft.title,
        description: draft.description,
        metadata: { reason: draft.reason, evidenceRefs: draft.evidenceRefs },
      })),
      metadata: {
        runId: run.runId,
        evaluatorModel: model,
        evaluatorRationale: ai.rationale,
        hybridEvaluation: {
          deterministicSignals,
          ai,
        },
      },
    };
  }

  private async runPrompt(prompt: string, provider?: string, modelId?: string): Promise<string> {
    if (this.deps.runPrompt) {
      return this.deps.runPrompt(prompt, provider, modelId);
    }

    let text = "";
    const { session } = await createFnAgent({
      cwd: this.deps.cwd,
      systemPrompt: "You are a strict evaluator. Reply with JSON only.",
      tools: "readonly",
      defaultProvider: provider,
      defaultModelId: modelId,
      onText: (delta) => {
        text += delta;
      },
    });

    try {
      await promptWithFallback(session, prompt);
      return text;
    } finally {
      try {
        session.dispose();
      } catch (error) {
        log.warn(`Evaluator session disposal failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

function deterministicSignalsToEvalSignals(signals: DeterministicSignals): Array<{ signalId: string; kind: string; name: string; value?: string | number; passed?: boolean }> {
  return [
    {
      signalId: "workflow-summary",
      kind: "workflow",
      name: "workflow-summary",
      value: `${signals.workflowSummary.passed}/${signals.workflowSummary.total}`,
      passed: signals.workflowSummary.failed === 0,
    },
    {
      signalId: "timing-ms",
      kind: "timing",
      name: "timed-execution-ms",
      value: signals.timedExecutionMs,
    },
    {
      signalId: "commit-count",
      kind: "commit",
      name: "commit-count",
      value: signals.commitSummary.commitCount,
    },
  ];
}

export function buildEvaluationPrompt(task: TaskDetail, run: EvalRunContext, deterministicSignals: DeterministicSignals): string {
  return [
    "Evaluate the completed task and respond with strict JSON.",
    `Run: ${run.runId}`,
    "Schema:",
    JSON.stringify({
      overallScore: 0,
      categoryScores: { quality: 0, reliability: 0, testing: 0 },
      rationale: "",
      evidence: [{ kind: "task", label: "", value: "", source: "" }],
      followUpDrafts: [{ title: "", description: "", reason: "", evidenceRefs: [] }],
    }, null, 2),
    "Task:",
    JSON.stringify({
      id: task.id,
      title: task.title,
      column: task.column,
      status: task.status,
      summary: task.summary,
    }, null, 2),
    "Deterministic signals:",
    JSON.stringify(deterministicSignals, null, 2),
  ].join("\n\n");
}

export function parseAiResponse(raw: string): EvaluatorAiResponse {
  const candidate = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Evaluator AI response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const record = parsed as Partial<EvaluatorAiResponse>;
  if (typeof record.overallScore !== "number") throw new Error("Evaluator response missing numeric overallScore");
  if (!record.categoryScores || typeof record.categoryScores !== "object") throw new Error("Evaluator response missing categoryScores");
  if (typeof record.rationale !== "string" || !record.rationale.trim()) throw new Error("Evaluator response missing rationale");

  return {
    overallScore: record.overallScore,
    categoryScores: record.categoryScores as Record<string, number>,
    rationale: record.rationale,
    evidence: Array.isArray(record.evidence) ? record.evidence : [],
    followUpDrafts: Array.isArray(record.followUpDrafts) ? record.followUpDrafts : [],
  };
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}
