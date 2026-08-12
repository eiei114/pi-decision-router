# Pi Decision Router

[![CI](https://github.com/eiei114/pi-decision-router/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-decision-router/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-decision-router/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-decision-router/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-decision-router.svg)](https://www.npmjs.com/package/pi-decision-router)
[![npm downloads](https://img.shields.io/npm/dm/pi-decision-router.svg)](https://www.npmjs.com/package/pi-decision-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)

> Route Pi questions and confirmations to a child Pi agent, then keep an audit trail.

## What this is

`pi-decision-router` removes routine human-choice UI from unattended Pi runs. It
registers one conflict-free canonical decision tool, adapts common question-tool
shapes through Pi UI/event hooks, asks a tool-disabled child Pi for the decision,
and falls back to the recommended option when the child is unavailable.

This is intentionally generic. It does not depend on gstack and does not modify
gstack itself.

## Features

- Adapts `question`, `questionnaire`, `ask_question`, `ask_user_question`, and `AskUserQuestion` when their host exposes supported Pi UI/event hooks.
- Auto-answers `ctx.ui.select()`, `ctx.ui.confirm()`, and `ctx.ui.input()` when the active Pi context can be patched.
- Uses a child `pi --print --no-tools` process with strict JSON output.
- Persists JSONL decisions outside the vault for auditability.
- Never gives the child agent tools, extensions, skills, project context, or a session.
- Uses recommended/default/positive options first, then the first option as a deterministic fallback.

## Install

```bash
pi install npm:pi-decision-router
```

For local development:

```bash
pi -e C:/path/to/pi-decision-router/extensions/index.ts
```

## Configuration

The package is enabled by default for unattended operation.

| Variable | Default | Purpose |
|---|---:|---|
| `PI_DECISION_ROUTER_ENABLED` | `1` | Set `0` to disable routing. |
| `PI_DECISION_ROUTER_CHILD` | `1` | Set `0` to skip the child and use fallback decisions. |
| `PI_DECISION_ROUTER_TIMEOUT_MS` | `45000` | Child decision timeout. |
| `PI_DECISION_ROUTER_MODEL` | current model | Child Pi model pattern or ID. |
| `PI_DECISION_ROUTER_PROVIDER` | current provider | Child Pi provider. |
| `PI_DECISION_ROUTER_PI_BIN` | auto | Explicit Pi executable path. |
| `PI_DECISION_ROUTER_AUDIT_LOG` | `~/.pi/agent/pi-decision-router/audit.jsonl` | JSONL audit path. |

Useful commands:

```text
/decision-router-status
/decision-router-log
```

## Runtime boundary

Pi's public extension API can intercept registered tool calls and patch the
`ctx.ui` object supplied to active extension contexts. Multiple packages may
already own the same question-tool name, so this package deliberately does not
register duplicate aliases; it uses UI/event adapters instead. It cannot reliably
replace an arbitrary third-party process, a browser dialog, or a UI call made
before this extension is loaded. Unsupported question tools are left untouched
instead of being silently blocked.

## Security

This package intentionally auto-approves routine decisions, including destructive
confirmation dialogs, when configured for unattended use. The child agent runs
without tools, but it still receives the question and a bounded recent-conversation
excerpt. Review the package before installing it and protect the audit log.

See [`docs/usage.md`](docs/usage.md) for the decision contract and failure modes.

## Development

```bash
npm install
npm run ci
```

Run the local extension in Pi:

```bash
pi -e .
```

## Release

The package uses npm Trusted Publishing through GitHub Actions. No `NPM_TOKEN`
is required.

```bash
npm version patch
git push
```

See [`docs/release.md`](docs/release.md).

## Links

- npm: https://www.npmjs.com/package/pi-decision-router
- GitHub: https://github.com/eiei114/pi-decision-router
- Issues: https://github.com/eiei114/pi-decision-router/issues

## License

MIT
