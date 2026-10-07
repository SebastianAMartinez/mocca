import {
	createTRPCClient,
	httpBatchLink,
	type TRPCClientErrorLike,
} from "@trpc/client";
import {
	createTRPCContext,
	type inferOutput,
} from "@trpc/tanstack-react-query";
import { authClient } from "@/lib/auth-client";

import type { AppRouter } from "../../../server/src/trpc/router";

export const { TRPCProvider, useTRPC, useTRPCClient } =
	createTRPCContext<AppRouter>();

type Api = ReturnType<typeof useTRPC>;

export type ApiError = TRPCClientErrorLike<AppRouter>;
export type CurrentSpace = inferOutput<Api["sharedSpace"]["current"]>;
export type Invitation = inferOutput<Api["sharedSpace"]["createInvitation"]>;

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
	throw new Error("EXPO_PUBLIC_API_URL is not set");
}

const trpcUrl = `${apiUrl.replace(/\/+$/, "")}/trpc`;

export const createMoccaTRPCClient = () =>
	createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: trpcUrl,
				headers: async () => {
					const cookie = await authClient.getCookie();

					return cookie ? { Cookie: cookie } : {};
				},
			}),
		],
	});
