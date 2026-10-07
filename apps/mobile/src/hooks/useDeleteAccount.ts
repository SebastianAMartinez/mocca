import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export const useDeleteAccount = () => {
	const [isDeleting, setIsDeleting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const deleteAccount = async () => {
		if (isDeleting) return;
		setIsDeleting(true);
		setErrorMessage(null);
		try {
			// On success the session ends and the app returns to sign-in.
			const { error } = await authClient.deleteUser();
			if (error) {
				// Better Auth only deletes from a recently signed-in session.
				setErrorMessage(
					error.code === "SESSION_EXPIRED"
						? "For your security, sign out and sign back in, then try deleting your account again."
						: (error.message ??
								"Unable to delete your account. Please try again."),
				);
			}
		} catch {
			setErrorMessage("Unable to delete your account. Please try again.");
		} finally {
			setIsDeleting(false);
		}
	};

	return { deleteAccount, isDeleting, errorMessage };
};
