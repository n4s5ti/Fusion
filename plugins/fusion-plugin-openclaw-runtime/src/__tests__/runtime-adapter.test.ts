import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenClawRuntimeAdapter } from "../runtime-adapter.js";

const {
  mockResolveGatewayConfig,
  mockCreateGatewaySession,
  mockPromptGateway,
  mockDescribeGatewayModel,
} = vi.hoisted(() => ({
  mockResolveGatewayConfig: vi.fn(),
  mockCreateGatewaySession: vi.fn(),
  mockPromptGateway: vi.fn(),
  mockDescribeGatewayModel: vi.fn(),
}));

vi.mock("../pi-module.js", () => ({
  resolveGatewayConfig: mockResolveGatewayConfig,
  createGatewaySession: mockCreateGatewaySession,
  promptGateway: mockPromptGateway,
  describeGatewayModel: mockDescribeGatewayModel,
}));

describe("OpenClawRuntimeAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveGatewayConfig.mockReturnValue({
      gatewayUrl: "http://127.0.0.1:18789",
      gatewayToken: "token",
      agentId: "main",
    });
    mockDescribeGatewayModel.mockReturnValue("openclaw/main");
    mockCreateGatewaySession.mockImplementation((options) => ({
      gatewayUrl: options.gatewayUrl,
      gatewayToken: options.gatewayToken,
      agentId: options.agentId,
      sessionId: "session-123",
      messages: [{ role: "developer", content: options.systemPrompt }],
      callbacks: options.callbacks,
    }));
  });

  it("has stable runtime identity", () => {
    const adapter = new OpenClawRuntimeAdapter();
    expect(adapter.id).toBe("openclaw");
    expect(adapter.name).toBe("OpenClaw Runtime");
  });

  it("createSession returns gateway session with initial developer message", async () => {
    const adapter = new OpenClawRuntimeAdapter({ gatewayUrl: "http://localhost:18789", agentId: "ops" });

    const result = await adapter.createSession({
      cwd: "/project",
      systemPrompt: "You are helpful",
      onText: vi.fn(),
      onThinking: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
    });

    expect(mockResolveGatewayConfig).toHaveBeenCalledWith({ gatewayUrl: "http://localhost:18789", agentId: "ops" });
    expect(mockCreateGatewaySession).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayUrl: "http://127.0.0.1:18789",
        gatewayToken: "token",
        agentId: "main",
        systemPrompt: "You are helpful",
      }),
    );
    expect(result.session.messages).toEqual([{ role: "developer", content: "You are helpful" }]);
    expect(result.sessionFile).toBeUndefined();
  });

  it("promptWithFallback appends user message and delegates assistant handling to gateway client", async () => {
    const adapter = new OpenClawRuntimeAdapter();
    const session = {
      gatewayUrl: "http://127.0.0.1:18789",
      gatewayToken: "token",
      agentId: "main",
      sessionId: "session-123",
      messages: [{ role: "developer" as const, content: "System" }],
    };
    mockPromptGateway.mockImplementation(async (activeSession) => {
      activeSession.messages.push({ role: "assistant", content: "Gateway response" });
      return "Gateway response";
    });

    await adapter.promptWithFallback(session, "Hello", { onText: vi.fn() });

    expect(mockPromptGateway).toHaveBeenCalledWith(session, "Hello", { onText: expect.any(Function) });
    expect(session.messages).toEqual([
      { role: "developer", content: "System" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Gateway response" },
    ]);
  });

  it("describeModel returns openclaw/<agentId>", () => {
    const adapter = new OpenClawRuntimeAdapter();
    const session = {
      gatewayUrl: "http://127.0.0.1:18789",
      agentId: "ops",
      sessionId: "session-123",
      messages: [],
    };

    const result = adapter.describeModel(session as any);

    expect(mockDescribeGatewayModel).toHaveBeenCalledWith(session);
    expect(result).toBe("openclaw/main");
  });

  it("dispose is a no-op", async () => {
    const adapter = new OpenClawRuntimeAdapter();
    await expect(adapter.dispose({} as any)).resolves.toBeUndefined();
  });
});
