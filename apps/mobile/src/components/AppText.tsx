import { Text } from "@expo/ui";
import { useAppTheme } from "@/lib/theme";
import { textModifiers } from "@/lib/ui-modifiers";

const typography = {
	greeting: { fontSize: 32, fontWeight: "700", textStyle: "largeTitle" },
	title: { fontSize: 22, fontWeight: "600", textStyle: "title2" },
	body: { fontSize: 17, fontWeight: "400", textStyle: "body" },
	caption: { fontSize: 13, fontWeight: "600", textStyle: "caption" },
} as const;

export const AppText = ({
	children,
	variant = "body",
	tone = "text",
	align = "left",
}: {
	children: string;
	variant?: keyof typeof typography;
	tone?: "text" | "secondary" | "error" | "onStrong";
	align?: "left" | "center";
}) => {
	const { palette } = useAppTheme();
	const { fontSize, fontWeight, textStyle } = typography[variant];

	return (
		<Text
			textStyle={{
				fontSize,
				fontWeight,
				color: palette[tone],
				textAlign: align,
			}}
			modifiers={textModifiers(
				{
					textStyle,
					weight:
						variant === "greeting"
							? "bold"
							: variant === "title" || variant === "caption"
								? "semibold"
								: "regular",
				},
				align,
			)}
		>
			{children}
		</Text>
	);
};
