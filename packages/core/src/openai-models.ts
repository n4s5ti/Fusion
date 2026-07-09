type OpenAiCodexModelInput = "text" | "image";

export const OPENAI_CODEX_PROVIDER_ID = "openai-codex";
export const GPT_5_6_LUNA_MODEL_ID = "gpt-5.6-luna";
export const GPT_5_6_SOL_MODEL_ID = "gpt-5.6-sol";
export const GPT_5_6_TERRA_MODEL_ID = "gpt-5.6-terra";

interface OpenAiCodexModelRegistration {
  id: string;
  name: string;
  reasoning: boolean;
  input: OpenAiCodexModelInput[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  compat?: Record<string, unknown>;
}

export interface OpenAiCodexProviderRegistration {
  name: string;
  baseUrl: string;
  apiKey?: string;
  api: "openai-codex-responses";
  models: OpenAiCodexModelRegistration[];
}

/*
 * FNXC:ModelCatalog 2026-07-09-12:30:
 * FN-7745: FN-7742 already priced the three GPT-5.6 codenamed OpenAI Codex variants
 * (gpt-5.6-luna/sol/terra) in model-pricing.ts, but pricing does not make a model
 * selectable — the /api/models picker sources rows from the pinned pi-ai
 * ModelRegistry.getAvailable() catalog. At spec time (pi-ai 0.80.3) that pinned catalog
 * did not carry the three GPT-5.6 codenamed ids under "openai-codex", so no picker
 * surfaced them. Mirror the SUPPLEMENTAL_ANTHROPIC_PROVIDER_REGISTRATION seam
 * (anthropic-models.ts) to additively register them: if a later pi-ai bump already
 * carries an id (confirmed true as of the pinned 0.80.5 used by this task), the merge
 * below is a dedupe-safe no-op — the existing catalog row always wins, never displaced
 * or duplicated. Field shape (api/baseUrl) copied verbatim from the pinned catalog's
 * openai-codex.models.js entries; apiKey is intentionally omitted because the real
 * "openai-codex" provider authenticates via ChatGPT Plus/Pro OAuth, not an env-var API
 * key — the merge preserves whatever auth the provider was already registered with
 * (see mergeSupplementalOpenAiCodexModels's `...registeredProvider` override below).
 */
export const SUPPLEMENTAL_OPENAI_CODEX_PROVIDER_REGISTRATION: OpenAiCodexProviderRegistration = {
  name: "OpenAI Codex",
  baseUrl: "https://chatgpt.com/backend-api",
  api: "openai-codex-responses",
  models: [
    {
      id: GPT_5_6_LUNA_MODEL_ID,
      name: "GPT-5.6 Luna",
      reasoning: true,
      input: ["text", "image"],
      cost: {
        input: 1.25,
        output: 10,
        cacheRead: 0.125,
        cacheWrite: 1.25,
      },
      contextWindow: 272_000,
      maxTokens: 128_000,
    },
    {
      id: GPT_5_6_SOL_MODEL_ID,
      name: "GPT-5.6 Sol",
      reasoning: true,
      input: ["text", "image"],
      cost: {
        input: 1.25,
        output: 10,
        cacheRead: 0.125,
        cacheWrite: 1.25,
      },
      contextWindow: 272_000,
      maxTokens: 128_000,
    },
    {
      id: GPT_5_6_TERRA_MODEL_ID,
      name: "GPT-5.6 Terra",
      reasoning: true,
      input: ["text", "image"],
      cost: {
        input: 1.25,
        output: 10,
        cacheRead: 0.125,
        cacheWrite: 1.25,
      },
      contextWindow: 272_000,
      maxTokens: 128_000,
    },
  ],
};

type OpenAiCodexModelLike = Partial<Omit<OpenAiCodexModelRegistration, "name" | "compat">> & {
  id: string;
  name?: unknown;
  provider?: string;
  compat?: unknown;
};

interface OpenAiCodexModelRegistryLike {
  registerProvider(providerName: string, config: OpenAiCodexProviderRegistration): void;
  getAll?: () => OpenAiCodexModelLike[];
}

type RegistryWithProviderState = OpenAiCodexModelRegistryLike & {
  registeredProviders?: Map<string, Partial<OpenAiCodexProviderRegistration>>;
};

function toOpenAiCodexModelRegistration(model: OpenAiCodexModelLike): OpenAiCodexModelRegistration {
  const supplemental = SUPPLEMENTAL_OPENAI_CODEX_PROVIDER_REGISTRATION.models.find((entry) => entry.id === model.id);
  return {
    id: model.id,
    name: String(model.name ?? supplemental?.name ?? model.id),
    reasoning: model.reasoning ?? supplemental?.reasoning ?? false,
    input: Array.isArray(model.input) ? model.input as OpenAiCodexModelInput[] : supplemental?.input ?? ["text"],
    cost: model.cost ?? supplemental?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: Number(model.contextWindow ?? supplemental?.contextWindow ?? 0),
    maxTokens: Number(model.maxTokens ?? supplemental?.maxTokens ?? 0),
    compat: typeof model.compat === "object" && model.compat !== null
      ? { ...(model.compat as Record<string, unknown>) }
      : supplemental?.compat ? { ...supplemental.compat } : undefined,
  };
}

function cloneOpenAiCodexProviderRegistration(config: OpenAiCodexProviderRegistration): OpenAiCodexProviderRegistration {
  return {
    ...config,
    models: config.models.map((model) => toOpenAiCodexModelRegistration(model)),
  };
}

export function mergeSupplementalOpenAiCodexModels(
  modelRegistry: OpenAiCodexModelRegistryLike,
  logWarning: (message: string) => void = () => {},
): void {
  try {
    const registryWithState = modelRegistry as RegistryWithProviderState;
    const registeredProvider = registryWithState.registeredProviders?.get(OPENAI_CODEX_PROVIDER_ID);
    const registeredModels = registeredProvider?.models?.map((model) => toOpenAiCodexModelRegistration(model)) ?? [];
    const currentModels = registeredModels.length > 0
      ? registeredModels
      : modelRegistry.getAll?.()
        .filter((model) => model.provider === OPENAI_CODEX_PROVIDER_ID)
        .map((model) => toOpenAiCodexModelRegistration(model)) ?? [];
    const currentModelIds = new Set(currentModels.map((model) => model.id));
    const missingModels = SUPPLEMENTAL_OPENAI_CODEX_PROVIDER_REGISTRATION.models
      .filter((model) => !currentModelIds.has(model.id));

    if (missingModels.length === 0) return;

    modelRegistry.registerProvider(OPENAI_CODEX_PROVIDER_ID, {
      ...cloneOpenAiCodexProviderRegistration(SUPPLEMENTAL_OPENAI_CODEX_PROVIDER_REGISTRATION),
      ...registeredProvider,
      models: [...currentModels, ...missingModels.map((model) => toOpenAiCodexModelRegistration(model))],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarning(`Failed to merge supplemental ${OPENAI_CODEX_PROVIDER_ID} models: ${message}`);
  }
}
