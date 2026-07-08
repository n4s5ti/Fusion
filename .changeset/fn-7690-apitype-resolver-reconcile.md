---
"@runfusion/fusion": patch
---

summary: Fix Anthropic-compatible custom providers registering under an unregistered API key.
category: fix
dev: Aligns custom-provider-registry `resolveApiType("anthropic-compatible")` on "anthropic-messages" (the registered pi-ai api key), matching pi.ts `resolveCustomProviderApiType` and removing the latent "No API provider registered for api: anthropic" drift (FN-7690).
