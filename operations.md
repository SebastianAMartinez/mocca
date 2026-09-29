# Operations

This document covers local database work and the production release, deployment, backup, and recovery procedures. Keep credentials in private environment files or a password manager; never commit them.

## Local Database

The root `.env.example` configures local PostgreSQL and SeaweedFS. The PostgreSQL data volume is external (`mocca-postgres-data`), so create it once before starting Compose if it is not already present:

```bash
docker volume create mocca-postgres-data
docker compose up -d
docker compose ps
```

The database package reads its migration connection from `packages/db/.env`. Generate and inspect migrations before applying them:

```bash
pnpm --filter @mocca/db db:generate
pnpm --filter @mocca/db db:migrate
```

`db:migrate` first grants the `mocca_app` runtime role default CRUD privileges on new public tables and usage/select on new sequences, then applies pending migrations. The runtime role must exist before migrations. It cannot create tables or run migrations. To reapply default privileges independently, use `pnpm --filter @mocca/db db:grant-default-privileges`.

## Production Stack

Production is defined by `compose.production.yaml`: PostgreSQL and SeaweedFS are on an internal network, Fastify is reachable through Caddy, and only Caddy publishes ports 80 and 443. The production environment template is `.env.production.example`. Before initial deployment, configure the production DNS record and firewall, create a private `.env.production` with unique database, Better Auth, and provider credentials, and make sure ports 80 and 443 reach the server.

Initial provisioning commands run from the repository checkout on the server:

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d postgres seaweedfs
docker compose --env-file .env.production -f compose.production.yaml --profile setup run --rm db-role
docker compose --env-file .env.production -f compose.production.yaml --profile migrations run --rm migrate
docker compose --env-file .env.production -f compose.production.yaml up -d api caddy
docker compose --env-file .env.production -f compose.production.yaml ps
curl -fsS https://mocca-api.sebastianamartinez.com/health
```

The migration job uses the PostgreSQL administrator connection; the API uses the restricted `mocca_app` role. Caddy obtains and renews certificates after DNS resolves to the server and inbound ports are reachable. Never run `docker compose down --volumes` against production.

## Releases and Deployment

CI runs formatting, linting, type checks, tests, and the server build. Pull requests also build the production API image. On `main`, Changesets creates a version PR; merging it publishes a package release. When `@mocca/server` is released, CI publishes the API image tagged with both the source commit SHA and the server version to `ghcr.io/sebastianamartinez/mocca-api`.

For an API change that should be released, run `pnpm changeset`, select `@mocca/server`, choose the semantic version bump, and include a concise summary. Commit the generated file in `.changeset/` with the feature pull request. After it merges to `main`, review the generated version PR and changelog before merging it. API-affecting changes in shared packages should include a server changeset.

The Changesets workflow requires a GitHub App installed only for this repository with **Contents: Read and write** and **Pull requests: Read and write** permissions. Under **Settings > Actions > General**, allow GitHub Actions to create and approve pull requests. Configure the App ID as repository variable `MOCCA_CHANGESETS_APP_ID` and its PEM private key as secret `MOCCA_CHANGESETS_APP_PRIVATE_KEY`. Set the values without printing or committing the private key:

```bash
gh variable set MOCCA_CHANGESETS_APP_ID --body '<app-id>'
gh secret set MOCCA_CHANGESETS_APP_PRIVATE_KEY < /path/to/mocca-changesets.private-key.pem
```

The release job is skipped while the App ID is unset; a missing or invalid private key fails the job. The version/release path has not yet completed a release, so verify it before enabling production automation.

### Restricted manual deployment

The production deploy script accepts one full 40-character lowercase commit SHA through the restricted SSH command. It requires the current API container to be healthy, pulls that immutable image, updates only the API service, waits for its health check, and attempts to restore the prior healthy image if the rollout fails. It does not run migrations or alter PostgreSQL, SeaweedFS, or Caddy.

The restricted account and forced-command SSH key are provisioned by an administrator. Follow `ops/mocca-deploy-ssh-command.sh` and `ops/deploy-production-api.sh`; allow only the root-owned deployment entry point through sudo. The deploy identity must have no interactive access or unrelated authorized keys. Root's Docker client on the server must be authenticated to GHCR with package-read access.

Provision the account and install the root-owned commands from a checkout at `/home/sebastian/mocca`:

```bash
sudo adduser --disabled-password --gecos "" mocca-deploy
sudo install -o root -g root -m 0755 ops/deploy-production-api.sh /usr/local/sbin/mocca-deploy-production-api
sudo install -o root -g root -m 0755 ops/mocca-deploy-ssh-command.sh /usr/local/sbin/mocca-deploy-ssh-command
printf '%s\n' 'mocca-deploy ALL=(root) NOPASSWD: /usr/local/sbin/mocca-deploy-production-api' | sudo tee /etc/sudoers.d/mocca-deploy >/dev/null
sudo chmod 0440 /etc/sudoers.d/mocca-deploy
sudo visudo -cf /etc/sudoers.d/mocca-deploy
sudo install -d -o mocca-deploy -g mocca-deploy -m 0700 /home/mocca-deploy/.ssh
sudoedit /home/mocca-deploy/.ssh/authorized_keys
sudo chown mocca-deploy:mocca-deploy /home/mocca-deploy/.ssh/authorized_keys
sudo chmod 0600 /home/mocca-deploy/.ssh/authorized_keys
```

Put only a dedicated public key in `authorized_keys`, prefixed with `restrict,command="/usr/local/sbin/mocca-deploy-ssh-command"`. Do not reuse a personal key. Authenticate root's Docker CLI to GHCR with package-read access using `sudo docker login ghcr.io --username <github-user>`; enter the token only at Docker's password prompt. Protect root's Docker credentials as a secret. The deployment script expects the checkout and `.env.production` at `/home/sebastian/mocca`.

After a release image and commit have been verified, a manual deployment is:

```bash
ssh mocca-deploy@<production-host> deploy <full-40-character-commit-sha>
```

Only deploy a SHA that has passed CI and has a published image. The currently verified route is this restricted manual deployment.

### Automated deployment gate

Automated production deployment is intentionally disabled. Do not set `MOCCA_PRODUCTION_DEPLOY_ENABLED=true` until a versioned release has been verified and a manual deployment of its SHA has succeeded. When ready, first configure the `production` GitHub environment, restrict it to `main`, and review its approval policy. Set these environment-scoped values:

| Name | Type | Purpose |
| --- | --- | --- |
| `MOCCA_PRODUCTION_DEPLOY_HOST` | Variable | Production SSH host, without a port |
| `MOCCA_PRODUCTION_KNOWN_HOSTS` | Variable | Verified pinned SSH host key |
| `MOCCA_PRODUCTION_SSH_PRIVATE_KEY` | Secret | Dedicated restricted deploy key |

Verify the host key fingerprint against the Droplet through a trusted administrator session before storing its `known_hosts` line. The workflow enforces strict host-key checking and uses SSH port 22. Only after release, manual deploy, host verification, and environment configuration are complete should the repository variable `MOCCA_PRODUCTION_DEPLOY_ENABLED` be set to the exact value `true`. The workflow deploys only a released `@mocca/server` image; it does not run migrations. Set the variable to `false` to pause automatic deployment.

To pin the SSH host key, first obtain the Ed25519 fingerprint through a trusted administrator session on the server:

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

On the trusted local machine, fetch the key and compare its fingerprint to the server value before using it:

```bash
ssh-keyscan -t ed25519 <production-host> 2>/dev/null > ~/.ssh/mocca-production-known_hosts
awk '{ print $2, $3 }' ~/.ssh/mocca-production-known_hosts | ssh-keygen -lf /dev/stdin
gh variable set MOCCA_PRODUCTION_DEPLOY_HOST --env production --body '<production-host>'
gh variable set MOCCA_PRODUCTION_KNOWN_HOSTS --env production < ~/.ssh/mocca-production-known_hosts
```

Use a dedicated CI key whose private half is available non-interactively to the runner. Its public key must have the same forced-command restriction in `/home/mocca-deploy/.ssh/authorized_keys`:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/mocca-actions-deploy -C "mocca GitHub Actions deploy"
gh secret set MOCCA_PRODUCTION_SSH_PRIVATE_KEY --env production < ~/.ssh/mocca-actions-deploy
```

Do not set `MOCCA_PRODUCTION_DEPLOY_ENABLED` until a versioned release is verified, its manual restricted-key deployment has succeeded, and the production environment values and pinned host key are checked. Enable it only as the final step:

```bash
gh variable set MOCCA_PRODUCTION_DEPLOY_ENABLED --body true
```

Check workflow runs with `gh run list --workflow ci.yml --branch main`.

## Database Changes and Rollback

Drizzle migrations are forward-only. Review generated SQL and test it before production. Use an expand-and-contract sequence: add backward-compatible schema, deploy code that supports old and new schema, migrate data as a separate reviewed operation, then remove obsolete schema only after the previous API image is no longer a rollback candidate.

Before every production migration, take a backup and verify it with the isolated restore-check script. Apply migrations as a separate, reviewed operation before deploying API code that requires them. If an API rollout fails, roll the API back only if it remains compatible with the migrated schema. Restoring PostgreSQL discards writes made after the backup and requires an explicit operator decision.

## Backups and Restore Checks

The production backup scripts use Restic with Backblaze B2's S3-compatible API. PostgreSQL is backed up online as a custom-format dump. SeaweedFS is stopped while its data volume is archived, then restarted; object-storage requests are unavailable during that archive. Revisit this approach before enabling photo uploads.

Use a private, dedicated B2 bucket and an application key scoped to that bucket. Grant `listAllBucketNames`, `listFiles`, `readFiles`, `writeFiles`, and `deleteFiles`; Restic needs delete access for retention. Configure the bucket to retain only the latest object version. Restic encrypts backup contents, but a compromised server can still delete backups. Install Restic 0.17.0 or newer and `jq` on the server.

Create `/etc/mocca-backup.env` from `ops/backup-b2.env.example`, owned by root with mode `0600`. Set the B2 repository, region, application key ID and key, and a unique Restic repository password. Store a copy of the Restic password and production environment secrets off-server in a password manager; the backups do not include `.env.production` or `/etc/mocca-backup.env`.

```bash
sudo install -o root -g root -m 600 ops/backup-b2.env.example /etc/mocca-backup.env
sudo nano /etc/mocca-backup.env
restic version
```

The backup scripts require Restic 0.17.0 or newer for `--stdin-from-command`, and `jq` is required by the restore check. Use the [official Restic installation instructions](https://restic.readthedocs.io/en/stable/020_installation.html) if the distribution package is older.

Initialize the repository, take a backup, and test a restore before enabling the schedule:

```bash
sudo bash -c 'set -a; . /etc/mocca-backup.env; set +a; restic init'
sudo bash ops/backup-production.sh
sudo bash ops/restore-check-production.sh
```

The restore check restores PostgreSQL into an isolated container, restores SeaweedFS into a temporary volume, and starts it with networking disabled. It removes only those temporary resources; it does not modify production data.

Install and enable the daily backup and weekly retention/integrity timers:

```bash
sudo install -o root -g root -m 644 ops/mocca-backup.service ops/mocca-backup.timer ops/mocca-backup-prune.service ops/mocca-backup-prune.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mocca-backup.timer mocca-backup-prune.timer
systemctl list-timers 'mocca-backup*'
```

The schedule retains seven daily, four weekly, and twelve monthly snapshots. The weekly job prunes unused Restic data and checks a 10% subset of repository data. Inspect recent runs with:

```bash
sudo journalctl -u mocca-backup.service
sudo journalctl -u mocca-backup-prune.service
```

The B2 backup and isolated restore check have succeeded, and both timers are enabled. Continue monitoring scheduled runs and periodically repeat restore checks. Disaster recovery also requires recreating the runtime database role using saved production environment values before restoring the database.