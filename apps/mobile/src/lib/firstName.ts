export const firstName = (fullName: string): string =>
	fullName.trim().split(/\s+/)[0];
