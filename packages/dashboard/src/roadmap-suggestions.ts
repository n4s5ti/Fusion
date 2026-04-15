/**
 * Roadmap Milestone Suggestion Generation Service
 *
 * Provides AI-powered milestone suggestion generation for roadmaps.
 * Users can generate milestone ideas from a goal prompt and accept them
 * into their roadmap.
 *
 * Features:
 * - AI agent integration via dynamic import of @fusion/engine
 * - Planning-style JSON extraction with repair
 * - Input validation (goal prompt max length, count bounds)
 * - Read-only endpoint (no persistence of suggestions)
 * - Error mapping (validation 400, not found 404, AI/parser 500/503)
 */

import { randomUUID } from "node:crypto";

// Dynamic import for @fusion/engine to avoid resolution issues in test environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createKbAgent: any;

// Track if engine has been initialized (prevents multiple imports)
let engineInitialized = false;

// Flag to indicate if createKbAgent was explicitly set (even to undefined)
let createKbAgentExplicitlySet = false;

// Initialize the import (this runs in actual server, mocked in tests)
async function initEngine(): Promise<void> {
  if (engineInitialized) return;

  // If createKbAgent was explicitly set (even to undefined), don't try to import
  if (createKbAgentExplicitlySet) {
    engineInitialized = true;
    return;
  }

  if (!createKbAgent) {
    try {
      // Use dynamic import with variable to prevent static analysis
      const engineModule = "@fusion/engine";
      const engine = await import(/* @vite-ignore */ engineModule);
      createKbAgent = engine.createKbAgent;
    } catch {
      // Allow failure in test environments - agent functionality will be stubbed
      createKbAgent = undefined;
    }
  }
  engineInitialized = true;
}

// ── Types ───────────────────────────────────────────────────────────────────

/** Input for generating milestone suggestions */
export interface GenerateMilestoneSuggestionsInput {
  /** The goal prompt/description for the roadmap */
  goalPrompt: string;
  /** Number of milestones to generate (default 5, max 10) */
  count?: number;
}

/** A suggested milestone with title and optional description */
export interface MilestoneSuggestion {
  title: string;
  description?: string;
}

/** System prompt for milestone suggestion generation */
export const MILESTONE_SUGGESTION_SYSTEM_PROMPT = `You are a milestone planning assistant for a product roadmap system.

Your job is to suggest logical milestones that would help achieve a user's roadmap goal.

## Guidelines

1. **Think about phases**: Break the goal into logical phases (e.g., "Foundation", "Core Features", "Polish", "Launch")
2. **Use clear titles**: Milestone titles should be concise and descriptive (e.g., "Authentication System", "User Dashboard MVP")
3. **Add context**: Include a brief description explaining what this milestone encompasses
4. **Order matters**: List milestones in the order they should be completed
5. **Realistic scope**: Each milestone should be achievable in 2-4 weeks

## Output Format

Respond with ONLY a valid JSON array of milestone suggestions:

[
  {
    "title": "Milestone Title",
    "description": "Brief description of what this milestone covers (1-2 sentences)"
  },
  ...
]

Do NOT include any markdown formatting, code fences, or additional text. Only output the JSON array.`;

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum length for goal prompt */
const MAX_GOAL_PROMPT_LENGTH = 4000;

/** Default number of suggestions to generate */
const DEFAULT_SUGGESTION_COUNT = 5;

/** Maximum number of suggestions to generate */
const MAX_SUGGESTION_COUNT = 10;

/** Minimum number of suggestions to generate */
const MIN_SUGGESTION_COUNT = 1;

/** Max number of retry attempts when AI returns unparseable output */
const MAX_PARSE_RETRIES = 1;

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate the input for generating milestone suggestions.
 * Throws with a descriptive error message on validation failure.
 */
export function validateSuggestionInput(input: unknown): asserts input is GenerateMilestoneSuggestionsInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("Request body must be an object");
  }

  const { goalPrompt, count } = input as Record<string, unknown>;

  // Validate goalPrompt
  if (typeof goalPrompt !== "string" || !goalPrompt.trim()) {
    throw new ValidationError("goalPrompt is required and must be a non-empty string");
  }

  if (goalPrompt.length > MAX_GOAL_PROMPT_LENGTH) {
    throw new ValidationError(
      `goalPrompt exceeds maximum length of ${MAX_GOAL_PROMPT_LENGTH} characters`
    );
  }

  // Validate count (optional)
  if (count !== undefined) {
    if (typeof count !== "number" || !Number.isInteger(count)) {
      throw new ValidationError("count must be an integer");
    }

    if (count < MIN_SUGGESTION_COUNT || count > MAX_SUGGESTION_COUNT) {
      throw new ValidationError(
        `count must be between ${MIN_SUGGESTION_COUNT} and ${MAX_SUGGESTION_COUNT}`
      );
    }
  }
}

// ── JSON Extraction ────────────────────────────────────────────────────────

/**
 * Extract the best JSON candidate from AI response text.
 * Handles markdown-wrapped JSON, embedded JSON, and balanced brace extraction.
 */
function extractJsonCandidate(text: string): string | null {
  if (!text || !text.trim()) return null;

  // 1. Try markdown code blocks first (most reliable)
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch?.[1]) {
    const candidate = codeBlockMatch[1].trim();
    if (candidate.startsWith("[")) return candidate;
  }

  // 2. Find all top-level bracket-delimited arrays using balanced counting
  const candidates: Array<{ start: number; end: number; text: string }> = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "[") {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (ch === "[") depth++;
        if (ch === "]") depth--;
        if (depth === 0) {
          const candidate = text.slice(i, j + 1).trim();
          // Only accept candidates that parse as valid JSON
          try {
            JSON.parse(candidate);
            candidates.push({ start: i, end: j, text: candidate });
          } catch {
            // Not valid JSON, skip
          }
          break;
        }
      }
    }
  }

  // Pick the largest valid candidate (most likely the full response)
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.text.length - a.text.length);
    return candidates[0].text;
  }

  // 3. Last resort: try the full trimmed text
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) return trimmed;

  return null;
}

/**
 * Attempt to repair common JSON issues:
 * - Truncated JSON (missing closing brackets/braces)
 * - Trailing commas before closing brackets/braces
 * - Missing closing quotes
 */
function repairJson(text: string): string {
  let repaired = text;

  // Fix trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");

  // Count open/close braces and brackets
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;
  for (const ch of repaired) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "[") openBrackets++;
    if (ch === "]") openBrackets--;
  }

  // If we're in an unclosed string, close it
  if (inString) {
    repaired += '"';
  }

  // Re-count after potential string fix
  openBraces = 0;
  openBrackets = 0;
  inString = false;
  escape = false;
  for (const ch of repaired) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "[") openBrackets++;
    if (ch === "]") openBrackets--;
  }

  // Close unclosed brackets and braces
  repaired += "]".repeat(Math.max(0, openBrackets));
  repaired += "}".repeat(Math.max(0, openBraces));

  return repaired;
}

/**
 * Parse AI response JSON with robust extraction and recovery.
 */
function parseMilestoneSuggestions(text: string): MilestoneSuggestion[] {
  const candidate = extractJsonCandidate(text);

  if (!candidate) {
    throw new ParseError("AI returned no valid JSON. Please try again.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    // Attempt repair for truncated/malformed JSON
    try {
      const repaired = repairJson(candidate);
      parsed = JSON.parse(repaired);
    } catch (repairErr) {
      throw new ParseError(
        `Failed to parse AI response: ${repairErr instanceof Error ? repairErr.message : "Unknown error"}. Please try again.`
      );
    }
  }

  // Validate structure: must be an array
  if (!Array.isArray(parsed)) {
    throw new ParseError("AI response must be a JSON array of milestone suggestions");
  }

  // Validate and normalize each item
  const suggestions: MilestoneSuggestion[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object") {
      throw new ParseError(`Item ${i + 1} in AI response is invalid`);
    }

    const { title, description } = item as Record<string, unknown>;

    if (typeof title !== "string" || !title.trim()) {
      throw new ParseError(`Item ${i + 1} in AI response is missing a valid title`);
    }

    suggestions.push({
      title: title.trim(),
      description: typeof description === "string" && description.trim()
        ? description.trim()
        : undefined,
    });
  }

  if (suggestions.length === 0) {
    throw new ParseError("AI returned no milestone suggestions");
  }

  return suggestions;
}

// ── Generation ─────────────────────────────────────────────────────────────

/**
 * Generate milestone suggestions from a goal prompt.
 *
 * @param goalPrompt - The goal/description for the roadmap
 * @param count - Number of suggestions to generate (default 5, max 10)
 * @param rootDir - Project root directory for AI context
 * @param modelProvider - Optional AI model provider override
 * @param modelId - Optional AI model ID override
 * @returns Array of milestone suggestions
 */
export async function generateMilestoneSuggestions(
  goalPrompt: string,
  count: number = DEFAULT_SUGGESTION_COUNT,
  rootDir?: string,
  modelProvider?: string,
  modelId?: string,
): Promise<MilestoneSuggestion[]> {
  // Ensure engine is loaded before using createKbAgent
  await initEngine();

  if (!createKbAgent) {
    throw new ServiceUnavailableError("AI service is not available");
  }

  if (!rootDir) {
    throw new Error("rootDir is required for AI-powered suggestion generation");
  }

  // Create a unique session ID for this generation
  const sessionId = randomUUID();

  let agent: ReturnType<typeof createKbAgent> | undefined;

  try {
    // Create AI agent with milestone suggestion system prompt
    agent = await createKbAgent({
      cwd: rootDir,
      systemPrompt: MILESTONE_SUGGESTION_SYSTEM_PROMPT,
      tools: "readonly",
      ...(modelProvider && modelId
        ? {
            defaultProvider: modelProvider,
            defaultModelId: modelId,
          }
        : {}),
      onThinking: () => {
        // Ignore thinking output for milestone suggestions
      },
      onText: () => {
        // Ignore incremental text
      },
    });

    // Send the goal prompt with count instruction
    const userMessage = `Please suggest ${count} milestones for the following roadmap goal:\n\n${goalPrompt.trim()}`;

    // Get response from AI
    await agent.session.prompt(userMessage);

    // Extract response text from agent state
    interface AgentMessage {
      role: string;
      content?: string | Array<{ type: string; text: string }>;
    }
    const lastMessage = (agent.session.state.messages as AgentMessage[])
      .filter((m: AgentMessage) => m.role === "assistant")
      .pop();

    let responseText = "";
    if (lastMessage?.content) {
      if (typeof lastMessage.content === "string") {
        responseText = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        responseText = lastMessage.content
          .filter((c: { type: string; text: string }): c is { type: "text"; text: string } => c.type === "text")
          .map((c: { type: string; text: string }) => c.text)
          .join("");
      }
    }

    // Parse the JSON response with retry
    let suggestions: MilestoneSuggestion[] | undefined;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
      try {
        suggestions = parseMilestoneSuggestions(responseText);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < MAX_PARSE_RETRIES) {
          // Retry: ask the AI to reformat as clean JSON
          try {
            await agent.session.prompt(
              "Your previous response could not be parsed as JSON. " +
              "Please respond with ONLY a JSON array of milestone suggestions in this format: " +
              '[{"title": "Milestone Title", "description": "Brief description"}, ...]. ' +
              "No markdown, no explanation, just the JSON array."
            );

            // Get the new response text
            const retryMessage = (agent.session.state.messages as AgentMessage[])
              .filter((m: AgentMessage) => m.role === "assistant")
              .pop();

            let retryText = "";
            if (retryMessage?.content) {
              if (typeof retryMessage.content === "string") {
                retryText = retryMessage.content;
              } else if (Array.isArray(retryMessage.content)) {
                retryText = retryMessage.content
                  .filter((c: { type: string; text: string }): c is { type: "text"; text: string } => c.type === "text")
                  .map((c: { type: string; text: string }) => c.text)
                  .join("");
              }
            }
            responseText = retryText;
          } catch {
            // Retry prompt itself failed — give up
            break;
          }
        }
      }
    }

    if (!suggestions) {
      throw new ParseError(
        `Failed to parse AI response after ${MAX_PARSE_RETRIES + 1} attempts: ${lastError?.message || "Unknown error"}`
      );
    }

    // Limit to requested count
    return suggestions.slice(0, count);
  } finally {
    // Always dispose the agent session
    if (agent) {
      try {
        agent.session.dispose?.();
      } catch {
        // Ignore disposal errors
      }
    }
  }
}

// ── Custom Errors ───────────────────────────────────────────────────────────

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceUnavailableError";
  }
}

// ── Test Helpers ───────────────────────────────────────────────────────────

/**
 * Reset module state. Used for testing only.
 */
export function __resetSuggestionState(): void {
  createKbAgent = undefined;
  engineInitialized = false;
  createKbAgentExplicitlySet = false;
}

/**
 * Inject a mock createKbAgent function. Used for testing only.
 */
export function __setCreateKbAgent(mock: typeof createKbAgent): void {
  createKbAgent = mock;
  createKbAgentExplicitlySet = true;
}
