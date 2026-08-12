# Usage and decision contract

## Supported tool shapes

The extension registers `decision_request` as its conflict-free canonical tool and
adapts these external names without registering duplicate tools:

- `question`: one prompt plus `options`.
- `questionnaire`: `questions[]` with `prompt`/`question` and `options[]`.
- `ask_question`, `ask_user_question`, and `AskUserQuestion`: common gstack/Claude-style `questions[]`.
- `decision_request`: the package's canonical generic shape.

Option entries may use `value`, `label`, and `description`. Prompt fields may
use `question`, `prompt`, `text`, `message`, or `title`.

## Decision order

1. The child Pi receives all normalized questions in one JSON prompt.
2. A valid child answer wins.
3. If child startup, timeout, output parsing, or validation fails, the router
   chooses an option marked recommended/default/positive.
4. If no marker exists, it chooses the first option.
5. An open confirmation falls back to `yes`; another open prompt falls back to
   `auto`.

Every decision records the source (`child-agent` or `fallback`), reason,
confidence, tool name, normalized question, and selected answer.

## Child process boundary

The child command is equivalent to:

```text
pi --print --no-session --no-tools --no-extensions --no-skills \
  --no-prompt-templates --no-themes --no-context-files \
  --thinking off <decision prompt>
```

The parent can select the provider/model with environment variables. The child
does not inherit the active project package or `AGENTS.md`, preventing recursive
question routing and project-side effects.

## UI shim

For active Pi extension contexts, the router wraps `ctx.ui.select`,
`ctx.ui.confirm`, `ctx.ui.input`, `ctx.ui.editor`, and (for the rpiv questionnaire
event) `ctx.ui.custom` before a tool executes. This is a best-effort compatibility
layer, not a new Pi API. Calls made by an extension before the router is loaded,
outside the active context, or in another process cannot be guaranteed to route.
The package does not register duplicate `AskUserQuestion` aliases because Pi
rejects same-name custom tools from different extensions.

## Audit log

Default path:

```text
~/.pi/agent/pi-decision-router/audit.jsonl
```

Override with `PI_DECISION_ROUTER_AUDIT_LOG`. The file can contain question text
and recent context-derived details. Treat it as sensitive local data.

Inspect recent entries in Pi:

```text
/decision-router-log
```
