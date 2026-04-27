import type {
  AgentRuntime,
  AgentRuntimeOptions,
  AgentSessionResult,
  GatewayConfig,
  GatewaySession,
} from "./types.js";
import {
  createGatewaySession,
  describeGatewayModel,
  promptGateway,
  resolveGatewayConfig,
} from "./pi-module.js";

export class OpenClawRuntimeAdapter implements AgentRuntime {
  readonly id = "openclaw";
  readonly name = "OpenClaw Runtime";

  private readonly config: GatewayConfig;

  constructor(settings?: Partial<GatewayConfig>) {
    this.config = resolveGatewayConfig(settings as Record<string, unknown> | undefined);
  }

  async createSession(options: AgentRuntimeOptions): Promise<AgentSessionResult> {
    const session = createGatewaySession({
      gatewayUrl: this.config.gatewayUrl,
      gatewayToken: this.config.gatewayToken,
      agentId: this.config.agentId,
      systemPrompt: options.systemPrompt,
      callbacks: {
        onText: options.onText,
        onThinking: options.onThinking,
        onToolStart: options.onToolStart,
        onToolEnd: options.onToolEnd,
      },
    });

    return {
      session,
      sessionFile: undefined,
    };
  }

  async promptWithFallback(session: GatewaySession, prompt: string, options?: unknown): Promise<void> {
    session.messages.push({ role: "user", content: prompt });

    await promptGateway(session, prompt, options as Parameters<typeof promptGateway>[2]);
  }

  describeModel(session: GatewaySession): string {
    return describeGatewayModel(session);
  }

  async dispose(_session: GatewaySession): Promise<void> {
    // OpenClaw gateway sessions are managed remotely; no local cleanup required.
  }
}
