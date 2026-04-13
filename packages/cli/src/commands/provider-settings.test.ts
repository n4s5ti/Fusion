import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReadOnlyProviderSettingsView } from "./provider-settings.js";

function writeJson(path: string, value: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

describe("createReadOnlyProviderSettingsView", () => {
  it("reads provider package settings from .pi and .fusion with .fusion taking precedence", () => {
    const root = mkdtempSync(join(tmpdir(), "fusion-provider-settings-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");

    mkdirSync(join(cwd, ".pi"), { recursive: true });
    mkdirSync(join(cwd, ".fusion"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });

    writeJson(join(agentDir, "settings.json"), {
      npmCommand: ["pnpm"],
      globalOnly: true,
    });
    writeJson(join(cwd, ".pi", "settings.json"), {
      npmCommand: ["npm"],
      extensions: [{ name: "pi-provider", enabled: true }],
      shared: "pi",
    });
    writeJson(join(cwd, ".fusion", "settings.json"), {
      extensions: [{ name: "fusion-provider", enabled: true }],
      shared: "fusion",
    });

    const view = createReadOnlyProviderSettingsView(cwd, agentDir);

    expect(view.getGlobalSettings()).toMatchObject({
      npmCommand: ["pnpm"],
      globalOnly: true,
    });
    expect(view.getProjectSettings()).toMatchObject({
      extensions: [{ name: "fusion-provider", enabled: true }],
      shared: "fusion",
    });
    expect(view.getNpmCommand()).toEqual(["npm"]);
  });

  it("falls back to .pi settings when .fusion settings do not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "fusion-provider-settings-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");

    mkdirSync(join(cwd, ".pi"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });

    writeJson(join(cwd, ".pi", "settings.json"), {
      extensions: [{ name: "pi-provider", enabled: true }],
    });

    const view = createReadOnlyProviderSettingsView(cwd, agentDir);

    expect(view.getProjectSettings()).toMatchObject({
      extensions: [{ name: "pi-provider", enabled: true }],
    });
  });
});
