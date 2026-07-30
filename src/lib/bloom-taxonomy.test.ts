// AC1/AC2/AC3/AC4/AC5/AC6 (docs/REGRESSION.md 145/146): BLOOM_OBJECTIVES_CONTRACT
// is the single constant every objectives-writing prompt interpolates
// verbatim (mirrors how APPLIED_REAL_TOOL_RULE is tested in course-kind.ts's
// callers). These tests pin its actual wording, not just its presence,
// because the whole point of this constant is that naming the taxonomy is
// not enough - the banned-verb/substitution/alignment rules are what make an
// objective measurable.

import { describe, it, expect } from "vitest";
import { BLOOM_LEVELS, BLOOM_OBJECTIVES_CONTRACT } from "./bloom-taxonomy";

describe("BLOOM_LEVELS", () => {
  it("names the six revised Bloom's Taxonomy levels, lowest to highest", () => {
    expect(BLOOM_LEVELS).toEqual(["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]);
  });
});

describe("BLOOM_OBJECTIVES_CONTRACT", () => {
  // AC1: measurable objective = named level + action verb + observable
  // behavior + assessability criterion.
  it("names every Bloom level and requires a verb, observable behavior, and assessability criterion", () => {
    for (const level of BLOOM_LEVELS) {
      expect(BLOOM_OBJECTIVES_CONTRACT).toContain(level);
    }
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain("MEASURABLE");
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain("observable behavior");
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain("condition or criterion that makes it assessable");
  });

  // AC2: this is the requirement that matters MORE than naming the
  // taxonomy - the banned verbs plus a concrete substitution, not just a
  // vague "avoid vague verbs" instruction.
  it("bans the unmeasurable verbs by name and gives a substitution pattern", () => {
    for (const banned of ['"know"', '"understand"', '"be familiar with"', '"learn about"', '"appreciate"', '"be aware of"']) {
      expect(BLOOM_OBJECTIVES_CONTRACT).toContain(banned);
    }
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain("BANNED VERBS");
    // The exact substitution AC2 calls out: at Understand, use explain/describe/summarize.
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain('"explain"');
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain('"describe"');
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain('"summarize"');
  });

  // AC3: the level must be visible in the document, tagged per objective -
  // this pins the chosen presentation (an inline "(Bloom: Level)" suffix).
  it("requires a visible per-objective level tag in the chosen presentation format", () => {
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain("LEVEL TAG");
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain("(Bloom: Apply)");
  });

  // AC4: alignment with the assignment is the rigor check and outranks
  // everything else, including progression (AC5).
  it("states alignment with the assignment outranks every other rule, including progression", () => {
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain("ALIGNMENT - THIS RULE OUTRANKS EVERY OTHER RULE HERE");
    expect(BLOOM_OBJECTIVES_CONTRACT.toLowerCase()).toContain("assignment actually requires");
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain("Progression never overrides ALIGNMENT above");
  });

  // AC5: objectives should climb toward the higher levels across the term,
  // but never at the expense of AC4's alignment rule.
  it("states objectives should progress toward higher levels across a term", () => {
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain("PROGRESSION");
    expect(BLOOM_OBJECTIVES_CONTRACT).toContain("climb toward Apply, Analyze, Evaluate, and Create");
  });
});
