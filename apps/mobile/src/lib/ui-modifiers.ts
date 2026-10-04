import type { font, ModifierConfig } from "@expo/ui/swift-ui/modifiers";

export const textModifiers = (
	_options: Parameters<typeof font>[0],
	_align: "left" | "center",
): ModifierConfig[] => {
	return [];
};

export const fullWidthColumnModifiers = (): ModifierConfig[] => {
	return [];
};
