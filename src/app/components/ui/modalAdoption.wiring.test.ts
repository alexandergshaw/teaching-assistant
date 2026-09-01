// AC8's derived inventory guard - docs/modal-dismissal-focus-acceptance-
// criteria.md. The scan (the tree walk, the classification predicates, the
// four allowlists, and the derived sets) lives in modalAdoptionScan.ts, a
// non-test module shared with modalAdoptionWiring.attributes.test.ts - see
// that module's header comment for the full contract of what a "dialog site"
// and "adopts" mean, and for the four lists' own reasoning.
//
// THIS FILE covers the INVENTORY half of the split: the classification
// predicate canaries, the count pins, the four-list two-directional honesty
// checks (AC7, AC8), and the wave-2/wave-3 "known adopters really do adopt"
// double-checks (AC8 point 6). The per-site ATTRIBUTE assertions - the
// hook-only adopters' ref/tabIndex/role/aria-modal/aria-label, the backdrop
// carrying no ARIA, and the ModalShell structure assertions (AC9) - live in
// modalAdoptionWiring.attributes.test.ts instead. Splitting this way (rather
// than, say, alphabetically) keeps every test that reasons about "which files
// are on which list" in one file and every test that reasons about "what does
// this one file's markup look like" in the other.
//
// This file also owns the bundle guard on modalAdoptionScan.ts itself: that
// module imports `node:fs`, and it lives under `src/app`, so an application
// file importing it would pull a node builtin into the client bundle - see
// modalAdoptionScan.ts's own header comment.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  APP_ROOT,
  walkFiles,
  stripComments,
  importsMuiDialog,
  importsModalShellComponent,
  importsUseModalDismissHook,
  adoptsSharedMechanism,
  findOpeningTagEnd,
  tagAt,
  isDialogSite,
  toRepoRelativePosix,
  isSubstantiveReason,
  PERMANENT_EXCLUSIONS,
  DEFERRED_CLASS_MISMATCH,
  PENDING_ADOPTION,
  PARTIALLY_ADOPTED,
  ALL_TSX_FILES,
  DIALOG_SITES,
  ADOPTING_PATHS,
  ADOPTING_WITH_LEFTOVER_BACKDROP_MARKER,
} from "./modalAdoptionScan";

// ---------------------------------------------------------------------------
// The nine wave-2 adopters (commit f16c7aa, entry 279 check 1) - used only
// to double-check, from the SAME scan (modalAdoptionScan.ts), that they
// really do show up adopting. Not a substitute file list: every path here
// must independently appear as an adopting dialog site in ADOPTING_PATHS for
// the checks below to pass.
// ---------------------------------------------------------------------------
const WAVE2_ADOPTERS: readonly string[] = [
  "src/app/components/FilePreviewModal.tsx",
  "src/app/components/DocumentPreviewModal.tsx",
  "src/app/components/CsvPreviewModal.tsx",
  "src/app/components/SyllabusPreviewModal.tsx",
  "src/app/components/RubricPreviewModal.tsx",
  "src/app/components/courses/AskAiModal.tsx",
  "src/app/components/content-tab/modules/GeneratedPreviewModal.tsx",
  "src/app/components/content-tab/BulkQuestionsModal.tsx",
  "src/app/components/content-tab/AssignmentPreviewModal.tsx",
];

/** The C3 wave's nine files, ten dialogs (docs/modal-dismissal-focus-
 * acceptance-criteria.md's C3 table; inbox-panel.tsx contributes two). Same
 * caveat as WAVE2_ADOPTERS above. */
const WAVE3_ADOPTERS: readonly string[] = [
  "src/app/components/content-tab/BulkCreateModulesModal.tsx",
  "src/app/components/content-tab/RenameModulesModal.tsx",
  "src/app/components/content-tab/PageEditorModal.tsx",
  "src/app/components/content-tab/BulkUploadModal.tsx",
  "src/app/components/content-tab/SchedulerModal.tsx",
  "src/app/components/content-tab/RubricBuilderModal.tsx",
  "src/app/components/content-tab/CourseCopyModal.tsx",
  "src/app/components/content-tab/GradableEditorModal.tsx",
  "src/app/components/canvas-tab/inbox-panel.tsx",
];

/** The C5 wave's five sites (docs/modal-dismissal-focus-acceptance-
 * criteria.md's "C5 implementation notes" - the four PENDING_ADOPTION sites
 * plus OfficeEditorModal.tsx's outer dialog, the sole PARTIALLY_ADOPTED
 * entry, both now empty in modalAdoptionScan.ts). Same caveat as
 * WAVE2_ADOPTERS/WAVE3_ADOPTERS above: not a substitute file list, only a
 * double-check against the SAME scan.
 *
 * Unlike wave 4 - whose double-check (HOOK_DESTRUCTURE_SITES in
 * modalAdoptionWiring.attributes.test.ts) is fully tree-derived, because
 * every wave-4 site shares one structural marker: a `const { containerRef... }
 * = useModalDismiss(...)` destructure hand-wiring the hook's own ref onto an
 * element (see that set's own comment in modalAdoptionScan.ts for why this,
 * and not "imports the hook but not ModalShell", is the right marker) - wave
 * 5 has no such single marker to derive membership from. It mixes
 * mechanisms: four take ModalShell (GradingResults.tsx,
 * drafted-grades/CommentEditModal.tsx, knowledge/AttachmentPreviewModal.tsx,
 * and OfficeEditorModal.tsx's now-converted OUTER dialog) and one takes the
 * hook only (AccessibilityCenter.tsx, which then joins
 * HOOK_DESTRUCTURE_SITES itself - see that set's own updated comment in
 * modalAdoptionScan.ts). "Which wave converted this file" is a historical
 * fact the tree does not encode, which is exactly why WAVE2_ADOPTERS and
 * WAVE3_ADOPTERS are named lists too rather than derived ones - this list
 * follows their style for the same reason, not by omission. */
const WAVE5_ADOPTERS: readonly string[] = [
  "src/app/components/AccessibilityCenter.tsx",
  "src/app/components/GradingResults.tsx",
  "src/app/components/drafted-grades/CommentEditModal.tsx",
  "src/app/components/knowledge/AttachmentPreviewModal.tsx",
  "src/app/components/content-tab/OfficeEditorModal.tsx",
];

describe("the classification predicates (canaries first, per entry 239 check 10)", () => {
  it("strips a comment that merely mentions a marker string, keeping real code intact", () => {
    const src = ['// see `styles.previewBackdrop` in the other file', "export const x = 1;"].join("\n");
    const stripped = stripComments(src);
    expect(stripped).not.toContain("styles.previewBackdrop");
    expect(stripped).toContain("export const x = 1;");
  });

  // The concrete false positive this predicate has to survive:
  // DownloadSelectionSection.tsx's own header comment says its row "RENDERS
  // NO MODAL, DIALOG, POPOVER OR FIXED-POSITION OVERLAY, on purpose" and then
  // explains why using the literal phrase `styles.previewBackdrop` - a raw
  // substring match against unstripped source would misclassify exactly the
  // file that documents NOT being a dialog.
  it("does not classify a component as a dialog site from a comment alone", () => {
    const src = [
      "// RENDERS NO MODAL, DIALOG, POPOVER OR FIXED-POSITION OVERLAY, on purpose:",
      "// this row lives inside a sticky header, and the guard test fails any",
      "// component the header renders that contains `styles.previewBackdrop`.",
      "export default function Row() { return <div>hi</div>; }",
    ].join("\n");
    expect(isDialogSite(stripComments(src))).toBe(false);
  });

  it("recognises the raw previewBackdrop/role=dialog markup as an un-adopted dialog site", () => {
    const src =
      '<div className={styles.previewBackdrop} onClick={onClose}>' +
      '<section role="dialog" aria-modal="true">{children}</section></div>';
    expect(isDialogSite(src)).toBe(true);
    expect(adoptsSharedMechanism(src)).toBe(false);
  });

  it("recognises a ModalShell or useModalDismiss import as adoption, rejects a same-prefix decoy, and tells the two apart individually", () => {
    expect(adoptsSharedMechanism('import { ModalShell } from "../ui/ModalShell";')).toBe(true);
    expect(adoptsSharedMechanism('import { ModalShell } from "./ui/ModalShell";')).toBe(true);
    expect(adoptsSharedMechanism('import { useModalDismiss } from "./useModalDismiss";')).toBe(true);
    // A hypothetical module that merely SHARES A PREFIX with useModalDismiss
    // must not count - the regex requires the path segment to end exactly at
    // the closing quote, not just start with the right letters.
    expect(adoptsSharedMechanism('import { useModalShellPrefs } from "../settings/useModalShellPrefs";')).toBe(false);
    // The OR's two halves must also tell shell and hook apart individually.
    expect(importsModalShellComponent('import { ModalShell } from "../ui/ModalShell";')).toBe(true);
    expect(importsModalShellComponent('import { useModalDismiss } from "./useModalDismiss";')).toBe(false);
    expect(importsUseModalDismissHook('import { useModalDismiss } from "./useModalDismiss";')).toBe(true);
    expect(importsUseModalDismissHook('import { ModalShell } from "../ui/ModalShell";')).toBe(false);
  });

  it("recognises both MUI Dialog import shapes, and is not fooled by DialogTitle/DialogContent alone", () => {
    expect(importsMuiDialog('import Dialog from "@mui/material/Dialog";')).toBe(true);
    expect(
      importsMuiDialog(
        ['import {', "  IconButton,", "  Dialog,", "  DialogTitle,", '} from "@mui/material";'].join("\n"),
      ),
    ).toBe(true);
    expect(importsMuiDialog('import { DialogTitle, DialogContent, DialogActions } from "@mui/material";')).toBe(
      false,
    );
  });

  it("adopting also counts as a dialog site, even with no raw markers left in the file's own source", () => {
    // An adopted file's role/backdrop markers live inside ModalShell.tsx, not
    // in the adopting file's own source - so adoption itself must be one of
    // the OR'd conditions, or an adopted file would silently drop out of the
    // scan entirely (making AC8 point 6 unfalsifiable - see modalAdoptionScan.ts's
    // header comment).
    expect(isDialogSite('import { ModalShell } from "../ui/ModalShell";')).toBe(true);
  });

  it("findOpeningTagEnd finds the real tag-closing `>`, not the one inside an arrow function's `=>` (every C4 backdrop/content div has one)", () => {
    const src = '<div onClick={() => doThing()} style={{ a: 1 }} role="dialog">CHILD<span>not the tag</span>';
    const tagStart = src.indexOf("<div");
    const tagEnd = findOpeningTagEnd(src, tagStart);
    expect(src.slice(tagStart, tagEnd + 1)).toBe('<div onClick={() => doThing()} style={{ a: 1 }} role="dialog">');
    expect(findOpeningTagEnd("<div onClick={() => x()}", 0)).toBe(-1);
  });
});

describe("inventory sanity - the scan is not vacuous", () => {
  it("walks a realistic number of .tsx files under src/app", () => {
    expect(ALL_TSX_FILES.length).toBeGreaterThan(100);
  });

  // WHAT THIS PIN COUNTS, AND WHY IT DOES NOT CLEANLY RECONCILE WITH ENTRY
  // 273. DIALOG_SITES.length counts FILES matched by isDialogSite's markers
  // (modalAdoptionScan.ts's header comment), after MECHANISM_PATH
  // (ModalShell.tsx) is excluded from the walk - it is not "overlay dialogs"
  // in entry 273's sense, and the two numbers differ in KIND, not just
  // arithmetic:
  //   1. Entry 273 counts DIALOGS, and is internally inconsistent about how
  //      many: its headline says 42, but its own family breakdown sums to
  //      13 (A1) + 13 (A2) + 5 (B) + 1 (C) + 3 (D) + 7 (E) = 42, PLUS
  //      TaskCell's Popper described separately as "one in no family" = 43.
  //      Entry 273 owns that 42-vs-43 discrepancy; this file does not
  //      attempt to resolve it. Separately, `inbox-panel.tsx` and
  //      `OfficeEditorModal.tsx` each hold two of those dialogs in one file
  //      (entry 273 check 7), so even a correct dialog count is never equal
  //      to a file count.
  //   2. This scan matches `role="alertdialog"` (blocker 4 / KnowledgeTab.tsx),
  //      a marker entry 273 never counted, because it is an inline banner,
  //      not an overlay dialog. It adds one to the FILE count for a site
  //      entry 273 would not have called a dialog at all.
  //   3. ModalShell.tsx itself carries `role="dialog"` and would otherwise
  //      match, but is explicitly excluded (MECHANISM_PATH) as the mechanism,
  //      not a site. Entry 273 predates ModalShell.tsx, so it never had an
  //      opinion on whether the shell should count.
  // The number below is pinned the same way headless.test.ts pins
  // HEADLESS_SAFE_STEP_TYPES.size - bump it, in the SAME commit, whenever a
  // dialog site is genuinely added or removed - but it is re-derived by
  // running THIS scan, not copied from entry 273's count of a different
  // thing under a different definition.
  it("pins the total dialog-site count this scan derives from the tree", () => {
    // 44, not 43, as of the LLM command interface chunk (item G):
    // CommandProposalModal.tsx is one new dialog site, on the same terms
    // CarryModulePatternReviewModal.tsx was added on one chunk earlier - it
    // adopts ModalShell from birth, so it lands in ADOPTING_PATHS below
    // rather than on any non-adopting allowlist, both numbers move by exactly
    // one, and the subtraction that follows is unchanged.
    //
    // 45, not 44, as of the scheduled-publishing-from-modules chunk (F6/F7/
    // F10): ReleaseReviewModal.tsx is one more new dialog site, on the same
    // terms as CommandProposalModal.tsx/CarryModulePatternReviewModal.tsx
    // before it - it adopts ModalShell from birth too.
    //
    // 46, not 45, as of the grading-results-file-viewer browsing-panel chunk
    // (Task 2): grading-results/SubmittedFilesPanel.tsx is one more new
    // dialog site, on the same terms as ReleaseReviewModal.tsx before it - it
    // adopts ModalShell from birth too.
    //
    // 47, not 46, as of the GradingResults.tsx line-budget extraction chunk:
    // grading-results/FeedbackExpandModal.tsx is one more new dialog site, on
    // the same terms as SubmittedFilesPanel.tsx before it - the per-box
    // "expand feedback" modal MOVED out of GradingResults.tsx into its own
    // file, and it adopts ModalShell from birth (it always rendered via
    // ModalShell, even before the move - the move only changed which file's
    // source the scan sees that import in).
    //
    // 48, not 47, as of the grading-via-recording rubric-input modal chunk:
    // grading-recording/RubricInputModal.tsx is one more new dialog site, on
    // the same terms as FeedbackExpandModal.tsx before it - it adopts
    // ModalShell from birth.
    //
    // 49, not 48, as of the grading-via-recording legibility-probe chunk:
    // grading-recording/LegibilityProbeModal.tsx is one more new dialog
    // site, on the same terms as RubricInputModal.tsx before it - it adopts
    // ModalShell from birth.
    expect(DIALOG_SITES.length).toBe(49);
  });

  it("splits into the adopting sites and all three non-adopting allowlists' combined length", () => {
    // Twenty-seven real adopters, not twenty-three - wave C5 (this commit) is
    // four more than the twenty-three wave-2/wave-3/C4 baseline pinned above:
    // AccessibilityCenter.tsx, GradingResults.tsx,
    // drafted-grades/CommentEditModal.tsx and
    // knowledge/AttachmentPreviewModal.tsx all start adopting this wave (the
    // four sites that used to be PENDING_ADOPTION). OfficeEditorModal.tsx
    // does NOT add a fifth: it was already counted inside the twenty-three,
    // because the file-granular scan already saw it adopting from C4's
    // nested-overlay `useModalDismiss` import (see PARTIALLY_ADOPTED's
    // history in modalAdoptionScan.ts) - C5 finishing its outer dialog changes
    // WHICH list records that (PARTIALLY_ADOPTED to nothing), not whether
    // ADOPTING_PATHS already counted the file.
    //
    // PARTIALLY_ADOPTED sites are NOT part of the subtraction below: they are
    // already counted inside ADOPTING_PATHS (the scan sees them as adopting),
    // so only PERMANENT_EXCLUSIONS, DEFERRED_CLASS_MISMATCH and
    // PENDING_ADOPTION - the three lists of sites the scan sees as NOT
    // adopting - need to sum to the non-adopting remainder. PENDING_ADOPTION
    // is empty as of this wave (modalAdoptionScan.ts's own comment on it), so
    // that remainder is now carried entirely by PERMANENT_EXCLUSIONS and
    // DEFERRED_CLASS_MISMATCH.
    // 29 as of the carry-module-pattern-forward chunk (chunk D) - the
    // twenty-eight described above plus CarryModulePatternReviewModal.tsx,
    // which adopts ModalShell from birth rather than being migrated onto it
    // later. A NEW dialog that did not adopt would have had to be named on
    // one of the three allowlists instead; that it simply increments this
    // number is the check that it did the right thing.
    // 30 as of the LLM command interface chunk (item G) - the twenty-nine
    // described above plus CommandProposalModal.tsx, which likewise adopts
    // ModalShell from birth. That it simply increments this number, rather
    // than needing a name on one of the three allowlists, IS the check that
    // the new dialog did the right thing.
    // 31 as of the scheduled-publishing-from-modules chunk (F6/F7/F10) - the
    // thirty described above plus ReleaseReviewModal.tsx, which likewise
    // adopts ModalShell from birth rather than needing a name on one of the
    // three allowlists.
    // 32 as of the grading-results-file-viewer browsing-panel chunk (Task 2)
    // - the thirty-one described above plus SubmittedFilesPanel.tsx, which
    // likewise adopts ModalShell from birth rather than needing a name on
    // one of the three allowlists.
    // 33 as of the GradingResults.tsx line-budget extraction chunk - the
    // thirty-two described above plus grading-results/FeedbackExpandModal.tsx,
    // which likewise adopts ModalShell from birth (see DIALOG_SITES.length's
    // comment above for why "from birth" still applies to code that moved
    // rather than being newly written).
    //
    // 34 as of the grading-via-recording rubric-input modal chunk - the
    // thirty-three described above plus grading-recording/RubricInputModal.tsx,
    // which likewise adopts ModalShell from birth.
    // 35 as of the grading-via-recording legibility-probe chunk - the
    // thirty-four described above plus
    // grading-recording/LegibilityProbeModal.tsx, which likewise adopts
    // ModalShell from birth.
    expect(ADOPTING_PATHS.size).toBe(35);
    expect(DIALOG_SITES.length - ADOPTING_PATHS.size).toBe(
      PERMANENT_EXCLUSIONS.length + DEFERRED_CLASS_MISMATCH.length + PENDING_ADOPTION.length,
    );
  });
});

describe("AC8 - every dialog site the tree contains either adopts or is named with a reason", () => {
  it("has no orphaned dialog site: every non-adopting site is on exactly one named list", () => {
    const permanentPaths = new Set(PERMANENT_EXCLUSIONS.map((e) => e.path));
    const deferredPaths = new Set(DEFERRED_CLASS_MISMATCH.map((e) => e.path));
    const pendingPaths = new Set(PENDING_ADOPTION.map((e) => e.path));
    const orphans = DIALOG_SITES.filter(
      (s) => !s.adopts && !permanentPaths.has(s.path) && !deferredPaths.has(s.path) && !pendingPaths.has(s.path),
    ).map((s) => s.path);
    expect(
      orphans,
      "every dialog site that does not adopt the shared mechanism must be named, with a reason, in PERMANENT_EXCLUSIONS, DEFERRED_CLASS_MISMATCH or PENDING_ADOPTION",
    ).toEqual([]);
  });

  it("never lists the same file on more than one of the four lists", () => {
    const permanentPaths = new Set(PERMANENT_EXCLUSIONS.map((e) => e.path));
    const deferredPaths = new Set(DEFERRED_CLASS_MISMATCH.map((e) => e.path));
    const pendingPaths = new Set(PENDING_ADOPTION.map((e) => e.path));
    const onMoreThanOne = [
      ...DEFERRED_CLASS_MISMATCH.filter((e) => permanentPaths.has(e.path)).map((e) => e.path),
      ...PENDING_ADOPTION.filter((e) => permanentPaths.has(e.path) || deferredPaths.has(e.path)).map((e) => e.path),
      ...PARTIALLY_ADOPTED.filter(
        (e) => permanentPaths.has(e.path) || deferredPaths.has(e.path) || pendingPaths.has(e.path),
      ).map((e) => e.path),
    ];
    expect(onMoreThanOne).toEqual([]);
  });
});

describe("AC7 - PERMANENT_EXCLUSIONS stays honest in both directions", () => {
  it("names only files that still exist", () => {
    const missing = PERMANENT_EXCLUSIONS.filter((e) => !existsSync(join(process.cwd(), e.path))).map((e) => e.path);
    expect(missing, "a permanent exclusion naming a file that no longer exists is a stale entry").toEqual([]);
  });

  it("names only files that still do not adopt - a reversed decision must be visible here", () => {
    const reversed = PERMANENT_EXCLUSIONS.filter((e) => ADOPTING_PATHS.has(e.path)).map((e) => e.path);
    expect(
      reversed,
      "this file has started adopting the shared mechanism; either that is a deliberate reversal of its exclusion (remove the entry) or a regression (revert the import)",
    ).toEqual([]);
  });

  it("gives every entry a reason a future reader can act on", () => {
    const weak = PERMANENT_EXCLUSIONS.filter((e) => !isSubstantiveReason(e.reason)).map((e) => e.path);
    expect(weak, '"excluded" is not a reason - every entry needs one a future reader can act on').toEqual([]);
  });
});

describe("the class-mismatch deferral list stays honest in both directions - an open question, not a settled one (entry 279 check 2)", () => {
  it("names only files that still exist", () => {
    const missing = DEFERRED_CLASS_MISMATCH.filter((e) => !existsSync(join(process.cwd(), e.path))).map((e) => e.path);
    expect(missing, "a deferred entry naming a file that no longer exists is a stale entry").toEqual([]);
  });

  it("names only files that still do not adopt - a reversed decision must be visible here", () => {
    const reversed = DEFERRED_CLASS_MISMATCH.filter((e) => ADOPTING_PATHS.has(e.path)).map((e) => e.path);
    expect(
      reversed,
      "this file has started adopting the shared mechanism; either the class-mismatch question was resolved in favour of adopting (remove the entry) or this is a regression (revert the import)",
    ).toEqual([]);
  });

  it("gives every entry a reason a future reader can act on", () => {
    const weak = DEFERRED_CLASS_MISMATCH.filter((e) => !isSubstantiveReason(e.reason)).map((e) => e.path);
    expect(weak, '"excluded" is not a reason - every entry needs one a future reader can act on').toEqual([]);
  });
});

describe("the C4/C5 pending list, which must shrink to empty by the end of wave C5", () => {
  it("names only files that still exist", () => {
    const missing = PENDING_ADOPTION.filter((e) => !existsSync(join(process.cwd(), e.path))).map((e) => e.path);
    expect(missing, "a pending entry naming a file that no longer exists is a stale entry").toEqual([]);
  });

  it("names only files that still have not adopted - a landed wave must be visible here, not silently rot into a permanent-looking exclusion", () => {
    const landed = PENDING_ADOPTION.filter((e) => ADOPTING_PATHS.has(e.path)).map((e) => e.path);
    expect(
      landed,
      "this file has started adopting the shared mechanism - its wave landed, so remove it from PENDING_ADOPTION rather than leave a stale entry behind",
    ).toEqual([]);
  });

  it("gives every entry a reason naming the wave that will take it", () => {
    const weak = PENDING_ADOPTION.filter((e) => !isSubstantiveReason(e.reason)).map((e) => e.path);
    expect(weak, '"excluded" is not a reason - every entry needs one a future reader can act on').toEqual([]);
  });
});

describe("the partially-adopted list - a file-granular scan's blind spot on a multi-dialog file, kept honest in both directions", () => {
  it("names only files that still exist", () => {
    const missing = PARTIALLY_ADOPTED.filter((e) => !existsSync(join(process.cwd(), e.path))).map((e) => e.path);
    expect(missing, "a partially-adopted entry naming a file that no longer exists is a stale entry").toEqual([]);
  });

  it("names only files that DO genuinely adopt - the opposite polarity from PENDING_ADOPTION", () => {
    // Unlike PENDING_ADOPTION (which fails if a listed file starts adopting),
    // this list's contract is the reverse: the whole reason an entry lives
    // here rather than on PENDING_ADOPTION is that the file already adopts.
    // If it ever stopped, that would mean the useModalDismiss import was
    // reverted - a regression, not progress - and it would also silently
    // become an orphan (no longer in ADOPTING_PATHS, not on any of the other
    // three lists), which the orphan check above would catch too; this
    // assertion names the more specific cause.
    const notAdopting = PARTIALLY_ADOPTED.filter((e) => !ADOPTING_PATHS.has(e.path)).map((e) => e.path);
    expect(
      notAdopting,
      "this file is listed as partially adopted but the scan no longer sees it adopting - the useModalDismiss/ModalShell import was likely reverted",
    ).toEqual([]);
  });

  it("names only files whose recorded remainder is still genuinely unconverted markup", () => {
    // The THIRD check this list needs that the other three do not: proof,
    // re-read from the file every run rather than assumed once, that the
    // SPECIFIC part flagged as outstanding (the outer dialog's pre-C4
    // backdrop-carries-role shape) has not itself been quietly converted -
    // which would make this entry stale in the one direction none of the
    // other lists' checks can see (they only ever check the whole-file
    // `adopts` boolean, which is already true here and stays true either
    // way).
    const finished = PARTIALLY_ADOPTED.filter((e) => {
      if (!existsSync(join(process.cwd(), e.path))) return false;
      const stripped = stripComments(readFileSync(join(process.cwd(), e.path), "utf8"));
      return !stripped.includes(e.unconvertedMarker);
    }).map((e) => e.path);
    expect(
      finished,
      "this file's recorded remainder (unconvertedMarker) is no longer present in its source - the remaining dialog has been converted too, so remove this entry (and add the file to WAVE list bookkeeping if appropriate) rather than leave it recorded as still outstanding",
    ).toEqual([]);
  });

  it("gives every entry a reason a future reader can act on", () => {
    const weak = PARTIALLY_ADOPTED.filter((e) => !isSubstantiveReason(e.reason)).map((e) => e.path);
    expect(weak, '"excluded" is not a reason - every entry needs one a future reader can act on').toEqual([]);
  });

  // unconvertedMarker only looks at the BACKDROP string; a botched C5 could
  // move ref/tabIndex/role/aria-modal/aria-label onto the content element
  // while leaving that backdrop string untouched, and unconvertedMarker's
  // check alone would still pass. This reads the CONTENT element's own
  // opening tag (via tagAt, imported from modalAdoptionScan.ts) and requires
  // none of those.
  it("names only files whose CONTENT element has not silently gained decision 3's attributes - the other half unconvertedMarker alone cannot see", () => {
    const wronglyConverted = PARTIALLY_ADOPTED.filter((e) => {
      if (!existsSync(join(process.cwd(), e.path))) return false;
      const stripped = stripComments(readFileSync(join(process.cwd(), e.path), "utf8"));
      const markerIndex = stripped.indexOf(e.convertedContentMarker);
      if (markerIndex === -1) return false;
      const contentTag = tagAt(stripped, markerIndex);
      return contentTag !== null && /ref=\{|tabIndex=\{-1\}|role="dialog"|aria-modal|aria-label=/.test(contentTag);
    }).map((e) => e.path);
    expect(wronglyConverted, "content element already carries ref/tabIndex/role/aria-modal/aria-label even though unconvertedMarker's backdrop string still matched").toEqual([]);
  });

  it("has no entry missing: every site adopting while still containing a leftover styles.previewBackdrop marker must be named here (PENDING_ADOPTION's end-state obligation, given to this list too)", () => {
    const partiallyAdoptedPaths = new Set(PARTIALLY_ADOPTED.map((e) => e.path));
    const missingFromList = ADOPTING_WITH_LEFTOVER_BACKDROP_MARKER.filter((p) => !partiallyAdoptedPaths.has(p));
    expect(missingFromList, "this file adopts while still containing a raw styles.previewBackdrop marker - the blind spot PARTIALLY_ADOPTED exists to record; add it").toEqual([]);
  });
});

describe("AC8 point 6 - the wave-2, wave-3 and wave-5 adopters really do adopt, derived from the same scan", () => {
  it("wave 2 (commit f16c7aa, entry 279): all nine sites show up adopting in the scan", () => {
    const notAdopting = WAVE2_ADOPTERS.filter((path) => !existsSync(join(process.cwd(), path)) || !ADOPTING_PATHS.has(path));
    expect(notAdopting, "a wave-2 adopter must still exist and still import ModalShell/useModalDismiss").toEqual([]);
  });

  it("wave 3 / C3 (the AC doc's C3 table): all nine files show up adopting in the scan", () => {
    const notAdopting = WAVE3_ADOPTERS.filter((path) => !existsSync(join(process.cwd(), path)) || !ADOPTING_PATHS.has(path));
    expect(notAdopting, "a C3 adopter must still exist and still import ModalShell/useModalDismiss").toEqual([]);
  });

  // Wave 4's equivalent double-check (HOOK_DESTRUCTURE_SITES.length) lives
  // in modalAdoptionWiring.attributes.test.ts instead, alongside the other
  // per-site ATTRIBUTE assertions - see that file's own header comment for
  // the split's rationale.
  it("wave 5 / C5 (the AC doc's C5 implementation notes): all five sites show up adopting in the scan", () => {
    const notAdopting = WAVE5_ADOPTERS.filter((path) => !existsSync(join(process.cwd(), path)) || !ADOPTING_PATHS.has(path));
    expect(notAdopting, "a C5 adopter must still exist and still import ModalShell/useModalDismiss").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The bundle guard on modalAdoptionScan.ts (this task's own risk to close):
// that module imports `node:fs` and lives under `src/app`, so an application
// file importing it would pull a node builtin into the client bundle and
// break the build the moment webpack tried to resolve it for the browser.
// Derived from the tree, via the scan's own walkFiles - never a hardcoded
// list of "files that don't import it" - so a NEW application file that adds
// the import is caught the same way an existing one would be.
// ---------------------------------------------------------------------------
describe("modalAdoptionScan.ts bundle guard - node:fs must never reach the client bundle", () => {
  it("is imported only by test files, never by an application component", () => {
    const scanModuleRelativePath = "src/app/components/ui/modalAdoptionScan.ts";
    const importPattern = /from\s+["'][^"']*\/modalAdoptionScan["']/;
    const allSourceFiles = walkFiles(APP_ROOT, (fileName) => fileName.endsWith(".ts") || fileName.endsWith(".tsx"));
    const violators = allSourceFiles
      .filter((absPath) => toRepoRelativePosix(absPath) !== scanModuleRelativePath)
      .filter((absPath) => !/\.test\.tsx?$/.test(absPath))
      .filter((absPath) => importPattern.test(readFileSync(absPath, "utf8")))
      .map((absPath) => toRepoRelativePosix(absPath));
    expect(
      violators,
      "modalAdoptionScan.ts imports node:fs; only test files may import it - a non-test import would pull a node builtin into the client bundle and break the build",
    ).toEqual([]);
  });
});
