import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";

export default function Index() {
	const { data: session } = authClient.useSession();
	const trpc = useTRPC();
	const spaceQuery = useQuery(trpc.sharedSpace.current.queryOptions());
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
			{spaceQuery.isPending ? (
				<Text>Loading your shared space...</Text>
			) : spaceQuery.isError ? (
				<View>
					<Text>
						Unable to load your shared space: {spaceQuery.error.message}
					</Text>
					<Button
						title="Retry"
						disabled={spaceQuery.isFetching}
						onPress={() => void spaceQuery.refetch()}
					/>
				</View>
			) : spaceQuery.data === null ? (
				<Text>No shared space yet.</Text>
			) : (
				<Text>Shared space: {spaceQuery.data.sharedSpace.id}</Text>
			)}
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
