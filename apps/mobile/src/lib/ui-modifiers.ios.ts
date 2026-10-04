import {
	fixedSize,
	font,
	frame,
	type ModifierConfig,
	multilineTextAlignment,
} from "@expo/ui/swift-ui/modifiers";

export const textModifiers = (
	options: Parameters<typeof font>[0],
	align: "left" | "center",
): ModifierConfig[] => {
	return [
		font(options),
		fixedSize({ horizontal: false, vertical: true }),
		multilineTextAlignment(align === "center" ? "center" : "leading"),
	];
};

export const fullWidthColumnModifiers = (): ModifierConfig[] => {
	return [frame({ maxWidth: Infinity, alignment: "topLeading" })];
};
