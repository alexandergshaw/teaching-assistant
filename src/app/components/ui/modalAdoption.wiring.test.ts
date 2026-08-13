// AC8's derived inventory guard - docs/modal-dismissal-focus-acceptance-
// criteria.md. Every overlay dialog in the app must either adopt the shared
// dismissal/focus mechanism (ModalShell or useModalDismiss, AC1-AC6) or be
// named, with a reason, in one of the two allowlists below (AC7).
//
// THE FILE LIST IS DERIVED BY WALKING THE TREE, NEVER HARDCODED. That is the
// whole point of this test, stated in AC8 itself: "a hardcoded list already
// failed an audit on this exact surface by excluding the file it was meant
// to police" (entry 272 check 5, docs/REGRESSION.md). A static enumeration of
// "every dialog file" would suffer the identical defect - a new dialog added
// later, or a file renamed, would simply never be checked. So this file
// walks `src/app` for every `.tsx` file at test-run time and classifies each
// one; the only hardcoded lists below are the three ALLOWLISTS (PERMANENT_
// EXCLUSIONS, DEFERRED_CLASS_MISMATCH, PENDING_ADOPTION), which AC7 requires
// to be explicit anyway, and the WAVE2_ADOPTERS/WAVE3_ADOPTERS lists used
// only to double-check that specific known adopters really do show up
// adopting in the scan (AC8 point 6) - none of these substitute for the tree
// walk, they are checked AGAINST it.
//
// ONE FILE IS EXPLICITLY EXCLUDED FROM THE WALK: `ModalShell.tsx` itself
// (see MECHANISM_PATH below). It carries `role="dialog"` on the content
// section it renders and imports `useModalDismiss`, so left in the scan it
// would count itself as a dialog site that adopts - one adopter that is
// actually the mechanism, not a site the mechanism protects. Excluded by
// exact path, with an existence check, so a rename would fail loudly instead
// of quietly letting the mechanism start padding its own adoption count.
//
// A DIALOG SITE is a `.tsx` file whose source (comments stripped) contains
// `styles.previewBackdrop`, `role="dialog"`, `role="alertdialog"`, or an
// import of MUI's `Dialog`, OR that already imports
// `ModalShell`/`useModalDismiss`. The last clause matters as much as the
// first four: a file that has adopted the shell no longer contains the raw
// backdrop/role markers in ITS OWN source (they now live inside
// ModalShell.tsx), so without it an adopted file would silently stop being
// seen as a dialog site at all - which would make AC8 point 6's "the
// wave-2/wave-3 adopters really do adopt" unfalsifiable, since a file that
// dropped its adoption entirely (reverted to nothing) would just vanish from
// the scan rather than show up as a regression. Comments are stripped before
// every check (the same `stripComments` idiom
// generatedPreviewModal.wiring.test.ts uses) because
// DownloadSelectionSection.tsx's own header comment literally contains the
// string `styles.previewBackdrop` while explaining that the component
// "RENDERS NO MODAL, DIALOG, POPOVER OR FIXED-POSITION OVERLAY, on purpose" -
// a raw substring match against unstripped source would misclassify exactly
// the file that documents NOT being a dialog. Proven as a canary below.
//
// The `role="dialog"`/`role="alertdialog"` markers are literal double-quoted
// string matches, not a JSX attribute parser. KNOWN BLIND SPOTS, not fixed
// here: `role='dialog'` with single quotes, and `role={someExpr}` computed
// at runtime, would both evade the scan entirely. Nothing in this codebase
// uses either shape today (verified by grep), so this is a documented limit
// of the marker set, not a claim that it is exhaustive.
//
// A DIALOG SITE ADOPTS if its source imports `ModalShell` or
// `useModalDismiss` from a path ending in that module name.
//
// Every non-adopting dialog site must be named, with a reason, in exactly one
// of PERMANENT_EXCLUSIONS (AC7's exclusions - must never adopt),
// DEFERRED_CLASS_MISMATCH (refused on inspection because they use a
// different content class - open question, not a permanent decision - see
// that list's own contract comment below), or PENDING_ADOPTION (C4/C5 sites
// not yet converted - must adopt eventually). All three lists are checked in
// both directions: an entry naming a file that no longer exists, or that has
// started adopting, fails the test - the failure mode that lets a list rot
// into a stale record nobody notices is wrong once the underlying file
// changes.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, relative, sep } from "path";

// ---------------------------------------------------------------------------
// The tree walk and the classification predicates. Every one of these is
// proven against inline fixtures in the canary block below before it is
// trusted against the real files (the discipline entry 239 check 10 records
// and generatedPreviewModal.wiring.test.ts already follows).
// ---------------------------------------------------------------------------

const APP_ROOT = join(process.cwd(), "src/app");

/** Every `.tsx` file under `src/app`, walked at test-run time - never a
 * static list. `.ts` files (useModalDismiss.ts itself, every `.wiring.test.ts`
 * file) are deliberately excluded: they are not components and cannot render
 * a dialog, and useModalDismiss.ts's own JSDoc contains the literal string
 * `role="dialog"` in prose (describing what its caller's container carries),
 * which would otherwise misclassify the hook file as a dialog site. */
function walkTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** Source with comments stripped, so a marker string mentioned in prose is
 * never mistaken for the real thing - see this file's header comment on
 * DownloadSelectionSection.tsx, the concrete case this exists for. Same
 * idiom generatedPreviewModal.wiring.test.ts uses. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** True for either shape MUI's `Dialog` is imported in this codebase: a
 * default import from the `@mui/material/Dialog` subpath (TextbookPhotoModal,
 * RecommendTextbooksModal), or a named specifier inside a multi-line import
 * from the package root (FolderActionsMenu, TasksTab, ManageTasksDialog,
 * TaskAttachmentsDialog, CoursesTable). Checking specifiers by exact token
 * (split on `,`, trim, compare) rather than a loose `/\bDialog\b/` regex is
 * deliberate: `DialogTitle`/`DialogContent`/`DialogActions` all contain the
 * substring `Dialog` and are imported alongside it everywhere `Dialog` itself
 * is, so a substring test would never actually discriminate anything. */
function importsMuiDialog(strippedSource: string): boolean {
  if (/import\s+Dialog\s+from\s+["']@mui\/material\/Dialog["']/.test(strippedSource)) return true;
  const namedImportBlocks = [...strippedSource.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@mui\/material["']/g)];
  return namedImportBlocks.some((block) => block[1].split(",").map((s) => s.trim()).includes("Dialog"));
}

/** True when the file imports `ModalShell` or `useModalDismiss` from a path
 * whose final segment is exactly that name - `../ui/ModalShell`,
 * `./ui/ModalShell`, `./useModalDismiss` all match; a hypothetical
 * `../settings/useModalShellPrefs` (a different module that merely shares a
 * prefix) does not, because the regex requires the segment to end at the
 * closing quote. */
function adoptsSharedMechanism(strippedSource: string): boolean {
  return /from\s+["'][^"']*\/(ModalShell|useModalDismiss)["']/.test(strippedSource);
}

/** A DIALOG SITE per this file's header comment: the four raw-markup/MUI
 * markers AC8 names (`styles.previewBackdrop`, `role="dialog"`,
 * `role="alertdialog"`, MUI `Dialog`), OR adoption itself - the last clause
 * is what keeps an adopted file (which no longer carries the raw markers in
 * its own source) from disappearing out of the scan entirely. The
 * `alertdialog` marker exists because `KnowledgeTab.tsx:463` carries
 * `role="alertdialog"` on an inline warning banner - harmless today since
 * it is not an overlay (allowlisted below in PERMANENT_EXCLUSIONS), but a
 * real alertdialog-shaped overlay modal would otherwise evade this scan
 * entirely. See the header comment for this marker set's known blind spots
 * (single-quoted `role` values, computed `role={expr}`). */
function isDialogSite(strippedSource: string): boolean {
  return (
    strippedSource.includes("styles.previewBackdrop") ||
    strippedSource.includes('role="dialog"') ||
    strippedSource.includes('role="alertdialog"') ||
    importsMuiDialog(strippedSource) ||
    adoptsSharedMechanism(strippedSource)
  );
}

function toRepoRelativePosix(absPath: string): string {
  return relative(process.cwd(), absPath).split(sep).join("/");
}

interface SiteInfo {
  readonly path: string;
  readonly adopts: boolean;
  readonly isDialogSite: boolean;
}

function classify(absPath: string): SiteInfo {
  const stripped = stripComments(readFileSync(absPath, "utf8"));
  return {
    path: toRepoRelativePosix(absPath),
    adopts: adoptsSharedMechanism(stripped),
    isDialogSite: isDialogSite(stripped),
  };
}

// ---------------------------------------------------------------------------
// The two allowlists AC7 requires. Populated from what the scan in this file
// actually finds (verified by running it), not copied from any handoff
// summary - none disagreed with the tree at the time this was written, but
// the assertions below are what keeps that true over time, not this comment.
// ---------------------------------------------------------------------------

interface ListedSite {
  readonly path: string;
  readonly reason: string;
}

/** AC7's exclusions - must NEVER adopt. Removing an entry here is meant to be
 * a visible, deliberate decision (AC7's own wording), which is exactly what
 * "must exist and must still not be adopting" below enforces. */
const PERMANENT_EXCLUSIONS: readonly ListedSite[] = [
  // Family D (entry 273 check 1) - three floating windows, non-modal by a
  // recorded decision (entry 6781). Giving them a trap or Escape would be a
  // behaviour change these were deliberately built without, not a fix.
  {
    path: "src/app/components/AiChatWindow.tsx",
    reason: "family D floating window, non-modal by entry 6781's decision - must not gain a trap or Escape",
  },
  {
    path: "src/app/components/live-class/LiveClassWindow.tsx",
    reason: "family D floating window, non-modal by entry 6781's decision - must not gain a trap or Escape",
  },
  {
    path: "src/app/components/courses/WeeklyChecklistOverviewModal.tsx",
    reason: "family D floating window, non-modal by entry 6781's decision - must not gain a trap or Escape",
  },
  // Family E (entry 273 check 1 - measured as SEVEN sites, correcting AC7's
  // own prose which still says "four"; the tree is what this test trusts,
  // per this task's own instruction to report rather than silently
  // reconcile a disagreement). Real MUI `Dialog`s already register with
  // MUI's `ModalManager` and get trap/restore/Escape from it; a second,
  // independent mechanism on top would fight that manager rather than help.
  {
    path: "src/app/components/courses/TextbookPhotoModal.tsx",
    reason: "family E - real MUI Dialog, already has trap/restore/Escape via ModalManager; a second mechanism would fight it",
  },
  {
    path: "src/app/components/TasksTab.tsx",
    reason: "family E - real MUI Dialog, already has trap/restore/Escape via ModalManager; a second mechanism would fight it",
  },
  {
    path: "src/app/components/courses/RecommendTextbooksModal.tsx",
    reason: "family E - real MUI Dialog, already has trap/restore/Escape via ModalManager; a second mechanism would fight it",
  },
  {
    path: "src/app/components/courses/CoursesTable.tsx",
    reason: "family E - real MUI Dialog, already has trap/restore/Escape via ModalManager; a second mechanism would fight it",
  },
  {
    path: "src/app/components/tasks/ManageTasksDialog.tsx",
    reason: "family E - real MUI Dialog, already has trap/restore/Escape via ModalManager; a second mechanism would fight it",
  },
  {
    path: "src/app/components/tasks/TaskAttachmentsDialog.tsx",
    reason: "family E - real MUI Dialog, already has trap/restore/Escape via ModalManager; a second mechanism would fight it",
  },
  {
    path: "src/app/components/workflows/FolderActionsMenu.tsx",
    reason: "family E - real MUI Dialog, already has trap/restore/Escape via ModalManager; a second mechanism would fight it",
  },
  // TaskCell's Popper - AC7: keeps its own Escape and roving-tabindex
  // restore for reasons entry 230-era work records; not a ModalShell/
  // useModalDismiss candidate.
  {
    path: "src/app/components/tasks/TaskCell.tsx",
    reason: 'a role="dialog" Popper with its own Escape and roving-tabindex restore (entry 230-era decision), not a ModalShell candidate',
  },
  // KnowledgeTab's inline warning banner - added when the isDialogSite
  // markers gained role="alertdialog" (blocker 4). `.kbWarnBanner` is an
  // inline confirmation row inside the page, not an overlay: no backdrop, no
  // portal, nothing to trap or restore focus to. It has nothing to adopt, so
  // it belongs on the "must never adopt" list rather than a pending one.
  {
    path: "src/app/components/KnowledgeTab.tsx",
    reason: 'role="alertdialog" inline warning banner (.kbWarnBanner), not an overlay dialog - no backdrop or portal, nothing to adopt',
  },
];

/** A THIRD list, distinct from PERMANENT_EXCLUSIONS: refused on inspection,
 * not settled as permanent. `LecturePlanPreviewModal.tsx` and
 * `lesson-plan/index.tsx` were pulled out of PERMANENT_EXCLUSIONS because
 * that list's contract is "must NEVER adopt" - a closed decision - and entry
 * 279 check 2 explicitly records theirs as open: "whether
 * `.lessonPreviewModal` should survive at all is a later decision", not
 * something this test (or wave 2's commit) settled. Filing an open question
 * under a "never" list would have settled it by stealth, with nothing behind
 * the settlement but this file.
 *
 * Both use `.lessonPreviewModal`, a DIFFERENT content class from
 * `.previewModal` - different width, content-fit height (not ModalShell's
 * fixed min(100%, 980px) box), and no focus-ring reset (commit f16c7aa,
 * entry 279 check 2). Adopting the shell as-is would silently resize and
 * reflow both dialogs. The refusal stands until someone decides whether
 * `.lessonPreviewModal` should be retired in favour of `.previewModal`
 * (making adoption safe) or kept as its own class ModalShell learns to
 * accept (making this exclusion permanent) - this test does not make that
 * call, it only keeps the open question visible and both directions
 * checked. */
const DEFERRED_CLASS_MISMATCH: readonly ListedSite[] = [
  {
    path: "src/app/components/LecturePlanPreviewModal.tsx",
    reason: "wave-2 refusal (commit f16c7aa, entry 279 check 2) - uses .lessonPreviewModal, a different content class than .previewModal; whether that class should survive is still open, not settled here",
  },
  {
    path: "src/app/components/lesson-plan/index.tsx",
    reason: "wave-2 refusal (commit f16c7aa, entry 279 check 2) - uses .lessonPreviewModal, a different content class than .previewModal; whether that class should survive is still open, not settled here",
  },
];

/** The C4/C5 sites not yet converted (docs/modal-dismissal-focus-
 * acceptance-criteria.md, "Waves"). Every entry names the wave that will
 * take it. This list is meant to shrink to empty by the end of wave C5 -
 * "must still not be adopting" below is what makes a landed wave visible
 * here rather than left to rot into a permanent-looking exclusion. */
const PENDING_ADOPTION: readonly ListedSite[] = [
  // C4 - Tier 3, the inline-styled overlays, hook only (not the full shell).
  {
    path: "src/app/components/DocStructureEditor.tsx",
    reason: "C4 - Tier 3 inline-styled overlay, hook-only adoption not yet landed",
  },
  {
    path: "src/app/components/PdfFixEditor.tsx",
    reason: "C4 - Tier 3 inline-styled overlay, hook-only adoption not yet landed",
  },
  {
    path: "src/app/components/OfficeAltEditor.tsx",
    reason: "C4 - Tier 3 inline-styled overlay, hook-only adoption not yet landed",
  },
  {
    path: "src/app/components/RemediationEditor.tsx",
    reason: "C4 - Tier 3 inline-styled overlay, hook-only adoption not yet landed",
  },
  // OfficeEditorModal mounts two overlays in one fragment (entry 273 check
  // 7). The AC's Waves section splits it across two waves - C4 takes the
  // nested overlay, C5 takes the outer modal - because decision 5's LIFO
  // stack means the two cannot be converted independently without thinking
  // through which one is topmost while both are open; a single mechanical
  // pass over this file is not safe.
  {
    path: "src/app/components/content-tab/OfficeEditorModal.tsx",
    reason: "C4 converts its nested overlay, C5 converts the outer modal - two simultaneous overlays (entry 273 check 7) under decision 5's LIFO stack",
  },
  // C5 - Tier 4, one at a time, each for its own reason (AC's Waves section).
  {
    path: "src/app/components/AccessibilityCenter.tsx",
    reason: "C5 - always mounted, parent of four family-B dialogs; needs care rather than a mechanical pass",
  },
  {
    path: "src/app/components/GradingResults.tsx",
    reason: "C5 - renders inline inside LiveFeedPanel's navy pane; the focus-ring dependency (entry 257 check 4) makes this the highest-risk file to convert blind",
  },
  {
    path: "src/app/components/drafted-grades/CommentEditModal.tsx",
    reason: "C5 - dirty guard; its backdrop close already routes through handleClose, not onClose, and that must survive adoption",
  },
  {
    path: "src/app/components/knowledge/AttachmentPreviewModal.tsx",
    reason: "C5 - already has its own Escape and initial-focus effects; adopting means removing two working effects and reversing a written decision",
  },
];

/** The nine wave-2 adopters (commit f16c7aa, entry 279 check 1) - used only
 * to double-check, from the SAME scan above, that they really do show up
 * adopting. Not a substitute file list: every path here must independently
 * appear as an adopting dialog site in DIALOG_SITES for the checks below to
 * pass. */
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

/** A reason string a future reader can act on - "excluded" alone is not one
 * (this file's own brief says so). No attempt to judge prose quality beyond
 * a length floor; the point is to catch an entry added with a placeholder,
 * not to grade writing. */
function isSubstantiveReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= 20 && !/^excluded$/i.test(trimmed);
}

/** The mechanism itself, excluded from the scan by exact path rather than by
 * a marker heuristic - see the header comment. Left in, `ModalShell.tsx`
 * would classify as a dialog site (it carries `role="dialog"` on the content
 * section it renders) that also adopts (it imports `useModalDismiss`),
 * inflating ADOPTING_PATHS by one entry that is the mechanism, not a site
 * the mechanism protects. Checked for existence below so a rename silently
 * disables the exclusion loudly rather than quietly. */
const MECHANISM_PATH = "src/app/components/ui/ModalShell.tsx";

// ---------------------------------------------------------------------------
// The real scan, computed once at module load - every describe block below
// reads from these, none re-walks the tree.
// ---------------------------------------------------------------------------

const ALL_TSX_FILES = walkTsxFiles(APP_ROOT).filter(
  (absPath) => toRepoRelativePosix(absPath) !== MECHANISM_PATH,
);
const SITES: SiteInfo[] = ALL_TSX_FILES.map(classify);
const DIALOG_SITES = SITES.filter((s) => s.isDialogSite);
const ADOPTING_PATHS = new Set(DIALOG_SITES.filter((s) => s.adopts).map((s) => s.path));

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

  it("recognises a ModalShell or useModalDismiss import as adoption, and rejects a same-prefix decoy", () => {
    expect(adoptsSharedMechanism('import { ModalShell } from "../ui/ModalShell";')).toBe(true);
    expect(adoptsSharedMechanism('import { ModalShell } from "./ui/ModalShell";')).toBe(true);
    expect(adoptsSharedMechanism('import { useModalDismiss } from "./useModalDismiss";')).toBe(true);
    // A hypothetical module that merely SHARES A PREFIX with useModalDismiss
    // must not count - the regex requires the path segment to end exactly at
    // the closing quote, not just start with the right letters.
    expect(adoptsSharedMechanism('import { useModalShellPrefs } from "../settings/useModalShellPrefs";')).toBe(false);
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
    // scan entirely (making AC8 point 6 unfalsifiable - see this file's
    // header comment).
    expect(isDialogSite('import { ModalShell } from "../ui/ModalShell";')).toBe(true);
  });
});

describe("inventory sanity - the scan is not vacuous", () => {
  it("walks a realistic number of .tsx files under src/app", () => {
    expect(ALL_TSX_FILES.length).toBeGreaterThan(100);
  });

  // WHAT THIS PIN COUNTS, AND WHY IT DOES NOT CLEANLY RECONCILE WITH ENTRY
  // 273. DIALOG_SITES.length counts FILES matched by isDialogSite's markers
  // (this file's header comment), after MECHANISM_PATH (ModalShell.tsx) is
  // excluded from the walk - it is not "overlay dialogs" in entry 273's
  // sense, and the two numbers differ in KIND, not just arithmetic:
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
    expect(DIALOG_SITES.length).toBe(41);
  });

  it("splits into the adopting sites and all three allowlists' combined length", () => {
    // Eighteen real adopters, not nineteen - the pre-fix count of 19 was one
    // adopter too many because ModalShell.tsx (the mechanism, which imports
    // useModalDismiss) was counting itself as an adopting dialog site before
    // MECHANISM_PATH excluded it.
    expect(ADOPTING_PATHS.size).toBe(18);
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

  it("never lists the same file on more than one of the three lists", () => {
    const permanentPaths = new Set(PERMANENT_EXCLUSIONS.map((e) => e.path));
    const deferredPaths = new Set(DEFERRED_CLASS_MISMATCH.map((e) => e.path));
    const onMoreThanOne = [
      ...DEFERRED_CLASS_MISMATCH.filter((e) => permanentPaths.has(e.path)).map((e) => e.path),
      ...PENDING_ADOPTION.filter((e) => permanentPaths.has(e.path) || deferredPaths.has(e.path)).map((e) => e.path),
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

describe("AC8 point 6 - the wave-2 and wave-3 adopters really do adopt, derived from the same scan", () => {
  it("wave 2 (commit f16c7aa, entry 279): all nine sites show up adopting in the scan", () => {
    const notAdopting = WAVE2_ADOPTERS.filter((path) => !existsSync(join(process.cwd(), path)) || !ADOPTING_PATHS.has(path));
    expect(notAdopting, "a wave-2 adopter must still exist and still import ModalShell/useModalDismiss").toEqual([]);
  });

  it("wave 3 / C3 (the AC doc's C3 table): all nine files show up adopting in the scan", () => {
    const notAdopting = WAVE3_ADOPTERS.filter((path) => !existsSync(join(process.cwd(), path)) || !ADOPTING_PATHS.has(path));
    expect(notAdopting, "a C3 adopter must still exist and still import ModalShell/useModalDismiss").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Decision 2 / entry 257 check 4 / AC9 - what every one of the eighteen
// adopters above is trusting ModalShell.tsx to actually render. No test in
// this repo reads ModalShell.tsx's own source, and
// generatedPreviewModal.wiring.test.ts:353-355 accepts `<ModalShell` as a
// SUBSTITUTE for its own previewBackdrop/previewModal class check without
// ever verifying what the shell renders - these assertions are what makes
// that substitution honest instead of a blind trust.
//
// WHAT SOURCE-TEXT READING CAN AND CANNOT PROVE (per this repo's stated
// limits - vitest is node-env and renders no component): these assertions
// prove that ModalShell.tsx's JSX literally opens `.previewBackdrop` before
// `.previewModal`, with no other element's opening tag textually between
// them, and that `role="dialog"`/`aria-modal`/`aria-label` appear only after
// the content section opens, not on the backdrop. They do NOT prove a
// browser actually paints two nested boxes, that CSS custom-property
// inheritance really reaches GradingResults's navy pane the way entry 257
// check 4 assumes, or that conditional JSX evaluated only in some prop
// combination could not insert a wrapper this literal, line-based read
// would not distinguish from a sibling. Reading is the only tool available
// here; this is what it is honest to claim from it.
// ---------------------------------------------------------------------------

const MODAL_SHELL_PATH = join(process.cwd(), "src/app/components/ui/ModalShell.tsx");
const modalShellSource = stripComments(readFileSync(MODAL_SHELL_PATH, "utf8"));

describe("ModalShell.tsx renders what every adopter depends on (decision 2, entry 257 check 4, AC9)", () => {
  it("renders styles.previewBackdrop and styles.previewModal, backdrop first", () => {
    const backdropIndex = modalShellSource.indexOf("styles.previewBackdrop");
    const modalIndex = modalShellSource.indexOf("styles.previewModal");
    expect(backdropIndex, "ModalShell.tsx no longer renders styles.previewBackdrop at all").toBeGreaterThanOrEqual(0);
    expect(modalIndex, "ModalShell.tsx no longer renders styles.previewModal at all").toBeGreaterThanOrEqual(0);
    expect(
      backdropIndex,
      "styles.previewModal must appear textually after styles.previewBackdrop - the content nests inside the backdrop, not the reverse",
    ).toBeLessThan(modalIndex);
  });

  it("opens no element between the backdrop's opening tag and the content section's opening tag", () => {
    const backdropOpen = modalShellSource.indexOf("<div");
    expect(backdropOpen, "ModalShell.tsx no longer opens a <div> at all").toBeGreaterThanOrEqual(0);
    const backdropTagEnd = modalShellSource.indexOf(">", backdropOpen);
    const sectionOpen = modalShellSource.indexOf("<section", backdropTagEnd);
    expect(sectionOpen, "ModalShell.tsx no longer opens a <section> after its backdrop div").toBeGreaterThan(backdropTagEnd);
    const between = modalShellSource.slice(backdropTagEnd + 1, sectionOpen);
    expect(
      between.trim(),
      "an element was introduced between .previewBackdrop and .previewModal - decision 2 requires nothing between them, or entry 257 check 4's focus-ring inheritance into GradingResults silently breaks",
    ).toBe("");
  });

  it('puts role="dialog", aria-modal and the accessible name on the content section, not the backdrop', () => {
    const backdropOpen = modalShellSource.indexOf("<div");
    const sectionOpen = modalShellSource.indexOf("<section");
    expect(sectionOpen).toBeGreaterThan(backdropOpen);
    const backdropTag = modalShellSource.slice(backdropOpen, sectionOpen);
    const fromSectionOpen = modalShellSource.slice(sectionOpen);
    expect(
      backdropTag,
      "role, aria-modal or aria-label found on the backdrop div - decision 3 requires them on the content element only",
    ).not.toMatch(/role=|aria-modal|aria-label/);
    expect(fromSectionOpen, 'the content section must carry role="dialog"').toContain('role="dialog"');
    expect(fromSectionOpen, "the content section must carry aria-modal").toContain("aria-modal");
    expect(fromSectionOpen, "the content section must carry the accessible name (aria-label)").toContain("aria-label");
  });
});
