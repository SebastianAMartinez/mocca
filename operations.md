# Operations

## Production at a glance

Mocca runs on one DigitalOcean Droplet:

```text
Internet -> Caddy (ports 80/443, HTTPS) -> Mocca API -> PostgreSQL
                 edge network          backend network
```

Caddy terminates TLS for `mocca-api.sebastianamartinez.com`. The API and PostgreSQL run in Docker Compose. PostgreSQL has a persistent Docker volume, is not published to the host, and is reachable only on the internal `backend` network. Daily PostgreSQL dumps are encrypted by Restic and stored in Backblaze B2.

The old `mocca-seaweedfs-data` Docker volume is intentionally not part of the Compose stack. The first deployment with `--remove-orphans` stops the old SeaweedFS container but does not delete that volume. Leave it for manual review or migration; do not remove it until its contents are confirmed disposable. If an older ignored `.env` or `.env.production` still has `SEAWEEDFS_ACCESS_KEY_ID` or `SEAWEEDFS_SECRET_ACCESS_KEY`, remove those unused entries without printing or committing the file.

## Normal workflow

1. Open a pull request into `main`. CI installs dependencies, checks formatting, linting, types and tests, builds the server, validates both Compose files, and builds the production API image.
2. After checks pass and the PR is merged, the push to `main` deploys automatically. GitHub Actions SSHes to the Droplet, fast-forwards its checkout, builds and smoke-tests the API image, then starts the stack and waits for service health.
3. Migrations are a separate reviewed operation; deployment does not run them.
4. Check production with the commands below. Deployment has no automatic rollback.

For releases, keep Conventional Commit messages (checked locally by Husky and Commitlint) and create version tags manually. For example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Server setup and secrets

The Droplet needs Git, Docker with the Compose plugin, and a clean repository checkout at `/home/sebastian/mocca` on `main`. It also needs the private `.env.production`, a read-only GitHub deploy key for fetching the private repository, and a dedicated deployment SSH user with access to the checkout and Docker. Docker access is effectively root access.

Configure the GitHub `production` environment:

| Name | Type | Purpose |
| --- | --- | --- |
| `PRODUCTION_HOST` | Variable | Droplet hostname or IP, without a port |
| `PRODUCTION_USER` | Variable | Dedicated SSH deployment user |
| `PRODUCTION_KNOWN_HOSTS` | Variable | Pinned host key verified against the Droplet |
| `PRODUCTION_SSH_PRIVATE_KEY` | Secret | Dedicated Actions SSH private key |

Verify the Droplet host fingerprint out of band. The Actions key must be installed for the deployment user, with no forced command. Keep it separate from the repository's read-only deploy key. Store production authentication, database and Caddy values in the private `.env.production`; use [.env.production.example](./.env.production.example) as the variable reference. Never commit or print secret files. The production API domain is configured by `API_DOMAIN` and `BETTER_AUTH_URL`; keep both on `mocca-api.sebastianamartinez.com` along with the mobile production URL and provider callback settings.

## Deploy and inspect

CI deploys only after checks pass on `main`. On the server, a manual deployment (only when needed) follows the same sequence: verify the checkout is clean, pull with `git pull --ff-only origin main`, build `api`, run the image's `/health` smoke test against PostgreSQL, then run Compose with `up --detach --remove-orphans --wait --wait-timeout 180`. Do not deploy over local server changes. A failed deploy does not restore the previous image automatically; see Recovery.

Run on the Droplet from `/home/sebastian/mocca`:

```bash
compose=(docker compose --env-file .env.production -f compose.production.yaml)
"${compose[@]}" ps
"${compose[@]}" logs --tail 100 api
"${compose[@]}" logs --tail 100 caddy
"${compose[@]}" logs --tail 100 postgres
curl -fsS https://mocca-api.sebastianamartinez.com/health
```

Only Caddy publishes ports 80 and 443. Caddy reaches the API on `edge`; PostgreSQL is isolated on `backend`, shared with the API and one-shot database jobs.

## Database migrations

Review generated Drizzle SQL and verify a recent backup before any production migration. The runtime uses the restricted `mocca_app` role; the setup profile creates or updates it using the PostgreSQL administrator credentials. Then apply migrations separately:

```bash
docker compose --env-file .env.production -f compose.production.yaml --profile setup run --rm db-role
docker compose --env-file .env.production -f compose.production.yaml --profile migrations run --rm migrate
```

## Backups

The backup path is PostgreSQL `pg_dump` -> Restic -> Backblaze B2. `mocca-backup.timer` runs [backup-production.sh](./ops/backup-production.sh) daily; `mocca-backup-prune.timer` runs [prune-production.sh](./ops/prune-production.sh) weekly. The backup is a custom-format dump tagged `postgres`. Pruning retains 7 daily, 4 weekly and 12 monthly snapshots, then checks a data subset.

Both systemd services read root-owned `/etc/mocca-backup.env`. The required settings are `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_DEFAULT_REGION`. `COMPOSE_DIR` optionally overrides `/home/sebastian/mocca`. Keep the B2 key scoped to this backup bucket and keep the Restic password and a recovery copy of `.env.production` off-server as well.

To configure backups on a new or rebuilt host, install Restic 0.17 or newer, `jq`, and Docker; create the private environment file from [backup-b2.env.example](./ops/backup-b2.env.example), initialize Restic once, run a backup and isolated restore check, and enable the timers:

```bash
sudo install -o root -g root -m 0600 ops/backup-b2.env.example /etc/mocca-backup.env
sudoedit /etc/mocca-backup.env
sudo bash -c 'set -a; . /etc/mocca-backup.env; set +a; restic init'
sudo bash ops/backup-production.sh
sudo bash ops/restore-check-production.sh
sudo install -o root -g root -m 0644 ops/mocca-backup.service ops/mocca-backup.timer ops/mocca-backup-prune.service ops/mocca-backup-prune.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mocca-backup.timer mocca-backup-prune.timer
```

The restore-check script restores the latest tagged dump into a temporary isolated PostgreSQL container and verifies that it contains public tables; it does not change production data. Check the backup timers after rebuilding a server.

To run or inspect a backup:

```bash
sudo systemctl start mocca-backup.service
sudo journalctl -u mocca-backup.service
sudo systemctl list-timers 'mocca-backup*'
sudo bash -c 'set -a; . /etc/mocca-backup.env; set +a; restic snapshots --tag postgres'
sudo bash ops/restore-check-production.sh
```

## Recovery and rebuild

- **Deployment failed:** inspect the GitHub Actions run and API/Caddy logs. Revert through a pull request, or manually deploy a known-good commit only after verifying the server checkout is clean and the database schema is compatible.
- **API unavailable:** check Compose status and API, Caddy and PostgreSQL logs. Confirm PostgreSQL is healthy, then restart the API with `"${compose[@]}" restart api` and check the public health endpoint.
- **PostgreSQL unavailable:** inspect PostgreSQL logs and the persistent volume. Do not remove or recreate the volume. Restore from B2 only after selecting a snapshot and accounting for writes that will be lost.
- **Server rebuild:** install Docker/Compose, Git, Restic and `jq`; restore the private checkout, `.env.production` and `/etc/mocca-backup.env` from secure copies; reinstall the read-only GitHub deploy key and pinned Actions SSH access; then start the stack, run migrations if needed, configure and verify backups, and check the public health endpoint. Keep the Droplet IP/DNS and Caddy certificate data where possible.

### Restore PostgreSQL

This replaces the current production database and loses writes made after the chosen snapshot. Take a fresh backup if possible, verify the target snapshot, and proceed only when that data loss is understood.

List backups and select the snapshot ID:

```bash
sudo bash -c 'set -a; . /etc/mocca-backup.env; set +a; restic snapshots --tag postgres'
```

The following first asks for an explicit confirmation, then stops the API, starts PostgreSQL and ensures the runtime role exists:

```bash
set -Eeuo pipefail
snapshot_id='paste-the-confirmed-snapshot-id-here'
[[ "$snapshot_id" =~ ^[0-9a-f]{8,64}$ ]] || { printf 'Set a valid Restic snapshot ID first.\n' >&2; exit 1; }
read -r -p 'This replaces the Mocca database. Type RESTORE to continue: ' confirmation
[[ "$confirmation" == RESTORE ]] || { printf 'Restore cancelled.\n'; exit 1; }

cd /home/sebastian/mocca
compose=(docker compose --env-file .env.production -f compose.production.yaml)
"${compose[@]}" stop api
"${compose[@]}" up -d postgres
"${compose[@]}" --profile setup run --rm db-role
```

Recreate and restore the selected dump, apply current migrations, and start the stack:

```bash
"${compose[@]}" exec -T postgres sh -ec 'dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
sudo bash -c 'set -a; . /etc/mocca-backup.env; set +a; restic dump "$1" mocca-postgres.dump' _ "$snapshot_id" |
	"${compose[@]}" exec -T postgres sh -ec 'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --no-acl --exit-on-error'
"${compose[@]}" exec -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "GRANT USAGE ON SCHEMA public TO mocca_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mocca_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mocca_app"'
"${compose[@]}" --profile migrations run --rm migrate
"${compose[@]}" up --detach --remove-orphans --wait --wait-timeout 180
curl -fsS https://mocca-api.sebastianamartinez.com/health
```

## Local development

Requirements are Node.js 24, pnpm 12.5.1, and Docker Compose. Copy the tracked environment examples to ignored `.env` paths, use the same local PostgreSQL password in the root, server and database files, and add development Google/Apple credentials before testing sign-in.

```bash
pnpm install
docker volume create mocca-postgres-data
docker compose up -d --remove-orphans postgres
docker compose ps
pnpm --filter @mocca/server dev
pnpm --filter @mocca/mobile start
```

For a first local database migration, create the `mocca_app` role by connecting with `docker compose exec postgres psql -U postgres -d mocca`, running `CREATE ROLE mocca_app LOGIN;`, then `\password mocca_app`. Generate and review migrations before applying them. Run `pnpm check` for repository validation.
