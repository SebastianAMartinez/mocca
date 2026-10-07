import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { expo } from "@better-auth/expo";
import { db, schema } from "@mocca/db";
import { betterAuth } from "better-auth/minimal";
import { and, eq } from "drizzle-orm";
import { importPKCS8, SignJWT } from "jose";

import { leaveSharedSpace } from "./shared-space.js";

const requireEnvironmentVariable = (name: string): string => {
	const value = process.env[name];

	if (!value) {
		throw new Error(`${name} is not set`);
	}

	return value;
};

const generateAppleClientSecret = async (
	clientId: string,
	teamId: string,
	keyId: string,
	privateKey: string,
): Promise<string> => {
	const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");
	const now = Math.floor(Date.now() / 1000);
	return new SignJWT({})
		.setProtectedHeader({ alg: "ES256", kid: keyId })
		.setIssuer(teamId)
		.setSubject(clientId)
		.setAudience("https://appleid.apple.com")
		.setIssuedAt(now)
		.setExpirationTime(now + 180 * 24 * 60 * 60)
		.sign(key);
};

const betterAuthUrl = requireEnvironmentVariable("BETTER_AUTH_URL");
const googleClientId = requireEnvironmentVariable("GOOGLE_CLIENT_ID");
const googleClientSecret = requireEnvironmentVariable("GOOGLE_CLIENT_SECRET");
const appleClientId = requireEnvironmentVariable("APPLE_CLIENT_ID");
const appleTeamId = requireEnvironmentVariable("APPLE_TEAM_ID");
const appleKeyId = requireEnvironmentVariable("APPLE_KEY_ID");
const applePrivateKey = requireEnvironmentVariable("APPLE_PRIVATE_KEY");
const appleAppBundleIdentifier = requireEnvironmentVariable(
	"APPLE_APP_BUNDLE_IDENTIFIER",
);
const expoDevelopmentOrigins =
	process.env.NODE_ENV === "development"
		? ["exp://", "exp://**", "exp://192.168.*.*:*/**"]
		: [];

// Apple requires revoking its tokens on account deletion, and a failure here must not block it.
const revokeAppleTokens = async (userId: string): Promise<void> => {
	try {
		const [appleAccount] = await db
			.select({
				accessToken: schema.account.accessToken,
				refreshToken: schema.account.refreshToken,
			})
			.from(schema.account)
			.where(
				and(
					eq(schema.account.userId, userId),
					eq(schema.account.providerId, "apple"),
				),
			)
			.limit(1);

		const token = appleAccount?.refreshToken ?? appleAccount?.accessToken;
		if (!token) return;

		const response = await fetch("https://appleid.apple.com/auth/revoke", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: appleClientId,
				client_secret: await generateAppleClientSecret(
					appleClientId,
					appleTeamId,
					appleKeyId,
					applePrivateKey,
				),
				token,
				token_type_hint: appleAccount.refreshToken
					? "refresh_token"
					: "access_token",
			}),
			signal: AbortSignal.timeout(5_000),
		});

		if (!response.ok) {
			console.error(`Apple token revocation failed with ${response.status}`);
		}
	} catch (error) {
		console.error("Apple token revocation failed", error);
	}
};

export const auth = betterAuth({
	plugins: [expo()],
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	baseURL: betterAuthUrl,
	user: {
		deleteUser: {
			enabled: true,
			// The user must leave their space first because the membership foreign key restricts deletion.
			beforeDelete: async (user) => {
				await leaveSharedSpace(user.id);
				await revokeAppleTokens(user.id);
			},
		},
	},
	socialProviders: {
		google: {
			clientId: googleClientId,
			clientSecret: googleClientSecret,
		},
		apple: async () => ({
			clientId: appleClientId,
			clientSecret: await generateAppleClientSecret(
				appleClientId,
				appleTeamId,
				appleKeyId,
				applePrivateKey,
			),
			appBundleIdentifier: appleAppBundleIdentifier,
		}),
	},
	trustedOrigins: [
		"https://appleid.apple.com",
		"mocca://",
		...expoDevelopmentOrigins,
	],
});
