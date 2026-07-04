import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FloatingWindow } from "../FloatingWindow";
import { RightDockExpandModal } from "../RightDockExpandModal";
import { currentFloatingZ, currentTaskDetailFloatingZ, nextFloatingZ, nextTaskDetailFloatingZ } from "../floatingWindowStack";

/*
FNXC:FloatingWindow 2026-06-22-21:30:
Cross-type shared-stack contract. Utility floating modal types (utility FloatingWindow, the right-dock pop-out, the floating terminal, the floating New Task dialog) draw their z-index from the SINGLE module-level utility counter so tapping ANY utility raises it above ALL other utilities REGARDLESS of type. RightDockExpandModal stands in for the three non-FloatingWindow floating modals (terminal + New Task wire the identical claim-on-mount + bring-to-front-on-pointerdown pattern; they are heavier to mount in JSDOM and assert the same inline-zIndex contract).

FNXC:TaskPopupLayer 2026-07-04-18:36:
Task-detail FloatingWindow callers are excluded from the global utility stack. They use a lower board/task-detail counter so ordinary board/right-dock task popups can raise among themselves without becoming topmost utility overlays.
*/

const renderProps = { addToast: () => {}, projectId: "project-1" } as const;

describe("floatingWindowStack (cross-type)", () => {
  it("hands out strictly increasing z values for separate utility and task-detail bands", () => {
    const utilityA = nextFloatingZ();
    const utilityB = nextFloatingZ();
    const taskA = nextTaskDetailFloatingZ();
    const taskB = nextTaskDetailFloatingZ();

    expect(utilityB).toBeGreaterThan(utilityA);
    expect(currentFloatingZ()).toBe(utilityB);
    expect(taskB).toBeGreaterThan(taskA);
    expect(currentTaskDetailFloatingZ()).toBe(taskB);
    expect(utilityA).toBeGreaterThan(taskB);
  });

  it("tapping a utility FloatingWindow raises it above a right-dock pop-out opened after it (and vice versa)", () => {
    render(
      <>
        <FloatingWindow windowKey="fw" title="FW" onClose={() => {}}>
          <div>fw body</div>
        </FloatingWindow>
        <RightDockExpandModal viewKey="files" renderProps={renderProps} onClose={() => {}} />
      </>,
    );

    const fwPanel = screen.getByTestId("floating-window-fw");
    const dockPanel = screen
      .getByTestId("right-dock-expand-modal")
      .querySelector(".right-dock-expand-modal--floating") as HTMLElement;

    // Both carry an inline z-index from the shared stack.
    expect(fwPanel.style.zIndex).not.toBe("");
    expect(dockPanel.style.zIndex).not.toBe("");

    // The dock pop-out mounted last → it starts on top of the FloatingWindow, proving one shared stack.
    expect(Number(dockPanel.style.zIndex)).toBeGreaterThan(Number(fwPanel.style.zIndex));

    // Tapping the older FloatingWindow raises it above the dock pop-out — across the type boundary.
    fireEvent.pointerDown(fwPanel);
    expect(Number(fwPanel.style.zIndex)).toBeGreaterThan(Number(dockPanel.style.zIndex));

    // Tapping the dock pop-out raises it back above the FloatingWindow.
    fireEvent.pointerDown(dockPanel);
    expect(Number(dockPanel.style.zIndex)).toBeGreaterThan(Number(fwPanel.style.zIndex));
  });

  it("keeps task-detail FloatingWindow popups out of the global utility band", () => {
    render(
      <>
        <FloatingWindow windowKey="task" title="Task" onClose={() => {}} layer="task-detail" className="floating-window--task-detail">
          <div>task body</div>
        </FloatingWindow>
        <RightDockExpandModal viewKey="files" renderProps={renderProps} onClose={() => {}} />
      </>,
    );

    const taskPanel = screen.getByTestId("floating-window-task");
    const taskOverlay = screen.getByTestId("floating-window-overlay-task");
    const dockPanel = screen
      .getByTestId("right-dock-expand-modal")
      .querySelector(".right-dock-expand-modal--floating") as HTMLElement;

    expect(Number(taskPanel.style.zIndex)).toBeLessThan(Number(dockPanel.style.zIndex));
    expect(Number(taskOverlay.style.zIndex)).toBeLessThan(Number(dockPanel.style.zIndex));

    fireEvent.pointerDown(taskPanel);
    expect(Number(taskPanel.style.zIndex)).toBeLessThan(Number(dockPanel.style.zIndex));
  });
});
