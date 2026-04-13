import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PackageManagerSettingsView {
  getGlobalSettings(): Record<string, any>;
  getProjectSettings(): Record<string, any>;
  getNpmCommand(): string[] | undefined;
}

function readJsonObject(path: string): Record<string, any> {
  if (!existsSync(path)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
}

export function createReadOnlyProviderSettingsView(cwd: string, agentDir: string): PackageManagerSettingsView {
  const globalSettings = readJsonObject(join(agentDir, "settings.json"));
  const legacyProjectSettings = readJsonObject(join(cwd, ".pi", "settings.json"));
  const fusionProjectSettings = readJsonObject(join(cwd, ".fusion", "settings.json"));
  const projectSettings = { ...legacyProjectSettings, ...fusionProjectSettings };
  const mergedSettings = { ...globalSettings, ...projectSettings };

  return {
    getGlobalSettings: () => structuredClone(globalSettings),
    getProjectSettings: () => structuredClone(projectSettings),
    getNpmCommand: () => Array.isArray(mergedSettings.npmCommand)
      ? [...mergedSettings.npmCommand]
      : undefined,
  };
}
