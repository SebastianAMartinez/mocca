import { router } from "expo-router";
import { useState } from "react";
import { Button, Text, View } from "react-native";
import { authClient } from "@/lib/auth-client";

type Provider = "google" | "apple";

export default function SignInScreen() {
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	async function signIn(provider: Provider) {
		setLoading(true);
		setErrorMessage(null);

		try {
			const { error } = await authClient.signIn.social({
				provider,
				callbackURL: "/",
			});

			if (error) {
				setErrorMessage(error.message ?? "Sign-in failed. Please try again.");
				return;
			}

			router.replace("/");
		} catch {
			setErrorMessage("Sign-in failed. Check your connection and try again.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<View>
			<Button
				title="Sign in with Google"
				disabled={loading}
				onPress={() => void signIn("google")}
			/>
			<Button
				title="Sign in with Apple"
				disabled={loading}
				onPress={() => void signIn("apple")}
			/>
			{errorMessage ? <Text>{errorMessage}</Text> : null}
		</View>
	);
}
