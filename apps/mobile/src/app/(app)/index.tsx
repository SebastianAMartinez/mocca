import { Column, Host } from "@expo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Alert, AppState, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "@/components/AccountMenu";
import { AppText } from "@/components/AppText";
import { SharedSpaceSection } from "@/components/SharedSpaceSection";
import { authClient } from "@/lib/auth-client";
import { spacing, useAppTheme } from "@/lib/theme";
import { useTRPC } from "@/lib/trpc";
import { fullWidthColumnModifiers } from "@/lib/ui-modifiers";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { useSignOut } from "@/hooks/useSignOut";

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
	const leaveSpace = useMutation(
		trpc.sharedSpace.leave.mutationOptions({
			retry: false,
			onSuccess: async () => {
				const queryKey = trpc.sharedSpace.current.queryKey();
				await queryClient.cancelQueries({ queryKey });
				queryClient.setQueryData(queryKey, () => null);
				await queryClient.invalidateQueries({ queryKey });
			},
		}),
	);
	const { signOut, isSigningOut, errorMessage } = useSignOut();
	const {
		deleteAccount,
		isDeleting,
		errorMessage: deleteErrorMessage,
	} = useDeleteAccount();
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

	const accountBusy = isSigningOut || isDeleting || leaveSpace.isPending;
	const accountError =
		errorMessage ??
		deleteErrorMessage ??
		(leaveSpace.isError
			? `Couldn't leave your space: ${leaveSpace.error.message}`
			: null);
	const currentSpace = spaceQuery.data ?? null;

	const confirmLeaveSpace = () => {
		if (accountBusy || currentSpace === null) return;

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
		if (accountBusy) return;

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

	const handleCreateSpace = () => {
		if (createSpace.isPending || accountBusy || spaceQuery.data !== null) {
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
						isCreating={createSpace.isPending}
						creationError={
							createSpace.isError ? createSpace.error.message : null
						}
						isSigningOut={accountBusy}
						onCreate={handleCreateSpace}
						onRetry={() => void spaceQuery.refetch()}
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
