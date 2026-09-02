# Knowledge -> Recording context handoff: acceptance criteria

Owner request (2026-09-01):

> when i select the recording options and go back to the recording tab after
> having selected some knowledge pages, there should be some indication on the
> recording pages of what knowledge pages i selected (in addition to the option
> to select more or less from the recording page or navigate directly back to
> where i left off on the knowledge page)

Three distinct asks: **show** what is carried, **adjust** it from the recording
side, **return** to where the selection was made.

## 1. What is already true - verified in source, not assumed

- **Grading already satisfies ask 1.** `GradingRecordingPanel.tsx:247-259` takes
  the knowledge context in its **live launch listener, at arrival**, holds it in
  panel state (`:214`), and renders it at `:548-549` **before any capture**,
  guarded by `if (detail.knowledgeContext)` so it never steals a context meant
  for another flow. **This is the reference implementation. Match it.**
- **Discussions does not.** It takes the context inside `start()`
  (`useDiscussionReplies.ts:488`), so its notice only appears after drafting
  begins. Chunk 1 (in flight) moves that take to a live listener.
- **The slot carries no page identity at all.** `RecordingKnowledgeContext` is
  `{ text: string; label?: string }` (`recording-launch.ts:78-81`). Neither ids
  nor titles cross the boundary today. Chunk 1 adds an optional
  `pages?: { id: string; title: string }[]` but **does not populate it**.
- **The launch sites are `startRecordingWithSelection` (`KnowledgeTab.tsx:355-383`)
  and `startGradingWithSelection` (`:398-425`).** `askAiAboutSelection` (`:331-334`)
  is the chat path and is NOT a recording launch.
- **Titles are already in hand at launch time**, so populating `pages` costs
  **zero extra fetches and zero round trips**.
- **The one-shot take survives.** `resolveStartKnowledgeContext(current, taken)
  => taken ?? current` (`discussion-knowledge-context.ts:40-42`) already keeps
  context across a Stop/Start. The drain only ever protected the slot.

## 2. AC1 - the panel may never name a page the model did not read

**This is the criterion most likely to be got wrong, so it is stated first.**

`buildKnowledgeContextBlock` (`src/lib/chat/knowledge-context.ts:158-214`)
returns `includedPages`/`omittedPages` as **counts only** (`:49-50`, `:213`).
Listing titles from the launch payload while the budget silently dropped some
of them would print page names the model never saw - **a worse lie than showing
no names at all**, because it invites the instructor to trust grounding that
does not exist.

Two facts make naive fixes wrong:

- **Inclusion is NOT a prefix.** The budget loop at `:194-201` uses `continue`,
  **not `break`**. A large page is skipped while a later, smaller page is still
  included. "The first N pages made it" is false, and any UI deriving identity
  from `includedPages` as a count will name the wrong pages.
- **`KnowledgeContextPage` is `{ title, body }` with no id** (`:18-21`).
  Identity cannot be recovered after the fact.

**Required:** extend the result with per-page identity captured **inside** the
loop, in input order - for example `pageResults: { title: string; included: boolean }[]`.
Never reconstruct it from `includedPages`/`omittedPages`.

**Required test:** a case where a page in the MIDDLE is omitted while a LATER
page is included. A test using only a trailing overflow passes against a
prefix-assuming implementation and proves nothing. Sabotage it by switching
`continue` to `break` and confirm it goes red.

Preserve: the reserve-worst-case-note-first behaviour (`:183-187`), the
page/attachment boundary rule (`:196`, never mid-sentence), the defensive
final clamp (`:208-211`), and the `""` empty-input contract (`:168-170`).

## 3. AC2 - show it, before the run

Both destinations - `DiscussionRepliesPanel` and `GradingRecordingPanel` - show
what the run is carrying **before** capture starts. Exactly two destinations
exist; the FAB never carries context, and a plain visit is not a selection.

- Use `label` and, when present, `pages`.
- A page the budget omitted is either shown as omitted or not shown at all -
  never shown as if it were included (AC1).
- **Carrying nothing renders nothing.** Never an empty "Knowledge Base context:"
  with no value.
- Match grading's existing wording and placement. Introduce no new visual
  vocabulary; reuse the surrounding component idiom. No emoji.

## 4. AC3 - adjust from the recording side

A picker on the recording side to select more or fewer pages.

- **New file.** `DiscussionRepliesPanel.tsx` is 973 lines against a hard 1000
  ceiling enforced over `recording/` - the picker cannot live inside it.
- Adjusting the selection re-derives the carried context. It must not require
  returning to the Knowledge tab.
- Whatever is displayed after an edit must still satisfy AC1.

## 5. AC4 - return to where the selection was made

- No knowledge-navigation event exists. A new tiny event module modelled on
  `open-chat.ts` is needed.
- Restorable: tab, open page, expansion state, selection. **Scroll position is
  not restorable** and must not be claimed.

## 6. Constraints

- No emojis (`src/lib/no-emojis.test.ts`). No new dependency.
- Every new persisted control needs a `ta-`-prefixed key added to its ordinal
  canary **in the same commit**. `recording-split.structure.test.ts` asserts
  "exactly fifteen `ta-rec-disc-*` keys".
- 1000-line hard ceiling; 950 soft cap.
- vitest is node-env and collects only `src/**/*.test.ts` - **no component is
  ever rendered**. A green suite proves nothing about markup, layout, or
  keyboard behaviour. All UI findings come from reading.
- Beware `.claude\worktrees\` - Glob returns that stale copy FIRST. Absolute
  paths under `src\` only; prove edits with `git status --short`.

## 7. Corrections to earlier statements in this workstream

Recorded so they are not re-derived:

- The claim that the handoff needed a fetch to turn ids into titles was wrong
  twice over: titles are available at launch, and ids are not carried anyway.
- The claim that a one-shot drain prevents context surviving a Stop/Start was
  wrong; `resolveStartKnowledgeContext` already keeps it deliberately.
- `discussion-knowledge-context.test.ts:141-169` was written to forbid a
  mount-only read but over-specified into forbidding the live-listener shape
  grading already uses - the repo's recorded "source-text tests over-specify"
  failure mode. Chunk 1 replaces those guards to pin the fact, not the spelling.
