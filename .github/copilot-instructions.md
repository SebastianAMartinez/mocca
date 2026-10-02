# Mocca Development Instructions

## Product Direction

Mocca is a small shared-memory app for two people to exchange notes, photos, and everyday moments. Keep the product simple and finish the useful core before adding advanced engineering. The product roadmap and current milestones are maintained in `README.md`; operational procedures are maintained in `operations.md`.

Do not implement notes, photos, shared spaces, widgets, or later-roadmap features unless explicitly requested. Do not introduce infrastructure such as Redis, Kafka, Kubernetes, or microservices without a demonstrated need.

## Workspace Boundaries

- `apps/mobile`: Expo and React Native UI, navigation, client state, API consumption, and device behavior.
- `apps/server`: Fastify, tRPC, authentication verification, authorization, validation, and business logic.
- `packages/db`: Drizzle schema, migrations, database client, and database utilities.
- `packages/shared`: Contracts and utilities genuinely shared by multiple workspaces.
- `ops`: Production deployment, backup, restore, and service definitions.

Keep code in the workspace that owns it. Do not use `packages/shared` as a general dumping ground.

## Architecture and Security

The intended request path is Expo -> tRPC -> Fastify -> Drizzle -> PostgreSQL. Better Auth provides Google and Apple sign-in. Authentication and authorization are separate: never trust the client to decide whether a user may access another user's data. Enforce shared-space membership on the server.

Never hard-code or print API keys, passwords, database credentials, authentication secrets, private keys, or tokens. Keep secrets in ignored environment files or provider secret stores. Do not read or display environment-file contents wholesale.

For production deployment, migrations, backups, or restores, follow `operations.md` and load the `production-operations` skill. Never run a production deployment or destructive production command unless the user explicitly requests it; the configured GitHub Actions workflow deploys after successful checks on `main`.

## Engineering Rules

- Use pnpm exclusively and add dependencies to the workspace that owns them.
- Use strict TypeScript; avoid `any`, unnecessary assertions, duplicated types, and unexplained suppressions.
- Prefer readable, small modules and existing project patterns over new abstractions.
- Add dependencies only when existing libraries, platform APIs, or standard TypeScript cannot reasonably solve the problem.
- Treat tests as part of feature development. Prioritize authorization, shared-space isolation, API contracts, and important mobile flows.
- Use conventional commit messages and keep each commit focused on one logical change.
- Work on short-lived branches and open pull requests into `main`; do not commit or push unless requested.

## Working Process

1. Inspect the relevant owning code and nearby tests or call sites.
2. Make the smallest change that satisfies the requested milestone.
3. Do not modify unrelated files or implement future roadmap work.
4. Run the narrowest relevant check, then `pnpm check` when the change warrants the full repository gate.
5. Report changed files, validation results, and any follow-up without implementing unrequested work.

Ask before making a decision that materially changes architecture, data design, authorization, or production operations. When several approaches are valid, explain the tradeoff briefly and prefer the simpler option consistent with the current codebase.

## Current Direction

The foundation is in place: Expo, Fastify/tRPC, PostgreSQL/Drizzle, Better Auth, CI, production hosting, automatic main-branch deployment, and tested PostgreSQL backups. Keep operational work proportional to the product and maintain procedures in `operations.md`.

Continue with the smallest useful Mocca experience: shared domain contracts, server-enforced membership, notes, photos, and tests in roadmap order. Keep infrastructure maintenance proportional and secondary to the product.