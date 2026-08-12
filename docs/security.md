# Security notes

`pi-decision-router` is an unattended-execution extension. Installing it means
that routine confirmations are no longer human gates.

- The child decision agent has no tools and cannot edit the project.
- The parent Pi still executes the selected workflow after a decision.
- Project trust is auto-approved and remembered for the current trust event.
- The audit log is local JSONL, not encrypted, and may contain sensitive text.
- Unknown question tools are not blocked; they remain visible so a caller does
  not receive a fabricated answer from an unsupported schema.

Use `PI_DECISION_ROUTER_ENABLED=0` for an interactive run.
