import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

const testApplePrivateKey = generateKeyPairSync("ec", {
	namedCurve: "P-256",
})
	.privateKey.export({ type: "pkcs8", format: "pem" })
	.toString();

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://mocca:mocca@localhost:5432/mocca";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET = "test-only-secret-with-enough-length";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.APPLE_CLIENT_ID = "test-apple-client-id";
process.env.APPLE_TEAM_ID = "test-apple-team-id";
process.env.APPLE_KEY_ID = "test-apple-key-id";
process.env.APPLE_PRIVATE_KEY = testApplePrivateKey;
process.env.APPLE_APP_BUNDLE_IDENTIFIER = "com.example.mocca";

const { buildApp } = await import("../src/app.js");

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

		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), { status: "ok" });
	});

	it("serves the tRPC health procedure", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/trpc/health",
		});

		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), {
			result: { data: { status: "ok" } },
		});
	});

	it("rejects an unauthenticated shared-space request", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/trpc/sharedSpace.getMine",
		});

		assert.equal(response.statusCode, 401);
		assert.equal(response.json().error.data.code, "UNAUTHORIZED");
	});
});
