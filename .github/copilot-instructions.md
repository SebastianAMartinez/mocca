# Mocca Development Instructions

## Project Overview

Mocca is a cross-platform shared memory and moments application built as a portfolio-quality software project.

The project is structured as a pnpm monorepo and will eventually contain:

* React Native / Expo mobile application
* Fastify backend
* tRPC API layer
* Self-hosted PostgreSQL database
* Drizzle ORM
* Better Auth authentication with Google and Apple social sign-in
* Shared TypeScript packages
* iOS widgets
* Automated testing and CI

The goal is to build Mocca as a realistic production-style application rather than a tutorial project.

## Repository Structure

The repository uses the following structure:

```text
mocca/
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/
├── apps/
│   ├── mobile/
│   └── server/
├── packages/
│   ├── db/
│   └── shared/
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── README.md
```

### Workspace Responsibilities

#### apps/mobile

The React Native / Expo application.

Responsible for:

* Mobile UI
* Navigation
* Client-side state
* Authentication UI
* API consumption
* Local device functionality
* Photos
* iOS widgets
* Mobile-specific behavior

Do not place backend, database, or server logic here.

#### apps/server

The Fastify backend.

Responsible for:

* HTTP server
* tRPC API
* Authentication verification
* Authorization
* Business logic
* Server-side validation
* Communication with the database

Do not place React Native or UI code here.

#### packages/db

Database infrastructure.

Responsible for:

* Drizzle configuration
* Database client
* Database schema
* Database migrations
* Database-related utilities

PostgreSQL will be self-hosted with Docker Compose.

Do not place UI or API route logic here.

#### packages/shared

Code genuinely shared between applications.

Examples include:

* Shared TypeScript types
* Shared constants
* Shared validation schemas when appropriate
* Domain-level utilities

Do not use this package as a dumping ground for unrelated code.

## Package Management

Use pnpm exclusively.

Do not introduce npm or yarn commands.

Use workspace dependencies when packages depend on each other.

Prefer:

```bash
pnpm add <package> --filter <workspace>
```

and:

```bash
pnpm add -D <package> --filter <workspace>
```

Do not install application-specific dependencies in the repository root unless they are genuinely repository-wide development dependencies.

## TypeScript

The project uses TypeScript throughout the JavaScript/TypeScript codebase.

Prefer strict TypeScript configuration.

Avoid:

* `any`
* unnecessary type assertions
* duplicated types
* implicit `any`
* suppressing TypeScript errors without a documented reason

Favor clear, explicit types and reusable domain types.

## Code Quality

Write production-quality code appropriate for an entry-level to mid-level software engineer.

Prioritize:

* Readability
* Maintainability
* Simplicity
* Strong typing
* Small modules
* Clear naming
* Separation of concerns
* Testability

Do not over-engineer simple functionality.

Avoid unnecessary abstractions, design patterns, dependencies, or frameworks.

## Architecture

Follow the architecture established in the project roadmap.

The intended high-level architecture is:

```text
React Native / Expo
        │
        ▼
      tRPC
        │
        ▼
     Fastify
        │
        ▼
     Drizzle
        │
        ▼
Self-hosted PostgreSQL
```

Authentication will use Better Auth with Google and Apple social sign-in.

Authentication and authorization are separate concerns.

The client must never be trusted to determine whether a user is allowed to access another user's data.

Authorization must ultimately be enforced on the server.

## Development Workflow

Work incrementally.

Before making changes:

1. Inspect the existing repository structure.
2. Read relevant configuration files.
3. Determine whether the requested functionality already exists.
4. Make the smallest reasonable change.
5. Run the appropriate checks.
6. Report what changed and what was verified.

Do not rewrite existing files unnecessarily.

Do not modify unrelated files.

Do not introduce dependencies without explaining why they are needed.

## Roadmap Discipline

The project follows a staged roadmap.

Do not implement future roadmap features unless explicitly requested.

The current priority is establishing the monorepo foundation.

The initial infrastructure sequence is:

1. pnpm workspace
2. Root configuration
3. TypeScript
4. Biome
5. GitHub Actions CI
6. Expo mobile application
7. Fastify server
8. Shared package
9. Database package
10. Workspace dependencies
11. Authentication
12. Database
13. API
14. Application features
15. Testing
16. iOS widgets

Do not skip ahead simply because a future feature is technically possible.

## Git

Use conventional commit-style messages.

Examples:

```text
chore: initialize monorepo
chore: configure typescript
chore: add biome
ci: add repository checks
feat: add authentication
fix: correct note authorization
test: add note service tests
```

Keep commits focused on one logical change.

## Testing

Testing is part of the development process rather than something added at the very end.

When functionality is introduced, consider the appropriate testing level:

* Unit tests for isolated logic
* Integration tests for server/database behavior
* API tests for backend contracts
* End-to-end tests for important user flows

Do not add tests that provide little value simply to increase coverage numbers.

## GitHub Actions

CI should eventually verify that the repository:

* Installs successfully
* Passes formatting/lint checks
* Passes TypeScript checks
* Passes automated tests

CI should use the repository's pnpm configuration and should not use npm or yarn.

## Security

Never hard-code:

* API keys
* Passwords
* Database credentials
* Authentication secrets
* Private tokens

Use environment variables and appropriate `.env` files.

Never commit secrets.

Environment files containing secrets must be included in `.gitignore`.

## Dependency Decisions

Before adding a dependency, determine whether the functionality can reasonably be implemented using:

* Existing project dependencies
* Platform APIs
* Standard TypeScript/JavaScript functionality

Prefer established, actively maintained dependencies when one is necessary.

Do not add a dependency simply for convenience if it creates unnecessary complexity.

## Copilot Behavior

Act as a development assistant, not as an autonomous project manager.

When given a task:

1. Explain the intended change briefly.
2. Inspect the relevant files.
3. Implement only the requested scope.
4. Run appropriate validation.
5. Report the files changed.
6. Report validation results.
7. Mention any follow-up work without implementing it automatically.

If requirements are ambiguous and the ambiguity could materially affect architecture or data design, ask before implementing.

Do not silently make major architectural decisions.

Do not create large amounts of boilerplate without explaining its purpose.

When multiple reasonable approaches exist, briefly explain the tradeoff and use the approach consistent with this project's architecture.

## Current Stage

The repository is currently being initialized.

The immediate goal is to establish a clean, working monorepo foundation before implementing Mocca functionality.

Do not implement authentication, notes, photos, shared spaces, widgets, or other application features until the repository foundation is complete.
