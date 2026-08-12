# Contributing

## Development

```bash
npm install
npm run ci
```

Test the extension locally:

```bash
pi -e .
```

Keep the child agent tool-disabled. Changes to decision policy must include
normalization, fallback, or child-response tests and an audit-log note.

## Pull requests

- Run `npm run ci`.
- Update `docs/usage.md` when behavior changes.
- Update `CHANGELOG.md` for user-facing changes.
- Do not add long-lived API keys or `NPM_TOKEN`.

## Release

```bash
npm version patch
git push
```

GitHub Actions publishes through npm Trusted Publishing. See `docs/release.md`.
