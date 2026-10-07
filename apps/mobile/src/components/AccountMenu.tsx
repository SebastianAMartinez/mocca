import { MenuView } from "@expo/ui/community/menu";
import { Text, View } from "react-native";
import { spacing, useAppTheme } from "@/lib/theme";

export const AccountMenu = ({
	isSigningOut,
	onSignOut,
	onLeaveSpace,
	onDeleteAccount,
	disabled = false,
}: {
	isSigningOut: boolean;
	onSignOut: () => void;
	// Each action only appears when its handler is provided.
	onLeaveSpace?: () => void;
	onDeleteAccount?: () => void;
	disabled?: boolean;
}) => {
	const { scheme, palette } = useAppTheme();
	const label = isSigningOut ? "Signing out..." : "Account";
	const labelStyle = { color: palette.text, fontSize: 17 };
	const triggerStyle = {
		minHeight: 44,
		justifyContent: "center",
		paddingHorizontal: spacing.group,
	} as const;
	const unavailable = isSigningOut || disabled;

	return (
		<MenuView
			title="Account"
			colorScheme={scheme}
			testID="account-menu"
			actions={[
				{
					id: "sign-out",
					title: isSigningOut ? "Signing out..." : "Sign out",
					attributes: { disabled: unavailable },
				},
				...(onLeaveSpace
					? [
							{
								id: "leave-space",
								title: "Leave space",
								attributes: { disabled: unavailable, destructive: true },
							},
						]
					: []),
				...(onDeleteAccount
					? [
							{
								id: "delete-account",
								title: "Delete account",
								attributes: { disabled: unavailable, destructive: true },
							},
						]
					: []),
			]}
			onPressAction={({ nativeEvent }) => {
				if (unavailable) return;
				if (nativeEvent.event === "sign-out") onSignOut();
				if (nativeEvent.event === "leave-space") onLeaveSpace?.();
				if (nativeEvent.event === "delete-account") onDeleteAccount?.();
			}}
		>
			<View
				accessible
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityHint="Opens the account menu"
				style={triggerStyle}
			>
				<Text style={labelStyle}>{label}</Text>
			</View>
		</MenuView>
	);
};
