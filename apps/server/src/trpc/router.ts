import { initTRPC } from "@trpc/server";
import { z } from "zod";

import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create();

const publicProcedure = t.procedure;

export const appRouter = t.router({
	health: publicProcedure.query(() => {
		return { status: "ok" as const };
	}),
	greet: publicProcedure
		.input(z.object({ name: z.string().min(1) }))
		.query(({ input }) => {
			return { greeting: `Hello, ${input.name}!` };
		}),
});

export type AppRouter = typeof appRouter;
