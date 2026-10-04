import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import Fastify from "fastify";

import type { Context } from "../src/trpc/context.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
	throw new Error("TEST_DATABASE_URL is required for integration tests");
}

const databaseUrl = new URL(testDatabaseUrl);
if (
	!["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
	!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) ||
	databaseUrl.pathname !== "/mocca_test"
) {
	throw new Error("Integration tests require a local mocca_test database");
}

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;

const { db, schema } = await import("@mocca/db");
const { appRouter } = await import("../src/trpc/router.js");

const users = Array.from({ length: 5 }, (_, index) => ({
	id: randomUUID(),
	name: `Test user ${index}`,
	email: `${randomUUID()}@example.test`,
	emailVerified: true,
	image: null,
	createdAt: new Date(),
	updatedAt: new Date(),
}));
const spaces = Array.from({ length: 2 }, () => ({
	id: randomUUID(),
	createdAt: new Date(),
}));

const sessionFor = (
	user: (typeof users)[number],
): NonNullable<Context["session"]> => {
	return {
		user,
		session: {
			id: randomUUID(),
			token: randomUUID(),
			userId: user.id,
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		},
	};
};

const getMine = async (session: Context["session"]) => {
	const app = Fastify();
	app.get("/test", async (req, res) => {
		const caller = appRouter.createCaller({ req, res, session });
		return caller.sharedSpace.getMine();
	});

	try {
		return await app.inject({ method: "GET", url: "/test" });
	} finally {
		await app.close();
	}
};

describe("sharedSpace.getMine database integration", () => {
	before(async () => {
		await db.transaction(async (tx) => {
			await tx.insert(schema.user).values(users);
			await tx.insert(schema.sharedSpace).values(spaces);
			await tx.insert(schema.sharedSpaceMembership).values(
				users.slice(0, 4).map((user, index) => ({
					userId: user.id,
					spaceId: spaces[Math.floor(index / 2)].id,
				})),
			);
		});
	});

	after(async () => {
		try {
			await db.transaction(async (tx) => {
				await tx.delete(schema.sharedSpace).where(
					inArray(
						schema.sharedSpace.id,
						spaces.map((space) => space.id),
					),
				);
				await tx.delete(schema.user).where(
					inArray(
						schema.user.id,
						users.map((user) => user.id),
					),
				);
			});
		} finally {
			await db.$client.end();
		}
	});

	it("returns null for a signed-in user without a membership", async () => {
		const response = await getMine(sessionFor(users[4]));

		assert.equal(response.statusCode, 200);
		assert.equal(response.json(), null);
	});

	it("returns the same space for both members", async () => {
		for (const user of users.slice(0, 2)) {
			const response = await getMine(sessionFor(user));

			assert.equal(response.statusCode, 200);
			assert.deepEqual(response.json(), {
				sharedSpace: {
					id: spaces[0].id,
					createdAt: spaces[0].createdAt.toISOString(),
				},
			});
		}
	});

	it("returns only each user's own space when another space exists", async () => {
		for (const [index, user] of users.slice(0, 4).entries()) {
			const response = await getMine(sessionFor(user));
			const space = spaces[Math.floor(index / 2)];

			assert.equal(response.statusCode, 200);
			assert.deepEqual(response.json(), {
				sharedSpace: {
					id: space.id,
					createdAt: space.createdAt.toISOString(),
				},
			});
		}
	});
});
