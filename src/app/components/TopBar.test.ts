import { describe, expect, it } from "vitest";
import { shouldShowOwnerNavEntry } from "./TopBar";
import type { AccessDecision } from "@/lib/access";

/**
 * Coverage for shouldShowOwnerNavEntry (AC C4): the pure, DISCOVERABILITY-ONLY
 * rule that decides whether TopBar draws the owner-only "Accounts" entry
 * (-> /account/people). This is NOT a test of the access control - that
 * boundary is requireAppOwner() on the server (src/lib/supabase/auth.ts),
 * covered elsewhere and untouched by this file. This suite only pins: given
 * a decision, is the entry shown.
 *
 * No component is rendered here - this repo's vitest is node-environment and
 * collects only src/**\/*.test.ts (never .tsx), so a rendered assertion would
 * never run at all (see docs/REGRESSION.md entry 168 and this repo's own
 * AC + Sonnet/Opus loop notes). shouldShowOwnerNavEntry is exported from
 * TopBar.tsx specifically so this can be tested without rendering anything.
 */

const ALL_DECISIONS: AccessDecision[] = [
  "anonymous",
  "pending",
  "suspended",
  "unavailable",
  "active",
  "owner",
];

describe("shouldShowOwnerNavEntry", () => {
  it("is true for the owner decision, and only the owner decision", () => {
    for (const decision of ALL_DECISIONS) {
      expect(shouldShowOwnerNavEntry(decision)).toBe(decision === "owner");
    }
  });

  it("is false when the decision has not resolved yet (null or undefined)", () => {
    // A consumer outside <SupabaseProvider>, or a context value read before
    // the server-resolved prop has been supplied, must never be read as
    // "show the owner the link" - fail closed, exactly like the server-side
    // resolution in src/app/layout.tsx fails closed on error.
    expect(shouldShowOwnerNavEntry(null)).toBe(false);
    expect(shouldShowOwnerNavEntry(undefined)).toBe(false);
  });

  it("never shows the entry for 'active' - an approved, signed-in, non-owner account", () => {
    // The decision most easily confused with "owner": a real, approved,
    // fully-authorized account that simply is not the owner. Named
    // explicitly (not just covered by the loop above) because this is
    // exactly the case a subtly-wrong implementation (e.g. comparing
    // canUseApp(decision) instead of isOwnerDecision(decision)) would get
    // wrong while still passing a narrower test.
    expect(shouldShowOwnerNavEntry("active")).toBe(false);
  });
});
