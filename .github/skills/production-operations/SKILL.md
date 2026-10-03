---
name: production-operations
description: "Use when: deploying, migrating, backing up, restoring, or troubleshooting Mocca production infrastructure, GitHub Actions, Docker Compose, the DigitalOcean Droplet, PostgreSQL, Caddy, Restic, or Backblaze B2."
---

# Production Operations

Use this skill only for production and release operations. Treat `operations.md` as the source of truth and read the relevant section before proposing or running commands.

## Workflow

1. Identify whether the request concerns releases, deployment, database changes, backups, or recovery.
2. Read the matching section of `operations.md` and the referenced workflow, Compose, or `ops/` files.
3. Check the current branch, worktree, service state, and relevant CI result before changing anything.
4. Prefer read-only checks and reversible actions. State clearly when a command affects production.
5. Validate the result with the documented health, CI, backup, or restore check.

## Safety Boundaries

- Never print, request through chat, or commit secrets, environment files, private keys, or registry credentials.
- Never run `docker compose down --volumes` against production.
- Never discard server-side or local changes to make a pull succeed; stop if the checkout is dirty or cannot fast-forward.
- Keep migrations separate from API deployment. Require a verified backup before a production migration.
- Deployment is manual after CI checks pass on `main`; GitHub Actions does not connect to the Droplet. Never initiate a production deployment unless explicitly requested.
- Use an authorized SSH identity, verify the server host key, and protect production environment secrets. Docker access is root-equivalent; grant it only to trusted operators.
- Treat database restore as a last resort requiring explicit user approval because it can discard newer writes.

Do not copy operational commands into this skill. Update `operations.md` when procedures change so there is one maintained runbook.