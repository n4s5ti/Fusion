---
"@runfusion/fusion": patch
---

Fix retry handling for stranded in-review tasks whose status is unset by allowing retry when execution is incomplete or a merge retry has already been attempted.
