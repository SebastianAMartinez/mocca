import { Button, Column, Host, RNHostView } from "@expo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import {
	ActivityIndicator,
	AppState,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "@/components/account-menu";
import { AppText } from "@/components/app-text";
import { InvitationActions } from "@/components/invitation-actions";
import { authClient } from "@/lib/auth-client";
import { buttonStyle, spacing, useAppTheme } from "@/lib/theme";
import { useTRPC } from "@/lib/trpc";
import { fullWidthColumnModifiers } from "@/lib/ui-modifiers";
import { useSignOut } from "@/lib/use-sign-out";

const HomeScreen = () => {
	const { data: session } = authClient.useSession();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const spaceQuery = useQuery(trpc.sharedSpace.current.queryOptions());
	const createSpace = useMutation(
		trpc.sharedSpace.create.mutationOptions({
			retry: false,
			onSuccess: async ({ sharedSpace }) => {
				const queryKey = trpc.sharedSpace.current.queryKey();
				await queryClient.cancelQueries({ queryKey });
				queryClient.setQueryData(queryKey, () => ({
					sharedSpace,
					partner: null,
				}));
				await queryClient.invalidateQueries({ queryKey });
			},
			onError: async (error) => {
				if (error.data?.code === "CONFLICT") {
					await queryClient.invalidateQueries({
						queryKey: trpc.sharedSpace.current.queryKey(),
					});
				}
			},
		}),
	);
	const { signOut, isSigningOut, errorMessage } = useSignOut();
	const { scheme, palette } = useAppTheme();
	const insets = useSafeAreaInsets();
	const name = session?.user.name.trim().split(/\s+/)[0] || session?.user.email;
	const { refetch } = spaceQuery;

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") void refetch();
		});
		return () => subscription.remove();
	}, [refetch]);

	const handleCreateSpace = () => {
		if (createSpace.isPending || isSigningOut || spaceQuery.data !== null) {
			return;
		}

		createSpace.mutate();
	};

	return (
		<ScrollView
			style={{ backgroundColor: palette.background }}
			contentContainerStyle={[
				styles.content,
				{ paddingBottom: Math.max(insets.bottom, spacing.large) },
			]}
			contentInsetAdjustmentBehavior="automatic"
		>
			<Stack.Screen
				options={{
					headerShown: true,
					title: "Mocca",
					headerStyle: { backgroundColor: palette.background },
					headerTintColor: palette.text,
					headerShadowVisible: false,
					headerRight: () => (
						<AccountMenu
							isSigningOut={isSigningOut}
							onSignOut={() => void signOut()}
						/>
					),
				}}
			/>
			<Host
				matchContents={{ vertical: true }}
				colorScheme={scheme}
				ignoreSafeArea="all"
			>
				<Column
					alignment="start"
					spacing={spacing.section}
					modifiers={fullWidthColumnModifiers()}
				>
					<AppText variant="title">{name ? `Hi, ${name}` : "Hi there"}</AppText>

					<Column
						alignment="start"
						spacing={spacing.group}
						testID="shared-space-state"
					>
						<AppText variant="caption" tone="secondary">
							OUR SPACE
						</AppText>
						{spaceQuery.isPending ? (
							<>
								<RNHostView matchContents>
									<View style={styles.spinner}>
										<ActivityIndicator
											color={palette.secondary}
											accessibilityLabel="Loading your shared space"
										/>
									</View>
								</RNHostView>
								<AppText tone="secondary">Loading your shared space...</AppText>
							</>
						) : spaceQuery.isError && spaceQuery.data === undefined ? (
							<>
								<AppText variant="title">Couldn't load your space</AppText>
								<AppText tone="secondary">
									Check your connection and try again.
								</AppText>
								<AppText tone="error">{spaceQuery.error.message}</AppText>
								<Button
									label={
										spaceQuery.isFetching ? "Trying again..." : "Try again"
									}
									disabled={spaceQuery.isFetching}
									style={styles.button}
									onPress={() => void spaceQuery.refetch()}
								/>
							</>
						) : spaceQuery.data === null ? (
							<>
								<AppText variant="title">
									Make a space for the two of you
								</AppText>
								<AppText tone="secondary">
									Create a private space, then invite the person you want to
									share it with.
								</AppText>
								<Button
									label={
										createSpace.isPending
											? "Creating your space..."
											: "Create a shared space"
									}
									style={styles.button}
									disabled={createSpace.isPending || isSigningOut}
									testID="create-shared-space"
									onPress={handleCreateSpace}
								/>
								{createSpace.isError ? (
									<AppText tone="error">
										{`Couldn't create your space: ${createSpace.error.message}`}
									</AppText>
								) : null}
								<AppText tone="secondary">
									Already invited? Open the invitation they sent you.
								</AppText>
							</>
						) : spaceQuery.data?.partner === null ? (
							<>
								<AppText variant="title">Your space is ready</AppText>
								<AppText tone="secondary">
									There's room for your person. Send them an invitation to join.
								</AppText>
								<InvitationActions disabled={isSigningOut} />
							</>
						) : spaceQuery.data ? (
							<>
								<AppText variant="title">
									{`You and ${spaceQuery.data.partner.name.trim().split(/\s+/)[0]}`}
								</AppText>
								<AppText tone="secondary">A little space for us.</AppText>
							</>
						) : null}
						{spaceQuery.isError && spaceQuery.data !== undefined ? (
							<Column alignment="start" spacing={spacing.small}>
								<AppText tone="error">
									Couldn't refresh your space. Your last update is still shown.
								</AppText>
								<AppText tone="error">{spaceQuery.error.message}</AppText>
								<Button
									label={
										spaceQuery.isFetching ? "Trying again..." : "Try again"
									}
									variant="text"
									style={styles.button}
									disabled={spaceQuery.isFetching}
									onPress={() => void spaceQuery.refetch()}
								/>
							</Column>
						) : null}
					</Column>
					{errorMessage ? (
						<Column alignment="start" spacing={spacing.small}>
							<AppText variant="caption" tone="secondary">
								ACCOUNT
							</AppText>
							<AppText tone="error">{errorMessage}</AppText>
						</Column>
					) : null}
				</Column>
			</Host>
		</ScrollView>
	);
};

export default HomeScreen;

const styles = StyleSheet.create({
	content: {
		paddingHorizontal: spacing.screen,
		paddingTop: spacing.large,
	},
	button: buttonStyle,
	spinner: {
		paddingVertical: spacing.small,
	},
});
