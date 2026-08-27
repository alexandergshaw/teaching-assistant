import { describe, it, expect } from "vitest";
import { suggestRepoStudentBindings, type RepoBindingRosterEntry } from "./repo-student-bindings";
import type { CourseStudentRepo } from "@/lib/supabase/courses";

// Every expectation below is a frozen literal, hand-written against the AC2
// rule order (docs/repo-grades-view-acceptance-criteria.md items 5-11), never
// computed from the implementation.

describe("suggestRepoStudentBindings", () => {
  describe("rule a - stored row wins outright on repo full-name match", () => {
    it("confirms when the stored row's canvasUserId is all-digits", () => {
      const roster: RepoBindingRosterEntry[] = [{ id: "101", name: "Alice Anderson", loginId: "aanderson" }];
      const stored: CourseStudentRepo[] = [
        { student: "Alice Anderson", canvasUserId: "101", repo: "org/alice-repo", username: "aanderson-gh" },
      ];

      const result = suggestRepoStudentBindings(["org/alice-repo"], roster, stored);

      expect(result).toEqual([
        {
          repo: "org/alice-repo",
          state: "confirmed",
          canvasUserId: "101",
          student: "Alice Anderson",
          candidates: [],
          derivedHandle: null,
        },
      ]);
    });

    it("matches the stored repo name case-insensitively", () => {
      const roster: RepoBindingRosterEntry[] = [];
      const stored: CourseStudentRepo[] = [
        { student: "Alice Anderson", canvasUserId: "101", repo: "org/alice-repo", username: null },
      ];

      const result = suggestRepoStudentBindings(["ORG/Alice-Repo"], roster, stored);

      expect(result[0].state).toBe("confirmed");
      expect(result[0].canvasUserId).toBe("101");
    });

    it("is unbound, NOT confirmed, when the stored canvasUserId is blank (AC2 item 11)", () => {
      const roster: RepoBindingRosterEntry[] = [];
      const stored: CourseStudentRepo[] = [
        { student: "Alice Anderson", canvasUserId: "", repo: "org/alice-repo", username: "aanderson-gh" },
      ];

      const result = suggestRepoStudentBindings(["org/alice-repo"], roster, stored);

      expect(result).toEqual([
        {
          repo: "org/alice-repo",
          state: "unbound",
          canvasUserId: null,
          student: "Alice Anderson",
          candidates: [],
          derivedHandle: null,
        },
      ]);
    });

    it("is unbound, NOT confirmed, when the stored canvasUserId is present but non-numeric (AC2 item 11)", () => {
      const roster: RepoBindingRosterEntry[] = [];
      const stored: CourseStudentRepo[] = [
        { student: "Alice Anderson", canvasUserId: "not-an-id", repo: "org/alice-repo", username: "aanderson-gh" },
      ];

      const result = suggestRepoStudentBindings(["org/alice-repo"], roster, stored);

      expect(result[0].state).toBe("unbound");
      expect(result[0].canvasUserId).toBeNull();
      expect(result[0].candidates).toEqual([]);
    });

    it("falls back to the roster's own name when the stored row's student field is blank", () => {
      const roster: RepoBindingRosterEntry[] = [{ id: "101", name: "Alice Anderson", loginId: "aanderson" }];
      const stored: CourseStudentRepo[] = [{ student: "", canvasUserId: "101", repo: "org/alice-repo", username: null }];

      const result = suggestRepoStudentBindings(["org/alice-repo"], roster, stored);

      expect(result[0].student).toBe("Alice Anderson");
    });

    it("never derives candidates once a stored row has won (rule a short-circuits rule b/c entirely)", () => {
      // The repo name would ALSO resolve, via derivation, to a completely
      // different roster student (Bob) - proving the stored full-name match
      // is consulted first and nothing else runs once it hits.
      const roster: RepoBindingRosterEntry[] = [{ id: "102", name: "Bob Brown", loginId: "bob-brown" }];
      const stored: CourseStudentRepo[] = [
        { student: "Alice Anderson", canvasUserId: "101", repo: "org/bob-brown", username: null },
      ];

      const result = suggestRepoStudentBindings(["org/bob-brown"], roster, stored);

      expect(result[0]).toEqual({
        repo: "org/bob-brown",
        state: "confirmed",
        canvasUserId: "101",
        student: "Alice Anderson",
        candidates: [],
        derivedHandle: null,
      });
    });
  });

  describe("rule b - deriving the candidate handle (inverts repoSlug)", () => {
    it("strips owner/ and a leading orgPrefix slug, leaving the trailing segment", () => {
      const roster: RepoBindingRosterEntry[] = [{ id: "301", name: "Carol Chen", loginId: "cchen" }];

      const result = suggestRepoStudentBindings(["org/prefix-cchen"], roster, [], "prefix");

      expect(result[0].derivedHandle).toBe("cchen");
    });

    it("uses the whole trailing name segment (after owner/) when orgPrefix is omitted", () => {
      const roster: RepoBindingRosterEntry[] = [{ id: "301", name: "Carol Chen", loginId: "ecarter" }];

      const result = suggestRepoStudentBindings(["org/ecarter"], roster, []);

      expect(result[0].derivedHandle).toBe("ecarter");
    });

    it("leaves the handle unstripped when the repo name does not actually start with the orgPrefix slug", () => {
      // orgPrefix "cs101" does not prefix this repo name at all - the
      // handle must be the FULL remaining segment, not partially stripped.
      const roster: RepoBindingRosterEntry[] = [{ id: "601", name: "Mth201 Fchen", loginId: "unrelated" }];

      const result = suggestRepoStudentBindings(["org/mth201-fchen"], roster, [], "cs101");

      expect(result[0].derivedHandle).toBe("mth201-fchen");
      expect(result[0].state).toBe("suggested");
      expect(result[0].candidates).toEqual([{ canvasUserId: "601", name: "Mth201 Fchen" }]);
    });
  });

  describe("rule c/d - tier precedence and matching", () => {
    it("tier 1 (stored username) yields exactly one match -> suggested, canvasUserId still null pending accept", () => {
      const roster: RepoBindingRosterEntry[] = [{ id: "101", name: "Alice Anderson", loginId: "someone-else" }];
      const stored: CourseStudentRepo[] = [
        { student: "Alice Anderson", canvasUserId: "101", repo: "", username: "aanderson-gh" },
      ];

      const result = suggestRepoStudentBindings(["org/prefix-aanderson-gh"], roster, stored, "prefix");

      expect(result[0]).toEqual({
        repo: "org/prefix-aanderson-gh",
        state: "suggested",
        canvasUserId: null,
        student: "Alice Anderson",
        candidates: [{ canvasUserId: "101", name: "Alice Anderson" }],
        derivedHandle: "aanderson-gh",
      });
    });

    it("a tier-1 match SUPPRESSES tier 2 and tier 3 - later tiers are not consulted even though they would also match", () => {
      // Two other roster entries would match tier 2 (loginId) and tier 3
      // (repoSlug(name)) respectively, for the SAME handle. If tier
      // precedence were broken, candidates would include all three.
      const conflictRoster: RepoBindingRosterEntry[] = [
        { id: "201", name: "Zoe Tier2", loginId: "aanderson-gh" }, // would match tier 2
        { id: "202", name: "aanderson gh", loginId: "zzz" }, // repoSlug -> "aanderson-gh", would match tier 3
      ];
      const conflictStored: CourseStudentRepo[] = [
        { student: "Alice Anderson", canvasUserId: "101", repo: "", username: "aanderson-gh" }, // tier 1
      ];

      const result = suggestRepoStudentBindings(["org/prefix-aanderson-gh"], conflictRoster, conflictStored, "prefix");

      expect(result[0].state).toBe("suggested");
      expect(result[0].candidates).toEqual([{ canvasUserId: "101", name: "Alice Anderson" }]);
    });

    it("tier 2 (roster loginId) is used when tier 1 has no match", () => {
      const roster: RepoBindingRosterEntry[] = [{ id: "301", name: "Carol Chen", loginId: "cchen" }];

      const result = suggestRepoStudentBindings(["org/prefix-cchen"], roster, [], "prefix");

      expect(result[0]).toEqual({
        repo: "org/prefix-cchen",
        state: "suggested",
        canvasUserId: null,
        student: "Carol Chen",
        candidates: [{ canvasUserId: "301", name: "Carol Chen" }],
        derivedHandle: "cchen",
      });
    });

    it("a tier-2 match SUPPRESSES tier 3 - a roster entry whose slugged name also matches is not added", () => {
      const roster: RepoBindingRosterEntry[] = [
        { id: "301", name: "Carol Chen", loginId: "cchen" }, // tier 2 match
        { id: "302", name: "Cchen", loginId: "other" }, // repoSlug -> "cchen", would match tier 3
      ];

      const result = suggestRepoStudentBindings(["org/prefix-cchen"], roster, [], "prefix");

      expect(result[0].state).toBe("suggested");
      expect(result[0].candidates).toEqual([{ canvasUserId: "301", name: "Carol Chen" }]);
    });

    it("tier 3 (repoSlug(name)) is used when tiers 1 and 2 have no match", () => {
      const roster: RepoBindingRosterEntry[] = [{ id: "401", name: "Dave Diaz", loginId: "unrelated-login" }];

      const result = suggestRepoStudentBindings(["org/prefix-dave-diaz"], roster, [], "prefix");

      expect(result[0]).toEqual({
        repo: "org/prefix-dave-diaz",
        state: "suggested",
        canvasUserId: null,
        student: "Dave Diaz",
        candidates: [{ canvasUserId: "401", name: "Dave Diaz" }],
        derivedHandle: "dave-diaz",
      });
    });

    it("zero matches across every tier -> unbound", () => {
      const roster: RepoBindingRosterEntry[] = [{ id: "401", name: "Dave Diaz", loginId: "unrelated-login" }];

      const result = suggestRepoStudentBindings(["org/prefix-nomatch"], roster, [], "prefix");

      expect(result[0]).toEqual({
        repo: "org/prefix-nomatch",
        state: "unbound",
        canvasUserId: null,
        student: null,
        candidates: [],
        derivedHandle: "nomatch",
      });
    });
  });

  describe("AC2 item 9 - the repoSlug collision", () => {
    it('"Jo Smith" and "jo-smith" both slug to "jo-smith" -> ambiguous, reporting BOTH candidates', () => {
      const collisionRoster: RepoBindingRosterEntry[] = [
        { id: "501", name: "Jo Smith", loginId: "jsmith1" },
        { id: "502", name: "jo-smith", loginId: "jsmith2" },
      ];

      const result = suggestRepoStudentBindings(["org/prefix-jo-smith"], collisionRoster, [], "prefix");

      expect(result[0]).toEqual({
        repo: "org/prefix-jo-smith",
        state: "ambiguous",
        canvasUserId: null,
        student: null,
        candidates: [
          { canvasUserId: "501", name: "Jo Smith" },
          { canvasUserId: "502", name: "jo-smith" },
        ],
        derivedHandle: "jo-smith",
      });
    });
  });

  describe("docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md N2 item 6 / N3 item 10 - studentSortable and the live-Canvas-fallback marker", () => {
    it("a 'suggested' match carries the roster entry's own sortableName", () => {
      const roster: RepoBindingRosterEntry[] = [
        { id: "301", name: "Carol Chen", loginId: "cchen", sortableName: "Chen, Carol" },
      ];
      const result = suggestRepoStudentBindings(["org/prefix-cchen"], roster, [], "prefix");
      expect(result[0].studentSortable).toBe("Chen, Carol");
    });

    it("a 'suggested' match with no sortableName on the roster entry never gets the field at all", () => {
      const roster: RepoBindingRosterEntry[] = [{ id: "301", name: "Carol Chen", loginId: "cchen" }];
      const result = suggestRepoStudentBindings(["org/prefix-cchen"], roster, [], "prefix");
      expect(result[0].studentSortable).toBeUndefined();
    });

    it("an 'ambiguous' match never carries studentSortable (no single winner to attribute it to)", () => {
      const collisionRoster: RepoBindingRosterEntry[] = [
        { id: "501", name: "Jo Smith", loginId: "jsmith1", sortableName: "Smith, Jo" },
        { id: "502", name: "jo-smith", loginId: "jsmith2" },
      ];
      const result = suggestRepoStudentBindings(["org/prefix-jo-smith"], collisionRoster, [], "prefix");
      expect(result[0].state).toBe("ambiguous");
      expect(result[0].studentSortable).toBeUndefined();
    });

    it("a CONFIRMED row with a non-blank stored student never carries studentSortable or the fallback marker - it did not come from the live roster", () => {
      const roster: RepoBindingRosterEntry[] = [
        { id: "101", name: "Alice Anderson", loginId: "aanderson", sortableName: "Anderson, Alice" },
      ];
      const stored: CourseStudentRepo[] = [
        { student: "Alice Anderson", canvasUserId: "101", repo: "org/alice-repo", username: "aanderson-gh" },
      ];
      const result = suggestRepoStudentBindings(["org/alice-repo"], roster, stored);
      expect(result[0].studentSortable).toBeUndefined();
      expect(result[0].studentFromLiveCanvasFallback).toBeUndefined();
      // Also proves the pre-existing exact shape is unchanged for this case.
      expect(result[0]).toEqual({
        repo: "org/alice-repo",
        state: "confirmed",
        canvasUserId: "101",
        student: "Alice Anderson",
        candidates: [],
        derivedHandle: null,
      });
    });

    it("a CONFIRMED row whose stored student was blank carries the live roster's sortableName AND the fallback marker", () => {
      const roster: RepoBindingRosterEntry[] = [
        { id: "101", name: "Alice Anderson", loginId: "aanderson", sortableName: "Anderson, Alice" },
      ];
      const stored: CourseStudentRepo[] = [{ student: "", canvasUserId: "101", repo: "org/alice-repo", username: null }];
      const result = suggestRepoStudentBindings(["org/alice-repo"], roster, stored);
      expect(result[0].student).toBe("Alice Anderson");
      expect(result[0].studentSortable).toBe("Anderson, Alice");
      expect(result[0].studentFromLiveCanvasFallback).toBe(true);
    });

    it("the fallback marker is still set even when the matching roster entry has no sortableName to give", () => {
      const roster: RepoBindingRosterEntry[] = [{ id: "101", name: "Alice Anderson", loginId: "aanderson" }];
      const stored: CourseStudentRepo[] = [{ student: "", canvasUserId: "101", repo: "org/alice-repo", username: null }];
      const result = suggestRepoStudentBindings(["org/alice-repo"], roster, stored);
      expect(result[0].studentFromLiveCanvasFallback).toBe(true);
      expect(result[0].studentSortable).toBeUndefined();
    });
  });

  it("maps every repo in the input list independently, preserving order", () => {
    const roster: RepoBindingRosterEntry[] = [
      { id: "101", name: "Alice Anderson", loginId: "aanderson" },
      { id: "401", name: "Dave Diaz", loginId: "ddiaz" },
    ];
    const stored: CourseStudentRepo[] = [
      { student: "Alice Anderson", canvasUserId: "101", repo: "org/alice-repo", username: null },
    ];

    const result = suggestRepoStudentBindings(
      ["org/alice-repo", "org/prefix-ddiaz", "org/prefix-nomatch"],
      roster,
      stored,
      "prefix"
    );

    expect(result.map((r) => r.repo)).toEqual(["org/alice-repo", "org/prefix-ddiaz", "org/prefix-nomatch"]);
    expect(result.map((r) => r.state)).toEqual(["confirmed", "suggested", "unbound"]);
  });
});

// --------------------------------------------------------------------------
// SABOTAGE-CHECK LOG (each verified by hand: broke the behavior, ran
// `npx vitest run src/lib/repo-student-bindings.test.ts`, confirmed a
// failure, then reverted the source before re-running to confirm green
// again). Recorded here per the task's "report exactly which you verified":
//
// 1. Collision test (AC2 item 9): changed tierRosterNameSlug's `.filter(...)`
//    to `.find(...)` (wrapped in an array) in repo-student-bindings.ts, so
//    only the FIRST slug match was ever returned. Result: the collision test
//    failed - `state` came back "suggested" (one candidate, "Jo Smith") where
//    the frozen expectation requires "ambiguous" with both candidates.
//    Reverted to `.filter(...)`; suite green again.
// 2. Tier precedence: in suggestOne, changed the tier fallthrough so tier 3
//    (tierRosterNameSlug) ran unconditionally and its results were
//    concatenated onto tier 1's, instead of only running when an earlier
//    tier found nothing. Result: "a tier-1 match SUPPRESSES tier 2 and tier
//    3" failed - candidates came back with 3 entries instead of the frozen
//    single-entry expectation. Reverted; suite green again.
// 3. AC2 item 11 (non-numeric stored id): changed the `isNumeric` branch
//    condition in suggestOne from `/^\d+$/.test(idTrimmed)` to
//    `idTrimmed.length > 0` (i.e. "present" instead of "numeric"). Result:
//    "is unbound, NOT confirmed, when the stored canvasUserId is present but
//    non-numeric" failed - state came back "confirmed" instead of "unbound".
//    Reverted; suite green again.
// --------------------------------------------------------------------------
