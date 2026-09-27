# Changelog

## 0.3.1 - 2026-09-27

- chore: periodic patch bump after 7+ days without npm publish

## [0.3.0] - 2026-08-23

### Maintenance

- Version housekeeping release via pull request; no functional changes since 0.2.0.

## [0.2.0] - 2026-08-23

### Added

- Post-turn automatic compaction at configurable 95% and 100% context thresholds.
- Pre-compaction warning, completion status, and hidden continuation for interrupted tool work.
- Persisted Router Mode: `/decision-router-toggle` saves `{enabled,
  autoCompactionEnabled}` per project directory in
  `~/.pi/agent/pi-decision-router/state.json` and restores it at session start;
  explicit environment variables keep precedence over persisted state.
- `CONTEXT.md` glossary and ADR 0001 documenting the storage decision.

## [0.1.0] - 2026-08-12

### Added

- Generic Pi decision routing for common question and confirmation tools.
- Tool-disabled child Pi delegation with deterministic fallback.
- JSONL audit logging and status/log commands.
- Best-effort UI dialog shim and project-trust auto-approval.
- Runtime `/decision-router-toggle` command with visible `ON`/`OFF` status.
