# Mocca

Mocca is a mobile app to share notes, photos, and small moments. The first goal is a reliable app that works well on both phones. More advanced features will be added only when the core product is stable.

The project is also a practical exercise in building and operating a production-style TypeScript application while introducing infrastructure deliberately and learning to operate it responsibly.

## Current Status

Mocca is in the `v0.1` foundation phase. The monorepo, root tooling, CI workflow, Expo app, and Fastify/tRPC server are in place. The Drizzle database package defines the Better Auth schema, and local PostgreSQL runs under Docker Compose alongside SeaweedFS. Migrations configure default CRUD privileges for new public tables created by the migration role, while the server uses a dedicated least-privilege role. Expo sign-in with Google and Apple, protected routes, and sign-out work against the development API. The shared package workspace and root export are set up; shared domain contracts will be added when features need them. The production stack now runs behind Caddy at `mocca-api.sebastianamartinez.com`, with its health endpoint verified through Cloudflare. Application features and backup/restore processes remain outstanding.

## Architecture

```text
React Native/Expo
        |
      Caddy
        |
        v
  Fastify + tRPC
      |     |
  Drizzle  SeaweedFS
      |
  PostgreSQL
```

Better Auth uses PostgreSQL for Google and Apple social sign-in, and the Expo client stores its session cookie in SecureStore. Development API traffic uses a named Cloudflare Tunnel; production traffic reaches Fastify through Caddy and Cloudflare. Authorization remains the responsibility of the Fastify server. A user may access content only when they belong to the shared space that owns it. PostgreSQL and SeaweedFS use persistent storage and require tested backups and restores.

### Infrastructure decisions

- Mocca will be self-hosted on a VPS or dedicated server.
- Docker Compose will define the application, Caddy, PostgreSQL, and SeaweedFS services, networks, and persistent volumes.
- Caddy will be the reverse proxy and HTTPS entry point in production. Public DNS and ports 80 and 443 must be configured for automated certificates.
- HTTPS is a deployment concern rather than a separate application service. Caddy terminates public TLS and forwards requests to Fastify over the private Docker network; local development may use plain HTTP.
- PostgreSQL will store relational data, and SeaweedFS will provide S3-compatible object storage for photos.
- Database and object-storage backups, restore testing, upgrades, and server security are part of the deployment responsibility.
- Server-Sent Events may provide real-time updates to the mobile app later. iOS widgets will use operating-system-managed refreshes rather than persistent connections.

## Repository Structure

```text
apps/
  mobile/       Expo and React Native application
  server/       Fastify server and tRPC API

packages/
  db/           Drizzle schema, migrations, and database access
  shared/       Shared types, schemas, constants, and domain utilities
```

Each workspace should contain only code that belongs to its stated responsibility. The shared package is the home for contracts genuinely used by both mobile and server; it should not become a general-purpose location for unrelated code.

## Technology

### Mobile

- React Native and Expo
- TypeScript
- TanStack Query
- Expo Notifications
- EAS Build and EAS Update

### Server

- Node.js
- Fastify
- tRPC
- Pino

### Data and authentication

- Self-hosted PostgreSQL
- Drizzle ORM
- SeaweedFS for S3-compatible object storage
- Better Auth with Google and Apple social sign-in

### Tooling and infrastructure

- pnpm workspaces
- Biome
- Node.js `node:test`
- React Native Testing Library
- Changesets
- Husky and Commitlint
- GitHub Actions
- Sentry
- Docker Compose
- Caddy

## Development

### Requirements

- Node.js 24
- pnpm 12.5.1

Install dependencies:

```bash
pnpm install
```

Run all repository checks:

```bash
pnpm check
```

Start the local PostgreSQL and SeaweedFS services with Docker Compose:

```bash
docker compose up -d
docker compose ps
```

The PostgreSQL service reuses the external `mocca-postgres-data` volume and binds only to `127.0.0.1:5432`; SeaweedFS stores data in `mocca-seaweedfs-data` and exposes its authenticated S3 endpoint at `http://127.0.0.1:8333`. Copy `.env.example` to `.env`; set `POSTGRES_PASSWORD` to the password for the `postgres` role in `packages/db/.env`, and choose local SeaweedFS credentials. Keep `.env` private, and do not run `docker compose down --volumes` unless you intend to delete the SeaweedFS data volume. The PostgreSQL volume is external and is not removed by Compose.

### Production Compose stack

`compose.production.yaml` runs PostgreSQL, SeaweedFS, the Fastify API, and Caddy. Only Caddy publishes ports 80 and 443; the API, database, and object storage are not published to the host. The stack uses separate named volumes and a production-only environment file.

Before starting it, point the production API hostname at the server's public IP, allow inbound TCP ports 80 and 443 in the DigitalOcean Cloud Firewall, and create `.env.production` from `.env.production.example`. Set unique production database passwords, Better Auth secret, Google and Apple production credentials, Apple private key, and a valid ACME email. Generate URL-safe random secrets with `openssl rand -hex 32`; keep `.env.production` private and never reuse development credentials.

Run these commands from the repository root on the server. Start the data services, create the least-privilege runtime role, and apply migrations before starting the API:

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d postgres seaweedfs
docker compose --env-file .env.production -f compose.production.yaml --profile setup run --rm db-role
docker compose --env-file .env.production -f compose.production.yaml --profile migrations run --rm migrate
docker compose --env-file .env.production -f compose.production.yaml up -d api caddy
docker compose --env-file .env.production -f compose.production.yaml ps
```

The migration service uses the PostgreSQL admin credentials; the API connects as `mocca_app`. Caddy obtains and renews HTTPS certificates automatically after DNS resolves to the server and ports 80 and 443 are reachable. Check the API with `curl -fsS https://mocca-api.sebastianamartinez.com/health`. Do not use `docker compose down --volumes` on the production stack; it deletes its database, object-storage, and Caddy state volumes.

### Production backups with Backblaze B2

The backup scripts use Restic with B2's S3-compatible API. Restic encrypts and deduplicates the PostgreSQL custom-format dump and SeaweedFS data archive before upload. PostgreSQL is backed up online. SeaweedFS is stopped while its named volume is archived for consistency, then restarted; photo/object-storage requests will be unavailable during that archive. Revisit this procedure before enabling photo uploads.

In Backblaze, create a private Standard bucket and a dedicated S3-compatible application key restricted to that bucket. Grant `listAllBucketNames`, `listFiles`, `readFiles`, `writeFiles`, and `deleteFiles`; Restic needs delete access for pruning. Add a bucket lifecycle rule to keep only the latest version of each object, as recommended for Restic's S3 backend. This key can delete backup objects, so keep it only on the Droplet and use a dedicated bucket. Restic encryption does not prevent a compromised Droplet from deleting backups.

Install Restic **0.17.0 or newer** and `jq`; the backup scripts use `--stdin-from-command`, added in Restic 0.17.0, to ensure failed dump/archive commands do not produce successful snapshots. Distribution packages may be older, so check `restic version` and use the [official stable Linux binary installation instructions](https://restic.readthedocs.io/en/stable/020_installation.html) if needed. Then create a root-only backup environment file from the template:

```bash
sudo apt update
sudo apt install jq
restic version
sudo install -o root -g root -m 600 ops/backup-b2.env.example /etc/mocca-backup.env
sudo nano /etc/mocca-backup.env
```

Set the bucket's region and name in `RESTIC_REPOSITORY` and `AWS_DEFAULT_REGION`, and enter the B2 application key ID and application key in the matching AWS variables. Generate a unique Restic repository password with `openssl rand -hex 32`; keep it in a password manager because losing it makes the encrypted backup unrecoverable. Do not reuse credentials from `.env.production`.

Initialize the encrypted repository, run the first backup, and perform a non-destructive restore check before enabling the schedule:

```bash
sudo bash -c 'set -a; . /etc/mocca-backup.env; set +a; restic init'
sudo bash ops/backup-production.sh
sudo bash ops/restore-check-production.sh
```

The restore check restores PostgreSQL into an isolated container, restores the SeaweedFS archive into a temporary volume, and starts SeaweedFS with networking disabled. It removes the temporary containers and volumes when finished; it does not modify production data. B2 access and valid backup snapshots are required for the check. Backups do not include `.env.production` or `/etc/mocca-backup.env`; keep those files' secrets, the Restic repository password, and provider credentials in a secure off-server password manager. A disaster recovery also needs the runtime database role recreated with the saved `.env.production` values before restoring the database.

### Production delivery and database rollback policy

Production delivery automation is planned for v0.2. The intended flow is for CI to test and build the API and migration images, publish immutable commit-SHA tags to GitHub Container Registry, deploy the selected image to the Droplet, apply migrations before replacing the API, and verify `/health` after rollout. Deployment must use a dedicated SSH key and a narrowly scoped server-side deploy command; do not grant GitHub Actions general root SSH access or Docker socket access.

Database migrations are forward-only; Drizzle migrations do not provide automatic down migrations. Use an expand-and-contract approach: first add backward-compatible schema changes, deploy code that can work with both old and new schema, migrate existing data as a separately reviewed operation, and remove obsolete schema only in a later deployment after the previous API image is no longer a rollback candidate. Before any production migration, take and verify a PostgreSQL backup. If a rollout fails, first roll the API image back only when it remains compatible with the migrated schema. Restoring the database from backup is a last resort because it discards writes made after that backup and requires an explicit operator decision.

Install and enable the daily backup and weekly retention/integrity timers:

```bash
sudo install -o root -g root -m 644 ops/mocca-backup.service ops/mocca-backup.timer ops/mocca-backup-prune.service ops/mocca-backup-prune.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mocca-backup.timer mocca-backup-prune.timer
systemctl list-timers 'mocca-backup*'
```

Daily backups keep seven daily, four weekly, and twelve monthly snapshots. The weekly job prunes unused Restic data and checks a 10% subset of repository data. Inspect job output with `sudo journalctl -u mocca-backup.service` and `sudo journalctl -u mocca-backup-prune.service`. Keep the backup/restore roadmap item open until a B2 backup and isolated restore check both succeed.

### Database schema and migrations

Add or change Drizzle table definitions in `packages/db/src/schema.ts`, including relation definitions where needed. Generate a migration and inspect the SQL before applying it:

```bash
pnpm --filter @mocca/db db:generate
pnpm --filter @mocca/db db:migrate
```

`db:migrate` first configures PostgreSQL default privileges, then applies pending migrations using the admin connection in `packages/db/.env`. New tables created by that migration role in the `public` schema automatically receive `SELECT`, `INSERT`, `UPDATE`, and `DELETE` for the server's `mocca_app` role. New sequences also receive `USAGE` and `SELECT`, which permits inserts into sequence-backed tables. The runtime role cannot run migrations or create tables.

Default privileges apply only to future objects created by the role in `DATABASE_URL`; they do not retroactively grant access or apply to objects created by another role or in another schema. The `mocca_app` role must exist before running migrations. The setup can be reapplied independently with `pnpm --filter @mocca/db db:grant-default-privileges`.

Available root commands:

| Command | Purpose |
| --- | --- |
| `pnpm format` | Format supported files with Biome |
| `pnpm format:check` | Check formatting without changing files |
| `pnpm lint` | Run Biome lint rules |
| `pnpm typecheck` | Run type checks in workspaces that provide a `typecheck` script |
| `pnpm check` | Run formatting, linting, and type checks |
| `pnpm changeset` | Record a package change and its semantic version bump |
| `pnpm version-packages` | Apply pending changesets and update changelogs |
| `pnpm release` | Publish versioned packages when publishing is configured |

The mobile and server workspaces can be started independently with the commands below.

Start the server in development mode:

```bash
pnpm --filter @mocca/server dev
```

The development server loads `apps/server/.env`; set `BETTER_AUTH_URL` to
`https://mocca-api-dev.sebastianamartinez.com`. For deployment, run
`pnpm --filter @mocca/server build` and `pnpm --filter @mocca/server start`.
The start command does not load the development `.env` file: supply
`BETTER_AUTH_URL=https://mocca-api.sebastianamartinez.com`, `NODE_ENV=production`,
`DATABASE_URL`, `BETTER_AUTH_SECRET`, and the Google and Apple credentials through
the deployment environment. Use a separate production database and secrets;
configure both providers' production callback URLs for the production hostname.

Start the Expo development server:

```bash
pnpm --filter @mocca/mobile start
```

The mobile app uses `EXPO_PUBLIC_API_URL` from its ignored `.env.local` during
local development. EAS development and preview builds target the development API;
the production profile targets `https://mocca-api.sebastianamartinez.com` once
that server is deployed. API URLs are public configuration, not secrets.

## Branch Workflow

`main` is the only long-lived branch. Changes are developed on short-lived branches named for their purpose, such as `feat/expo-mobile`, `fix/note-authorization`, or `chore/update-tooling`.

Open a pull request into `main` for each focused change. The branch must be current with `main`, and the repository checks must pass before merging. Pull requests are squash merged, and GitHub deletes merged branches automatically.

Direct pushes, force pushes, and deletion of `main` are blocked. Approvals are not required while this remains a single-developer project.

## Commits and Releases

Commit messages follow the Conventional Commits format and are checked by Commitlint through a Husky `commit-msg` hook.

Examples:

```text
chore: initialize monorepo
feat: add note creation
fix: enforce shared-space authorization
test: cover note access rules
```

Changesets manages package versions and changelogs according to semantic versioning:

- `patch` for backward-compatible fixes
- `minor` for backward-compatible functionality
- `major` for breaking changes

Run `pnpm changeset` when a change should result in a package release. Internal private packages can be versioned, but they are not published or tagged automatically.

Mobile app versions and iOS build numbers are separate from package versions. EAS will manage build numbers remotely, while human-facing app versions are changed when preparing a release.

## Roadmap

The roadmap is ordered by product value and dependency. Later phases may change based on actual use.

### v0.1: Foundations

Establish the project structure and deployment foundation.

- [x] Configure the pnpm monorepo and root development tools
- [x] Initialize the Expo mobile application
- [x] Initialize the Fastify server and tRPC API
- [x] Create the Drizzle database package and define the Better Auth schema
- [x] Set up the shared package workspace and root export
- [x] Apply the auth migration to local PostgreSQL and configure the server's least-privilege runtime role
- [x] Provision the self-hosted server and configure its firewall and access
- [x] Define the local Docker Compose services, networks, volumes, and environment variables for PostgreSQL and SeaweedFS
- [x] Extend the Compose stack with Fastify and Caddy for deployment
- [x] Deploy Fastify, PostgreSQL, and SeaweedFS behind Caddy
- [x] Configure server-side Better Auth providers for Google and Apple
- [x] Connect the Expo app to the server and complete an end-to-end sign-in flow
- [x] Define and test PostgreSQL and SeaweedFS backup and restore processes
- [x] Connect the GitHub repository and verify CI

### v0.2: MVP

Build the smallest useful version of Mocca and install it on both phones.

#### CI and production delivery

- [ ] Run workspace tests and production server/image build checks in required CI
- [ ] Publish immutable API and migration images to GitHub Container Registry
- [ ] Deploy images to the Droplet through a restricted deployment identity
- [ ] Apply forward-only, backward-compatible migrations before API rollout
- [ ] Verify production health after deployment and document image rollback and database restore procedures

#### Authentication and shared space

- [ ] Authenticate both users
- [ ] Create a shared space representing the relationship
- [ ] Enforce membership-based access on the server
- [ ] Test that users cannot access another shared space

#### Notes and reactions

- [ ] Create, read, update, and delete shared notes
- [ ] Read notes from both phones
- [ ] Add basic note reactions

#### Photos

- [ ] Upload photos to SeaweedFS using signed object-storage URLs
- [ ] View uploaded photos
- [ ] Defer client-side compression until it is needed

#### Delivery

- [ ] Create the first TestFlight build
- [ ] Install the app on both phones
- [ ] Verify the complete flow between both devices

Tests will be added with each feature. Initial coverage should focus on authentication, authorization, shared-space isolation, and note behavior.

### v1.0: Reliable Release

Prepare Mocca for regular use.

- [ ] Configure EAS Update for JavaScript and asset updates
- [ ] Add Sentry to the mobile app and server
- [ ] Review structured Pino logging
- [ ] Automate PostgreSQL backups with scheduled `pg_dump`
- [ ] Automate SeaweedFS backups and test full restore procedures
- [ ] Add push notifications for new notes
- [ ] Configure rate limiting, security headers, and production CORS
- [ ] Validate all API input on the server
- [ ] Expand backend and mobile test coverage for important flows
- [ ] Add the app icon, splash screen, theming, and consistent UI states

### v1.1: Quality of Life

Add features that make the app more personal and useful day to day.

- [ ] "Thinking of you" notifications
- [ ] Daily questions and quick status updates
- [ ] "On my way" status
- [ ] Photo gallery and shared memories timeline
- [ ] Photo compression with `expo-image-manipulator`
- [ ] Reactions on photos and memories
- [ ] "Open when..." messages
- [ ] Pull-to-refresh and polling for shared updates
- [ ] First complete user-facing changelog

### v2.0: Advanced Engineering

Introduce more complex systems only when they solve a demonstrated problem or support a specific learning goal.

- [ ] Replace polling with server-sent events when real-time updates are needed
- [ ] Add persisted queries, local caching, and offline changes
- [ ] Define conflict resolution for concurrent offline edits
- [ ] Evaluate a small set of useful PostHog events
- [ ] Add shared visit dates, countdowns, and optional location features
- [ ] Add small, self-contained games or prompts

### v3.0 and Later

Keep larger optional features out of the critical path until the core app is stable.

- [ ] iOS widgets
- [ ] Live Activities
- [ ] Voice notes
- [ ] Shared bucket list and to-do list
- [ ] Anniversary and date reminders
- [ ] Additional features based on real usage

## Engineering Principles

### Keep the system proportional

Self-hosting is a deliberate engineering goal for this project, but the system should remain proportional. Do not introduce Redis, Kafka, Kubernetes, microservices, or similar systems without a concrete need.

### Enforce authorization on the server

The mobile client is not a security boundary. Every request for shared data must verify membership on the server.

### Start with the simpler design

Use online CRUD before offline synchronization, polling before real-time updates, and an established authentication library with external identity providers before custom authentication flows. Add complexity when it addresses a measured problem.

### Test important behavior

Prioritize tests for authentication, authorization, shared-space isolation, core note behavior, and important mobile flows. Tests are part of feature development, not a separate final phase.

### Finish the core product first

The priority is a stable `v1.0` running on both phones. Work planned for `v2.0` and later should not delay that goal.

## Release Checklist

Before completing a release:

- [ ] Verify the feature on both phones
- [ ] Confirm server-side authorization coverage
- [ ] Run relevant automated tests
- [ ] Run type checking, linting, and formatting checks
- [ ] Verify production configuration
- [ ] Confirm error reporting where applicable
- [ ] Verify database backups
- [ ] Test the mobile build through TestFlight
- [ ] Add required changesets and changelogs
- [ ] Create the Git release tag