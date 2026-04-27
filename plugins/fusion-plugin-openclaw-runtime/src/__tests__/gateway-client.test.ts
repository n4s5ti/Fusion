import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGatewaySession,
  probeGateway,
  promptGateway,
  resolveGatewayConfig,
} from "../pi-module.js";

function createSseResponse(events: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
    ...init,
  });
}

describe("gateway client", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("createGatewaySession includes a no-op dispose handler", () => {
    const session = createGatewaySession({
      gatewayUrl: "http://127.0.0.1:18789",
      gatewayToken: "token",
      agentId: "main",
      systemPrompt: "system",
    });

    expect(typeof session.dispose).toBe("function");
    expect(() => session.dispose?.()).not.toThrow();
  });

  it("resolves config from settings first, then env, then defaults", () => {
    process.env.OPENCLAW_GATEWAY_URL = "http://env-gateway:18789";
    process.env.OPENCLAW_GATEWAY_TOKEN = "env-token";
    process.env.OPENCLAW_AGENT_ID = "env-agent";

    expect(
      resolveGatewayConfig({
        gatewayUrl: "http://settings-gateway:18789",
        gatewayToken: "settings-token",
        agentId: "settings-agent",
      }),
    ).toEqual({
      gatewayUrl: "http://settings-gateway:18789",
      gatewayToken: "settings-token",
      agentId: "settings-agent",
    });

    expect(resolveGatewayConfig({})).toEqual({
      gatewayUrl: "http://env-gateway:18789",
      gatewayToken: "env-token",
      agentId: "env-agent",
    });

    delete process.env.OPENCLAW_GATEWAY_URL;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    delete process.env.OPENCLAW_AGENT_ID;

    expect(resolveGatewayConfig({})).toEqual({
      gatewayUrl: "http://127.0.0.1:18789",
      gatewayToken: undefined,
      agentId: "main",
    });
  });

  it("probeGateway returns true for any reachable HTTP response and false on network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    await expect(probeGateway("http://127.0.0.1:18789")).resolves.toBe(true);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(probeGateway("http://127.0.0.1:18789")).resolves.toBe(false);
  });

  it("streams text, thinking, and tool-call events from SSE", async () => {
    const onText = vi.fn();
    const onThinking = vi.fn();
    const onToolStart = vi.fn();
    const onToolEnd = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue(
      createSseResponse([
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"internal "}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"lookup","arguments":"{\\"id\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"123}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = createGatewaySession({
      gatewayUrl: "http://127.0.0.1:18789",
      gatewayToken: "secret",
      agentId: "main",
      systemPrompt: "You are helpful",
    });
    session.messages.push({ role: "user", content: "Say hello" });

    const result = await promptGateway(session, "Say hello", {
      onText,
      onThinking,
      onToolStart,
      onToolEnd,
    });

    expect(result).toBe("Hello world");
    expect(onText).toHaveBeenCalledTimes(2);
    expect(onText).toHaveBeenNthCalledWith(1, "Hello ");
    expect(onText).toHaveBeenNthCalledWith(2, "world");
    expect(onThinking).toHaveBeenCalledWith("internal ");
    expect(onToolStart).toHaveBeenCalledWith("lookup");
    expect(onToolEnd).toHaveBeenCalledWith("lookup", false, { id: 123 });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.toString()).toBe("http://127.0.0.1:18789/v1/chat/completions");
    expect(requestInit.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer secret",
      "x-openclaw-agent-id": "main",
    });

    const parsedBody = JSON.parse(String(requestInit.body));
    expect(parsedBody.model).toBe("openclaw:main");
    expect(parsedBody.stream).toBe(true);
    expect(parsedBody.user).toBe(session.sessionId);
    expect(parsedBody.messages.at(-1)).toEqual({ role: "user", content: "Say hello" });
  });

  it("handles empty data lines, [DONE], and keeps conversation across calls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createSseResponse([
          "data:   \n\n",
          'data: {"choices":[{"delta":{"content":"first"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      )
      .mockResolvedValueOnce(
        createSseResponse(['data: {"choices":[{"delta":{"content":" second"}}]}\n\n', "data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const session = createGatewaySession({
      gatewayUrl: "http://127.0.0.1:18789",
      agentId: "main",
      systemPrompt: "System",
    });
    session.messages.push({ role: "user", content: "one" });
    await promptGateway(session, "one");

    session.messages.push({ role: "user", content: "two" });
    await promptGateway(session, "two");

    expect(session.messages).toEqual([
      { role: "developer", content: "System" },
      { role: "user", content: "one" },
      { role: "assistant", content: "first" },
      { role: "user", content: "two" },
      { role: "assistant", content: " second" },
    ]);

    const firstBody = JSON.parse(String((fetchMock.mock.calls[0] as [URL, RequestInit])[1].body));
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1] as [URL, RequestInit])[1].body));
    expect(firstBody.messages).toHaveLength(2);
    expect(secondBody.messages).toHaveLength(4);
  });

  it("throws descriptive errors for non-200 status, invalid SSE JSON, and connection errors", async () => {
    const session = createGatewaySession({
      gatewayUrl: "http://127.0.0.1:18789",
      agentId: "main",
      systemPrompt: "System",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 503, statusText: "Service Unavailable" })));
    await expect(promptGateway(session, "test")).rejects.toThrow(
      "OpenClaw gateway request failed (503 Service Unavailable): bad",
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createSseResponse(["data: {not-json}\n\n"])));
    await expect(promptGateway(session, "test")).rejects.toThrow("OpenClaw gateway returned invalid SSE JSON");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ETIMEDOUT")));
    await expect(promptGateway(session, "test")).rejects.toThrow("ETIMEDOUT");
  });
});
