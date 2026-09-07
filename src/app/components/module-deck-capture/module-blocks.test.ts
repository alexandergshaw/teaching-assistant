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
  reduceCaptureToMaterials,
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

// ---------------------------------------------------------------------------
// reduceCaptureToMaterials - the fixed four-stage pipeline, assembled.
// Extracted from ModuleDeckCapturePanel.tsx's handleGenerate so a second
// capture panel does not have to restate the ordering by hand.
// ---------------------------------------------------------------------------

describe("reduceCaptureToMaterials - stage order", () => {
  it("suppresses furniture BEFORE the seam join - a furniture line surviving into the join would duplicate itself at every seam it touches", () => {
    // "Nav Home" is in 3 of 4 batches (0.75, over the 0.6 furniture
    // threshold) and sits at every seam between batch 0/1 and 1/2. Furniture
    // suppression must remove it before the join ever compares those seams -
    // if it ran after (or not at all before the join), the join would try
    // to match "Nav Home" against "Nav Home" at each seam AS CONTENT, and
    // any seam where that match fails (batch 1/2, below) leaves it
    // duplicated straight through into the rendered text.
    const batches = [
      [block("Nav Home", ""), block("Para A", "")],
      [block("Nav Home", ""), block("Para A", ""), block("Para B", "")],
      [block("Nav Home", ""), block("Para B", ""), block("Para C", "")],
      [block("Para D", "")],
    ];
    const result = reduceCaptureToMaterials(batches);
    expect(result.text).not.toContain("Nav Home");
    expect(result.text).toBe(["Para A", "Para B", "Para C", "Para D"].join("\n\n"));
  });

  it("caps the FINAL rendered text last - capping an earlier stage's data reintroduces the tail-drop-across-headings bug DE16 exists to forbid", () => {
    // Two batches, two headings, no overlap between them (different
    // headings never merge - DE13). Rendered (correct order), the text
    // carries "## Week 4"/"## Week 5" markers that let capMaterialsText
    // downsample every heading-anchored segment proportionally, so both
    // headings' content survives the cap. Capped on any earlier
    // representation (e.g. the raw joined block text, with no "## " markers
    // at all) collapses to ONE segment and a naive head-keep on it would
    // silently drop the entire second heading - exactly the AC9 complaint
    // DE16 was written to answer.
    const aText = "a".repeat(300);
    const bText = "b".repeat(300);
    const batches = [[block(aText, "Week 4")], [block(bText, "Week 5")]];
    const result = reduceCaptureToMaterials(batches, 200);
    expect(result.text).toMatch(/materials capped/);
    expect(result.text).toContain("Week 4");
    expect(result.text).toContain("Week 5");
    expect(result.text).toContain("a");
    expect(result.text).toContain("b");
  });
});

describe("reduceCaptureToMaterials - anti-global-dedupe (AM-H) survives the composed pipeline", () => {
  it("a repeated short line across NON-adjacent batches survives (not eaten by a global dedupe set)", () => {
    // "Due Sunday" appears in batch 0 and batch 2, with batch 1 between them
    // - never at a shared seam - and stays under the furniture threshold
    // (2 of 4 batches, 0.5). A global Set<normalizedText> across the whole
    // run would silently delete the second real occurrence; this file's
    // design explicitly rejects that (see appendBatchBlocks's own header).
    const batches = [
      [block("Due Sunday", ""), block("Unrelated one", "")],
      [block("Unrelated two", "")],
      [block("Unrelated three", ""), block("Due Sunday", "")],
      [block("Unrelated four", "")],
    ];
    const result = reduceCaptureToMaterials(batches);
    expect(result.text.match(/Due Sunday/g)).toHaveLength(2);
  });

  it("an adjacent-batch overlap is still joined through the full composed pipeline, not just the underlying primitive", () => {
    // Each of "Para B", "Para C" and "Para D" is duplicated across exactly
    // one seam (and stays at 0.5 batch-presence, under the furniture
    // threshold) - the composed function must still collapse each seam
    // duplicate to a single occurrence.
    const batches = [
      [block("Para A", ""), block("Para B", "")],
      [block("Para B", ""), block("Para C", "")],
      [block("Para C", ""), block("Para D", "")],
      [block("Para D", ""), block("Para E", "")],
    ];
    const result = reduceCaptureToMaterials(batches);
    expect(result.text).toBe(["Para A", "Para B", "Para C", "Para D", "Para E"].join("\n\n"));
    for (const label of ["Para A", "Para B", "Para C", "Para D", "Para E"]) {
      expect(result.text.match(new RegExp(label, "g"))).toHaveLength(1);
    }
  });
});

describe("reduceCaptureToMaterials - reported counts match what actually happened", () => {
  it("charsRemoved/blocksAffected per stage and illegibleDropped are exactly what the pipeline did to this input", () => {
    // 4 batches, heading "W1" throughout (so the join's heading-equality
    // check never blocks a real seam match). "Nav Home" sits in every batch
    // (4/4 = 1.0, over threshold) and is removed as furniture; "Para A",
    // "Para B" and "Para C" each sit at exactly one seam (2/4 = 0.5, under
    // threshold) and survive suppression to be joined; the trailing block is
    // illegible and must be dropped (never rendered) but still counted.
    const batches = [
      [block("Nav Home", "W1"), block("Para A", "W1")],
      [block("Nav Home", "W1"), block("Para A", "W1"), block("Para B", "W1")],
      [block("Nav Home", "W1"), block("Para B", "W1"), block("Para C", "W1")],
      [block("Nav Home", "W1"), block("Para C", "W1"), block("Illegible text here", "W1", "prose", true)],
    ];
    const result = reduceCaptureToMaterials(batches);

    expect(result.stages).toEqual([
      { stage: "chrome-suppression", charactersRemoved: "Nav Home".length * 4, blocksAffected: 4 },
      { stage: "duplicate-join", charactersRemoved: "Para A".length + "Para B".length + "Para C".length },
      { stage: "control-text-removal", charactersRemoved: 0 },
      { stage: "proportional-downsampling", charactersRemoved: 0 },
    ]);
    expect(result.illegibleDropped).toBe(1);
    expect(result.blocks).toHaveLength(4); // 3 joined survivors + the illegible tail, pre-render
    expect(result.text).toBe(["## W1", "Para A", "Para B", "Para C"].join("\n\n"));
    expect(result.text).not.toContain("Illegible");
  });
});
