import { Column, Host } from "@expo/ui";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Alert, AppState, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "@/components/AccountMenu";
import { AppText } from "@/components/AppText";
import { SharedSpaceSection } from "@/components/SharedSpaceSection";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { useLeaveSharedSpace } from "@/hooks/useLeaveSharedSpace";
import { useSignOut } from "@/hooks/useSignOut";
import { authClient } from "@/lib/auth-client";
import { firstName } from "@/lib/firstName";
import { spacing, useAppTheme } from "@/lib/theme";
import { useTRPC } from "@/lib/trpc";
import { fullWidthColumnModifiers } from "@/lib/ui-modifiers";

const HomeScreen = () => {
	const { data: session } = authClient.useSession();
	const trpc = useTRPC();
	const spaceQuery = useQuery(trpc.sharedSpace.current.queryOptions());
	const leaveSpace = useLeaveSharedSpace();
	const { signOut, isSigningOut, errorMessage } = useSignOut();
	const {
		deleteAccount,
		isDeleting,
		errorMessage: deleteErrorMessage,
	} = useDeleteAccount();
	const { scheme, palette } = useAppTheme();
	const insets = useSafeAreaInsets();
	const name = session && (firstName(session.user.name) || session.user.email);
	const { refetch } = spaceQuery;

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") void refetch();
		});
		return () => subscription.remove();
	}, [refetch]);

	const isAccountActionPending =
		isSigningOut || isDeleting || leaveSpace.isPending;
	const accountError =
		errorMessage ??
		deleteErrorMessage ??
		(leaveSpace.isError
			? `Couldn't leave your space: ${leaveSpace.error.message}`
			: null);
	const currentSpace = spaceQuery.data ?? null;

	const confirmLeaveSpace = () => {
		if (isAccountActionPending || currentSpace === null) return;

		Alert.alert(
			"Leave this space?",
			currentSpace.partner
				? "Your partner keeps the space, but you will no longer be part of it."
				: "Nobody else is in this space, so it will be deleted.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Leave space",
					style: "destructive",
					onPress: () => leaveSpace.mutate(),
				},
			],
		);
	};

	const confirmDeleteAccount = () => {
		if (isAccountActionPending) return;

		Alert.alert(
			"Delete your account?",
			"This permanently deletes your account and removes you from your shared space. This can't be undone.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete account",
					style: "destructive",
					onPress: () => void deleteAccount(),
				},
			],
		);
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
							onLeaveSpace={currentSpace ? confirmLeaveSpace : undefined}
							onDeleteAccount={confirmDeleteAccount}
							disabled={isDeleting || leaveSpace.isPending}
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

					<SharedSpaceSection
						spaceQuery={spaceQuery}
						disabled={isAccountActionPending}
					/>
					{accountError ? (
						<Column alignment="start" spacing={spacing.small}>
							<AppText variant="caption" tone="secondary">
								ACCOUNT
							</AppText>
							<AppText tone="error">{accountError}</AppText>
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
});
