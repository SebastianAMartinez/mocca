# Mocca

Mocca is a personal mobile app for two people to share notes, photos, and small moments. The source code is public, but the application and its data are intended for its two users. The first goal is a reliable app that works well on both phones. More advanced features will be added only when the core product is stable.

The project is also a practical exercise in building and operating a production-style TypeScript application without adding infrastructure before it is needed.

## Current Status

Mocca is in the `v0.1` foundation phase. The monorepo, shared TypeScript configuration, Biome checks, CI workflow, conventional commit checks, Changesets configuration, and protected `main` branch are in place. The application workspaces have not been initialized yet.

## Architecture

```text
React Native / Expo
        |
        v
      tRPC
        |
        v
     Fastify
        |
        v
     Drizzle
        |
        v
Supabase PostgreSQL
```

Clerk will provide authentication. Authorization remains the responsibility of the Fastify server. A user may access content only when they belong to the shared space that owns it.

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

- PostgreSQL on Supabase
- Drizzle ORM
- Supabase Storage
- Clerk

### Tooling and infrastructure

- pnpm workspaces
- Biome
- Vitest
- React Native Testing Library
- Changesets
- Husky and Commitlint
- GitHub Actions
- Railway
- Sentry

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

There is no application start command yet because the mobile and server workspaces are still empty.

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
- Configure Supabase development and production projects
- Integrate Clerk authentication
- Configure Railway
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

- Upload photos to Supabase Storage
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

- Replace polling with Supabase Realtime or server-sent events
- Add persisted queries, local caching, and offline changes
- Define conflict resolution for concurrent offline edits
- Evaluate Better Auth as an alternative to Clerk
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

Use managed services when building the infrastructure would not provide useful product or engineering value. Do not introduce Redis, Kafka, Kubernetes, microservices, or similar systems without a concrete need.

### Enforce authorization on the server

The mobile client is not a security boundary. Every request for shared data must verify membership on the server.

### Start with the simpler design

Use online CRUD before offline synchronization, polling before real-time updates, and managed authentication before custom authentication infrastructure. Add complexity when it addresses a measured problem.

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