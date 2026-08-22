# Ask AI about the selected modules and items

One click, from the Modules view's existing bulk bar, opens the app-wide AI
Chatbot already carrying the current module/item selection as context.

## What already exists (reuse survey - vetted, do not rebuild)

| Need | Existing code | Where |
| --- | --- | --- |
| Bulk selection of modules AND items on the Modules screen | `useModuleSelection` - `selected` (item keys), `selectedModules` (module keys), `selectedMaterialItems()`, `clearSelection`, select-all / select-by-kind | `src/app/components/content-tab/modules/useModuleSelection.ts` |
| The bulk bar shell the new row lives in | `styles.bulkBar` / `.bulkBarHead` / `.bulkRow` / `.bulkLabel` / `.bulkHint` | `src/app/page.module.css`, rendered in `src/app/components/content-tab/ModulesView.tsx:532-568` |
| A bulk-bar row that is a READ, not a Canvas write (visual + a11y template) | `DownloadSelectionSection` + `useSelectionDownload` | `src/app/components/content-tab/modules/DownloadSelectionSection.tsx`, `useSelectionDownload.ts` |
| Turning a whole-module selection into concrete items | `expandModuleSelection` (live half server-side from a fresh tree, export half client-side) | `src/lib/lms-generation/materials.ts:457-490` |
| Fetching + assembling the selected items' actual text | `gatherSelectionMaterials(items, {canvasUrl, institution, fetchers})` -> `{materialsText, notes}`, capped by `MATERIALS_CAP` (20000) and `DESCRIPTION_FETCH_LIMIT` (6) | `src/lib/lms-generation/materials.ts:318` |
| The live-Canvas fetchers to inject | `LIVE_FETCHERS` literal (`getPageAction`, `previewFileAction`, `fetchCanvasMetaAction`) | `src/app/api/lms-generation/deck/route.ts:63-67` (copy the literal; a `"use server"` module cannot export it) |
| Resolving the course row for live vs export selections | `resolveLmsCourseRowAction(courseUrl)` / `resolveLmsCourseRowByIdAction(courseId)` | `src/app/actions/lms-syllabus-buttons.ts`, branched exactly as the deck route does |
| Opening the app-wide chat with context, one click, no dialog | `openChat(detail)` / `parseOpenChatDetail` / `OPEN_AI_CHAT_EVENT` | `src/lib/chat/open-chat.ts`, dispatched today by `KnowledgeTab.tsx:266-273` |
| Holding session-scoped context and re-sending it every turn | `knowledgeContext` state + `contextPageIds` body field + `handleChatClose` reset | `src/app/components/AiChatFab.tsx:117-129, 233-254, 321-377` |
| Injecting a context block into the model call | the "own synthetic exchange + `CONTEXT_ACK_TEXT`" unshift idiom | `src/app/api/ai-chat/route.ts:507-560` |
| Showing the user what is loaded | `AiChatWindow`'s `knowledgeContextSummary` prop | `src/app/components/AiChatFab.tsx:397-408` |
| Selection labels / counts | `selectionSummaryLabel`, `buildSelectedMaterialItems` | `src/app/components/content-tab/modules/lmsGenerationNotes.ts` / `lmsGenerationSelection.ts` (grep for the exact export before writing a new one) |

Nothing in the list above is re-implemented. `AiChatWindow.tsx` is NOT
touched: the existing `knowledgeContextSummary` string prop already carries
whatever the FAB wants to say about loaded context.

## Decisions

**D1. The selection is gathered ONCE, at click time, and the resulting TEXT is
held for the chat session.** The Knowledge path sends page *ids* and
re-derives its block from the database on every turn; that is cheap. Gathering
a module selection is Canvas network I/O (page bodies, file previews,
assignment descriptions), so re-running it per turn would add seconds to every
follow-up question. The text is the instructor's own course content, fetched
under their own credentials by an owner-scoped server action - the server
never treats the returned string as an access key, it only renders it into the
prompt, exactly as it already does for a pasted message or an attachment.

**D2. One click, no intermediate dialog.** Same rule the Knowledge tab's "Ask
AI" already follows: the bulk bar is the selection UI, so there is nothing
left to configure.

**D3. This row is a READ, never a write.** Nothing is created or changed in
Canvas, Supabase, or the course tile. `gateOperation` is therefore NOT called
(see `DownloadSelectionSection.tsx`'s header for the full argument - its
"blocked" reasons are all worded for writes, and would wrongly hide this row
for every export-sourced selection).

**D4. No modal, dialog, popover or fixed-position overlay may be rendered from
this row.** It lives inside `ModulesView`'s `styles.ccStickyHeader`, which is a
stacking context and the containing block for `position: fixed` descendants -
`generatedPreviewModal.wiring.test.ts` fails any component the header renders
that contains `styles.previewBackdrop`.

**D5. No persisted control state.** The row is a single button - no textbox,
select or checkbox - so this repo's "every new control persists under a `ta-`
key" rule has nothing to apply to.

## Fixed contracts (three file sets are built concurrently against these)

### Contract 1 - the pure leaf: `src/lib/chat/selection-context.ts` (NEW, owned by set A)

No React, no `@/app/actions`, no DOM, no Supabase - a leaf that sets B and C
may import for the shared constants.

```ts
export const SELECTION_CHAT_MAX_ITEMS = 150;
export const SELECTION_CONTEXT_MAX_CHARS = 24000;

export interface SelectionContextBlock {
  /** "" when there was nothing usable to render. */
  text: string;
  truncated: boolean;
  includedChars: number;
}

/** Renders the gathered materials into ONE flat reference-context string,
 *  bounded by SELECTION_CONTEXT_MAX_CHARS. Blank/whitespace input returns
 *  {text: "", truncated: false, includedChars: 0}. Never throws. */
export function buildSelectionContextBlock(input: { materialsText: string; label?: string }): SelectionContextBlock;

/** "12 items from 2 modules" / "1 item" / "2 modules" - the human label the
 *  chat's context strip and the bulk bar's note both read. */
export function selectionContextLabel(itemCount: number, moduleCount: number): string;

/** The refusal text when a selection is larger than SELECTION_CHAT_MAX_ITEMS. */
export function tooManyItemsForChatNote(count: number, max: number): string;
```

### Contract 2 - the event payload: `src/lib/chat/open-chat.ts` (owned by set A)

```ts
export interface OpenChatSelectionContext {
  /** Already-gathered material text. Never empty when present. */
  text: string;
  label?: string;
}

export interface OpenChatDetail {
  knowledgePageIds?: string[];
  label?: string;
  selectionContext?: OpenChatSelectionContext;   // NEW
}
```

### Contract 3 - the server action: `src/app/actions/selection-chat-context.ts` (NEW, owned by set B)

```ts
"use server";

export interface SelectionChatContextInput {
  courseUrl: string;
  /** An export selection's course_hub row id. */
  courseId?: string;
  acronym?: string;
  /** Already-normalized, already-export-expanded selection items. */
  items: SelectedMaterialItem[];
  /** LIVE module ids only - expanded server-side from a fresh tree. */
  moduleIds?: number[];
}

export interface SelectionChatContextSuccess {
  materialsText: string;
  notes: string[];
  /** Items actually gathered, after server-side module expansion. */
  itemCount: number;
}

export async function buildSelectionChatContextAction(
  input: SelectionChatContextInput
): Promise<SelectionChatContextSuccess | { error: string }>;
```

### Contract 4 - the chat request body: `src/app/api/ai-chat/route.ts` (owned by set A)

```ts
interface RequestBody {
  // ...existing fields unchanged...
  /** Pre-gathered module/item selection text (D1). Optional and purely
   *  additive: absent leaves every existing behaviour unchanged. */
  selectionContextText?: string;
}
```

Response gains an optional `selectionContext: { includedChars: number; truncated: boolean } | null`.

## Acceptance criteria

### A. The bulk bar (file set C)

**A1.** When the Modules bulk bar is visible (any item or module selected), a
new row labelled `Ask AI` renders one button that opens the AI Chatbot with
the selection loaded. It appears directly after the `Download` row and before
the module/item action sections.

**A2.** Activating it gathers the selection and then dispatches `openChat`
with a `selectionContext`. One gather at a time: a second activation while one
is in flight is a no-op (mirror `useSelectionDownload`'s own `busy` guard; do
NOT fold into `opBusy`). The button label reflects the in-flight state.

**A3.** Whole-module selections count. Live module keys go to the server as
`moduleIds` and are expanded there against a FRESH module tree; export module
keys are expanded client-side first (`expandModuleSelection(materialItems,
moduleKeys, [], exportModules)`), exactly as `useLmsGeneration.generate` does -
there is no server-side fetch path for a course export.

**A4.** Pre-flight cap: if the expanded selection exceeds
`SELECTION_CHAT_MAX_ITEMS`, no request is made and `tooManyItemsForChatNote`
is surfaced through the view's existing `setNote` error channel. The server
re-enforces the same cap independently (B4), so this can only ever save a
round trip.

**A5.** Failure never opens a half-loaded chat. A server error, or a success
whose `materialsText` is blank, surfaces an error note and does NOT dispatch
`openChat`. The selection is left untouched either way, so the instructor can
retry or narrow it.

**A6.** Success surfaces a note naming what was loaded (the
`selectionContextLabel` count) and stating that nothing was written to Canvas.
Any `notes` the gather returned (skipped items, truncation) are surfaced too -
never silently dropped.

**A7.** The row obeys D3, D4, D5. Any "cannot do this right now" state is an
`aria-disabled` + `aria-describedby` visible reason string (not a native
`disabled`, which removes the control from the tab order and makes the reason
undiscoverable), and activation always calls the handler - the decision to
proceed or explain lives in the hook, never in the button.

### B. Gathering (file set B)

**B1.** `buildSelectionChatContextAction` is owner-scoped (`requireOwner`) and
resolves the course row by id when `courseId` is present, else by
`courseUrl` - the same branch the deck route takes.

**B2.** Whole-module (live) expansion uses a FRESH `listCourseContentAction`
read, never a client-supplied tree, and is skipped entirely when `moduleIds`
is empty so the common items-only path costs no extra Canvas call.

**B3.** Materials come from `gatherSelectionMaterials` with the `LIVE_FETCHERS`
wiring - no new fetch path, no new truncation policy, no second copy of the
"(N points, due Mon DD)" formatting.

**B4.** Refusals are explicit, never silent: empty selection, a selection over
`SELECTION_CHAT_MAX_ITEMS`, an unresolvable course, and a gather that produced
no usable text each return a specific `{ error }` string. A course-not-linked
error keeps its existing recognisable wording.

**B5.** The action returns text only - it never writes to Canvas, Supabase, the
course tile, or `generated_artifacts`.

### C. Carrying it into the chat (file set A)

**C1.** `parseOpenChatDetail` accepts a `selectionContext` whose `text` is a
non-empty string, and ignores it otherwise. It still NEVER throws: a missing,
malformed, non-object, or array `detail` degrades to `null`, and
`ContextMenu.tsx`'s zero-detail dispatch keeps working byte-for-byte.

**C2.** `AiChatFab` stores an incoming `selectionContext` for the lifetime of
the open chat window, sends it as `selectionContextText` with EVERY message in
that session, and clears it in `handleChatClose` - the same lifetime, and the
same reasons, as `knowledgeContext`.

**C3.** A dispatch carrying a selection context while a knowledge context is
already loaded replaces neither the other: the two are independent and may be
loaded at once. A generic no-detail dispatch clears neither.

**C4.** The chat window's context strip states what is loaded. When both
context kinds are present, both are named in the one
`knowledgeContextSummary` string (joined, in a fixed order) - `AiChatWindow`
itself is not modified.

**C5.** The route accepts `selectionContextText` defensively: a non-string, a
blank string, or an over-long string never throws - it is trimmed, capped at
`SELECTION_CONTEXT_MAX_CHARS`, and dropped entirely when nothing is left.

**C6.** The block is injected as its OWN synthetic exchange (its own user turn
plus its own `CONTEXT_ACK_TEXT` model turn) using the file's existing unshift
idiom - never merged into the entity-grounding or knowledge-context block, and
never concatenated into a real user message. Both may be present in one turn.

**C7.** The embedded provider never sees it, mirroring the knowledge path
exactly - it makes no model call, so context injection has nowhere to go.

**C8.** Everything on this route is purely additive: a request without
`selectionContextText` produces byte-for-byte the behaviour it produces today,
including the `knowledgeContext` response field.

## Out of scope

- Repo-sourced (paired GitHub folder) selections. `SelectedMaterialItem`'s
  repo arm exists but `selectedMaterialItems()` is deliberately not widened to
  it yet (see its own doc comment) - this feature inherits that boundary and
  must not widen it.
- The selection-highlight chat widget (`SelectionChatWidget.tsx`) - a
  different surface with its own server action; untouched.
- Persisting chat context across a window close, or across a reload.
