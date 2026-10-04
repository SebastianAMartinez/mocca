import { MenuView } from "@expo/ui/community/menu";
import { Pressable, Text, View } from "react-native";
import { spacing, useAppTheme } from "@/lib/theme";

export const AccountMenu = ({
	isSigningOut,
	onSignOut,
	disabled = false,
}: {
	isSigningOut: boolean;
	onSignOut: () => void;
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

	if (process.env.EXPO_OS === "web") {
		return (
			<Pressable
				accessibilityRole="button"
				disabled={isSigningOut || disabled}
				onPress={onSignOut}
				style={triggerStyle}
			>
				<Text style={labelStyle}>
					{isSigningOut ? "Signing out..." : "Sign out"}
				</Text>
			</Pressable>
		);
	}

	return (
		<MenuView
			title="Account"
			colorScheme={scheme}
			testID="account-menu"
			actions={[
				{
					id: "sign-out",
					title: isSigningOut ? "Signing out..." : "Sign out",
					attributes: { disabled: isSigningOut || disabled },
				},
			]}
			onPressAction={({ nativeEvent }) => {
				if (nativeEvent.event === "sign-out" && !isSigningOut && !disabled) {
					onSignOut();
				}
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
