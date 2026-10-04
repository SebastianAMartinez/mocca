import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { authClient } from "@/lib/auth-client";

import type { AppRouter } from "../../../server/src/trpc/router";

export const { TRPCProvider, useTRPC, useTRPCClient } =
	createTRPCContext<AppRouter>();

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
