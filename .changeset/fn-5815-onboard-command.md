---
"@runfusion/fusion": minor
---

Add `fn onboard`: an explicit, user-invoked onboarding command that runs a sequential, prompt-based wizard for central DB creation, AI provider setup (API key), first project init (`fn init`), core settings defaults (global `testMode` and project `maxConcurrent`), and a next-steps tour. It persists a `cliOnboardingCompletedAt` completion marker in global settings so later runs are skipped unless `--force` is passed.
