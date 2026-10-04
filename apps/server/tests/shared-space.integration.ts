import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
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

// users[0], [1]: together in spaces[0].
// users[2], [3]: together in spaces[1].
// users[4]: no space.
// users[5]: alone in spaces[2].
const users = Array.from({ length: 6 }, (_, index) => ({
	id: randomUUID(),
	name: `Test user ${index}`,
	email: `${randomUUID()}@example.test`,
	emailVerified: true,
	image: null,
	createdAt: new Date(),
	updatedAt: new Date(),
}));
const spaces = Array.from({ length: 3 }, () => ({
	id: randomUUID(),
	createdAt: new Date(),
}));

const partnerView = (user: (typeof users)[number]) => ({
	id: user.id,
	name: user.name,
	image: user.image,
});
const createUsers = Array.from({ length: 3 }, (_, index) => ({
	id: randomUUID(),
	name: `Create test user ${index}`,
	email: `${randomUUID()}@example.test`,
	emailVerified: true,
	image: null,
	createdAt: new Date(),
	updatedAt: new Date(),
}));
const existingSpaceForCreate = { id: randomUUID(), createdAt: new Date() };
const invitationUsers = Array.from({ length: 5 }, (_, index) => ({
	id: randomUUID(),
	name: `Invitation test user ${index}`,
	email: `${randomUUID()}@example.test`,
	emailVerified: true,
	image: null,
	createdAt: new Date(),
	updatedAt: new Date(),
}));
// invitationUsers[0]: no space.
// invitationUsers[1]: alone in invitationSpaces.solo.
// invitationUsers[2], [3]: together in invitationSpaces.full.
// invitationUsers[4]: alone in invitationSpaces.regenerate.
const invitationSpaces = {
	solo: { id: randomUUID(), createdAt: new Date() },
	full: { id: randomUUID(), createdAt: new Date() },
	regenerate: { id: randomUUID(), createdAt: new Date() },
};

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

const getCurrent = async (session: Context["session"]) => {
	const app = Fastify();
	app.get("/test", async (req, res) => {
		const caller = appRouter.createCaller({ req, res, session });
		return caller.sharedSpace.current();
	});

	try {
		return await app.inject({ method: "GET", url: "/test" });
	} finally {
		await app.close();
	}
};

type CreateResult =
	| { ok: true; sharedSpace: { id: string; createdAt: string } }
	| { ok: false; code: string };

const create = async (session: Context["session"]): Promise<CreateResult> => {
	const app = Fastify();
	app.post("/test", async (req, res) => {
		const caller = appRouter.createCaller({ req, res, session });
		try {
			const { sharedSpace } = await caller.sharedSpace.create();
			return { ok: true, sharedSpace };
		} catch (error) {
			if (error instanceof TRPCError) {
				return { ok: false, code: error.code };
			}
			throw error;
		}
	});

	try {
		const response = await app.inject({ method: "POST", url: "/test" });
		assert.equal(response.statusCode, 200);
		return response.json<CreateResult>();
	} finally {
		await app.close();
	}
};

const membershipsFor = (userId: string) =>
	db
		.select({ spaceId: schema.sharedSpaceMembership.spaceId })
		.from(schema.sharedSpaceMembership)
		.where(eq(schema.sharedSpaceMembership.userId, userId));

type CreateInvitationResult =
	| { ok: true; token: string; expiresAt: string }
	| { ok: false; code: string };

const createInvitation = async (
	session: Context["session"],
): Promise<CreateInvitationResult> => {
	const app = Fastify();
	app.post("/test", async (req, res) => {
		const caller = appRouter.createCaller({ req, res, session });
		try {
			const { token, expiresAt } = await caller.sharedSpace.createInvitation();
			return { ok: true, token, expiresAt };
		} catch (error) {
			if (error instanceof TRPCError) {
				return { ok: false, code: error.code };
			}
			throw error;
		}
	});

	try {
		const response = await app.inject({ method: "POST", url: "/test" });
		assert.equal(response.statusCode, 200);
		return response.json<CreateInvitationResult>();
	} finally {
		await app.close();
	}
};

const sha256 = (value: string) =>
	createHash("sha256").update(value).digest("hex");

const invitationsFor = (spaceId: string) =>
	db
		.select()
		.from(schema.sharedSpaceInvitation)
		.where(eq(schema.sharedSpaceInvitation.spaceId, spaceId));

after(async () => {
	await db.$client.end();
});

describe("sharedSpace.current database integration", () => {
	before(async () => {
		await db.transaction(async (tx) => {
			await tx.insert(schema.user).values(users);
			await tx.insert(schema.sharedSpace).values(spaces);
			await tx.insert(schema.sharedSpaceMembership).values([
				...users.slice(0, 4).map((user, index) => ({
					userId: user.id,
					spaceId: spaces[Math.floor(index / 2)].id,
				})),
				{ userId: users[5].id, spaceId: spaces[2].id },
			]);
		});
	});

	after(async () => {
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
	});

	it("returns null for a signed-in user without a membership", async () => {
		const response = await getCurrent(sessionFor(users[4]));

		assert.equal(response.statusCode, 200);
		assert.equal(response.json(), null);
	});

	it("returns a null partner while the space has only one member", async () => {
		const response = await getCurrent(sessionFor(users[5]));

		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), {
			sharedSpace: {
				id: spaces[2].id,
				createdAt: spaces[2].createdAt.toISOString(),
			},
			partner: null,
		});
	});

	it("returns the same space for both members, each seeing the other", async () => {
		const [first, second] = users;
		for (const [user, partner] of [
			[first, second],
			[second, first],
		]) {
			const response = await getCurrent(sessionFor(user));

			assert.equal(response.statusCode, 200);
			assert.deepEqual(response.json(), {
				sharedSpace: {
					id: spaces[0].id,
					createdAt: spaces[0].createdAt.toISOString(),
				},
				partner: partnerView(partner),
			});
		}
	});

	it("does not expose the partner's email", async () => {
		const response = await getCurrent(sessionFor(users[0]));

		assert.equal(response.statusCode, 200);
		assert.ok(!("email" in response.json().partner));
		assert.ok(!response.body.includes(users[1].email));
	});

	it("returns only each user's own space when another space exists", async () => {
		for (const [index, user] of users.slice(0, 4).entries()) {
			const response = await getCurrent(sessionFor(user));
			const space = spaces[Math.floor(index / 2)];
			const partner = users[index % 2 === 0 ? index + 1 : index - 1];

			assert.equal(response.statusCode, 200);
			assert.deepEqual(response.json(), {
				sharedSpace: {
					id: space.id,
					createdAt: space.createdAt.toISOString(),
				},
				partner: partnerView(partner),
			});
		}
	});
});

describe("sharedSpace.create database integration", () => {
	const testStartedAt = new Date();

	before(async () => {
		await db.transaction(async (tx) => {
			await tx.insert(schema.user).values(createUsers);
			await tx.insert(schema.sharedSpace).values(existingSpaceForCreate);
			await tx.insert(schema.sharedSpaceMembership).values({
				userId: createUsers[1].id,
				spaceId: existingSpaceForCreate.id,
			});
		});
	});

	after(async () => {
		const userIds = createUsers.map((user) => user.id);
		await db.transaction(async (tx) => {
			const memberships = await tx
				.select({ spaceId: schema.sharedSpaceMembership.spaceId })
				.from(schema.sharedSpaceMembership)
				.where(inArray(schema.sharedSpaceMembership.userId, userIds));
			const spaceIds = [
				existingSpaceForCreate.id,
				...memberships.map((membership) => membership.spaceId),
			];
			await tx
				.delete(schema.sharedSpace)
				.where(inArray(schema.sharedSpace.id, spaceIds));
			await tx.delete(schema.user).where(inArray(schema.user.id, userIds));
		});
	});

	it("rejects unauthenticated callers", async () => {
		assert.deepEqual(await create(null), { ok: false, code: "UNAUTHORIZED" });
	});

	it("creates a space with the caller as its only member", async () => {
		const user = createUsers[0];
		const result = await create(sessionFor(user));

		assert.equal(result.ok, true);
		assert.ok(result.ok);

		const memberships = await membershipsFor(user.id);
		assert.deepEqual(memberships, [{ spaceId: result.sharedSpace.id }]);

		const members = await db
			.select({ userId: schema.sharedSpaceMembership.userId })
			.from(schema.sharedSpaceMembership)
			.where(eq(schema.sharedSpaceMembership.spaceId, result.sharedSpace.id));
		assert.deepEqual(members, [{ userId: user.id }]);

		const response = await getCurrent(sessionFor(user));
		assert.deepEqual(response.json(), {
			sharedSpace: result.sharedSpace,
			partner: null,
		});
	});

	it("rejects a caller who already belongs to a space", async () => {
		const user = createUsers[1];
		const result = await create(sessionFor(user));

		assert.deepEqual(result, { ok: false, code: "CONFLICT" });
		assert.deepEqual(await membershipsFor(user.id), [
			{ spaceId: existingSpaceForCreate.id },
		]);
	});

	it("allows only one of two concurrent creates and leaves no orphan space", async () => {
		const user = createUsers[2];
		const results = await Promise.all([
			create(sessionFor(user)),
			create(sessionFor(user)),
		]);

		const successes = results.filter((result) => result.ok);
		const failures = results.filter((result) => !result.ok);
		assert.equal(successes.length, 1);
		assert.deepEqual(failures, [{ ok: false, code: "CONFLICT" }]);

		const memberships = await membershipsFor(user.id);
		assert.equal(memberships.length, 1);

		const orphanSpaces = await db
			.select({ id: schema.sharedSpace.id })
			.from(schema.sharedSpace)
			.leftJoin(
				schema.sharedSpaceMembership,
				eq(schema.sharedSpaceMembership.spaceId, schema.sharedSpace.id),
			)
			.where(
				and(
					isNull(schema.sharedSpaceMembership.userId),
					gte(schema.sharedSpace.createdAt, testStartedAt),
				),
			);
		assert.deepEqual(orphanSpaces, []);
	});
});

describe("sharedSpace.createInvitation database integration", () => {
	before(async () => {
		await db.transaction(async (tx) => {
			await tx.insert(schema.user).values(invitationUsers);
			await tx
				.insert(schema.sharedSpace)
				.values(Object.values(invitationSpaces));
			await tx.insert(schema.sharedSpaceMembership).values([
				{ userId: invitationUsers[1].id, spaceId: invitationSpaces.solo.id },
				{ userId: invitationUsers[2].id, spaceId: invitationSpaces.full.id },
				{ userId: invitationUsers[3].id, spaceId: invitationSpaces.full.id },
				{
					userId: invitationUsers[4].id,
					spaceId: invitationSpaces.regenerate.id,
				},
			]);
		});
	});

	after(async () => {
		await db.transaction(async (tx) => {
			await tx.delete(schema.sharedSpace).where(
				inArray(
					schema.sharedSpace.id,
					Object.values(invitationSpaces).map((space) => space.id),
				),
			);
			await tx.delete(schema.user).where(
				inArray(
					schema.user.id,
					invitationUsers.map((user) => user.id),
				),
			);
		});
	});

	it("rejects unauthenticated callers", async () => {
		assert.deepEqual(await createInvitation(null), {
			ok: false,
			code: "UNAUTHORIZED",
		});
	});

	it("rejects a caller without a shared space", async () => {
		assert.deepEqual(await createInvitation(sessionFor(invitationUsers[0])), {
			ok: false,
			code: "PRECONDITION_FAILED",
		});
	});

	it("rejects a full space without creating an invitation", async () => {
		const result = await createInvitation(sessionFor(invitationUsers[2]));

		assert.deepEqual(result, { ok: false, code: "CONFLICT" });
		assert.deepEqual(await invitationsFor(invitationSpaces.full.id), []);
	});

	it("stores only the token hash with a 24-hour expiration", async () => {
		const user = invitationUsers[1];
		const calledAt = Date.now();
		const result = await createInvitation(sessionFor(user));
		const returnedAt = Date.now();

		assert.ok(result.ok);
		assert.match(result.token, /^[A-Za-z0-9_-]{43}$/);

		const invitations = await invitationsFor(invitationSpaces.solo.id);
		assert.equal(invitations.length, 1);
		const [invitation] = invitations;

		assert.equal(invitation.codeHash, sha256(result.token));
		assert.notEqual(invitation.codeHash, result.token);
		assert.equal(invitation.createdBy, user.id);
		assert.equal(invitation.acceptedBy, null);
		assert.equal(invitation.acceptedAt, null);

		const dayMs = 24 * 60 * 60 * 1000;
		const expiresAt = invitation.expiresAt.getTime();
		assert.equal(new Date(result.expiresAt).getTime(), expiresAt);
		assert.ok(expiresAt >= calledAt + dayMs);
		assert.ok(expiresAt <= returnedAt + dayMs);
	});

	it("replaces the previous token when generated again", async () => {
		const session = sessionFor(invitationUsers[4]);
		const first = await createInvitation(session);
		const second = await createInvitation(session);

		assert.ok(first.ok);
		assert.ok(second.ok);
		assert.notEqual(first.token, second.token);

		const invitations = await invitationsFor(invitationSpaces.regenerate.id);
		assert.equal(invitations.length, 1);
		assert.equal(invitations[0].codeHash, sha256(second.token));

		const firstTokenMatches = await db
			.select({ id: schema.sharedSpaceInvitation.id })
			.from(schema.sharedSpaceInvitation)
			.where(eq(schema.sharedSpaceInvitation.codeHash, sha256(first.token)));
		assert.deepEqual(firstTokenMatches, []);
	});
});

type AcceptInvitationResult =
	| { ok: true; sharedSpace: { id: string; createdAt: string } }
	| { ok: false; code: string };

const acceptInvitation = async (
	session: Context["session"],
	token: string,
): Promise<AcceptInvitationResult> => {
	const app = Fastify();
	app.post("/test", async (req, res) => {
		const caller = appRouter.createCaller({ req, res, session });
		try {
			const { sharedSpace } = await caller.sharedSpace.acceptInvitation({
				token,
			});
			return { ok: true, sharedSpace };
		} catch (error) {
			if (error instanceof TRPCError) {
				return { ok: false, code: error.code };
			}
			throw error;
		}
	});

	try {
		const response = await app.inject({ method: "POST", url: "/test" });
		assert.equal(response.statusCode, 200);
		return response.json<AcceptInvitationResult>();
	} finally {
		await app.close();
	}
};

describe("sharedSpace.acceptInvitation database integration", () => {
	const acceptUsers: (typeof users)[number][] = [];
	const acceptSpaceIds: string[] = [];

	const addUser = async () => {
		const user = {
			id: randomUUID(),
			name: `Accept test user ${acceptUsers.length}`,
			email: `${randomUUID()}@example.test`,
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		acceptUsers.push(user);
		await db.insert(schema.user).values(user);
		return user;
	};

	const addSpaceWith = async (...members: (typeof users)[number][]) => {
		const space = { id: randomUUID(), createdAt: new Date() };
		acceptSpaceIds.push(space.id);
		await db.transaction(async (tx) => {
			await tx.insert(schema.sharedSpace).values(space);
			await tx
				.insert(schema.sharedSpaceMembership)
				.values(
					members.map((member) => ({ userId: member.id, spaceId: space.id })),
				);
		});
		return space;
	};

	const inviteFromNewSpace = async () => {
		const inviter = await addUser();
		const space = await addSpaceWith(inviter);
		const result = await createInvitation(sessionFor(inviter));
		assert.ok(result.ok);
		return { inviter, space, token: result.token };
	};

	const invitationRow = async (spaceId: string) => {
		const [invitation] = await invitationsFor(spaceId);
		return invitation;
	};

	const memberIdsOf = async (spaceId: string) =>
		(
			await db
				.select({ userId: schema.sharedSpaceMembership.userId })
				.from(schema.sharedSpaceMembership)
				.where(eq(schema.sharedSpaceMembership.spaceId, spaceId))
		)
			.map((member) => member.userId)
			.sort();

	after(async () => {
		await db.transaction(async (tx) => {
			if (acceptSpaceIds.length > 0) {
				await tx
					.delete(schema.sharedSpace)
					.where(inArray(schema.sharedSpace.id, acceptSpaceIds));
			}
			if (acceptUsers.length > 0) {
				await tx.delete(schema.user).where(
					inArray(
						schema.user.id,
						acceptUsers.map((user) => user.id),
					),
				);
			}
		});
	});

	it("rejects unauthenticated callers", async () => {
		const { token } = await inviteFromNewSpace();

		assert.deepEqual(await acceptInvitation(null, token), {
			ok: false,
			code: "UNAUTHORIZED",
		});
	});

	it("rejects a malformed token", async () => {
		const recipient = await addUser();

		assert.deepEqual(await acceptInvitation(sessionFor(recipient), "short"), {
			ok: false,
			code: "BAD_REQUEST",
		});
	});

	it("rejects an unknown token", async () => {
		const recipient = await addUser();
		const unknownToken = "A".repeat(43);

		assert.deepEqual(
			await acceptInvitation(sessionFor(recipient), unknownToken),
			{ ok: false, code: "NOT_FOUND" },
		);
		assert.deepEqual(await membershipsFor(recipient.id), []);
	});

	it("adds the recipient to the inviter's space and consumes the invitation", async () => {
		const { inviter, space, token } = await inviteFromNewSpace();
		const recipient = await addUser();

		const before = await getCurrent(sessionFor(inviter));
		assert.equal(before.json().partner, null);

		const result = await acceptInvitation(sessionFor(recipient), token);

		assert.deepEqual(result, {
			ok: true,
			sharedSpace: {
				id: space.id,
				createdAt: space.createdAt.toISOString(),
			},
		});
		assert.deepEqual(
			await memberIdsOf(space.id),
			[inviter.id, recipient.id].sort(),
		);

		const invitation = await invitationRow(space.id);
		assert.equal(invitation.acceptedBy, recipient.id);
		assert.ok(invitation.acceptedAt instanceof Date);

		for (const [user, partner] of [
			[inviter, recipient],
			[recipient, inviter],
		]) {
			const response = await getCurrent(sessionFor(user));
			assert.equal(response.json().sharedSpace.id, space.id);
			assert.equal(response.json().partner.id, partner.id);
		}
	});

	it("rejects reuse of an accepted token", async () => {
		const { space, token } = await inviteFromNewSpace();
		const firstRecipient = await addUser();
		const secondRecipient = await addUser();

		assert.ok((await acceptInvitation(sessionFor(firstRecipient), token)).ok);
		assert.deepEqual(
			await acceptInvitation(sessionFor(secondRecipient), token),
			{ ok: false, code: "NOT_FOUND" },
		);
		assert.deepEqual(await membershipsFor(secondRecipient.id), []);
		assert.equal((await invitationRow(space.id)).acceptedBy, firstRecipient.id);
	});

	it("rejects an expired token", async () => {
		const { space, token } = await inviteFromNewSpace();
		const recipient = await addUser();
		await db
			.update(schema.sharedSpaceInvitation)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(schema.sharedSpaceInvitation.spaceId, space.id));

		assert.deepEqual(await acceptInvitation(sessionFor(recipient), token), {
			ok: false,
			code: "NOT_FOUND",
		});
		assert.deepEqual(await membershipsFor(recipient.id), []);
		assert.equal((await invitationRow(space.id)).acceptedAt, null);
	});

	it("rejects the inviter accepting their own invitation", async () => {
		const { inviter, space, token } = await inviteFromNewSpace();

		assert.deepEqual(await acceptInvitation(sessionFor(inviter), token), {
			ok: false,
			code: "BAD_REQUEST",
		});
		assert.deepEqual(await memberIdsOf(space.id), [inviter.id]);
		assert.equal((await invitationRow(space.id)).acceptedAt, null);
	});

	it("rejects a recipient who already belongs to a space", async () => {
		const { space, token } = await inviteFromNewSpace();
		const recipient = await addUser();
		const recipientSpace = await addSpaceWith(recipient);

		assert.deepEqual(await acceptInvitation(sessionFor(recipient), token), {
			ok: false,
			code: "CONFLICT",
		});
		assert.deepEqual(await membershipsFor(recipient.id), [
			{ spaceId: recipientSpace.id },
		]);
		assert.equal((await invitationRow(space.id)).acceptedAt, null);
	});

	it("rejects a replaced token but accepts its replacement", async () => {
		const { inviter, space, token: oldToken } = await inviteFromNewSpace();
		const replacement = await createInvitation(sessionFor(inviter));
		assert.ok(replacement.ok);
		const recipient = await addUser();

		assert.deepEqual(await acceptInvitation(sessionFor(recipient), oldToken), {
			ok: false,
			code: "NOT_FOUND",
		});

		const result = await acceptInvitation(
			sessionFor(recipient),
			replacement.token,
		);
		assert.ok(result.ok);
		assert.equal(result.sharedSpace.id, space.id);
	});

	it("rejects an invitation to a space that filled up", async () => {
		const { inviter, space, token } = await inviteFromNewSpace();
		const otherMember = await addUser();
		await db
			.insert(schema.sharedSpaceMembership)
			.values({ userId: otherMember.id, spaceId: space.id });
		const recipient = await addUser();

		assert.deepEqual(await acceptInvitation(sessionFor(recipient), token), {
			ok: false,
			code: "NOT_FOUND",
		});
		assert.deepEqual(
			await memberIdsOf(space.id),
			[inviter.id, otherMember.id].sort(),
		);
	});

	it("lets only one of two concurrent recipients accept a token", async () => {
		const { inviter, space, token } = await inviteFromNewSpace();
		const recipients = [await addUser(), await addUser()];

		const results = await Promise.all(
			recipients.map((recipient) =>
				acceptInvitation(sessionFor(recipient), token),
			),
		);

		const winnerIndex = results.findIndex((result) => result.ok);
		assert.notEqual(winnerIndex, -1);
		assert.deepEqual(results[1 - winnerIndex], {
			ok: false,
			code: "NOT_FOUND",
		});

		const winner = recipients[winnerIndex];
		assert.deepEqual(
			await memberIdsOf(space.id),
			[inviter.id, winner.id].sort(),
		);
		assert.equal((await invitationRow(space.id)).acceptedBy, winner.id);
	});

	it("lets a recipient join only one space when accepting two invitations at once", async () => {
		const invitations = [
			await inviteFromNewSpace(),
			await inviteFromNewSpace(),
		];
		const recipient = await addUser();

		const results = await Promise.all(
			invitations.map(({ token }) =>
				acceptInvitation(sessionFor(recipient), token),
			),
		);

		const winnerIndex = results.findIndex((result) => result.ok);
		assert.notEqual(winnerIndex, -1);
		assert.deepEqual(results[1 - winnerIndex], {
			ok: false,
			code: "CONFLICT",
		});

		assert.deepEqual(await membershipsFor(recipient.id), [
			{ spaceId: invitations[winnerIndex].space.id },
		]);
		const loser = invitations[1 - winnerIndex];
		assert.deepEqual(await memberIdsOf(loser.space.id), [loser.inviter.id]);
		assert.equal((await invitationRow(loser.space.id)).acceptedAt, null);
	});
});

describe("invitation rate limits database integration", () => {
	const limitUsers = Array.from({ length: 4 }, (_, index) => ({
		id: randomUUID(),
		name: `Rate limit test user ${index}`,
		email: `${randomUUID()}@example.test`,
		emailVerified: true,
		image: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	}));
	// limitUsers[0]: generates invitations for createSpace.
	// limitUsers[1]: invites from acceptSpace.
	// limitUsers[2]: exhausts the acceptance limit.
	// limitUsers[3]: accepts after limitUsers[2] is limited.
	const createSpace = { id: randomUUID(), createdAt: new Date() };
	const acceptSpace = { id: randomUUID(), createdAt: new Date() };

	const rateLimitedResponse = async (
		session: Context["session"],
		call: (
			caller: ReturnType<typeof appRouter.createCaller>,
		) => Promise<unknown>,
	) => {
		const app = Fastify();
		app.post("/test", async (req, res) => {
			const caller = appRouter.createCaller({ req, res, session });
			try {
				await call(caller);
				return { ok: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					return { ok: false, code: error.code };
				}
				throw error;
			}
		});

		try {
			return await app.inject({ method: "POST", url: "/test" });
		} finally {
			await app.close();
		}
	};

	before(async () => {
		await db.transaction(async (tx) => {
			await tx.insert(schema.user).values(limitUsers);
			await tx.insert(schema.sharedSpace).values([createSpace, acceptSpace]);
			await tx.insert(schema.sharedSpaceMembership).values([
				{ userId: limitUsers[0].id, spaceId: createSpace.id },
				{ userId: limitUsers[1].id, spaceId: acceptSpace.id },
			]);
		});
	});

	after(async () => {
		await db.transaction(async (tx) => {
			await tx
				.delete(schema.sharedSpace)
				.where(
					inArray(schema.sharedSpace.id, [createSpace.id, acceptSpace.id]),
				);
			await tx.delete(schema.user).where(
				inArray(
					schema.user.id,
					limitUsers.map((user) => user.id),
				),
			);
		});
	});

	it("limits invitation creation per user without replacing the last token", async () => {
		const session = sessionFor(limitUsers[0]);
		let lastToken = "";
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const result = await createInvitation(session);
			assert.ok(result.ok, `attempt ${attempt + 1} should succeed`);
			lastToken = result.token;
		}

		const response = await rateLimitedResponse(session, (caller) =>
			caller.sharedSpace.createInvitation(),
		);
		assert.deepEqual(response.json(), {
			ok: false,
			code: "TOO_MANY_REQUESTS",
		});
		const retryAfter = Number(response.headers["retry-after"]);
		assert.ok(retryAfter > 0 && retryAfter <= 60 * 60);

		const invitations = await invitationsFor(createSpace.id);
		assert.equal(invitations.length, 1);
		assert.equal(invitations[0].codeHash, sha256(lastToken));
	});

	it("limits acceptance attempts per user, including with a valid token", async () => {
		const invitation = await createInvitation(sessionFor(limitUsers[1]));
		assert.ok(invitation.ok);
		const limitedSession = sessionFor(limitUsers[2]);

		for (let attempt = 0; attempt < 10; attempt += 1) {
			assert.deepEqual(await acceptInvitation(limitedSession, "A".repeat(43)), {
				ok: false,
				code: "NOT_FOUND",
			});
		}

		const response = await rateLimitedResponse(limitedSession, (caller) =>
			caller.sharedSpace.acceptInvitation({ token: invitation.token }),
		);
		assert.deepEqual(response.json(), {
			ok: false,
			code: "TOO_MANY_REQUESTS",
		});
		const retryAfter = Number(response.headers["retry-after"]);
		assert.ok(retryAfter > 0 && retryAfter <= 15 * 60);
		assert.deepEqual(await membershipsFor(limitUsers[2].id), []);

		// Another user is unaffected and can still use the token.
		const accepted = await acceptInvitation(
			sessionFor(limitUsers[3]),
			invitation.token,
		);
		assert.ok(accepted.ok);
		assert.equal(accepted.sharedSpace.id, acceptSpace.id);
	});

	it("counts malformed acceptance attempts toward the limit", async () => {
		const user = {
			id: randomUUID(),
			name: "Rate limit malformed user",
			email: `${randomUUID()}@example.test`,
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		limitUsers.push(user);
		await db.insert(schema.user).values(user);
		const session = sessionFor(user);

		for (let attempt = 0; attempt < 10; attempt += 1) {
			assert.deepEqual(await acceptInvitation(session, "short"), {
				ok: false,
				code: "BAD_REQUEST",
			});
		}
		assert.deepEqual(await acceptInvitation(session, "short"), {
			ok: false,
			code: "TOO_MANY_REQUESTS",
		});
	});
});
