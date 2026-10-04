export const parseInvitationToken = (value: unknown): string | null =>
	typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;

export const invitationPath = (token: string): `/invite?token=${string}` =>
	`/invite?token=${encodeURIComponent(token)}`;

export const invitationLink = (token: string): string =>
	`mocca://${invitationPath(token).slice(1)}`;
