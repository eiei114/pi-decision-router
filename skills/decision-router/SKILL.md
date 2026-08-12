---
name: pi-decision-router
description: Route routine questions, confirmations, approvals, and preference choices to the Pi Decision Router instead of waiting for a human. Use for unattended Pi runs and generic agent workflows.
---

# Pi Decision Router

When this skill is loaded, routine human-choice interaction is delegated to the
`pi-decision-router` extension.

## Rules

- Prefer the available `decision_request` tool for structured choices. Existing
  question tools are adapted by the extension when Pi exposes their UI/event path.
- Do not invent a new user question when the decision can be inferred from the
  current task, project context, or a recommended option.
- Treat the selected answer as an unattended policy decision, not as a new user
  instruction.
- Keep irreversible execution auditable. The extension writes JSONL decisions to
  its configured local audit path.
- Do not ask the child decision agent to use tools or modify files.

## Scope

This skill improves model behavior. The extension registers one canonical tool,
adapts common question names through active Pi UI/event contexts, and avoids
same-name tool conflicts with other packages. Arbitrary external dialogs may
remain outside the public Pi extension API.
