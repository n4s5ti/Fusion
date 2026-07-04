/*
FNXC:PlannerOversight 2026-07-04-17:00:
FN-7517 coverage for the task-detail planner-overseer controls: the quick
oversight-level-change select, the manual nudge/stop/explain buttons, and
their enablement/leftover-shell rules (Surface Enumeration).
*/
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { PlannerOverseerRuntimeSnapshot } from "@fusion/core";
import {
  makeTask,
  noop,
  noopDelete,
  noopMerge,
  noopMove,
  noopOpenDetail,
  mockConfirm,
  setupTaskDetailModalHooks,
} from "./TaskDetailModal.test-helpers";
import { TaskDetailModal } from "../TaskDetailModal";

setupTaskDetailModalHooks();

const activeSnapshot: PlannerOverseerRuntimeSnapshot = {
  state: "watching",
  oversightLevel: "autonomous",
  watchedStage: "executor",
  signal: "progressing",
  attemptCount: 1,
  attemptLimit: 3,
  pendingConfirmation: false,
  observedAt: 1_700_000_000_000,
  reason: "Task is actively executing in-progress work",
  lastAction: "inject_guidance",
};

describe("TaskDetailModal oversight controls", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
    const api = await import("../../api");
    vi.mocked(api.fetchBoardWorkflows).mockResolvedValue({ flagEnabled: false, defaultWorkflowId: "", workflows: [], taskWorkflowIds: {} });
    vi.mocked(api.fetchWorkflowSettingValues).mockResolvedValue({ stored: {}, effective: {}, defaults: {} });
    vi.mocked(api.nudgeOverseer).mockResolvedValue({ applied: false, reason: "oversight-off" });
    vi.mocked(api.stopOverseer).mockResolvedValue({ applied: true, reason: "stopped" });
    vi.mocked(api.explainOverseer).mockResolvedValue({ snapshot: null });
  });

  it("quick level select reflects a per-task override and writes the override on change", async () => {
    const api = await import("../../api");
    const mockUpdate = vi.mocked(api.updateTask);
    mockUpdate.mockResolvedValueOnce(makeTask({ id: "FN-100", plannerOversightLevel: "steer" }) as any);

    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-100", column: "in-progress", plannerOversightLevel: "observe" })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    const select = await screen.findByTestId("detail-oversight-level-select");
    expect((select as HTMLSelectElement).value).toBe("observe");

    fireEvent.change(select, { target: { value: "steer" } });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("FN-100", { plannerOversightLevel: "steer" }, undefined);
    });
  });

  it("clearing the override writes a null-clear back to the inherited default", async () => {
    const api = await import("../../api");
    const mockUpdate = vi.mocked(api.updateTask);
    mockUpdate.mockResolvedValueOnce(makeTask({ id: "FN-101" }) as any);

    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-101", column: "in-progress", plannerOversightLevel: "steer" })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    const select = await screen.findByTestId("detail-oversight-level-select");
    fireEvent.change(select, { target: { value: "__inherit__" } });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("FN-101", { plannerOversightLevel: null }, undefined);
    });
  });

  it("nudge is enabled and calls nudgeOverseer when the overseer is actively watching", async () => {
    const api = await import("../../api");
    vi.mocked(api.nudgeOverseer).mockResolvedValueOnce({ applied: true, reason: "nudged", task: makeTask({ id: "FN-102" }) as any });

    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-102", column: "in-progress", plannerOversightLevel: "autonomous", plannerOverseerState: activeSnapshot })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    const nudgeBtn = await screen.findByTestId("detail-overseer-nudge");
    expect(nudgeBtn).not.toBeDisabled();
    fireEvent.click(nudgeBtn);

    await waitFor(() => {
      expect(api.nudgeOverseer).toHaveBeenCalledWith("FN-102", undefined);
    });
  });

  it("nudge is disabled when the overseer has no active observation", async () => {
    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-103", column: "todo", plannerOversightLevel: "autonomous" })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    const nudgeBtn = await screen.findByTestId("detail-overseer-nudge");
    expect(nudgeBtn).toBeDisabled();
  });

  it("nudge is disabled while the task is user-paused", async () => {
    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-104", column: "in-progress", plannerOversightLevel: "autonomous", plannerOverseerState: activeSnapshot, userPaused: true })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    const nudgeBtn = await screen.findByTestId("detail-overseer-nudge");
    expect(nudgeBtn).toBeDisabled();
  });

  it("nudge is disabled when the task is done", async () => {
    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-105", column: "done", plannerOversightLevel: "autonomous", plannerOverseerState: activeSnapshot })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    const nudgeBtn = await screen.findByTestId("detail-overseer-nudge");
    expect(nudgeBtn).toBeDisabled();
  });

  it("stop calls stopOverseer after confirmation", async () => {
    const api = await import("../../api");
    vi.mocked(api.stopOverseer).mockResolvedValueOnce({ applied: true, reason: "stopped", task: makeTask({ id: "FN-106", plannerOversightLevel: "off" }) as any });

    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-106", column: "in-progress", plannerOversightLevel: "steer" })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    const stopBtn = await screen.findByTestId("detail-overseer-stop");
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
      expect(api.stopOverseer).toHaveBeenCalledWith("FN-106", undefined);
    });
  });

  it("stop is hidden when oversight is already off", async () => {
    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-107", column: "in-progress", plannerOversightLevel: "off" })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    await screen.findByTestId("detail-oversight-level-select");
    expect(screen.queryByTestId("detail-overseer-stop")).not.toBeInTheDocument();
  });

  it("explain renders watched stage/reason/action/attempt-count from overseer state", async () => {
    const api = await import("../../api");
    vi.mocked(api.explainOverseer).mockResolvedValueOnce({ snapshot: activeSnapshot });

    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-108", column: "in-progress", plannerOversightLevel: "autonomous", plannerOverseerState: activeSnapshot })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    const explainBtn = await screen.findByTestId("detail-overseer-explain");
    fireEvent.click(explainBtn);

    const panel = await screen.findByTestId("detail-overseer-explain-panel");
    expect(panel).toHaveTextContent("executor");
    expect(panel).toHaveTextContent("Task is actively executing in-progress work");
    expect(panel).toHaveTextContent("inject_guidance");
    expect(panel).toHaveTextContent("1");
    expect(panel).toHaveTextContent("3");
  });

  it("explain shows the inactive empty-state (no empty shell) when the overseer is inactive", async () => {
    const api = await import("../../api");
    vi.mocked(api.explainOverseer).mockResolvedValueOnce({ snapshot: null });

    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-109", column: "in-progress", plannerOversightLevel: "observe", plannerOverseerState: activeSnapshot })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    const explainBtn = await screen.findByTestId("detail-overseer-explain");
    fireEvent.click(explainBtn);

    const panel = await screen.findByTestId("detail-overseer-explain-panel");
    expect(panel).toHaveTextContent("not currently watching");
  });

  it("renders no oversight-control leftover shell when oversight is off and the overseer is inactive (default case)", async () => {
    render(
      <TaskDetailModal
        task={makeTask({ id: "FN-110", column: "todo", plannerOversightLevel: "off" })}
        onClose={noop}
        onMoveTask={noopMove}
        onDeleteTask={noopDelete}
        onMergeTask={noopMerge}
        onOpenDetail={noopOpenDetail}
        addToast={noop}
      />,
    );

    // The quick level-change select still renders (it's always editable so an
    // operator can opt IN to oversight), but nudge/stop/explain must not
    // render an always-on empty shell for the common off+inactive default.
    await screen.findByTestId("detail-oversight-level-select");
    expect(screen.queryByTestId("detail-overseer-nudge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-overseer-stop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-overseer-explain")).not.toBeInTheDocument();
  });
});
