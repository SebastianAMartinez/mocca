import { Button, Column, RNHostView } from "@expo/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { InvitationActions } from "@/components/InvitationActions";
import { buttonStyle, spacing, useAppTheme } from "@/lib/theme";
import type { ApiError, CurrentSpace } from "@/lib/trpc";

type SharedSpaceSectionProps = {
	spaceQuery: UseQueryResult<CurrentSpace, ApiError>;
	isCreating: boolean;
	creationError: string | null;
	isSigningOut: boolean;
	onCreate: () => void;
	onRetry: () => void;
};

export const SharedSpaceSection = ({
	spaceQuery,
	isCreating,
	creationError,
	isSigningOut,
	onCreate,
	onRetry,
}: SharedSpaceSectionProps) => {
	const { palette } = useAppTheme();

	return (
		<Column
			alignment="start"
			spacing={spacing.group}
			testID="shared-space-state"
		>
			<AppText variant="caption" tone="secondary">
				OUR SPACE
			</AppText>
			{spaceQuery.isPending ? (
				<>
					<RNHostView matchContents>
						<View style={styles.spinner}>
							<ActivityIndicator
								color={palette.secondary}
								accessibilityLabel="Loading your shared space"
							/>
						</View>
					</RNHostView>
					<AppText tone="secondary">Loading your shared space...</AppText>
				</>
			) : spaceQuery.isError && spaceQuery.data === undefined ? (
				<>
					<AppText variant="title">Couldn't load your space</AppText>
					<AppText tone="secondary">
						Check your connection and try again.
					</AppText>
					<AppText tone="error">{spaceQuery.error.message}</AppText>
					<Button
						label={spaceQuery.isFetching ? "Trying again..." : "Try again"}
						disabled={spaceQuery.isFetching}
						style={buttonStyle}
						onPress={onRetry}
					/>
				</>
			) : spaceQuery.data === null ? (
				<>
					<AppText variant="title">Make a space for the two of you</AppText>
					<AppText tone="secondary">
						Create a private space, then invite the person you want to share it
						with.
					</AppText>
					<Button
						label={
							isCreating ? "Creating your space..." : "Create a shared space"
						}
						style={buttonStyle}
						disabled={isCreating || isSigningOut}
						testID="create-shared-space"
						onPress={onCreate}
					/>
					{creationError !== null ? (
						<AppText tone="error">
							{`Couldn't create your space: ${creationError}`}
						</AppText>
					) : null}
					<AppText tone="secondary">
						Already invited? Open the invitation they sent you.
					</AppText>
				</>
			) : spaceQuery.data?.partner === null ? (
				<>
					<AppText variant="title">Your space is ready</AppText>
					<AppText tone="secondary">
						There's room for your person. Send them an invitation to join.
					</AppText>
					<InvitationActions disabled={isSigningOut} />
				</>
			) : spaceQuery.data ? (
				<>
					<AppText variant="title">
						{`You and ${spaceQuery.data.partner.name.trim().split(/\s+/)[0]}`}
					</AppText>
					<AppText tone="secondary">A little space for us.</AppText>
				</>
			) : null}
			{spaceQuery.isError && spaceQuery.data !== undefined ? (
				<Column alignment="start" spacing={spacing.small}>
					<AppText tone="error">
						Couldn't refresh your space. Your last update is still shown.
					</AppText>
					<AppText tone="error">{spaceQuery.error.message}</AppText>
					<Button
						label={spaceQuery.isFetching ? "Trying again..." : "Try again"}
						variant="text"
						style={buttonStyle}
						disabled={spaceQuery.isFetching}
						onPress={onRetry}
					/>
				</Column>
			) : null}
		</Column>
	);
};

const styles = StyleSheet.create({
	spinner: {
		paddingVertical: spacing.small,
	},
});
