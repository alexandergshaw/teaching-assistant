import { describe, it, expect, vi, beforeEach } from "vitest";

// sequenceConcepts calls callLlm() (network) for non-embedded providers, which
// is mocked so the validation/fallback logic runs for real without hitting
// the Gemini API. Mirrors the mocking style in src/app/actions/revise-document.test.ts.
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { mergeNearDuplicates, sequenceConceptsDeterministic, sequenceConcepts } from "./sequence";

// The real failing case from the user's "Module 07 - Algorithms and Data
// Structures" deck: nine body sections whose loop-item order became the
// deck's section order, with regex split into two places, the overview
// after its dependents, and "Advanced ..." sections scattered among basics.
const FIXTURE = [
  "Advanced List Functions",
  "Introduction to Regular Expressions",
  "Algorithmic Problem Solving",
  "Data Structures Overview",
  "Advanced Algorithmic Concepts",
  "Introduction to Pattern Matching",
  "Understanding Data Redundancy",
  "Advanced Data Handling",
];
const SUBJECT = "Algorithms and Data Structures";

// Second real-world case: a SQL deck where the module's own foundation
// ("SQL Basics") loses the lead to a topic-level "Introduction to ..." item
// that merely happens to match the foundational-prefix heuristic.
const SQL_FIXTURE = [
  "Advanced Joins",
  "Introduction to Indexing",
  "SQL Basics",
  "Query Performance Tuning",
  "Understanding Normalization",
];
const SQL_SUBJECT = "SQL for Data Analysis";

function mockOrder(order: string[]) {
  vi.mocked(callLlm).mockResolvedValue({
    ok: true,
    text: JSON.stringify({ order }),
  } as never);
}

describe("sequence.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("mergeNearDuplicates", () => {
    it("merges regex / regex / pattern matching (synonym table)", () => {
      const { merged } = mergeNearDuplicates(["Working with Regex", "Understanding Pattern Matching"]);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual(
        expect.arrayContaining(["Working with Regex", "Understanding Pattern Matching"])
      );
    });

    it("merges dictionary / dict / hash map / key-value (synonym table)", () => {
      const { merged } = mergeNearDuplicates(["Advanced Dictionary Techniques", "Working with Hash Map"]);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual(
        expect.arrayContaining(["Advanced Dictionary Techniques", "Working with Hash Map"])
      );
    });

    it("merges list / array / sequence (synonym table)", () => {
      const { merged } = mergeNearDuplicates(["Advanced List Functions", "Understanding Array Basics"]);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual(
        expect.arrayContaining(["Advanced List Functions", "Understanding Array Basics"])
      );
    });

    it("merges efficiency / performance / complexity / big o (synonym table)", () => {
      const { merged } = mergeNearDuplicates(["Advanced Efficiency Concerns", "Big O Notation Basics"]);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual(
        expect.arrayContaining(["Advanced Efficiency Concerns", "Big O Notation Basics"])
      );
    });

    it("merges data redundancy / single source of truth / normalization (synonym table)", () => {
      const { merged } = mergeNearDuplicates([
        "Understanding Data Redundancy",
        "Working with Single Source of Truth",
      ]);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual(
        expect.arrayContaining(["Understanding Data Redundancy", "Working with Single Source of Truth"])
      );
    });

    it("merges via whole-word containment even without a synonym match", () => {
      // "List Functions" is contained, word-for-word, inside the normalized
      // form of the second item ("list functions in depth") after its
      // leading qualifier is stripped - no synonym table entry is involved.
      const { items, merged } = mergeNearDuplicates([
        "List Functions",
        "Understanding List Functions in Depth",
      ]);
      expect(items).toHaveLength(1);
      expect(merged).toHaveLength(1);
    });

    it("does not merge unrelated items and keeps their input order (stability)", () => {
      const input = ["Alpha Topic", "Beta Topic", "Gamma Topic"];
      const { items, merged } = mergeNearDuplicates(input);
      expect(items).toEqual(input);
      expect(merged).toEqual([]);
    });

    it("is idempotent: running it again on its own output changes nothing", () => {
      const first = mergeNearDuplicates(FIXTURE);
      const second = mergeNearDuplicates(first.items);
      expect(second.items).toEqual(first.items);
      expect(second.merged).toEqual([]);
    });

    it("merges the fixture's split regex thread into one item", () => {
      const { merged } = mergeNearDuplicates(FIXTURE);
      const regexGroup = merged.find(
        (group) =>
          group.includes("Introduction to Regular Expressions") &&
          group.includes("Introduction to Pattern Matching")
      );
      expect(regexGroup).toBeDefined();
    });

    // F1/F4: without a subject, survivor selection is untouched (shortest
    // non-fragment, non-"Advanced" label wins) - "Introduction to Pattern
    // Matching" (33 chars) beats "Introduction to Regular Expressions" (36).
    it("without a subject, keeps today's shortest-wins survivor for the regex/pattern group", () => {
      const { items } = mergeNearDuplicates(FIXTURE);
      expect(items).toContain("Introduction to Pattern Matching");
      expect(items).not.toContain("Introduction to Regular Expressions");
    });

    // F4: with the real subject supplied, neither regex label relates to
    // "Algorithms and Data Structures", so token-overlap ties at zero and
    // the tie-break falls to "earlier in the input" - "Introduction to
    // Regular Expressions" (index 1) beats "Introduction to Pattern
    // Matching" (index 5). This is the standard name a student searches for,
    // and every slide under both sections is actually about regex.
    it("with the subject supplied, picks 'Introduction to Regular Expressions' as the regex/pattern survivor", () => {
      const { items, merged } = mergeNearDuplicates(FIXTURE, SUBJECT);
      expect(items).toContain("Introduction to Regular Expressions");
      expect(items).not.toContain("Introduction to Pattern Matching");
      const regexGroup = merged.find(
        (group) =>
          group.includes("Introduction to Regular Expressions") &&
          group.includes("Introduction to Pattern Matching")
      );
      expect(regexGroup).toBeDefined();
    });

    it("survivor selection is idempotent with a subject supplied", () => {
      const first = mergeNearDuplicates(FIXTURE, SUBJECT);
      const second = mergeNearDuplicates(first.items, SUBJECT);
      expect(second.items).toEqual(first.items);
      expect(second.merged).toEqual([]);
    });
  });

  describe("sequenceConceptsDeterministic", () => {
    it("merges the regex thread (assert via merged groups)", () => {
      const result = sequenceConceptsDeterministic(FIXTURE);
      const regexGroup = result.merged.find(
        (group) =>
          group.includes("Introduction to Regular Expressions") &&
          group.includes("Introduction to Pattern Matching")
      );
      expect(regexGroup).toBeDefined();
    });

    it("orders Data Structures Overview before Advanced List Functions and Advanced Data Handling", () => {
      const result = sequenceConceptsDeterministic(FIXTURE);
      const idx = (label: string) => result.items.indexOf(label);
      expect(idx("Data Structures Overview")).toBeGreaterThanOrEqual(0);
      expect(idx("Data Structures Overview")).toBeLessThan(idx("Advanced List Functions"));
      expect(idx("Data Structures Overview")).toBeLessThan(idx("Advanced Data Handling"));
    });

    it("puts every 'Advanced ...' item after every non-Advanced item", () => {
      const result = sequenceConceptsDeterministic(FIXTURE);
      const advancedIdxs = result.items
        .map((item, i) => (item.startsWith("Advanced") ? i : -1))
        .filter((i) => i >= 0);
      const nonAdvancedIdxs = result.items
        .map((item, i) => (item.startsWith("Advanced") ? -1 : i))
        .filter((i) => i >= 0);
      expect(advancedIdxs.length).toBeGreaterThan(0);
      expect(nonAdvancedIdxs.length).toBeGreaterThan(0);
      expect(Math.min(...advancedIdxs)).toBeGreaterThan(Math.max(...nonAdvancedIdxs));
    });

    it("is a permutation of the merged input - nothing invented, nothing lost", () => {
      const merged = mergeNearDuplicates(FIXTURE).items;
      const result = sequenceConceptsDeterministic(FIXTURE);
      expect(result.items.length).toBe(merged.length);
      expect([...result.items].sort()).toEqual([...merged].sort());
    });

    it("is deterministic across repeated calls (no randomness, no clock)", () => {
      const first = sequenceConceptsDeterministic(FIXTURE);
      const second = sequenceConceptsDeterministic(FIXTURE);
      expect(second.items).toEqual(first.items);
    });

    it("reports reordered: false and keeps input order for unrelated, unranked items", () => {
      const input = ["Alpha Topic", "Beta Topic", "Gamma Topic"];
      const result = sequenceConceptsDeterministic(input);
      expect(result.items).toEqual(input);
      expect(result.reordered).toBe(false);
    });

    it("reports reordered: true when the fixture actually gets reordered", () => {
      const result = sequenceConceptsDeterministic(FIXTURE);
      expect(result.reordered).toBe(true);
    });

    // --- F2/F3: subject-level foundation ranking -----------------------------

    it("without a subject, today's output is unchanged (Introduction to Pattern Matching leads)", () => {
      // Pinned so the "additive only" guarantee (F1) has a concrete baseline:
      // this is the exact (buggy) order the fix must NOT alter when no
      // subject is supplied.
      const result = sequenceConceptsDeterministic(FIXTURE);
      expect(result.items).toEqual([
        "Introduction to Pattern Matching",
        "Data Structures Overview",
        "Algorithmic Problem Solving",
        "Understanding Data Redundancy",
        "Advanced List Functions",
        "Advanced Algorithmic Concepts",
        "Advanced Data Handling",
      ]);
    });

    it("with the subject supplied, leads with the subject-level foundation 'Data Structures Overview'", () => {
      const result = sequenceConceptsDeterministic(FIXTURE, SUBJECT);
      expect(result.items[0]).toBe("Data Structures Overview");
      // Full corrected order: subject-level foundation, then ordinary items
      // (including the demoted topic-level "introduction"), then every
      // "Advanced ..." item last.
      expect(result.items).toEqual([
        "Data Structures Overview",
        "Introduction to Regular Expressions",
        "Algorithmic Problem Solving",
        "Understanding Data Redundancy",
        "Advanced List Functions",
        "Advanced Algorithmic Concepts",
        "Advanced Data Handling",
      ]);
    });

    it("with the subject supplied, leads with 'SQL Basics' and demotes 'Introduction to Indexing' among the ordinary items", () => {
      const result = sequenceConceptsDeterministic(SQL_FIXTURE, SQL_SUBJECT);
      expect(result.items[0]).toBe("SQL Basics");
      const idx = (label: string) => result.items.indexOf(label);
      // The topic-level introduction never outranks the subject-level foundation.
      expect(idx("Introduction to Indexing")).toBeGreaterThan(idx("SQL Basics"));
      // Advanced/"performance" material still trails everything else.
      expect(idx("Advanced Joins")).toBeGreaterThan(idx("SQL Basics"));
      expect(idx("Query Performance Tuning")).toBeGreaterThan(idx("SQL Basics"));
    });

    it("without a subject, the SQL fixture's order is unchanged from today", () => {
      const result = sequenceConceptsDeterministic(SQL_FIXTURE);
      // "Introduction to Indexing" and "SQL Basics" both match the bare
      // prefix heuristic (bucket 0) with no subject to disambiguate them, so
      // input order decides - "Introduction to Indexing" (index 1) comes
      // before "SQL Basics" (index 2). This is today's bug, preserved
      // byte-for-byte because F1 says the no-subject path must not move.
      expect(result.items).toEqual([
        "Introduction to Indexing",
        "SQL Basics",
        "Understanding Normalization",
        "Advanced Joins",
        "Query Performance Tuning",
      ]);
    });

    it("a topic-level introduction never outranks a subject-level foundation, even when it leads the input", () => {
      // "Introduction to Widgets" is a topic-level intro (unrelated residual
      // "widgets"); "Gadget Overview" is a subject-level foundation (residual
      // "gadget" is a whole-word subsequence of the subject). Even though the
      // introduction appears first in the input, the foundation must lead,
      // and "Advanced ..." material still trails both.
      const result = sequenceConceptsDeterministic(
        ["Introduction to Widgets", "Gadget Overview", "Advanced Widget Techniques"],
        "Gadget Systems"
      );
      expect(result.items).toEqual([
        "Gadget Overview",
        "Introduction to Widgets",
        "Advanced Widget Techniques",
      ]);
    });

    it("preserves family contiguity: a merged family stays a single contiguous block led by its most foundational member", () => {
      // "Advanced Regular Expressions" and "Introduction to Pattern Matching"
      // share the regex/pattern-matching synonym family and must merge into
      // one survivor - never appearing as two separately-bucketed items that
      // could split apart.
      const result = sequenceConceptsDeterministic(
        ["Advanced Regular Expressions", "Data Structures Overview", "Introduction to Pattern Matching"],
        SUBJECT
      );
      const regexOccurrences = result.items.filter((item) =>
        /regular expressions|pattern matching/i.test(item)
      );
      expect(regexOccurrences).toHaveLength(1);
      expect(result.items[0]).toBe("Data Structures Overview");
    });

    it("idempotent with a subject supplied: sequencing the already-sequenced output changes nothing further", () => {
      const first = sequenceConceptsDeterministic(FIXTURE, SUBJECT);
      const second = sequenceConceptsDeterministic(first.items, SUBJECT);
      expect(second.items).toEqual(first.items);
      expect(second.reordered).toBe(false);

      const firstSql = sequenceConceptsDeterministic(SQL_FIXTURE, SQL_SUBJECT);
      const secondSql = sequenceConceptsDeterministic(firstSql.items, SQL_SUBJECT);
      expect(secondSql.items).toEqual(firstSql.items);
      expect(secondSql.reordered).toBe(false);
    });
  });

  describe("sequenceConcepts", () => {
    const items = ["Loops", "Conditionals"];

    it("provider embedded: never calls the model", async () => {
      const result = await sequenceConcepts(SUBJECT, FIXTURE, "embedded");
      expect(callLlm).not.toHaveBeenCalled();
      expect(result).toEqual(sequenceConceptsDeterministic(FIXTURE, SUBJECT));
      expect(result.items[0]).toBe("Data Structures Overview");
    });

    it("a single merged item short-circuits with no LLM call", async () => {
      const result = await sequenceConcepts("Subject", ["Solo Topic"], "gemini");
      expect(callLlm).not.toHaveBeenCalled();
      expect(result.items).toEqual(["Solo Topic"]);
    });

    it("uses a valid model permutation as-is", async () => {
      mockOrder(["Conditionals", "Loops"]);
      const result = await sequenceConcepts("Subject", items, "gemini");
      expect(callLlm).toHaveBeenCalledTimes(1);
      expect(result.items).toEqual(["Conditionals", "Loops"]);
      expect(result.reordered).toBe(true);

      // The call must use the documented generation config.
      const config = (
        vi.mocked(callLlm).mock.calls[0][0] as {
          generationConfig?: { temperature?: number; maxOutputTokens?: number; responseMimeType?: string };
        }
      ).generationConfig;
      expect(config?.temperature).toBe(0.2);
      expect(config?.maxOutputTokens).toBe(1024);
      expect(config?.responseMimeType).toBe("application/json");
    });

    it("rejects a response that renames an item and falls back to deterministic order", async () => {
      mockOrder(["Loops", "Iteration"]); // "Conditionals" renamed to "Iteration"
      const result = await sequenceConcepts("Subject", items, "gemini");
      expect(result).toEqual(sequenceConceptsDeterministic(items, "Subject"));
    });

    it("rejects a response missing an item and falls back to deterministic order", async () => {
      mockOrder(["Loops"]); // "Conditionals" dropped
      const result = await sequenceConcepts("Subject", items, "gemini");
      expect(result).toEqual(sequenceConceptsDeterministic(items, "Subject"));
    });

    it("rejects a response with an extra item and falls back to deterministic order", async () => {
      mockOrder(["Loops", "Conditionals", "Recursion"]); // extra item invented
      const result = await sequenceConcepts("Subject", items, "gemini");
      expect(result).toEqual(sequenceConceptsDeterministic(items, "Subject"));
    });

    it("rejects malformed JSON and falls back to deterministic order", async () => {
      vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "not valid json at all" } as never);
      const result = await sequenceConcepts("Subject", items, "gemini");
      expect(result).toEqual(sequenceConceptsDeterministic(items, "Subject"));
    });

    it("falls back to deterministic order on an LLM API error, never throws", async () => {
      vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 500, body: "boom" } as never);
      const result = await sequenceConcepts("Subject", items, "gemini");
      expect(result).toEqual(sequenceConceptsDeterministic(items, "Subject"));
    });

    it("falls back to deterministic order when callLlm throws, never throws itself", async () => {
      vi.mocked(callLlm).mockRejectedValue(new Error("network down"));
      const result = await sequenceConcepts("Subject", items, "gemini");
      expect(result).toEqual(sequenceConceptsDeterministic(items, "Subject"));
    });
  });
});
