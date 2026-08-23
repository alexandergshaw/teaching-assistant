// Source-text guard for the "Use Canvas discussion checkpoints" checkbox
// (step-10 fixer round, frozen contract) - vitest here is node-env and
// renders no component (this file's own sibling header comments state the
// same limit repeatedly), so this reads GenerateFromSelectionSection.tsx as
// TEXT, the same idiom generatedPreviewModal.wiring.test.ts already uses for
// this exact file.
//
// WAVE 2 ADDITION (docs/bulk-bar-reorganization-acceptance-criteria.md,
// section 3b/D1/D3/D5): the describe blocks below this file's original
// checkpoints coverage pin implementer 2D's own three files -
// GenerateFromSelectionSection.tsx, DownloadSelectionSection.tsx,
// AskAiSelectionSection.tsx - wrapping their content in <BulkBarGroup> using
// the "generate"/"download"/"askAi" catalog groups. Extended here rather than
// in a new file because this is already the source-text-wiring home for
// GenerateFromSelectionSection.tsx and the added assertions are small enough
// not to earn a sibling file of their own. Every assertion pins the FACT and
// the ORDERING, never exact spelling (docs/DEV_LOOP.md section 9) - this repo
// has been bitten by over-specified string assertions twice already, most
// recently in this same feature area.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { BULK_BAR_GROUPS } from "./bulkBarGroups";

const SECTION_PATH = join(process.cwd(), "src/app/components/content-tab/modules/GenerateFromSelectionSection.tsx");
const DOWNLOAD_PATH = join(process.cwd(), "src/app/components/content-tab/modules/DownloadSelectionSection.tsx");
const ASK_AI_PATH = join(process.cwd(), "src/app/components/content-tab/modules/AskAiSelectionSection.tsx");
const source = readFileSync(SECTION_PATH, "utf8");
const downloadSource = readFileSync(DOWNLOAD_PATH, "utf8");
const askAiSource = readFileSync(ASK_AI_PATH, "utf8");

/** Source with line/block comments stripped, so a name mentioned only in
 * prose (e.g. this very file's own header, or either section file's own
 * header comment) is never mistaken for real code. Mirrors
 * askAiSelection.wiring.test.ts's own helper of the same name. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("stripComments (canary first)", () => {
  it("removes a // comment but leaves real code alone", () => {
    const fixture = ["// hasUnavailableReason: false used to live here", "hasUnavailableReason: generationError !== null,"].join("\n");
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain("hasUnavailableReason: false used to live here");
    expect(stripped).toContain("hasUnavailableReason: generationError !== null,");
  });
});

describe("GenerateFromSelectionSection - checkpoints checkbox", () => {
  it("declares useDiscussionCheckpoints/onUseDiscussionCheckpointsChange on its props interface", () => {
    expect(source).toMatch(/useDiscussionCheckpoints:\s*boolean/);
    expect(source).toMatch(/onUseDiscussionCheckpointsChange:\s*\(checked:\s*boolean\)\s*=>\s*void/);
  });

  it("SABOTAGE TARGET: is gated on introDiscussion being an offerable kind, mirroring the deck/script picker precedent", () => {
    // Pins the FACT (a boolean derived from `kinds.some(...)` testing
    // `.id === "introDiscussion"`) and the ORDERING (that boolean is declared
    // before it gates the checkbox's JSX block) - not the exact spelling.
    // Step-10 finding 3c: the previous regex pinned the arrow param's name
    // ("k"), its parenthesization, and its exact inline spacing, so a
    // behaviour-preserving reformat (renaming the param, or Prettier
    // reflowing the line) would break it despite nothing behavioural
    // changing - this repo has been bitten by exactly this twice already.
    const declMatch = source.match(
      /const\s+offersIntroDiscussion\s*=\s*kinds\.some\(\s*\(?(\w+)\)?\s*=>\s*\1\.id\s*===\s*["']introDiscussion["']\s*\)/
    );
    expect(declMatch).not.toBeNull();

    const gateMatch = source.match(/\{\s*offersIntroDiscussion\s*&&/);
    expect(gateMatch).not.toBeNull();

    // Ordering: the boolean must be declared before it gates the JSX.
    expect(declMatch!.index!).toBeLessThan(gateMatch!.index!);
  });

  it("renders a Checkbox bound to the checked/onChange props, disabled while busy - the same busy-gating every other control here uses", () => {
    expect(source).toMatch(/checked=\{useDiscussionCheckpoints\}/);
    // Pins the FACT that the handler forwards the native checkbox's
    // `.target.checked` to `onUseDiscussionCheckpointsChange`, not the exact
    // spelling of the event parameter's name (step-10 finding 3c).
    expect(source).toMatch(/onChange=\{\(?(\w+)\)?\s*=>\s*onUseDiscussionCheckpointsChange\(\s*\1\.target\.checked\s*\)\s*\}/);
    expect(source).toMatch(/disabled=\{busy !== ""\}/);
  });

  it("the tooltip states the Canvas admin requirement and what leaving it off does", () => {
    const titleMatch = source.match(/label="Use Canvas discussion checkpoints"[\s\S]*?title="([^"]+)"/);
    expect(titleMatch).not.toBeNull();
    const tooltip = titleMatch![1].toLowerCase();
    expect(tooltip).toContain("canvas admin");
    expect(tooltip).toContain("discussion checkpoints");
    expect(tooltip).toContain("normal graded discussion");
    expect(tooltip).toContain("one due date");
  });
});

describe("Wave 2: Generate/Download/Ask AI wrap their content in <BulkBarGroup> (section 3b/D1/D5)", () => {
  const strippedGenerate = stripComments(source);
  const strippedDownload = stripComments(downloadSource);
  const strippedAskAi = stripComments(askAiSource);

  it("each file imports BulkBarGroup from the sibling module, not a local reimplementation", () => {
    for (const stripped of [strippedGenerate, strippedDownload, strippedAskAi]) {
      expect(stripped).toMatch(/import\s*\{\s*BulkBarGroup\s*\}\s*from\s*["']\.\/BulkBarGroup["']/);
    }
  });

  /** Pulls the `group={...}` prop's own expression text off the file's one
   * <BulkBarGroup> tag - whatever that expression IS (a direct
   * `.find((g) => g.id === "id")`, the shared `groupById("id")` helper, or
   * some future replacement of either), so the assertion below pins the
   * FACT (this render site resolves its own catalog id) rather than the
   * spelling of any one lookup helper. Step-10 finding 15's own lesson,
   * applied here after a live instance of it: this test used to pin the
   * literal `.id === "id"` expression, so F2's landed `groupById(id)`
   * refactor - a behaviour-preserving rename of the SAME lookup - broke it
   * with nothing behavioural having changed. None of the three lookups this
   * test reads today (`.find(...)`, `groupById(...)`) contain a literal `}`
   * of their own, so slicing to the prop's first closing brace is safe. */
  function groupPropExpr(source: string): string {
    const tagStart = source.indexOf("<BulkBarGroup");
    expect(tagStart, "<BulkBarGroup is never rendered").toBeGreaterThan(-1);
    const propStart = source.indexOf("group={", tagStart);
    expect(propStart, "<BulkBarGroup has no group={...} prop").toBeGreaterThan(-1);
    const exprStart = propStart + "group={".length;
    const exprEnd = source.indexOf("}", exprStart);
    expect(exprEnd, "the group={...} prop is never closed").toBeGreaterThan(-1);
    return source.slice(exprStart, exprEnd);
  }

  it("each file renders exactly one <BulkBarGroup>, and its group={...} expression resolves its OWN catalog id", () => {
    const generateCount = [...strippedGenerate.matchAll(/<BulkBarGroup\b/g)].length;
    const downloadCount = [...strippedDownload.matchAll(/<BulkBarGroup\b/g)].length;
    const askAiCount = [...strippedAskAi.matchAll(/<BulkBarGroup\b/g)].length;
    expect(generateCount).toBe(1);
    expect(downloadCount).toBe(1);
    expect(askAiCount).toBe(1);

    expect(groupPropExpr(strippedGenerate)).toContain('"generate"');
    expect(groupPropExpr(strippedDownload)).toContain('"download"');
    expect(groupPropExpr(strippedAskAi)).toContain('"askAi"');
  });

  it("SABOTAGE TARGET: never gates the wrapped body on `open` (D3 hard rule)", () => {
    // A native <details> hides its content without unmounting it - gating
    // the body on `open` here would unmount this section's three persisted
    // controls (deck template select, video length select, checkpoints
    // checkbox) whenever their group collapses, so none of them could ever
    // write their persisted default while collapsed. Checked as a structural
    // absence, not a spelling: any `open &&`-shaped guard fails this,
    // regardless of surrounding whitespace.
    for (const stripped of [strippedGenerate, strippedDownload, strippedAskAi]) {
      expect(stripped).not.toMatch(/\{\s*open\s*&&/);
    }
  });

  it("passes facts/state through to <BulkBarGroup> as bare identifiers, not re-derived locally", () => {
    // D4's "no arrow-function props" rule applies at the ModulesView render
    // sites, not here - but this section's own <BulkBarGroup> call must still
    // forward the SAME facts/state objects it received as props, never a
    // fresh object literal, or a group's collapse state could silently drift
    // from the rest of the bar's.
    expect(strippedGenerate).toMatch(/<BulkBarGroup[^>]*\bfacts=\{facts\}/);
    expect(strippedGenerate).toMatch(/<BulkBarGroup[^>]*\bstate=\{groupsState\}/);
    expect(strippedDownload).toMatch(/<BulkBarGroup[^>]*\bfacts=\{facts\}/);
    expect(strippedDownload).toMatch(/<BulkBarGroup[^>]*\bstate=\{groupsState\}/);
    expect(strippedAskAi).toMatch(/<BulkBarGroup[^>]*\bfacts=\{facts\}/);
    expect(strippedAskAi).toMatch(/<BulkBarGroup[^>]*\bstate=\{groupsState\}/);
  });
});

describe("Wave 2: download/askAi default closed, generate does not (AC3/D0, real data not source-text)", () => {
  // Reads the actual shipped catalog rather than grepping bulkBarGroupCatalog.ts's
  // text, so this is exercising the same data every BulkBarGroup instance
  // reads at runtime - a source-text regex on the catalog file could pass
  // while the exported array itself disagreed (e.g. a second, dead literal).
  function findGroup(id: string) {
    const group = BULK_BAR_GROUPS.find((g) => g.id === id);
    if (!group) throw new Error(`test setup: no group with id "${id}"`);
    return group;
  }

  it("SABOTAGE TARGET: download and askAi declare defaultOpen: false; generate declares defaultOpen: true", () => {
    expect(findGroup("download").defaultOpen).toBe(false);
    expect(findGroup("askAi").defaultOpen).toBe(false);
    expect(findGroup("generate").defaultOpen).toBe(true);
  });

  it("download and askAi are read-only tier the moment they are visible, which is what licenses defaultOpen: false", () => {
    // The other side of the same coin: a group is only ALLOWED to default
    // closed because it starts read-only (auditGroupModel's I3, bulkBarGroups.ts) -
    // pinning both sides here means a future change that flips one without
    // the other fails a test in this describe block, not just the shared
    // audit's.
    for (const id of ["download", "askAi"] as const) {
      const group = findGroup(id);
      for (const control of group.controls) {
        expect(control.tier === "read-only", `${id}/${control.id} is tier "${control.tier}", not read-only`).toBe(true);
      }
    }
  });
});

describe("Wave 2: the generation error uses the failure style, still inside the aria-live region (the defect fix)", () => {
  // GenerateFromSelectionSection.tsx used to render this span with
  // styles.bulkHint (0.73rem, var(--text-secondary)) - visually identical to
  // the purely-informational hint beside it, so a FAILURE read exactly like a
  // note. .bulkError (page.module.css) is the fix: same layout, var(--danger),
  // weight 600. Bounded to the `{generationError &&` block specifically, so a
  // stray mention of styles.bulkError elsewhere in the file could not satisfy
  // this by accident.
  const stripped = stripComments(source);
  const blockStart = stripped.indexOf("{generationError &&");

  it("locates the generationError block", () => {
    expect(blockStart).toBeGreaterThan(-1);
  });

  // Bounded to the block's own closing `)}`, not a fixed character count -
  // the sibling `.bulkHint` span immediately after this one in the file is
  // otherwise close enough to leak into a wider fixed-size slice and make
  // the "not styles.bulkHint" assertion below pass for the wrong reason.
  const blockEnd = stripped.indexOf(")}", blockStart);
  const block = stripped.slice(blockStart, blockEnd + 2);

  it("SABOTAGE TARGET: renders with styles.bulkError, not styles.bulkHint", () => {
    expect(block).toMatch(/className=\{styles\.bulkError\}/);
    expect(block).not.toMatch(/className=\{styles\.bulkHint\}/);
  });

  it("stays inside a role=\"status\" aria-live=\"polite\" region (never weakened to a silent span)", () => {
    expect(block).toMatch(/role="status"/);
    expect(block).toMatch(/aria-live="polite"/);
  });

  it("never becomes a title attribute (E3) - the span always renders the error as visible text", () => {
    expect(block).toMatch(/\{generationError\}/);
    expect(block).not.toMatch(/title=\{generationError\}/);
  });

  // Step-10 finding 3 (fixer round): `busy` alone used to gate force-open,
  // and `busy` returns to "" in the SAME update that sets `generationError`
  // (useLmsGeneration's `generate`) - so a failed generation behind an
  // already-collapsed group rendered this banner into a closed <details>,
  // exactly the bug commit f20f470 fixed once already. Mirrors
  // DownloadSelectionSection.tsx's own `hasUnavailableReason:
  // imsccUnavailableReason !== null || zipUnavailableReason !== null`
  // precedent, pinned two describe blocks below.
  it("SABOTAGE TARGET: a live generationError force-opens this group via hasUnavailableReason, independent of busy", () => {
    expect(stripped).toMatch(/hasUnavailableReason:\s*generationError !== null/);
  });
});

describe("Wave 2: Download's aria-describedby reason triples still render after the BulkBarGroup wrap (E3)", () => {
  const stripped = stripComments(downloadSource);

  it("both buttons keep aria-disabled + aria-describedby driven by their own unavailable reason", () => {
    expect(stripped).toMatch(/aria-disabled=\{imsccUnavailableReason \? "true" : undefined\}/);
    expect(stripped).toMatch(/aria-describedby=\{imsccUnavailableReason \? ids\.get\(imsccUnavailableReason\) : undefined\}/);
    expect(stripped).toMatch(/aria-disabled=\{zipUnavailableReason \? "true" : undefined\}/);
    expect(stripped).toMatch(/aria-describedby=\{zipUnavailableReason \? ids\.get\(zipUnavailableReason\) : undefined\}/);
  });

  it("SABOTAGE TARGET: still renders one visible hint span per distinct reason, each with a matching id", () => {
    // Pins the FACT that reasonIds' output is mapped into rendered spans
    // whose `id` matches what aria-describedby points at - not the exact
    // arrow-param destructuring spelling (a reformat of `([reason, id])`
    // should not fail this).
    expect(stripped).toMatch(/ids\.entries\(\)\]\.map\(/);
    expect(stripped).toMatch(/<span\s+key=\{id\}\s+id=\{id\}\s+className=\{styles\.bulkHint\}>/);
  });

  it("the reason-driving unavailable state also forces this default-closed group open (D1's hasUnavailableReason)", () => {
    expect(stripped).toMatch(/hasUnavailableReason:\s*imsccUnavailableReason !== null \|\| zipUnavailableReason !== null/);
  });
});
