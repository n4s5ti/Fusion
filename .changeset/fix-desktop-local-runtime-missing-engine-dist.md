---
"@runfusion/fusion": patch
---

summary: Fix desktop app crashing on "Local" mode startup with a missing-module error.
category: fix
dev: The desktop build now compiles @fusion/core and @fusion/engine tsc dist (both gitignored) so the packaged embedded Local runtime's `import("@fusion/engine")` resolves. Previously only release.yml's root `pnpm build` produced these; desktop-windows.yml packaged an empty engine/dist and crashed with ERR_MODULE_NOT_FOUND for app.asar/node_modules/@fusion/engine. `@fusion/desktop build` is now self-contained (build.ts → ensureEmbeddedRuntimeBuild), and desktop-windows.yml gained the `pnpm build` parity step.
