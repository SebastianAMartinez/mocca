import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, schema } from "@mocca/db";
import { initTRPC, TRPCError } from "@trpc/server";
import { and, DrizzleQueryError, eq, ne } from "drizzle-orm";
import { z } from "zod";

import {
	countMembers,
	findMembership,
	leaveSharedSpace,
	lockSharedSpace,
} from "../shared-space.js";
import type { Context } from "./context.js";
import { createRateLimiter, type RateLimiter } from "./rate-limit.js";

const t = initTRPC.context<Context>().create();

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SPACE_MEMBERS = 2;

const hashInvitationToken = (token: string): string =>
	createHash("sha256").update(token).digest("hex");

const invitationTokenSchema = z
	.string()
	.regex(/^[A-Za-z0-9_-]{43}$/, "Invalid invitation token");

const invitationUnavailableError = () =>
	new TRPCError({
		code: "NOT_FOUND",
		message: "This invitation is invalid or no longer available",
	});

const isUniqueViolation = (error: unknown, constraint: string): boolean => {
	if (!(error instanceof DrizzleQueryError)) return false;
	const cause: unknown = error.cause;
	return (
		typeof cause === "object" &&
		cause !== null &&
		"code" in cause &&
		cause.code === "23505" &&
		"constraint" in cause &&
		cause.constraint === constraint
	);
};

const alreadyHasSpaceError = () =>
	new TRPCError({
		code: "CONFLICT",
		message: "User already has a shared space",
	});

const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async (opts) => {
	const { ctx } = opts;
	if (!ctx.session) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}

	return opts.next({
		ctx: {
			user: ctx.session.user,
		},
	});
});

const rateLimitedProcedure = (limiter: RateLimiter) =>
	authedProcedure.use(async (opts) => {
		const result = limiter.hit(opts.ctx.user.id);
		if (!result.allowed) {
			opts.ctx.res.header(
				"Retry-After",
				String(Math.ceil(result.retryAfterMs / 1000)),
			);
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "Too many attempts. Please try again later.",
			});
		}

		return opts.next();
	});

const createInvitationLimiter = createRateLimiter({
	limit: 10,
	windowMs: 60 * 60 * 1000,
});
const acceptInvitationLimiter = createRateLimiter({
	limit: 10,
	windowMs: 15 * 60 * 1000,
});

export const appRouter = t.router({
	health: publicProcedure.query(() => {
		return { status: "ok" as const };
	}),
	sharedSpace: t.router({
		current: authedProcedure.query(async ({ ctx }) => {
			const [space] = await db
				.select({
					id: schema.sharedSpace.id,
					createdAt: schema.sharedSpace.createdAt,
				})
				.from(schema.sharedSpaceMembership)
				.innerJoin(
					schema.sharedSpace,
					eq(schema.sharedSpaceMembership.spaceId, schema.sharedSpace.id),
				)
				.where(eq(schema.sharedSpaceMembership.userId, ctx.user.id))
				.limit(1);

			if (!space) {
				return null;
			}

			const partners = await db
				.select({
					id: schema.user.id,
					name: schema.user.name,
					image: schema.user.image,
				})
				.from(schema.sharedSpaceMembership)
				.innerJoin(
					schema.user,
					eq(schema.sharedSpaceMembership.userId, schema.user.id),
				)
				.where(
					and(
						eq(schema.sharedSpaceMembership.spaceId, space.id),
						ne(schema.sharedSpaceMembership.userId, ctx.user.id),
					),
				)
				.limit(1);

			return { sharedSpace: space, partner: partners.at(0) ?? null };
		}),
		create: authedProcedure.mutation(async ({ ctx }) => {
			try {
				return await db.transaction(async (tx) => {
					if (await findMembership(tx, ctx.user.id)) {
						throw alreadyHasSpaceError();
					}

					const [sharedSpace] = await tx
						.insert(schema.sharedSpace)
						.values({ id: randomUUID() })
						.returning({
							id: schema.sharedSpace.id,
							createdAt: schema.sharedSpace.createdAt,
						});

					await tx.insert(schema.sharedSpaceMembership).values({
						spaceId: sharedSpace.id,
						userId: ctx.user.id,
					});

					return { sharedSpace };
				});
			} catch (error) {
				// A concurrent create for the same user can pass the check above.
				if (
					isUniqueViolation(error, "shared_space_membership_user_id_unique")
				) {
					throw alreadyHasSpaceError();
				}
				throw error;
			}
		}),
		leave: authedProcedure.mutation(async ({ ctx }) => {
			await leaveSharedSpace(ctx.user.id);
		}),
		createInvitation: rateLimitedProcedure(createInvitationLimiter).mutation(
			async ({ ctx }) => {
				const token = randomBytes(32).toString("base64url");
				const codeHash = hashInvitationToken(token);
				const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

				await db.transaction(async (tx) => {
					const membership = await findMembership(tx, ctx.user.id);

					if (!membership) {
						throw new TRPCError({
							code: "PRECONDITION_FAILED",
							message: "Create a shared space before inviting someone",
						});
					}

					// Serializes with acceptInvitation, which must lock the same row.
					await lockSharedSpace(tx, membership.spaceId);

					if (
						(await countMembers(tx, membership.spaceId)) >= MAX_SPACE_MEMBERS
					) {
						throw new TRPCError({
							code: "CONFLICT",
							message: "This shared space already has two members",
						});
					}

					await tx
						.insert(schema.sharedSpaceInvitation)
						.values({
							id: randomUUID(),
							spaceId: membership.spaceId,
							codeHash,
							createdBy: ctx.user.id,
							expiresAt,
						})
						.onConflictDoUpdate({
							target: schema.sharedSpaceInvitation.spaceId,
							set: {
								codeHash,
								createdBy: ctx.user.id,
								createdAt: new Date(),
								expiresAt,
								acceptedBy: null,
								acceptedAt: null,
							},
						});
				});

				return { token, expiresAt };
			},
		),
		acceptInvitation: rateLimitedProcedure(acceptInvitationLimiter)
			.input(z.object({ token: invitationTokenSchema }))
			.mutation(async ({ ctx, input }) => {
				const codeHash = hashInvitationToken(input.token);

				try {
					return await db.transaction(async (tx) => {
						const [candidate] = await tx
							.select({ spaceId: schema.sharedSpaceInvitation.spaceId })
							.from(schema.sharedSpaceInvitation)
							.where(eq(schema.sharedSpaceInvitation.codeHash, codeHash))
							.limit(1);

						if (!candidate) {
							throw invitationUnavailableError();
						}

						// Serializes with createInvitation and other acceptances.
						const sharedSpace = await lockSharedSpace(tx, candidate.spaceId);

						// Reread under the lock: the invitation may have been
						// accepted or replaced while this request was waiting.
						const [invitation] = await tx
							.select({
								id: schema.sharedSpaceInvitation.id,
								createdBy: schema.sharedSpaceInvitation.createdBy,
								expiresAt: schema.sharedSpaceInvitation.expiresAt,
								acceptedAt: schema.sharedSpaceInvitation.acceptedAt,
							})
							.from(schema.sharedSpaceInvitation)
							.where(
								and(
									eq(schema.sharedSpaceInvitation.spaceId, candidate.spaceId),
									eq(schema.sharedSpaceInvitation.codeHash, codeHash),
								),
							);

						if (
							!sharedSpace ||
							!invitation ||
							invitation.acceptedAt !== null ||
							invitation.expiresAt.getTime() <= Date.now()
						) {
							throw invitationUnavailableError();
						}

						if (invitation.createdBy === ctx.user.id) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: "You can't accept your own invitation",
							});
						}

						if (await findMembership(tx, ctx.user.id)) {
							throw alreadyHasSpaceError();
						}

						if ((await countMembers(tx, sharedSpace.id)) >= MAX_SPACE_MEMBERS) {
							throw invitationUnavailableError();
						}

						await tx.insert(schema.sharedSpaceMembership).values({
							spaceId: sharedSpace.id,
							userId: ctx.user.id,
						});

						await tx
							.update(schema.sharedSpaceInvitation)
							.set({ acceptedBy: ctx.user.id, acceptedAt: new Date() })
							.where(eq(schema.sharedSpaceInvitation.id, invitation.id));

						return { sharedSpace };
					});
				} catch (error) {
					// Accepting invitations to two different spaces at once locks
					// different rows; the one-membership-per-user index decides.
					if (
						isUniqueViolation(error, "shared_space_membership_user_id_unique")
					) {
						throw alreadyHasSpaceError();
					}
					throw error;
				}
			}),
	}),
});

export type AppRouter = typeof appRouter;
