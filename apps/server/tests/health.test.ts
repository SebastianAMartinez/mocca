import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("health route", () => {
	let app: ReturnType<typeof buildApp>;

	beforeEach(() => {
		app = buildApp();
	});

	afterEach(async () => {
		await app.close();
	});

	it("returns an operational status", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/health",
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ status: "ok" });
	});

	it("serves the tRPC health procedure", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/trpc/health",
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toMatchObject({
			result: {
				data: { status: "ok" },
			},
		});
	});
});
