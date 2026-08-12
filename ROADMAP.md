# Roadmap

## v0.1 MVP — generic unattended decision routing

- [x] Generic decision normalization for common Pi question tool shapes.
- [x] Child Pi delegation with tools, extensions, skills, context files, and sessions disabled.
- [x] Recommended-option fallback when child execution fails.
- [x] JSONL audit log outside the vault.
- [x] Best-effort `ctx.ui.select/confirm/input` shim.
- [x] Project-trust auto-approval for unattended sessions.
- [x] Status and audit-log commands.
- [x] Runtime ON/OFF toggle with native UI delegation while disabled.

## v0.2 — stronger integration

- Add an explicit Pi hook/API proposal for replacing arbitrary UI dialogs without monkey-patching.
- Add adapters for additional agent runtimes and MCP question schemas.
- Add configurable policy profiles (`unattended`, `recommended-only`, `observe`).
- Add redaction rules and audit-log rotation.

## Non-goals

- Modifying gstack source code.
- Providing tools to the child decision agent.
- Silently blocking unknown third-party question tools.
- Permanent shell/PATH mutation.
