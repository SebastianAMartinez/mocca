import { db, schema } from "@mocca/db";
import { and, count, eq } from "drizzle-orm";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const findMembership = async (tx: Transaction, userId: string) => {
	const [membership] = await tx
		.select({ spaceId: schema.sharedSpaceMembership.spaceId })
		.from(schema.sharedSpaceMembership)
		.where(eq(schema.sharedSpaceMembership.userId, userId))
		.limit(1);

	return membership;
};

// Locks the space row so creating, accepting, and leaving run one at a time.
export const lockSharedSpace = async (tx: Transaction, spaceId: string) => {
	const [sharedSpace] = await tx
		.select({
			id: schema.sharedSpace.id,
			createdAt: schema.sharedSpace.createdAt,
		})
		.from(schema.sharedSpace)
		.where(eq(schema.sharedSpace.id, spaceId))
		.for("update");

	return sharedSpace;
};

export const countMembers = async (tx: Transaction, spaceId: string) => {
	const [{ memberCount }] = await tx
		.select({ memberCount: count() })
		.from(schema.sharedSpaceMembership)
		.where(eq(schema.sharedSpaceMembership.spaceId, spaceId));

	return memberCount;
};

// Removes the user's membership and deletes the space if it ends up empty.
export const leaveSharedSpace = async (userId: string): Promise<void> => {
	await db.transaction(async (tx) => {
		const membership = await findMembership(tx, userId);

		if (!membership) return;

		await lockSharedSpace(tx, membership.spaceId);

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

		if ((await countMembers(tx, membership.spaceId)) === 0) {
			// Deleting the space also deletes its invitation.
			await tx
				.delete(schema.sharedSpace)
				.where(eq(schema.sharedSpace.id, membership.spaceId));
		}
	});
};
