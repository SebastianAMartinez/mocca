# Mocca

Mocca is a private mobile app for sharing notes, photos, and everyday moments with someone you care about.

The goal is simple: build a small, polished app that makes staying connected feel more personal than a normal messaging app. The project is also a way to learn modern full-stack and mobile development by building and maintaining the product myself.

## What Mocca Is

Mocca is built around a shared space between two people. Each person can add notes, photos, reactions, and other small updates that the other person can see.

The initial version is intentionally small. The focus is on making the core experience work well before adding more advanced features.

### Core ideas

- Shared notes between two people
- Photos and shared memories
- Simple reactions
- A private shared space
- iOS widgets for quick access to the relationship and recent activity
- A simple, focused mobile experience

## Current Status

The v0.1 foundation milestone is complete. The `v0.1.0` tag is published, and its API image has been built and deployed on the production Droplet with smoke-test and public HTTPS health verification.

The monorepo, Expo mobile app, Fastify API, PostgreSQL database, authentication, local development environment, CI, and production deployment foundation are in place. Authentication can be used from the mobile app, but the actual Mocca experience is still being built.

The next priority is not adding more infrastructure. It is building the first useful version of Mocca.

Production deployment is manual; GitHub Actions validates changes but does not connect to the Droplet. See [operations.md](operations.md) for the deployment procedure.

## Technology

### Mobile

- React Native
- Expo
- TypeScript
- Expo Router
- EAS

### Server

- Node.js
- Fastify
- tRPC
- TypeScript

### Data

- PostgreSQL
- Drizzle ORM

### Authentication

- Better Auth
- Google Sign-In
- Apple Sign-In

### Tooling

- pnpm workspaces
- Biome
- Node.js `node:test`
- Husky and Commitlint
- GitHub Actions
- Docker Compose

Infrastructure is intentionally kept simple. The project is self-hosted, but additional systems should only be introduced when Mocca actually needs them.

## Repository Structure

```text
apps/
  mobile/       Expo and React Native application
  server/       Fastify API

packages/
  db/           Database schema and access
  shared/       Shared TypeScript code

ops/            Deployment and operational scripts
```

The monorepo keeps the mobile app, API, and shared code together without requiring them to be tightly coupled.

## Development

### Requirements

- Node.js 24
- pnpm 12.5.1

Install dependencies:

```bash
pnpm install
```

Run repository checks:

```bash
pnpm check
```

Start local PostgreSQL:

```bash
docker volume create mocca-postgres-data
docker compose up -d --remove-orphans postgres
docker compose ps
```

Copy the tracked environment examples to their ignored `.env` paths, fill in local authentication provider credentials, and keep the files private. `--remove-orphans` stops obsolete containers without deleting their volumes. The runbook explains the first local database role and migration.

Start the API and Expo app in separate terminals:

```bash
pnpm --filter @mocca/server dev
pnpm --filter @mocca/mobile start
```

The server development command loads `apps/server/.env`; production deployment uses process environment variables instead. See [operations.md](operations.md) for database migration and production procedures.

The mobile API providers are scoped to the signed-in user's ID. Signing out or
switching accounts remounts the providers with a fresh query cache; the previous
cache is cleared and its active queries are cancelled. Session refreshes for the
same user keep the existing cache.

The signed-in mobile home screen uses Expo UI controls and shows separate
loading, error, no-space, waiting-for-partner, and connected states. Users without
a space can create one, with pending feedback and inline errors. Successful
creation updates the current-space cache and refreshes it from the server;
membership conflicts also refresh the query to recover an existing space.
Users with a one-person space can generate a 24-hour invitation and share it
through the native share sheet. The link can be shared again without generating
a new token; replacing a link shown on screen requires confirmation. Creating
an invitation after reopening the screen also invalidates the previous link.
Tokens are kept in the session's in-memory state,
not persisted to device storage.

Invitation links use `mocca://invite?token=...` and require Mocca to be installed;
there is no web landing page or deferred-install link handling yet. The
invitation route is available before and after sign-in, preserves the token in
the OAuth callback, and requires explicit acceptance. The navigator waits for
initial authentication loading before choosing a screen; leaving an invitation
while signed out opens sign-in directly. Existing memberships,
invalid/expired links, and request failures have inline feedback. Acceptance
refreshes the current-space query before navigating home. Home also refreshes
when the app returns to the foreground so the sender can see their partner join.

`pnpm --filter @mocca/mobile test` runs Jest/React Native Testing Library
component tests for space creation, invitation generation/sharing/acceptance,
sign-in callback preservation, and sign-out. React hooks, React Query, and the
tRPC client run normally; native rendering, authentication, navigation, and API
responses are mocked. These do not replace testing deep links and OAuth on two
devices with different accounts and an installed development build.
Home emphasizes the "Our space" section, keeps cached space data visible when a
refresh fails, and exposes sign-out through the native Account menu in the
header (a direct sign-out action on web, where Expo UI menus are not supported).
The sign-in screen shares the home screen's Expo UI typography and light/dark
palette, but uses a centered welcome layout with "A little space for us." and
lower Google and Apple actions. Apple is listed first on iOS; Google is first
elsewhere. Pending feedback and inline errors appear below the actions.

### Server tests

`pnpm --filter @mocca/server test` runs HTTP tests without requiring a running database.
Database integration tests run separately with `pnpm --filter @mocca/server test:integration`
and require `TEST_DATABASE_URL` pointing to the migrated local `mocca_test` database.
See [operations.md](operations.md#local-integration-test-database) for setup.
They exercise real database queries with synthetic authenticated contexts, not Google or Apple sign-in.
Each run creates unique fixtures and removes only those fixtures afterward.

## Branch Workflow

`main` is the only long-lived branch. Changes are developed on short-lived branches named for their purpose, such as `feat/expo-mobile`, `fix/note-authorization`, or `chore/update-tooling`.

Open a pull request into `main` for each focused change. The branch must be current with `main`, and the repository checks must pass before merging. Pull requests are squash merged, and GitHub deletes merged branches automatically.

Direct pushes, force pushes, and deletion of `main` are blocked. Approvals are not required while this remains a single-developer project.

## Commits and Releases

Commit messages follow the Conventional Commits format and are checked by Commitlint through a Husky `commit-msg` hook. Use Conventional Commit messages for squash-merge pull request titles. Releases are manual: after preparing a release, create and push a version tag, for example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Mocca does not publish npm packages or create GitHub releases automatically.

Mobile app versions and iOS build numbers are separate from package versions. EAS will manage build numbers remotely, while human-facing app versions are changed when preparing a release.

## Roadmap

The roadmap is organized around the product rather than the infrastructure. Infrastructure work should support a milestone, not become a milestone by itself.

### v0.1: Foundation

Set up everything needed to start building Mocca.

- [x] Set up the pnpm monorepo
- [x] Initialize the Expo mobile app
- [x] Initialize the Fastify API
- [x] Set up PostgreSQL and Drizzle
- [x] Set up authentication
- [x] Set up shared packages
- [x] Set up local development
- [x] Set up CI and production deployment
- [x] Set up backups and restore procedures
- [x] Complete the first versioned release (`v0.1.0`)

### v0.2: MVP

Build the first version of Mocca that can actually be used by both people.

#### Shared space

- [ ] Sign in on both phones
- [ ] Create a shared space for two people
- [ ] Enforce membership-based access
- [ ] Make sure users cannot access another shared space

#### Notes

- [ ] Create shared notes
- [ ] Edit and delete notes
- [ ] View notes from both phones
- [ ] Add basic reactions

#### Photos

- [ ] Upload photos
- [ ] View shared photos
- [ ] Associate photos with the shared space

#### First release

- [ ] Create the first TestFlight build
- [ ] Install Mocca on both phones
- [ ] Test the complete shared experience

Tests will be added as features are built, with priority given to authentication, authorization, shared-space isolation, and core note behavior.

### v1.0: Reliable Mocca

Make the app reliable enough for regular everyday use.

- [ ] Improve the UI and empty/loading/error states
- [ ] Add push notifications
- [ ] Add iOS widgets
- [ ] Add EAS Update
- [ ] Add error reporting
- [ ] Expand automated test coverage
- [ ] Add production security and rate limiting
- [ ] Add app icon, splash screen, and final theming
- [ ] Establish a regular release process

### v1.1: More Ways to Connect

Add features that make Mocca more useful and personal without changing its core purpose.

- [ ] "Thinking of you" notifications
- [ ] Daily questions and quick status updates
- [ ] "On my way" status
- [ ] Photo gallery and shared memories timeline
- [ ] Photo reactions
- [ ] "Open when..." messages
- [ ] Pull-to-refresh and background updates
- [ ] User-facing changelog

### v2.0: Advanced Features

Only introduce more complex systems when they solve a real problem or support a specific learning goal.

- [ ] Real-time updates when needed
- [ ] Local caching and offline support
- [ ] Conflict handling for offline edits
- [ ] Shared visit dates and countdowns
- [ ] Optional location features
- [ ] Small games and prompts
- [ ] Usage analytics for improving the app

### Future

Ideas that are intentionally kept out of the critical path until the core experience is stable.

- [ ] Live Activities
- [ ] Voice notes
- [ ] Shared bucket list
- [ ] Shared to-do list
- [ ] Anniversary and date reminders
- [ ] Additional features based on actual usage

## Engineering Principles

### Build the product first

Mocca is a product project, not an infrastructure project. The goal is to build something useful and enjoyable before optimizing for scale that does not exist yet.

### Keep the system simple

Use the simplest solution that works. Do not add Redis, Kafka, Kubernetes, microservices, or similar infrastructure unless there is a real reason to use it.

### Learn through the project

The project is intentionally a learning exercise. New technologies are welcome when they help develop a useful skill or solve a real problem, but learning should not come at the expense of finishing Mocca.

### Keep authorization on the server

The mobile app is not a security boundary. Access to shared data is always checked by the server.

### Test important behavior

Tests should focus on behavior that matters: authentication, authorization, shared-space isolation, notes, photos, and important mobile flows.

### Finish before expanding

The priority is a stable version of the core Mocca experience on both phones. New ideas should not continually push that goal further away.

## Release Checklist

Create and push a version tag manually, following the process above.

Before completing a release:

- [ ] Verify the feature on both phones
- [ ] Run relevant automated tests
- [ ] Run type checking, linting, and formatting checks
- [ ] Verify production configuration
- [ ] Confirm backups are working
- [ ] Test the mobile build through TestFlight
- [ ] Update the changelog when applicable
- [ ] Verify the version tag

Deployment and backup procedures are documented in [operations.md](operations.md).
