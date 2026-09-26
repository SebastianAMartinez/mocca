import fastifyCors from "@fastify/cors";
import fastifyFormbody from "@fastify/formbody";
import Fastify from "fastify";

import authPlugin from "./plugins/auth.js";
import trpcPlugin from "./plugins/trpc.js";
import healthRoute from "./routes/health.js";

export function buildApp() {
	const app = Fastify({
		logger: process.env.NODE_ENV !== "test",
		routerOptions: {
			maxParamLength: 5000,
		},
	});

	app.register(fastifyCors, {
		origin: process.env.CLIENT_ORIGIN ?? "http://localhost:8081",
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
		credentials: true,
		maxAge: 86400,
	});
	app.register(fastifyFormbody);

	app.register(healthRoute);
	app.register(authPlugin);
	app.register(trpcPlugin);

	return app;
}
