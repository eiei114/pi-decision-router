# Security Policy

## Supported versions

Only the latest published version receives security fixes.

## Reporting a vulnerability

Open a private GitHub security advisory. Include the affected version, impact,
reproduction steps, and a suggested fix if known.

## Important behavior

This extension can auto-approve confirmations and can execute a child Pi process.
The child is started with no tools and no project resources, but the parent still
controls its model credentials and audit-log destination. Review configuration and
protect the JSONL audit log.
