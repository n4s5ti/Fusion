---
title: "refactor: Make workflow steps fully graph-native and remove the legacy workflow-step system"
status: active
date: 2026-06-25
type: refactor
depth: deep
---

# refactor: Make workflow steps fully graph-native and remove the legacy workflow-step system

## Summary

Workflow quality-gate steps (e.g. `browser-verification`, `code-review`) currently live in two half-connected worlds. The **new** world runs them as `optional-group` prompt/gate nodes inside the workflow graph (`builtin:coding` already replaced its legacy `workflow-step` seam node with optional-group nodes). The **old** world — `runWorkflowSteps()` in `packages/engine/src/executor.ts`, the `workflow_steps` DB table, the `WORKFLOW_STEP_TEMPLATES` catalog, the `/api/workflow-steps` REST surface, and the `task.workflowStepResults` blob — is the only thing that ever *records* per-step status and emits `[pre-merge] Workflow step …` logs. The result is the FN-7039 failure class: an enabled step can be silently downgraded to a legacy `WS-xxx` id the graph never matches (so it never runs), and even the steps that *do* run via the graph leave `workflowStepResults` null, so the unified progress bar shows nothing.

This plan makes workflow steps run **entirely** through the graph machinery end-to-end, records their outcomes in a graph-native run-result model that the progress bar and Workflow tab read, emits proper logs, deletes the entire legacy workflow-step subsystem, and migrates existing projects' legacy steps into the graph.

**Reproduction of record:** FN-7039 — `enabledWorkflowSteps: ["code-review", "WS-004"]`; `code-review` ran via the graph optional-group (verdict `REVISE`, advisory) but recorded no `workflowStepResults`; `WS-004` (the materialized `browser-verification` row) never ran because the graph checks `includes("browser-verification")`. `task.workflowStepResults` is null.

---

## Problem Frame

Three defects, one subsystem:

1. **Enabled steps silently don't run (storage/namespace).** `Store.optionalGroupIdSet()` (`packages/core/src/store.ts:4358`) returns an **empty set** when a task has no explicit `workflowId` *and* the project has no `defaultWorkflowId`. With an empty set, `resolveEnabledWorkflowSteps()` (`store.ts:4366`) does not recognize a built-in group id like `browser-verification`, hits the template-collision branch, and materializes it into a legacy `workflow_steps` row id (`WS-004`). The authoritative graph executor resolves the unselected task to `builtin:coding` and checks `enabledWorkflowSteps.includes(node.id)` (`packages/engine/src/workflow-graph-executor.ts:490`) — `"WS-004" !== "browser-verification"` → the group is bypassed. (Existing learning: `docs/solutions/logic-errors/optional-group-toggle-id-remapped-by-step-materializer.md`.)

2. **Graph steps record nothing (visibility).** Optional-group prompt/gate nodes run via the graph but never write `task.workflowStepResults` — every `workflowStepResults` write is inside the legacy `runWorkflowSteps()` (`executor.ts:12878-13171`). `getUnifiedTaskProgress()` (`packages/dashboard/app/utils/taskProgress.ts:56-88`) keys off `workflowStepResults` + `enabledWorkflowSteps`, so graph-run steps never show status, and per-step `[pre-merge]` logs are never emitted on the graph path.

3. **Two parallel systems (architecture debt).** The legacy `workflow_steps` table, `WORKFLOW_STEP_TEMPLATES`, `/api/workflow-steps`, the Settings management surface, and `runWorkflowSteps()` duplicate what graph nodes now express. Keeping both is the root cause of the id-namespace collision and the visibility gap.

**Goal:** one system. Graph nodes execute, record results in a graph-native model, emit logs, and drive the progress bar. The legacy subsystem is deleted, with a migration carrying existing data forward.

---

## Scope Boundaries

**In scope**
- Fix the `optionalGroupIdSet` root-cause fallback and the create-time UI `?? null` fallback.
- A graph-native per-node workflow-step result model that the dashboard reads.
- Logs + verdict capture for graph-run workflow steps (parity with legacy `[pre-merge]` entries).
- Removal of: `runWorkflowSteps()` and the `workflow-step` seam primitive; the `workflow_steps` table and its store methods; `WORKFLOW_STEP_TEMPLATES` (inlined into IR builders); `/api/workflow-steps*` REST routes + API client fns; the Settings → Workflow Steps management UI.
- DB migration 130 backfilling legacy data into the graph (custom steps auto-injected as optional-group nodes) and dropping `workflow_steps`.
- Make the graph executor unconditional for workflow-step execution (retire the flag-off / legacy `execute()` step branch).

**Out of scope (non-goals)**
- Redesigning workflow IR concepts, the `foreach`/step-inversion model, merge/branch-group lifecycle, or the brand rename.
- Changing how implementation `Task.steps[]` are parsed/executed.

### Deferred to Follow-Up Work
- Consolidating `workflow_run_step_instances` (foreach) and the new node-result model into one run-event store, if a unified run-history view is later desired.
- A migration-time UI surfacing "these custom steps were converted to optional-group nodes" beyond a log/audit entry.

---

## Key Technical Decisions

### KTD-1. Results live in a graph-native node-result model, not `workflow_run_step_instances` and not the legacy `workflowStepResults` blob
The chosen direction was "move to the new run model." Research showed `workflow_run_step_instances` (`db.ts:660-675`, type `types.ts:833-875`) is **foreach-specific** — keyed by `(taskId, runId, foreachNodeId, stepIndex)` with statuses `pending|in-progress|awaiting-integration|completed|failed`. Quality-gate optional-group/gate nodes do not fit that key. So we add a **sibling** persisted model, `workflow_run_node_results`, keyed by `(taskId, runId, nodeId)`, capturing `nodeId`, `name`, `phase`, `status` (`pending|passed|failed|advisory_failure|skipped`), `verdict` (`APPROVE|APPROVE_WITH_NOTES|REVISE`), `notes`, `output`, `startedAt`, `completedAt`, `model`. This is the literal honoring of "new run model" intent while respecting the discovered constraint that `workflow_run_step_instances` is purpose-built for foreach. The dashboard reads a projection of the latest run's node results (see KTD-3).
> **Re-confirm flag:** this is the one decision that diverges from the literal "use `workflow_run_step_instances`" answer, because that table is foreach-shaped. If a single unified run table is strongly preferred, the alternative is generalizing `workflow_run_step_instances`' PK — larger blast radius, riskier resume semantics. Recommended: the sibling table. (See Open Questions.)

### KTD-2. The graph executor is the only execution path; legacy `runWorkflowSteps` is deleted
`builtin:coding` already routes workflow steps through optional-group nodes (`builtin-coding-workflow-ir.ts:31` — "REPLACING the legacy `workflow-step` seam node"). The `workflow-step` seam primitive (`runtime-primitives.ts:182`, dispatched at `workflow-node-handlers.ts:264-267,355-363`) and `runWorkflowSteps()` are transitional. Per the workflow-native-runtime-primitives learning, the production path must not re-enter a monolithic lifecycle. We delete `runWorkflowSteps()`, the `workflow-step` seam handler + primitive, and the dead legacy `execute()` step calls (`executor.ts:8220/9050/9326`, proven unreachable behind `maybeExecuteWorkflowGraph` early-return at `executor.ts:7381-7384`), and rework the live watchdog caller (`executor.ts:3720`) to re-enter the graph.

### KTD-3. Progress + Workflow tab read graph node-results, projected by `enabledWorkflowSteps`
`getUnifiedTaskProgress()` continues to merge `Task.steps[]` + workflow checks, but the workflow-check source becomes the new node-result projection (latest run) rather than `task.workflowStepResults`. Name resolution stops depending on `workflowStepNameLookup` built from deleted DB rows (`App.tsx:796`); names come from the node-result row (`name`) / the workflow IR optional-group config. This removes the dependency on the legacy `/api/workflow-steps` fetch entirely.

### KTD-4. Delete `WORKFLOW_STEP_TEMPLATES`; inline content into IR builders; keep plugin step-templates as an optional-group palette source
`WORKFLOW_STEP_TEMPLATES` (`types.ts:912-1193`) feeds the IR builders (`builtin-browser-verification-group.ts:29`, `builtin-code-review-group.ts:27`) which pull `name/description/prompt/toolMode/gateMode`. We inline those literals into the builders and delete the array + `WorkflowStepTemplate`-materialization helpers. **Plugin-contributed** step templates (`plugin-loader.ts:1196`, `setPluginWorkflowStepTemplates`) remain as a *palette* the editor and migration project into optional-group nodes — plugins keep contributing steps, but as graph nodes, never legacy rows.

### KTD-5. Migration 130 is one atomic change with a seed-at-previous-version test
Per the DB learnings: add `applyMigration(130, …)`, bump `SCHEMA_VERSION` 129→130 (`db.ts:165`), run the repo-root `toBe(129)` sweep (`grep -rn --exclude-dir=node_modules 'toBe(129)' .`), and write a **seed-at-129** test (seed real legacy `workflow_steps` rows + tasks with `WS-xxx` `enabledWorkflowSteps`, run `init()`, assert rows became optional-group nodes / enabled ids and the table is dropped). Migrated/injected optional-group ids must be **identity-stable** through the (simplified) resolver so the FN-7039 collision cannot recur.

### KTD-6. Identity-stable enable ids end-to-end
After removing the materializer, `resolveEnabledWorkflowSteps` must pass enable ids through unchanged (no template→`WS-xxx` remap). The migration generates optional-group node ids for custom steps that survive create AND update/toggle store paths and match `includes(node.id)` at the executor. Regression test uses a **colliding** id and round-trips through the store, not just the executor (per the existing solution doc).

---

## High-Level Technical Design

### Target execution + recording flow (per task run)

```mermaid
flowchart TD
  A[Graph executor runs builtin/custom workflow IR] --> B{node kind}
  B -->|optional-group enabled?| C[runOptionalGroup -> inner prompt/gate node]
  B -->|prompt/gate gate node| D[run gate node]
  C --> E[record node-result row\n(taskId, runId, nodeId, status, verdict, notes, model, timings)]
  D --> E
  E --> F[logEntry '[pre-merge] Workflow step <name> ...']
  E --> G[Task.steps[] projection unaffected; node-results projected to UI by enabledWorkflowSteps]
  C -->|disabled| H[pass-through byte-inert, no row]
  E --> I[advisory failure -> non-blocking; gate failure -> remediation/merge-block]
```

### Before → after data sources

| Concern | Before (legacy) | After (graph-native) |
|---|---|---|
| Execution | `runWorkflowSteps()` over `enabledWorkflowSteps` | graph optional-group / gate nodes only |
| Result store | `task.workflowStepResults` (written only by legacy) | `workflow_run_node_results` (written by graph) |
| Step definitions | `workflow_steps` table + `WORKFLOW_STEP_TEMPLATES` | inlined in IR builders + plugin palette → optional-group nodes |
| Progress source | `workflowStepResults` + `workflowStepNameLookup` (DB rows) | node-result projection + IR config names |
| Management UI/API | Settings → Workflow Steps, `/api/workflow-steps*` | removed (create-time optional-step toggles remain) |

---

## Implementation Units

### U1. Fix the root-cause id downgrade and the create-time UI fallback
**Goal:** Stop enabled built-in group ids from being downgraded to legacy `WS-xxx` ids, and make `builtin:coding` optional steps visible at create time even with no project default workflow. This is the smallest correct fix for the FN-7039 "never ran" symptom and is safe to land first.
**Requirements:** Problem Frame #1.
**Dependencies:** none.
**Files:**
- `packages/core/src/store.ts` — `optionalGroupIdSet()` (~4358).
- `packages/dashboard/app/components/QuickEntryBox.tsx` (~263) and `packages/dashboard/app/components/TaskForm.tsx` (~329) — `effectiveOptionalWorkflowId` fallback.
- `packages/core/src/__tests__/workflow-selection-store.test.ts` (extend).
- `packages/dashboard/app/components/__tests__/QuickEntryBox.test.tsx`, `.../TaskForm.test.tsx` (extend).
**Approach:** `optionalGroupIdSet` falls back to `workflowId ?? getDefaultWorkflowId() ?? "builtin:coding"` (mirroring `store.ts:4492`) instead of returning an empty set, so the collision guard recognizes `browser-verification`/`code-review`. In both create UIs, change the `?? null` tail to resolve `builtin:coding` when no explicit/default workflow, so optional toggles render. Keep explicit `workflowId === null` (opt-out) behavior.
**Patterns to follow:** existing `?? "builtin:coding"` resolution at `store.ts:4492`; the FNXC collision-guard comment at `store.ts:4352`.
**Execution note:** Start with a failing store regression test using a colliding id (`browser-verification`) round-tripped through create AND update.
**Test scenarios:**
- Covers the original symptom. Create a task with no `workflowId`, no project `defaultWorkflowId`, `enabledWorkflowSteps: ["browser-verification"]`; assert stored `enabledWorkflowSteps` contains the raw `browser-verification` (not `WS-xxx`) after `getTask` and a store reopen.
- `updateTask({enabledWorkflowSteps:["code-review","browser-verification"]})` on an unselected task → both ids survive unchanged.
- Project with a custom default workflow lacking optional groups → ids not spuriously rewritten; `builtin:coding` fallback not applied when a default exists.
- QuickEntryBox/TaskForm: with no default workflow, `builtin:coding` optional steps render and toggle into the create payload; `workflowId === null` still shows none.

### U2. Add the graph-native node-result model and persist it from the graph executor
**Goal:** Record every executed workflow-step graph node (optional-group inner prompt/gate, and pre-merge gate nodes) with status/verdict/notes/timings/model, and emit `[pre-merge] Workflow step …` logs at parity with the legacy path.
**Requirements:** Problem Frame #2; KTD-1, KTD-2.
**Dependencies:** U1 (correct enable ids) — not strictly required but ordered first.
**Files:**
- `packages/core/src/db.ts` — new `workflow_run_node_results` table in `SCHEMA_SQL` + the migration (migration body lands in U7; the table DDL/constant defined here).
- `packages/core/src/types.ts` — `WorkflowRunNodeResult` type + status/verdict unions (reuse existing verdict union from `WorkflowStepResult` shape at `types.ts:797-822`).
- `packages/core/src/store.ts` — `saveWorkflowRunNodeResult`, `loadWorkflowRunNodeResults(taskId, runId?)`, `clearWorkflowRunNodeResults` (mirror `saveWorkflowRunStepInstance` at `store.ts:6071-6158`).
- `packages/engine/src/workflow-graph-loop.ts` (`runOptionalGroup`) and `packages/engine/src/executor.ts` `runGraphCustomNode` (~6223-6536) / the prompt+gate node handlers — write a node-result row on start (`pending`) and completion (terminal status + verdict).
- `packages/engine/src/executor.ts` — extract the `[pre-merge] Workflow step …` / "using model" log shapes (currently `13591`, `13067`, `13088`, `13120`, `13156`, `13066`/`13085`/`13117`) into a small shared helper reused by the graph path.
- Tests: `packages/engine/src/__tests__/` graph executor + a new node-result store round-trip test in `packages/core/src/__tests__/`.
**Approach:** Reuse the prompt-step verdict parsing already used by optional-group prompt nodes; map `APPROVE/APPROVE_WITH_NOTES`→`passed`, `REVISE`→`advisory_failure` (advisory) or `failed` (gate), `malformed gate`→`failed`. Persist keyed by `(taskId, runId, nodeId)`; upsert so reruns/rework overwrite the same row. Do **not** add a new `Task` field for results — read via the store projection (avoids the six-edit-site `rowToTask` trap; per learnings).
**Patterns to follow:** `saveWorkflowRunStepInstance`/`loadWorkflowRunStepInstances` (`store.ts:6071-6158`); verdict mapping in `taskProgress.ts:mapWorkflowStatus`; advisory-vs-gate semantics in `docs/workflow-steps.md`.
**Test scenarios:**
- Optional-group enabled prompt node returns `{"verdict":"APPROVE"}` → one node-result row `passed`, `[pre-merge] Workflow step '<name>' completed` log, "using model" log present.
- `REVISE` on an advisory group → `advisory_failure`, non-blocking, run continues to merge.
- `REVISE` on a gate group → `failed`, blocks per remediation flow.
- Disabled optional-group → no row written (byte-inert pass-through).
- Rerun/rework of same node → row upserted, not duplicated.
- Store round-trip: rows survive `loadWorkflowRunNodeResults` and a full store reopen.
- Covers FN-7039: a run with `code-review` enabled records a `code-review` node-result with the reviewer verdict.

### U3. Wire the unified progress bar + Workflow tab to graph node-results
**Goal:** Enabled workflow steps appear in the step counter / progress bar and flip to done/failed from graph execution; the Workflow tab renders graph node-results.
**Requirements:** Problem Frame #2; KTD-3.
**Dependencies:** U2.
**Files:**
- `packages/dashboard/app/utils/taskProgress.ts` — `getUnifiedTaskProgress` reads the node-result projection instead of `task.workflowStepResults`; drop reliance on `workflowStepNameLookup`.
- API: a read route/field exposing latest-run node-results per task (extend the task detail payload or add to `register-workflow-routes.ts`); `packages/dashboard/app/api/*` client.
- `packages/dashboard/app/App.tsx` (~774-799) — remove the `fetchWorkflowSteps`→`workflowStepNameLookup` plumbing; update prop threading through `MainContent`/`RightDock`/`Board`/`Lane`/`WorktreeGroup`/`TaskCard` (lines per research).
- `packages/dashboard/app/components/WorkflowResultsTab.tsx` — read graph node-results (status/verdict/output/timing); remove the embedded legacy step picker.
- `packages/dashboard/app/components/TaskCard.tsx` (~1074), `ListView.tsx` (~21) — adjust call sites.
- Tests: `packages/dashboard/app/utils/__tests__/taskProgress.test.ts`, `WorkflowResultsTab.test.tsx`, `TaskCard` progress tests.
**Approach:** Provide node-results on the task payload the dashboard already fetches so the progress bar needs no extra round-trip. Status mapping mirrors `mapWorkflowStatus`. Names come from the node-result `name` / IR config; delete `workflowStepNameLookup`.
**Patterns to follow:** existing `getUnifiedTaskProgress` merge shape; `WorkflowResultsTab` render of status/verdict/timing (`:701-879`).
**Test scenarios:**
- Task with 6 impl steps + 2 enabled workflow steps, one `passed` one `advisory_failure` → progress shows 8 items, counts/labels correct, desktop + mobile breakpoints.
- Enabled-but-not-yet-run step → `pending` row visible (not hidden).
- Empty/none enabled → only impl steps; no crash when node-results absent.
- Workflow tab renders verdict + notes + output + timing from graph results; no reference to deleted `workflowStepResults`.
- Covers AE (FN-7039): both `code-review` and `browser-verification` appear and reflect real run status.

### U4. Delete the legacy execution path and rework live callers
**Goal:** Remove `runWorkflowSteps()`, the `workflow-step` seam primitive/handler, and all `task.workflowStepResults` writes; make the graph the sole executor.
**Requirements:** Problem Frame #3; KTD-2.
**Dependencies:** U2, U3 (graph recording + UI must be live first).
**Files:**
- `packages/engine/src/executor.ts` — delete `runWorkflowSteps()` (`12873-13171`); delete dead calls at `8220/9050/9326`; rework the watchdog caller `recoverCompletedTask` (`3720`) to re-enter the graph; delete the primitive `runWorkflowStep` handler (`5388-5450`) and seam `workflowStep` handler (`5560-5611`).
- `packages/engine/src/runtime-primitives.ts` — remove `runWorkflowStep` from `RuntimePrimitiveName`/interface (`17`, `182-186`).
- `packages/engine/src/workflow-node-handlers.ts` — remove `workflow-step` seam dispatch (`264-267`, `355-363`) and the `workflowStep` legacy-seam field (`29`).
- `packages/core/src/store.ts` — remove the `workflowStepResults` update path (`8041`) and field plumbing; `packages/core/src/types.ts` retire `WorkflowStepResult` (or keep as deprecated alias only if still imported by retained code — verify task-merge.ts:177 `NON_TERMINAL_WORKFLOW_STATUSES`, eval-signal-collector.ts:12).
- Tests: update/remove engine tests asserting `runWorkflowSteps`/`workflowStepResults`; the reliability backstop `packages/engine/src/__tests__/reliability-interactions/workflow-interpreter-cutover.test.ts`.
**Approach:** Confirm no production path falls through to the retained legacy seam adapters (per learnings #2/#6). Retire the `workflowGraphExecutor` flag-off / Default-workflow legacy step branch so the graph is unconditional. Watchdog recovery replays via the graph runtime, not `runWorkflowSteps`.
**Patterns to follow:** `maybeExecuteWorkflowGraph` early-return contract (`executor.ts:7381-7384`); workflow-native primitives doc.
**Test scenarios:**
- Completed-task watchdog recovery re-runs pending workflow steps via the graph and records node-results (no `runWorkflowSteps`).
- A workflow whose IR previously used a `workflow-step` seam node now fails closed or is migrated (see U6/U7) — assert no silent no-op.
- Grep-guard test: no remaining `workflowStepResults` writer in engine.
- Reliability invariants preserved: file-scope enforcement, `autoMerge:false` terminal-until-merged, `moveTask(in-progress→todo)` hard-cancel still hold.

### U5. Remove the legacy `workflow_steps` store surface, REST routes, and management UI
**Goal:** Delete the CRUD/management surface for legacy workflow steps.
**Requirements:** Problem Frame #3.
**Dependencies:** U7 (migration must consume the table before the store methods/DDL are removed) — land removal of store methods/table after the migration backfill; routes/UI can be removed alongside U3.
**Files:**
- `packages/core/src/store.ts` — remove `createWorkflowStep` (`14522`), `listWorkflowSteps` (`14647`), `getWorkflowStep` (`14683`), `updateWorkflowStep` (`14749`), `deleteWorkflowStep` (`14867`), `ensureWorkflowStepForTemplate` (`4320`), `getBuiltInWorkflowTemplate` (`4220`), `toBuiltInWorkflowStep` (`4224`), `applyLegacyWorkflowStepOverrides` (`4300`), `getLegacyWorkflowStepSnapshot` (`4284`); simplify `resolveEnabledWorkflowSteps` (`4366`) to a pass-through (KTD-6).
- `packages/dashboard/src/routes.ts` — remove `/api/workflow-steps` GET/POST/PATCH/DELETE/refine (`2896-3217`) and `/api/workflow-step-templates/:id/create` (`3248`); keep `GET /api/workflow-step-templates` only if still needed as the plugin palette (see U6).
- `packages/dashboard/app/api/legacy.ts` — remove client fns (`5219-5250`, `5612-5614`).
- Dashboard: remove the Settings → Workflow Steps manager component(s) + the template chooser; clean orphaned imports, buttons, aria-labels (Surface Enumeration — both desktop and mobile).
- Tests: remove `packages/dashboard/src/__tests__/routes-agents.test.ts` workflow-step suites (`314-1933`); update SettingsModal tests.
**Approach:** Audit every registration/construction site together (learnings #6) and prove wiring on real prototypes, not mocks. The create-time optional-step toggle (backed by `resolveWorkflowOptionalSteps` / `register-workflow-routes.ts`) stays.
**Test scenarios:**
- `/api/workflow-steps*` routes return 404 / are absent; no client references remain.
- Settings has no Workflow Steps manager; no empty shells/dangling aria-labels (desktop + mobile).
- Create-time optional-step toggles still work (regression).
- `Test expectation: none` for pure deletions with coverage already asserted by the absence tests above.

### U6. Delete `WORKFLOW_STEP_TEMPLATES`; inline into IR builders; preserve plugin palette
**Goal:** Remove the legacy catalog and make IR builders self-contained, while plugin-contributed steps remain available as optional-group nodes.
**Requirements:** KTD-4.
**Dependencies:** U5 (no store materializer left to consume templates).
**Files:**
- `packages/core/src/types.ts` — delete `WORKFLOW_STEP_TEMPLATES` (`912-1193`); retire/keep-as-internal `WorkflowStepTemplate` only for the plugin palette projection.
- `packages/core/src/builtin-browser-verification-group.ts`, `builtin-code-review-group.ts` — inline `name/description/prompt/toolMode/gateMode` literals (remove the `WORKFLOW_STEP_TEMPLATES.find` lookups at `:29`/`:27`).
- `packages/core/src/index.ts` — remove `WORKFLOW_STEP_TEMPLATES` export.
- `packages/core/src/plugin-loader.ts` (`1196`) + `setPluginWorkflowStepTemplates`/`resolvePluginWorkflowStep` (`store.ts:14607/14612`) — repoint to feed the optional-group palette / editor `stepTemplateToNode` (`WorkflowNodeEditor.tsx:284`) instead of legacy row materialization.
- `packages/dashboard/src/routes.ts` — `GET /api/workflow-step-templates` (`3225`) now serves only the palette (built-in inlined node descriptors + plugin templates) for the editor; or remove if the editor reads IR directly.
- Docs: `docs/PLUGIN_AUTHORING.md` (workflow step registration section).
- Tests: builtin IR fixture/parity tests; plugin-template palette tests.
**Approach:** Built-in optional-group nodes carry their own config (already true for `code-review`/`browser-verification` except the `.find`). Plugin steps project to optional-group node descriptors at edit/migrate time. Verify built-in IR remains byte-stable except the inlined literals (parity oracle).
**Test scenarios:**
- `builtin:coding` / `builtin:stepwise-coding` IR still validates and produces identical optional-group nodes after inlining.
- A plugin-contributed step appears in the editor palette and can be added as an optional-group node.
- No remaining import of `WORKFLOW_STEP_TEMPLATES` anywhere (grep guard).

### U7. Migration 130 — backfill legacy steps into the graph and drop `workflow_steps`
**Goal:** Existing projects with legacy `workflow_steps` rows and tasks with `WS-xxx` `enabledWorkflowSteps` move into the graph; custom steps become optional-group nodes; the table is dropped.
**Requirements:** KTD-5, KTD-6; user requirement "old projects should migrate."
**Dependencies:** U6 (IR builders self-contained) for built-in mapping; runs before U5's table/store removal at runtime ordering.
**Files:**
- `packages/core/src/db.ts` — `applyMigration(130, …)` (`5401` pattern; latest is 129 at `5337`); bump `SCHEMA_VERSION` 129→130 (`165`); update `db-migrate.ts` rebuild INSERT / `MIGRATION_ONLY_TABLE_SCHEMAS` as applicable.
- `packages/core/src/workflow-ir.ts` / `workflow-ir-types.ts` — reuse `validateOptionalGroup` (`611`) and `WorkflowOptionalGroupConfig` (`177-186`) to author injected nodes; node ids via a stable scheme (not `Date.now()`-based `newNodeId` — migrations must be deterministic).
- Tests: a **seed-at-129** migration test in `packages/core/src/__tests__/` (seed legacy rows + `WS-xxx` enable ids, run `init()`, assert conversion + table dropped + ids identity-stable through resolver).
**Approach:** For each task with `WS-xxx` `enabledWorkflowSteps`: map to the corresponding optional-group node id where a built-in/optional-group equivalent exists (`browser-verification`, `code-review`, …); for **custom** rows with no equivalent, inject an optional-group node (carrying the row's `name/prompt/toolMode/gateMode/phase`) into the affected workflow(s) and rewrite the task's enable id to that node id. Migrated ids must survive `resolveEnabledWorkflowSteps` unchanged. Then `DROP TABLE workflow_steps`. Deterministic node ids (e.g. `migrated-<slug>-<rowId>`).
**Patterns to follow:** prior migrations (`db.ts:5282-5339`); `optional-group` validation (`workflow-ir.ts:611`); identity-stability requirement from the existing solution doc.
**Execution note:** Seed-at-previous-version test first — fresh-DB tests cannot catch a skipped-on-upgrade migration.
**Test scenarios:**
- Seed at 129 with a built-in legacy row (`browser-verification`) enabled on a task → after `init()`, task enable id is `browser-verification` (group node id), table dropped.
- Seed with a **custom** row ("QA Gate", prompt) enabled → an optional-group node injected into the project's affected workflow; task enable id points to it; it runs and records a node-result.
- Colliding id round-trips through create + update without remap (regression for the original bug).
- `SCHEMA_VERSION === 130`; repo-root `toBe(129)` sweep clean (incl. plugin workspaces).
- Idempotency: running `init()` twice does not double-inject nodes.

### U8. Docs, changeset, and learning capture
**Goal:** Update user/dev docs and ship metadata.
**Requirements:** AGENTS.md finalize rules.
**Dependencies:** U1-U7.
**Files:**
- `docs/workflow-steps.md` — rewrite the legacy "Workflow Step APIs / templates / runWorkflowSteps revision loop" sections to the graph-native model; document migration behavior.
- `docs/settings-reference.md` — remove legacy workflow-step settings references.
- `.changeset/<name>.md` — `"@runfusion/fusion": minor` (new behavior + migration), labeled `summary`/`category: feature`/`dev` per AGENTS.md.
- `AGENTS.md` lazy-view inventory if any listed view is removed (verify SettingsModal still listed).
- `docs/solutions/…` — capture the removal/cutover learning post-merge via `/ce-compound` (none exists for legacy-path removal).
**Test scenarios:** `Test expectation: none — docs/changeset.` Verify `pnpm check:changesets` passes.

---

## System-Wide Impact

- **Engine:** sole execution path becomes the graph; watchdog recovery reworked; reliability invariants must be re-verified (file-scope, `autoMerge:false`, hard-cancel).
- **Core/DB:** schema migration + table drop; `SCHEMA_VERSION` bump touches plugin workspaces (version sweep).
- **Dashboard:** progress bar / Workflow tab data source swap; deletion of Settings management UI and `/api/workflow-steps*`.
- **Plugins:** workflow-step templates keep working but as optional-group palette entries; `docs/PLUGIN_AUTHORING.md` updates.
- **Operators:** existing per-task step selections preserved via migration; create-time optional toggles now show for `builtin:coding` even with no default workflow.

---

## Risks & Mitigations

- **Migration data loss / id drift (high).** Mitigate with seed-at-129 tests, deterministic node ids, idempotency test, identity-stability regression with a colliding id.
- **Hidden legacy fall-through (high).** A retained seam adapter or fake-store test path silently runs legacy code. Mitigate: grep guards for `runWorkflowSteps`/`workflowStepResults` writers; assert real wiring on prototypes, not mocks (learnings #6); audit all `runWorkflowSteps` callers (the 3 live ones) are reworked.
- **Foreach vs gate result conflation (medium).** Keep `workflow_run_step_instances` (foreach) and `workflow_run_node_results` (gates) separate (KTD-1).
- **Surface-enumeration regressions on the progress bar / removed UI (medium).** Per FN-5893: test desktop + mobile, empty/single/multi/enabled-disabled states, fresh-DB vs upgraded-DB, and removed-affordance cleanup.
- **Plugin breakage (medium).** Preserve plugin palette projection; test a plugin-contributed step end-to-end.

---

## Surface Enumeration

- **Execution producers:** graph optional-group nodes, graph gate/prompt nodes, watchdog recovery, (removed) `runWorkflowSteps`, (removed) `workflow-step` seam primitive.
- **Result sources:** new `workflow_run_node_results`, (removed) `task.workflowStepResults`, foreach `workflow_run_step_instances` (unchanged).
- **Display surfaces:** TaskCard progress (desktop + mobile), ListView/Board/Lane/WorktreeGroup, Workflow tab, dependency-graph plugin node progress.
- **Data states:** zero/one/many impl steps; zero/one/many enabled workflow steps; enabled-not-run (pending), passed, advisory_failure, failed, skipped.
- **DB states:** fresh DB (130) vs upgraded DB (seed 129 → 130); built-in vs custom legacy rows; plugin-contributed steps.
- **Workflow modes:** `builtin:coding`, `builtin:stepwise-coding`, custom workflows with/without optional groups; previously-`workflow-step`-seam workflows.

---

## Symptom Verification (FN-5893)

- **Original symptom:** A task created with `browser-verification` enabled (no project default workflow) is marked done without the step running, and enabled workflow steps don't appear in the progress bar (FN-7039: `enabledWorkflowSteps: ["code-review","WS-004"]`, `workflowStepResults` null).
- **Exact reproduction:** Create a task with no `workflowId`, no project `defaultWorkflowId`, `enabledWorkflowSteps: ["browser-verification"]`; run it through the executor; inspect stored enable ids, execution logs, node-results, and the unified progress model.
- **Assertion it is gone:** Stored enable id stays `browser-verification` (not `WS-xxx`); the graph runs the step; a `workflow_run_node_results` row is recorded with a terminal status; a `[pre-merge] Workflow step …` log is emitted; `getUnifiedTaskProgress` includes the step with the recorded status across desktop + mobile.

---

## Open Questions

- **OQ-1 (KTD-1 re-confirm):** Use a sibling `workflow_run_node_results` table (recommended) vs. generalizing `workflow_run_step_instances`' foreach-shaped PK to also hold gate results? The sibling table is lower-risk; the literal answer was "use the run-step-instances model." Defaulting to the sibling table unless redirected.
- **OQ-2 (deferred to implementation):** Whether `GET /api/workflow-step-templates` is fully removable (editor reads IR directly) or must remain as the plugin palette endpoint — resolve when wiring U6.

---

## Sources & Research

- Codebase: `store.ts` (`optionalGroupIdSet`/`resolveEnabledWorkflowSteps` `4358-4402`, run-step-instance methods `6071-6158`, workflow-step store methods `14522-14867`), `executor.ts` (`runWorkflowSteps` `12873-13171`, seam/primitive `5388-5611`, reachability `7381-7384`, call sites `3720/5402/5569/8220/9050/9326`), `workflow-graph-executor.ts:490`, `db.ts` (`workflow_run_step_instances` `660-675`, `SCHEMA_VERSION` `165`, migrations `5282-5401`), `types.ts` (`WorkflowStepResult` `797-822`, `WORKFLOW_STEP_TEMPLATES` `912-1193`, run-step-instance `833-875`), `taskProgress.ts:56-88`, `App.tsx:774-799`, `WorkflowResultsTab.tsx`, builtin IR builders.
- Learnings: `docs/solutions/logic-errors/optional-group-toggle-id-remapped-by-step-materializer.md`, `docs/solutions/architecture-patterns/workflow-native-runtime-primitives.md`, `docs/solutions/database-issues/schema-version-constant-must-equal-highest-migration.md`, `.../test-failures/schema-version-sweep-must-include-plugin-workspaces.md`, `.../database-issues/task-field-silently-dropped-without-sqlite-column-mapping.md`, `.../integration-issues/branch-group-single-pr-synthetic-id-dead-wiring.md`.
- Docs: `docs/workflow-steps.md`, `docs/architecture.md`, `CONCEPTS.md` (Step instance).
