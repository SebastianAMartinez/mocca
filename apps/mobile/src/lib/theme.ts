import { useColorScheme } from "react-native";

const colors = {
	light: {
		background: "#FFFFFF",
		text: "#000000",
		secondary: "#595959",
		error: "#B42318",
		onStrong: "#FFFFFF",
	},
	dark: {
		background: "#000000",
		text: "#FFFFFF",
		secondary: "#B5B5B5",
		error: "#FFB4AB",
		onStrong: "#000000",
	},
};

export const spacing = {
	small: 8,
	group: 12,
	medium: 16,
	screen: 20,
	large: 24,
	section: 32,
	hero: 48,
};

export const buttonStyle = {
	paddingVertical: spacing.group,
	paddingHorizontal: spacing.small,
};

export const useAppTheme = () => {
	const scheme: "dark" | "light" =
		useColorScheme() === "dark" ? "dark" : "light";
	return { scheme, palette: colors[scheme] };
};
