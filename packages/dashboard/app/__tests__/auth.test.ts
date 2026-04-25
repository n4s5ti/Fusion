import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadAuthModule() {
  vi.resetModules();
  return import("../auth");
}

describe("auth helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("captures token from ?token= and cleans URL while preserving other params/hash", async () => {
    window.history.replaceState({}, "", "/dashboard?token=daemon-123&view=board#focus");

    const { getAuthToken } = await loadAuthModule();

    expect(getAuthToken()).toBe("daemon-123");
    expect(window.localStorage.getItem("fn.authToken")).toBe("daemon-123");
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      "/dashboard?view=board#focus",
    );
  });

  it("appends fn_token for same-origin API URLs and same-host websocket URLs", async () => {
    window.localStorage.setItem("fn.authToken", "daemon-abc");

    const { appendTokenQuery, QUERY_TOKEN_PARAM } = await loadAuthModule();

    expect(appendTokenQuery("/api/tasks?limit=1")).toBe(
      `/api/tasks?limit=1&${QUERY_TOKEN_PARAM}=daemon-abc`,
    );

    const wsUrl = `ws://${window.location.host}/api/events`;
    expect(appendTokenQuery(wsUrl)).toBe(`${wsUrl}?${QUERY_TOKEN_PARAM}=daemon-abc`);
  });

  it("does not append fn_token for cross-origin URLs", async () => {
    window.localStorage.setItem("fn.authToken", "daemon-abc");

    const { appendTokenQuery } = await loadAuthModule();

    const externalOAuth = "https://auth.provider.example/oauth/start?client_id=test";
    expect(appendTokenQuery(externalOAuth)).toBe(externalOAuth);
  });

  it("withTokenHeader adds bearer token without overwriting explicit Authorization", async () => {
    window.localStorage.setItem("fn.authToken", "daemon-xyz");

    const { withTokenHeader } = await loadAuthModule();

    const merged = new Headers(withTokenHeader({ "X-Test": "1" }));
    expect(merged.get("Authorization")).toBe("Bearer daemon-xyz");
    expect(merged.get("X-Test")).toBe("1");

    const explicit = new Headers(withTokenHeader({ Authorization: "Bearer pre-signed" }));
    expect(explicit.get("Authorization")).toBe("Bearer pre-signed");
  });

  it("returns original headers when no token is available", async () => {
    const { withTokenHeader } = await loadAuthModule();

    const original = { "X-Test": "no-token" };
    expect(withTokenHeader(original)).toBe(original);
  });
});
