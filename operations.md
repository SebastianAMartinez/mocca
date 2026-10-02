# Operations

Production is one DigitalOcean server running Caddy, the Mocca API, and PostgreSQL with Docker Compose. Cloudflare provides DNS; Caddy terminates HTTPS. PostgreSQL is not published to the internet. Daily encrypted database backups go to Backblaze B2 through Restic. Keep production credentials in private files or a password manager, never in Git.

The current API hostname is `mocca-api.sebastianamartinez.com`; its DNS, Better Auth provider settings, and mobile production build must move together if the hostname changes.

## Local Development

Requirements: Node.js 24, pnpm 12.5.1, and Docker Compose.

```bash
pnpm install
cp .env.example .env
cp apps/server/.env.example apps/server/.env
cp packages/db/.env.example packages/db/.env
cp apps/mobile/.env.example apps/mobile/.env.local
docker volume create mocca-postgres-data
docker compose up -d --remove-orphans postgres
docker compose ps
```

Use the same local PostgreSQL password in the root, server, and database environment files. Add development Google/Apple credentials to `apps/server/.env` before testing sign-in. The first local migration also needs the `mocca_app` role: connect with `docker compose exec postgres psql -U postgres -d mocca`, run `CREATE ROLE mocca_app LOGIN;`, then `\password mocca_app` at the prompt.

If an older ignored `.env` still has `SEAWEEDFS_ACCESS_KEY_ID` or `SEAWEEDFS_SECRET_ACCESS_KEY`, remove those unused entries; do not commit or print the file.

The local SeaweedFS container has been removed; its `mocca-seaweedfs-data` volume remains for review. On other existing checkouts, `--remove-orphans` stops the old container but leaves its volume untouched. Delete a SeaweedFS volume only after confirming its contents are not needed.

Run the API and mobile app in separate terminals. Generate and review migrations before applying them.

```bash
pnpm --filter @mocca/server dev
pnpm --filter @mocca/mobile start
pnpm --filter @mocca/db db:generate
pnpm --filter @mocca/db db:migrate
pnpm check
```

## Deployment

Pull requests run `pnpm check`, the server build, both Compose configuration checks, and a production API Docker build. After checks pass, a push to `main` deploys automatically. GitHub Actions connects over SSH, runs `git pull --ff-only origin main`, builds the API on the server, and smoke-tests the new image against PostgreSQL before replacing the running API. It then runs `docker compose up --detach --remove-orphans --wait`. This removes the old SeaweedFS container but does not delete its volume. After the first successful deployment, remove the unused SeaweedFS access-key entries from the private `.env.production`; keep the volume until its contents are confirmed disposable. Database migrations remain a separate reviewed operation; deployment never runs them.

After deployment succeeds, semantic-release analyzes Conventional Commit messages on `main` and creates a `vX.Y.Z` Git tag and GitHub Release. The release job uses the workflow's `GITHUB_TOKEN` with `contents: write`; no GitHub App or extra release secret is needed. Squash-merge PR titles should use Conventional Commit format. No npm packages are published. With no prior tags, the first release analyzes the repository's existing history; a dry-run against the current `main` history predicts `v1.0.0`.

Configure a GitHub `production` environment with these variables and secret:

| Name | Type | Purpose |
| --- | --- | --- |
| `PRODUCTION_HOST` | Variable | Droplet hostname or IP, without a port |
| `PRODUCTION_USER` | Variable | SSH deployment user |
| `PRODUCTION_KNOWN_HOSTS` | Variable | Host key verified against the Droplet |
| `PRODUCTION_SSH_PRIVATE_KEY` | Secret | Dedicated Actions SSH private key |

The server needs Docker Compose, Git, a clean `main` checkout at `/home/sebastian/mocca`, the private `.env.production`, and a read-only GitHub deploy key so that checkout can pull this private repository. The Actions key must be installed for the deployment user without a forced command; keep the SSH `restrict` key option, verify the host fingerprint out of band, and grant the user access to the checkout and Docker. Docker group access is effectively root access on the server. Do not share this key with other workflows or users.

Create an unencrypted Ed25519 key specifically for Actions, install its public half for the deployment user, and store its private half as the environment secret. Set the three environment variables in the repository settings. Do not enable required human approval on the production environment if merges are expected to deploy unattended.

For a manual deployment, connect as the configured user and run:

```bash
cd /home/sebastian/mocca
git pull --ff-only origin main
compose=(docker compose --env-file .env.production -f compose.production.yaml)
"${compose[@]}" build api
"${compose[@]}" run --rm --no-deps --entrypoint sh api -ec '
	node dist/server.js &
	api_pid=$!
	trap "kill \"$api_pid\" 2>/dev/null || true" EXIT
	for attempt in $(seq 1 30); do
		if ! kill -0 "$api_pid" 2>/dev/null; then exit 1; fi
		if node -e "fetch(\"http://127.0.0.1:3000/health\").then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"; then exit 0; fi
		sleep 1
	done
	exit 1
'
"${compose[@]}" up --detach --remove-orphans --wait --wait-timeout 180
curl -fsS https://mocca-api.sebastianamartinez.com/health
```

Compose waits for PostgreSQL and the API health check. It does not retain or automatically restore the previous API image if the new one fails. Check logs and use the recovery steps below; do not run `docker compose down --volumes` in production.

## Production Checks

Run these from `/home/sebastian/mocca` on the server:

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail 100 api
docker compose --env-file .env.production -f compose.production.yaml logs --tail 100 postgres
docker compose --env-file .env.production -f compose.production.yaml restart api
curl -fsS https://mocca-api.sebastianamartinez.com/health
```

Only Caddy publishes ports 80 and 443. PostgreSQL has a persistent Docker volume and stays on the internal `backend` network shared by the API and one-shot database jobs. Caddy uses the separate `edge` network and cannot connect directly to PostgreSQL.

## Database

Review Drizzle migration SQL and take a backup before a production migration. Recreate or update the runtime role when needed, then apply migrations as a separate operation:

```bash
docker compose --env-file .env.production -f compose.production.yaml --profile setup run --rm db-role
docker compose --env-file .env.production -f compose.production.yaml --profile migrations run --rm migrate
```

Backups live in a private Backblaze B2 bucket. The server reads credentials from root-owned `/etc/mocca-backup.env`; keep its Restic password and `.env.production` recovery copy off-server in a password manager. The daily job stores a custom-format `pg_dump`; the weekly job retains 7 daily, 4 weekly, and 12 monthly snapshots and checks repository data.

For a new or rebuilt server, install Restic 0.17 or newer and `jq`, create `/etc/mocca-backup.env` from the example, and fill in the private B2 bucket, scoped application key, region, and Restic password. Keep the Restic password outside the server as well.

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

The live host's timers were previously enabled; check them after any server rebuild rather than assuming they survived.

Create a backup or inspect recent backups:

```bash
sudo systemctl start mocca-backup.service
sudo journalctl -u mocca-backup.service
sudo bash -c 'set -a; . /etc/mocca-backup.env; set +a; restic snapshots --tag postgres'
```

Test that the latest backup restores into an isolated PostgreSQL container. This does not change production data:

```bash
sudo bash ops/restore-check-production.sh
```

### Restore PostgreSQL

Restoring overwrites the selected database and loses writes made after that backup. List the snapshots, choose the one to restore, and accept that loss before proceeding:

```bash
sudo bash -c 'set -a; . /etc/mocca-backup.env; set +a; restic snapshots --tag postgres'
```

Set the selected snapshot ID below and confirm the destructive restore before stopping the API, starting PostgreSQL, and recreating the runtime role from `.env.production`:

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

Recreate the empty database and stream the selected dump into it:

```bash
"${compose[@]}" exec -T postgres sh -ec 'dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
sudo bash -c 'set -a; . /etc/mocca-backup.env; set +a; restic dump "$1" mocca-postgres.dump' _ "$snapshot_id" |
	"${compose[@]}" exec -T postgres sh -ec 'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --no-acl --exit-on-error'
"${compose[@]}" exec -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "GRANT USAGE ON SCHEMA public TO mocca_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mocca_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mocca_app"'
"${compose[@]}" --profile migrations run --rm migrate
"${compose[@]}" up --detach --remove-orphans --wait --wait-timeout 180
```

Verify the API health endpoint and inspect API/PostgreSQL logs before considering recovery complete.

## Recovery

- **Deployment failed:** inspect the failed GitHub Actions run, then `docker compose ... ps` and `logs api`. The deployment does not roll back automatically. Revert the change through a pull request, or deploy a known-good commit manually after checking the server checkout is clean and the database schema is compatible.
- **API is down:** inspect API and Caddy logs, confirm PostgreSQL is healthy, then restart the API and check `/health`.
- **PostgreSQL is unavailable:** inspect PostgreSQL logs and volume state; do not remove or recreate its volume. Restore from B2 only after choosing a snapshot and accounting for lost writes.
- **Server must be rebuilt:** reinstall Docker/Compose, restore the private repository checkout, `.env.production`, and `/etc/mocca-backup.env` from secure copies, reconnect the read-only GitHub deploy key, then follow the PostgreSQL restore procedure. Cloudflare DNS and Caddy certificates can remain unchanged if the server IP is unchanged.

The SeaweedFS container is removed as an orphan on the first simplified deployment. Its named volume is deliberately left behind. Inspect it and delete it manually only after confirming its contents are not needed; future photos should use managed S3-compatible storage such as R2 or B2.