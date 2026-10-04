import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import { createMoccaTRPCClient, TRPCProvider } from "@/lib/trpc";

export const ApiProvider = ({ children }: { children: ReactNode }) => {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60_000,
					},
				},
			}),
	);
	const [trpcClient] = useState(() => createMoccaTRPCClient());

	useEffect(() => {
		return () => {
			queryClient.clear();
		};
	}, [queryClient]);

	return (
		<QueryClientProvider client={queryClient}>
			<TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
				{children}
			</TRPCProvider>
		</QueryClientProvider>
	);
};
