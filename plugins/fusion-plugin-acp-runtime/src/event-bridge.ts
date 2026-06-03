// Event bridge: translate ACP `session/update` notifications into Fusion's
// `AgentRuntime` callbacks (onText / onThinking / onToolStart / onToolEnd) so an
// ACP agent renders identically to existing runtimes.
//
// Scope (U4): mapping only. Output BYTE bounds + string sanitization are U6 — no
// caps are applied here. Permission requests are U5.
//
// Design notes:
// - Tolerant: every field except the `sessionUpdate` discriminator and
//   `toolCallId` is optional/partial. The handler NEVER throws on a malformed or
//   partial update; unknown/forward-compat tags are ignored silently.
// - Tool start/end correlation: a `tool_call` records `{ title, kind }` keyed by
//   `toolCallId`; a later `tool_call_update` carries that metadata forward when
//   the update omits it, then fires `onToolEnd` once the status reaches a
//   terminal value (`completed` / `failed`).
// - Plans are FULL REPLACEMENTS: each `plan` (or `plan_update`) update replaces
//   the prior snapshot wholesale; we never accumulate across updates.

import type {
  SessionUpdate,
  ContentBlock,
  ToolKind,
  PlanEntry,
} from "@agentclientprotocol/sdk";
import type { AcpCallbacks } from "./types.js";
import { toolDisplayName, normalizeToolArgs } from "./tool-mapping.js";

/** Tracked metadata for an in-flight tool call, keyed by `toolCallId`. */
interface TrackedToolCall {
  title?: string | null;
  kind?: ToolKind | null;
  /** Whether onToolEnd has already fired (terminal status seen). */
  ended: boolean;
}

export interface EventBridge {
  /** Process one `session/update` payload (`params.update`). Never throws. */
  handleSessionUpdate(update: SessionUpdate): void;
  /** Clear per-turn correlation state (tool calls, plan snapshot, last text). */
  reset(): void;
}

/** Extract plain text from a `ContentBlock`, or `undefined` for non-text blocks. */
function extractText(content: ContentBlock | undefined): string | undefined {
  if (content && content.type === "text" && typeof content.text === "string") {
    return content.text;
  }
  return undefined;
}

/**
 * Repair the specific "sentence punctuation + capitalized next sentence" case
 * where an agent splits adjacent sentences across chunks without the separating
 * space. Mirrors the droid runtime's `normalizeStreamingDelta` — conservative so
 * code, domains, and lowercase continuations are left untouched.
 */
function normalizeStreamingDelta(previousText: string, nextDelta: string): string {
  if (!previousText || !nextDelta) return nextDelta;
  const previousChar = previousText.slice(-1);
  const nextChar = nextDelta[0] ?? "";
  if (/\s/.test(previousChar) || /\s/.test(nextChar)) return nextDelta;
  if (/[.!?]/.test(previousChar) && /[A-Z0-9"'([]/.test(nextChar)) {
    return ` ${nextDelta}`;
  }
  return nextDelta;
}

/** Format a plan snapshot into a single thinking/log line. */
function formatPlan(entries: PlanEntry[]): string {
  const lines = entries.map((entry) => {
    const status = typeof entry.status === "string" ? entry.status : "pending";
    const text = typeof entry.content === "string" ? entry.content : "";
    return `- [${status}] ${text}`;
  });
  return `Plan:\n${lines.join("\n")}`;
}

export function createEventBridge(callbacks: AcpCallbacks): EventBridge {
  // Start/end correlation across `tool_call` → `tool_call_update`.
  const toolCalls = new Map<string, TrackedToolCall>();
  // Running text/thinking accumulators for delta-space repair across chunks.
  let textSoFar = "";
  let thinkingSoFar = "";

  function reset(): void {
    toolCalls.clear();
    textSoFar = "";
    thinkingSoFar = "";
  }

  function emitText(content: ContentBlock | undefined): void {
    const raw = extractText(content);
    if (raw === undefined || raw === "") return;
    const delta = normalizeStreamingDelta(textSoFar, raw);
    textSoFar += delta;
    callbacks.onText?.(delta);
  }

  function emitThinking(content: ContentBlock | undefined): void {
    const raw = extractText(content);
    if (raw === undefined || raw === "") return;
    const delta = normalizeStreamingDelta(thinkingSoFar, raw);
    thinkingSoFar += delta;
    callbacks.onThinking?.(delta);
  }

  function handleToolCall(update: Extract<SessionUpdate, { sessionUpdate: "tool_call" }>): void {
    const id = update.toolCallId;
    if (typeof id !== "string" || id === "") return;
    toolCalls.set(id, { title: update.title, kind: update.kind, ended: false });
    const name = toolDisplayName({ title: update.title, kind: update.kind });
    callbacks.onToolStart?.(name, normalizeToolArgs(update.rawInput));
  }

  function handleToolCallUpdate(
    update: Extract<SessionUpdate, { sessionUpdate: "tool_call_update" }>,
  ): void {
    const id = update.toolCallId;
    if (typeof id !== "string" || id === "") return;
    const tracked = toolCalls.get(id) ?? { ended: false };
    // Carry forward title/kind from the prior `tool_call` when this update omits
    // them (a partial update may only set status/output).
    if (update.title != null) tracked.title = update.title;
    if (update.kind != null) tracked.kind = update.kind;
    toolCalls.set(id, tracked);

    const status = update.status;
    if (status !== "completed" && status !== "failed") {
      // Intermediate (pending/in_progress) — tracking updated, no callback.
      return;
    }
    if (tracked.ended) return; // already fired a terminal callback
    tracked.ended = true;
    const name = toolDisplayName({ title: tracked.title, kind: tracked.kind });
    callbacks.onToolEnd?.(name, status === "failed", update.rawOutput);
  }

  function handlePlan(entries: PlanEntry[] | undefined): void {
    // FULL REPLACEMENT: drop any prior snapshot, surface the new one once.
    const list = Array.isArray(entries) ? entries : [];
    callbacks.onThinking?.(formatPlan(list));
  }

  function handleSessionUpdate(update: SessionUpdate): void {
    if (!update || typeof update !== "object") return;
    try {
      switch (update.sessionUpdate) {
        case "agent_message_chunk":
          emitText(update.content);
          break;
        case "agent_thought_chunk":
          emitThinking(update.content);
          break;
        case "user_message_chunk":
          // Echo of user input — ignored in v1.
          break;
        case "tool_call":
          handleToolCall(update);
          break;
        case "tool_call_update":
          handleToolCallUpdate(update);
          break;
        case "plan":
          handlePlan(update.entries);
          break;
        case "plan_update":
          // Treat an incremental plan op as a plan refresh for v1.
          handlePlan((update as { entries?: PlanEntry[] }).entries);
          break;
        case "plan_removed":
          // Clearing the plan: surface nothing.
          break;
        case "available_commands_update":
        case "current_mode_update":
        case "config_option_update":
        case "session_info_update":
        case "usage_update":
          // Stored/ignored in v1 — no callback surface.
          break;
        default:
          // Unknown/forward-compat tag — ignore without throwing.
          break;
      }
    } catch {
      // Tolerant: a malformed/partial update must never break the stream.
    }
  }

  return { handleSessionUpdate, reset };
}
