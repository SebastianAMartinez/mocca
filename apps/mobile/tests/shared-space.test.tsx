import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	render,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";
import type { PropsWithChildren } from "react";
import { Alert, AppState, Share } from "react-native";
import HomeScreen from "@/app/(app)";
import InviteScreen from "@/app/invite";
import { InvitationActions } from "@/components/invitation-actions";
import SignInScreen from "@/components/sign-in-screen";
import { authClient } from "@/lib/auth-client";
import { invitationLink, invitationPath } from "@/lib/invitations";
import { TRPCProvider } from "@/lib/trpc";
import { useDeleteAccount } from "@/lib/use-delete-account";
import { useSignOut } from "@/lib/use-sign-out";
import type { AppRouter } from "../../server/src/trpc/router";

const token = "a".repeat(43);
const sharedSpace = { id: "space-1", createdAt: "2026-10-04T20:00:00Z" };
type CurrentSpace = Awaited<
	ReturnType<TRPCClient<AppRouter>["sharedSpace"]["current"]["query"]>
>;

const mockSession = {
	data: {
		user: {
			id: "recipient",
			name: "Test Person",
			email: "test@example.com",
			emailVerified: true,
			createdAt: new Date("2026-10-04T20:00:00Z"),
			updatedAt: new Date("2026-10-04T20:00:00Z"),
		},
		session: {
			id: "synthetic-session",
			userId: "recipient",
			token: "synthetic-test-session",
			expiresAt: new Date("2026-10-05T20:00:00Z"),
			createdAt: new Date("2026-10-04T20:00:00Z"),
			updatedAt: new Date("2026-10-04T20:00:00Z"),
		},
	},
	isPending: false,
};
let mockSignedIn = true;
let mockToken: string | string[] | undefined = token;
const mockReplace = jest.fn();

jest.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({
			data: mockSignedIn ? mockSession.data : null,
			isPending: mockSession.isPending,
		}),
		signOut: jest.fn(),
		deleteUser: jest.fn(),
		signIn: { social: jest.fn() },
		getSession: jest.fn(),
	},
}));

jest.mock("expo-router", () => {
	const { View } =
		jest.requireActual<typeof import("react-native")>("react-native");
	return {
		router: { replace: (...args: unknown[]) => mockReplace(...args) },
		useLocalSearchParams: () => ({ token: mockToken }),
		Stack: {
			Screen: ({
				options,
			}: {
				options: { headerRight?: () => React.ReactNode };
			}) => <View>{options.headerRight?.()}</View>,
		},
	};
});

const deferred = <T,>() => {
	let resolve: (value: T) => void = () => {
		throw new Error("Deferred promise is not initialized");
	};
	let reject: (error: Error) => void = () => {
		throw new Error("Deferred promise is not initialized");
	};
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
};

const apiError = (code: string, message: string) =>
	Object.assign(new Error(message), { code });

const createApi = () => {
	let current: CurrentSpace = null;
	const currentQuery = jest.fn(async () => current);
	const create = jest.fn(async () => {
		current = { sharedSpace, partner: null };
		return { sharedSpace };
	});
	const createInvitation = jest.fn(async () => ({
		token,
		expiresAt: new Date(Date.now() + 60_000).toISOString(),
	}));
	const leave = jest.fn(async () => {
		current = null;
	});
	const acceptInvitation = jest.fn(async (_input: unknown) => {
		current = {
			sharedSpace,
			partner: { id: "sender", name: "Sender Person", image: null },
		};
		return { sharedSpace };
	});
	const client = createTRPCClient<AppRouter>({
		links: [
			httpLink({
				url: "http://localhost/trpc",
				fetch: async (url, options) => {
					const path = new URL(String(url)).pathname.split("/").at(-1);
					let result: unknown;
					try {
						switch (path) {
							case "sharedSpace.current":
								result = await currentQuery();
								break;
							case "sharedSpace.create":
								result = await create();
								break;
							case "sharedSpace.createInvitation":
								result = await createInvitation();
								break;
							case "sharedSpace.leave":
								result = await leave();
								break;
							case "sharedSpace.acceptInvitation":
								result = await acceptInvitation(
									JSON.parse(String(options?.body)),
								);
								break;
							default:
								throw new Error(`Unexpected procedure: ${path}`);
						}
						return new Response(JSON.stringify({ result: { data: result } }));
					} catch (error) {
						if (!(error instanceof Error)) throw error;
						return new Response(
							JSON.stringify({
								error: {
									message: error.message,
									code: -32000,
									data: {
										code:
											"code" in error ? error.code : "INTERNAL_SERVER_ERROR",
										httpStatus: 400,
									},
								},
							}),
							{ status: 400 },
						);
					}
				},
			}),
		],
	});
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: Infinity },
			mutations: { retry: false, gcTime: Infinity },
		},
	});
	const Wrapper = ({ children }: PropsWithChildren) => (
		<QueryClientProvider client={queryClient}>
			<TRPCProvider trpcClient={client} queryClient={queryClient}>
				{children}
			</TRPCProvider>
		</QueryClientProvider>
	);
	return {
		Wrapper,
		queryClient,
		currentQuery,
		create,
		createInvitation,
		acceptInvitation,
		leave,
	};
};

beforeEach(() => {
	jest.clearAllMocks();
	mockSignedIn = true;
	mockSession.isPending = false;
	mockToken = token;
	process.env.EXPO_OS = "ios";
	jest.mocked(authClient.signOut).mockImplementation(async () => {
		mockSignedIn = false;
		return { data: { success: true }, error: null };
	});
	jest.mocked(authClient.signIn.social).mockResolvedValue({
		data: { redirect: true, url: "https://example.com/sign-in" },
		error: null,
	});
	jest.mocked(authClient.getSession).mockResolvedValue({
		data: null,
		error: null,
	});
	jest
		.spyOn(Share, "share")
		.mockResolvedValue({ action: Share.dismissedAction });
});

afterEach(() => {
	jest.restoreAllMocks();
	jest.useRealTimers();
});

test("home creates a space once, shows pending feedback, and displays the confirmed space", async () => {
	const api = createApi();
	const pending = deferred<{ sharedSpace: typeof sharedSpace }>();
	api.create.mockImplementationOnce(() => pending.promise);
	await render(<HomeScreen />, { wrapper: api.Wrapper });
	expect(screen.getByText("Hi, Test")).toBeOnTheScreen();
	await fireEvent.press(await screen.findByText("Create a shared space"));
	await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
	expect(await screen.findByText("Creating your space...")).toBeOnTheScreen();
	expect(screen.getByTestId("create-shared-space")).toBeDisabled();
	await fireEvent.press(screen.getByTestId("create-shared-space"));
	expect(api.create).toHaveBeenCalledTimes(1);
	api.currentQuery.mockResolvedValue({ sharedSpace, partner: null });
	await act(async () => pending.resolve({ sharedSpace }));
	expect(await screen.findByText("Your space is ready")).toBeOnTheScreen();
	expect(screen.queryByText("Create a shared space")).toBeNull();
});

test("home shows only the partner's first name in the connected heading", async () => {
	const api = createApi();
	api.currentQuery.mockResolvedValue({
		sharedSpace,
		partner: { id: "partner", name: "  Jamie   Smith  ", image: null },
	});
	await render(<HomeScreen />, { wrapper: api.Wrapper });
	expect(await screen.findByText("You and Jamie")).toBeOnTheScreen();
	expect(screen.queryByText(/Smith/)).toBeNull();
});

test("home preserves the empty state on creation failure and allows retry", async () => {
	const api = createApi();
	api.create.mockRejectedValueOnce(new Error("Network unavailable"));
	await render(<HomeScreen />, { wrapper: api.Wrapper });
	await fireEvent.press(await screen.findByText("Create a shared space"));
	expect(
		await screen.findByText("Couldn't create your space: Network unavailable"),
	).toBeOnTheScreen();
	await fireEvent.press(screen.getByText("Create a shared space"));
	expect(await screen.findByText("Your space is ready")).toBeOnTheScreen();
	expect(api.create).toHaveBeenCalledTimes(2);
});

test("home recovers an existing space after a create conflict", async () => {
	const api = createApi();
	api.create.mockImplementationOnce(async () => {
		api.currentQuery.mockResolvedValue({ sharedSpace, partner: null });
		throw apiError("CONFLICT", "User already has a shared space");
	});
	await render(<HomeScreen />, { wrapper: api.Wrapper });
	await fireEvent.press(await screen.findByText("Create a shared space"));
	expect(await screen.findByText("Your space is ready")).toBeOnTheScreen();
	expect(api.create).toHaveBeenCalledTimes(1);
});

test("home keeps cached content when a foreground refresh fails", async () => {
	const api = createApi();
	api.currentQuery.mockResolvedValue({ sharedSpace, partner: null });
	const listener = jest.spyOn(AppState, "addEventListener");
	await render(<HomeScreen />, { wrapper: api.Wrapper });
	await screen.findByText("Your space is ready");
	api.currentQuery.mockRejectedValueOnce(new Error("Offline"));
	await act(async () => listener.mock.calls[0][1]("active"));
	expect(
		await screen.findByText(
			"Couldn't refresh your space. Your last update is still shown.",
		),
	).toBeOnTheScreen();
	expect(screen.getByText("Your space is ready")).toBeOnTheScreen();
});

test("home retains its invitation across failed and successful foreground refreshes", async () => {
	const api = createApi();
	api.currentQuery.mockResolvedValue({ sharedSpace, partner: null });
	const listener = jest.spyOn(AppState, "addEventListener");
	await render(<HomeScreen />, { wrapper: api.Wrapper });
	await fireEvent.press(await screen.findByText("Invite your person"));
	await screen.findByText("Share invitation");

	api.currentQuery.mockRejectedValueOnce(new Error("Offline"));
	await act(async () => listener.mock.calls[0][1]("active"));
	await screen.findByText(
		"Couldn't refresh your space. Your last update is still shown.",
	);
	await fireEvent.press(screen.getByText("Share invitation"));
	await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));

	await act(async () => listener.mock.calls[0][1]("active"));
	await waitFor(() => expect(screen.queryByText("Offline")).toBeNull());
	await fireEvent.press(screen.getByText("Share invitation"));
	await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(2));
	expect(Share.share).toHaveBeenLastCalledWith({
		title: "Join my Mocca space",
		message: `Join me on Mocca, a little space for us.\n${invitationLink(token)}`,
	});
	expect(api.createInvitation).toHaveBeenCalledTimes(1);
});

test("sender generates on demand, shares the same link twice, and confirms replacement", async () => {
	const api = createApi();
	const pending = deferred<Awaited<ReturnType<typeof api.createInvitation>>>();
	api.createInvitation.mockImplementationOnce(() => pending.promise);
	const alert = jest.spyOn(Alert, "alert");
	await render(<InvitationActions disabled={false} />, {
		wrapper: api.Wrapper,
	});
	expect(api.createInvitation).not.toHaveBeenCalled();
	await fireEvent.press(screen.getByText("Invite your person"));
	await screen.findByText("Creating invitation...");
	expect(screen.getByTestId("create-invitation")).toBeDisabled();
	await act(async () =>
		pending.resolve({
			token,
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
		}),
	);
	await fireEvent.press(await screen.findByText("Share invitation"));
	await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
	await fireEvent.press(screen.getByText("Share invitation"));
	await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(2));
	expect(Share.share).toHaveBeenCalledWith({
		title: "Join my Mocca space",
		message: `Join me on Mocca, a little space for us.\n${invitationLink(token)}`,
	});
	expect(api.createInvitation).toHaveBeenCalledTimes(1);
	await fireEvent.press(screen.getByText("Create new invitation"));
	expect(api.createInvitation).toHaveBeenCalledTimes(1);
	await act(async () => alert.mock.calls[0][2]?.[1].onPress?.());
	await waitFor(() => expect(api.createInvitation).toHaveBeenCalledTimes(2));
});

test("sender displays sharing errors and allows retry without regenerating", async () => {
	const api = createApi();
	jest
		.mocked(Share.share)
		.mockRejectedValueOnce(new Error("Share unavailable"));
	await render(<InvitationActions disabled={false} />, {
		wrapper: api.Wrapper,
	});
	await fireEvent.press(screen.getByText("Invite your person"));
	await fireEvent.press(await screen.findByText("Share invitation"));
	expect(
		await screen.findByText(
			"Unable to share the invitation. Please try again.",
		),
	).toBeOnTheScreen();
	await fireEvent.press(screen.getByText("Share invitation"));
	await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(2));
	expect(api.createInvitation).toHaveBeenCalledTimes(1);
});

test("failed replacement retains the previous invitation for sharing and confirmation", async () => {
	const api = createApi();
	const alert = jest.spyOn(Alert, "alert");
	await render(<InvitationActions disabled={false} />, {
		wrapper: api.Wrapper,
	});
	await fireEvent.press(screen.getByText("Invite your person"));
	await screen.findByText("Share invitation");
	api.createInvitation.mockRejectedValueOnce(new Error("Offline"));
	await fireEvent.press(screen.getByText("Create new invitation"));
	await act(async () => alert.mock.calls[0][2]?.[1].onPress?.());
	await screen.findByText("Couldn't create an invitation: Offline");
	await fireEvent.press(screen.getByText("Share invitation"));
	await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
	expect(jest.mocked(Share.share).mock.calls[0][0].message).toContain(
		invitationLink(token),
	);
	await fireEvent.press(screen.getByText("Create new invitation"));
	expect(alert).toHaveBeenCalledTimes(2);
	expect(api.createInvitation).toHaveBeenCalledTimes(2);
});

test("sender disables an expired link through its actual expiry effect", async () => {
	const api = createApi();
	jest.useFakeTimers();
	await render(<InvitationActions disabled={false} />, {
		wrapper: api.Wrapper,
	});
	await fireEvent.press(screen.getByText("Invite your person"));
	await screen.findByText("Share invitation");
	await act(async () => {
		jest.advanceTimersByTime(61_000);
	});
	expect(screen.getByTestId("share-invitation")).toBeDisabled();
	expect(Share.share).not.toHaveBeenCalled();
});

test("sender surfaces rate limiting and allows a later retry", async () => {
	const api = createApi();
	api.createInvitation.mockRejectedValueOnce(
		apiError("TOO_MANY_REQUESTS", "Too many attempts. Please try again later."),
	);
	await render(<InvitationActions disabled={false} />, {
		wrapper: api.Wrapper,
	});
	await fireEvent.press(screen.getByText("Invite your person"));
	expect(
		await screen.findByText(
			"Couldn't create an invitation: Too many attempts. Please try again later.",
		),
	).toBeOnTheScreen();
	await fireEvent.press(screen.getByText("Invite your person"));
	expect(await screen.findByText("Share invitation")).toBeOnTheScreen();
	expect(api.createInvitation).toHaveBeenCalledTimes(2);
});

test("recipient explicitly accepts, cannot submit twice, and returns home after refresh", async () => {
	const api = createApi();
	const pending = deferred<{ sharedSpace: typeof sharedSpace }>();
	api.acceptInvitation.mockImplementationOnce(() => pending.promise);
	await render(<InviteScreen />, { wrapper: api.Wrapper });
	await screen.findByText("Accept invitation");
	expect(api.acceptInvitation).not.toHaveBeenCalled();
	await fireEvent.press(screen.getByText("Accept invitation"));
	await waitFor(() =>
		expect(api.acceptInvitation).toHaveBeenCalledWith({ token }),
	);
	expect(await screen.findByText("Joining your space...")).toBeOnTheScreen();
	expect(screen.getByTestId("accept-invitation")).toBeDisabled();
	await fireEvent.press(screen.getByTestId("accept-invitation"));
	expect(api.acceptInvitation).toHaveBeenCalledTimes(1);
	await act(async () => pending.resolve({ sharedSpace }));
	await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
	expect(api.currentQuery.mock.calls.length).toBeGreaterThan(1);
});

test("invalid links cannot submit acceptance", async () => {
	mockToken = [token, token];
	const api = createApi();
	await render(<InviteScreen />, { wrapper: api.Wrapper });
	expect(
		screen.getByText("This invitation link isn't valid"),
	).toBeOnTheScreen();
	expect(screen.queryByText("Accept invitation")).toBeNull();
	expect(api.currentQuery).not.toHaveBeenCalled();
});

test("signed-out users can leave a tokenless invitation directly for sign-in", async () => {
	mockSignedIn = false;
	mockToken = undefined;
	const api = createApi();
	await render(<InviteScreen />, { wrapper: api.Wrapper });
	await fireEvent.press(screen.getByText("Back to sign in"));
	expect(mockReplace).toHaveBeenCalledWith("/sign-in");
	expect(api.acceptInvitation).not.toHaveBeenCalled();
});

test("existing members can switch accounts without losing the invitation", async () => {
	const api = createApi();
	api.currentQuery.mockResolvedValue({ sharedSpace, partner: null });
	const view = await render(<InviteScreen />, { wrapper: api.Wrapper });
	await screen.findByText("You already have a shared space");
	expect(screen.queryByText("Accept invitation")).toBeNull();
	await fireEvent.press(screen.getByText("Sign out"));
	await waitFor(() => expect(authClient.signOut).toHaveBeenCalledTimes(1));
	await view.rerender(<InviteScreen />);
	expect(
		screen.getByText(
			"You've been invited. Sign in to review and accept the invitation.",
		),
	).toBeOnTheScreen();
	expect(mockReplace).not.toHaveBeenCalled();
});

test("recipient sees unavailable-link guidance and can retry a transient failure", async () => {
	const api = createApi();
	api.acceptInvitation
		.mockRejectedValueOnce(
			apiError(
				"NOT_FOUND",
				"This invitation is invalid or no longer available",
			),
		)
		.mockRejectedValueOnce(new Error("Network unavailable"));
	await render(<InviteScreen />, { wrapper: api.Wrapper });
	await fireEvent.press(await screen.findByText("Accept invitation"));
	expect(
		await screen.findByText(
			"The link may have expired, been replaced, or already been used. Ask your person for a new invitation.",
		),
	).toBeOnTheScreen();
	await fireEvent.press(screen.getByText("Accept invitation"));
	await screen.findByText("Network unavailable");
	await fireEvent.press(screen.getByText("Accept invitation"));
	await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
});

test("recipient membership conflict refreshes the existing space without navigating", async () => {
	const api = createApi();
	api.acceptInvitation.mockImplementationOnce(async () => {
		api.currentQuery.mockResolvedValue({ sharedSpace, partner: null });
		throw apiError("CONFLICT", "User already has a shared space");
	});
	await render(<InviteScreen />, { wrapper: api.Wrapper });
	await fireEvent.press(await screen.findByText("Accept invitation"));
	await screen.findByText("You already have a shared space");
	await screen.findByText("User already has a shared space");
	expect(screen.queryByText("Accept invitation")).toBeNull();
	expect(mockReplace).not.toHaveBeenCalled();
	expect(api.acceptInvitation).toHaveBeenCalledTimes(1);
});

test("signed-out recipient keeps the invitation in the OAuth callback and can decline", async () => {
	mockSignedIn = false;
	const api = createApi();
	await render(<InviteScreen />, { wrapper: api.Wrapper });
	await fireEvent.press(screen.getByTestId("google-sign-in"));
	await waitFor(() =>
		expect(authClient.signIn.social).toHaveBeenCalledWith({
			provider: "google",
			callbackURL: invitationPath(token),
		}),
	);
	await waitFor(() => expect(authClient.getSession).toHaveBeenCalled());
	expect(mockReplace).not.toHaveBeenCalled();
	await fireEvent.press(screen.getByText("Not now"));
	expect(mockReplace).toHaveBeenCalledWith("/sign-in");
});

test("sign-in error retains the invitation callback and permits retry", async () => {
	jest
		.mocked(authClient.signIn.social)
		.mockRejectedValueOnce(new Error("Offline"));
	await render(<SignInScreen invitationToken={token} />);
	await fireEvent.press(screen.getByTestId("google-sign-in"));
	await screen.findByText(
		"Sign-in failed. Check your connection and try again.",
	);
	await fireEvent.press(screen.getByTestId("google-sign-in"));
	await waitFor(() =>
		expect(authClient.signIn.social).toHaveBeenCalledTimes(2),
	);
	expect(authClient.signIn.social).toHaveBeenLastCalledWith({
		provider: "google",
		callbackURL: invitationPath(token),
	});
});

test("successful OAuth returns to the invitation and pending sign-in blocks other providers", async () => {
	const pending =
		deferred<Awaited<ReturnType<typeof authClient.signIn.social>>>();
	jest
		.mocked(authClient.signIn.social)
		.mockImplementationOnce(() => pending.promise);
	jest.mocked(authClient.getSession).mockResolvedValue({
		data: mockSession.data,
		error: null,
	});
	await render(<SignInScreen invitationToken={token} />);
	await fireEvent.press(screen.getByTestId("google-sign-in"));
	expect(screen.getByTestId("google-sign-in")).toBeDisabled();
	expect(screen.getByTestId("apple-sign-in")).toBeDisabled();
	await fireEvent.press(screen.getByTestId("apple-sign-in"));
	expect(authClient.signIn.social).toHaveBeenCalledTimes(1);
	await act(async () =>
		pending.resolve({
			data: { redirect: true, url: "https://example.com/sign-in" },
			error: null,
		}),
	);
	await waitFor(() =>
		expect(mockReplace).toHaveBeenCalledWith(invitationPath(token)),
	);
});

test("shared sign-out hook exposes errors and resets pending state for retry", async () => {
	jest.mocked(authClient.signOut).mockRejectedValueOnce(new Error("Offline"));
	const { result } = await renderHook(() => useSignOut());
	await act(async () => result.current.signOut());
	expect(result.current.errorMessage).toBe(
		"Unable to sign out. Please try again.",
	);
	expect(result.current.isSigningOut).toBe(false);
	await act(async () => result.current.signOut());
	expect(result.current.errorMessage).toBeNull();
	expect(result.current.isSigningOut).toBe(false);
});

test("shared sign-out hook displays returned errors and prevents repeated calls while pending", async () => {
	const pending = deferred<Awaited<ReturnType<typeof authClient.signOut>>>();
	jest.mocked(authClient.signOut).mockImplementationOnce(() => pending.promise);
	const { result } = await renderHook(() => useSignOut());
	await act(async () => {
		void result.current.signOut();
	});
	expect(result.current.isSigningOut).toBe(true);
	await act(async () => result.current.signOut());
	expect(authClient.signOut).toHaveBeenCalledTimes(1);
	await act(async () =>
		pending.resolve({
			data: null,
			error: {
				status: 500,
				statusText: "Internal Server Error",
				message: "Unable to end session",
			},
		}),
	);
	expect(result.current.errorMessage).toBe("Unable to end session");
	expect(result.current.isSigningOut).toBe(false);
});

const pressAlertAction = (alert: jest.SpyInstance, text: string) => {
	const buttons = alert.mock.calls.at(-1)?.[2] as
		| { text?: string; onPress?: () => void }[]
		| undefined;
	const button = buttons?.find((candidate) => candidate.text === text);
	if (!button) throw new Error(`Alert has no "${text}" button`);
	button.onPress?.();
};

test("members confirm before leaving and then see the create-space state", async () => {
	const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
	const api = createApi();
	api.currentQuery.mockResolvedValue({ sharedSpace, partner: null });
	api.leave.mockImplementationOnce(async () => {
		api.currentQuery.mockResolvedValue(null);
	});
	await render(<HomeScreen />, { wrapper: api.Wrapper });
	await screen.findByText("Your space is ready");

	await fireEvent.press(screen.getByText("Leave space"));
	expect(alert).toHaveBeenCalledTimes(1);
	expect(api.leave).not.toHaveBeenCalled();

	await act(async () => pressAlertAction(alert, "Leave space"));
	await waitFor(() => expect(api.leave).toHaveBeenCalledTimes(1));
	await screen.findByText("Make a space for the two of you");
	expect(screen.queryByText("Leave space")).toBeNull();
});

test("users without a space cannot leave but can still delete their account", async () => {
	const api = createApi();
	await render(<HomeScreen />, { wrapper: api.Wrapper });
	await screen.findByText("Make a space for the two of you");

	expect(screen.queryByText("Leave space")).toBeNull();
	expect(screen.getByText("Delete account")).toBeOnTheScreen();
});

test("deleting an account requires confirmation", async () => {
	const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
	jest.mocked(authClient.deleteUser).mockResolvedValue({
		data: { success: true, message: "User deleted" },
		error: null,
	});
	const api = createApi();
	await render(<HomeScreen />, { wrapper: api.Wrapper });
	await screen.findByText("Make a space for the two of you");

	await fireEvent.press(screen.getByText("Delete account"));
	expect(alert).toHaveBeenCalledTimes(1);
	expect(authClient.deleteUser).not.toHaveBeenCalled();

	await act(async () => pressAlertAction(alert, "Delete account"));
	await waitFor(() => expect(authClient.deleteUser).toHaveBeenCalledTimes(1));
});

test("delete-account hook explains an expired session and allows a retry", async () => {
	jest.mocked(authClient.deleteUser).mockResolvedValueOnce({
		data: null,
		error: {
			status: 400,
			statusText: "Bad Request",
			code: "SESSION_EXPIRED",
			message: "Session expired. Re-authenticate to perform this action.",
		},
	});
	const { result } = await renderHook(() => useDeleteAccount());
	await act(async () => result.current.deleteAccount());
	expect(result.current.errorMessage).toMatch(/sign out and sign back in/);
	expect(result.current.isDeleting).toBe(false);

	jest
		.mocked(authClient.deleteUser)
		.mockRejectedValueOnce(new Error("Offline"));
	await act(async () => result.current.deleteAccount());
	expect(result.current.errorMessage).toBe(
		"Unable to delete your account. Please try again.",
	);
});
