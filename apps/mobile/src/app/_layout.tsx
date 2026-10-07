import { SplashScreen, Stack } from "expo-router";
import { useEffect } from "react";

import { ApiProvider } from "@/components/ApiProvider";
import { authClient } from "@/lib/auth-client";

SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
	const { data: session, isPending } = authClient.useSession();

	useEffect(() => {
		if (!isPending) {
			SplashScreen.hide();
		}
	}, [isPending]);

	if (isPending) return null;

	return (
		<ApiProvider key={session ? `user:${session.user.id}` : "signed-out"}>
			<Stack>
				<Stack.Protected guard={!isPending && !session}>
					<Stack.Screen name="(auth)" options={{ headerShown: false }} />
				</Stack.Protected>

				<Stack.Protected guard={!isPending && !!session}>
					<Stack.Screen name="(app)" options={{ headerShown: false }} />
				</Stack.Protected>
				<Stack.Screen name="invite" />
			</Stack>
		</ApiProvider>
	);
};

export default RootLayout;
