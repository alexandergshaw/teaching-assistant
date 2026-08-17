import { describe, it, expect, vi, beforeEach } from "vitest";

// Guards the ORCHESTRATION, not the pure modules. The state machine, the
// naming transform and the name-matching helper all have their own tests;
// what those cannot see is how this action wires them to GitHub - and that
// wiring is where the one shipped-blocking bug in this feature lived.

const listOrgRepos = vi.fn();
const listRepoInvitations = vi.fn();
const listRepoCollaborators = vi.fn();
const setRepoCollaborator = vi.fn();
const deleteRepoInvitation = vi.fn();

vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn(async () => ({ id: "owner" })) }));

vi.mock("@/lib/github", () => ({
  listOrgRepos: (...args: unknown[]) => listOrgRepos(...args),
  listRepoInvitations: (...args: unknown[]) => listRepoInvitations(...args),
  listRepoCollaborators: (...args: unknown[]) => listRepoCollaborators(...args),
  setRepoCollaborator: (...args: unknown[]) => setRepoCollaborator(...args),
  deleteRepoInvitation: (...args: unknown[]) => deleteRepoInvitation(...args),
}));

const {
  studentRepoInvitationStatusAction,
  resendStudentRepoInviteAction,
} = await import("./github-student-repos");

// Reproduces listOrgRepos's REAL behavior, including the client-side prefix
// filter at src/lib/github.repos.ts:146. This is what makes the regression
// test below a genuine guard rather than a restatement: if the action ever
// passes a prefix again, this mock filters exactly the way production does
// and the assertion goes red.
const orgListing = (names: string[]) =>
  listOrgRepos.mockImplementation(async (_org: string, prefix?: string) => {
    const needle = prefix?.trim().toLowerCase();
    return names
      .filter((n) => !needle || n.toLowerCase().startsWith(needle))
      .map((n) => ({ name: n, fullName: `my-org/${n}` }));
  });

const rowsOf = (result: Awaited<ReturnType<typeof studentRepoInvitationStatusAction>>) => {
  if ("error" in result) throw new Error(`Expected rows, got error: ${result.error}`);
  return result;
};

beforeEach(() => {
  vi.clearAllMocks();
  listRepoInvitations.mockResolvedValue([]);
  listRepoCollaborators.mockResolvedValue([]);
  setRepoCollaborator.mockResolvedValue(undefined);
  deleteRepoInvitation.mockResolvedValue(undefined);
});

describe("studentRepoInvitationStatusAction - the org listing must not be prefix-filtered", () => {
  it("finds an existing repo when the prefix contains a space", async () => {
    // THE REGRESSION. studentRepoName slugs "CS 101" to the base "cs-101",
    // so the repo is "cs-101-smith-john". Passing the raw prefix to
    // listOrgRepos makes its needle "cs 101", which matches nothing - and
    // every student on a fully provisioned course reports "No repo yet".
    orgListing(["cs-101-smith-john"]);

    const result = rowsOf(
      await studentRepoInvitationStatusAction("my-org", "CS 101", "Smith, John | jsmith")
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].repo).toBe("my-org/cs-101-smith-john");
    expect(result.rows[0].state).not.toBe("missing");
    expect(result.rows[0].state).toBe("not-invited");
  });

  it("passes no prefix argument to listOrgRepos at all", async () => {
    orgListing(["cs-101-smith-john"]);
    await studentRepoInvitationStatusAction("my-org", "CS 101", "Smith, John | jsmith");

    expect(listOrgRepos).toHaveBeenCalledTimes(1);
    expect(listOrgRepos.mock.calls[0][1]).toBeUndefined();
  });

  it("still resolves correctly for a prefix that needs no slugging", async () => {
    orgListing(["cs101-smith-john"]);
    const result = rowsOf(
      await studentRepoInvitationStatusAction("my-org", "cs101", "Smith, John | jsmith")
    );
    expect(result.rows[0].state).toBe("not-invited");
  });

  it("matches org repo names case-insensitively", async () => {
    orgListing(["CS101-Smith-John"]);
    const result = rowsOf(
      await studentRepoInvitationStatusAction("my-org", "cs101", "Smith, John | jsmith")
    );
    expect(result.rows[0].state).not.toBe("missing");
  });

  it("reports a genuinely absent repo as missing", async () => {
    // The inverse of the regression: the fix must not make everything look
    // present.
    orgListing(["cs-101-someone-else"]);
    const result = rowsOf(
      await studentRepoInvitationStatusAction("my-org", "CS 101", "Smith, John | jsmith")
    );
    expect(result.rows[0].state).toBe("missing");
  });
});

describe("studentRepoInvitationStatusAction - call budget", () => {
  it("does not look up invitations for a repo that does not exist", async () => {
    orgListing([]);
    await studentRepoInvitationStatusAction("my-org", "cs101", "Smith, John | jsmith");
    expect(listRepoInvitations).not.toHaveBeenCalled();
    expect(listRepoCollaborators).not.toHaveBeenCalled();
  });

  it("does not look up anything for a student with no GitHub username", async () => {
    orgListing(["cs101-smith-john"]);
    await studentRepoInvitationStatusAction("my-org", "cs101", "Smith, John");
    expect(listRepoInvitations).not.toHaveBeenCalled();
    expect(listRepoCollaborators).not.toHaveBeenCalled();
  });

  it("skips the collaborators call when this student already has an invitation", async () => {
    orgListing(["cs101-smith-john"]);
    listRepoInvitations.mockResolvedValue([
      { id: 1, inviteeLogin: "jsmith", permission: "write", createdAt: new Date().toISOString(), expired: false, htmlUrl: "" },
    ]);

    const result = rowsOf(
      await studentRepoInvitationStatusAction("my-org", "cs101", "Smith, John | jsmith")
    );

    expect(result.rows[0].state).toBe("pending");
    expect(listRepoCollaborators).not.toHaveBeenCalled();
  });

  it("falls through to collaborators when the only invitation is another student's", async () => {
    orgListing(["cs101-smith-john"]);
    listRepoInvitations.mockResolvedValue([
      { id: 1, inviteeLogin: "someone-else", permission: "write", createdAt: new Date().toISOString(), expired: false, htmlUrl: "" },
    ]);
    listRepoCollaborators.mockResolvedValue([{ login: "jsmith", permission: "push" }]);

    const result = rowsOf(
      await studentRepoInvitationStatusAction("my-org", "cs101", "Smith, John | jsmith")
    );

    expect(listRepoCollaborators).toHaveBeenCalledTimes(1);
    expect(result.rows[0].state).toBe("accepted");
  });
});

describe("studentRepoInvitationStatusAction - failure isolation and the row cap", () => {
  it("keeps every other row when one row's lookup fails", async () => {
    orgListing(["cs101-a-one", "cs101-b-two"]);
    listRepoInvitations.mockImplementation(async (_org: string, repo: string) => {
      if (repo === "cs101-a-one") throw new Error("GitHub forbidden (403)");
      return [];
    });

    const result = rowsOf(
      await studentRepoInvitationStatusAction("my-org", "cs101", "A One | aone\nB Two | btwo")
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].state).toBe("error");
    expect(result.rows[0].detail).toContain("403");
    expect(result.rows[1].state).not.toBe("error");
  });

  it("fails the whole refresh when the shared org listing fails", async () => {
    // Unlike a per-row failure, this one is a precondition - reporting 30
    // rows of "No repo yet" would be a confident lie.
    listOrgRepos.mockRejectedValue(new Error("GitHub rejected the token (401)."));
    const result = await studentRepoInvitationStatusAction("my-org", "cs101", "A One | aone");
    expect("error" in result).toBe(true);
  });

  it("caps the roster and reports the remainder rather than dropping it silently", async () => {
    orgListing([]);
    const roster = Array.from({ length: 85 }, (_, i) => `Student ${i} | user${i}`).join("\n");

    const result = rowsOf(await studentRepoInvitationStatusAction("my-org", "cs101", roster));

    expect(result.rows).toHaveLength(80);
    expect(result.notChecked).toBe(5);
  });

  it("reports nothing left unchecked for an ordinary class", async () => {
    orgListing([]);
    const roster = Array.from({ length: 30 }, (_, i) => `Student ${i} | user${i}`).join("\n");
    const result = rowsOf(await studentRepoInvitationStatusAction("my-org", "cs101", roster));
    expect(result.notChecked).toBe(0);
  });

  it("refuses a blank organization without calling GitHub", async () => {
    const result = await studentRepoInvitationStatusAction("   ", "cs101", "A One | aone");
    expect("error" in result).toBe(true);
    expect(listOrgRepos).not.toHaveBeenCalled();
  });
});

describe("resendStudentRepoInviteAction", () => {
  it("deletes the existing invitation BEFORE issuing a fresh one", async () => {
    // GitHub has no resend endpoint; delete-then-PUT is the only documented
    // path. The reverse order would leave the stale invitation in place and
    // the new PUT would be a no-op.
    const order: string[] = [];
    listRepoInvitations.mockResolvedValue([
      { id: 55, inviteeLogin: "jsmith", permission: "write", createdAt: "", expired: true, htmlUrl: "" },
    ]);
    deleteRepoInvitation.mockImplementation(async () => {
      order.push("delete");
    });
    setRepoCollaborator.mockImplementation(async () => {
      order.push("put");
    });

    const result = await resendStudentRepoInviteAction("my-org", "cs101-smith-john", "jsmith", "push");

    expect(result).toEqual({ ok: true });
    expect(order).toEqual(["delete", "put"]);
    expect(deleteRepoInvitation).toHaveBeenCalledWith("my-org", "cs101-smith-john", 55);
    expect(setRepoCollaborator).toHaveBeenCalledWith("my-org", "cs101-smith-john", "jsmith", "push");
  });

  it("does not delete another student's invitation", async () => {
    listRepoInvitations.mockResolvedValue([
      { id: 99, inviteeLogin: "someone-else", permission: "write", createdAt: "", expired: true, htmlUrl: "" },
    ]);

    await resendStudentRepoInviteAction("my-org", "cs101-smith-john", "jsmith", "push");

    expect(deleteRepoInvitation).not.toHaveBeenCalled();
    expect(setRepoCollaborator).toHaveBeenCalledTimes(1);
  });

  it("still invites when there is no invitation to delete", async () => {
    listRepoInvitations.mockResolvedValue([]);
    const result = await resendStudentRepoInviteAction("my-org", "cs101-smith-john", "jsmith", "push");
    expect(result).toEqual({ ok: true });
    expect(deleteRepoInvitation).not.toHaveBeenCalled();
    expect(setRepoCollaborator).toHaveBeenCalledTimes(1);
  });

  it("strips a leading @ from the handle before inviting", async () => {
    listRepoInvitations.mockResolvedValue([]);
    await resendStudentRepoInviteAction("my-org", "cs101-smith-john", "@jsmith", "push");
    expect(setRepoCollaborator).toHaveBeenCalledWith("my-org", "cs101-smith-john", "jsmith", "push");
  });

  it("refuses a blank handle without touching GitHub", async () => {
    const result = await resendStudentRepoInviteAction("my-org", "cs101-smith-john", "  ", "push");
    expect("error" in result).toBe(true);
    expect(setRepoCollaborator).not.toHaveBeenCalled();
  });

  it("returns an error envelope rather than throwing when the invite fails", async () => {
    listRepoInvitations.mockResolvedValue([]);
    setRepoCollaborator.mockRejectedValue(
      new Error("You are limited to sending 50 invitations to a repository per 24 hour period.")
    );

    const result = await resendStudentRepoInviteAction("my-org", "cs101-smith-john", "jsmith", "push");

    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("50 invitations");
  });
});
