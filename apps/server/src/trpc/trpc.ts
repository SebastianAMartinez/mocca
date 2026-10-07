import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context.js";
import type { RateLimiter } from "./rate-limit.js";

const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

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

export const rateLimitedProcedure = (limiter: RateLimiter) =>
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
