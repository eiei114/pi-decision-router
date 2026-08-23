# Global state file with per-cwd map for Persisted Mode

Toggling `/decision-router-toggle` used to be session-local: every new session restarted with the router ON, which surprised users who had deliberately switched it off. We persist Router Mode as `{enabled, autoCompactionEnabled}` per working directory in one global file (`~/.pi/agent/pi-decision-router/state.json`) and restore it at session start.

We chose a global keyed map over project-local files (`.pi/*.json` in each repo) because the extension runs in arbitrary projects; writing state into every repo adds git noise the user did not ask for, while a single home-directory file keeps projects clean and still gives per-project memory. Explicit `PI_DECISION_ROUTER_*` environment variables win over Persisted Mode so CI and autopilot runs stay deterministic regardless of stale manual toggles.

## Considered Options

- Project-local `.pi/pi-decision-router.state.json` — rejected: pollutes every repository where Pi runs.
- Single global boolean — rejected: turning the router off for one project would silently disable it everywhere.
- Env-only configuration (status quo) — rejected: users cannot express "keep it off" without editing shell profiles.

## Consequences

- State survives session restarts and editor reloads in the same directory.
- Fresh clones/worktrees start with default ON until someone toggles there.
- Corrupt or missing state files are ignored best-effort, mirroring audit-log tolerance; a toggle must not fail because persistence failed.
