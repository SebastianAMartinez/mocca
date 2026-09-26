import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsync } from "fastify";

import { auth } from "../auth.js";

const authPlugin: FastifyPluginAsync = async (fastify) => {
	fastify.route({
		method: ["GET", "POST"],
		url: "/api/auth/*",
		handler: async (request, reply) => {
			try {
				const baseUrl = process.env.BETTER_AUTH_URL;

				if (!baseUrl) {
					throw new Error("BETTER_AUTH_URL is not set");
				}

				const contentType = request.headers["content-type"] ?? "";
				const body =
					request.body === undefined
						? undefined
						: contentType.startsWith("application/x-www-form-urlencoded")
							? new URLSearchParams(
									Object.entries(request.body as Record<string, string>),
								).toString()
							: JSON.stringify(request.body);

				const authRequest = new Request(new URL(request.url, baseUrl), {
					method: request.method,
					headers: fromNodeHeaders(request.headers),
					...(body !== undefined ? { body } : {}),
				});

				const response = await auth.handler(authRequest);

				reply.status(response.status);
				const setCookies = response.headers.getSetCookie();

				response.headers.forEach((value, key) => {
					if (key === "set-cookie") {
						return;
					}

					reply.header(key, value);
				});

				if (setCookies.length > 0) {
					reply.header("set-cookie", setCookies);
				}

				return reply.send(response.body ? await response.text() : null);
			} catch (error) {
				request.log.error({ err: error }, "Authentication request failed");

				return reply.status(500).send({
					error: "Internal authentication error",
					code: "AUTH_FAILURE",
				});
			}
		},
	});
};

export default authPlugin;
