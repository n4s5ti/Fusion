---
"@dustinbyrne/kb": patch
---

Add ntfy.sh push notifications for task completion and failures

Configure your ntfy.sh topic in Settings → Notifications to receive push notifications when:
- Tasks complete and move to "in-review"
- Tasks are merged to main (move to "done")
- Tasks fail and need attention

The ntfy topic is also included in task prompts when configured, making it easy for agents to send custom notifications during task execution.
