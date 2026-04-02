---
"@fusion/dashboard": patch
---

Don't auto expand QuickEntryBox on focus in list view. The QuickEntryBox now has an `autoExpand` prop (default: `true`) that controls whether the component automatically expands when focused. List view now passes `autoExpand={false}` to keep the view collapsed, while board view continues to auto-expand (uses default behavior).
