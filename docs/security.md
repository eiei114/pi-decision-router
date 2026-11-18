# Security notes

`pi-decision-router` is an unattended-execution extension. Installing it means
that routine confirmations are no longer human gates.

- The child decision agent has no tools and cannot edit the project.
- The parent Pi still executes the selected workflow after a decision.
- Project trust is auto-approved and remembered for the current trust event.
- `PI_DECISION_ROUTER_MAX_CONTEXT_CHARS` (default `12000`) bounds the
  conversation excerpt sent to the child decision agent; set a smaller positive
  integer to reduce how much session text leaves the parent process. A value of
  `0` falls back to the default, and values above `12000` remain capped at
  `12000` by the child prompt builder.
- The audit log is local JSONL, not encrypted, and may contain sensitive text.
- Unknown question tools are not blocked; they remain visible so a caller does
  not receive a fabricated answer from an unsupported schema.
- Automatic compaction can abort the current agent run after a turn and queue a
  hidden follow-up. Review this behavior if your workflow treats compaction or
  continuation as a human approval boundary.
- The compaction warning and status are UI feedback only. They do not prevent
  the model from continuing when UI is unavailable (print/RPC modes).

Use `PI_DECISION_ROUTER_ENABLED=0` for an interactive run.
