import { describe, it, expect, vi, beforeEach } from "vitest";

// planWeekConcepts calls callLlm() (network) transitively through
// enumerateBreadthFull and sequenceConcepts for non-embedded providers.
// Mocked so tests can run deterministically without hitting the Gemini API.
// Mirrors the mocking style in src/lib/decks/generate.test.ts and
// src/lib/decks/sequence.test.ts.
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import {
  conceptCountForMinutes,
  splitCompoundTopic,
  planWeekConcepts,
  buildConceptCycleInstruction,
  DEFAULT_LECTURE_MINUTES,
  MIN_LECTURE_MINUTES_FOR_CONCEPTS,
  MAX_LECTURE_MINUTES_FOR_CONCEPTS,
  MIN_CONCEPTS_PER_LECTURE,
  MAX_CONCEPTS_PER_LECTURE,
} from "./lecture-concepts";

describe("lecture-concepts.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("conceptCountForMinutes", () => {
    it("a 50-minute lecture (the app default) yields 4-6 concepts", () => {
      const count = conceptCountForMinutes(50);
      expect(count).toBeGreaterThanOrEqual(4);
      expect(count).toBeLessThanOrEqual(6);
    });

    it("is deterministic - same input always yields the same output", () => {
      for (const minutes of [5, 30, 50, 90, 400]) {
        expect(conceptCountForMinutes(minutes)).toBe(conceptCountForMinutes(minutes));
      }
    });

    it("clamps very short sessions to MIN_CONCEPTS_PER_LECTURE", () => {
      expect(conceptCountForMinutes(1)).toBe(MIN_CONCEPTS_PER_LECTURE);
      expect(conceptCountForMinutes(MIN_LECTURE_MINUTES_FOR_CONCEPTS)).toBe(MIN_CONCEPTS_PER_LECTURE);
    });

    it("clamps very long sessions to MAX_CONCEPTS_PER_LECTURE", () => {
      expect(conceptCountForMinutes(1000)).toBe(MAX_CONCEPTS_PER_LECTURE);
      expect(conceptCountForMinutes(MAX_LECTURE_MINUTES_FOR_CONCEPTS)).toBe(MAX_CONCEPTS_PER_LECTURE);
    });

    it("never returns a value outside the named bounds, across a wide sweep", () => {
      for (let minutes = -50; minutes <= 500; minutes += 5) {
        const count = conceptCountForMinutes(minutes);
        expect(count).toBeGreaterThanOrEqual(MIN_CONCEPTS_PER_LECTURE);
        expect(count).toBeLessThanOrEqual(MAX_CONCEPTS_PER_LECTURE);
      }
    });

    it("falls back to the default lecture length for invalid input (NaN, 0, negative)", () => {
      const fallback = conceptCountForMinutes(DEFAULT_LECTURE_MINUTES);
      expect(conceptCountForMinutes(NaN)).toBe(fallback);
      expect(conceptCountForMinutes(0)).toBe(fallback);
      expect(conceptCountForMinutes(-10)).toBe(fallback);
    });

    it("increases (or holds) as lecture length increases", () => {
      let previous = conceptCountForMinutes(MIN_LECTURE_MINUTES_FOR_CONCEPTS);
      for (let minutes = MIN_LECTURE_MINUTES_FOR_CONCEPTS; minutes <= MAX_LECTURE_MINUTES_FOR_CONCEPTS; minutes += 10) {
        const count = conceptCountForMinutes(minutes);
        expect(count).toBeGreaterThanOrEqual(previous);
        previous = count;
      }
    });
  });

  describe("splitCompoundTopic", () => {
    it("splits the real bug case on its own conjunction", () => {
      expect(splitCompoundTopic("Project Integration and Initiation")).toEqual([
        "Project Integration",
        "Initiation",
      ]);
    });

    it("returns a single-item array unchanged when there is no separator", () => {
      expect(splitCompoundTopic("Recursion")).toEqual(["Recursion"]);
    });

    it("splits on commas and semicolons", () => {
      expect(splitCompoundTopic("Arrays, Linked Lists, and Trees")).toEqual([
        "Arrays",
        "Linked Lists",
        "Trees",
      ]);
      expect(splitCompoundTopic("Risk Register; Risk Matrix")).toEqual([
        "Risk Register",
        "Risk Matrix",
      ]);
    });

    it("never invents content - every returned part is a substring of the original", () => {
      const parts = splitCompoundTopic("Scope Management and Schedule Management");
      for (const part of parts) {
        expect("Scope Management and Schedule Management").toContain(part);
      }
    });

    it("returns an empty array for a blank topic", () => {
      expect(splitCompoundTopic("   ")).toEqual([]);
    });
  });

  describe("planWeekConcepts", () => {
    it("degrades sensibly for a single bare compound topic line (the common case)", async () => {
      // provider "embedded" means enumerateBreadthFull returns the seed
      // (the bare topic) verbatim - this is the exact input/provider
      // combination that produced the MGT 422 one-concept week.
      const plan = await planWeekConcepts(
        "Project Integration and Initiation",
        "",
        50,
        "embedded"
      );

      expect(plan.concepts.length).toBeGreaterThan(1);
      expect(plan.concepts).toEqual(["Project Integration", "Initiation"]);
      expect(plan.targetCount).toBe(conceptCountForMinutes(50));
    });

    it("does not pad a genuinely single-concept topic", async () => {
      const plan = await planWeekConcepts("Recursion", "", 50, "embedded");
      expect(plan.concepts).toEqual(["Recursion"]);
    });

    it("orders foundational material before advanced material", async () => {
      // "Overview of Terminology" and "Advanced Encryption" name genuinely
      // different subjects (unlike "Basics of X and Advanced X", which
      // mergeNearDuplicates correctly collapses to one concept), so both
      // survive and only their ORDER is under test here. The topic itself
      // states them in the WRONG (advanced-first) order, so this only
      // passes if sequencing actually reorders them - a test that put the
      // foundational half first in the source string would still pass with
      // sequencing removed entirely, by coincidence of split order.
      const plan = await planWeekConcepts(
        "Advanced Encryption and Overview of Terminology",
        "",
        50,
        "embedded"
      );

      expect(plan.concepts).toHaveLength(2);
      const overviewIndex = plan.concepts.findIndex((c) => /overview/i.test(c));
      const advancedIndex = plan.concepts.findIndex((c) => /advanced/i.test(c));
      expect(overviewIndex).toBeGreaterThanOrEqual(0);
      expect(advancedIndex).toBeGreaterThanOrEqual(0);
      expect(overviewIndex).toBeLessThan(advancedIndex);
    });

    it("deduplicates near-duplicate concepts produced by the split", async () => {
      const plan = await planWeekConcepts("Loops and Basic Loops", "", 50, "embedded");
      expect(plan.concepts).toHaveLength(1);
      expect(plan.merged).toHaveLength(1);
    });

    it("returns an empty plan for a blank topic, without throwing", async () => {
      const plan = await planWeekConcepts("", "some summary", 50, "embedded");
      expect(plan.concepts).toEqual([]);
      expect(plan.merged).toEqual([]);
    });

    it("never exceeds the target concept count", async () => {
      // A short lecture should cap the (dedup'd) candidate list down, not
      // just leave it at whatever the split happened to produce.
      const plan = await planWeekConcepts(
        "Scope and Schedule and Cost and Quality and Risk and Procurement",
        "",
        5, // very short -> MIN_CONCEPTS_PER_LECTURE
        "embedded"
      );
      expect(plan.concepts.length).toBeLessThanOrEqual(plan.targetCount);
      expect(plan.targetCount).toBe(MIN_CONCEPTS_PER_LECTURE);
    });

    it("uses the real (non-embedded) enumeration and sequencing path when the provider is gemini", async () => {
      vi.mocked(callLlm)
        // enumerateBreadthFull's expansion call
        .mockResolvedValueOnce({
          ok: true,
          text: JSON.stringify(["Project Charter", "Stakeholder Register", "Integration Plan"]),
        } as never)
        // sequenceConcepts's ordering call
        .mockResolvedValueOnce({
          ok: true,
          text: JSON.stringify({
            order: ["Project Charter", "Stakeholder Register", "Integration Plan"],
          }),
        } as never);

      const plan = await planWeekConcepts(
        "Project Integration and Initiation",
        "Covers chartering and stakeholder identification",
        50,
        "gemini"
      );

      expect(plan.concepts).toEqual([
        "Project Charter",
        "Stakeholder Register",
        "Integration Plan",
      ]);
      expect(callLlm).toHaveBeenCalledTimes(2);
    });
  });

  describe("buildConceptCycleInstruction", () => {
    it("returns an empty string for an empty concept list, for either kind", () => {
      expect(buildConceptCycleInstruction([], "coding")).toBe("");
      expect(buildConceptCycleInstruction([], "applied")).toBe("");
    });

    it("states the concept count as a minimum and lists every concept", () => {
      const section = buildConceptCycleInstruction(["Project Charter", "Change Control"], "applied");
      expect(section).toContain("CONCEPT PLAN");
      expect(section).toContain("ALL 2");
      expect(section).toContain("1. Project Charter");
      expect(section).toContain("2. Change Control");
    });

    it("states the per-concept full-cycle requirement, framed around do-not-stop-early", () => {
      const section = buildConceptCycleInstruction(["Project Charter"], "coding");
      expect(section).toContain("its own complete");
      expect(section).toContain("do not stop after only the first one");
    });

    // Coding keeps the existing five-slide description (a concept slide,
    // then Example / Walkthrough / Practice / Answer) - this is the
    // guarantee that the coding cycle instruction did not drift when the
    // applied cycle was introduced.
    it("names the five-slide coding cycle for a coding course", () => {
      const section = buildConceptCycleInstruction(["Recursion"], "coding");
      expect(section).toContain("Example / Walkthrough / Practice / Answer");
    });

    // Applied names its own cycle instead of the coding one - a four-slide
    // core every concept gets, plus a conditional Your Turn/Model Response
    // pair whose eligibility is deferred to the requirements below (SLIDE
    // BUDGET), never asserted here as an unconditional six-slide demand.
    // RCA regression (docs/REGRESSION.md entry 100 AC1 amendment): this used
    // to assert "six-slide" unconditionally for every concept, which
    // contradicted slide-prompt.ts's cap of 2 in-lecture Your Turn pairs.
    it("names the four-slide applied core plus the conditional Your Turn/Model Response pair for an applied course", () => {
      const section = buildConceptCycleInstruction(["Risk Register"], "applied");
      expect(section).toContain("Principle");
      expect(section).toContain("In Practice");
      expect(section).toContain("Artifact");
      expect(section).toContain("Judgment Call");
      expect(section).toContain("Your Turn");
      expect(section).toContain("Model Response");
      // Never restates a six-slide cycle as unconditional for every concept -
      // the pair is explicitly deferred to "the requirements below" instead.
      expect(section).not.toContain("six-slide");
      expect(section).toContain("the concepts the requirements below identify");
    });

    it("never names the other kind's cycle", () => {
      const coding = buildConceptCycleInstruction(["Loops"], "coding");
      expect(coding).not.toContain("Principle");
      expect(coding).not.toContain("Judgment Call");
      expect(coding).not.toContain("six-slide");

      const applied = buildConceptCycleInstruction(["Risk Register"], "applied");
      expect(applied).not.toContain("Walkthrough");
      expect(applied).not.toContain("Example / Walkthrough / Practice / Answer");
    });
  });
});
