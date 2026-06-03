# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Settings & Localization

### Surface
One of Fusion's user-facing frontends — the browser dashboard and the terminal TUI. Surfaces have independent runtimes and rendering stacks but are expected to share user-level state: a setting changed on one surface (theme, language) carries to the other.

### Global Settings
User-level settings persisted server-side that apply across all Surfaces and all projects, as opposed to per-project settings. Values are validated at the write boundary — an invalid value is dropped rather than persisted — so every reader can trust what it loads.

### Three-Tier Setting
The named persistence pattern for a user preference on the dashboard: a device-local cache for instant reads, a write-through to Global Settings so other Surfaces see it, and a hydrate-on-mount from the server when no local value exists. A local or in-flight user choice always wins over server hydration, and changes propagate to other open tabs.

### Supported Locale
A language tag in the closed set Fusion ships translations for. Any external tag (browser, environment, flag) is normalized into this set or rejected — never passed through raw. Chinese tags route by script and region so Traditional-script users are never silently served Simplified, and the two Chinese variants never collapse into a generic base tag.
