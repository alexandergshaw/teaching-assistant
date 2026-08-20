# Editing a generated version in the preview modal (chunk 3e)

The instructor's request, in their own words: give me a way to
prompt/regenerate/edit the script once it shows up in the modal.

Two of those three already exist and work for scripts today. The "Ask for
changes" field plus its Regenerate button is the prompt/regenerate half
(`GeneratedPreviewModal.tsx:269-294`), and scripts inherit it through the
generic text refine path. THE MISSING ONE IS EDIT: the modal renders the
version's text in a non-interactive `<pre>`, so the instructor cannot fix a
name, cut a paragraph, or reword a sentence without asking a model to do it.

This chunk makes that text editable and saves an edit as a NEW VERSION, the
same way every other write in this feature does.

## Reuse survey (vetted - every symbol read before this doc was written)

**The headline: the persistence layer already accepts caller-supplied text. No
new storage code is needed, only an action to call it and an editor to feed
it.**

| Target | What already exists | Path |
| --- | --- | --- |
| Saving caller-supplied text as a new version | `saveGeneratedArtifactVersion(supabase, userId, {courseId, kind, title?, text, structured?, prompt})` - a plain input bag with NO reference to any generator; it does not know or care whether the text came from a model | `src/lib/supabase/generated-artifacts.ts:158`, input type `:67-74` |
| New-version semantics | Every write is an INSERT; the only `.update()` clears `is_current` on the prior row. There is no update-in-place and no delete anywhere in the module | `generated-artifacts.ts:158-192` |
| Edit-in-modal UI | `DocumentPreviewModal` - `draft`/`editing`/`busy` state, an Edit/Preview toggle, a `TextField multiline` swapped in for the `<pre>`, Save disabled on `!dirty`, and a Revert shown only when dirty. Same `ModalShell`, same CSS classes | `src/app/components/DocumentPreviewModal.tsx:52-59`, `:127-177` |
| Unsaved-changes guard | `CommentEditModal.handleClose` - `if (saving) return; if (isDirty && !discardConfirm) { setDiscardConfirm(true); return; } ...` wired as `onDismiss` AND as every explicit close, with an in-modal "Discard changes?" panel rather than `window.confirm` | `src/app/components/drafted-grades/CommentEditModal.tsx:72-80`, panel `:168-190` |
| The dismissal extension point | `ModalShell`'s `onDismiss` is documented as "called for every dismissal request (Escape, or a backdrop click)... NEVER the modal's actual close handler: the caller's own policy - a dirty-check confirmation - runs first" | `src/app/components/ui/ModalShell.tsx:44-48`, backdrop `:89`, Escape `:86` |
| Post-write preview sync | `refine`'s tail: re-fetch via `loadVersionsForPreview`, then `setPreview({kindId, kindLabel, versions, selectedVersion: artifact.version, notes: []})` | `src/app/components/content-tab/modules/useLmsGeneration.ts:938-949` |

**Deliberately NOT reused:**

- `refineGeneratedArtifactAction`. It hard-rejects an empty `instructions`
  (`lms-generation.ts:832`), its whole body is an LLM round-trip a manual save
  must not make, and its `decks`/`knowledgeChecks` branches hijack on `kind`
  and would ignore the edited text entirely. A manual edit gets its own action.
- `updatePresentationDraftPayloadAction` (`media.ts:71`). It updates in place
  rather than versioning, and no component calls it - it is not a live
  precedent for anything.
- `DocumentPreviewModal`'s dismissal behaviour. Its `onDismiss={onClose}` is
  UNGUARDED (`:109`), so Escape or a backdrop click silently discards the
  draft. Its editor is the model to copy; its dismissal is the bug to avoid.

## Findings that shape the design

1. **THE EDIT BASELINE MOVES UNDER THE MODAL.** `currentText` is derived every
   render from `preview.versions.find(v => v.version === preview.selectedVersion)`
   (`GeneratedPreviewModal.tsx:182`). It changes when the version picker
   switches version (`selectVersion`, `useLmsGeneration.ts:896-898`) and again
   when `refine` REPLACES the whole `preview` object (`:938-949`). A naive
   `useState(currentText)` initializer goes stale on both. `DocumentPreviewModal`
   gets away with `draft !== text` only because its source text never changes
   under it; this modal's does.

2. **THE MODAL HAS NO LOCAL STATE AT ALL TODAY.** It is a pure prop-driven
   function component - no `useState`, no `useEffect`, and it does not even
   import `useState` (`:90` imports only `type RefObject`). Editing introduces
   the first local state it has ever had, which is what makes the dirty-guard
   question new rather than inherited.

3. **AN UNGUARDED EDITOR IN THIS MODAL WOULD DESTROY WORK ON A STRAY CLICK.**
   `onDismiss={onClosePreview}` (`:195`) resolves to `closePreview`, which is
   an unconditional `setPreview(null)`. A backdrop click is a dismissal. The
   repo has already reasoned about exactly this: `CommentEditModal`'s comment
   records that `disabled` on a button "can stop a button, but nothing about it
   reaches Escape or a backdrop click", citing decision 6 of
   docs/modal-dismissal-focus-acceptance-criteria.md.

4. **TWO KINDS CARRY AN AUTHORITATIVE `structured` PAYLOAD THAT HAND-EDITED
   TEXT CANNOT UPDATE.** `decks` and `knowledgeChecks` are the only kinds with
   a `renderStructured` (`kinds.ts`). For them the saved `text` is a LOSSY
   projection - a deck's `.pptx` download reads `structured` and a knowledge
   check's Canvas post reads `structured`, neither reads `text`. Saving edited
   text while carrying the old `structured` forward produces a version whose
   two halves disagree, where the download and the post silently ignore the
   instructor's edit. That is the precise bug the `knowledgeChecks` refine
   branch exists to prevent (`lms-generation.ts:889-897`).

5. **THE TITLE IS LOST UNLESS CARRIED, AND THE LIST THAT DECIDES IT IS NOT
   TYPE-CHECKED.** `TITLED_GENERIC_KINDS` (now including `"scripts"`) is a
   hand-maintained array; a save path that forgets `title` degrades to
   `config.label` at post time (`:639`). A manual save must reproduce the
   carry-forward, and must be tested by asserting a saved title, not by
   asserting the constant's contents.

6. **THE WIRING TEST WILL DEMAND MORE THAN IT LOOKS.** Every prop declared in
   `GeneratedPreviewModalProps` must be bound BY NAME at `ModulesView.tsx`'s
   render site, optional or not, and `PENDING_BINDING` is empty and policed in
   both directions (`generatedPreviewModal.wiring.test.ts:428-459`). The
   `CAPABILITIES` list (`:58-66`) is a deletion guard: a capability with no
   entry can be removed without any test failing.

## Acceptance criteria

### Scope

**E1. EDITING IS OFFERED ONLY FOR KINDS WHOSE TEXT IS THE WHOLE ARTIFACT.**
That is every kind with no `renderStructured`: qa, currentEvents, objectives,
assignments, announcements and scripts - six of the eight, including the
lecture script this was asked for. For `decks` and `knowledgeChecks` the edit
control is ABSENT, with a short on-screen reason, because their `structured`
payload is what the download and the Canvas post actually read (finding 4).
The gate is derived from the registry (`renderStructured === undefined`), NEVER
a hardcoded id list, so a future structured kind is excluded automatically.

**E2. AN EDIT IS A NEW VERSION, NEVER AN OVERWRITE.** It goes through
`saveGeneratedArtifactVersion` like every other write, so the pre-edit text
remains selectable in the version picker. There is no update-in-place path and
this chunk does not add one.

### Server

**E3. A DEDICATED ACTION, NOT A REFINE WITH AN EMPTY PROMPT.**
`saveEditedGeneratedArtifactAction({courseUrl, courseId?, kind, text, currentTitle?})`
reuses the existing `requireOwner` -> course-resolution -> `artifactKind` ->
`saveGeneratedArtifactVersion` tail and makes NO model call. Reusing
`refineGeneratedArtifactAction` is refused: it rejects empty instructions
outright and its body is an LLM round-trip.

**E4. IT REFUSES A STRUCTURED KIND SERVER-SIDE TOO.** E1's gate is a UI
affordance; the action independently refuses any kind whose config has a
`renderStructured`, so a caller bypassing the UI cannot write a
text/structured-divergent version. Same shape as
`postGeneratedArtifactAction`'s own `commitMode` refusal.

**E5. IT REFUSES AN EMPTY EDIT.** Whitespace-only text returns an error and
saves nothing, rather than creating a blank version that the preview would then
render as "This version has no text."

**E6. THE TITLE IS CARRIED FORWARD.** Using the same `TITLED_GENERIC_KINDS`
rule the refine path uses, so an edited lecture script keeps
`<moduleLabel> Lecture Script`. Asserted by inspecting the SAVED title.

**E7. THE SAVED `prompt` SAYS A HUMAN WROTE IT.** The column is NOT NULL and
exists to answer "what produced this version". A manual edit records that it
was an instructor edit rather than copying the previous version's model prompt,
which would misattribute hand-written text to the model.

### Client

**E8. THE EDITOR REPLACES THE `<pre>`, IT DOES NOT ADD A SECOND SURFACE.** An
Edit/Preview toggle swaps the existing `<pre>` for a multiline field bound to
the draft, following `DocumentPreviewModal.tsx:162-177`. Both branches render
the DRAFT, so toggling back to preview does not appear to discard an unsaved
edit.

**E9. THE DRAFT RESEEDS WHEN THE UNDERLYING VERSION CHANGES.** Switching
version in the picker, or a refine replacing the preview, must reseed the draft
and clear the dirty state (finding 1). A stale draft silently overwriting a
different version with the previous one's text is the worst failure available
here, and it is the one a naive initializer produces.

**E10. A DIRTY EDITOR CANNOT BE DISMISSED BY ACCIDENT.** Escape and a backdrop
click both route through a local handler following `CommentEditModal`'s shape:
ignore while saving, arm an in-modal "Discard changes?" panel on the first
dismissal while dirty, and only close on explicit confirmation. No
`window.confirm`. The panel offers "Keep editing" and "Discard", and typing
resets the armed state.

**E11. SAVE IS DISABLED UNLESS THERE IS SOMETHING TO SAVE.** Disabled when not
dirty, when the draft is empty, and while any generation, refine, download,
post or save is in flight - reusing the existing `busy`/`downloading` gates
rather than inventing a parallel one. Its label doubles as its progress word,
matching every other button on this modal.

**E12. AFTER A SAVE THE MODAL SHOWS THE NEW VERSION.** The handler copies
`refine`'s own tail exactly: re-fetch through `loadVersionsForPreview`, then
`setPreview` with the new version selected, and report through the existing
`setNote` channel. The instructor sees their edit as the current version
without reopening anything.

**E13. A FAILED SAVE KEEPS THE DRAFT.** The error is reported through `setNote`
and the editor stays open with the text intact. Losing an instructor's typing
to a network error is not acceptable; entry 267 check 7 set this precedent for
downloads.

### Cross-cutting

**X1. THE WIRING TEST GAINS AN EIGHTH CAPABILITY.** An `/edit/i` entry is added
to `CAPABILITIES`, so the edit capability cannot later be deleted without a
test failing. Every new prop is bound BY NAME in `ModulesView.tsx`, with no
spread and no `PENDING_BINDING` entry.

**X2. THE MODAL STAYS UNDER THE LINE-COUNT CEILING.** `GeneratedPreviewModal.tsx`
is 366 lines and `useLmsGeneration.ts` is 1115 - the latter already over. If
this chunk pushes either past 1000, the discard panel and/or the editor block
is extracted to its own component file rather than left over.

**X3. NO EXISTING BEHAVIOUR CHANGES.** Refine, the version picker, downloads,
posting and the eight kinds' generation paths are untouched. For `decks` and
`knowledgeChecks` the modal looks exactly as it does today.

## Limits (state, do not paper over)

- vitest here is node-env and collects only `src/**/*.test.ts`, so the modal is
  never rendered. The Edit/Preview toggle, the textarea, the discard panel, the
  Escape and backdrop paths and the disabled states are verified by READING and
  by source-text wiring tests. A green suite does not prove the guard fires in
  a browser, and this chunk's central safety property is exactly that guard.
- The dirty-guard behaviour is copied from a precedent that is itself only
  verified by reading (`CommentEditModal` has no rendered test either).
- Nothing here has been exercised against a live Supabase or in the running
  product.
