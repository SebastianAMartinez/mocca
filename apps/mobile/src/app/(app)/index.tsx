import { Column, Host } from "@expo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "@/components/account-menu";
import { AppText } from "@/components/app-text";
import { SharedSpaceSection } from "@/components/shared-space-section";
import { authClient } from "@/lib/auth-client";
import { spacing, useAppTheme } from "@/lib/theme";
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

					<SharedSpaceSection
						spaceQuery={spaceQuery}
						isCreating={createSpace.isPending}
						creationError={
							createSpace.isError ? createSpace.error.message : null
						}
						isSigningOut={isSigningOut}
						onCreate={handleCreateSpace}
						onRetry={() => void spaceQuery.refetch()}
					/>
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
});
