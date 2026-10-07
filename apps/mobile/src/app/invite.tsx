import { Button, Column, Host } from "@expo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "@/components/AccountMenu";
import { AppText } from "@/components/AppText";
import SignInScreen from "@/components/SignInScreen";
import { authClient } from "@/lib/auth-client";
import { parseInvitationToken } from "@/lib/invitations";
import { buttonStyle, spacing, useAppTheme } from "@/lib/theme";
import { useTRPC } from "@/lib/trpc";
import { fullWidthColumnModifiers } from "@/lib/ui-modifiers";
import { useSignOut } from "@/hooks/useSignOut";

const InviteScreen = () => {
	const params = useLocalSearchParams();
	const token = parseInvitationToken(params.token);
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const { scheme, palette } = useAppTheme();
	const insets = useSafeAreaInsets();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { signOut, isSigningOut, errorMessage: accountError } = useSignOut();
	const spaceQuery = useQuery(
		trpc.sharedSpace.current.queryOptions(undefined, {
			enabled: !!session && !sessionPending && token !== null,
			staleTime: 0,
		}),
	);
	const acceptInvitation = useMutation(
		trpc.sharedSpace.acceptInvitation.mutationOptions({
			retry: false,
			onSuccess: async () => {
				await queryClient.resetQueries({
					queryKey: trpc.sharedSpace.current.queryKey(),
				});
				router.replace("/");
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

	const header = {
		title: "Invitation",
		headerBackButtonDisplayMode: "minimal" as const,
		headerShown: !!session || !token || sessionPending,
		headerStyle: { backgroundColor: palette.background },
		headerTintColor: palette.text,
		headerShadowVisible: false,
		headerRight: session
			? () => (
					<AccountMenu
						isSigningOut={isSigningOut}
						disabled={acceptInvitation.isPending}
						onSignOut={() => void signOut()}
					/>
				)
			: undefined,
	};

	if (token && !sessionPending && !session) {
		return (
			<>
				<Stack.Screen options={header} />
				<SignInScreen invitationToken={token} />
			</>
		);
	}

	return (
		<ScrollView
			style={{ backgroundColor: palette.background }}
			contentContainerStyle={{
				paddingHorizontal: spacing.screen,
				paddingTop: spacing.large,
				paddingBottom: Math.max(insets.bottom, spacing.large),
			}}
			contentInsetAdjustmentBehavior="automatic"
		>
			<Stack.Screen options={header} />
			<Host
				matchContents={{ vertical: true }}
				colorScheme={scheme}
				ignoreSafeArea="all"
			>
				<Column
					alignment="start"
					spacing={spacing.medium}
					modifiers={fullWidthColumnModifiers()}
				>
					{!token ? (
						<>
							<AppText variant="title">
								This invitation link isn't valid
							</AppText>
							<AppText tone="secondary">
								Ask your person to share a new invitation from Mocca.
							</AppText>
						</>
					) : sessionPending || spaceQuery.isPending ? (
						<AppText tone="secondary">Loading your invitation...</AppText>
					) : spaceQuery.isError ? (
						<>
							<AppText variant="title">Couldn't check your space</AppText>
							<AppText tone="error">{spaceQuery.error.message}</AppText>
							<Button
								label="Try again"
								disabled={spaceQuery.isFetching}
								onPress={() => void spaceQuery.refetch()}
							/>
						</>
					) : spaceQuery.data ? (
						<>
							<AppText variant="title">You already have a shared space</AppText>
							<AppText tone="secondary">
								You can only belong to one space. If this invitation is for a
								different account, use Account to sign out and sign in again.
							</AppText>
						</>
					) : (
						<>
							<AppText variant="title">Join your person's space</AppText>
							<AppText tone="secondary">
								Accept this invitation to share a private space for the two of
								you.
							</AppText>
							<AppText tone="secondary">
								{`Signed in as ${session?.user.email ?? session?.user.name}. Only accept if you trust the person who sent this link.`}
							</AppText>
							<Button
								label={
									acceptInvitation.isPending
										? "Joining your space..."
										: "Accept invitation"
								}
								disabled={acceptInvitation.isPending || isSigningOut}
								testID="accept-invitation"
								style={buttonStyle}
								onPress={() => {
									if (
										!acceptInvitation.isPending &&
										!isSigningOut &&
										session &&
										spaceQuery.data === null
									) {
										acceptInvitation.mutate({ token });
									}
								}}
							/>
						</>
					)}
					{acceptInvitation.isError ? (
						<>
							<AppText tone="error">{acceptInvitation.error.message}</AppText>
							{acceptInvitation.error.data?.code === "NOT_FOUND" ? (
								<AppText tone="secondary">
									The link may have expired, been replaced, or already been
									used. Ask your person for a new invitation.
								</AppText>
							) : null}
						</>
					) : null}
					{accountError ? <AppText tone="error">{accountError}</AppText> : null}
					<Button
						label={session ? "Go to your space" : "Back to sign in"}
						variant="text"
						disabled={acceptInvitation.isPending || isSigningOut}
						onPress={() => router.replace(session ? "/" : "/sign-in")}
						style={buttonStyle}
					/>
				</Column>
			</Host>
		</ScrollView>
	);
};

export default InviteScreen;
