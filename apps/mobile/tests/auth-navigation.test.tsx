import { router, useLocalSearchParams } from "expo-router";
import {
	act,
	fireEvent,
	renderRouter,
	screen,
} from "expo-router/testing-library";
import { Button, Text } from "react-native";
import RootLayout from "@/app/_layout";
import AppLayout from "@/app/(app)/_layout";
import AuthLayout from "@/app/(auth)/_layout";
import { authClient } from "@/lib/auth-client";

let mockSignedIn = true;
let mockSessionPending = false;
const mockListeners = new Set<() => void>();

jest.mock("@/lib/auth-client", () => {
	const { useSyncExternalStore } =
		jest.requireActual<typeof import("react")>("react");
	return {
		authClient: {
			useSession: () => {
				const status = useSyncExternalStore(
					(listener) => {
						mockListeners.add(listener);
						return () => mockListeners.delete(listener);
					},
					() =>
						mockSessionPending
							? "pending"
							: mockSignedIn
								? "signed-in"
								: "signed-out",
				);
				return {
					data:
						status === "signed-in"
							? { user: { id: "original-account" } }
							: null,
					isPending: status === "pending",
				};
			},
			signOut: jest.fn(async () => {
				mockSignedIn = false;
				for (const listener of mockListeners) listener();
				return { data: { success: true }, error: null };
			}),
		},
	};
});

jest.mock("@/components/ApiProvider", () => ({
	ApiProvider: ({ children }: import("react").PropsWithChildren) => children,
}));

jest.mock(
	"react-native-safe-area-context",
	() => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);

const Home = () => (
	<>
		<Text>Home</Text>
		<Button title="Sign out" onPress={() => void authClient.signOut()} />
	</>
);
const Invitation = () => {
	const { token } = useLocalSearchParams();
	return (
		<>
			<Text>{token ? "Valid invitation" : "Invalid invitation"}</Text>
			{token ? <Text>{token}</Text> : null}
			<Button title="Go home" onPress={() => router.replace("/")} />
		</>
	);
};
const routes = {
	_layout: RootLayout,
	"(app)/_layout": AppLayout,
	"(app)/index": Home,
	"(auth)/_layout": AuthLayout,
	"(auth)/sign-in": () => <Text>Sign in</Text>,
	invite: Invitation,
};

beforeEach(() => {
	mockSignedIn = true;
	mockSessionPending = false;
	jest.clearAllMocks();
});

afterEach(() => {
	jest.useRealTimers();
});

test("signing out from home after opening an invitation reaches sign-in, not a tokenless invitation", async () => {
	await renderRouter(routes, { initialUrl: "/invite?token=retained-link" });
	await fireEvent.press(screen.getByText("Go home"));
	await screen.findByText("Home");
	await fireEvent.press(screen.getByText("Sign out"));
	await screen.findByText("Sign in");
	expect(screen.queryByText("Invalid invitation")).toBeNull();
});

test("signed-out navigation to home falls back to sign-in", async () => {
	mockSignedIn = false;
	await renderRouter(routes, { initialUrl: "/" });
	await screen.findByText("Sign in");
});

test("a public invitation retains its token when the session ends", async () => {
	await renderRouter(routes, { initialUrl: "/invite?token=retained-link" });
	await act(async () => {
		await authClient.signOut();
	});
	expect(screen.getByText("Valid invitation")).toBeOnTheScreen();
	expect(screen.getByText("retained-link")).toBeOnTheScreen();
});

test("session hydration does not select a tokenless invitation as the default route", async () => {
	mockSessionPending = true;
	mockSignedIn = false;
	await renderRouter(routes, { initialUrl: "/" });
	await act(async () => {
		mockSessionPending = false;
		for (const listener of mockListeners) listener();
	});
	await screen.findByText("Sign in");
	expect(screen.queryByText("Invalid invitation")).toBeNull();
});

test("a deep-linked invitation keeps its token through initial authentication loading", async () => {
	mockSessionPending = true;
	mockSignedIn = false;
	await renderRouter(routes, { initialUrl: "/invite?token=retained-link" });
	await act(async () => {
		mockSessionPending = false;
		for (const listener of mockListeners) listener();
	});
	await screen.findByText("Valid invitation");
	expect(screen.getByText("retained-link")).toBeOnTheScreen();
	expect(screen.queryByText("Sign in")).toBeNull();
});
