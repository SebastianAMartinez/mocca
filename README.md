# Mocca

Mocca is a mobile app to share notes, photos, and small moments. The first goal is a reliable app that works well on both phones. More advanced features will be added only when the core product is stable.

The project is also a practical exercise in building and operating a production-style TypeScript application while introducing infrastructure deliberately and learning to operate it responsibly.

## Current Status

Mocca is in the `v0.1` foundation phase. The monorepo, shared TypeScript configuration, Biome checks, CI workflow, conventional commit checks, Changesets configuration, protected `main` branch, Expo mobile app, and Fastify/tRPC server are in place. The database package is being initialized; the shared package remains a placeholder.

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

Better Auth will provide self-hosted authentication with Google and Apple social sign-in. Authorization remains the responsibility of the Fastify server. A user may access content only when they belong to the shared space that owns it. PostgreSQL and SeaweedFS will use persistent storage and require tested backups and restores.

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

Each workspace should contain only code that belongs to its stated responsibility. Shared packages should not become a general-purpose location for unrelated code.

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
- Vitest
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

Start the Expo development server:

```bash
pnpm --filter @mocca/mobile start
```

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

- Configure the pnpm monorepo and root development tools
- Initialize the Expo mobile application
- Initialize the Fastify server and tRPC API
- Create the shared and database packages
- Start the Drizzle schema
- Provision the self-hosted server and configure its firewall and access
- Define the Docker Compose services, networks, volumes, and environment variables
- Deploy Fastify, PostgreSQL, and SeaweedFS behind Caddy
- Integrate Better Auth with Google and Apple social sign-in
- Define and test PostgreSQL and SeaweedFS backup and restore processes
- Connect the GitHub repository and verify CI

### v0.2: MVP

Build the smallest useful version of Mocca and install it on both phones.

#### Authentication and shared space

- Authenticate both users
- Create a shared space representing the relationship
- Enforce membership-based access on the server
- Test that users cannot access another shared space

#### Notes and reactions

- Create, read, update, and delete shared notes
- Read notes from both phones
- Add basic note reactions

#### Photos

- Upload photos to SeaweedFS using signed object-storage URLs
- View uploaded photos
- Defer client-side compression until it is needed

#### Delivery

- Create the first TestFlight build
- Install the app on both phones
- Verify the complete flow between both devices

Tests will be added with each feature. Initial coverage should focus on authentication, authorization, shared-space isolation, and note behavior.

### v1.0: Reliable Release

Prepare Mocca for regular use.

- Configure EAS Update for JavaScript and asset updates
- Add Sentry to the mobile app and server
- Review structured Pino logging
- Automate PostgreSQL backups with scheduled `pg_dump`
- Automate SeaweedFS backups and test full restore procedures
- Add push notifications for new notes
- Configure rate limiting, security headers, and production CORS
- Validate all API input on the server
- Expand backend and mobile test coverage for important flows
- Add the app icon, splash screen, theming, and consistent UI states

### v1.1: Quality of Life

Add features that make the app more personal and useful day to day.

- "Thinking of you" notifications
- Daily questions and quick status updates
- "On my way" status
- Photo gallery and shared memories timeline
- Photo compression with `expo-image-manipulator`
- Reactions on photos and memories
- "Open when..." messages
- Pull-to-refresh and polling for shared updates
- First complete user-facing changelog

### v2.0: Advanced Engineering

Introduce more complex systems only when they solve a demonstrated problem or support a specific learning goal.

- Replace polling with server-sent events when real-time updates are needed
- Add persisted queries, local caching, and offline changes
- Define conflict resolution for concurrent offline edits
- Evaluate a small set of useful PostHog events
- Add shared visit dates, countdowns, and optional location features
- Add small, self-contained games or prompts

### v3.0 and Later

Keep larger optional features out of the critical path until the core app is stable.

- iOS widgets
- Live Activities
- Voice notes
- Shared bucket list and to-do list
- Anniversary and date reminders
- Additional features based on real usage

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

- Verify the feature on both phones
- Confirm server-side authorization coverage
- Run relevant automated tests
- Run type checking, linting, and formatting checks
- Verify production configuration
- Confirm error reporting where applicable
- Verify database backups
- Test the mobile build through TestFlight
- Add required changesets and changelogs
- Create the Git release tag