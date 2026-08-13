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
// HOOK_DESTRUCTURE_SITES below, DERIVED rather than a fifth hardcoded array
// (the anti-pattern entry 272 check 5 records). HOOK_DESTRUCTURE_SITES is
// itself a rename-and-refix of what wave 4 called HOOK_ONLY_ADOPTER_SITES -
// see that constant's own comment for the hole its old name and old filter
// left open, which wave 5 walked straight into.
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
// below) so a caller can tell them apart. What actually needs decision 3's
// attributes checked BY HAND (AC8/C4 hole 1's describe block in
// modalAdoptionWiring.attributes.test.ts) - work ModalShell would otherwise
// have done for free - is NOT "imports the hook but not the shell": that was
// wave 4's framing, and it silently broke the moment a single file could
// legitimately do both (OfficeEditorModal.tsx, C5 - see
// HOOK_DESTRUCTURE_SITES's own comment below for the concrete hole this
// left, and how it is derived instead now).
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
 * predicates above (not its own regex) so callers of the individual
 * predicates and this combined one can never drift apart on what "imports
 * the hook" or "imports the shell" means - they are built from the identical
 * checks, just combined differently. (HOOK_DESTRUCTURE_SITES below is built
 * from a different signal entirely - hasHookDestructure, not this function -
 * see that constant's own comment for why "imports the hook" is not the same
 * question as "hand-wires the hook's ref onto an element".) */
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

/** Finds the start index of the JSX opening-tag token (`<TagName`) nearest at
 * or before `beforeIndex`, for WHATEVER tag name it is - the generalization
 * of `source.lastIndexOf("<div", beforeIndex)`, which this module used to
 * hardcode in two places (see findEnclosingOpeningTag's own comment for the
 * false negative that hardcoding produced on AccessibilityCenter.tsx, an
 * `<aside>`). Matches any `<Identifier` token, so it finds `<aside`,
 * `<section`, a component like `<Foo`, or a plain `<div` alike. Returns -1 if
 * no tag start exists before `beforeIndex`. */
export function lastTagStartBefore(source: string, beforeIndex: number): number {
  const tagStartPattern = /<[A-Za-z][\w.]*/g;
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = tagStartPattern.exec(source))) {
    if (match.index > beforeIndex) break;
    last = match.index;
  }
  return last;
}

/** Finds the opening tag - of WHATEVER tag name - that actually ENCLOSES
 * `index` (e.g. `index` pointing at a `ref={x}` occurrence inside that tag's
 * own attribute list returns that element's full opening tag). This is the
 * fix for a real defect the C5 implementer found: the old code assumed the
 * enclosing element was always `<div` and used
 * `source.lastIndexOf("<div", index)` to find it, which is correct only by
 * coincidence when every candidate element happens to be a div. C5's
 * AccessibilityCenter.tsx broke that coincidence - its content element is an
 * `<aside>`, preceded by a self-closing `<div ... aria-hidden="true" />`
 * backdrop - so `lastIndexOf("<div", ...)` walked PAST the enclosing
 * `<aside>` entirely and landed on the backdrop div instead, which carries
 * none of the five required attributes. That produced a false negative
 * (reporting a correctly-wired `<aside>` as missing ref/tabIndex/role/
 * aria-modal/aria-label) of the same kind as a hardcoded file list (entry
 * 272 check 5, docs/REGRESSION.md) - a hardcoded ASSUMPTION excluding the
 * exact site it was meant to check, just at the tag-name granularity instead
 * of the file-list granularity.
 *
 * The fix tries each preceding tag-start (via lastTagStartBefore above) from
 * nearest to farthest, and keeps the first one whose own close (via
 * findOpeningTagEnd) lands AT OR AFTER `index` - a tag that already closed
 * (its own `>` sits before `index`, as the backdrop's self-closing `/>`
 * does relative to the `<aside>`'s later `ref=`) cannot be the tag enclosing
 * `index`, so the search continues past it rather than accepting the
 * nearest candidate unconditionally the way a plain lastIndexOf does.
 * Returns null if no enclosing tag can be found. */
export function findEnclosingOpeningTag(source: string, index: number): { tagStart: number; tagEnd: number } | null {
  let searchBefore = index;
  while (true) {
    const tagStart = lastTagStartBefore(source, searchBefore);
    if (tagStart === -1) return null;
    const tagEnd = findOpeningTagEnd(source, tagStart);
    if (tagEnd !== -1 && tagEnd >= index) return { tagStart, tagEnd };
    // This candidate tag already closed before `index` (or never closes) -
    // it cannot be the enclosing tag. Keep searching strictly before it.
    searchBefore = tagStart - 1;
  }
}

/** Slices the whole opening tag of the nearest ENCLOSING tag at or before
 * `markerIndex` (e.g. `markerIndex` pointing at a `styles.previewModal`
 * class-marker occurrence returns that element's own opening tag), whatever
 * that tag's name is - see findEnclosingOpeningTag above for why this can no
 * longer assume `<div`. Returns null if no enclosing tag can be found. */
export function tagAt(source: string, markerIndex: number): string | null {
  const enclosing = findEnclosingOpeningTag(source, markerIndex);
  if (!enclosing) return null;
  return source.slice(enclosing.tagStart, enclosing.tagEnd + 1);
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
 * acceptance-criteria.md, "Waves"). Every entry named the wave that would
 * take it. This list was meant to shrink to empty by the end of wave C5 -
 * "must still not be adopting" (modalAdoption.wiring.test.ts) is what makes
 * a landed wave visible here rather than left to rot into a permanent-looking
 * exclusion.
 *
 * IT IS NOW EMPTY: wave C5 (docs/modal-dismissal-focus-acceptance-criteria.md's
 * "C5 implementation notes") converted the four sites that used to be listed
 * here - `AccessibilityCenter.tsx` (hook only), `GradingResults.tsx`,
 * `drafted-grades/CommentEditModal.tsx`, and `knowledge/AttachmentPreviewModal.tsx`
 * (all three via ModalShell) - fulfilling the contract this comment
 * describes; WAVE5_ADOPTERS in modalAdoption.wiring.test.ts double-checks all
 * four (plus OfficeEditorModal.tsx, below) really do show up adopting. The
 * array stays declared and typed as empty, not deleted: the checks that read
 * it in modalAdoption.wiring.test.ts (files still exist, files still have
 * not adopted, every entry has a substantive reason) and the orphan check in
 * the AC8 describe block all still run against an empty array, and all still
 * fail the moment a NEW dialog site is added without adopting or being named
 * on one of the four lists - an empty list with live checks is the end state
 * this wave earns, not a hole where the checks used to be. */
export const PENDING_ADOPTION: readonly ListedSite[] = [];

/** A FOURTH list, distinct from all three above: a file that DOES adopt the
 * shared mechanism (it belongs in ADOPTING_PATHS, and must NOT be listed in
 * PENDING_ADOPTION - "must still not be adopting" there would fail the moment
 * it is) but was not actually finished, because the classification below is
 * FILE-granular, not dialog-granular (see modalAdoption.wiring.test.ts's
 * count-pin comment - OfficeEditorModal.tsx holds two dialogs in one file,
 * entry 273 check 7). C4 converted only the nested `movingSection` overlay;
 * the outer dialog (`styles.previewBackdrop` at this file's top) stayed
 * untouched, hand-rolled markup awaiting C5 (the Waves section, and this
 * file's own PENDING_ADOPTION comment before C4 landed). While the file
 * imported `useModalDismiss` for the nested overlay but not yet ModalShell
 * for the outer one, the scan could no longer tell "this file finished
 * every dialog it renders" from "this file finished ONE of several" -
 * without an entry here that distinction would have vanished silently,
 * which is exactly the gap C4's hand-off warned against ("do not just
 * delete the entry and lose that fact").
 *
 * IT IS NOW EMPTY: wave C5 (docs/modal-dismissal-focus-acceptance-criteria.md's
 * "C5 implementation notes") converted OfficeEditorModal.tsx's outer dialog
 * via ModalShell - its former `unconvertedMarker` (the raw
 * `styles.previewBackdrop} role="dialog"` backdrop) is verifiably gone from
 * the file's own source, fulfilling this list's "shrinks to empty by C5"
 * contract (entry 281 check 7) at the same moment PENDING_ADOPTION's did.
 * WAVE5_ADOPTERS in modalAdoption.wiring.test.ts double-checks
 * OfficeEditorModal.tsx still shows as adopting.
 *
 * Checked in modalAdoption.wiring.test.ts, in both directions, plus THREE
 * checks the other lists do not need: every entry's file must exist; it must
 * be genuinely ADOPTING; its outer dialog's pre-C4 backdrop marker must
 * still be present verbatim (unconvertedMarker); and its CONTENT element
 * must carry none of decision 3's attributes (convertedContentMarker) -
 * together these are what "genuinely unconverted" means (field comments
 * explain why neither proves it alone). A FOURTH obligation - no file
 * silently MISSING from this list - is enforced from the tree by
 * ADOPTING_WITH_LEFTOVER_BACKDROP_MARKER further below: PENDING_ADOPTION's
 * "shrinks to empty by C5" contract, given to this list too. The array
 * stays declared and typed as empty, not deleted, for the same reason
 * PENDING_ADOPTION does: all five checks still run against an empty array
 * and still catch a NEW multi-dialog file that lands half-adopted without
 * being named here. */
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

export const PARTIALLY_ADOPTED: readonly PartialAdoptionSite[] = [];

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

/** The regex behind BOTH "does this file hand-wire the hook's own
 * containerRef onto an element" (HOOK_DESTRUCTURE_SITES and
 * hasHookDestructure below) and "what local name did it give that ref"
 * (analyzeHookOnlyAdopterSource) - ONE pattern, so the two questions can
 * never drift apart on what counts, the same discipline adoptsSharedMechanism
 * already applies by building itself from importsModalShellComponent and
 * importsUseModalDismissHook rather than a third independent regex. */
const HOOK_DESTRUCTURE_PATTERN = /const\s*\{\s*containerRef(?:\s*:\s*(\w+))?\s*\}\s*=\s*useModalDismiss/;

/** True when the file contains a `const { containerRef[: localName] } =
 * useModalDismiss(...)` destructure - i.e. it hand-wires the hook's own ref
 * onto an element, the signal HOOK_DESTRUCTURE_SITES below derives from.
 * THIS, not "imports the hook but does not import ModalShell", is what
 * actually means "this file has decision 3's attributes to check by hand" -
 * see HOOK_DESTRUCTURE_SITES's own comment for the hole the old derivation
 * left open. */
export function hasHookDestructure(strippedSource: string): boolean {
  return HOOK_DESTRUCTURE_PATTERN.test(strippedSource);
}

/** Every site that hand-wires the hook's own `containerRef` onto an element -
 * derived from the file containing a `const { containerRef[: localName] } =
 * useModalDismiss(...)` destructure (hasHookDestructure above), never from
 * whether the file ALSO imports ModalShell for some OTHER dialog. AC8/C4
 * hole 1 (modalAdoptionWiring.attributes.test.ts) checks these: hand-wiring
 * the hook gets none of ModalShell's wiring for free, so the destructure
 * alone proves nothing about whether decision 3's attributes actually landed
 * on the right element.
 *
 * RENAMED FROM HOOK_ONLY_ADOPTER_SITES, AND RE-DERIVED, BECAUSE THE OLD NAME
 * AND FILTER WERE BOTH WRONG THE MOMENT A SINGLE FILE COULD LEGITIMATELY DO
 * BOTH. The old filter was `importsUseModalDismissHook(...) &&
 * !importsModalShellComponent(...)` - true for OfficeEditorModal.tsx during
 * C4 (only its nested overlay had adopted anything), but false the instant
 * C5 converted that SAME file's outer dialog via ModalShell: the file then
 * imported both, `!importsModalShellComponent` excluded it, and it silently
 * dropped out of this set - taking with it the ONLY test that verified its
 * nested overlay's hand-wired ref/tabIndex/role/aria-modal/aria-label.
 * Verified live: deleting `ref={moveSectionContainerRef}` from
 * OfficeEditorModal.tsx left tsc, eslint and the whole suite green while that
 * overlay's trap, focusin net and initial focus went silently dead AND it
 * still registered in the shared LIFO stack, making every other modal in the
 * app non-topmost - verbatim the failure REGRESSION entry 281 check 6 was
 * written to close, reopened by C5's own adoption of ModalShell for the
 * OTHER dialog in the same file, and closed again here. "A file can
 * legitimately do both" is not a hypothetical; OfficeEditorModal.tsx is the
 * proof, and nothing rules out a future file doing the same for a different
 * pair of dialogs.
 *
 * The new derivation has no such blind spot: it does not care what ELSE the
 * file imports, only whether the file ITSELF contains the destructure that
 * means "some element in here needs decision 3's attributes hand-written on
 * it." OfficeEditorModal.tsx now correctly stays a member for as long as its
 * nested overlay keeps hand-wiring the hook, regardless of what its outer
 * dialog does. SIX sites today, not five: the four unchanged family-B
 * editors (DocStructureEditor, PdfFixEditor, RemediationEditor,
 * OfficeAltEditor), AccessibilityCenter.tsx (hook only, no CSS module for
 * ModalShell's classes to fit - "C5 implementation notes"), and
 * OfficeEditorModal.tsx (which the old derivation used to lose).
 *
 * MECHANISM_PATH still excludes ModalShell.tsx itself from SITES before this
 * filter ever runs (via ALL_TSX_FILES above), so ModalShell.tsx's own
 * `const { containerRef } = useModalDismiss(...)` call cannot be swept into
 * this set no matter how the filter itself is spelled - confirmed, not just
 * assumed, by modalAdoption.wiring.test.ts's existence check on
 * MECHANISM_PATH, which fails loudly the moment that path stops resolving to
 * a real file. */
export const HOOK_DESTRUCTURE_SITES: SiteInfo[] = SITES.filter((s) => hasHookDestructure(s.strippedSource));

/** Result of analyzeHookOnlyAdopterSource - `problems` empty means every check passed. */
export interface HookOnlyWiringResult {
  readonly path: string;
  readonly problems: readonly string[];
}

/** True for either shape a hand-wired site's accessible name can take: a
 * double-quoted string literal (`aria-label="Fix document structure"`,
 * every one of today's six HOOK_DESTRUCTURE_SITES) or a JSX expression
 * container (`aria-label={label}` / `` aria-label={`Edit ${name}`} ``, the
 * shape several ModalShell-routed adopters already use -
 * LecturePlanPreviewModal.tsx:256 is one). The old pattern
 * (`/aria-label="[^"]+"/`) only accepted the first: a hand-wired site that
 * legitimately computed its accessible name from a prop or template literal,
 * rather than writing a fixed string, would have failed this check even with
 * a perfectly good non-empty name. No HOOK_DESTRUCTURE_SITES member does
 * this today (verified by reading all six), so this was a latent bug, not
 * yet a live false negative - fixed here rather than left for the first
 * adopter that legitimately needs it. */
export function hasAccessibleName(tag: string): boolean {
  return /aria-label="[^"]+"|aria-label=\{[^}]+\}/.test(tag);
}

/** Resolves the element that actually wraps, or immediately precedes, the
 * content element at `beforeIndex` - the BACKDROP decision 3 requires to
 * carry none of role/aria-modal/aria-label - by walking
 * `source[fromIndex, beforeIndex)` as a stack of still-open JSX tags. This is
 * the same enclosure reasoning findEnclosingOpeningTag above uses, extended
 * to actual parentage: findEnclosingOpeningTag answers a different question
 * (which tag's OWN opening-tag span contains a given index - used above for
 * the content element's `ref=` attribute), not which tag WRAPS a later
 * position.
 *
 * `fromIndex` bounds the scan to a region the caller already knows is
 * balanced JSX (analyzeHookOnlyAdopterSource passes the hook's own
 * destructure position, always textually before the JSX return) - scanning
 * from the file's start instead would drag in earlier non-JSX code (other
 * hooks' own generic type arguments, comparisons, etc.) this function has no
 * reliable way to tell from real tags beyond rule 1 below, and every bit of
 * scan surface it does not need is surface it could be fooled by.
 *
 * THREE RULES, applied in the order they resolve a real ambiguity found by
 * an adversarial regression pass against the OLD backdrop lookup
 * (`lastTagStartBefore(stripped, contentTagStart - 1)` with NO enclosure
 * validation at all - it assumed the NEAREST PRECEDING tag-start token was
 * necessarily the wrapping element, a stronger claim than lastTagStartBefore
 * itself ever makes):
 *  1. A tag-start whose `<` is glued directly onto a preceding identifier
 *     (e.g. `useModalDismiss<HTMLDivElement>`) is rejected outright, never
 *     pushed or tracked - that shape is a TypeScript generic type argument,
 *     never a JSX tag, and a real JSX tag's `<` is always preceded by
 *     whitespace, `{`, `}`, `(`, `>`, or the start of the file. Fixes the
 *     false backdrop a Fragment-wrapped content element used to produce: the
 *     old code walked straight past the Fragment shorthand (which its
 *     `<Identifier` pattern does not even match) into this generic instead,
 *     and the ARIA check then ran against the generic's own (attribute-free)
 *     text and passed VACUOUSLY - not because the backdrop was clean, but
 *     because there was never a backdrop there to check.
 *  2. A self-closing tag is never pushed onto the ancestor stack - nothing
 *     can be "inside" one - but IS tracked as `lastSiblingAtCurrentDepth`,
 *     reset every time the stack itself changes (a push or a pop). This is
 *     what lets a self-closing SIBLING immediately preceding the content
 *     element - AccessibilityCenter.tsx's actual backdrop, a `<div ...
 *     aria-hidden="true" />` rendered NEXT TO, not around, its `<aside>` -
 *     still resolve to something, while a self-closing DECOY sibling INSIDE
 *     a real wrapping backdrop (e.g. a stray `<hr />` sitting between a
 *     `role="dialog"` div and the content element) does not shadow that real
 *     wrapping ancestor: rule 3 always prefers a real ancestor over a
 *     same-depth sibling, so the decoy is skipped and the actual violation
 *     is still found.
 *  3. The result is the top of the ancestor stack if that top is a real
 *     (non-Fragment) tag; otherwise (the stack is empty, or its top is a
 *     Fragment) the result is `lastSiblingAtCurrentDepth`, which may itself
 *     be null - meaning nothing resolvable precedes the content element at
 *     all. Callers MUST treat null as "cannot resolve a backdrop" and fail
 *     loudly rather than guess one; analyzeHookOnlyAdopterSource below does.
 *
 * CHOICE MADE HERE, per this task's own instruction to say which: fix the
 * resolution properly rather than fail loudly across the board. Both
 * concretely reported false-pass shapes (the decoy sibling, the
 * Fragment-plus-generic collision) turned out to have a reliable general fix
 * once the search tracked actual tag nesting instead of nearest-token
 * distance, and the one legitimate non-wrapping shape already live in this
 * codebase (AccessibilityCenter.tsx) is accounted for by name (rule 2) rather
 * than by the accident the old nearest-token search relied on. The one shape
 * this still cannot resolve - no wrapping ancestor AND no preceding sibling
 * at all, e.g. the content element is the sole top-level return with nothing
 * before it, not even a Fragment - returns null; nothing in this codebase
 * renders that shape today, so it is untested against a real file, but an
 * unresolved backdrop must never read as a clean bill of health. Proven
 * against all three shapes as fixtures in
 * modalAdoptionWiring.attributes.test.ts before being trusted here, per entry
 * 239 check 10's discipline. */
export function findBackdropTagStart(source: string, fromIndex: number, beforeIndex: number): number | null {
  interface OpenTagFrame {
    readonly tagStart: number;
    readonly isFragment: boolean;
  }
  const stack: OpenTagFrame[] = [];
  let lastSiblingAtCurrentDepth: number | null = null;
  const tagPattern = /<\/[A-Za-z][\w.]*\s*>|<\/>|<>|<[A-Za-z][\w.]*/g;
  tagPattern.lastIndex = fromIndex;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source))) {
    if (match.index >= beforeIndex) break;
    const token = match[0];
    if (token.startsWith("</")) {
      stack.pop();
      lastSiblingAtCurrentDepth = null;
      continue;
    }
    if (token === "<>") {
      stack.push({ tagStart: match.index, isFragment: true });
      lastSiblingAtCurrentDepth = null;
      continue;
    }
    const prevChar = match.index > 0 ? source[match.index - 1] : "";
    if (/\w/.test(prevChar)) continue; // glued to an identifier - a generic type argument, never a JSX tag (rule 1)
    const tagEnd = findOpeningTagEnd(source, match.index);
    if (tagEnd === -1 || tagEnd >= beforeIndex) continue; // unterminated, or this candidate's own tag has not even closed before beforeIndex
    if (source[tagEnd - 1] === "/") {
      lastSiblingAtCurrentDepth = match.index; // self-closing - rule 2
    } else {
      stack.push({ tagStart: match.index, isFragment: false });
      lastSiblingAtCurrentDepth = null;
    }
    tagPattern.lastIndex = tagEnd + 1;
  }

  const top = stack[stack.length - 1];
  if (top && !top.isFragment) return top.tagStart; // rule 3: a real ancestor always wins
  return lastSiblingAtCurrentDepth;
}

/**
 * Proves a hand-wired site did the FOUR things ModalShell does for free
 * (AC's "C4 implementation notes"): `tabIndex={-1}`, `ref={<the hook's own
 * containerRef, however locally named>}`, `role="dialog"`,
 * `aria-modal="true"` and a non-empty `aria-label`, all on the SAME element -
 * and that the BACKDROP wrapping it carries none of the ARIA (decision 3).
 *
 * REF LOCAL NAME IS DERIVED, NEVER ASSUMED "containerRef": pulled from the
 * `const { containerRef[: localName] } = useModalDismiss(...)` destructure
 * actually present (HOOK_DESTRUCTURE_PATTERN, shared with hasHookDestructure
 * above so the two can never disagree on what counts as one). OfficeEditorModal.tsx's
 * nested "move section" overlay renames it to `moveSectionContainerRef` - a
 * hardcoded `ref={containerRef}` check finds nothing there. Proven in
 * modalAdoptionWiring.attributes.test.ts's canary block. THIS IS ALSO HOW
 * OfficeEditorModal.tsx's TWO DIALOGS ARE TOLD APART WITHOUT A SEPARATE CASE,
 * in both C4 (while the file was itself a HOOK_DESTRUCTURE_SITES member on
 * its own) and now, after C5 converted its outer dialog via ModalShell: only
 * ONE element in the file's OWN source carries the exact attribute
 * `ref={<derived local name>}` - ModalShell's internal `ref={containerRef}`
 * call lives inside ModalShell.tsx, a file this function never runs against
 * (excluded by MECHANISM_PATH before SITES is even built) - so the outer
 * dialog can never be mistaken for the element this function checks, in
 * either wave.
 *
 * WHAT THIS CAN/CANNOT PROVE (node-env vitest, nothing here renders): these
 * five attributes are written, as source text, on one element, with none of
 * the ARIA on the element wrapping it. NOT proven: that element is the DOM
 * node `containerRef.current` points to at runtime - a `ref={...}` on the
 * WRONG element would satisfy this and still be a real bug; only rendering
 * could catch that. */
export function analyzeHookOnlyAdopterSource(stripped: string, path: string): HookOnlyWiringResult {
  const problems: string[] = [];

  const destructureMatch = HOOK_DESTRUCTURE_PATTERN.exec(stripped);
  if (!destructureMatch) {
    return { path, problems: ["no `const { containerRef[: localName] } = useModalDismiss(...)` destructure found"] };
  }
  const localName = destructureMatch[1] ?? "containerRef";

  const refMatch = new RegExp(`ref=\\{${localName}\\}`).exec(stripped);
  if (!refMatch) {
    return { path, problems: [`no element carries ref={${localName}} (the hook's own containerRef, derived from the destructure above)`] };
  }

  // The content element's TAG NAME is derived, never assumed `<div`: see
  // findEnclosingOpeningTag's own comment for the false negative a hardcoded
  // `<div` assumption produced on AccessibilityCenter.tsx (an `<aside>`,
  // C5) - the same class of mistake as assuming a fixed file list, just at
  // tag-name granularity.
  const enclosingTag = findEnclosingOpeningTag(stripped, refMatch.index);
  if (!enclosingTag) {
    return { path, problems: [`could not locate the opening tag enclosing ref={${localName}}`] };
  }
  const { tagStart: contentTagStart, tagEnd: contentTagEnd } = enclosingTag;
  const contentTag = stripped.slice(contentTagStart, contentTagEnd + 1);

  if (!contentTag.includes(`ref={${localName}}`)) problems.push(`ref={${localName}} is not on the same element as the other four attributes`);
  if (!contentTag.includes("tabIndex={-1}")) problems.push(`missing tabIndex={-1} on the ref={${localName}} element`);
  if (!contentTag.includes('role="dialog"')) problems.push(`missing role="dialog" on the ref={${localName}} element`);
  if (!contentTag.includes('aria-modal="true"')) problems.push(`missing aria-modal="true" on the ref={${localName}} element`);
  if (!hasAccessibleName(contentTag)) problems.push(`missing a non-empty aria-label on the ref={${localName}} element`);

  // See findBackdropTagStart's own comment for the full defect history and
  // the choice made here (fix properly rather than fail loudly across the
  // board), including why AccessibilityCenter.tsx's self-closing-sibling
  // backdrop still resolves correctly under the new rules.
  const backdropTagStart = findBackdropTagStart(stripped, destructureMatch.index, contentTagStart);
  if (backdropTagStart === null) {
    problems.push(
      "could not resolve a backdrop element enclosing the content element - no wrapping ancestor or preceding sibling was found, so this check refuses to pass without checking one",
    );
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
