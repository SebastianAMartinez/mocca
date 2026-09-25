import Fastify from "fastify";

import trpcPlugin from "./plugins/trpc.js";
import healthRoute from "./routes/health.js";

export function buildApp() {
	const app = Fastify({
		logger: process.env.NODE_ENV !== "test",
		routerOptions: {
			maxParamLength: 5000,
		},
	});

	app.register(healthRoute);
	app.register(trpcPlugin);

	return app;
}
