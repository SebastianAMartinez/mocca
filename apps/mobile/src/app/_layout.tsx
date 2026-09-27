import { SplashScreen, Stack } from "expo-router";
import { useEffect } from "react";

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
		<Stack>
			<Stack.Protected guard={!isPending && !session}>
				<Stack.Screen name="(auth)" />
			</Stack.Protected>

			<Stack.Protected guard={!isPending && !!session}>
				<Stack.Screen name="(app)" />
			</Stack.Protected>
		</Stack>
	);
}
