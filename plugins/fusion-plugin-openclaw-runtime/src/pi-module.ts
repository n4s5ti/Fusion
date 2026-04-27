import { randomUUID } from "node:crypto";
import type { GatewayCallbacks, GatewayConfig, GatewaySession } from "./types.js";

const DEFAULT_GATEWAY_URL = "http://127.0.0.1:18789";
const DEFAULT_AGENT_ID = "main";

interface ToolCallDelta {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface SseDeltaChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: ToolCallDelta[];
    };
  }>;
}

export function resolveGatewayConfig(settings?: Record<string, unknown>): GatewayConfig {
  const gatewayUrlSetting = typeof settings?.gatewayUrl === "string" ? settings.gatewayUrl : undefined;
  const gatewayTokenSetting = typeof settings?.gatewayToken === "string" ? settings.gatewayToken : undefined;
  const agentIdSetting = typeof settings?.agentId === "string" ? settings.agentId : undefined;

  const gatewayUrl =
    gatewayUrlSetting?.trim() || process.env.OPENCLAW_GATEWAY_URL?.trim() || DEFAULT_GATEWAY_URL;
  const gatewayToken = gatewayTokenSetting?.trim() || process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || undefined;
  const agentId = agentIdSetting?.trim() || process.env.OPENCLAW_AGENT_ID?.trim() || DEFAULT_AGENT_ID;

  return { gatewayUrl, gatewayToken, agentId };
}

export async function probeGateway(gatewayUrl: string): Promise<boolean> {
  try {
    await fetch(gatewayUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(2_000),
    });
    return true;
  } catch {
    return false;
  }
}

export function createGatewaySession(options: {
  systemPrompt: string;
  gatewayUrl: string;
  gatewayToken?: string;
  agentId: string;
  callbacks?: GatewayCallbacks;
}): GatewaySession {
  return {
    gatewayUrl: options.gatewayUrl,
    gatewayToken: options.gatewayToken,
    agentId: options.agentId,
    sessionId: randomUUID(),
    messages: [{ role: "developer", content: options.systemPrompt }],
    callbacks: options.callbacks,
    dispose: () => undefined,
  };
}

export async function promptGateway(
  session: GatewaySession,
  _prompt: string,
  options?: GatewayCallbacks,
): Promise<string> {
  const callbacks = options ?? session.callbacks ?? {};

  const response = await fetch(new URL("/v1/chat/completions", session.gatewayUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(session.gatewayToken ? { authorization: `Bearer ${session.gatewayToken}` } : {}),
      "x-openclaw-agent-id": session.agentId,
    },
    body: JSON.stringify({
      model: `openclaw:${session.agentId}`,
      messages: session.messages,
      stream: true,
      user: session.sessionId,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenClaw gateway request failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`,
    );
  }

  if (!response.body) {
    throw new Error("OpenClaw gateway returned an empty response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let assistantResponse = "";

  const toolArgBuffers = new Map<number, string>();
  const toolNames = new Map<number, string>();
  const toolStarted = new Set<number>();
  const parsedToolArgs = new Map<number, unknown>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const eventChunk = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);

      const lines = eventChunk
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"));

      for (const line of lines) {
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          continue;
        }

        let parsed: SseDeltaChunk;
        try {
          parsed = JSON.parse(payload) as SseDeltaChunk;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`OpenClaw gateway returned invalid SSE JSON: ${message}`);
        }

        const delta = parsed.choices?.[0]?.delta;
        if (!delta) {
          continue;
        }

        if (typeof delta.content === "string" && delta.content.length > 0) {
          assistantResponse += delta.content;
          callbacks.onText?.(delta.content);
        }

        if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
          callbacks.onThinking?.(delta.reasoning_content);
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            const toolName = toolCall.function?.name;
            if (typeof toolName === "string" && toolName.length > 0) {
              toolNames.set(index, toolName);
              if (!toolStarted.has(index)) {
                callbacks.onToolStart?.(toolName);
                toolStarted.add(index);
              }
            }

            const nextChunk = toolCall.function?.arguments ?? "";
            const previous = toolArgBuffers.get(index) ?? "";
            const combined = previous + nextChunk;
            toolArgBuffers.set(index, combined);

            try {
              const parsedArgs = combined ? (JSON.parse(combined) as unknown) : {};
              parsedToolArgs.set(index, parsedArgs);
            } catch {
              // Partial JSON; wait for more chunks.
            }
          }
        }
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }
  }

  const remainder = decoder.decode();
  if (remainder) {
    buffer += remainder;
  }

  for (const [index, parsedArgs] of parsedToolArgs.entries()) {
    const resolvedName = toolNames.get(index) ?? "unknown_tool";
    if (!toolStarted.has(index)) {
      callbacks.onToolStart?.(resolvedName);
      toolStarted.add(index);
    }
    callbacks.onToolEnd?.(resolvedName, false, parsedArgs);
  }

  session.messages.push({ role: "assistant", content: assistantResponse });
  return assistantResponse;
}

export function describeGatewayModel(session: GatewaySession): string {
  return `openclaw/${session.agentId}`;
}

