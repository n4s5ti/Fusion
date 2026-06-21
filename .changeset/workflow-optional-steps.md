---
"@runfusion/fusion": minor
---

Add workflow optional steps: workflows can declare optional step templates that tasks toggle on/off per task, with a workflow-level default. The built-in coding and stepwise-coding workflows expose agent browser verification as an optional step (the stepwise workflow gains a pre-merge workflow-step seam so enabled steps actually run). Optional steps are authorable in the node editor, preserved across node-editor saves, and selectable from a steps dropdown in both the quick-add card and the full New Task modal.
