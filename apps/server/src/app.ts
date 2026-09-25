import Fastify from "fastify";

import healthRoute from "./routes/health.js";

export function buildApp() {
	const app = Fastify({
		logger: process.env.NODE_ENV !== "test",
	});

	app.register(healthRoute);

	return app;
}
