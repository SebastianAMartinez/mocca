import {
	invitationLink,
	invitationPath,
	parseInvitationToken,
} from "@/lib/invitations";

const token = "a".repeat(43);

test("validates the exact invitation token and deep-link shape", () => {
	expect(parseInvitationToken(token)).toBe(token);
	for (const value of [
		undefined,
		null,
		"",
		[token],
		"a".repeat(42),
		"a".repeat(44),
		"/".repeat(43),
	]) {
		expect(parseInvitationToken(value)).toBeNull();
	}
	expect(invitationPath(token)).toBe(`/invite?token=${token}`);
	const link = new URL(invitationLink(token));
	expect(link.protocol).toBe("mocca:");
	expect(link.hostname).toBe("invite");
	expect(link.searchParams.get("token")).toBe(token);
});
