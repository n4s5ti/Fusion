import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateInteractiveAiSessionFactory } from "@fusion/core";
import { CeOrchestrator, warnIfStageSkillMissing } from "../session/orchestrator.js";
import { listStages } from "../session/stage-registry.js";
import { makeHarness, makeScriptedSession, type TestHarness } from "./_harness.js";

let h: TestHarness;

beforeEach(() => {
  h = makeHarness();
});

afterEach(() => {
  h.close();
  vi.restoreAllMocks();
});

describe("CE stage skill loading session options", () => {
  it.each(listStages())("starts $stageId with its registered skill selected and discoverable", async (stage) => {
    const capturedOptions: Parameters<CreateInteractiveAiSessionFactory>[0][] = [];
    const session = makeScriptedSession([{ type: "complete", data: { artifact: `# ${stage.stageId}` } }]);
    const factory: CreateInteractiveAiSessionFactory = vi.fn(async (options) => {
      capturedOptions.push(options);
      return { session, sessionFile: join(h.projectRoot, `${stage.stageId}.json`) };
    });

    const orch = new CeOrchestrator({ ctx: h.ctx, createInteractiveAiSession: factory, projectRoot: h.projectRoot });
    const result = await orch.start(stage.stageId, { openingMessage: `Run ${stage.stageId}` });

    expect(result.session.status).toBe("completed");
    expect(capturedOptions).toHaveLength(1);
    expect(capturedOptions[0].requestedSkillNames).toEqual([stage.skillId]);
    expect(capturedOptions[0].additionalSkillPaths).toHaveLength(1);
    expect(capturedOptions[0].additionalSkillPaths?.[0]).toMatch(/\.fusion-ce-skills$/);
    expect(capturedOptions[0].additionalSkillPaths?.[0]).not.toMatch(/\.(claude|codex|gemini)[/\\]skills/);
    expect(capturedOptions[0].systemPrompt).toContain(stage.skillId);
  });

  it("warns loudly when a stage skill is missing from the install root", () => {
    const stage = listStages()[0];
    const missingRoot = mkdtempSync(join(tmpdir(), "ce-missing-skill-root-"));
    try {
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

      const guard = warnIfStageSkillMissing(logger, stage, [missingRoot]);

      expect(guard).toMatchObject({
        skillId: stage.skillId,
        found: false,
        expectedSkillMdPaths: [join(missingRoot, stage.skillId, "SKILL.md")],
      });
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(stage.skillId),
        expect.objectContaining({
          stageId: stage.stageId,
          skillId: stage.skillId,
          expectedSkillMdPaths: [join(missingRoot, stage.skillId, "SKILL.md")],
          additionalSkillPaths: [missingRoot],
        }),
      );
    } finally {
      rmSync(missingRoot, { recursive: true, force: true });
    }
  });
});
