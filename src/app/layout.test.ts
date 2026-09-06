import { describe, expect, it } from "vitest";
import { parseAccessDecisionHeader } from "./layout";
import type { AccessDecision } from "@/lib/access";

/**
 * Coverage for parseAccessDecisionHeader - the pure, FAIL-CLOSED parser that
 * turns the request gate's ACCESS_DECISION_HEADER value (src/lib/supabase/
 * proxy.ts's ACCESS_DECISION_HEADER, stamped by updateSession) into an
 * AccessDecision for the root layout.
 *
 * This replaces resolveViewerAccessDecision, which used to independently
 * RECOMPUTE the same decision in the root layout via a second getUser() call
 * plus a second app_users read - on every single request, since the root
 * layout wraps every route. See docs/REGRESSION.md and this repo's own
 * "Never stall the loop"/AC-loop history for that duplicate-read problem;
 * this file only pins the NEW parser's own contract.
 *
 * No component is rendered here - this repo's vitest is node-environment and
 * collects only src/**\/*.test.ts (never .tsx), so a rendered assertion would
 * never run at all. parseAccessDecisionHeader is exported from layout.tsx
 * specifically so this can be tested without rendering anything or invoking
 * next/headers at all - importing "./layout" here never calls RootLayout
 * itself (only its default export does that), so this suite never touches a
 * request-scoped API.
 *
 * THE HEADER IS ATTACKER-CONTROLLED. This suite is not trying to prove the
 * parser can tell a genuine gate-produced value apart from a client-typed
 * one - it cannot, and parseAccessDecisionHeader's own doc comment explains
 * why that is fine (the value only ever affects a nav-link's visibility, not
 * any actual access boundary). What this suite pins is narrower and more
 * important for THIS function specifically: every string that is not
 * EXACTLY one of the six current AccessDecision literals - absent,
 * malformed, differently-cased, or merely resembling a real value - must fail
 * closed to the same non-owner default, with no exception.
 */

const ALL_DECISIONS: AccessDecision[] = [
  "anonymous",
  "pending",
  "suspended",
  "unavailable",
  "active",
  "owner",
];

describe("parseAccessDecisionHeader - the six real values pass through unchanged", () => {
  it("returns each AccessDecision literal exactly as given", () => {
    for (const decision of ALL_DECISIONS) {
      expect(parseAccessDecisionHeader(decision)).toBe(decision);
    }
  });

  it("returns 'owner' for a header that literally says 'owner' - even though this parser cannot tell a value the gate actually produced apart from one a client typed by hand", () => {
    // This is the case the task's own security review singled out: a client
    // can send `x-ta-access-decision: owner` itself, and on a route this
    // parser has no way to verify was ever seen by the gate, that string
    // reaches here completely unfiltered. The parser's contract is only
    // "is this syntactically one of the six literals" - it deliberately does
    // NOT (and cannot) prove provenance. See parseAccessDecisionHeader's own
    // doc comment for why that is safe: the returned value only ever feeds
    // TopBar's shouldShowOwnerNavEntry, a nav-link VISIBILITY check, never
    // the real access boundary (requireAppOwner() on the server, plus the
    // gate's own redirect - neither of which ever calls this function).
    expect(parseAccessDecisionHeader("owner")).toBe("owner");
  });
});

describe("parseAccessDecisionHeader - fails closed on anything else", () => {
  it("fails closed on a missing header (null, as Headers.get returns for an absent key)", () => {
    expect(parseAccessDecisionHeader(null)).toBe("anonymous");
  });

  it("fails closed on undefined", () => {
    expect(parseAccessDecisionHeader(undefined)).toBe("anonymous");
  });

  it("fails closed on the empty string", () => {
    expect(parseAccessDecisionHeader("")).toBe("anonymous");
  });

  it("fails closed on whitespace, rather than trimming and re-checking", () => {
    // A trim-then-match implementation would accept " owner " - this parser
    // must not massage the value at all, only accept it verbatim or refuse
    // it.
    expect(parseAccessDecisionHeader(" owner")).toBe("anonymous");
    expect(parseAccessDecisionHeader("owner ")).toBe("anonymous");
    expect(parseAccessDecisionHeader("\towner")).toBe("anonymous");
  });

  it("fails closed on a different-case spelling of a real literal", () => {
    expect(parseAccessDecisionHeader("Owner")).toBe("anonymous");
    expect(parseAccessDecisionHeader("OWNER")).toBe("anonymous");
    expect(parseAccessDecisionHeader("Active")).toBe("anonymous");
  });

  it("fails closed on a value that is merely a substring or superstring of a real literal", () => {
    for (const near of ["own", "owners", "ownerx", "xowner", "activ", "actives"]) {
      expect(parseAccessDecisionHeader(near), `${near} must not parse`).toBe("anonymous");
    }
  });

  it("fails closed on an arbitrary string that is not any known decision", () => {
    expect(parseAccessDecisionHeader("admin")).toBe("anonymous");
    expect(parseAccessDecisionHeader("true")).toBe("anonymous");
    expect(parseAccessDecisionHeader("null")).toBe("anonymous");
    expect(parseAccessDecisionHeader("[object Object]")).toBe("anonymous");
  });

  it("fails closed on a value that only coincidentally shares a prototype-chain property name", () => {
    // A naive `raw in KNOWN_ACCESS_DECISIONS` (or a plain object without a
    // hasOwnProperty guard) can be tricked by an inherited Object.prototype
    // member - this must not resolve as a known decision.
    expect(parseAccessDecisionHeader("toString")).toBe("anonymous");
    expect(parseAccessDecisionHeader("constructor")).toBe("anonymous");
    expect(parseAccessDecisionHeader("hasOwnProperty")).toBe("anonymous");
    expect(parseAccessDecisionHeader("__proto__")).toBe("anonymous");
  });

  it("is total for non-string input a malformed request could still hand it", () => {
    expect(parseAccessDecisionHeader(42 as never)).toBe("anonymous");
    expect(parseAccessDecisionHeader({} as never)).toBe("anonymous");
    expect(parseAccessDecisionHeader(["owner"] as never)).toBe("anonymous");
    expect(parseAccessDecisionHeader(true as never)).toBe("anonymous");
  });
});
