import { db, schema } from "@mocca/db";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create();

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

export const appRouter = t.router({
	health: publicProcedure.query(() => {
		return { status: "ok" as const };
	}),
	sharedSpace: t.router({
		getMine: authedProcedure.query(async ({ ctx }) => {
			const spaceResults = await db
				.select({
					sharedSpace: {
						id: schema.sharedSpace.id,
						createdAt: schema.sharedSpace.createdAt,
					},
				})
				.from(schema.sharedSpaceMembership)
				.innerJoin(
					schema.sharedSpace,
					eq(schema.sharedSpaceMembership.spaceId, schema.sharedSpace.id),
				)
				.where(eq(schema.sharedSpaceMembership.userId, ctx.user.id));

			return spaceResults[0] ?? null;
		}),
	}),
});

export type AppRouter = typeof appRouter;
