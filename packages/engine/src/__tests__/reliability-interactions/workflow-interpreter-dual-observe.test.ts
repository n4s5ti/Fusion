import { describe, expect, it, vi } from "vitest";
import {
  observeWorkflowParity,
  WORKFLOW_INTERPRETER_DUAL_OBSERVE_FLAG,
} from "../../workflow-parity-observer.js";
import type { WorkflowRunObservation } from "@fusion/core";

const baseObservation: WorkflowRunObservation = {
  stageTransitions: ["triage", "execute", "review", "merge"],
  terminalColumn: "done",
  terminalStatus: null,
  reviewVerdict: "APPROVE",
  mergeOutcome: "merged",
  invariants: {
    fileScopeGuardOutcome: "pass",
    squashMergeContractOutcome: "pass",
    autoMergeTerminalUntilMergedRespected: true,
    moveTaskHardCancelRespected: true,
  },
};

describe("FN-5768 workflow interpreter dual-observe", () => {
  it("is strict no-op when flag is off", async () => {
    const recordRunAuditEvent = vi.fn();
    const runShadow = vi.fn();

    await observeWorkflowParity({
      settings: { experimentalFeatures: {} },
      store: { recordRunAuditEvent },
      agentId: "executor",
      legacy: {
        taskId: "FN-1",
        observation: baseObservation,
        auditEvents: [],
      },
      runShadow,
    });

    expect(runShadow).not.toHaveBeenCalled();
    expect(recordRunAuditEvent).not.toHaveBeenCalled();
  });

  it("keeps retired persisted true values inert instead of shadow-observing", async () => {
    const recordRunAuditEvent = vi.fn().mockResolvedValue(undefined);
    const runShadow = vi.fn(async () => ({ observation: baseObservation, auditEvents: [] }));

    await observeWorkflowParity({
      settings: { experimentalFeatures: { [WORKFLOW_INTERPRETER_DUAL_OBSERVE_FLAG]: true } },
      store: { recordRunAuditEvent },
      agentId: "executor",
      legacy: {
        taskId: "FN-2",
        observation: baseObservation,
        auditEvents: [],
      },
      runShadow,
    });

    expect(runShadow).not.toHaveBeenCalled();
    expect(recordRunAuditEvent).not.toHaveBeenCalled();
  });

  it("does not run a drift shadow when the retired flag is stale true", async () => {
    const recordRunAuditEvent = vi.fn().mockResolvedValue(undefined);
    const legacyResult = { authoritative: true };
    const runShadow = vi.fn(async () => ({
      observation: {
        ...baseObservation,
        terminalColumn: "in-review",
      },
      auditEvents: [],
    }));

    await observeWorkflowParity({
      settings: { experimentalFeatures: { [WORKFLOW_INTERPRETER_DUAL_OBSERVE_FLAG]: true } },
      store: { recordRunAuditEvent },
      agentId: "executor",
      legacy: {
        taskId: "FN-3",
        observation: baseObservation,
        auditEvents: [],
      },
      runShadow,
    });

    expect(legacyResult).toEqual({ authoritative: true });
    expect(runShadow).not.toHaveBeenCalled();
    expect(recordRunAuditEvent).not.toHaveBeenCalled();
  });

  it("does not execute stale shadow callbacks that would fail", async () => {
    const recordRunAuditEvent = vi.fn().mockResolvedValue(undefined);
    const runShadow = vi.fn(async () => {
      throw new Error("shadow exploded");
    });

    await expect(
      observeWorkflowParity({
        settings: { experimentalFeatures: { [WORKFLOW_INTERPRETER_DUAL_OBSERVE_FLAG]: true } },
        store: { recordRunAuditEvent },
        agentId: "executor",
        legacy: {
          taskId: "FN-4",
          observation: baseObservation,
          auditEvents: [],
        },
        runShadow,
      }),
    ).resolves.toBeUndefined();

    expect(runShadow).not.toHaveBeenCalled();
    expect(recordRunAuditEvent).not.toHaveBeenCalled();
  });
});
