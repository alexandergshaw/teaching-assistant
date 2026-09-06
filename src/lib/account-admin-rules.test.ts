import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ACTIONS,
  canPerformAccountAction,
  type AccountActionContext,
} from "./account-admin-rules";

/**
 * Contract for the admin surface's guard rules (AC C2, C2b, C2c, AD7).
 *
 * WHY THIS MODULE READS NO ENVIRONMENT, WHICH IS THE WHOLE POINT AND WAS
 * WRONG IN THE FIRST DRAFT. The same predicate has to run in two places: the
 * server action, where it is the actual control, and the client, where it
 * decides whether a button renders disabled with its reason visible. This
 * repo's UX standard is "disabled with the reason visible, not enabled then
 * rejected", and that is only implementable if one rule serves both.
 *
 * The first draft of this file set `process.env.OWNER_EMAILS` and asserted
 * the predicate honoured it - which would have forced the implementation to
 * read that variable. Next inlines only `NEXT_PUBLIC_`-prefixed variables, so
 * in a browser bundle that read is `undefined`, which lands on the permissive
 * "no allowlist configured, so nothing is protected" branch. The button would
 * have rendered ENABLED for precisely the account C2c exists to protect, and
 * the server would then have refused - the enabled-then-rejected shape the
 * standard forbids, arrived at silently, with every test green.
 *
 * This repo has already paid for that lesson once: `signup-rules.ts` carries
 * `import "server-only"` for the identical reason. That fix is unavailable
 * here, because a server-only module cannot render a disabled button.
 *
 * So the allowlist decision is made ONCE, server-side, and travels in the
 * context as `target.isAllowlisted`. The predicate is then genuinely pure and
 * genuinely isomorphic.
 *
 * A SECOND THING THE CONTEXT SHAPE IMPLIES, enforced at the action rather than
 * here: every field below is a server-derivable fact, so the server action
 * must take an ACCOUNT ID AND NOTHING ELSE, and build this context itself. An
 * action that accepts a caller-supplied context is trivially defeated - pass
 * `activeOwnerCount: 99` and the last-owner rule evaporates; pass
 * `isAllowlisted: false` and C2c's refusal never fires.
 */

const ctx = (over: Partial<AccountActionContext> = {}): AccountActionContext => ({
  actorRole: "owner",
  actorId: "actor-1",
  target: {
    id: "target-1",
    email: "dana@example.edu" as string | null,
    role: "instructor",
    status: "pending",
    isAllowlisted: false,
    ...(over.target ?? {}),
  },
  activeOwnerCount: 2,
  ...over,
});

const target = (over: Partial<AccountActionContext["target"]>) => ctx({ target: over as never });

describe("canPerformAccountAction - it reads no ambient state", () => {
  it("gives the same answer regardless of any environment variable", () => {
    // If this ever fails, the rule has grown an env read and the client half
    // of the UX contract is silently broken. See the header.
    const saved = process.env.OWNER_EMAILS;
    try {
      const input = target({ email: "boss@example.edu", isAllowlisted: true, status: "active" });
      process.env.OWNER_EMAILS = "boss@example.edu";
      const withEnv = canPerformAccountAction("suspend", input);
      delete process.env.OWNER_EMAILS;
      const withoutEnv = canPerformAccountAction("suspend", input);
      expect(withEnv).toEqual(withoutEnv);
    } finally {
      if (saved === undefined) delete process.env.OWNER_EMAILS;
      else process.env.OWNER_EMAILS = saved;
    }
  });

  it("is a pure function of its inputs", () => {
    const input = ctx();
    expect(canPerformAccountAction("approve", input)).toEqual(
      canPerformAccountAction("approve", input)
    );
  });
});

describe("canPerformAccountAction - who may act at all", () => {
  it("refuses every action to a non-owner actor", () => {
    for (const action of ACCOUNT_ACTIONS) {
      expect(
        canPerformAccountAction(action, ctx({ actorRole: "instructor" })).allowed,
        `instructor must not be able to ${action}`
      ).toBe(false);
    }
  });

  it("covers every action in the exported list, with no gaps", () => {
    expect([...ACCOUNT_ACTIONS].sort()).toEqual(
      ["approve", "demote", "promote", "restore", "suspend"].sort()
    );
    for (const action of ACCOUNT_ACTIONS) {
      expect(typeof canPerformAccountAction(action, ctx()).allowed).toBe("boolean");
    }
  });

  it("always explains a refusal", () => {
    const verdict = canPerformAccountAction("suspend", ctx({ actorRole: "instructor" }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason.trim().length).toBeGreaterThan(0);
  });
});

describe("canPerformAccountAction - the ordinary paths", () => {
  it("approves a pending account", () => {
    expect(canPerformAccountAction("approve", ctx()).allowed).toBe(true);
  });

  it("does not offer approve for an account that is already active", () => {
    expect(canPerformAccountAction("approve", target({ status: "active" })).allowed).toBe(false);
  });

  it("restores a suspended account", () => {
    expect(canPerformAccountAction("restore", target({ status: "suspended" })).allowed).toBe(true);
  });

  it("promotes an active instructor", () => {
    expect(canPerformAccountAction("promote", target({ status: "active" })).allowed).toBe(true);
  });

  it("suspends an ordinary instructor even when only one owner remains", () => {
    // The last-owner rule protects OWNERS, not headcount.
    expect(
      canPerformAccountAction(
        "suspend",
        ctx({ activeOwnerCount: 1, target: { ...ctx().target, status: "active" } as never })
      ).allowed
    ).toBe(true);
  });
});

describe("canPerformAccountAction - an owner acting on their OWN row", () => {
  // Nothing else forbids this. Not the database: the belt-and-braces trigger
  // fires only when `auth.uid() = old.id`, and these mutations run through the
  // service-role client, which carries no JWT, so `auth.uid()` is null and the
  // trigger never sees them. Not the last-owner rule either - that catches
  // only the case where you are the LAST owner.
  const self = (over: Partial<AccountActionContext["target"]> = {}) =>
    ctx({
      activeOwnerCount: 3,
      actorId: "actor-1",
      target: {
        id: "actor-1",
        email: "owner@example.edu",
        role: "owner",
        status: "active",
        isAllowlisted: false,
        ...over,
      } as never,
    });

  it("refuses to let an owner suspend themselves", () => {
    const verdict = canPerformAccountAction("suspend", self());
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason.trim().length).toBeGreaterThan(0);
  });

  it("refuses to let an owner demote themselves", () => {
    expect(canPerformAccountAction("demote", self()).allowed).toBe(false);
  });

  it("refuses even when other owners remain - this is not the last-owner rule", () => {
    expect(canPerformAccountAction("demote", { ...self(), activeOwnerCount: 9 }).allowed).toBe(
      false
    );
  });

  it("still allows acting on someone ELSE with the same shape", () => {
    expect(
      canPerformAccountAction("demote", {
        ...self(),
        target: { ...self().target, id: "someone-else" },
      }).allowed
    ).toBe(true);
  });
});

describe("canPerformAccountAction - the last active owner", () => {
  const lastOwner = () =>
    ctx({
      activeOwnerCount: 1,
      actorId: "someone-else",
      target: {
        id: "the-only-owner",
        email: "boss@example.edu",
        role: "owner",
        status: "active",
        isAllowlisted: false,
      } as never,
    });

  it("refuses to suspend the only remaining active owner", () => {
    const verdict = canPerformAccountAction("suspend", lastOwner());
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason.trim().length).toBeGreaterThan(0);
  });

  it("refuses to demote the only remaining active owner", () => {
    expect(canPerformAccountAction("demote", lastOwner()).allowed).toBe(false);
  });

  it("allows demoting an owner while a second active owner remains", () => {
    expect(
      canPerformAccountAction("demote", { ...lastOwner(), activeOwnerCount: 2 }).allowed
    ).toBe(true);
  });

  it("refuses when the count is zero or nonsense, rather than opening up", () => {
    // A miscounted or unsupplied total must not read as "plenty of owners".
    for (const activeOwnerCount of [0, -1, Number.NaN]) {
      expect(
        canPerformAccountAction("demote", { ...lastOwner(), activeOwnerCount }).allowed,
        `count ${activeOwnerCount}`
      ).toBe(false);
    }
  });
});

describe("canPerformAccountAction - an allowlisted account cannot be suspended or demoted", () => {
  // The break-glass resolves an OWNER_EMAILS address to `owner` WITHOUT
  // reading the row, and reconciliation rewrites the row on that account's
  // next request. So the control would write the database, report success and
  // change nothing - while the provider-level ban DOES take effect, leaving
  // the list showing `active` for an account that cannot sign in.
  const allowlisted = (over: Partial<AccountActionContext["target"]> = {}) =>
    ctx({
      activeOwnerCount: 3,
      target: {
        id: "target-1",
        email: "boss@example.edu",
        role: "owner",
        status: "active",
        isAllowlisted: true,
        ...over,
      } as never,
    });

  it("refuses suspend", () => {
    const verdict = canPerformAccountAction("suspend", allowlisted());
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason.trim().length).toBeGreaterThan(0);
  });

  it("refuses demote", () => {
    expect(canPerformAccountAction("demote", allowlisted()).allowed).toBe(false);
  });

  it("does not refuse an account that is merely an owner without being allowlisted", () => {
    expect(
      canPerformAccountAction("demote", allowlisted({ isAllowlisted: false })).allowed
    ).toBe(true);
  });

  it("still allows approve and restore for an allowlisted account", () => {
    // Those move it TOWARDS access, which the break-glass already grants, so
    // they are consistent rather than futile.
    expect(
      canPerformAccountAction("approve", allowlisted({ status: "pending" })).allowed
    ).toBe(true);
    expect(
      canPerformAccountAction("restore", allowlisted({ status: "suspended" })).allowed
    ).toBe(true);
  });
});

describe("canPerformAccountAction - the cells an earlier draft left unspecified", () => {
  // Each of these defaulted to the WRONG behaviour when unstated.
  it("refuses suspend on an account that is not active", () => {
    // Suspending a PENDING row is the trap: there is no "previous status"
    // column, so restore writes `active` - meaning restore APPROVES someone
    // who was never approved, while the owner believes they undid a mistake.
    for (const status of ["pending", "suspended"] as const) {
      expect(
        canPerformAccountAction("suspend", target({ status })).allowed,
        `suspend on ${status}`
      ).toBe(false);
    }
  });

  it("refuses promote on an account that is not active", () => {
    // A promoted pending account renders as "Owner" while being unable to
    // sign in, and a later restore silently confers ownership.
    for (const status of ["pending", "suspended"] as const) {
      expect(
        canPerformAccountAction("promote", target({ status })).allowed,
        `promote on ${status}`
      ).toBe(false);
    }
  });

  it("refuses promote on someone who is already an owner", () => {
    expect(
      canPerformAccountAction("promote", target({ role: "owner", status: "active" })).allowed
    ).toBe(false);
  });

  it("refuses demote on someone who is not an owner", () => {
    expect(
      canPerformAccountAction("demote", target({ role: "instructor", status: "active" })).allowed
    ).toBe(false);
  });

  it("refuses restore on an account that is not suspended", () => {
    for (const status of ["pending", "active"] as const) {
      expect(
        canPerformAccountAction("restore", target({ status })).allowed,
        `restore on ${status}`
      ).toBe(false);
    }
  });
});

describe("canPerformAccountAction - the owner cannot let themselves in", () => {
  // The owner's OWN row is very often pending/instructor, because the
  // break-glass admits them from the allowlist without ever reading it and
  // the owner-only guard performs no reconciliation. So their own row appears
  // in their own approval queue - and approving or promoting it converts an
  // allowlist-derived, revocable ownership into a stored one that survives
  // the address being removed from OWNER_EMAILS.
  const ownRow = (over: Partial<AccountActionContext["target"]> = {}) =>
    ctx({
      actorId: "actor-1",
      target: {
        id: "actor-1",
        email: "boss@example.edu",
        role: "instructor",
        status: "pending",
        isAllowlisted: true,
        ...over,
      } as never,
    });

  it("refuses approve on the actor's own row", () => {
    const verdict = canPerformAccountAction("approve", ownRow());
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason.trim().length).toBeGreaterThan(0);
  });

  it("refuses promote on the actor's own row", () => {
    expect(
      canPerformAccountAction("promote", ownRow({ role: "instructor", status: "active" })).allowed
    ).toBe(false);
  });

  it("still allows approving someone else who is pending", () => {
    expect(
      canPerformAccountAction("approve", ownRow({ id: "somebody-else", isAllowlisted: false }))
        .allowed
    ).toBe(true);
  });
});

describe("canPerformAccountAction - a null email", () => {
  // app_users.email is nullable on purpose: a phone or anonymous account has
  // none, and the migration explains at length why forcing it not-null would
  // turn every such signup into a rolled-back auth insert.
  it("handles a target with no email at all", () => {
    const verdict = canPerformAccountAction(
      "suspend",
      target({ email: null, role: "instructor", status: "active" })
    );
    expect(typeof verdict.allowed).toBe("boolean");
  });

  it("treats a null-email account as ordinary and suspendable", () => {
    expect(
      canPerformAccountAction(
        "suspend",
        target({ email: null, role: "instructor", status: "active", isAllowlisted: false })
      ).allowed
    ).toBe(true);
  });
});
