---
"@runfusion/fusion": patch
---

summary: Align the quick-add workflow dropdown button height with Save/Fast/Subtask buttons.
category: fix
dev: `.quick-entry-workflow-trigger` in QuickEntryBox.css now re-asserts `.btn-sm`'s `padding: 4px 10px` locally so the shared global `.dep-trigger` `padding: 3px 8px` no longer shortens it by ~2px; other `.dep-trigger` surfaces (InlineCreateCard, NewTaskModal, TaskDetailModal, TaskForm) are unaffected (FN-7677).
