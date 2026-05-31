---
"@runfusion/fusion": patch
---

Fix room chat send reliability by preventing concurrent in-flight room dispatches, classifying ambiguous delivered sends as delivered (so composer text is not restored), and hardening optimistic/SSE reconciliation to avoid duplicate user message rendering.
