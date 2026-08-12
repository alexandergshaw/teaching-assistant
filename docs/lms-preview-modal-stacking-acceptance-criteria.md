# The LMS bulk-action preview modal is hidden behind the app headers

Reported by the instructor: "the modal generated from a bulk action on the lms
view is hidden behind the headers."

## The defect, and why it happens

The "Generate" bulk action on the LMS (Content) tab opens a preview modal for
the generated version. That modal is rendered by
`GenerateFromSelectionSection.tsx` (its `preview &&` branch), which renders
inside the bulk bar - and the bulk bar lives inside
`ModulesView.tsx`'s `<div className={styles.ccStickyHeader}>`.

`page.module.css`'s `.ccStickyHeader` is
`position: sticky; z-index: 30; backdrop-filter: blur(10px)`. That is two
separate traps, both of which the modal is currently in:

1. **Stacking-context trap.** `position: sticky` with a `z-index`, and
   `backdrop-filter` independently, each make the header a stacking context.
   Everything inside it is therefore capped at the header's own `z-index: 30`,
   no matter what a descendant declares. The app chrome above it is the Tabs
   strip (`page.tsx`, `zIndex: 40`), the in-session banner
   (`InSessionBanner.module.css`, `z-index: 45`) and the top bar
   (`TopBar.module.css`, `z-index: 50`). `.previewBackdrop`'s `z-index: 10000`
   is compared only against the header's siblings *inside* the header, so the
   modal paints behind all three headers. This is the reported symptom.
2. **Containing-block trap.** `backdrop-filter` also makes the header the
   containing block for `position: fixed` descendants. `.previewBackdrop` is
   `position: fixed; inset: 0`, so it sizes to the header's box rather than the
   viewport - a header-sized dark scrim. `.previewModal` inside it keeps its
   own `height: min(90vh, 860px)`, so what the instructor sees is a
   viewport-height panel positioned off the header's box, under the chrome.
   When the instructor has dragged the header's resize handle,
   `ModulesView.tsx:348` additionally puts `maxHeight` + `overflowY: auto` on
   `.ccHeaderBody`.

Every other modal in this view (`SchedulerModal`, `BulkUploadModal`,
`BulkCreateModulesModal`, `RenameModulesModal`, `BulkQuestionsModal` at two
sites, `GradableEditorModal`, `FilePreviewModal`, `OfficeEditorModal`,
`RubricBuilderModal`, `AssignmentPreviewModal`) is rendered at the root of
`ModulesView`'s `.form`, outside the header, and is unaffected - ten components
across eleven render sites. The generated-content preview is the only one
nested in the header, and an independent sweep of the whole Content tab
(Modules, Files and Pages views, the header bar and both bulk sections)
confirmed it is the only trapped overlay: every other bulk control in the
header only flips a `useState` boolean owned by `ModulesView` or `ContentTab`
and lets the modal render at the root. That is the idiom this fix restores.

## Acceptance criteria

**AC1 - the preview modal is not rendered inside the sticky header.** It is
rendered by `ModulesView` as a sibling of the other root-level modals listed
above, outside `<div className={styles.ccStickyHeader}>`. No component that
renders inside that header renders a full-viewport overlay
(`.previewBackdrop`) at all.

**AC2 - it covers the viewport and paints above the chrome.** With the preview
open, the backdrop covers the whole viewport and the modal sits above the top
bar, the in-session banner and the Tabs strip. No CSS change is needed for
this: `.previewBackdrop`'s existing `z-index: 10000` wins once the element is
no longer trapped in a capped stacking context, which is exactly why every
other modal in this file already works.

**AC3 - nothing the modal can do is lost in the move.** Seven capabilities must
survive as props the modal declares AND the render site binds: the preview
state, closing, choosing a stored version, the "Ask for changes" instructions,
running a refine, downloading the version on screen, and posting to Canvas. The
guard is a named capability inventory, not a count and not "every declared prop
is bound" - an audit of the first draft of this AC deleted refine from the
interface and the render site simultaneously and the count-based check stayed
green. A capability that disappears from both sides at once is the specific
failure mode this AC exists to prevent.

**AC4 - the Generate controls do not move.** The "Generate" label, the deck
template select, one button per kind and the hint stay exactly where they are
in the bulk bar inside the sticky header, unchanged. This fix is about where
the modal renders, not about the controls that open it.

**AC5 - an open preview survives a selection change, and a closed one stays
closed.** The bulk bar is gated on a non-empty selection
(`ModulesView.tsx:384`), so today clearing the selection while the preview is
open unmounts the modal with it - contradicting
`GenerateFromSelectionSection`'s own comment ("A modal already open stays open
even if the selection changes out from under it"), which together with its
`kinds.length === 0 && !preview` guard is dead code the outer gate never lets
run. The defect is worse than a vanishing modal: `preview` lives in
`useLmsGeneration`, which `ModulesView` owns, so it stays non-null after the
bulk bar unmounts. Generate, then Clear (or run any of `bulkShiftModules`,
`bulkMoveToModule`, `bulkRemoveFromModule`, `bulkDeleteContent`, all of which
clear the selection per REGRESSION entry 260 check 6) and the modal vanishes
mid-review - then selecting any unrelated item later re-mounts the section and
the stale modal springs back open unbidden. Once the modal renders at the root
it is gated only on `preview`, which ends both halves. The Close button and the
backdrop click still close it.

**AC6 - no new CSS, no new dependency, no portal.** The existing
`previewBackdrop` / `previewModal` / `previewHeader` / `previewMeta` /
`previewCloseButton` / `previewContent` classes move with the JSX verbatim.
`createPortal` is deliberately NOT introduced: this repo has zero portals and a
proven convention of rendering modals at the view root, which solves the same
problem with an idiom already in use here.

**AC7 - behaviour is otherwise unchanged.** Generate, refine, version select,
download and post all behave exactly as before; the existing suite stays green;
`tsc` and `lint` stay clean; every touched file stays under 1000 lines.

**AC8 - the stale stacking comment is corrected.** `.previewBackdrop`'s comment
in `page.module.css` claims "top bar is z-index 9999"; the top bar is 50. The
9999 is real but belongs to `AiChatFab.tsx`'s floating button - which is the
element `z-index: 10000` actually has to beat, so the correction must KEEP that
justification while naming the real chrome stack (top bar 50, in-session banner
45, Tabs strip 40, `.ccStickyHeader` 30) and the constraint this defect came
from: the value only holds if the element is not nested inside a stacking
context.

## Reuse survey (verified, not pattern-matched)

- **Root-modal render convention** - `ModulesView.tsx:659-785` renders eight
  modals as `{state && <XModal ... />}` siblings at the root of `.form`. Read in
  full; the new render site copies that shape exactly.
- **The CSS classes** - `page.module.css:3297` `.previewBackdrop` (fixed, inset
  0, z-index 10000) and `.previewModal` (which also resets
  `--focus-ring-color`, per REGRESSION entry 257 check 4). Reused verbatim by
  moving the JSX that references them; no new class.
- **The helpers the modal calls** - `previewMetaText`, `versionOptionLabel`,
  `NEW_MODULE_TARGET_VALUE`, `resolvePostModuleTarget` (all exported from
  `./useLmsGeneration`) and `artifactDownloadFormatLabel` from
  `@/lib/lms-generation/artifact-download`. They move with the JSX unchanged;
  `useLmsGeneration.test.ts` already covers them.
- **The wiring-test idiom** - `bulkCreateModules.wiring.test.ts` and
  `repoGrades.wiring.test.ts` read components as TEXT with canary fixtures,
  because vitest here is node-env and collects only `src/**/*.test.ts`, so no
  `.tsx` is ever rendered. The guard test for AC1/AC3 follows that idiom,
  canaries included.

## Implementation plan

1. **New file** `src/app/components/content-tab/modules/GeneratedPreviewModal.tsx`
   holding the `preview &&` branch currently at
   `GenerateFromSelectionSection.tsx:262-428`, verbatim apart from taking
   `preview` as a required (non-null) prop, since the render site gates on it.
   The header comments that describe the modal (preview/refine, the download
   control, the posting footer) move with it; the comments about the kind
   buttons and the deck template picker stay behind.
2. **`GenerateFromSelectionSection.tsx`** keeps only the controls, drops the
   preview-related props from its interface, and its guard becomes
   `if (kinds.length === 0) return null;`.
3. **`ModulesView.tsx`** stops passing the preview props to the section and
   adds `{lmsGeneration.preview && <GeneratedPreviewModal ... />}` alongside the
   other root modals.

## Limits

The suite cannot render a component (node env, `src/**/*.test.ts` only), so
AC2's painting order is not machine-verifiable here: it is established by the
CSS reasoning above, plus an independently verified check that no ancestor of
`.form` (`.card`, `.tabContainer`, `.page`) sets transform, filter,
backdrop-filter, will-change, contain, isolation, perspective or a positioned
z-index - `.tabContainer`'s `overflow: clip` does not clip a fixed descendant
whose containing-block chain bypasses it - plus the fact that ten other modals
in this same file already render correctly from that exact position. AC5's
"survives a selection change" is likewise not directly executable, but follows
from the modal no longer living inside the selection-gated subtree, which
AC1's check does pin.

Out of scope, recorded rather than fixed: this modal has no focus trap, no
Escape-to-close and no focus restoration, and its backdrop click-to-close is
mouse-only (a pre-existing gap across roughly twenty modals in this app - see
REGRESSION's own note). The move changes none of that.
