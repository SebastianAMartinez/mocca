import { db, schema } from "@mocca/db";
import { and, count, eq } from "drizzle-orm";

// Removes the user's membership and deletes the space if it ends up empty.
export const leaveSharedSpace = async (userId: string): Promise<void> => {
	await db.transaction(async (tx) => {
		const [membership] = await tx
			.select({ spaceId: schema.sharedSpaceMembership.spaceId })
			.from(schema.sharedSpaceMembership)
			.where(eq(schema.sharedSpaceMembership.userId, userId))
			.limit(1);

		if (!membership) return;

		// Takes the same lock as invitations so concurrent changes run one at a time.
		await tx
			.select({ id: schema.sharedSpace.id })
			.from(schema.sharedSpace)
			.where(eq(schema.sharedSpace.id, membership.spaceId))
			.for("update");

		// A concurrent leave may already have removed this membership.
		const removed = await tx
			.delete(schema.sharedSpaceMembership)
			.where(
				and(
					eq(schema.sharedSpaceMembership.spaceId, membership.spaceId),
					eq(schema.sharedSpaceMembership.userId, userId),
				),
			)
			.returning({ userId: schema.sharedSpaceMembership.userId });

		if (removed.length === 0) return;

		const [{ memberCount }] = await tx
			.select({ memberCount: count() })
			.from(schema.sharedSpaceMembership)
			.where(eq(schema.sharedSpaceMembership.spaceId, membership.spaceId));

		if (memberCount === 0) {
			// Deleting the space also deletes its invitation.
			await tx
				.delete(schema.sharedSpace)
				.where(eq(schema.sharedSpace.id, membership.spaceId));
		}
	});
};
