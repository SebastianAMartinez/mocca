import { Button, Column, Host, RNHostView } from "@expo/ui";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	ScrollView,
	StyleSheet,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { authClient } from "@/lib/auth-client";
import { invitationPath } from "@/lib/invitations";
import { spacing, useAppTheme } from "@/lib/theme";

type Provider = "google" | "apple";

const SignInScreen = ({ invitationToken }: { invitationToken?: string }) => {
	const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const { scheme, palette } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const contentWidth = Math.max(0, Math.min(width - spacing.large * 2, 400));
	const loading = pendingProvider !== null;
	const callbackURL = invitationToken ? invitationPath(invitationToken) : "/";
	const providers: Provider[] =
		process.env.EXPO_OS === "ios" ? ["apple", "google"] : ["google", "apple"];

	const signIn = async (provider: Provider) => {
		if (loading) return;

		setPendingProvider(provider);
		setErrorMessage(null);

		try {
			const { error } = await authClient.signIn.social({
				provider,
				callbackURL,
			});

			if (error) {
				setErrorMessage(error.message ?? "Sign-in failed. Please try again.");
				return;
			}

			const result = await authClient.getSession();
			if (result.error) {
				setErrorMessage(
					result.error.message ?? "Unable to verify sign-in. Please try again.",
				);
				return;
			}
			if (result.data) router.replace(callbackURL);
		} catch {
			setErrorMessage("Sign-in failed. Check your connection and try again.");
		} finally {
			setPendingProvider(null);
		}
	};

	return (
		<ScrollView
			style={{ backgroundColor: palette.background }}
			contentContainerStyle={[
				styles.content,
				{
					paddingTop: insets.top + spacing.large,
					paddingBottom: Math.max(insets.bottom, spacing.large),
				},
			]}
			contentInsetAdjustmentBehavior="never"
		>
			<View style={styles.hero}>
				<Host
					matchContents={{ vertical: true }}
					colorScheme={scheme}
					ignoreSafeArea="all"
					style={{ width: contentWidth }}
				>
					<Column
						alignment="center"
						spacing={spacing.large}
						style={{ width: contentWidth }}
					>
						<AppText variant="greeting" align="center">
							Mocca
						</AppText>
						<Column alignment="center" spacing={spacing.group}>
							<AppText variant="title" align="center">
								A little space for us.
							</AppText>
							<AppText tone="secondary" align="center">
								Stay close through the everyday moments.
							</AppText>
						</Column>
					</Column>
				</Host>
			</View>

			<View style={{ width: contentWidth }}>
				<Host
					matchContents={{ vertical: true }}
					colorScheme={scheme}
					ignoreSafeArea="all"
				>
					<Column
						alignment="center"
						spacing={spacing.group}
						style={{ width: contentWidth }}
					>
						{providers.map((provider) => {
							const providerName = provider === "apple" ? "Apple" : "Google";
							return (
								<Button
									key={provider}
									variant="text"
									style={{
										...styles.button,
										backgroundColor:
											provider === "apple" ? palette.text : palette.background,
										borderColor: palette.text,
									}}
									disabled={loading}
									testID={`${provider}-sign-in`}
									onPress={() => void signIn(provider)}
								>
									<Column
										alignment="center"
										style={{ width: Math.max(0, contentWidth - 34) }}
									>
										<AppText
											align="center"
											tone={provider === "apple" ? "onStrong" : "text"}
										>
											{`Continue with ${providerName}`}
										</AppText>
									</Column>
								</Button>
							);
						})}
						<AppText tone="secondary" align="center">
							{invitationToken
								? "You've been invited. Sign in to review and accept the invitation."
								: "Sign in to create or join a shared space."}
						</AppText>
						{invitationToken ? (
							<Button
								label="Not now"
								variant="text"
								disabled={loading}
								onPress={() => router.replace("/sign-in")}
								style={styles.button}
							/>
						) : null}
					</Column>
				</Host>

				<View style={styles.feedback} accessibilityLiveRegion="polite">
					<Host
						matchContents={{ vertical: true }}
						colorScheme={scheme}
						ignoreSafeArea="all"
					>
						<Column
							alignment="center"
							spacing={spacing.small}
							style={{ width: contentWidth }}
						>
							{pendingProvider ? (
								<>
									<RNHostView matchContents>
										<ActivityIndicator
											color={palette.secondary}
											accessibilityLabel="Signing in"
										/>
									</RNHostView>
									<AppText tone="secondary" align="center">
										{`Signing in with ${pendingProvider === "apple" ? "Apple" : "Google"}...`}
									</AppText>
								</>
							) : null}
							{errorMessage ? (
								<AppText tone="error" align="center">
									{errorMessage}
								</AppText>
							) : null}
						</Column>
					</Host>
				</View>
			</View>
		</ScrollView>
	);
};

export default SignInScreen;

const styles = StyleSheet.create({
	content: {
		flexGrow: 1,
		alignItems: "center",
		paddingHorizontal: spacing.large,
	},
	hero: {
		flexGrow: 1,
		justifyContent: "center",
		paddingVertical: spacing.hero,
	},
	button: {
		paddingVertical: spacing.group,
		paddingHorizontal: spacing.medium,
		borderRadius: 12,
		borderWidth: 1,
	},
	feedback: {
		minHeight: 80,
		paddingTop: spacing.medium,
	},
});
