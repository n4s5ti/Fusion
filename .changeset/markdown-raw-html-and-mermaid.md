---
"@runfusion/fusion": minor
---

The shared markdown renderer (GitHub PR/issue bodies + comments, mailbox, chat) now renders embedded raw HTML and mermaid diagrams. Raw HTML (`<details>`/`<summary>`, `<kbd>`, `<sub>`, tables) renders as real elements via `rehype-raw`, with `rehype-sanitize` stripping XSS (script/style/iframe, event handlers, `javascript:` URLs) since these bodies come from GitHub; HTML comments (`<!-- -->`) are dropped. Fenced ```mermaid blocks render as actual diagrams via a lazy-loaded `mermaid` import (kept out of the main bundle, loaded only when a diagram is present), falling back to the raw code block on parse error and following the dashboard theme.
