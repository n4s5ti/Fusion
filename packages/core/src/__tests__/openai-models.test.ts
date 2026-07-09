import { describe, expect, it } from "vitest";
import {
  GPT_5_6_LUNA_MODEL_ID,
  GPT_5_6_SOL_MODEL_ID,
  GPT_5_6_TERRA_MODEL_ID,
  OPENAI_CODEX_PROVIDER_ID,
  SUPPLEMENTAL_OPENAI_CODEX_PROVIDER_REGISTRATION,
  mergeSupplementalOpenAiCodexModels,
} from "../openai-models.js";

const EXPECTED_IDS = [GPT_5_6_LUNA_MODEL_ID, GPT_5_6_SOL_MODEL_ID, GPT_5_6_TERRA_MODEL_ID];

describe("SUPPLEMENTAL_OPENAI_CODEX_PROVIDER_REGISTRATION", () => {
  it("targets the openai-codex-responses API and ChatGPT backend baseUrl", () => {
    expect(OPENAI_CODEX_PROVIDER_ID).toBe("openai-codex");
    expect(SUPPLEMENTAL_OPENAI_CODEX_PROVIDER_REGISTRATION).toMatchObject({
      name: "OpenAI Codex",
      baseUrl: "https://chatgpt.com/backend-api",
      api: "openai-codex-responses",
    });
  });

  it("carries exactly the three GPT-5.6 codenamed variant ids", () => {
    const modelIds = SUPPLEMENTAL_OPENAI_CODEX_PROVIDER_REGISTRATION.models.map((model) => model.id);
    expect(modelIds).toEqual(EXPECTED_IDS);
  });
});

describe("mergeSupplementalOpenAiCodexModels", () => {
  it("adds all three ids when the registry lacks them", () => {
    const registeredProviders = new Map<string, unknown>();
    const registry = {
      registeredProviders,
      registerProvider(providerName: string, config: unknown) {
        registeredProviders.set(providerName, config);
      },
    };

    mergeSupplementalOpenAiCodexModels(registry);

    const registered = registeredProviders.get(OPENAI_CODEX_PROVIDER_ID) as
      typeof SUPPLEMENTAL_OPENAI_CODEX_PROVIDER_REGISTRATION;
    expect(registered).toBeDefined();
    expect(registered.models.map((model) => model.id)).toEqual(expect.arrayContaining(EXPECTED_IDS));
  });

  it("does not duplicate an id the registry already registers — existing row wins", () => {
    const existingLunaRow = {
      id: GPT_5_6_LUNA_MODEL_ID,
      name: "GPT-5.6 Luna (pinned catalog)",
      provider: OPENAI_CODEX_PROVIDER_ID,
      reasoning: true,
      input: ["text"],
      cost: { input: 999, output: 999, cacheRead: 999, cacheWrite: 999 },
      contextWindow: 128_000,
      maxTokens: 64_000,
    };
    const registeredProviders = new Map<string, { models: unknown[] }>([
      [OPENAI_CODEX_PROVIDER_ID, { models: [existingLunaRow] }],
    ]);
    const registry = {
      registeredProviders,
      registerProvider(providerName: string, config: { models: unknown[] }) {
        registeredProviders.set(providerName, config);
      },
    };

    mergeSupplementalOpenAiCodexModels(registry);

    const registered = registeredProviders.get(OPENAI_CODEX_PROVIDER_ID) as
      typeof SUPPLEMENTAL_OPENAI_CODEX_PROVIDER_REGISTRATION;
    const lunaRows = registered.models.filter((model) => model.id === GPT_5_6_LUNA_MODEL_ID);
    expect(lunaRows).toHaveLength(1);
    expect(lunaRows[0].name).toBe("GPT-5.6 Luna (pinned catalog)");
    // sol and terra were still missing, so they must have been added.
    const allIds = registered.models.map((model) => model.id);
    expect(allIds).toEqual(expect.arrayContaining([GPT_5_6_SOL_MODEL_ID, GPT_5_6_TERRA_MODEL_ID]));
  });

  it("is a no-op when all three ids are already present", () => {
    const registeredProviders = new Map<string, unknown>();
    const registry = {
      registeredProviders,
      registerProvider(providerName: string, config: unknown) {
        registeredProviders.set(providerName, config);
      },
    };

    mergeSupplementalOpenAiCodexModels(registry);
    const afterFirstMerge = JSON.stringify(registeredProviders.get(OPENAI_CODEX_PROVIDER_ID));

    mergeSupplementalOpenAiCodexModels(registry);
    const afterSecondMerge = JSON.stringify(registeredProviders.get(OPENAI_CODEX_PROVIDER_ID));

    expect(afterSecondMerge).toBe(afterFirstMerge);
  });

  it("falls back to getAll() filtered by provider when registeredProviders state is absent", () => {
    const registry = {
      registerProvider() {
        throw new Error("registerProvider should not be called when all ids already present via getAll()");
      },
      getAll() {
        return EXPECTED_IDS.map((id) => ({ id, provider: OPENAI_CODEX_PROVIDER_ID }));
      },
    };

    expect(() => mergeSupplementalOpenAiCodexModels(registry)).not.toThrow();
  });

  it("never throws when registerProvider throws", () => {
    const registry = {
      registerProvider() {
        throw new Error("boom");
      },
    };
    const warnings: string[] = [];
    expect(() => mergeSupplementalOpenAiCodexModels(registry, (message) => warnings.push(message))).not.toThrow();
    expect(warnings[0]).toContain("Failed to merge supplemental openai-codex models");
  });

  it("never throws when getAll is missing entirely (registry only has registerProvider)", () => {
    const registeredProviders = new Map<string, unknown>();
    const registry = {
      registeredProviders,
      registerProvider(providerName: string, config: unknown) {
        registeredProviders.set(providerName, config);
      },
    };

    expect(() => mergeSupplementalOpenAiCodexModels(registry)).not.toThrow();
    expect(registeredProviders.has(OPENAI_CODEX_PROVIDER_ID)).toBe(true);
  });
});
