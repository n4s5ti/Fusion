---
"@runfusion/fusion": patch
---

Tasks manually parked back to Todo now consistently render as paused in TaskCard and TaskDetailModal, and using Unpause clears the `userPaused` latch so scheduler dispatch can resume.
