import { describe, it, expect } from "vitest";
import { formatProvisionOutcome, parseStoredStatusRows } from "./student-repo-status";
import type { StudentRepoInvitationRow } from "./student-repo-status";

// Both helpers live in this pure module rather than inside
// StudentRepoRoster.tsx on purpose: the vitest suite is node-env and collects
// only src/**/*.test.ts, so anything left in the component is permanently
// untestable. These two carry the logic most likely to be wrong.

describe("formatProvisionOutcome", () => {
  const result = (over: Partial<Parameters<typeof formatProvisionOutcome>[0]> = {}) => ({
    repo: "cs101-smith-john",
    created: "created" as const,
    invited: true,
    ...over,
  });

  it("reports a fresh repo and a sent invitation", () => {
    expect(formatProvisionOutcome(result(), true)).toBe("Created. Invited.");
  });

  it("reports an existing repo without claiming it was created", () => {
    // This is the re-run case, and calling it "Created" would be a lie that
    // matters - the instructor would think a second repo appeared.
    expect(formatProvisionOutcome(result({ created: "existed" }), true)).toBe(
      "Already existed. Invited."
    );
  });

  it("surfaces the create error verbatim and says nothing about an invitation", () => {
    // Nothing is invited when the repo could not be made, so the message must
    // not imply otherwise.
    const text = formatProvisionOutcome(
      result({ created: "failed", createError: "GitHub rejected the request (422).", invited: false }),
      true
    );
    expect(text).toBe("Failed: GitHub rejected the request (422).");
    expect(text).not.toContain("Invited");
  });

  it("falls back to a plain sentence when a failure carries no message", () => {
    const text = formatProvisionOutcome(result({ created: "failed", invited: false }), true);
    expect(text.startsWith("Failed:")).toBe(true);
    expect(text.length).toBeGreaterThan("Failed:".length + 1);
  });

  it("surfaces the invite error verbatim - this is the whole point of AC2.6", () => {
    // GitHub's 50-invitations-per-repo-per-24-hours message is the only
    // useful diagnosis of that failure. It must reach the instructor intact.
    const message = "You are limited to sending 50 invitations to a repository per 24 hour period.";
    const text = formatProvisionOutcome(
      result({ invited: false, inviteError: message }),
      true
    );
    expect(text).toContain(message);
    expect(text).toBe(`Created. Invitation failed: ${message}`);
  });

  it("explains a skipped invitation when the roster row has no handle", () => {
    const text = formatProvisionOutcome(result({ invited: false }), false);
    expect(text).toBe("Created. No username, so no invitation was sent.");
  });

  it("does not claim an invitation was sent when the row has no handle", () => {
    // The repo IS created for a handle-less student (AC2.1a), so the create
    // half must still read as success.
    const text = formatProvisionOutcome(result({ created: "existed", invited: false }), false);
    expect(text.startsWith("Already existed.")).toBe(true);
    expect(text).not.toContain("Invited.");
  });
});

describe("parseStoredStatusRows", () => {
  const row = (username: string): StudentRepoInvitationRow => ({
    student: "Smith, John",
    username,
    repo: `my-org/cs101-${username}`,
    repoUrl: `https://github.com/my-org/cs101-${username}`,
    state: "accepted",
    label: "Accepted",
    invitationId: null,
    invitedAt: null,
    expiresAt: null,
    detail: null,
  });

  const stored = (rows: StudentRepoInvitationRow[], prefix = "cs101", checkedAt = 1000) =>
    JSON.stringify({ prefix, checkedAt, rows });

  it("restores rows whose students are still on the roster", () => {
    const parsed = parseStoredStatusRows(stored([row("jsmith"), row("aokafor")]), ["jsmith", "aokafor"], "cs101");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.checkedAt).toBe(1000);
  });

  it("drops a stored row for a student no longer on the roster", () => {
    // Otherwise a removed student renders as a ghost row with a stale status.
    const parsed = parseStoredStatusRows(stored([row("jsmith"), row("departed")]), ["jsmith"], "cs101");
    expect(parsed.rows.map((r) => r.username)).toEqual(["jsmith"]);
  });

  it("matches the roster case-insensitively and ignores a leading @", () => {
    const parsed = parseStoredStatusRows(stored([row("jsmith")]), ["@JSmith"], "cs101");
    expect(parsed.rows).toHaveLength(1);
  });

  it("discards everything when the prefix has changed", () => {
    // The prefix determines every computed repo name, so a change invalidates
    // every stored row at once - they describe repos this roster no longer
    // points at.
    const parsed = parseStoredStatusRows(stored([row("jsmith")], "cs101"), ["jsmith"], "cs102");
    expect(parsed.rows).toEqual([]);
    expect(parsed.checkedAt).toBe(0);
  });

  it("returns nothing for a null or blank payload", () => {
    expect(parseStoredStatusRows(null, ["jsmith"], "cs101").rows).toEqual([]);
    expect(parseStoredStatusRows("", ["jsmith"], "cs101").rows).toEqual([]);
  });

  it("returns nothing for malformed JSON rather than throwing", () => {
    expect(() => parseStoredStatusRows("{not json", ["jsmith"], "cs101")).not.toThrow();
    expect(parseStoredStatusRows("{not json", ["jsmith"], "cs101").rows).toEqual([]);
  });

  it("returns nothing for a payload of the wrong shape", () => {
    for (const raw of ["null", "[]", '"a string"', "42", '{"rows":"not an array"}']) {
      expect(parseStoredStatusRows(raw, ["jsmith"], "cs101").rows).toEqual([]);
    }
  });

  it("drops individual rows that are not well-formed", () => {
    const raw = JSON.stringify({
      prefix: "cs101",
      checkedAt: 5,
      rows: [row("jsmith"), { username: "aokafor" }, null, "nope", 7],
    });
    const parsed = parseStoredStatusRows(raw, ["jsmith", "aokafor"], "cs101");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].username).toBe("jsmith");
  });

  it("rejects a row carrying a state it does not recognise", () => {
    const raw = JSON.stringify({
      prefix: "cs101",
      checkedAt: 5,
      rows: [{ ...row("jsmith"), state: "totally-made-up" }],
    });
    expect(parseStoredStatusRows(raw, ["jsmith"], "cs101").rows).toEqual([]);
  });

  it("treats a non-numeric checkedAt as unknown rather than trusting it", () => {
    const raw = JSON.stringify({ prefix: "cs101", checkedAt: "recently", rows: [row("jsmith")] });
    expect(parseStoredStatusRows(raw, ["jsmith"], "cs101").checkedAt).toBe(0);
  });

  it("returns an empty list when the roster itself is empty", () => {
    expect(parseStoredStatusRows(stored([row("jsmith")]), [], "cs101").rows).toEqual([]);
  });
});
