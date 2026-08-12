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

## Runtime toggle

The router starts `ON` by default. The status bar displays the current state:

```text
Decision Router: [ON] | Enter /decision-router-toggle to switch
```

Run `/decision-router-toggle` and press Enter to switch between `ON` and `OFF`.
While `OFF`, the canonical `decision_request` tool is removed from the active
tool list, supported UI adapters delegate to Pi's native dialogs, and the
router does not inject its automatic-decision guidance into the agent prompt.
The toggle lasts for the current Pi process only; use
`PI_DECISION_ROUTER_ENABLED=0` for a disabled startup.

## Automatic compaction

The router enables its own post-turn compaction trigger by default:

1. `turn_end` reads `ctx.getContextUsage().percent`.
2. At `95%` or higher, it displays a warning before compaction starts.
3. At `100%`, it uses the emergency path and does not wait for a fresh low-usage cycle.
4. After compaction, it displays completion.
5. If the interrupted turn had tool calls or tool results, it queues a hidden
   `followUp` message so Pi continues and returns the final response.

The environment variables are:

```text
PI_DECISION_ROUTER_AUTO_COMPACTION=1
PI_DECISION_ROUTER_COMPACTION_THRESHOLD_PERCENT=95
PI_DECISION_ROUTER_COMPACTION_EMERGENCY_PERCENT=100
```

Set `PI_DECISION_ROUTER_AUTO_COMPACTION=0` to leave only Pi's native compaction
behavior. The router does not replace Pi's native threshold compaction or change
the global `reserveTokens`/`keepRecentTokens` settings. Context usage is only
available when Pi reports it; if it is unknown, the router does nothing.

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
