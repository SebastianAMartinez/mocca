import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { createTRPCClient, httpLink } from "@trpc/client";
import { Alert } from "react-native";
import { InvitationActions } from "@/components/invitation-actions";
import { TRPCProvider } from "@/lib/trpc";
import type { AppRouter } from "../../server/src/trpc/router";

jest.mock("@/lib/auth-client", () => ({
	authClient: { getCookie: () => null },
}));

test("web requires inline confirmation before replacing an invitation", async () => {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
	});
	const fetch = jest.fn(async () =>
		Response.json({
			result: {
				data: {
					token: "a".repeat(43),
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
				},
			},
		}),
	);
	const client = createTRPCClient<AppRouter>({
		links: [httpLink({ url: "https://api.example.com/trpc", fetch })],
	});
	const alert = jest.spyOn(Alert, "alert");
	const view = await render(
		<QueryClientProvider client={queryClient}>
			<TRPCProvider trpcClient={client} queryClient={queryClient}>
				<InvitationActions disabled={false} />
			</TRPCProvider>
		</QueryClientProvider>,
	);
	try {
		await fireEvent.press(screen.getByText("Invite your person"));
		await screen.findByText("Share invitation");
		await fireEvent.press(screen.getByText("Create new invitation"));
		await fireEvent.press(screen.getByText("Cancel"));
		expect(fetch).toHaveBeenCalledTimes(1);
		await fireEvent.press(screen.getByText("Create new invitation"));
		await fireEvent.press(screen.getByText("Replace invitation"));
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
		expect(alert).not.toHaveBeenCalled();
	} finally {
		await view.unmount();
		queryClient.clear();
		alert.mockRestore();
	}
});
