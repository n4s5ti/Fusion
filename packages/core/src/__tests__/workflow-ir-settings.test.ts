import { describe, expect, it } from "vitest";
import {
  parseWorkflowIr,
  serializeWorkflowIr,
  downgradeIrToV1IfPure,
  WorkflowIrError,
} from "../workflow-ir.js";
import { BUILTIN_CODING_WORKFLOW_IR } from "../builtin-coding-workflow-ir.js";
import { BUILTIN_WORKFLOW_SETTINGS } from "../builtin-workflow-settings.js";
import { DEFAULT_PROJECT_SETTINGS } from "../types.js";
import type {
  WorkflowIrV2,
  WorkflowIrNode,
  WorkflowSettingDefinition,
} from "../workflow-ir-types.js";

const startEnd: WorkflowIrNode[] = [
  { id: "start", kind: "start" },
  { id: "end", kind: "end" },
];

function withSettings(settings: WorkflowSettingDefinition[]): WorkflowIrV2 {
  return {
    version: "v2",
    name: "test",
    columns: [],
    nodes: startEnd,
    edges: [{ from: "start", to: "end" }],
    settings,
  };
}

describe("parseWorkflowIr — workflow settings declarations (U1)", () => {
  it("parses and round-trips a valid declaration of each type", () => {
    const settings: WorkflowSettingDefinition[] = [
      { id: "s-string", name: "S", type: "string", default: "x" },
      { id: "s-text", name: "T", type: "text", default: "long" },
      { id: "s-number", name: "N", type: "number", default: 42 },
      { id: "s-boolean", name: "B", type: "boolean", default: true },
      {
        id: "s-enum",
        name: "E",
        type: "enum",
        default: "a",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
      {
        id: "s-multi",
        name: "M",
        type: "multi-enum",
        default: ["a"],
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
        render: { widget: "chips" },
      },
    ];
    const parsed = parseWorkflowIr(withSettings(settings)) as WorkflowIrV2;
    expect(parsed.settings).toEqual(settings);
    const reparsed = parseWorkflowIr(serializeWorkflowIr(parsed));
    expect(reparsed).toEqual(parsed);
  });

  it("allows a declaration with no default and a description", () => {
    const parsed = parseWorkflowIr(
      withSettings([
        { id: "lane", name: "Lane", type: "string", description: "a model lane" },
      ]),
    ) as WorkflowIrV2;
    expect(parsed.settings?.[0].default).toBeUndefined();
  });

  it("rejects duplicate setting ids", () => {
    expect(() =>
      parseWorkflowIr(
        withSettings([
          { id: "dup", name: "A", type: "string" },
          { id: "dup", name: "B", type: "string" },
        ]),
      ),
    ).toThrow(WorkflowIrError);
  });

  it("rejects an empty id", () => {
    expect(() =>
      parseWorkflowIr(withSettings([{ id: "", name: "A", type: "string" }])),
    ).toThrow(WorkflowIrError);
  });

  it("rejects an unknown type", () => {
    expect(() =>
      parseWorkflowIr(
        withSettings([{ id: "x", name: "A", type: "date" as never }]),
      ),
    ).toThrow(WorkflowIrError);
  });

  it("rejects an enum without options", () => {
    expect(() =>
      parseWorkflowIr(withSettings([{ id: "x", name: "A", type: "enum" }])),
    ).toThrow(WorkflowIrError);
  });

  it("rejects options on a non-enum type", () => {
    expect(() =>
      parseWorkflowIr(
        withSettings([
          { id: "x", name: "A", type: "number", options: [{ value: "a", label: "A" }] },
        ]),
      ),
    ).toThrow(WorkflowIrError);
  });

  it("rejects duplicate option values", () => {
    expect(() =>
      parseWorkflowIr(
        withSettings([
          {
            id: "x",
            name: "A",
            type: "enum",
            options: [
              { value: "a", label: "A" },
              { value: "a", label: "A2" },
            ],
          },
        ]),
      ),
    ).toThrow(WorkflowIrError);
  });

  it("rejects a disallowed render widget", () => {
    expect(() =>
      parseWorkflowIr(
        withSettings([
          { id: "x", name: "A", type: "string", render: { widget: "slider" as never } },
        ]),
      ),
    ).toThrow(WorkflowIrError);
  });

  it("rejects a default violating its own type (number with string)", () => {
    expect(() =>
      parseWorkflowIr(
        withSettings([{ id: "x", name: "A", type: "number", default: "x" }]),
      ),
    ).toThrow(WorkflowIrError);
  });

  it("rejects a default violating boolean type", () => {
    expect(() =>
      parseWorkflowIr(
        withSettings([{ id: "x", name: "A", type: "boolean", default: "true" }]),
      ),
    ).toThrow(WorkflowIrError);
  });

  it("rejects an enum default not among options", () => {
    expect(() =>
      parseWorkflowIr(
        withSettings([
          {
            id: "x",
            name: "A",
            type: "enum",
            default: "c",
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
        ]),
      ),
    ).toThrow(WorkflowIrError);
  });

  it("rejects a multi-enum default containing an unknown option", () => {
    expect(() =>
      parseWorkflowIr(
        withSettings([
          {
            id: "x",
            name: "A",
            type: "multi-enum",
            default: ["a", "c"],
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
        ]),
      ),
    ).toThrow(WorkflowIrError);
  });

  it("does not downgrade an IR with settings present to v1", () => {
    const parsed = parseWorkflowIr(
      withSettings([{ id: "x", name: "A", type: "string", default: "v" }]),
    );
    const down = downgradeIrToV1IfPure(parsed);
    expect(down.version).toBe("v2");
  });
});

describe("built-in workflow settings parity anchor (U1, R4)", () => {
  it("the built-in coding workflow declares the full moved-key catalog", () => {
    const builtin = BUILTIN_CODING_WORKFLOW_IR as WorkflowIrV2;
    const declaredIds = new Set((builtin.settings ?? []).map((s) => s.id));
    for (const setting of BUILTIN_WORKFLOW_SETTINGS) {
      expect(declaredIds.has(setting.id)).toBe(true);
    }
    expect(builtin.settings).toEqual(BUILTIN_WORKFLOW_SETTINGS);
  });

  it("each declaration default strictly equals the legacy DEFAULT_PROJECT_SETTINGS literal", () => {
    const legacy = DEFAULT_PROJECT_SETTINGS as Record<string, unknown>;
    for (const setting of BUILTIN_WORKFLOW_SETTINGS) {
      // Catalog keys must exist as a known project-settings key.
      expect(Object.prototype.hasOwnProperty.call(legacy, setting.id)).toBe(true);
      // A declared default must byte-equal the legacy literal; an omitted
      // default corresponds to a legacy `undefined` literal.
      expect(setting.default).toStrictEqual(legacy[setting.id]);
    }
  });
});
