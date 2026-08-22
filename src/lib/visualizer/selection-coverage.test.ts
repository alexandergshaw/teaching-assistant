// Unit tests for Contract 1 (docs/visualizer-coverage-from-selection-
// acceptance-criteria.md). Pure module, no mocking needed - every test drives
// the exported functions directly with in-memory fixtures.

import { describe, it, expect } from "vitest";
import {
  classifySelectionCoverage,
  visualizerLinkTitle,
  unlinkedConcepts,
  dedupeConceptsByUrl,
  coverageSummaryNote,
  type ConceptResolution,
  type CoveredConcept,
} from "./selection-coverage";

function resolution(overrides: Partial<ConceptResolution> = {}): ConceptResolution {
  return {
    concept: "For Loops",
    evidence: "Assignment: iterate over the list with a for loop.",
    url: null,
    topicKey: null,
    label: null,
    creatable: false,
    ...overrides,
  };
}

describe("classifySelectionCoverage", () => {
  // D2: covered, missing (no-match), and matched-but-not-creatable each
  // produce their documented outcome, in one call so the ordering
  // (covered/gaps, each preserving input order within its own bucket) is
  // pinned as a fact, not just a per-item behavior.
  it("routes a fully-resolved concept to covered, a no-match concept to gaps with reason no-match, and a matched-but-non-creatable concept to gaps with reason topic-not-creatable", () => {
    const resolutions: ConceptResolution[] = [
      resolution({
        concept: "For Loops",
        url: "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops",
        topicKey: "python",
        label: "For Loops",
        creatable: true,
      }),
      resolution({ concept: "Recursion", url: null, topicKey: null, label: null }),
      resolution({ concept: "HTML Semantics", url: null, topicKey: "html", label: "HTML Semantics", creatable: false }),
    ];

    const result = classifySelectionCoverage(resolutions);

    expect(result.covered).toEqual([
      {
        concept: "For Loops",
        url: "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops",
        topicKey: "python",
        label: "For Loops",
      },
    ]);
    expect(result.gaps).toEqual([
      { concept: "Recursion", evidence: "Assignment: iterate over the list with a for loop.", reason: "no-match" },
      {
        concept: "HTML Semantics",
        evidence: "Assignment: iterate over the list with a for loop.",
        reason: "topic-not-creatable",
      },
    ]);
  });

  // A4: the two gap reasons must be genuinely distinguishable by callers, not
  // just internally different - this pins that the "topic-not-creatable"
  // reason survives even though (per Contract 1's own doc comment) the field
  // that drives it is topicKey being non-null while url stays null. A caller
  // filtering "gaps eligible for creation" must be able to exclude these.
  it("a matched-but-non-creatable gap is never classified the same as a genuine no-match gap", () => {
    const noMatch = classifySelectionCoverage([resolution({ concept: "X", topicKey: null })]);
    const notCreatable = classifySelectionCoverage([resolution({ concept: "Y", topicKey: "php" })]);

    expect(noMatch.gaps[0].reason).toBe("no-match");
    expect(notCreatable.gaps[0].reason).toBe("topic-not-creatable");
    expect(noMatch.gaps[0].reason).not.toBe(notCreatable.gaps[0].reason);
  });

  it("never throws on malformed input - non-array, null entries, and blank concepts are dropped rather than crashing", () => {
    // @ts-expect-error - deliberately passing a non-array to prove the guard
    expect(() => classifySelectionCoverage(null)).not.toThrow();
    // @ts-expect-error - deliberately passing a non-array to prove the guard
    expect(classifySelectionCoverage(undefined)).toEqual({ covered: [], gaps: [] });

    const withJunk = classifySelectionCoverage([
      // @ts-expect-error - deliberately null to prove the per-item guard
      null,
      resolution({ concept: "   " }),
      resolution({ concept: "Real Concept", url: null, topicKey: null }),
    ]);
    expect(withJunk.gaps).toHaveLength(1);
    expect(withJunk.gaps[0].concept).toBe("Real Concept");
  });

  it("an empty resolutions list produces an empty coverage with both buckets present", () => {
    expect(classifySelectionCoverage([])).toEqual({ covered: [], gaps: [] });
  });

  // SHOULD-FIX 5: `creatable` must actually drive the classification, not
  // just be computed and ignored - this pins that flipping ONLY `creatable`
  // (topicKey and url held constant) changes the outcome. Before the fix,
  // the reason was inferred solely from `topicKey`'s presence, so this exact
  // input pair produced the SAME reason regardless of `creatable`.
  it("creatable is load-bearing: a matched topic (topicKey set, no url) with creatable:true is NOT classified topic-not-creatable, unlike the same topicKey with creatable:false", () => {
    const notCreatable = classifySelectionCoverage([
      resolution({ concept: "Y", url: null, topicKey: "php", label: null, creatable: false }),
    ]);
    const creatable = classifySelectionCoverage([
      resolution({ concept: "Y", url: null, topicKey: "php", label: null, creatable: true }),
    ]);

    expect(notCreatable.gaps[0].reason).toBe("topic-not-creatable");
    expect(creatable.gaps[0].reason).toBe("no-match");
    expect(creatable.gaps[0].reason).not.toBe(notCreatable.gaps[0].reason);
  });

  // NIT 12: parseNavItems (src/lib/visualizer.ts:310) can emit label: "" for
  // a real nav entry - an empty label must still count as covered, not be
  // pushed into gaps as "topic-not-creatable" just because "" is falsy.
  it("an empty-string label still counts as covered (label is checked for null, not truthiness)", () => {
    const result = classifySelectionCoverage([
      resolution({
        concept: "For Loops",
        url: "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops",
        topicKey: "python",
        label: "",
        creatable: true,
      }),
    ]);

    expect(result.gaps).toHaveLength(0);
    expect(result.covered).toEqual([
      {
        concept: "For Loops",
        url: "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops",
        topicKey: "python",
        label: "",
      },
    ]);
  });
});

describe("visualizerLinkTitle", () => {
  // C4: STABLE - the same concept must always produce the identical string,
  // never a near-duplicate, across repeated calls (simulating a re-run).
  it("produces the identical string for the same concept across repeated calls", () => {
    const first = visualizerLinkTitle("For Loops");
    const second = visualizerLinkTitle("For Loops");
    const third = visualizerLinkTitle("For Loops");
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("trims the concept before building the title, so incidental whitespace does not produce a different title", () => {
    expect(visualizerLinkTitle("For Loops")).toBe(visualizerLinkTitle("  For Loops  "));
  });

  it("produces different titles for different concepts", () => {
    expect(visualizerLinkTitle("For Loops")).not.toBe(visualizerLinkTitle("Recursion"));
  });

  it("names the concept in the title rather than returning a bare/opaque string", () => {
    expect(visualizerLinkTitle("For Loops")).toContain("For Loops");
  });
});

describe("unlinkedConcepts", () => {
  function covered(concept: string, url: string): CoveredConcept {
    return { concept, url, topicKey: "python", label: concept };
  }

  it("filters out a covered concept whose exact url is already present", () => {
    const list = [covered("For Loops", "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops")];
    const result = unlinkedConcepts(list, [
      "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops",
    ]);
    expect(result).toEqual([]);
  });

  it("keeps a covered concept whose url is not among the existing urls", () => {
    const list = [covered("Recursion", "https://programming-concept-visualizer.vercel.app/languages/python?concept=recursion")];
    const result = unlinkedConcepts(list, ["https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops"]);
    expect(result).toEqual(list);
  });

  // C5 - the exact two normalization cases the AC doc calls out: a trailing
  // slash difference, and a host-case difference.
  it("treats a trailing-slash difference on the path as the same url", () => {
    const list = [covered("For Loops", "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops")];
    // Trailing slash inserted before the query string.
    const result = unlinkedConcepts(list, [
      "https://programming-concept-visualizer.vercel.app/languages/python/?concept=for-loops",
    ]);
    expect(result).toEqual([]);
  });

  it("treats a host-case difference as the same url", () => {
    const list = [covered("For Loops", "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops")];
    const result = unlinkedConcepts(list, [
      "https://PROGRAMMING-CONCEPT-VISUALIZER.VERCEL.APP/languages/python?concept=for-loops",
    ]);
    expect(result).toEqual([]);
  });

  it("does NOT collapse two different concept slugs that only differ by query-string case", () => {
    // The query string (the concept slug) is deliberately left case-sensitive
    // - two different slugs must stay two different concepts.
    const list = [covered("For Loops", "https://programming-concept-visualizer.vercel.app/languages/python?concept=For-Loops")];
    const result = unlinkedConcepts(list, [
      "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops",
    ]);
    expect(result).toEqual(list);
  });

  it("compares by url, not by title - two different titles pointing at the same url still count as already linked", () => {
    const list = [covered("For Loops (renamed)", "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops")];
    const result = unlinkedConcepts(list, [
      "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops",
    ]);
    expect(result).toEqual([]);
  });

  it("handles an empty existing-urls list by keeping everything", () => {
    const list = [covered("For Loops", "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops")];
    expect(unlinkedConcepts(list, [])).toEqual(list);
  });
});

describe("dedupeConceptsByUrl", () => {
  function covered(concept: string, url: string): CoveredConcept {
    return { concept, url, topicKey: "python", label: concept };
  }

  // NIT 13: two differently-named/normalized concepts extracted in the same
  // scan can resolve to the same visualizer url - without this dedupe,
  // linkVisualizerPagesIntoModuleAction would insert two identical Canvas
  // items in one run.
  it("keeps the FIRST occurrence of a repeated normalized url and reports every later one as a duplicate", () => {
    const first = covered("For Loops", "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops");
    const second = covered("for loops (dup)", "https://programming-concept-visualizer.vercel.app/languages/python/?concept=for-loops");

    const result = dedupeConceptsByUrl([first, second]);

    expect(result.unique).toEqual([first]);
    expect(result.duplicates).toEqual([second]);
  });

  it("keeps every concept whose url is unique within the list", () => {
    const list = [
      covered("For Loops", "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops"),
      covered("Recursion", "https://programming-concept-visualizer.vercel.app/languages/python?concept=recursion"),
    ];

    const result = dedupeConceptsByUrl(list);

    expect(result.unique).toEqual(list);
    expect(result.duplicates).toEqual([]);
  });

  it("never throws on malformed input", () => {
    // @ts-expect-error - deliberately passing a non-array to prove the guard
    expect(dedupeConceptsByUrl(null)).toEqual({ unique: [], duplicates: [] });
  });

  it("handles an empty list", () => {
    expect(dedupeConceptsByUrl([])).toEqual({ unique: [], duplicates: [] });
  });
});

describe("coverageSummaryNote", () => {
  it("names zero concepts distinctly when nothing was found at all", () => {
    const note = coverageSummaryNote({ covered: [], gaps: [] });
    expect(note).not.toMatch(/found 0/i);
    expect(note.length).toBeGreaterThan(0);
  });

  it("names the total, covered, and gap counts", () => {
    const covered: CoveredConcept[] = [
      { concept: "For Loops", url: "https://x/for-loops", topicKey: "python", label: "For Loops" },
    ];
    const gaps = [
      { concept: "Recursion", evidence: "e", reason: "no-match" as const },
      { concept: "Pointers", evidence: "e", reason: "no-match" as const },
    ];
    const note = coverageSummaryNote({ covered, gaps });
    // NIT 18 fix: `toContain("3")` would pass on a note that happened to
    // contain "13" or "23" - matching each count as a standalone number (word
    // boundaries on both sides) instead of a bare substring check.
    expect(note).toMatch(/\b3\b/);
    expect(note).toMatch(/\b1\b/);
    expect(note).toMatch(/\b2\b/);
  });
});
