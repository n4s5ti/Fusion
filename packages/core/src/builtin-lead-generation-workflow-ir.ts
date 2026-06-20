import type { WorkflowIr } from "./workflow-ir-types.js";
import { parseWorkflowIr } from "./workflow-ir.js";
import { BUILTIN_WORKFLOW_SETTINGS } from "./builtin-workflow-settings.js";

/**
 * FNXC:Workflows 2026-06-20-00:25:
 * The lead-generation built-in must be a first-class v2 workflow with its own business pipeline columns, lead-specific task fields, and inline per-stage prompts instead of coding seams.
 * The custom non-default column ids make this workflow graph-executor-oriented at runtime while still compiling its linear prompt/gate spine for legacy step materialization.
 */
const RAW_BUILTIN_LEAD_GENERATION_WORKFLOW_IR: WorkflowIr = {
  version: "v2",
  name: "builtin-lead-generation",
  columns: [
    { id: "triage", name: "Lead intake", traits: [{ trait: "intake" }] },
    { id: "sourcing", name: "Sourcing", traits: [{ trait: "timing" }] },
    {
      id: "qualification",
      name: "Qualification",
      traits: [
        { trait: "wip", config: { limitSetting: "maxConcurrent", countPending: true } },
        { trait: "timing" },
      ],
    },
    { id: "enrichment", name: "Enrichment", traits: [{ trait: "timing" }] },
    {
      id: "outreach",
      name: "Outreach",
      traits: [
        { trait: "human-review" },
        { trait: "stall-detection", config: { timeoutMs: 86_400_000, action: "notify" } },
      ],
    },
    { id: "converted", name: "Converted", traits: [{ trait: "complete" }] },
    { id: "archived", name: "Archived", traits: [{ trait: "archived" }] },
  ],
  fields: [
    { id: "company", name: "Company", type: "string", render: { placement: "card", widget: "input" } },
    { id: "contactName", name: "Contact name", type: "string", render: { placement: "detail", widget: "input" } },
    { id: "contactEmail", name: "Contact email", type: "url", render: { placement: "detail", widget: "input" } },
    {
      id: "leadSource",
      name: "Lead source",
      type: "enum",
      options: [
        { value: "referral", label: "Referral" },
        { value: "inbound", label: "Inbound" },
        { value: "outbound", label: "Outbound" },
        { value: "event", label: "Event" },
        { value: "partner", label: "Partner" },
      ],
      render: { placement: "card", widget: "select" },
    },
    { id: "leadScore", name: "Lead score", type: "number", render: { placement: "card", widget: "input" } },
    {
      id: "leadStatus",
      name: "Lead status",
      type: "enum",
      options: [
        { value: "new", label: "New" },
        { value: "qualified", label: "Qualified" },
        { value: "contacted", label: "Contacted" },
        { value: "responded", label: "Responded" },
        { value: "won", label: "Won" },
        { value: "lost", label: "Lost" },
      ],
      render: { placement: "card", widget: "select" },
    },
  ],
  nodes: [
    { id: "start", kind: "start", column: "triage" },
    {
      id: "source-prospects",
      kind: "prompt",
      column: "sourcing",
      config: {
        name: "Source prospects",
        executor: "model",
        prompt:
          "Research and identify promising prospects for this lead-generation task. Capture target companies, likely buyer personas, trigger events, and the evidence behind each prospect so downstream qualification can judge fit.",
      },
    },
    {
      id: "qualify-lead",
      kind: "prompt",
      column: "qualification",
      config: {
        name: "Qualify lead",
        executor: "model",
        prompt:
          "Evaluate each sourced prospect against the ideal customer profile. Score company fit, pain urgency, budget or buying signals, and disqualifying risks; update lead score and recommend qualified or lost status with concise rationale.",
      },
    },
    {
      id: "qualification-gate",
      kind: "gate",
      column: "qualification",
      config: {
        name: "Qualification go / no-go",
        gateMode: "advisory",
        prompt:
          "Advisory check: decide whether this lead should continue to enrichment. Continue for plausible fit, but record any concerns, missing data, or reasons the lead may be low priority.",
      },
    },
    {
      id: "enrich-lead",
      kind: "prompt",
      column: "enrichment",
      config: {
        name: "Enrich lead",
        executor: "model",
        prompt:
          "Enrich the qualified lead with company context and contact data. Add verified company details, relevant news or initiatives, likely stakeholders, contact name, contact email or profile URL, and personalization hooks for outreach.",
      },
    },
    {
      id: "draft-outreach",
      kind: "prompt",
      column: "outreach",
      config: {
        name: "Draft and send outreach",
        executor: "model",
        prompt:
          "Draft concise personalized outreach for the enriched lead. Reference the strongest trigger or pain evidence, state the proposed value clearly, choose a low-friction call to action, and record the sent or ready-to-send message plus follow-up timing.",
      },
    },
    { id: "end", kind: "end", column: "converted" },
  ],
  edges: [
    { from: "start", to: "source-prospects" },
    { from: "source-prospects", to: "qualify-lead", condition: "success" },
    { from: "qualify-lead", to: "qualification-gate", condition: "success" },
    { from: "qualification-gate", to: "enrich-lead", condition: "success" },
    { from: "enrich-lead", to: "draft-outreach", condition: "success" },
    { from: "draft-outreach", to: "end", condition: "success" },
  ],
  settings: BUILTIN_WORKFLOW_SETTINGS,
};

export const BUILTIN_LEAD_GENERATION_WORKFLOW_IR = parseWorkflowIr(
  RAW_BUILTIN_LEAD_GENERATION_WORKFLOW_IR,
);
