import { describe, expect, it } from "vitest";
import {
  buildAccountRows,
  describeStatusActor,
  sortAccountPeople,
  type AccountPersonInput,
  type StatusActor,
} from "./account-people-view";
import { ACCOUNT_ACTIONS } from "./account-admin-rules";
import { DISPLAY_NAME_MAX_LENGTH } from "./display-name";

/**
 * The pure view-model behind the owner's account list
 * (docs/multi-user-login-acceptance-criteria.md C1, C2, C7, GC2, GC7).
 *
 * WHY THIS IS A SEPARATE MODULE FROM THE PAGE. Every rule below is a
 * decision an owner acts on - whom to approve, whose access to revoke - and
 * this repo's vitest is node-environment and collects only test files ending
 * `.test.ts`, never `.test.tsx`, so NO component is ever rendered by the
 * suite. A rule that lives in JSX is a rule nothing can test. So the page
 * owns layout and copy and nothing else: every judgement worth being wrong
 * about lives here.
 *
 * THIS MODULE READS NO ENVIRONMENT. Like ./account-admin-rules.ts, it takes
 * `isAllowlisted` as data. The allowlist read happens once, server-side, in
 * the caller.
 */

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function person(overrides: Partial<AccountPersonInput> = {}): AccountPersonInput {
  return {
    id: OTHER_ID,
    email: "member@example.edu",
    displayName: "Member Name",
    role: "instructor",
    status: "active",
    createdAt: "2026-03-01T00:00:00.000Z",
    statusChangedAt: null,
    statusChangedBy: null,
    isAllowlisted: false,
    // Verified is the ordinary case for a real account; every existing
    // isAllowlisted: true fixture below relies on the override applying, so
    // the default must keep matching that. Tests for the allowlisted-but-
    // unverified case override this explicitly - see the GC2b group.
    emailVerified: true,
    ...overrides,
  };
}

function build(
  people: AccountPersonInput[],
  overrides: Partial<Parameters<typeof buildAccountRows>[1]> = {}
) {
  return buildAccountRows(people, {
    actorId: OWNER_ID,
    actorRole: "owner",
    effectiveOwnerCount: 2,
    actorEmailById: {},
    ...overrides,
  });
}

describe("GC2 - an allowlisted row displays what is TRUE, not what is stored", () => {
  /**
   * The owner meets their own row at the top of their own approval queue as a
   * pending instructor, because `requireAppOwner` performs no reconciliation
   * and the break-glass admits an allowlisted address without ever reading
   * its row. The stored values are not the truth for that account, so they
   * must not be what the list renders.
   */
  it("overrides a stored instructor/pending with owner/active", () => {
    const [row] = build([person({ role: "instructor", status: "pending", isAllowlisted: true })]);
    expect(row.effectiveRole).toBe("owner");
    expect(row.effectiveStatus).toBe("active");
  });

  it("keeps the stored values available, so the page can show the discrepancy", () => {
    // Hiding the stored value entirely would make the row a lie of a
    // different kind: an owner debugging why reconciliation has not run
    // needs to see that the database still says pending.
    const [row] = build([person({ role: "instructor", status: "pending", isAllowlisted: true })]);
    expect(row.storedRole).toBe("instructor");
    expect(row.storedStatus).toBe("pending");
    expect(row.storedDiffersFromEffective).toBe(true);
  });

  it("does not claim a discrepancy when the stored row already agrees", () => {
    const [row] = build([person({ role: "owner", status: "active", isAllowlisted: true })]);
    expect(row.storedDiffersFromEffective).toBe(false);
  });

  it("marks the row as owner-by-allowlist so the page can name the reason", () => {
    const [allowlisted] = build([person({ isAllowlisted: true })]);
    const [stored] = build([person({ role: "owner", status: "active", isAllowlisted: false })]);
    expect(allowlisted.ownership).toBe("allowlist");
    expect(stored.ownership).toBe("stored");
  });

  it("reports no ownership badge for an ordinary member", () => {
    const [row] = build([person()]);
    expect(row.ownership).toBe("none");
  });

  it("never overrides a NON-allowlisted row, whatever it stores", () => {
    const [row] = build([person({ role: "instructor", status: "pending", isAllowlisted: false })]);
    expect(row.effectiveRole).toBe("instructor");
    expect(row.effectiveStatus).toBe("pending");
  });
});

describe("GC2b - BUG 1 one layer up: the override requires verification too", () => {
  /**
   * `resolveAccess` (./access.ts) only grants `owner` through `OWNER_EMAILS`
   * when the address is ALSO verified - `isAllowlisted` alone is an
   * unconfirmed CLAIM on an address, most dangerously one somebody else
   * claimed by creating the account first, before its real owner ever
   * signed up. This group pins that the override (and the protection it
   * implies) requires both conditions, not one.
   */
  it("overrides a stored instructor/pending when the address is allowlisted AND verified", () => {
    const [row] = build([
      person({ role: "instructor", status: "pending", isAllowlisted: true, emailVerified: true }),
    ]);
    expect(row.effectiveRole).toBe("owner");
    expect(row.effectiveStatus).toBe("active");
    expect(row.ownership).toBe("allowlist");
  });

  it("does NOT override an allowlisted row whose email is unverified - renders the stored values", () => {
    const [row] = build([
      person({ role: "instructor", status: "pending", isAllowlisted: true, emailVerified: false }),
    ]);
    expect(row.effectiveRole).toBe("instructor");
    expect(row.effectiveStatus).toBe("pending");
    expect(row.storedDiffersFromEffective).toBe(false);
  });

  it("marks an unverified allowlisted row with its own ownership signal, not allowlist or none", () => {
    // Folding this into "allowlist" would crown an unverified claim; folding
    // it into "none" would hide that anything unusual is going on at all.
    // The page needs to warn about this row specifically.
    const [row] = build([person({ isAllowlisted: true, emailVerified: false })]);
    expect(row.ownership).toBe("allowlistUnverified");
    expect(row.ownership).not.toBe("allowlist");
    expect(row.ownership).not.toBe("none");
  });

  it("does not extend the allowlist's suspend/demote protection to an unverified row", () => {
    // The protection exists ONLY because reconciliation would otherwise
    // silently undo a suspend/demote on the next page load - and
    // reconciliation itself never touches an unverified row (it is gated on
    // the identical emailVerified check in app-users.ts). So an unverified
    // allowlisted row that is stored owner/active must be suspendable and
    // demotable like any ordinary owner row - refusing it would show the
    // operator an owner they cannot remove, for no reason that protects
    // anything.
    const [row] = build([
      person({ role: "owner", status: "active", isAllowlisted: true, emailVerified: false }),
    ]);
    expect(row.actions.suspend.allowed).toBe(true);
    expect(row.actions.demote.allowed).toBe(true);
  });
});

describe("C1 - the display name is self-asserted and is clamped AT RENDER", () => {
  it("clamps a name that never passed through our own form", () => {
    // `user_metadata` is writable straight from the browser with the public
    // anon key, so a value can reach `display_name` without validateSignup
    // ever running. The stored clamp is not sufficient on its own.
    const rtlOverride = String.fromCodePoint(0x202e);
    const [row] = build([person({ displayName: `Alice${rtlOverride}Bob` })]);
    expect(row.displayName).toBe("AliceBob");
    expect(row.displayName).not.toContain(rtlOverride);
  });

  it("bounds a very long name", () => {
    const [row] = build([person({ displayName: "a".repeat(DISPLAY_NAME_MAX_LENGTH + 50) })]);
    expect([...row.displayName].length).toBe(DISPLAY_NAME_MAX_LENGTH);
  });

  it("is total for a null or missing name", () => {
    // `row.display_name` is `string | null` in production - `undefined` is
    // not a shape `mapAppUserRow` can ever emit. Kept anyway, deliberately:
    // `clampDisplayName` is a totality guarantee about ITS OWN input type
    // (`unknown`-ish in practice, per its own doc comment), not something
    // scoped to what this one caller happens to pass today, and the cost of
    // pinning that here is one line.
    expect(build([person({ displayName: null })])[0].displayName).toBe("");
    expect(build([person({ displayName: undefined as never })])[0].displayName).toBe("");
  });

  it("never substitutes the email when the name is empty", () => {
    // The page decides what to show in place of a blank name. Quietly
    // returning the email here would make two different columns render the
    // same value and hide that the account has no name at all.
    const [row] = build([person({ displayName: "", email: "someone@example.edu" })]);
    expect(row.displayName).toBe("");
    expect(row.email).toBe("someone@example.edu");
  });
});

describe("C7 - every action is attributable, and reconciliation is not a person", () => {
  it("reports a null actor as the system, never as somebody", () => {
    expect(describeStatusActor(null, {})).toEqual({ kind: "system" });
  });

  it("resolves a known actor id to their email", () => {
    expect(describeStatusActor(OWNER_ID, { [OWNER_ID]: "owner@example.edu" })).toEqual({
      kind: "person",
      email: "owner@example.edu",
    });
  });

  it("reports an unresolvable actor as unknown", () => {
    // A uuid rendered in an owner-facing list is not an attribution, it is
    // an internal identifier that reads like one. The discriminated union
    // exists so the page physically cannot print it by accident.
    expect(describeStatusActor(OWNER_ID, {})).toEqual({ kind: "unknown" });
  });

  it("cannot leak a raw account id through any branch of the union", () => {
    // A `toEqual` on one branch cannot prove the id never leaks through a
    // DIFFERENT branch - it only pins the branch it was given. The property
    // the union's shape actually exists to guarantee is that NO branch
    // carries an id, so this walks all three `describeStatusActor` can
    // produce (system, person, unknown) and checks each one directly,
    // rather than relying on an assertion a passing `toEqual` already
    // implies.
    const knownEmail = "owner@example.edu";
    const branches: StatusActor[] = [
      describeStatusActor(null, {}),
      describeStatusActor(OWNER_ID, { [OWNER_ID]: knownEmail }),
      describeStatusActor(OWNER_ID, {}),
    ];
    for (const actor of branches) {
      expect(JSON.stringify(actor)).not.toContain(OWNER_ID);
    }
  });

  it("treats a blank or whitespace actor id as the system", () => {
    expect(describeStatusActor("", {})).toEqual({ kind: "system" });
    expect(describeStatusActor("   ", {})).toEqual({ kind: "system" });
  });

  it("carries the actor onto the row", () => {
    const [row] = build([person({ statusChangedBy: OWNER_ID })], {
      actorEmailById: { [OWNER_ID]: "owner@example.edu" },
    });
    expect(row.statusChangedByActor).toEqual({ kind: "person", email: "owner@example.edu" });
  });

  it("carries a non-null statusChangedAt through to the row", () => {
    // Present on the input and on the row, but nothing exercised a
    // non-null value reaching the output before this test.
    const [row] = build([person({ statusChangedAt: "2026-04-01T00:00:00.000Z" })]);
    expect(row.statusChangedAt).toBe("2026-04-01T00:00:00.000Z");
  });

  it("distinguishes a row that has never changed from one reconciliation changed", () => {
    // Both used to render as `{ kind: "system" }`: a brand-new pending
    // account has statusChangedAt AND statusChangedBy both null, which is
    // indistinguishable from a genuine unattributed change unless something
    // also looks at statusChangedAt. Attributing an event to "the system"
    // when nothing has ever happened is exactly the false attribution this
    // module exists to prevent.
    const [neverChanged] = build([person({ statusChangedAt: null, statusChangedBy: null })]);
    expect(neverChanged.statusChangedByActor).toEqual({ kind: "never" });

    const [systemChanged] = build([
      person({ statusChangedAt: "2026-01-01T00:00:00.000Z", statusChangedBy: null }),
    ]);
    expect(systemChanged.statusChangedByActor).toEqual({ kind: "system" });
  });
});

describe("GC7 - the signup timestamp is the migration timestamp for backfilled rows", () => {
  it("names the field for what it actually holds", () => {
    // The backfill inserts no created_at, so every pre-existing row shares
    // the instant the migration ran. A field called `signedUpAt` would make
    // the page state something false; this name makes honest copy the path
    // of least resistance.
    const [row] = build([person()]);
    expect(row).toHaveProperty("accountRecordCreatedAt");
    expect(row).not.toHaveProperty("signedUpAt");
    expect(row.accountRecordCreatedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  // There used to be a test here for a null `createdAt` passing through as
  // a null `accountRecordCreatedAt`. `app_users.created_at` is `timestamptz
  // not null default now()` (the create-table migration) and
  // `mapAppUserRow` types it `string`, never `string | null` - no
  // production caller can produce that input, so `AccountPersonInput.
  // createdAt` was narrowed to `string` and that test was deleted rather
  // than kept exercising a shape nothing can ever emit.
});

describe("C1 - pending first, then newest first", () => {
  const pendingOld = person({ id: "a", status: "pending", createdAt: "2026-01-01T00:00:00.000Z" });
  const pendingNew = person({ id: "b", status: "pending", createdAt: "2026-05-01T00:00:00.000Z" });
  const activeNew = person({ id: "c", status: "active", createdAt: "2026-06-01T00:00:00.000Z" });
  const suspended = person({ id: "d", status: "suspended", createdAt: "2026-04-01T00:00:00.000Z" });

  it("puts every pending row above every non-pending row", () => {
    const ids = sortAccountPeople([activeNew, pendingOld, suspended, pendingNew]).map((p) => p.id);
    expect(ids.slice(0, 2).sort()).toEqual(["a", "b"]);
  });

  it("orders newest first within a group", () => {
    const ids = sortAccountPeople([pendingOld, pendingNew]).map((p) => p.id);
    expect(ids).toEqual(["b", "a"]);
  });

  it("is deterministic when timestamps tie - which the backfill guarantees", () => {
    // Every backfilled row shares one instant, so a sort with no tiebreak
    // reorders the list between renders and moves a row out from under a
    // click. The tiebreak must be total and stable.
    const same = "2026-02-02T00:00:00.000Z";
    const a = person({ id: "aaa", email: "a@example.edu", createdAt: same });
    const b = person({ id: "bbb", email: "b@example.edu", createdAt: same });
    const c = person({ id: "ccc", email: "c@example.edu", createdAt: same });
    const first = sortAccountPeople([c, a, b]).map((p) => p.id);
    const second = sortAccountPeople([b, c, a]).map((p) => p.id);
    expect(first).toEqual(second);
  });

  it("tiebreaks on id even when email also ties, proving id is the actual key", () => {
    // The test above gives all three fixtures distinct emails as well as
    // distinct ids, so a comparator that (incorrectly) tiebreaks on email
    // instead of id would pass it identically - it never proves id is what
    // is actually being compared. Forcing email to tie too (including one
    // null, since email is nullable) leaves id as the only thing left to
    // disambiguate. Deliberately NOT asserting which order results - only
    // that both input orders agree, per this suite's own rule about not
    // pinning the spelling.
    const same = "2026-02-02T00:00:00.000Z";
    const a = person({ id: "aaa", email: "same@example.edu", createdAt: same });
    const b = person({ id: "bbb", email: "same@example.edu", createdAt: same });
    const c = person({ id: "ccc", email: null, createdAt: same });
    const first = sortAccountPeople([c, a, b]).map((p) => p.id);
    const second = sortAccountPeople([b, c, a]).map((p) => p.id);
    expect(first).toEqual(second);
  });

  it("does not mutate the array it is given", () => {
    const input = [activeNew, pendingOld];
    const before = input.map((p) => p.id);
    sortAccountPeople(input);
    expect(input.map((p) => p.id)).toEqual(before);
  });
});

describe("C2 - a refused control is DISABLED WITH ITS REASON, never enabled-then-rejected", () => {
  it("carries a verdict for every one of the five actions on every row", () => {
    const [row] = build([person()]);
    for (const action of ACCOUNT_ACTIONS) {
      expect(row.actions[action], `${action} has no verdict`).toBeDefined();
    }
    expect(Object.keys(row.actions).sort()).toEqual([...ACCOUNT_ACTIONS].sort());
  });

  it("gives a non-empty reason on every refusal, because the reason is rendered", () => {
    const rows = build([
      person({ status: "pending" }),
      person({ id: OWNER_ID, status: "active", role: "owner" }),
      person({ isAllowlisted: true }),
    ]);
    for (const row of rows) {
      for (const action of ACCOUNT_ACTIONS) {
        const verdict = row.actions[action];
        if (!verdict.allowed) {
          expect(
            verdict.reason.trim().length,
            `${action} refused with an empty reason`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("defers to account-admin-rules rather than re-deriving - all four self-action guards stay refused", () => {
    // account-admin-rules guards FOUR self-actions, not just suspend: the
    // finding they exist for is that approving or promoting your own row
    // converts a freely-revocable, allowlist-derived ownership into a
    // STORED one that survives the address being removed from OWNER_EMAILS
    // later. Pinning only suspend left the other three entirely untested.
    const [own] = build([person({ id: OWNER_ID, role: "owner", status: "active" })]);
    expect(own.actions.suspend.allowed).toBe(false);
    expect(own.actions.demote.allowed).toBe(false);

    // approve/promote need a starting state where they would otherwise be
    // ALLOWED (pending/instructor) - otherwise a pass could just as easily
    // mean "refused by the ordinary starting-state check" as "refused by
    // the self-action guard", and would prove nothing about the guard
    // itself.
    const [ownPending] = build([person({ id: OWNER_ID, role: "instructor", status: "pending" })]);
    expect(ownPending.actions.approve.allowed).toBe(false);
    expect(ownPending.actions.promote.allowed).toBe(false);
  });

  it("does not guard restore against the actor's own row - it only ever moves access forward", () => {
    // restore is deliberately excluded from the self-action guard: it only
    // ever transitions suspended -> active, so an owner restoring their own
    // suspended row is consistent rather than dangerous, unlike the other
    // four which can hand a revocable ownership a permanent one.
    const [own] = build([person({ id: OWNER_ID, role: "owner", status: "suspended" })]);
    expect(own.actions.restore.allowed).toBe(true);
  });

  it("refuses suspend and demote on an allowlisted row (C2c)", () => {
    const [row] = build([person({ role: "owner", status: "active", isAllowlisted: true })]);
    expect(row.actions.suspend.allowed).toBe(false);
    expect(row.actions.demote.allowed).toBe(false);
  });

  it("marks the acting owner's own row, so the page can label it", () => {
    const rows = build([person({ id: OWNER_ID }), person({ id: OTHER_ID })]);
    expect(rows.find((r) => r.id === OWNER_ID)?.isSelf).toBe(true);
    expect(rows.find((r) => r.id === OTHER_ID)?.isSelf).toBe(false);
  });
});

describe("GC5 - the owner count fed to the rules is the EFFECTIVE one", () => {
  it("passes the supplied effective count through to the last-owner rule", () => {
    // countActiveOwners alone reads zero while an allowlisted owner who has
    // never signed in exists, which would refuse every demotion. The caller
    // supplies the union; this module must not substitute its own count.
    const soleOwner = person({ id: OTHER_ID, role: "owner", status: "active" });
    const withOne = build([soleOwner], { effectiveOwnerCount: 1 })[0];
    const withTwo = build([soleOwner], { effectiveOwnerCount: 2 })[0];
    expect(withOne.actions.demote.allowed).toBe(false);
    expect(withTwo.actions.demote.allowed).toBe(true);
  });
});

describe("canPerformAccountAction receives the STORED state, never the effective one", () => {
  /**
   * This module's own doc comment says `canPerformAccountAction` must be
   * given the row's STORED role/status, never the allowlist-overridden
   * ones. Every fixture elsewhere in this file either has stored ==
   * effective, or only asserts on display fields, or (the near miss) checks
   * only that a refusal carries a non-empty reason - which both the correct
   * and the wrong implementation satisfy identically. These two tests use a
   * row where stored and effective genuinely disagree on the STARTING STATE
   * an action requires, so only one implementation can pass both:
   * - approve requires status "pending" (stored) vs "active" (effective).
   * - restore requires status "suspended" (stored) vs "active" (effective).
   * Flipping the implementation to pass the effective role/status instead
   * of the stored ones must make both of these fail - that flip-and-confirm
   * was run by hand as part of landing this test; see this task's report.
   */
  it("approves from the STORED pending status, not the allowlist-overridden active one", () => {
    const [row] = build([
      person({ role: "instructor", status: "pending", isAllowlisted: true, emailVerified: true }),
    ]);
    // Stored pending -> approve allowed. Effective (owner/active, via the
    // override) -> approve would be refused, since approve requires pending.
    expect(row.actions.approve.allowed).toBe(true);
  });

  it("restores from the STORED suspended status, not the allowlist-overridden active one", () => {
    const [row] = build([
      person({ role: "owner", status: "suspended", isAllowlisted: true, emailVerified: true }),
    ]);
    // Stored suspended -> restore allowed. Effective (owner/active, via the
    // override) -> restore would be refused, since restore requires suspended.
    expect(row.actions.restore.allowed).toBe(true);
  });
});

describe("the view model is honest about what it is", () => {
  it("returns one row per input, dropping nothing", () => {
    const rows = build([person({ id: "a" }), person({ id: "b" }), person({ id: "c" })]);
    expect(rows).toHaveLength(3);
  });

  it("handles a row with no email at all", () => {
    // app_users.email is nullable - a phone or anonymous sign-in has none.
    const [row] = build([person({ email: null })]);
    expect(row.email).toBeNull();
    expect(row.actions.approve).toBeDefined();
  });

  it("builds an empty list without throwing", () => {
    expect(build([])).toEqual([]);
  });
});
