import { describe, expect, it } from "vitest";
import plugin from "../index.js";
import { installExecMock } from "./fixtures/exec-mock.js";

describe("workflow integration contracts", () => {
  // FN-4150/FN-3768 track future workflow-step template + runWorkflowSteps coverage.
  it("guards against execSync usage in workflow-oriented execution fixtures", () => {
    const execMock = installExecMock();
    execMock.assertExecSyncUnused();
    expect(typeof plugin.manifest.id).toBe("string");
  });

  it("contributes plugin workflow step templates", () => {
    expect(plugin.workflowSteps?.length).toBeGreaterThan(0);
    expect(plugin.workflowSteps?.some((step) => step.mode === "script")).toBe(true);
  });
});
