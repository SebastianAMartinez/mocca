import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { expo } from "@better-auth/expo";
import { db, schema } from "@mocca/db";
import { betterAuth } from "better-auth/minimal";
import { importPKCS8, SignJWT } from "jose";

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

export const auth = betterAuth({
	plugins: [expo()],
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	baseURL: betterAuthUrl,
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
