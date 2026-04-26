---
"@runfusion/fusion": patch
---

Fix dashboard health/version reporting to read the version from package.json instead of relying on npm_package_version with a stale hardcoded fallback.
