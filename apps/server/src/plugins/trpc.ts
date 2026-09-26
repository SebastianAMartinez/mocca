import {
	type FastifyTRPCPluginOptions,
	fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import type { FastifyPluginAsync } from "fastify";

import { createContext } from "../trpc/context.js";
import { type AppRouter, appRouter } from "../trpc/router.js";

const trpcPlugin: FastifyPluginAsync = async (fastify) => {
	fastify.register(fastifyTRPCPlugin, {
		prefix: "/trpc",
		trpcOptions: {
			router: appRouter,
			createContext,
			maxBatchSize: 10,
			onError({ path, error }) {
				fastify.log.error({ err: error, path }, "tRPC request failed");
			},
		} satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
	});
};

export default trpcPlugin;
