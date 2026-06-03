import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installBundledCeSkills } from "../skill-installation.js";
import { resolveStageSkillPaths, buildStageSystemPrompt } from "../session/orchestrator.js";
import { getStage } from "../session/stage-registry.js";

/**
 * Prove the launched stage's ce-* skill is REACHABLE for the session — now via
 * the real seam wiring (closes the U2 → U5 carry-forward).
 *
 * The U4 `CreateInteractiveAiSessionOptions` surface now carries
 * `requestedSkillNames` + `additionalSkillPaths`, which the engine adapter
 * forwards into `createFnAgent` (`skills` + the loader's `additionalSkillPaths`).
 * So the orchestrator hands the session BOTH the stage's skill id and the
 * install directory to discover it from. This test asserts:
 *   1. the install directory `resolveStageSkillPaths()` returns actually holds
 *      the stage's `<skillId>/SKILL.md` after install, and
 *   2. the system prompt names the stage's skill id.
 *
 * The engine package separately proves (compound-engineering-skill-resolution
 * .test.ts) that `loadSkills` + the resolver resolve a ce-* skill once that
 * directory is on the discovery path — together the chain is closed.
 */

describe("stage skill reachability (real seam wiring)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("the resolved additionalSkillPaths directory contains the stage's installed SKILL.md", () => {
    const stage = getStage("brainstorm")!;

    // resolveStageSkillPaths() returns the plugin-local install root the session
    // is told to discover skills from (never a global one).
    const skillPaths = resolveStageSkillPaths();
    expect(skillPaths).toHaveLength(1);
    expect(skillPaths[0]).toMatch(/\.fusion-ce-skills$/);

    // Install bundled skills into that exact root and assert the stage's skill
    // is present on the path the session will scan.
    const { results } = installBundledCeSkills({ targetRoot: skillPaths[0] });
    expect(results.every((r) => r.outcome === "installed" || r.outcome === "skipped")).toBe(true);

    const installedSkillMd = join(skillPaths[0], stage.skillId, "SKILL.md");
    expect(existsSync(installedSkillMd)).toBe(true);
  });

  it("the stage system prompt names the stage's ce-* skill id", () => {
    const stage = getStage("brainstorm")!;
    const prompt = buildStageSystemPrompt(stage);
    expect(prompt).toContain(stage.skillId); // "ce-brainstorm"
    expect(prompt).toContain("question");
    expect(prompt).toContain("complete");
  });
});
