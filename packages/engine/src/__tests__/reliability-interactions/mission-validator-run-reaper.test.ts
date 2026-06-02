import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore, type MissionFeature } from "@fusion/core";
import { describe, expect, it, vi } from "vitest";
import { MissionExecutionLoop } from "../../mission-execution-loop.js";

async function createHarness() {
  const rootDir = await mkdtemp(join(tmpdir(), "fusion-mission-validator-reaper-"));
  const taskStore = new TaskStore(rootDir, undefined, { inMemoryDb: true });
  await taskStore.init();
  const missionStore = taskStore.getMissionStore();

  const loop = new MissionExecutionLoop({
    taskStore,
    missionStore,
    rootDir,
  });

  vi.spyOn(loop as any, "runValidation").mockResolvedValue({
    status: "pass",
    assertions: [],
    summary: "validator passed",
  });

  const createLinkedFeature = async (input: {
    missionTitle: string;
    missionStatus?: "active" | "complete" | "archived";
    autopilotEnabled?: boolean;
    featureTitle: string;
    taskId: string;
    taskColumn?: "done" | "archived";
  }) => {
    const mission = missionStore.createMission({
      title: input.missionTitle,
      autopilotEnabled: input.autopilotEnabled ?? true,
    });
    if (input.missionStatus && input.missionStatus !== "active") {
      missionStore.updateMission(mission.id, { status: input.missionStatus });
    }
    const milestone = missionStore.addMilestone(mission.id, { title: `${input.missionTitle} milestone` });
    const slice = missionStore.addSlice(milestone.id, { title: `${input.missionTitle} slice` });
    const feature = missionStore.addFeature(slice.id, { title: input.featureTitle });
    const task = await taskStore.createTask({
      id: input.taskId,
      title: input.featureTitle,
      description: `${input.featureTitle} task`,
      column: input.taskColumn ?? "done",
      status: input.taskColumn === "archived" ? "done" : "done",
      steps: [],
      prompt: "## File Scope\n- packages/engine/src/**\n",
    } as any);
    missionStore.linkFeatureToTask(feature.id, task.id);
    const assertion = missionStore.addContractAssertion(milestone.id, {
      title: `${input.featureTitle} assertion`,
      assertion: `Verify ${input.featureTitle}`,
      sourceFeatureId: feature.id,
    });
    missionStore.linkFeatureToAssertion(feature.id, assertion.id);
    return { mission, milestone, slice, feature: missionStore.getFeature(feature.id)!, task };
  };

  const ageRun = (runId: string, startedAt: string) => {
    (missionStore as any).db.prepare("UPDATE mission_validator_runs SET startedAt = ?, updatedAt = ? WHERE id = ?").run(startedAt, startedAt, runId);
  };

  return {
    rootDir,
    taskStore,
    missionStore,
    loop,
    createLinkedFeature,
    ageRun,
    cleanup: async () => {
      loop.stop();
      taskStore.close();
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}

describe("FN-5901 reliability: mission validator run reaper", () => {
  it("reaps stale manual + automatic validator runs, unwedges the feature, and emits audit events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    const h = await createHarness();
    try {
      const wedged = await h.createLinkedFeature({
        missionTitle: "Wedged mission",
        featureTitle: "Wedged feature",
        taskId: "FN-WEDGED",
      });
      const independent = await h.createLinkedFeature({
        missionTitle: "Independent mission",
        featureTitle: "Independent feature",
        taskId: "FN-INDEPENDENT",
      });
      const archivedParent = await h.createLinkedFeature({
        missionTitle: "Archived mission",
        missionStatus: "archived",
        featureTitle: "Archived feature",
        taskId: "FN-ARCHIVED",
      });

      const manualRun = h.missionStore.startValidatorRun(wedged.feature.id, "manual");
      const archivedAutoRun = h.missionStore.startValidatorRun(archivedParent.feature.id, "auto");
      h.ageRun(manualRun.id, "2026-05-01T12:00:00.000Z");
      h.ageRun(archivedAutoRun.id, "2026-05-01T13:00:00.000Z");

      h.missionStore.updateFeature(archivedParent.feature.id, {
        status: "done",
        loopState: "passed",
        lastValidatorStatus: "passed",
      });

      h.loop.start();

      await h.loop.processTaskOutcome(wedged.task.id);
      expect(h.missionStore.getFeature(wedged.feature.id)?.status).toBe("triaged");
      expect(h.missionStore.getValidatorRun(manualRun.id)?.status).toBe("running");

      await h.loop.processTaskOutcome(independent.task.id);
      expect(h.missionStore.getFeature(independent.feature.id)?.status).toBe("done");

      const reapResult = await h.loop.reapStaleValidatorRuns(6 * 60 * 60 * 1000);
      expect(reapResult).toEqual({ reapedCount: 2 });

      const reapedManualRun = h.missionStore.getValidatorRun(manualRun.id);
      expect(reapedManualRun?.status).toBe("error");
      expect(reapedManualRun?.summary).toContain("stale threshold");
      expect(h.missionStore.getFeature(wedged.feature.id)).toMatchObject({
        loopState: "needs_fix",
        lastValidatorStatus: "error",
        lastValidatorRunId: manualRun.id,
      });

      const archivedFeatureAfterReap = h.missionStore.getFeature(archivedParent.feature.id) as MissionFeature;
      expect(h.missionStore.getValidatorRun(archivedAutoRun.id)?.status).toBe("error");
      expect(archivedFeatureAfterReap).toMatchObject({
        status: "done",
        loopState: "passed",
        lastValidatorStatus: "passed",
        lastValidatorRunId: archivedAutoRun.id,
      });

      const auditEvents = h.taskStore.getRunAuditEvents({ mutationType: "mission:validator-run-reaped" });
      expect(auditEvents).toHaveLength(2);
      expect(auditEvents.map((event) => event.metadata?.runId)).toEqual(expect.arrayContaining([manualRun.id, archivedAutoRun.id]));
      expect(auditEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          target: manualRun.id,
          metadata: expect.objectContaining({
            runId: manualRun.id,
            featureId: wedged.feature.id,
            missionId: wedged.mission.id,
            triggerType: "manual",
            elapsedMs: 31 * 24 * 60 * 60 * 1000,
          }),
        }),
        expect.objectContaining({
          target: archivedAutoRun.id,
          metadata: expect.objectContaining({
            runId: archivedAutoRun.id,
            featureId: archivedParent.feature.id,
            missionId: archivedParent.mission.id,
            triggerType: "auto",
            elapsedMs: 30 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000,
          }),
        }),
      ]));

      await h.loop.processTaskOutcome(wedged.task.id);
      expect(h.missionStore.getFeature(wedged.feature.id)?.status).toBe("done");
      expect(h.missionStore.getFeature(wedged.feature.id)?.lastValidatorStatus).toBe("passed");
    } finally {
      await h.cleanup();
      vi.useRealTimers();
    }
  });
});
