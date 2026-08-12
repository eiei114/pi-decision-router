# Release

This package uses npm Trusted Publishing with GitHub Actions OIDC.
Do not add `NPM_TOKEN` or long-lived npm tokens to GitHub Secrets.

## One-time npm setup

On npmjs.com, configure a Trusted Publisher for:

- Repository: `eiei114/pi-decision-router`
- Workflow filename: `publish.yml`

## Publish

```bash
npm version patch
git push
```

The `auto-release.yml` workflow creates the `v<version>` tag and GitHub
Release, then explicitly dispatches `publish.yml` for that tag. `publish.yml`
uses the tag ref, runs CI, and publishes the root package with provenance.

Publishing is human-owned. Verify the release and npm provenance after the
workflow completes.
