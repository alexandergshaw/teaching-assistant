import { describe, it, expect } from "vitest";
import {
  resolveInvitationRow,
  summarizeInvitationRows,
  STATUS_LABELS,
  type StudentRepoStatusInput,
} from "./student-repo-status";

// The status resolver is deliberately pure: the server action fetches the
// facts (does the repo exist, what invitations does it carry, who are its
// direct collaborators) and this function turns them into a row. That split
// is what makes the state machine testable at all - the vitest suite is
// node-env and renders nothing, so a resolver living inside the component
// could not be covered.

// A fixed clock. resolveInvitationRow takes `now` as an explicit input rather
// than reading Date.now() itself, so the 7-day expiry rule stays pure and
// testable.
const NOW = Date.parse("2026-08-17T00:00:00Z");

const base = (over: Partial<StudentRepoStatusInput> = {}): StudentRepoStatusInput => ({
  student: "Smith, John",
  username: "jsmith",
  org: "my-org",
  repo: "cs101-smith-john",
  repoExists: true,
  invitations: [],
  collaborators: [],
  error: null,
  now: NOW,
  ...over,
});

const invite = (
  over: Partial<StudentRepoStatusInput["invitations"][number]> = {}
): StudentRepoStatusInput["invitations"][number] => ({
  id: 42,
  inviteeLogin: "jsmith",
  expired: false,
  createdAt: "2026-08-10T12:00:00Z",
  permission: "write",
  htmlUrl: "https://github.com/my-org/cs101-smith-john/invitations",
  ...over,
});

describe("resolveInvitationRow - state precedence", () => {
  it("1. a failed lookup reports error, never a confident state", () => {
    // Every other signal here says "accepted". A lookup that failed must not
    // be allowed to masquerade as one.
    const row = resolveInvitationRow(
      base({ error: "GitHub forbidden (403)", collaborators: ["jsmith"] })
    );
    expect(row.state).toBe("error");
    expect(row.detail).toBe("GitHub forbidden (403)");
  });

  it("1. error outranks a blank username", () => {
    const row = resolveInvitationRow(base({ error: "boom", username: "" }));
    expect(row.state).toBe("error");
  });

  it("1. error outranks a missing repo", () => {
    const row = resolveInvitationRow(base({ error: "boom", repoExists: false }));
    expect(row.state).toBe("error");
  });

  it("1. error outranks an expired invitation", () => {
    const row = resolveInvitationRow(
      base({ error: "boom", invitations: [invite({ expired: true })] })
    );
    expect(row.state).toBe("error");
  });

  it("2. no username outranks a missing repo", () => {
    const row = resolveInvitationRow(base({ username: "", repoExists: false }));
    expect(row.state).toBe("no-username");
  });

  it("2. no username, even when the repo exists and has collaborators", () => {
    const row = resolveInvitationRow(base({ username: "   ", collaborators: ["someone"] }));
    expect(row.state).toBe("no-username");
  });

  it("3. a missing repo outranks any collaborator or invitation data", () => {
    const row = resolveInvitationRow(
      base({ repoExists: false, invitations: [invite()], collaborators: ["jsmith"] })
    );
    expect(row.state).toBe("missing");
  });

  it("4. an expired invitation outranks a pending one for the same student", () => {
    const row = resolveInvitationRow(
      base({ invitations: [invite({ id: 1, expired: true })] })
    );
    expect(row.state).toBe("expired");
    expect(row.invitationId).toBe(1);
  });

  it("5. an open invitation is pending", () => {
    const row = resolveInvitationRow(base({ invitations: [invite({ id: 7 })] }));
    expect(row.state).toBe("pending");
    expect(row.invitationId).toBe(7);
    expect(row.invitedAt).toBe("2026-08-10T12:00:00Z");
  });

  it("5. an invitation outranks collaborator membership", () => {
    // Someone can be a collaborator on a repo through a team while a direct
    // invitation is still outstanding. The outstanding invitation is the
    // actionable fact.
    const row = resolveInvitationRow(
      base({ invitations: [invite()], collaborators: ["jsmith"] })
    );
    expect(row.state).toBe("pending");
  });

  it("6. no invitation plus direct collaboration is accepted", () => {
    const row = resolveInvitationRow(base({ collaborators: ["jsmith"] }));
    expect(row.state).toBe("accepted");
    expect(row.invitationId).toBeNull();
  });

  it("7. an existing repo with neither invitation nor collaboration is not-invited", () => {
    expect(resolveInvitationRow(base()).state).toBe("not-invited");
  });

  it("an expired invitation that GitHub has dropped from the list degrades to not-invited", () => {
    // GitHub does not document whether expired invitations keep appearing in
    // the list endpoint. If they vanish, the row must land somewhere whose
    // offered action ("Invite") is still correct - never on a state that
    // claims the student was reached.
    expect(resolveInvitationRow(base({ invitations: [] })).state).toBe("not-invited");
  });
});

describe("resolveInvitationRow - an invitation is only ever this student's", () => {
  // The precedence table is evaluated per STUDENT. An implementation that
  // asks "does this repo have any expired invitation?" instead of "does this
  // repo have an expired invitation addressed to THIS student?" passes a
  // naive suite and mislabels every row on a repo that carries someone
  // else's stale invite.

  it("another student's EXPIRED invitation does not make this row expired", () => {
    const row = resolveInvitationRow(
      base({ invitations: [invite({ inviteeLogin: "someone-else", expired: true })] })
    );
    expect(row.state).toBe("not-invited");
  });

  it("another student's expired invitation does not disturb this student's pending one", () => {
    const row = resolveInvitationRow(
      base({
        invitations: [
          invite({ id: 1, inviteeLogin: "someone-else", expired: true }),
          invite({ id: 2, inviteeLogin: "jsmith", expired: false }),
        ],
      })
    );
    expect(row.state).toBe("pending");
    expect(row.invitationId).toBe(2);
  });

  it("another student's pending invitation does not hide this student's acceptance", () => {
    const row = resolveInvitationRow(
      base({
        invitations: [invite({ inviteeLogin: "someone-else" })],
        collaborators: ["jsmith"],
      })
    );
    expect(row.state).toBe("accepted");
  });

  it("another student being a collaborator does not make this row accepted", () => {
    const row = resolveInvitationRow(base({ collaborators: ["someone-else"] }));
    expect(row.state).toBe("not-invited");
  });
});

describe("resolveInvitationRow - expiry is computed, not just believed", () => {
  // GitHub's own UI has a long-standing defect where expired repository
  // invitations still render as pending. Repository invitations expire after
  // seven days, so age is checkable independently of the API's own flag and
  // must be, or this panel inherits the same bug.

  it("treats an invitation older than 7 days as expired even when expired is false", () => {
    const row = resolveInvitationRow(
      base({ invitations: [invite({ expired: false, createdAt: "2026-08-09T00:00:00Z" })] })
    );
    expect(row.state).toBe("expired");
  });

  it("still trusts the API's expired flag when the age says otherwise", () => {
    const row = resolveInvitationRow(
      base({ invitations: [invite({ expired: true, createdAt: "2026-08-16T23:00:00Z" })] })
    );
    expect(row.state).toBe("expired");
  });

  it("leaves an invitation just under 7 days old pending", () => {
    // 6 days and 23 hours old.
    const row = resolveInvitationRow(
      base({ invitations: [invite({ expired: false, createdAt: "2026-08-10T01:00:00Z" })] })
    );
    expect(row.state).toBe("pending");
  });

  it("expires an invitation exactly 7 days old", () => {
    const row = resolveInvitationRow(
      base({ invitations: [invite({ expired: false, createdAt: "2026-08-10T00:00:00Z" })] })
    );
    expect(row.state).toBe("expired");
  });

  it("reports expiresAt as createdAt plus 7 days for a pending row", () => {
    const row = resolveInvitationRow(
      base({ invitations: [invite({ createdAt: "2026-08-14T09:30:00Z" })] })
    );
    expect(row.state).toBe("pending");
    expect(row.expiresAt).toBe("2026-08-21T09:30:00.000Z");
  });

  it("leaves expiresAt null when there is no invitation", () => {
    expect(resolveInvitationRow(base({ collaborators: ["jsmith"] })).expiresAt).toBeNull();
  });

  it("does not read the clock itself - the same input at a later now expires", () => {
    // Same invitation, two different `now` values, two different answers.
    // A resolver calling Date.now() internally would return the same state
    // for both and this test would fail.
    const invitations = [invite({ expired: false, createdAt: "2026-08-16T00:00:00Z" })];
    const fresh = resolveInvitationRow(base({ invitations, now: NOW }));
    const later = resolveInvitationRow(
      base({ invitations, now: Date.parse("2026-08-24T00:00:00Z") })
    );
    expect(fresh.state).toBe("pending");
    expect(later.state).toBe("expired");
  });

  it("tolerates an unparseable createdAt without claiming expiry", () => {
    const row = resolveInvitationRow(
      base({ invitations: [invite({ expired: false, createdAt: "not a date" })] })
    );
    expect(row.state).toBe("pending");
    expect(row.expiresAt).toBeNull();
  });
});

describe("resolveInvitationRow - matching a student to an invitation", () => {
  it("matches case-insensitively", () => {
    const row = resolveInvitationRow(
      base({ username: "JSmith", invitations: [invite({ inviteeLogin: "jsmith" })] })
    );
    expect(row.state).toBe("pending");
  });

  it("strips a leading @ from the roster handle before matching", () => {
    // rosterToRows does NOT strip it (unlike parseRosterLines), so a roster
    // written "Smith, John | @jsmith" reaches this function with the @ intact.
    // GitHub logins never contain one, so without the strip this row would
    // report not-invited forever.
    const row = resolveInvitationRow(
      base({ username: "@jsmith", invitations: [invite({ inviteeLogin: "jsmith" })] })
    );
    expect(row.state).toBe("pending");
    expect(row.username).toBe("jsmith");
  });

  it("strips a leading @ before matching collaborators too", () => {
    const row = resolveInvitationRow(base({ username: "@jsmith", collaborators: ["JSmith"] }));
    expect(row.state).toBe("accepted");
  });

  it("ignores an invitation whose invitee is null (blank login)", () => {
    // The API schema makes `invitee` nullable; such a record can never be
    // attributed to a student.
    expect(resolveInvitationRow(base({ invitations: [invite({ inviteeLogin: "" })] })).state).toBe(
      "not-invited"
    );
  });

  it("does not match a blank roster handle against a blank invitee login", () => {
    const row = resolveInvitationRow(
      base({ username: "", invitations: [invite({ inviteeLogin: "" })] })
    );
    expect(row.state).toBe("no-username");
  });

  it("picks the expired invitation when a student somehow has two", () => {
    const row = resolveInvitationRow(
      base({
        invitations: [invite({ id: 1, expired: false }), invite({ id: 2, expired: true })],
      })
    );
    expect(row.state).toBe("expired");
    expect(row.invitationId).toBe(2);
  });
});

describe("resolveInvitationRow - row shape", () => {
  it("carries the owner-qualified repo and its github.com URL", () => {
    const row = resolveInvitationRow(base());
    expect(row.repo).toBe("my-org/cs101-smith-john");
    expect(row.repoUrl).toBe("https://github.com/my-org/cs101-smith-john");
  });

  it("carries whatever student name it was given, not a fixed one", () => {
    expect(resolveInvitationRow(base({ student: "Okafor, Ada" })).student).toBe("Okafor, Ada");
    expect(resolveInvitationRow(base({ student: "Zhao, Wei" })).student).toBe("Zhao, Wei");
  });

  it("labels every state with the agreed word", () => {
    // Colour is never the only signal, so each state has a word - and the
    // words are a contract, not the implementer's choice, because the summary
    // line and the status column must agree with each other.
    const cases: Array<[Partial<StudentRepoStatusInput>, string]> = [
      [{ error: "boom" }, "Unknown"],
      [{ username: "" }, "No username"],
      [{ repoExists: false }, "No repo yet"],
      [{ invitations: [invite({ expired: true })] }, "Expired"],
      [{ invitations: [invite()] }, "Pending"],
      [{ collaborators: ["jsmith"] }, "Accepted"],
      [{}, "Not invited"],
    ];
    for (const [over, label] of cases) {
      expect(resolveInvitationRow(base(over)).label).toBe(label);
    }
  });

  it("exposes the same labels through STATUS_LABELS, keyed by state", () => {
    // The component renders from this map rather than restating the words,
    // so the two can never drift.
    expect(STATUS_LABELS.error).toBe("Unknown");
    expect(STATUS_LABELS["no-username"]).toBe("No username");
    expect(STATUS_LABELS.missing).toBe("No repo yet");
    expect(STATUS_LABELS.expired).toBe("Expired");
    expect(STATUS_LABELS.pending).toBe("Pending");
    expect(STATUS_LABELS.accepted).toBe("Accepted");
    expect(STATUS_LABELS["not-invited"]).toBe("Not invited");
  });

  it("leaves invitationId and invitedAt null for every state without an invitation", () => {
    for (const over of [
      { collaborators: ["jsmith"] },
      { repoExists: false },
      { username: "" },
      { error: "boom" },
      {},
    ]) {
      const row = resolveInvitationRow(base(over));
      expect(row.invitationId).toBeNull();
      expect(row.invitedAt).toBeNull();
    }
  });

  it("leaves detail null when nothing went wrong", () => {
    expect(resolveInvitationRow(base()).detail).toBeNull();
  });
});

describe("summarizeInvitationRows", () => {
  const rowsFor = (states: Array<Partial<StudentRepoStatusInput>>) =>
    states.map((s, i) => resolveInvitationRow(base({ repo: `repo-${i}`, ...s })));

  it("counts each state", () => {
    const rows = rowsFor([
      { collaborators: ["jsmith"] },
      { collaborators: ["jsmith"] },
      { invitations: [invite()] },
      { invitations: [invite({ expired: true })] },
      {},
    ]);
    const summary = summarizeInvitationRows(rows);
    expect(summary.total).toBe(5);
    expect(summary.counts.accepted).toBe(2);
    expect(summary.counts.pending).toBe(1);
    expect(summary.counts.expired).toBe(1);
    expect(summary.counts["not-invited"]).toBe(1);
    expect(summary.counts.missing).toBe(0);
  });

  it("omits zero counts and orders segments accepted, pending, expired", () => {
    const rows = rowsFor([
      { collaborators: ["jsmith"] },
      { collaborators: ["jsmith"] },
      { invitations: [invite()] },
      { invitations: [invite({ expired: true })] },
    ]);
    expect(summarizeInvitationRows(rows).text).toBe("4 students - 2 accepted, 1 pending, 1 expired");
  });

  it("orders the remaining four states after the first three", () => {
    // Every state must be able to reach the summary line - a builder that
    // only knows about accepted/pending/expired would silently drop these.
    const rows = rowsFor([
      { collaborators: ["jsmith"] },
      { invitations: [invite()] },
      { invitations: [invite({ expired: true })] },
      {},
      { repoExists: false },
      { username: "" },
      { error: "boom" },
    ]);
    expect(summarizeInvitationRows(rows).text).toBe(
      "7 students - 1 accepted, 1 pending, 1 expired, 1 not invited, 1 no repo, 1 no username, 1 unknown"
    );
  });

  it("summarizes a fully accepted class without listing empty states", () => {
    const rows = rowsFor([{ collaborators: ["jsmith"] }, { collaborators: ["jsmith"] }]);
    expect(summarizeInvitationRows(rows).text).toBe("2 students - 2 accepted");
  });

  it("uses the singular form for one student", () => {
    expect(summarizeInvitationRows(rowsFor([{ collaborators: ["jsmith"] }])).text).toBe(
      "1 student - 1 accepted"
    );
  });

  it("reports an empty list without inventing counts", () => {
    const summary = summarizeInvitationRows([]);
    expect(summary.total).toBe(0);
    expect(summary.text).toBe("No students");
  });

  it("returns a count for every state, including the absent ones", () => {
    const counts = summarizeInvitationRows([]).counts;
    for (const state of [
      "error",
      "no-username",
      "missing",
      "expired",
      "pending",
      "accepted",
      "not-invited",
    ] as const) {
      expect(counts[state]).toBe(0);
    }
  });
});
