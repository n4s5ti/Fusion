---
"@runfusion/fusion": patch
---

summary: First-run agent setup no longer errors on a duplicate CEO; desktop Switch-server button now opens the connection menu.
category: fix
dev: Onboarding agent creation (ModelOnboardingModal + SetupWizardModal) treats a 409 "Agent with this name already exists" as success and advances, since the default CEO can be created from more than one first-run surface. The desktop preload now bridges the `shell:open-connection-manager` IPC (sent by main when the header Switch-server button is clicked) into the `window` DOM event ShellContext listens for, so NativeShellConnectionManager (Local/Remote toggle + remote profiles) actually opens.
