# Mocca

Mocca is a mobile app for sharing notes, photos, and everyday moments. It is being built as a small, self-hosted product with a focus on reliable authentication, server-enforced authorization, and tested operations.

## Current Status

The project has a working foundation: an Expo app, a Fastify/tRPC API, PostgreSQL with Drizzle, and Google and Apple sign-in through Better Auth. The mobile app can sign in, persist its session, access protected routes, and sign out against the development API. Notes, photos, shared spaces, and their authorization rules are not implemented yet.

Production runs behind Caddy. A SHA-pinned API deployment through a restricted SSH command has been verified, as have Backblaze B2 backups and isolated restore checks. Scheduled backup and retention jobs are enabled. Changesets and release automation are configured, but a versioned release has not yet been verified; automatic production deployment remains disabled until it has.

## Architecture

```text
React Native/Expo
        |
        v
  Fastify + tRPC
        |
        v
  PostgreSQL
```

SeaweedFS is provisioned for future photo storage.

Better Auth handles Google and Apple sign-in, with session cookies stored by the Expo client in SecureStore. Development API traffic uses a named Cloudflare Tunnel. Production traffic reaches the API through Caddy. The server, not the mobile client, is the security boundary for authorization.

### Infrastructure decisions

The project is self-hosted with Docker Compose. Caddy terminates production HTTPS and forwards traffic to Fastify on the private Docker network. PostgreSQL stores relational data; SeaweedFS is reserved for future object storage. Backup and restore procedures are described in [operations.md](operations.md).

## Repository Structure

```text
apps/
  mobile/       Expo and React Native application
  server/       Fastify server and tRPC API

packages/
  db/           Drizzle schema, migrations, and database access
  shared/       Shared TypeScript package

ops/            Production deployment, backup, and restore scripts
```

Keep code in the workspace that owns its responsibility. Add shared contracts when they are genuinely needed by both mobile and server.

## Technology

### Mobile

- React Native and Expo
- TypeScript
- Expo Router
- EAS Build

### Server

- Node.js
- Fastify
- tRPC
- Pino logging

### Data and authentication

- Self-hosted PostgreSQL
- Drizzle ORM
- SeaweedFS for planned S3-compatible object storage
- Better Auth with Google and Apple social sign-in

### Tooling and infrastructure

- pnpm workspaces
- Biome
- Node.js `node:test`
- Changesets
- Husky and Commitlint
- GitHub Actions
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

Create the external PostgreSQL volume once if needed, then start local PostgreSQL and SeaweedFS:

```bash
docker volume create mocca-postgres-data
docker compose up -d
docker compose ps
```

The root `.env.example` provides local Compose settings. Configure private server and database environment files separately, and copy `apps/mobile/.env.example` to the ignored `apps/mobile/.env.local` for local API configuration. Keep environment files private and do not run `docker compose down --volumes` unless you intend to remove local SeaweedFS data.

Start the API and Expo app in separate terminals:

```bash
pnpm --filter @mocca/server dev
pnpm --filter @mocca/mobile start
```

The server development command loads `apps/server/.env`; production deployment uses process environment variables instead. See [operations.md](operations.md) for database migration and production procedures.

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

Run `pnpm changeset` for changes that should result in a package release. CI creates version PRs and publishes a GitHub Release and API image for server releases. This release path is configured but has not yet completed a versioned release. See [operations.md](operations.md) for the release and deployment gates.

Mobile app versions and iOS build numbers are separate from package versions. EAS will manage build numbers remotely, while human-facing app versions are changed when preparing a release.

## Roadmap

### v0.1: Foundations

- [x] Configure the pnpm monorepo and root development tools
- [x] Initialize the Expo mobile application
- [x] Initialize the Fastify server and tRPC API
- [x] Create the Drizzle database package and Better Auth schema
- [x] Set up the shared package workspace and root export
- [x] Apply the authentication migration locally and configure the least-privilege runtime role
- [x] Provision the self-hosted server, firewall, and access
- [x] Configure local PostgreSQL and SeaweedFS with Docker Compose
- [x] Configure the production Compose stack with Fastify and Caddy
- [x] Deploy the API behind Caddy and verify its health
- [x] Configure Google and Apple sign-in and verify the Expo sign-in flow
- [x] Define and test PostgreSQL and SeaweedFS backup and restore procedures
- [x] Enable scheduled backups and retention checks
- [x] Verify SHA-pinned API deployment through the restricted SSH command
- [x] Configure and verify CI checks and production image builds
- [x] Configure Changesets release automation
- [ ] Complete and verify the first versioned release and published API image

### v0.2: MVP

Build the smallest useful version of Mocca and install it on both phones.

#### CI and production delivery

- [x] Run workspace checks and production server/image build checks in CI
- [ ] Publish immutable migration images to GitHub Container Registry
- [x] Confirm the private API image is accessible to the production server
- [x] Deploy API images through a restricted deployment identity
- [x] Document and follow the reviewed, forward-only migration and rollback process
- [x] Verify production health and document API rollback and database restore procedures
- [ ] Complete and verify the first versioned server release and published API image
- [ ] Enable automatic production deployment after the versioned release is verified

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
- [x] Automate PostgreSQL and SeaweedFS backups with scheduled jobs
- [x] Test isolated PostgreSQL and SeaweedFS restore procedures
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

Production migration, deployment, and backup procedures are in [operations.md](operations.md).