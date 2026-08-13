// TEST-ONLY INFRASTRUCTURE - never import this module from an application
// file. It imports `node:fs` (readdirSync/readFileSync) to walk and read
// `src/app` at test-run time (see walkFiles/classify below). If a component
// ever imported it, that would pull a node builtin into the client bundle and
// break the build the moment webpack tried to resolve `fs` for the browser -
// this module lives under `src/app` alongside the components it inspects, so
// nothing about its path alone stops that from happening by accident. Today
// only modalAdoption.wiring.test.ts and modalAdoptionWiring.attributes.test.ts
// import it. That is enforced, not just hoped for: the "modalAdoptionScan.ts
// bundle guard" describe block in modalAdoption.wiring.test.ts walks src/app
// itself (via walkFiles, exported below) and fails the moment any non-test
// file imports this one.
//
// Everything below this notice is AC8's derived inventory guard -
// docs/modal-dismissal-focus-acceptance-criteria.md. Every overlay dialog in
// the app must either fully adopt the shared dismissal/focus mechanism
// (ModalShell or useModalDismiss, AC1-AC6), or be named, with a reason, in one
// of the FOUR lists below (AC7): three for a site that does not adopt at all
// (PERMANENT_EXCLUSIONS, DEFERRED_CLASS_MISMATCH, PENDING_ADOPTION), and a
// fourth (PARTIALLY_ADOPTED) for a file that DOES adopt for one dialog while
// another in the SAME file has not - OfficeEditorModal.tsx (C4), see its
// contract comment.
//
// THE FILE LIST IS DERIVED BY WALKING THE TREE, NEVER HARDCODED - "a
// hardcoded list already failed an audit on this exact surface by excluding
// the file it was meant to police" (entry 272 check 5, docs/REGRESSION.md).
// The walk below covers every `.tsx` file at test-run time and classifies
// each one; the only hardcoded lists in this module are the four
// (PERMANENT_EXCLUSIONS, DEFERRED_CLASS_MISMATCH, PENDING_ADOPTION - the
// three AC7 requires to be explicit - and PARTIALLY_ADOPTED). The
// WAVE2_ADOPTERS/WAVE3_ADOPTERS lists, used only to double-check that specific
// known adopters really do show up adopting (AC8 point 6), live in
// modalAdoption.wiring.test.ts, not here - they are checked AGAINST the scan
// below, never a substitute for it. C4's equivalent double-check is
// HOOK_ONLY_ADOPTER_SITES below, DERIVED rather than a fifth hardcoded array
// (the anti-pattern entry 272 check 5 records).
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
// the file that documents NOT being a dialog. Proven as a canary in
// modalAdoption.wiring.test.ts.
//
// The `role="dialog"`/`role="alertdialog"` markers are literal double-quoted
// string matches, not a JSX attribute parser. KNOWN BLIND SPOTS, not fixed
// here: `role='dialog'` with single quotes, and `role={someExpr}` computed
// at runtime, would both evade the scan entirely. Nothing in this codebase
// uses either shape today (verified by grep), so this is a documented limit
// of the marker set, not a claim that it is exhaustive.
//
// A DIALOG SITE ADOPTS if its source imports `ModalShell` or
// `useModalDismiss` from a path ending in that module name - checked as two
// separate predicates (importsModalShellComponent, importsUseModalDismissHook
// below) so HOOK_ONLY_ADOPTER_SITES can tell them apart: a site that imports
// the hook but not the shell must additionally carry decision 3's attributes
// BY HAND on the element the hook scopes to (AC8/C4 hole 1's describe block
// in modalAdoptionWiring.attributes.test.ts) - work ModalShell would
// otherwise have done for free.
//
// Every non-adopting dialog site must be named, with a reason, in exactly one
// of PERMANENT_EXCLUSIONS (AC7's exclusions - must never adopt),
// DEFERRED_CLASS_MISMATCH (refused on inspection because they use a
// different content class - open question, not a permanent decision - see
// that list's own contract comment below), or PENDING_ADOPTION (C4/C5 sites
// not yet converted - must adopt eventually). Those three lists (below) are
// checked in both directions by modalAdoption.wiring.test.ts: an entry naming
// a file that no longer exists, or that has started adopting, fails the
// test. PARTIALLY_ADOPTED (below, distinct from all three) is checked there
// too, with the OPPOSITE polarity - by definition its entries DO adopt - plus
// its own two-directional obligation: a file may not be silently missing from
// it, and an entry may not outlive the unconverted markup it was filed to
// record. See that list's own contract comment.
import { readdirSync, readFileSync } from "fs";
import { join, relative, sep } from "path";

// ---------------------------------------------------------------------------
// The tree walk and the classification predicates. Every one of these is
// proven against inline fixtures in modalAdoption.wiring.test.ts's canary
// block (the discipline entry 239 check 10 records and
// generatedPreviewModal.wiring.test.ts already follows) before it is trusted
// against the real files.
// ---------------------------------------------------------------------------

export const APP_ROOT = join(process.cwd(), "src/app");

/** Generic recursive directory walk, filtered by a filename predicate. The
 * shared primitive behind walkTsxFiles below and behind the
 * modalAdoptionScan.ts bundle-guard test in modalAdoption.wiring.test.ts
 * (which needs `.ts` files too, not just `.tsx`, since a component or a
 * lib module could import this module from either extension). */
export function walkFiles(dir: string, matches: (fileName: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, matches));
    } else if (entry.isFile() && matches(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every `.tsx` file under `src/app`, walked at test-run time - never a
 * static list. `.ts` files (useModalDismiss.ts itself, every `.wiring.test.ts`
 * file) are deliberately excluded: they are not components and cannot render
 * a dialog, and useModalDismiss.ts's own JSDoc contains the literal string
 * `role="dialog"` in prose (describing what its caller's container carries),
 * which would otherwise misclassify the hook file as a dialog site. */
export function walkTsxFiles(dir: string): string[] {
  return walkFiles(dir, (fileName) => fileName.endsWith(".tsx"));
}

/** Source with comments stripped, so a marker string mentioned in prose is
 * never mistaken for the real thing - see this module's header comment on
 * DownloadSelectionSection.tsx, the concrete case this exists for. Same
 * idiom generatedPreviewModal.wiring.test.ts uses. */
export function stripComments(text: string): string {
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
export function importsMuiDialog(strippedSource: string): boolean {
  if (/import\s+Dialog\s+from\s+["']@mui\/material\/Dialog["']/.test(strippedSource)) return true;
  const namedImportBlocks = [...strippedSource.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@mui\/material["']/g)];
  return namedImportBlocks.some((block) => block[1].split(",").map((s) => s.trim()).includes("Dialog"));
}

/** True when the file imports `ModalShell` from a path whose final segment is
 * exactly `ModalShell` - `../ui/ModalShell`, `./ui/ModalShell` match; a
 * hypothetical `../settings/useModalShellPrefs` (a different module that
 * merely shares a prefix) does not, because the regex requires the segment to
 * end at the closing quote. */
export function importsModalShellComponent(strippedSource: string): boolean {
  return /from\s+["'][^"']*\/ModalShell["']/.test(strippedSource);
}

/** True when the file imports `useModalDismiss` from a path whose final
 * segment is exactly `useModalDismiss` - same closing-quote discipline as
 * importsModalShellComponent above, and for the same reason. */
export function importsUseModalDismissHook(strippedSource: string): boolean {
  return /from\s+["'][^"']*\/useModalDismiss["']/.test(strippedSource);
}

/** True when the file imports `ModalShell` or `useModalDismiss` from a path
 * whose final segment is exactly that name. Kept as the OR of the two named
 * predicates above (not its own regex) so this function and
 * HOOK_ONLY_ADOPTER_SITES below can never drift apart on what "imports the
 * hook" or "imports the shell" means - they are built from the identical
 * checks, just combined differently. */
export function adoptsSharedMechanism(strippedSource: string): boolean {
  return importsModalShellComponent(strippedSource) || importsUseModalDismissHook(strippedSource);
}

/** Finds the index of the `>` that closes the JSX opening tag starting at
 * `tagStart` (which must point at the tag's own `<`, e.g. `<div`), tracking
 * `{`/`}` depth so a `>` INSIDE a brace-delimited value is never mistaken for
 * the tag's own close. Not cosmetic: every C4 hook-only adopter's backdrop
 * and content elements carry an arrow-function attribute
 * (`onClick={() => onClose()}`), and a naive `indexOf(">", tagStart)` stops
 * at the `>` inside that `=>`, truncating the slice early. Proven against
 * that exact shape in modalAdoption.wiring.test.ts's canary block. Returns -1
 * if no depth-zero `>` is found. */
export function findOpeningTagEnd(source: string, tagStart: number): number {
  let depth = 0;
  for (let i = tagStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return i;
  }
  return -1;
}

/** Slices the whole opening tag of the nearest enclosing `<div` at or before
 * `markerIndex` (e.g. `markerIndex` pointing at a `styles.previewModal`
 * class-marker occurrence returns that element's own opening tag), using
 * findOpeningTagEnd so an arrow-function attribute value does not truncate
 * it early. Returns null if no enclosing `<div` or no tag-closing `>` can be
 * found. */
export function tagAt(source: string, markerIndex: number): string | null {
  const tagStart = source.lastIndexOf("<div", markerIndex);
  if (tagStart === -1) return null;
  const tagEnd = findOpeningTagEnd(source, tagStart);
  if (tagEnd === -1) return null;
  return source.slice(tagStart, tagEnd + 1);
}

/** A DIALOG SITE per this module's header comment: the four raw-markup/MUI
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
export function isDialogSite(strippedSource: string): boolean {
  return (
    strippedSource.includes("styles.previewBackdrop") ||
    strippedSource.includes('role="dialog"') ||
    strippedSource.includes('role="alertdialog"') ||
    importsMuiDialog(strippedSource) ||
    adoptsSharedMechanism(strippedSource)
  );
}

export function toRepoRelativePosix(absPath: string): string {
  return relative(process.cwd(), absPath).split(sep).join("/");
}

export interface SiteInfo {
  readonly path: string;
  readonly strippedSource: string;
  readonly adopts: boolean;
  readonly isDialogSite: boolean;
}

export function classify(absPath: string): SiteInfo {
  const stripped = stripComments(readFileSync(absPath, "utf8"));
  return {
    path: toRepoRelativePosix(absPath),
    strippedSource: stripped,
    adopts: adoptsSharedMechanism(stripped),
    isDialogSite: isDialogSite(stripped),
  };
}

// ---------------------------------------------------------------------------
// The four lists checked against the scan (AC7's three plus PARTIALLY_
// ADOPTED). Populated from what the scan above actually finds (verified by
// running it) - the assertions in modalAdoption.wiring.test.ts are what keeps
// that true over time, not this comment.
// ---------------------------------------------------------------------------

export interface ListedSite {
  readonly path: string;
  readonly reason: string;
}

/** AC7's exclusions - must NEVER adopt. Removing an entry here is meant to be
 * a visible, deliberate decision (AC7's own wording), which is exactly what
 * "must exist and must still not be adopting" (modalAdoption.wiring.test.ts)
 * enforces. */
export const PERMANENT_EXCLUSIONS: readonly ListedSite[] = [
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
 * accept (making this exclusion permanent) - this module does not make that
 * call, it only keeps the open question visible and both directions
 * checked (modalAdoption.wiring.test.ts). */
export const DEFERRED_CLASS_MISMATCH: readonly ListedSite[] = [
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
 * "must still not be adopting" (modalAdoption.wiring.test.ts) is what makes
 * a landed wave visible here rather than left to rot into a permanent-looking
 * exclusion. */
export const PENDING_ADOPTION: readonly ListedSite[] = [
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

/** A FOURTH list, distinct from all three above: a file that DOES adopt the
 * shared mechanism (it belongs in ADOPTING_PATHS, and must NOT be listed in
 * PENDING_ADOPTION - "must still not be adopting" there would fail the moment
 * it is) but is not actually finished, because the classification below is
 * FILE-granular, not dialog-granular (see modalAdoption.wiring.test.ts's
 * count-pin comment - OfficeEditorModal.tsx holds two dialogs in one file,
 * entry 273 check 7). C4 converted only the nested `movingSection` overlay;
 * the outer dialog (`styles.previewBackdrop` at this file's top) is
 * untouched, hand-rolled markup still awaiting C5 (the Waves section, and
 * this file's own PENDING_ADOPTION comment before C4 landed). Once the file
 * imports `useModalDismiss` for the nested overlay, the scan can no longer
 * tell "this file finished every dialog it renders" from "this file finished
 * ONE of several" - without an entry here that distinction would vanish
 * silently, which is exactly the gap C4's hand-off warned against ("do not
 * just delete the entry and lose that fact").
 *
 * Checked in modalAdoption.wiring.test.ts, in both directions, plus THREE
 * checks the other lists do not need: the file must exist; it must still be
 * genuinely ADOPTING; its outer dialog's pre-C4 backdrop marker must still be
 * present verbatim (unconvertedMarker); and its CONTENT element must still
 * carry none of decision 3's attributes (convertedContentMarker) - together
 * these are what "genuinely unconverted" means (field comments explain why
 * neither proves it alone). A FOURTH obligation - no file silently MISSING
 * from this list - is enforced from the tree by
 * ADOPTING_WITH_LEFTOVER_BACKDROP_MARKER further below: PENDING_ADOPTION's
 * "shrinks to empty by C5" contract, given to this list too. */
export interface PartialAdoptionSite extends ListedSite {
  /** Must still be found, verbatim, in this file's source - proof the
   * BACKDROP half of the remainder is unconverted. ALONE this does not
   * prove the CONTENT half hasn't also been converted (a botched C5 could
   * move the attributes there while leaving this string untouched) -
   * convertedContentMarker below closes that gap. */
  readonly unconvertedMarker: string;
  /** Class marker (e.g. `styles.previewModal`) of this file's still-unadopted
   * CONTENT element. Confirms that element's opening tag carries NONE of
   * `ref=`/`tabIndex={-1}`/`role="dialog"`/`aria-modal`/`aria-label` yet. */
  readonly convertedContentMarker: string;
}

export const PARTIALLY_ADOPTED: readonly PartialAdoptionSite[] = [
  {
    path: "src/app/components/content-tab/OfficeEditorModal.tsx",
    reason: "C4 converted the nested move-section overlay only; the outer dialog (styles.previewBackdrop) is untouched, hand-rolled markup still awaiting C5 - this file shows as adopting only because the scan is file-granular, not dialog-granular",
    unconvertedMarker: 'styles.previewBackdrop} role="dialog"',
    convertedContentMarker: "styles.previewModal",
  },
];

/** A reason string a future reader can act on - "excluded" alone is not one
 * (this module's own brief says so). No attempt to judge prose quality beyond
 * a length floor; the point is to catch an entry added with a placeholder,
 * not to grade writing. */
export function isSubstantiveReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= 20 && !/^excluded$/i.test(trimmed);
}

/** The mechanism itself, excluded from the scan by exact path rather than by
 * a marker heuristic - see the header comment. Left in, `ModalShell.tsx`
 * would classify as a dialog site (it carries `role="dialog"` on the content
 * section it renders) that also adopts (it imports `useModalDismiss`),
 * inflating ADOPTING_PATHS by one entry that is the mechanism, not a site
 * the mechanism protects. Checked for existence in
 * modalAdoption.wiring.test.ts (the pinned dialog-site/adopting counts drift
 * the moment this path stops matching a real file), so a rename disables the
 * exclusion loudly rather than quietly. */
export const MECHANISM_PATH = "src/app/components/ui/ModalShell.tsx";

// ---------------------------------------------------------------------------
// The real scan, computed once at module load - every describe block in
// modalAdoption.wiring.test.ts and modalAdoptionWiring.attributes.test.ts
// reads from these, none re-walks the tree.
// ---------------------------------------------------------------------------

export const ALL_TSX_FILES = walkTsxFiles(APP_ROOT).filter(
  (absPath) => toRepoRelativePosix(absPath) !== MECHANISM_PATH,
);
export const SITES: SiteInfo[] = ALL_TSX_FILES.map(classify);
export const DIALOG_SITES = SITES.filter((s) => s.isDialogSite);
export const ADOPTING_PATHS = new Set(DIALOG_SITES.filter((s) => s.adopts).map((s) => s.path));

/** The hook-only C4/C5 adopters - files that import `useModalDismiss` but do
 * NOT import `ModalShell` - derived from the SAME scan above, never a
 * hardcoded list. AC8/C4 hole 1 (modalAdoptionWiring.attributes.test.ts)
 * checks these: a hook-only adopter gets none of ModalShell's wiring for
 * free, so importing the hook alone proves nothing about whether decision 3's
 * attributes actually landed. */
export const HOOK_ONLY_ADOPTER_SITES: SiteInfo[] = SITES.filter(
  (s) => importsUseModalDismissHook(s.strippedSource) && !importsModalShellComponent(s.strippedSource),
);

/** Result of analyzeHookOnlyAdopterSource - `problems` empty means every check passed. */
export interface HookOnlyWiringResult {
  readonly path: string;
  readonly problems: readonly string[];
}

/**
 * Proves a hook-only adopter did the FOUR things ModalShell does for free
 * (AC's "C4 implementation notes"): `tabIndex={-1}`, `ref={<the hook's own
 * containerRef, however locally named>}`, `role="dialog"`,
 * `aria-modal="true"` and a non-empty `aria-label`, all on the SAME element -
 * and that the BACKDROP wrapping it carries none of the ARIA (decision 3).
 *
 * REF LOCAL NAME IS DERIVED, NEVER ASSUMED "containerRef": pulled from the
 * `const { containerRef[: localName] } = useModalDismiss(...)` destructure
 * actually present. OfficeEditorModal.tsx renames it to
 * `moveSectionContainerRef` - a hardcoded `ref={containerRef}` check finds
 * nothing there. Proven in modalAdoptionWiring.attributes.test.ts's canary
 * block. THIS IS ALSO HOW OfficeEditorModal.tsx's TWO DIALOGS ARE TOLD APART
 * WITHOUT A SEPARATE CASE: only ONE element in the file can carry the exact
 * attribute `ref={<derived local name>}`; the outer (C5, not-yet-adopted)
 * dialog has no `ref=` at all, so it can never match - excluded by
 * construction.
 *
 * WHAT THIS CAN/CANNOT PROVE (node-env vitest, nothing here renders): these
 * five attributes are written, as source text, on one element, with none of
 * the ARIA on the element wrapping it. NOT proven: that element is the DOM
 * node `containerRef.current` points to at runtime - a `ref={...}` on the
 * WRONG div would satisfy this and still be a real bug; only rendering
 * could catch that. */
export function analyzeHookOnlyAdopterSource(stripped: string, path: string): HookOnlyWiringResult {
  const problems: string[] = [];

  const destructureMatch = /const\s*\{\s*containerRef(?:\s*:\s*(\w+))?\s*\}\s*=\s*useModalDismiss/.exec(stripped);
  if (!destructureMatch) {
    return { path, problems: ["no `const { containerRef[: localName] } = useModalDismiss(...)` destructure found"] };
  }
  const localName = destructureMatch[1] ?? "containerRef";

  const refMatch = new RegExp(`ref=\\{${localName}\\}`).exec(stripped);
  if (!refMatch) {
    return { path, problems: [`no element carries ref={${localName}} (the hook's own containerRef, derived from the destructure above)`] };
  }

  const contentTagStart = stripped.lastIndexOf("<div", refMatch.index);
  const contentTagEnd = contentTagStart === -1 ? -1 : findOpeningTagEnd(stripped, contentTagStart);
  if (contentTagStart === -1 || contentTagEnd === -1) {
    return { path, problems: [`could not locate the enclosing <div's full opening tag around ref={${localName}}`] };
  }
  const contentTag = stripped.slice(contentTagStart, contentTagEnd + 1);

  if (!contentTag.includes(`ref={${localName}}`)) problems.push(`ref={${localName}} is not on the same element as the other four attributes`);
  if (!contentTag.includes("tabIndex={-1}")) problems.push(`missing tabIndex={-1} on the ref={${localName}} element`);
  if (!contentTag.includes('role="dialog"')) problems.push(`missing role="dialog" on the ref={${localName}} element`);
  if (!contentTag.includes('aria-modal="true"')) problems.push(`missing aria-modal="true" on the ref={${localName}} element`);
  if (!/aria-label="[^"]+"/.test(contentTag)) problems.push(`missing a non-empty aria-label on the ref={${localName}} element`);

  const backdropTagStart = stripped.lastIndexOf("<div", contentTagStart - 1);
  if (backdropTagStart === -1) {
    problems.push("could not locate the backdrop element wrapping the ref-bearing content element");
  } else {
    const backdropTagEnd = findOpeningTagEnd(stripped, backdropTagStart);
    const backdropTag = backdropTagEnd === -1 ? stripped.slice(backdropTagStart) : stripped.slice(backdropTagStart, backdropTagEnd + 1);
    if (/role=|aria-modal|aria-label/.test(backdropTag)) {
      problems.push("the backdrop still carries role/aria-modal/aria-label - decision 3 moves these onto the content element only");
    }
  }

  return { path, problems };
}

/** Independent, tree-derived proof PARTIALLY_ADOPTED (above) is not missing
 * an entry: a site that adopts for at least one dialog while STILL
 * containing the raw `styles.previewBackdrop` marker is the file-granular
 * blind spot that list exists to record. Unlike PENDING_ADOPTION, whose
 * orphan check gets this for free from `adopts`, a partially-adopted file's
 * `adopts` is ALREADY true - this leftover-marker signal is the only
 * tree-derived way to notice a missing entry. */
export const ADOPTING_WITH_LEFTOVER_BACKDROP_MARKER: string[] = DIALOG_SITES.filter(
  (s) => s.adopts && s.strippedSource.includes("styles.previewBackdrop"),
).map((s) => s.path);
