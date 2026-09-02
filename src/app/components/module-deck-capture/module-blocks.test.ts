// Unit tests for the pure module-blocks module (module-walkthrough deck
// feature, docs/module-walkthrough-deck-acceptance-criteria.md section 7).
//
// `ExtractedBlock`/`ModuleBlockKind` are owned by the sibling
// module-extraction-prompt.ts. Its landed shape:
//   type ModuleBlockKind = "prose" | "list" | "table" | "code" | "caption" | "objectives" | "activity"
//   interface ExtractedBlock { heading: string; text: string; kind: ModuleBlockKind; illegible?: boolean }
// There is no "heading" block kind - `heading` is a field every block
// carries, naming the section it belongs to (see module-blocks.ts's own
// header for why - this differs from an earlier draft of this feature's
// brief, which described a separate heading/subheading block kind that was
// never actually landed).
//
// Every behaviour here was sabotage-checked by hand before this file was
// finalized (mutate the implementation, confirm the specific test goes red,
// restore, confirm green) - see the report handed back to the dispatcher for
// the list of sabotages run and their results.

import { describe, it, expect } from "vitest";
import {
  OVERLAP_WINDOW,
  FURNITURE_FREQUENCY_THRESHOLD,
  DECK_MATERIALS_CAP,
  suppressPageFurniture,
  appendBatchBlocks,
  renderMaterialsText,
  capMaterialsText,
} from "./module-blocks";
import type { ExtractedBlock, ModuleBlockKind } from "./module-extraction-prompt";

function block(text: string, heading = "Week 4", kind: ModuleBlockKind = "prose", illegible?: boolean): ExtractedBlock {
  return { heading, text, kind, illegible };
}

// ---------------------------------------------------------------------------
// appendBatchBlocks (AM-H): seam overlap-join, never a global set.
// ---------------------------------------------------------------------------

describe("appendBatchBlocks", () => {
  it("first batch (batchIndex 0): just concatenates, nothing to join against yet", () => {
    const incoming = [block("Intro paragraph")];
    expect(appendBatchBlocks([], incoming, 0)).toEqual(incoming);
  });

  it("joins a scroll overlap by dropping the duplicated head of the incoming batch", () => {
    const accumulated = [block("Para A"), block("Para B"), block("Para C")];
    // The last two blocks of `accumulated` reappear at the head of `incoming`
    // (the scroll-overlap case), followed by genuinely new content.
    const incoming = [block("Para B"), block("Para C"), block("Para D")];
    const result = appendBatchBlocks(accumulated, incoming, 1);
    expect(result.map((b) => b.text)).toEqual(["Para A", "Para B", "Para C", "Para D"]);
  });

  it("LARGEST overlap wins where a smaller window also matches", () => {
    // "Repeat" appears three times in a row at the end of `accumulated` and
    // three times in a row at the start of `incoming` - so k=1, k=2 AND k=3
    // are all simultaneously valid contiguous matches. The true overlap is
    // the full 3-block run: taking a smaller match (even one later patched
    // by the single seam-only near-duplicate check, which can only fix ONE
    // adjacent collision) leaves extra "Repeat"s duplicated behind that the
    // seam step cannot reach.
    const accumulated = [block("Para A"), block("Repeat"), block("Repeat"), block("Repeat")];
    const incoming = [block("Repeat"), block("Repeat"), block("Repeat"), block("Para E")];
    const result = appendBatchBlocks(accumulated, incoming, 1);
    expect(result.map((b) => b.text)).toEqual(["Para A", "Repeat", "Repeat", "Repeat", "Para E"]);
    expect(result.filter((b) => b.text === "Repeat")).toHaveLength(3);
  });

  it("does not detect an overlap longer than OVERLAP_WINDOW blocks at all", () => {
    // A duplicated run longer than the window cannot be matched by ANY k up
    // to OVERLAP_WINDOW (the window only checks a contiguous run of that
    // length, and the true overlap here is longer) - documents the
    // constant's actual reach rather than asserting behaviour past it.
    const longRun = Array.from({ length: OVERLAP_WINDOW + 2 }, (_, i) => block(`Shared ${i}`));
    const accumulated = longRun;
    const incoming = [...longRun, block("New tail")];
    const result = appendBatchBlocks(accumulated, incoming, 1);
    expect(result.length).toBe(accumulated.length + incoming.length);
  });

  it("a legitimately repeated SHORT line elsewhere in the run is NOT collapsed by the join", () => {
    // "Due Sunday" appears twice, separated by unrelated content and NOT at
    // the batch seam - the join must never delete the second real
    // occurrence (the global-Set trap this design explicitly rejects).
    const accumulated = [block("Due Sunday"), block("Unrelated paragraph one")];
    const incoming = [block("Unrelated paragraph two"), block("Due Sunday"), block("Unrelated paragraph three")];
    const result = appendBatchBlocks(accumulated, incoming, 1);
    expect(result.filter((b) => b.text === "Due Sunday")).toHaveLength(2);
    expect(result.map((b) => b.text)).toEqual([
      "Due Sunday",
      "Unrelated paragraph one",
      "Unrelated paragraph two",
      "Due Sunday",
      "Unrelated paragraph three",
    ]);
  });

  it("the same text under a DIFFERENT heading is a real repeat, not a scroll-duplicate, and both survive", () => {
    // Same normalized text, but the second occurrence is genuinely under a
    // different section - text-only matching would wrongly eat it.
    const accumulated = [block("Read the following", "Week 4"), block("Body under week 4", "Week 4")];
    const incoming = [block("Read the following", "Week 5"), block("Body under week 5", "Week 5")];
    const result = appendBatchBlocks(accumulated, incoming, 1);
    expect(result.filter((b) => b.text === "Read the following")).toHaveLength(2);
    expect(result).toHaveLength(4);
  });

  it("seam-only near-duplicate merge: a paragraph read half in one batch and fully in the next keeps the longer reading", () => {
    const accumulated = [block("Para A"), block("The quick brown fox jumps")];
    const incoming = [block("The quick brown fox jumps over the lazy dog"), block("Para C")];
    const result = appendBatchBlocks(accumulated, incoming, 1);
    expect(result.map((b) => b.text)).toEqual(["Para A", "The quick brown fox jumps over the lazy dog", "Para C"]);
  });

  it("never merges two DIFFERENT headings' content at a seam even when one heading's text is a prefix of the other's (DE13)", () => {
    const accumulated = [block("Body under week 4", "Week 4: Abstraction and Representation")];
    const incoming = [
      block("Body under week 4 part 2", "Week 4: Abstraction and Representation Part 2"),
      block("More body", "Week 4: Abstraction and Representation Part 2"),
    ];
    const result = appendBatchBlocks(accumulated, incoming, 1);
    // Both distinct headings' content survives as separate blocks - no merge
    // across the segment boundary, even though the seam text ("Body under
    // week 4" / "Body under week 4 part 2") would otherwise look like a
    // partial-read continuation.
    expect(result.map((b) => b.text)).toEqual(["Body under week 4", "Body under week 4 part 2", "More body"]);
    expect(result.map((b) => b.heading)).toEqual([
      "Week 4: Abstraction and Representation",
      "Week 4: Abstraction and Representation Part 2",
      "Week 4: Abstraction and Representation Part 2",
    ]);
  });
});

// ---------------------------------------------------------------------------
// suppressPageFurniture (DE12)
// ---------------------------------------------------------------------------

describe("suppressPageFurniture", () => {
  it("removes a normalized line appearing in every batch, and counts it", () => {
    const batches: ExtractedBlock[][] = [
      [block("Nav Home | Modules | Grades"), block("Real content one")],
      [block("Nav Home | Modules | Grades"), block("Real content two")],
      [block("Nav Home | Modules | Grades"), block("Real content three")],
    ];
    const result = suppressPageFurniture(batches);
    expect(result.batches.every((b) => b.every((blk) => blk.text !== "Nav Home | Modules | Grades"))).toBe(true);
    expect(result.blocksRemoved).toBe(3);
    expect(result.charsRemoved).toBe("Nav Home | Modules | Grades".length * 3);
    expect(result.furnitureLineCount).toBe(1);
  });

  it("does not remove a line at or under the frequency threshold", () => {
    // Present in 1 of 3 batches - well under FURNITURE_FREQUENCY_THRESHOLD.
    const batches: ExtractedBlock[][] = [[block("Occasional repeat")], [block("Something else")], [block("Something else again")]];
    const result = suppressPageFurniture(batches);
    expect(result.blocksRemoved).toBe(0);
    expect(result.charsRemoved).toBe(0);
    expect(FURNITURE_FREQUENCY_THRESHOLD).toBeGreaterThan(1 / 3);
  });

  it("counts PRESENCE per batch, not raw occurrence count within a batch", () => {
    // "Footer" appears twice in the SAME batch and never again - presence is
    // 1 of 3 batches (0.33), not 2 raw occurrences over 3 batches (0.67,
    // which WOULD cross FURNITURE_FREQUENCY_THRESHOLD) - so it must not be
    // classified as furniture.
    const batches: ExtractedBlock[][] = [[block("Footer"), block("Footer"), block("Content")], [block("Other content")], [block("Yet more content")]];
    const result = suppressPageFurniture(batches);
    expect(result.blocksRemoved).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// renderMaterialsText
// ---------------------------------------------------------------------------

describe("renderMaterialsText", () => {
  it("renders a heading-field transition, objectives, code, table and plain prose with the documented prefixes", () => {
    const blocks: ExtractedBlock[] = [
      block("Understand recursion\nUnderstand abstraction", "Week 4: Abstraction", "objectives"),
      block("const x = 1;", "Week 4: Abstraction", "code"),
      block("Row 1 | A\nRow 2 | B", "Week 4: Abstraction", "table"),
      block("A plain paragraph.", "Week 4: Abstraction", "prose"),
    ];
    const { text, illegibleDropped } = renderMaterialsText(blocks);
    expect(illegibleDropped).toBe(0);
    expect(text).toBe(
      [
        "## Week 4: Abstraction",
        "- Understand recursion\n- Understand abstraction",
        "```\nconst x = 1;\n```",
        "| Row 1 | A\n| Row 2 | B",
        "A plain paragraph.",
      ].join("\n\n")
    );
  });

  it("only emits a heading line ONCE per heading, on the transition, not on every block under it", () => {
    const blocks: ExtractedBlock[] = [block("First", "Week 4", "prose"), block("Second", "Week 4", "prose")];
    const { text } = renderMaterialsText(blocks);
    expect(text.match(/## Week 4/g)).toHaveLength(1);
  });

  it("drops illegible blocks and counts them, never rendering their text", () => {
    const blocks: ExtractedBlock[] = [block("Real content", ""), block("the paragraph below is too blurred to read", "", "objectives", true)];
    const { text, illegibleDropped } = renderMaterialsText(blocks);
    expect(illegibleDropped).toBe(1);
    expect(text).toBe("Real content");
    expect(text).not.toContain("blurred");
  });

  it("joins consecutive list-like blocks under the same heading with a single newline, not a blank line", () => {
    const blocks: ExtractedBlock[] = [block("First item", "Week 4", "objectives"), block("Second item", "Week 4", "list")];
    const { text } = renderMaterialsText(blocks);
    expect(text).toBe("## Week 4\n\n- First item\n- Second item");
  });
});

// ---------------------------------------------------------------------------
// capMaterialsText (DE16): never tail-truncate.
// ---------------------------------------------------------------------------

describe("capMaterialsText", () => {
  it("returns the text unchanged, uncut, when already under the cap", () => {
    const result = capMaterialsText("short text", 1000);
    expect(result).toEqual({ text: "short text", controlTextCharsRemoved: 0, downsampledCharsRemoved: 0, cut: false });
  });

  it("downsamples PROPORTIONALLY across every heading-anchored segment rather than dropping the tail", () => {
    const segmentA = "## Week 4\n" + "a".repeat(300);
    const segmentB = "## Week 5\n" + "b".repeat(300);
    const text = `${segmentA}\n\n${segmentB}`;
    const result = capMaterialsText(text, 400);
    expect(result.cut).toBe(true);
    // Content from BOTH segments survives - the end of the document (Week 5)
    // is not silently discarded the way a tail-slice would discard it.
    expect(result.text).toContain("Week 4");
    expect(result.text).toContain("Week 5");
    expect(result.text).toContain("a");
    expect(result.text).toContain("b");
    expect(result.text).toMatch(/materials capped/);
  });

  it("never lets a segment vanish to zero characters - each survives at or above the floor", () => {
    const many = Array.from({ length: 10 }, (_, i) => `## Section ${i}\n` + "x".repeat(500)).join("\n\n");
    const result = capMaterialsText(many, 1000);
    for (let i = 0; i < 10; i++) {
      expect(result.text).toContain(`Section ${i}`);
    }
  });

  it("strips conservative non-content control lines before downsampling, and counts them", () => {
    const text = `next\n\n## Week 4\n${"x".repeat(50)}`;
    const result = capMaterialsText(text, 40);
    expect(result.controlTextCharsRemoved).toBeGreaterThan(0);
    expect(result.text).not.toMatch(/^next$/m);
  });

  it("DECK_MATERIALS_CAP is 120000, per DE14", () => {
    expect(DECK_MATERIALS_CAP).toBe(120_000);
  });
});
