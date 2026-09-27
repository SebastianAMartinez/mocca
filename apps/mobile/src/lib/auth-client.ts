import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
	throw new Error("EXPO_PUBLIC_API_URL is not set");
}

export const authClient = createAuthClient({
	baseURL: apiUrl,
	plugins: [
		expoClient({
			scheme: "mocca",
			storagePrefix: "mocca",
			storage: SecureStore,
		}),
	],
});
