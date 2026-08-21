import { describe, it, expect } from "vitest";
import { findCourseForCanvasUrl } from "./course-canvas-url-match";

describe("findCourseForCanvasUrl", () => {
  const courses = [
    { id: "a", canvasUrl: "https://school.instructure.com/courses/111" },
    { id: "b", canvasUrl: "https://school.instructure.com/courses/222" },
    { id: "c", canvasUrl: null },
  ];

  it("returns the matching row", () => {
    const found = findCourseForCanvasUrl(courses, "https://school.instructure.com/courses/222/");
    expect(found?.id).toBe("b");
  });

  it("returns null when no row matches (AC S1/S2 - caller reports a specific message, never guesses)", () => {
    const found = findCourseForCanvasUrl(courses, "https://school.instructure.com/courses/999");
    expect(found).toBeNull();
  });

  it("returns null for an empty course list", () => {
    expect(findCourseForCanvasUrl([], "https://school.instructure.com/courses/111")).toBeNull();
  });

  it("skips a row with a null canvasUrl without throwing", () => {
    const found = findCourseForCanvasUrl(courses, "https://school.instructure.com/courses/111");
    expect(found?.id).toBe("a");
  });

  // ── DEFECT 5 (adversarial review) - id/host coverage after removing the
  // dead canvasUrlMatchesCourse ─────────────────────────────────────────────
  // canvasUrlMatchesCourse (formerly exported from course-canvas-url-match.ts
  // as a lower-level pairwise comparator) had zero production callers and its
  // host-less path never consulted `institution` at all - a public trap for
  // the next caller who reached for the obviously-named helper and got the
  // OLD, pre-institution-aware rule findCourseForCanvasUrl no longer uses. It
  // has been deleted; the id/host matching behaviour it used to cover (step
  // 1/2 of findCourseForCanvasUrl - both real hosts, decided before
  // institution is ever consulted) is exercised directly here instead.
  describe("id/host matching (DEFECT 5 coverage)", () => {
    const row = (id: string, canvasUrl: string) => ({ id, canvasUrl });

    it("matches when the tab URL has a trailing slash the stored URL does not", () => {
      const found = findCourseForCanvasUrl(
        [row("a", "https://school.instructure.com/courses/123")],
        "https://school.instructure.com/courses/123/"
      );
      expect(found?.id).toBe("a");
    });

    it("matches when the tab URL has extra path segments (a deep link into the course)", () => {
      const found = findCourseForCanvasUrl(
        [row("a", "https://school.instructure.com/courses/123")],
        "https://school.instructure.com/courses/123/assignments/456"
      );
      expect(found?.id).toBe("a");
    });

    it("matches when the tab URL carries a query string", () => {
      const found = findCourseForCanvasUrl(
        [row("a", "https://school.instructure.com/courses/123")],
        "https://school.instructure.com/courses/123?foo=bar"
      );
      expect(found?.id).toBe("a");
    });

    it("matches across an http/https scheme mismatch (host is the same)", () => {
      const found = findCourseForCanvasUrl(
        [row("a", "http://school.instructure.com/courses/123")],
        "https://school.instructure.com/courses/123"
      );
      expect(found?.id).toBe("a");
    });

    it("rejects the same course id on a different host - not raw string/id equality", () => {
      const found = findCourseForCanvasUrl(
        [row("a", "https://other-school.instructure.com/courses/123")],
        "https://school.instructure.com/courses/123"
      );
      expect(found).toBeNull();
    });

    it("tolerates a schemeless stored URL (matched by host)", () => {
      const found = findCourseForCanvasUrl(
        [row("a", "school.instructure.com/courses/123")],
        "https://school.instructure.com/courses/123"
      );
      expect(found?.id).toBe("a");
    });

    it("rejects when the tab URL has no /courses/<id> segment", () => {
      const found = findCourseForCanvasUrl(
        [row("a", "https://school.instructure.com/courses/123")],
        "https://school.instructure.com/"
      );
      expect(found).toBeNull();
    });
  });

  // ── M12/M12a (docs/module-intro-video-script-acceptance-criteria.md,
  // findings 11-12) - THE SABOTAGE CHECK ──────────────────────────────────
  //
  // Two courses at two DIFFERENT institutions, both storing the host-less
  // shape the UI actually emits, sharing the SAME numeric course id. Against
  // the pre-M11/M12 matcher this test fails: hostOf("/courses/10287") invents
  // the pseudo-host "courses" for BOTH rows, so `.find` always returns
  // whichever row came first in the array, regardless of which institution
  // actually asked - verified with a throwaway script reimplementing the
  // pre-M11/M12 algorithm (NOT sourced from git history - this file's own
  // header comment explains why: `git log --follow` shows exactly one commit
  // for this path, so there is no earlier committed revision to diff
  // against):
  //
  //   hostOf_preM11('/courses/10287') = "courses"
  //   find_preM11M12(rows, '/courses/10287') resolved to: row-a
  //   ... row-a - always the SAME row regardless of which institution is
  //   actually asking.
  //
  // i.e. asking for INST_B's course also returned row-a (INST_A's row) - a
  // real, reproducible collision. This test proves the fix removes it: each
  // institution's own acronym must resolve to its OWN row, never the other's.
  describe("cross-institution disambiguation (M12a sabotage check)", () => {
    const crossInstitutionCourses = [
      { id: "row-a", canvasUrl: "/courses/10287", institution: "INST_A" },
      { id: "row-b", canvasUrl: "/courses/10287", institution: "INST_B" },
    ];

    it("resolves INST_A's acronym to row-a, never row-b", () => {
      const found = findCourseForCanvasUrl(crossInstitutionCourses, "/courses/10287", "INST_A");
      expect(found?.id).toBe("row-a");
    });

    it("resolves INST_B's acronym to row-b, never row-a", () => {
      const found = findCourseForCanvasUrl(crossInstitutionCourses, "/courses/10287", "INST_B");
      expect(found?.id).toBe("row-b");
    });

    it("the institution comparison is case-insensitive", () => {
      const found = findCourseForCanvasUrl(crossInstitutionCourses, "/courses/10287", "inst_b");
      expect(found?.id).toBe("row-b");
    });

    it("matches neither row when no acronym is supplied at all - never a guess", () => {
      const found = findCourseForCanvasUrl(crossInstitutionCourses, "/courses/10287");
      expect(found).toBeNull();
    });

    it("matches neither row when the supplied acronym belongs to neither institution", () => {
      const found = findCourseForCanvasUrl(crossInstitutionCourses, "/courses/10287", "SOME_OTHER_SCHOOL");
      expect(found).toBeNull();
    });
  });

  // ── M14 - the blank/null institution baseline ─────────────────────────────
  // An earlier revision of the host-less rule gated a match on
  // `course.institution === acronym` with no blank/unique exception at all -
  // but LmsCell.tsx, the ONLY control that ever WRITES a host-less
  // `/courses/<id>` canvasUrl, never writes `institution` (its commit() saves
  // only `{canvasUrl}`). Every row that rule was meant to protect therefore
  // has a NULL institution in the common case, and a literal-equality gate
  // can never be true for it - so that rule un-linked every host-less row in
  // exactly the single-institution case this app grew up on. This block
  // covers the baseline behaviour the current rule restores: a unique,
  // blank-institution, host-inconclusive row resolves by uniqueness alone.
  //
  // These tests are correctness assertions for the CURRENT rule, not
  // regression tests against a real prior commit - `git log --follow` on this
  // file shows exactly one commit (see this file's own header comment), so
  // there is no earlier committed version where this behaviour differed to
  // diff against. What makes the first two below CRITICAL is what they
  // protect going forward: they fail against the literal-equality gate
  // described above (verified with a throwaway script reimplementing that
  // gate and running these exact inputs through it - it returns null for
  // both), so they will catch a future accidental reintroduction of it, even
  // though no committed version of this file ever exhibited the bug.
  describe("blank/null institution baseline", () => {
    it("CRITICAL: a null-institution row (LmsCell's normal case) resolves when its course id is unique and an acronym is supplied", () => {
      const courses = [{ id: "only-row", canvasUrl: "/courses/10287", institution: null }];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "WNCC");
      expect(found?.id).toBe("only-row");
    });

    it("CRITICAL: a blank/whitespace institution (never actually null - some data path could still write '') resolves the same way", () => {
      const courses = [{ id: "only-row", canvasUrl: "/courses/10287", institution: "   " }];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "WNCC");
      expect(found?.id).toBe("only-row");
    });

    it("still requires SOME acronym even when the row is the only candidate - no institution context at all is never a guess", () => {
      const courses = [{ id: "only-row", canvasUrl: "/courses/10287", institution: null }];
      const found = findCourseForCanvasUrl(courses, "/courses/10287");
      expect(found).toBeNull();
    });

    it("a whitespace-only acronym is normalized to absent, not a wildcard that matches a blank institution", () => {
      const courses = [{ id: "only-row", canvasUrl: "/courses/10287", institution: null }];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "   ");
      expect(found).toBeNull();
    });

    it("two BLANK-institution rows sharing the same course id must NOT guess - this is the case blank-is-unscoped alone cannot resolve", () => {
      const courses = [
        { id: "row-a", canvasUrl: "/courses/10287", institution: null },
        { id: "row-b", canvasUrl: "/courses/10287", institution: "" },
      ];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "WNCC");
      expect(found).toBeNull();
    });

    it("one BLANK-institution row alongside a NAMED-institution row sharing an id: the named row still resolves by acronym, the blank one is never guessed", () => {
      const courses = [
        { id: "row-blank", canvasUrl: "/courses/10287", institution: null },
        { id: "row-named", canvasUrl: "/courses/10287", institution: "WNCC" },
      ];
      expect(findCourseForCanvasUrl(courses, "/courses/10287", "WNCC")?.id).toBe("row-named");
      // Asking for an acronym that matches NEITHER row (not "WNCC", and the
      // blank row can never win the ambiguous branch) correctly finds none.
      expect(findCourseForCanvasUrl(courses, "/courses/10287", "OTHER_SCHOOL")).toBeNull();
    });

    it("the unique-id shortcut does NOT apply once a second row shares the id - institution decides, exactly like the M12a cross-institution case", () => {
      const courses = [
        { id: "row-other", canvasUrl: "/courses/10287", institution: "OTHER" },
        { id: "row-wncc", canvasUrl: "/courses/10287", institution: "WNCC" },
      ];
      expect(findCourseForCanvasUrl(courses, "/courses/10287", "WNCC")?.id).toBe("row-wncc");
      expect(findCourseForCanvasUrl(courses, "/courses/10287", "OTHER")?.id).toBe("row-other");
    });
  });

  // ── DEFECT 1 (adversarial review) - free-text institution is not proof of
  // a different school ───────────────────────────────────────────────────
  // An earlier revision of this rule rejected a UNIQUE host-inconclusive
  // candidate whenever its `institution` was set and did not literally equal
  // the acronym - but `institution` is FREE TEXT (AddCourseForm.tsx's
  // Institution field is a freeSolo Autocomplete; CourseRow.tsx's own cell is
  // a plain editable text field), never validated against the registered
  // acronym list (src/lib/institutions.ts, itself client-only - see this
  // file's header comment). That made a row where someone typed "Metro
  // Community College" while the registry code is "MCC" permanently
  // unmatchable - a real regression, not a narrowing. The fix: only a value
  // CONFIRMED against a `knownAcronyms` list counts as evidence of a
  // different school. No caller supplies that list today
  // (src/app/actions/lms-syllabus-buttons.ts's own call passes only 3
  // arguments) - so the honest, currently-true behaviour is: any non-blank,
  // non-matching institution on a unique candidate is treated as absent
  // information, same as blank, until some future caller wires the real
  // registry through.
  describe("free-text institution vs a unique host-inconclusive candidate (DEFECT 1)", () => {
    it("a UNIQUE row whose institution is free text that differs from the acronym still resolves when no registry list is supplied - this is the regression this fix reverts", () => {
      const courses = [{ id: "only-row", canvasUrl: "/courses/10287", institution: "Metro Community College" }];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "MCC");
      expect(found?.id).toBe("only-row");
    });

    it("the same row still resolves even when a registry list IS supplied, as long as its own institution text is not itself a member of it - unstructured text is never evidence", () => {
      const courses = [{ id: "only-row", canvasUrl: "/courses/10287", institution: "Metro Community College" }];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "MCC", ["MCC", "OTHER_SCHOOL"]);
      expect(found?.id).toBe("only-row");
    });

    it("CRITICAL: a UNIQUE row whose institution IS a REGISTERED acronym that differs from the caller's - confirmed via knownAcronyms - is rejected, not rescued by uniqueness", () => {
      const courses = [{ id: "only-row", canvasUrl: "/courses/10287", institution: "INST_A" }];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "INST_B", ["INST_A", "INST_B"]);
      expect(found).toBeNull();
    });

    it("a UNIQUE row whose institution is SET and MATCHES the acronym still resolves regardless of any registry list", () => {
      const courses = [{ id: "only-row", canvasUrl: "/courses/10287", institution: "WNCC" }];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "WNCC", ["WNCC"]);
      expect(found?.id).toBe("only-row");
    });

    it("a UNIQUE row with a BLANK institution still resolves regardless of acronym or any registry list - blank is absent information, not a contradiction", () => {
      const courses = [{ id: "only-row", canvasUrl: "/courses/10287", institution: null }];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "WNCC", ["WNCC", "OTHER"]);
      expect(found?.id).toBe("only-row");
    });

    it("a mixed pool sharing one id - one BLANK row, one row with a REGISTERED, contradicting institution - resolves to neither: the contradicting row is rejected outright by branch (b)'s equality rule, and the blank row is never rescued by the pool shrinking to one (branch (b)'s ambiguity count is taken over the ORIGINAL pool, not a pre-filtered one)", () => {
      const courses = [
        { id: "row-blank", canvasUrl: "/courses/10287", institution: null },
        { id: "row-contradicting", canvasUrl: "/courses/10287", institution: "INST_A" },
      ];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "INST_B", ["INST_A", "INST_B"]);
      expect(found).toBeNull();
    });
  });

  // ── DEFECT 3 (adversarial review) - duplicate institution values in an
  // ambiguous pool must never guess ─────────────────────────────────────────
  // Branch (b)'s own doc comment used to claim "`.find` can never again
  // return whichever one comes first" while still calling `.find` - true only
  // when at most one row's institution matches the acronym. Two rows sharing
  // BOTH the same id and the same institution value made that claim false:
  // `.find` returned whichever came first. Fixed by counting matches instead
  // of taking the first.
  describe("duplicate institution values in an ambiguous pool (DEFECT 3)", () => {
    it("two rows sharing BOTH the same course id and the same institution value resolve to neither", () => {
      const courses = [
        { id: "row-x", canvasUrl: "/courses/10287", institution: "WNCC" },
        { id: "row-y", canvasUrl: "/courses/10287", institution: "WNCC" },
      ];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "WNCC");
      expect(found).toBeNull();
    });

    it("case-insensitivity still counts as a duplicate - 'WNCC' and 'wncc' are the same institution value", () => {
      const courses = [
        { id: "row-x", canvasUrl: "/courses/10287", institution: "WNCC" },
        { id: "row-y", canvasUrl: "/courses/10287", institution: "wncc" },
      ];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "WNCC");
      expect(found).toBeNull();
    });
  });

  // ── DEFECT 4 (adversarial review) - a full-URL row and a host-less row
  // sharing an id, against a host-less tab ──────────────────────────────────
  // Both land in the host-inconclusive pool: the tab is host-less, so step 2
  // never runs at all (there is no tabHost to compare against), and step 3's
  // own inconclusive test (`!(storedHost && tabHost)`) admits the full-URL
  // row too, since tabHost is falsy regardless of what the row's own host is.
  // With both institutions blank, this resolves to null - deliberately the
  // SAME outcome as two fully host-less blank rows sharing an id (see
  // "blank/null institution baseline" above), because the two scenarios carry
  // identical information from this rule's point of view: two candidates,
  // neither host- nor institution-distinguished. See this file's own doc
  // comment ("ALSO OPEN") for why resolving this anyway would be a guess.
  describe("a full-URL row and a host-less row sharing an id, against a host-less tab (DEFECT 4)", () => {
    it("resolves to neither when both institutions are blank - a genuinely irreducible ambiguity, not a bug", () => {
      const courses = [
        { id: "row-full-url", canvasUrl: "https://school.instructure.com/courses/10287", institution: null },
        { id: "row-host-less", canvasUrl: "/courses/10287", institution: null },
      ];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "WNCC");
      expect(found).toBeNull();
    });

    it("still resolves correctly when the two rows' institutions DO disambiguate them - the host-vs-host-less shape itself is not what blocks resolution", () => {
      const courses = [
        { id: "row-full-url", canvasUrl: "https://school.instructure.com/courses/10287", institution: "OTHER" },
        { id: "row-host-less", canvasUrl: "/courses/10287", institution: "WNCC" },
      ];
      const found = findCourseForCanvasUrl(courses, "/courses/10287", "WNCC");
      expect(found?.id).toBe("row-host-less");
    });
  });
});
