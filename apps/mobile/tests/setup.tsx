import { notifyManager } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

process.env.EXPO_PUBLIC_API_URL = "http://localhost:3000";
process.env.EXPO_OS = "ios";

notifyManager.setScheduler(queueMicrotask);

// Only native rendering is substituted; React hooks and React Query run normally.
jest.mock("@expo/ui", () => {
	const ReactNative =
		jest.requireActual<typeof import("react-native")>("react-native");
	const Container = ({ children }: PropsWithChildren) => (
		<ReactNative.View>{children}</ReactNative.View>
	);
	return {
		Host: Container,
		Column: Container,
		RNHostView: Container,
		Text: ({ children }: PropsWithChildren) => (
			<ReactNative.Text>{children}</ReactNative.Text>
		),
		Button: ({
			children,
			label,
			onPress,
			disabled,
			testID,
		}: PropsWithChildren<{
			label?: string;
			onPress?: () => void;
			disabled?: boolean;
			testID?: string;
		}>) => (
			<ReactNative.Pressable
				accessibilityRole="button"
				accessibilityState={{ disabled }}
				disabled={disabled}
				onPress={onPress}
				testID={testID}
			>
				{children ?? <ReactNative.Text>{label}</ReactNative.Text>}
			</ReactNative.Pressable>
		),
	};
});

jest.mock("@expo/ui/community/menu", () => {
	const { Pressable, Text, View } =
		jest.requireActual<typeof import("react-native")>("react-native");
	return {
		MenuView: ({
			children,
			actions,
			onPressAction,
		}: PropsWithChildren<{
			actions: {
				id: string;
				title: string;
				attributes: { disabled: boolean };
			}[];
			onPressAction: (event: { nativeEvent: { event: string } }) => void;
		}>) => (
			<View>
				{children}
				{actions.map((action) => (
					<Pressable
						key={action.id}
						accessibilityRole="button"
						accessibilityState={{ disabled: action.attributes.disabled }}
						disabled={action.attributes.disabled}
						onPress={() => onPressAction({ nativeEvent: { event: action.id } })}
					>
						<Text>{action.title}</Text>
					</Pressable>
				))}
			</View>
		),
	};
});

jest.mock("react-native-safe-area-context", () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/ui-modifiers", () => ({
	textModifiers: () => [],
	fullWidthColumnModifiers: () => [],
}));
