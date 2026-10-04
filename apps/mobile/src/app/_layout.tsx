import { SplashScreen, Stack } from "expo-router";
import { useEffect } from "react";

import { ApiProvider } from "@/lib/api-provider";
import { authClient } from "@/lib/auth-client";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
	const { data: session, isPending } = authClient.useSession();

	useEffect(() => {
		if (!isPending) {
			SplashScreen.hide();
		}
	}, [isPending]);

	return (
		<ApiProvider key={session ? `user:${session.user.id}` : "signed-out"}>
			<Stack>
				<Stack.Protected guard={!isPending && !session}>
					<Stack.Screen name="(auth)" />
				</Stack.Protected>

				<Stack.Protected guard={!isPending && !!session}>
					<Stack.Screen name="(app)" />
				</Stack.Protected>
			</Stack>
		</ApiProvider>
	);
}
