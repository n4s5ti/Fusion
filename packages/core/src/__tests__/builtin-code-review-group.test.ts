import { describe, expect, it } from "vitest";
import {
  CODE_REVIEW_GROUP_ID,
  CODE_REVIEW_STEP_NODE_ID,
  codeReviewOptionalGroupNode,
} from "../builtin-code-review-group.js";
import { BUILTIN_CODING_WORKFLOW_IR } from "../builtin-coding-workflow-ir.js";
import { BUILTIN_STEPWISE_CODING_WORKFLOW_IR } from "../builtin-stepwise-coding-workflow-ir.js";
import { WORKFLOW_STEP_TEMPLATES } from "../types.js";
import { parseWorkflowIr, serializeWorkflowIr } from "../workflow-ir.js";
import {
  resolveDefaultOnOptionalGroupIds,
  resolveWorkflowOptionalSteps,
} from "../workflow-optional-steps.js";

/*
FNXC:CodeReviewStep 2026-06-25-12:00:
Coverage for the built-in "Code Review" pre-merge workflow step: the catalog template
fields, the default-OFF optional-group node built from it, and its wiring into the coding
+ stepwise built-ins. Mirrors the browser-verification group/IR suite — code review is a
WORKFLOW prompt-gate (shared verdict machinery), not engine verification code.
*/

describe("code-review WORKFLOW_STEP_TEMPLATE", () => {
  const template = WORKFLOW_STEP_TEMPLATES.find((t) => t.id === "code-review");

  it("exists with the expected catalog fields", () => {
    expect(template).toBeTruthy();
    expect(template!.name).toBe("Code Review");
    expect(template!.toolMode).toBe("readonly");
    // Advisory default → non-blocking until an operator promotes it to a gate (parity
    // with browser-verification).
    expect(template!.gateMode).toBe("advisory");
    expect(template!.phase).toBe("pre-merge");
    expect(template!.description.length).toBeGreaterThan(0);
  });

  it("ends with the shared trailing verdict convention and reads the diff", () => {
    const prompt = template!.prompt;
    expect(prompt).toMatch(/"verdict":"APPROVE\|APPROVE_WITH_NOTES\|REVISE"/);
    expect(prompt).not.toContain('"verdict":"PASS"');
    expect(prompt).not.toContain('"verdict":"FAIL"');
    // Focused on the value tests miss + reads the diff against the base.
    expect(prompt).toMatch(/git diff/);
    expect(prompt).toMatch(/out of scope/i);
  });
});

describe("codeReviewOptionalGroupNode", () => {
  it("builds a default-OFF optional-group with the stable group id and distinct inner id", () => {
    const node = codeReviewOptionalGroupNode("in-progress");
    expect(node.id).toBe(CODE_REVIEW_GROUP_ID);
    expect(CODE_REVIEW_GROUP_ID).toBe("code-review");
    expect(CODE_REVIEW_STEP_NODE_ID).toBe("code-review-step");
    expect(node.id).not.toBe(CODE_REVIEW_STEP_NODE_ID); // U1: inner id ≠ group id.
    expect(node.kind).toBe("optional-group");
    expect(node.column).toBe("in-progress");
    expect(node.config?.name).toBe("Code Review");
    expect(node.config?.defaultOn).toBe(false);

    const template = node.config?.template as { nodes: { id: string; kind: string; config?: Record<string, unknown> }[] };
    expect(template.nodes).toHaveLength(1);
    const inner = template.nodes[0];
    expect(inner.id).toBe(CODE_REVIEW_STEP_NODE_ID);
    expect(inner.kind).toBe("prompt");
    expect(inner.config?.toolMode).toBe("readonly");
    expect(inner.config?.gateMode).toBe("advisory");
    expect(String(inner.config?.prompt)).toMatch(/"verdict":"APPROVE\|APPROVE_WITH_NOTES\|REVISE"/);
  });
});

describe("built-in coding + stepwise workflows wire code-review default-OFF on the pre-merge path", () => {
  it.each([
    ["builtin coding", BUILTIN_CODING_WORKFLOW_IR],
    ["builtin stepwise", BUILTIN_STEPWISE_CODING_WORKFLOW_IR],
  ])("%s includes the code-review optional-group and still parses/round-trips", (_name, ir) => {
    const byId = new Map(ir.nodes.map((n) => [n.id, n]));
    const group = byId.get("code-review");
    expect(group?.kind).toBe("optional-group");
    expect(group?.config?.name).toBe("Code Review");
    expect(group?.config?.defaultOn).toBe(false);
    expect(group?.column).toBe("in-progress");

    // Pre-merge wiring: ... → browser-verification → code-review → review; failure → end.
    expect(ir.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "browser-verification", to: "code-review", condition: "success" }),
        expect.objectContaining({ from: "code-review", to: "review", condition: "success" }),
        expect.objectContaining({ from: "code-review", to: "end", condition: "failure" }),
      ]),
    );

    // The built-in still compiles/validates with the new node (parse round-trips).
    const reparsed = parseWorkflowIr(serializeWorkflowIr(ir));
    expect(reparsed).toEqual(parseWorkflowIr(ir));
  });

  it.each([
    ["builtin coding", BUILTIN_CODING_WORKFLOW_IR],
    ["builtin stepwise", BUILTIN_STEPWISE_CODING_WORKFLOW_IR],
  ])("%s: code-review is advertised as an opt-in toggle but never default-seeded", (_name, ir) => {
    // Enabling it (task.enabledWorkflowSteps includes `code-review`) surfaces it on the
    // pre-merge path; the resolver advertises the toggle keyed by the group id.
    const advertised = resolveWorkflowOptionalSteps(ir).find((s) => s.templateId === "code-review");
    expect(advertised).toEqual({
      templateId: "code-review",
      name: "Code Review",
      description: "",
      phase: "pre-merge",
      defaultOn: false,
    });
    // Default OFF → byte-inert pass-through: never auto-seeded into a new task.
    expect(resolveDefaultOnOptionalGroupIds(ir)).not.toContain("code-review");
  });
});
