import { useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { authClient } from "@/lib/auth-client";

export default function Index() {
	const { data: session } = authClient.useSession();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	async function handleSignOut() {
		setErrorMessage(null);

		try {
			const { error } = await authClient.signOut();
			if (error)
				setErrorMessage(
					error.message ?? "Unable to sign out. Please try again.",
				);
		} catch {
			setErrorMessage("Unable to sign out. Please try again.");
		}
	}

	return (
		<View style={styles.container}>
			<Text>Welcome, {session?.user.name ?? session?.user.email}</Text>
			<Button title="Log out" onPress={() => void handleSignOut()} />
			{errorMessage ? <Text>{errorMessage}</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
