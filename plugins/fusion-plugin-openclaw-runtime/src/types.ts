/**
 * OpenClaw runtime adapter contracts.
 *
 * These mirror the engine runtime interface while keeping this plugin package
 * decoupled from internal engine modules.
 */

export type GatewayRole = "developer" | "user" | "assistant";

export interface GatewayMessage {
  role: GatewayRole;
  content: string;
}

export interface GatewayConfig {
  gatewayUrl: string;
  gatewayToken?: string;
  agentId: string;
}

export interface GatewayCallbacks {
  onText?: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolStart?: (toolName: string, args?: unknown) => void;
  onToolEnd?: (toolName: string, isError: boolean, result?: unknown) => void;
}

export interface GatewaySession extends GatewayConfig {
  sessionId: string;
  messages: GatewayMessage[];
  callbacks?: GatewayCallbacks;
  dispose?: () => Promise<void> | void;
}

export interface AgentRuntimeOptions extends GatewayCallbacks {
  cwd: string;
  systemPrompt: string;
  tools?: unknown;
  customTools?: unknown;
  defaultProvider?: string;
  defaultModelId?: string;
  fallbackProvider?: string;
  fallbackModelId?: string;
  defaultThinkingLevel?: string;
  sessionManager?: unknown;
  skillSelection?: unknown;
  skills?: string[];
}

export interface AgentSessionResult {
  session: GatewaySession;
  sessionFile?: string;
}

export interface AgentRuntime {
  id: string;
  name: string;
  createSession(options: AgentRuntimeOptions): Promise<AgentSessionResult>;
  promptWithFallback(session: GatewaySession, prompt: string, options?: unknown): Promise<void>;
  describeModel(session: GatewaySession): string;
  dispose?(session: GatewaySession): Promise<void>;
}
