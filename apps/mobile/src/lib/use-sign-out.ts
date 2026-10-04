import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export const useSignOut = () => {
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const signOut = async () => {
		if (isSigningOut) return;
		setIsSigningOut(true);
		setErrorMessage(null);
		try {
			const { error } = await authClient.signOut();
			if (error) {
				setErrorMessage(
					error.message ?? "Unable to sign out. Please try again.",
				);
			}
		} catch {
			setErrorMessage("Unable to sign out. Please try again.");
		} finally {
			setIsSigningOut(false);
		}
	};

	return { signOut, isSigningOut, errorMessage };
};
