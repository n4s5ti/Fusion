import { describe, expect, it } from "vitest";
import { shouldOpenBoardTaskInDock } from "../App";

describe("openTasksInRightSidebar board routing", () => {
  it("opens board card clicks in the dock only when the setting and dock surface are both active", () => {
    expect(shouldOpenBoardTaskInDock(true, true)).toBe(true);
    expect(shouldOpenBoardTaskInDock(false, true)).toBe(false);
    expect(shouldOpenBoardTaskInDock(true, false)).toBe(false);
  });

  it("keeps deep-tab opens on the existing main-panel path", () => {
    expect(shouldOpenBoardTaskInDock(true, true, "changes")).toBe(false);
    expect(shouldOpenBoardTaskInDock(true, true, "retries")).toBe(false);
    expect(shouldOpenBoardTaskInDock(true, true, "workflow")).toBe(false);
  });
});
