// Wiring guard for RC6 (docs/reply-resource-concepts-acceptance-criteria.md):
// vitest here is node-env and never renders a component (see this repo's own
// AGENTS.md note on that), so nothing ever clicked the "Search for
// resources" button or read the chip row's accessible text either - the
// class of defect that class of gap lets through is recorded across this
// project (GithubGradingPanel.wiring.test.ts's own header has the fullest
// account). This is a SOURCE-READING guard for the RC6 move and the chip
// row's accessible text, paired with canaries proving each pattern actually
// discriminates rather than reporting "clean" without checking anything (a
// hand-rolled scan doing exactly that has shipped here before).
//
// Comments are stripped before scanning, same habit as
// GithubGradingPanel.wiring.test.ts and syllabusUploadTransport.wiring.test.ts.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

function readSource(relativeToThisFile: string): string {
  return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const rowSource = readSource("./DiscussionReplyRow.tsx");
const resourcesSource = readSource("./DiscussionReplyResources.tsx");
// F7 fix (fixer pass): the two other files that used to restate the "; "
// concepts joiner as their own literal.
const useReplyResourcesSource = readSource("./useReplyResources.ts");
const repliesLogSource = readSource("./discussion-replies-log.ts");

describe("RC6: the Search for resources button moved out of DiscussionReplyRow.tsx", () => {
  // F9 fix (fixer pass): the negative alone cannot distinguish "moved" from
  // "deleted outright" - both leave rowSource without the label. Paired here
  // with the positive (resourcesSource still has it) in the SAME test, so a
  // regression that deletes the button rather than moving it fails THIS
  // test directly instead of relying on a separate describe block to notice.
  it("DiscussionReplyRow.tsx no longer renders the button's own visible label - moved, not deleted", () => {
    expect(rowSource).not.toContain("Search for resources");
    expect(resourcesSource).toContain("Search for resources");
  });

  it("DiscussionReplyRow.tsx no longer builds the button's old aria-label", () => {
    expect(rowSource).not.toMatch(/Search for resources for the reply to/);
  });

  it("DiscussionReplyResources.tsx renders the button's visible label and aria-label", () => {
    expect(resourcesSource).toContain("Search for resources");
    expect(resourcesSource).toMatch(/Search for resources for the reply to \$\{authorName\}/);
  });

  it("DiscussionReplyRow.tsx binds a stable onSearch callback and passes it down, never calling onSearchRow directly in JSX", () => {
    // The row still owns onSearchRow (the prop from the panel) but must bind
    // it through a useCallback, the same discipline handleRetryResources
    // already follows - a fresh arrow function passed straight into JSX
    // would defeat DiscussionReplyResources's own memo on every row whenever
    // an unrelated row's state changed.
    expect(rowSource).toMatch(/useCallback\(\(\) => onSearchRow\(row\.id\), \[onSearchRow, row\.id\]\)/);
    expect(rowSource).not.toMatch(/onClick=\{\(\) => onSearchRow\(row\.id\)\}/);
  });
});

describe("RC6: the search-terms chip row", () => {
  it("canary: the chip prefix pattern matches the real label", () => {
    expect(/Search terms:/.test('<span className={styles.ghMeta}>Search terms:</span>')).toBe(true);
  });

  it("DiscussionReplyResources.tsx renders the chip prefix", () => {
    expect(resourcesSource).toContain("Search terms:");
  });

  it("DiscussionReplyResources.tsx carries the exact hidden hint sentence, in the reading flow (not aria-describedby)", () => {
    const HINT = "Resource searches use these terms from the drafted reply. Editing the reply clears them.";
    expect(resourcesSource).toContain(HINT);
    // F9 fix (fixer pass): the old pattern (`aria-describedby={...ghBadges`)
    // could never fail against a real regression - an `aria-describedby`
    // attribute's VALUE holds an element id string, never the literal text
    // "ghBadges", so no attribute anyone would plausibly write matches that
    // pattern in the first place. Isolate the chip container's own OPENING
    // TAG (from `<span className={styles.ghBadges}` to its closing `>`) and
    // assert that exact tag carries no `aria-describedby` attribute at all -
    // R6's own reasoning: aria-describedby on a non-focusable span is
    // ignored by assistive tech, so the chip row must not rely on it.
    const chipTagStart = resourcesSource.indexOf("<span className={styles.ghBadges}");
    expect(chipTagStart).toBeGreaterThan(-1);
    const chipTagEnd = resourcesSource.indexOf(">", chipTagStart);
    const chipOpeningTag = resourcesSource.slice(chipTagStart, chipTagEnd + 1);
    expect(chipOpeningTag).not.toContain("aria-describedby");
  });

  it("the chip row carries no new CSS class - only the existing ghBadges/ghBadge/ghBadgeNeutral/ghMeta authorities", () => {
    expect(resourcesSource).toMatch(/styles\.ghBadges/);
    expect(resourcesSource).toMatch(/styles\.ghBadge\}\s*\$\{styles\.ghBadgeNeutral\}/);
  });
});

describe("RC6: the three explanatory lines are mutually exclusive on resourceQuerySource", () => {
  // Canaries: each pattern below must discriminate the real predicate from a
  // plausible near-miss before it is trusted against the live source.
  const CLEARED_BY_EDIT = /resourceQuerySource === "concepts"/;
  const NO_TERMS_DRAWN = /resourceQuerySource === "post" \|\| resourceQuerySource === "post-reply"/;

  it("canary: the cleared-by-edit gate is detected in a real predicate line", () => {
    expect(CLEARED_BY_EDIT.test('const showClearedByEdit = !hasConcepts && resourceQuerySource === "concepts";')).toBe(true);
  });

  it("canary: the cleared-by-edit gate does NOT match a predicate missing the source check", () => {
    // This is the exact sabotage performed and reverted while writing this
    // guard: deleting `resourceQuerySource === "concepts"` from
    // DiscussionReplyResources.tsx's `showClearedByEdit` (leaving only
    // `!hasConcepts`) turned this canary red with the mutation present,
    // confirming the pattern actually discriminates, then the file was
    // restored to the version below.
    expect(CLEARED_BY_EDIT.test("const showClearedByEdit = !hasConcepts;")).toBe(false);
  });

  it("canary: the no-terms-drawn gate is detected", () => {
    expect(
      NO_TERMS_DRAWN.test(
        'const sourceIsProse = resourceQuerySource === "post" || resourceQuerySource === "post-reply";'
      )
    ).toBe(true);
  });

  it("DiscussionReplyResources.tsx's three line predicates all reference resourceQuerySource", () => {
    expect(resourcesSource).toMatch(CLEARED_BY_EDIT);
    expect(resourcesSource).toMatch(NO_TERMS_DRAWN);
    // F7 fix: the "; " joiner is now the shared CONCEPT_JOINER export
    // (discussion-serialization.ts), never a restated literal - a drifted
    // literal here would silently make the stale-query comparison always
    // wrong. The third line (stale query) is gated on
    // concepts/resources/resourceQuery rather than resourceQuerySource
    // directly (RC6's own table), but must still compare resourceQuery
    // against concepts.join(CONCEPT_JOINER) to detect a mismatch, and the
    // whole trio must never render while searching.
    expect(resourcesSource).toMatch(/resourceQuery !== \(concepts \?\? \[\]\)\.join\(CONCEPT_JOINER\)/);
    expect(resourcesSource).toMatch(/!searching && showClearedByEdit/);
    expect(resourcesSource).toMatch(/!searching && showNoTermsDrawn/);
    expect(resourcesSource).toMatch(/!searching && showStaleQuery/);
  });

  // F2 fix (fixer pass): showNoTermsDrawn used to require `!hasConcepts`,
  // which left a silent gap - a row with CURRENT concepts but a prose-
  // sourced LAST search (and no resources yet) disclosed nothing, even
  // though the chip row's own hint claims the search used the terms shown.
  // Pinned here as its own predicate (`sourceIsProse && !(hasConcepts &&
  // hasResources)`), with a sabotage-style canary proving the pattern
  // actually discriminates the fixed predicate from the old, narrower one.
  it("showNoTermsDrawn fires for ANY prose source except when concepts+resources both already exist (F2)", () => {
    const SHOW_NO_TERMS_DRAWN = /showNoTermsDrawn = sourceIsProse && !\(hasConcepts && hasResources\)/;
    expect(resourcesSource).toMatch(SHOW_NO_TERMS_DRAWN);
    // Canary: the OLD predicate (`!hasConcepts && sourceIsProse`, the F2 bug)
    // must NOT match this pattern - proving the pattern discriminates the
    // fix from the regression it fixes.
    expect(SHOW_NO_TERMS_DRAWN.test("const showNoTermsDrawn = !hasConcepts && sourceIsProse;")).toBe(false);
  });

  it("the two frozen line texts for the no-terms-drawn case are both present, one per source", () => {
    expect(resourcesSource).toContain("Searched the post text - no terms were drawn from the reply.");
    expect(resourcesSource).toContain("Searched the post and your reply - no terms were drawn from the reply.");
  });

  it("the cleared-by-edit line's frozen text is present", () => {
    expect(resourcesSource).toContain("Search terms cleared - the next search uses your edited reply.");
  });
});

// F7 (fixer pass): the "; " joiner used to be a literal restated in three
// places - useReplyResources.ts's `resourceQueryForRow`, discussion-replies-
// log.ts's CSV row, and DiscussionReplyResources.tsx's `showStaleQuery`
// comparison. One drifted literal would not fail loudly (the comparison use
// would just be permanently right or permanently wrong), so this pins that
// all three now import the shared `CONCEPT_JOINER` export
// (discussion-serialization.ts) and none restates the literal next to a
// `join(` call.
describe("F7: the concepts joiner is CONCEPT_JOINER everywhere, never a restated literal", () => {
  it("all three files import CONCEPT_JOINER from discussion-serialization", () => {
    expect(useReplyResourcesSource).toMatch(/import \{ CONCEPT_JOINER \} from "\.\/discussion-serialization"/);
    expect(repliesLogSource).toMatch(/import \{ CONCEPT_JOINER \} from "\.\/discussion-serialization"/);
    expect(resourcesSource).toMatch(/import \{ CONCEPT_JOINER \} from "\.\/discussion-serialization"/);
  });

  it("none of the three files calls .join(\"; \") - the literal is never restated beside a join", () => {
    expect(useReplyResourcesSource).not.toMatch(/\.join\("; "\)/);
    expect(repliesLogSource).not.toMatch(/\.join\("; "\)/);
    expect(resourcesSource).not.toMatch(/\.join\("; "\)/);
  });
});
