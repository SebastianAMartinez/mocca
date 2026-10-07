import { Button, Column } from "@expo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, Share } from "react-native";
import { AppText } from "@/components/AppText";
import { invitationLink } from "@/lib/invitations";
import { buttonStyle, spacing } from "@/lib/theme";
import { useTRPC, type useTRPCClient } from "@/lib/trpc";

type Invitation = Awaited<
	ReturnType<
		ReturnType<
			typeof useTRPCClient
		>["sharedSpace"]["createInvitation"]["mutate"]
	>
>;

export const InvitationActions = ({ disabled }: { disabled: boolean }) => {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [expired, setExpired] = useState(false);
	const [isSharing, setIsSharing] = useState(false);
	const [shareError, setShareError] = useState<string | null>(null);
	const createInvitation = useMutation(
		trpc.sharedSpace.createInvitation.mutationOptions({
			retry: false,
			onMutate: (): Invitation | undefined =>
				createInvitation.data ?? createInvitation.context,
			onSuccess: () => {
				setExpired(false);
				setShareError(null);
			},
			onError: async (error) => {
				if (
					error.data?.code === "CONFLICT" ||
					error.data?.code === "PRECONDITION_FAILED"
				) {
					await queryClient.invalidateQueries({
						queryKey: trpc.sharedSpace.current.queryKey(),
					});
				}
			},
		}),
	);
	const invitation = createInvitation.data ?? createInvitation.context;
	const busy = disabled || createInvitation.isPending || isSharing;

	useEffect(() => {
		if (!invitation) return;
		const remaining = new Date(invitation.expiresAt).getTime() - Date.now();
		if (remaining <= 0) {
			setExpired(true);
			return;
		}
		const timer = setTimeout(() => setExpired(true), remaining);
		return () => clearTimeout(timer);
	}, [invitation]);

	const generateInvitation = () => {
		if (busy) return;
		createInvitation.mutate();
	};

	const replaceInvitation = () => {
		if (busy) return;
		Alert.alert(
			"Replace your invitation?",
			"The previous link will stop working. Share the new invitation with your person.",
			[
				{ text: "Cancel", style: "cancel" },
				{ text: "Create new invitation", onPress: generateInvitation },
			],
		);
	};

	const shareInvitation = async () => {
		if (busy || !invitation) return;
		if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
			setExpired(true);
			setShareError("This invitation has expired. Create a new one to share.");
			return;
		}
		setIsSharing(true);
		setShareError(null);
		try {
			await Share.share({
				title: "Join my Mocca space",
				message: `Join me on Mocca, a little space for us.\n${invitationLink(invitation.token)}`,
			});
		} catch {
			setShareError("Unable to share the invitation. Please try again.");
		} finally {
			setIsSharing(false);
		}
	};

	return (
		<Column alignment="start" spacing={spacing.group}>
			{invitation ? (
				<>
					<AppText tone="secondary">
						{expired
							? "Your invitation has expired. Create a new one to invite your person."
							: `Invitation ready. Expires ${new Date(invitation.expiresAt).toLocaleString()}.`}
					</AppText>
					<Button
						label={isSharing ? "Opening share sheet..." : "Share invitation"}
						disabled={busy || expired}
						onPress={() => void shareInvitation()}
						style={buttonStyle}
						testID="share-invitation"
					/>
					<Button
						label={
							createInvitation.isPending
								? "Creating invitation..."
								: "Create new invitation"
						}
						variant="text"
						disabled={busy}
						onPress={expired ? generateInvitation : replaceInvitation}
						style={buttonStyle}
					/>
				</>
			) : (
				<Button
					label={
						createInvitation.isPending
							? "Creating invitation..."
							: "Invite your person"
					}
					disabled={busy}
					onPress={generateInvitation}
					style={buttonStyle}
					testID="create-invitation"
				/>
			)}
			<AppText tone="secondary">
				Your person needs Mocca installed to open the link. Invitations expire
				after 24 hours. Creating a new invitation replaces any previous link.
				Anyone with the link can join, so share it privately.
			</AppText>
			{createInvitation.isError ? (
				<AppText tone="error">
					{`Couldn't create an invitation: ${createInvitation.error.message}`}
				</AppText>
			) : null}
			{shareError ? <AppText tone="error">{shareError}</AppText> : null}
		</Column>
	);
};
