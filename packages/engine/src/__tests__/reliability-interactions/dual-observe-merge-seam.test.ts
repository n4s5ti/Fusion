import { describe, expect, it, vi } from "vitest";
import {
  computeShadowLeaseParityState,
  getUnmetSchedulingDependencies,
  isRunnableQueuedOverlapCandidate,
} from "../../scheduler.js";
import { ProjectEngine } from "../../project-engine.js";
import { classifyTransientMergeError } from "../../transient-merge-error-classifier.js";

describe("FN-5742 dual-observe merge seam", () => {
  it("emits no dependency parity diff when legacy and marker agree", () => {
    const task = { id: "FN-T", dependencies: ["FN-DEP"] } as any;
    const dep = { id: "FN-DEP", column: "done" } as any;
    const onParityDiff = vi.fn();

    const unmet = getUnmetSchedulingDependencies(task, [task, dep], {
      markerAcceptedByTaskId: new Map([["FN-DEP", true]]),
      onParityDiff,
    });

    expect(unmet).toEqual([]);
    expect(onParityDiff).not.toHaveBeenCalled();
  });

  it("keeps legacy dependency satisfaction authoritative while emitting parity diff", () => {
    const task = { id: "FN-T", dependencies: ["FN-DEP"] } as any;
    const dep = { id: "FN-DEP", column: "in-review" } as any;
    const onParityDiff = vi.fn();

    const unmet = getUnmetSchedulingDependencies(task, [task, dep], {
      markerAcceptedByTaskId: new Map([["FN-DEP", false]]),
      onParityDiff,
    });

    expect(unmet).toEqual([]);
    expect(onParityDiff).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "FN-T",
        dependencyId: "FN-DEP",
        legacySatisfied: true,
        markerSatisfied: false,
      }),
    );
  });

  it("shadow dequeue selector skips manual-required records", () => {
    const fakeEngine = {
      mergeQueue: ["FN-A", "FN-B", "FN-C"],
      runtime: {
        getTaskStore: () => ({
          getMergeRequestRecord: (taskId: string) => {
            if (taskId === "FN-A") return { state: "manual-required" };
            if (taskId === "FN-B") return { state: "queued" };
            return null;
          },
        }),
      },
    };

    const candidate = (ProjectEngine.prototype as any).getShadowMergeRequestCandidateId.call(fakeEngine);
    expect(candidate).toBe("FN-B");
  });

  it("emits shadow dequeue parity audit with agree metadata", () => {
    const recordRunAuditEvent = vi.fn();
    const fakeEngine = {
      runtime: {
        getTaskStore: () => ({ recordRunAuditEvent }),
      },
    };

    (ProjectEngine.prototype as any).emitMergeRequestShadowDequeueParity.call(fakeEngine, "FN-LEGACY", "FN-SHADOW");

    expect(recordRunAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "FN-LEGACY",
        mutationType: "merge:request-dequeued-shadow",
        metadata: expect.objectContaining({
          legacyTaskId: "FN-LEGACY",
          shadowTaskId: "FN-SHADOW",
          agree: false,
        }),
      }),
    );
  });

  it("marks dequeue parity as agree when legacy and shadow match", () => {
    const recordRunAuditEvent = vi.fn();
    const fakeEngine = {
      runtime: {
        getTaskStore: () => ({ recordRunAuditEvent }),
      },
    };

    (ProjectEngine.prototype as any).emitMergeRequestShadowDequeueParity.call(fakeEngine, "FN-LEGACY", "FN-LEGACY");

    expect(recordRunAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationType: "merge:request-dequeued-shadow",
        metadata: expect.objectContaining({
          agree: true,
        }),
      }),
    );
  });

  it("is a no-op when shadow dequeue API is unavailable", () => {
    const fakeEngine = {
      mergeQueue: ["FN-A"],
      runtime: {
        getTaskStore: () => ({}),
      },
    };

    const candidate = (ProjectEngine.prototype as any).getShadowMergeRequestCandidateId.call(fakeEngine);
    expect(candidate).toBeNull();
  });

  it("computes lease parity so manual-required does not create a merge lock", () => {
    const parity = computeShadowLeaseParityState("manual-required");
    expect(parity.shadowExecutorLeaseApplied).toBe(false);
    expect(parity.shadowMergeLockApplied).toBe(false);
    expect(parity.shadowLeaseApplied).toBe(false);
  });

  it("computes lease parity so queued requests create a merge lock", () => {
    const parity = computeShadowLeaseParityState("queued");
    expect(parity.shadowExecutorLeaseApplied).toBe(false);
    expect(parity.shadowMergeLockApplied).toBe(true);
    expect(parity.shadowLeaseApplied).toBe(true);
  });

  it("keeps dependency checks unchanged when parity observer options are absent", () => {
    const task = { id: "FN-T", dependencies: ["FN-DEP"] } as any;
    const dep = { id: "FN-DEP", column: "in-review" } as any;

    const unmet = getUnmetSchedulingDependencies(task, [task, dep]);
    expect(unmet).toEqual([]);
  });

  it("does not block unrelated executor dispatch when merge lane is busy", () => {
    const now = Date.now();
    const activeScopes = new Map<string, string[]>([["FN-MERGE", ["packages/engine/src/merger.ts"]]]);
    const todo = {
      id: "FN-UNRELATED",
      column: "todo",
      status: "queued",
      paused: false,
      userPaused: false,
      dependencies: [],
      nextRecoveryAt: undefined,
    } as any;

    const runnable = isRunnableQueuedOverlapCandidate(todo, [todo], now, activeScopes, ["docs/architecture.md"]);
    expect(runnable).toBe(true);
  });

  it("classifies transient merge errors without changing scheduler runnable decisions", () => {
    const transient = classifyTransientMergeError(
      "lease-handoff-failed: target-not-queued while attempting merge handoff",
    );
    expect(transient).toBe("lease-handoff-target-not-queued");

    const todo = {
      id: "FN-RUN",
      column: "todo",
      status: "queued",
      paused: false,
      userPaused: false,
      dependencies: [],
      nextRecoveryAt: undefined,
    } as any;
    expect(isRunnableQueuedOverlapCandidate(todo, [todo], Date.now())).toBe(true);
  });

  it("shadow dequeue helpers do not touch limbo recovery counters", () => {
    const updateTask = vi.fn();
    const fakeEngine = {
      runtime: {
        getTaskStore: () => ({
          recordRunAuditEvent: vi.fn(),
          updateTask,
        }),
      },
      mergeQueue: ["FN-A"],
    };

    (ProjectEngine.prototype as any).emitMergeRequestShadowDequeueParity.call(fakeEngine, "FN-A", "FN-A");
    (ProjectEngine.prototype as any).getShadowMergeRequestCandidateId.call(fakeEngine);

    expect(updateTask).not.toHaveBeenCalled();
  });
});
