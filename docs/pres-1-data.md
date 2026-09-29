# PRES-1 - DATA / storage pass (round 1)

- Item: PRES-1, area `presentations-authoring`.
- Seat: `loop-seat` (Sonnet), DATA-ENGINEER pass. A fresh `loop-checker` gates
  this document before any consumer (architect, plan, implementer) reads it.
- Consumes: `docs/pres-1-acceptance-criteria.md` (all citations to it below are
  `file:line` against that file as it exists on disk right now). Owner
  decisions treated as fixed, not re-opened: R-1 (.pptx via the shipped
  `buildSlidesPptx`, on-page preview separate) and R-2 (new sibling tab,
  reuse infra, `ppt-design` untouched).
- Scope: data shapes, persistence, storage only. No mechanism (how the tab is
  wired), no wave order, no oracle construction, no production code. Where a
  question turns out to be a mechanism question, it is named and routed, not
  answered here.
- Every code citation below was opened this round; none is carried over from
  the AC document without re-checking it against the file (`docs/loop/seats.md`
  standing rule: brief from the tree, not the doc). Three places where the
  AC's own reuse notes do not survive that re-check are called out explicitly
  in section 5, because that is a "brief from the tree, not the doc" finding
  in its own right and burying it would repeat the error the rule exists to
  catch.

## 0. What was opened (the measuring, not the recalling)

- `src/app/components/ppt-design/hooks.ts` (full file, 242 lines - counted by
  the Read tool's own line numbering, not a separate line-count tool).
- `src/lib/decks/types.ts` (full file, 522 lines).
- `src/lib/pptx.ts` lines 1-90 plus a targeted grep for every
  `PptxSlide`/`BuildSlidesOptions`/`buildSlidesPptx` occurrence.
- `src/lib/decks/deck-source.ts` (full file, 87 lines) and
  `src/app/actions/deck-source.ts` lines 1-63.
- `src/lib/decks/generate.ts` lines 1-45 plus a grep for `GeneratedDeck` /
  `generateDeckFromTemplate`.
- `src/app/actions/media.ts` lines 560-683 (both `savePresentationFileAction`
  and its sibling `saveLibraryFileAction`).
- `src/app/components/ppt-design/index.tsx` lines 545-590 (the two real
  save paths: download and Save-to-Files) and lines 700-770 (what
  `GeneratePanel` is handed).
- `supabase/migrations/20261004000000_generated_artifacts.sql`,
  `supabase/migrations/20261026000000_accessibility_scans.sql`,
  `supabase/migrations/20260821000000_create_presentation_drafts.sql`.
- `src/lib/supabase/generated-artifacts.ts` (full file, 197 lines) and
  `src/lib/presentation-drafts.ts` (full file, 216 lines).
- `src/lib/lms-generation/deck.ts` (full file, 297 lines) and
  `src/app/actions-types.ts` lines 1-30 (`SlideData`).
- `src/lib/recording-files.ts` lines 1-80 (`saveRecordingFile`, its `source`
  field is a free-form optional string, not an enum).
- `.github/workflows/supabase-migrations.yml` lines 1-20 (trigger: push to
  `main` touching `supabase/migrations/**`, or manual dispatch).
- `src/app/components/manual/manual-rail.ts` lines 1-230 and
  `src/app/page.tsx` lines 580-610, to confirm `ppt-design` is mounted with no
  course/`courseId` prop (`<PowerPointDesignTab />`, page.tsx:601-603) and
  `deck_templates` carries no `course_id` column (grep across its three
  migrations returned no match).
- A Node measurement for the localStorage size claim in section 3 (command
  quoted there, not recalled).
- `docs/loop/seats.md` lines 210-229, the Data/storage seat's own checker
  questions - answered explicitly in section 6, one by one.

## 1. The state shape

### 1.1 The four artifact kinds and the selection

```ts
// The four independently-selectable artifact kinds (AC-4,
// docs/pres-1-acceptance-criteria.md:151-176). "critique" is a fifth thing
// the owner also calls an artifact (d), but structurally it is not a sibling
// content artifact - it is always keyed TO one of the other three (AC-5,
// :177-199) - so it is modelled as a map, not a fifth peer field. See 1.3.
export type PresentationContentKind = "outline" | "activities" | "deck";

export interface PresentationSelection {
  outline: boolean;
  activities: boolean;
  deck: boolean;
  /** Whether adversarial review runs at all this round. When true it
   * critiques every OTHER selected-and-produced kind (AC-5's reconciliation,
   * :194-199) - it never gates itself. */
  critique: boolean;
}
```

`PresentationSelection` is the "artifact-selection control state" AC-8 names
(`docs/pres-1-acceptance-criteria.md:245-260`) and is a plain flat record of
four booleans - nothing here is a mechanism decision, so it is safe to fix at
this layer.

### 1.2 Outline and activities

```ts
export interface PresentationOutline {
  /** Free-form outline text (owner's word: "a lecture outline"). Nothing in
   * the AC requires a structured/sectioned shape, and imposing one here
   * would be inventing a mechanism this seat does not own - leave that to
   * the architect if a later criterion ever needs it. */
  text: string;
}

export interface PresentationActivities {
  /** The owner asked for "3-5 ideas" (docs/pres-1-acceptance-criteria.md:19,
   * reconciled at :170-175: the 3-5 COUNT is explicitly OWNER-verification
   * only, residual R-3 - a mocked call cannot be asserted to return exactly
   * N items). The type therefore does NOT encode a length constraint; it is
   * a plain array so a real model returning 2, or 7, is still representable
   * and nothing here would need to change to fix that later. */
  ideas: string[];
}
```

### 1.3 The deck - ONE model, reused, not reinvented

This is the requirement the brief calls out explicitly, so the citation trail
matters more here than anywhere else in this document.

**The type that actually feeds `buildSlidesPptx` is `PptxSlide`
(`src/lib/pptx.ts:19-35`), not anything in `src/lib/decks/types.ts`.** That
file's `DeckSlide`/`DeckTemplate` (`types.ts:334-368`) is a different, earlier
model: the reusable *template* an instructor authors slide-by-slide, carrying
`role`/`depth`/`loopGroupId`/`maxBullets` (`types.ts:334-344`), which
`expandTemplate` (`types.ts:444-521`) resolves into `ResolvedSlideSpec[]`
(`types.ts:370-380`) - a template-expansion output, still not what gets
rendered. The actual generated content model is built one layer further on,
by `generateDeckFromTemplate` (`src/lib/decks/generate.ts:353`), which returns:

```ts
// src/lib/decks/generate.ts:36-39
export interface GeneratedDeck {
  presentationTitle: string;
  slides: PptxSlide[];
}
```

and `PptxSlide` (`src/lib/pptx.ts:19-35`) is exactly what:

- `buildSlidesPptx`'s `BuildSlidesOptions.slides` consumes
  (`src/lib/pptx.ts:70-74`, the function itself at `:199`);
- `savePresentationFileAction`'s `input.slides` consumes
  (`src/app/actions/media.ts:590-592`);
- the existing `ppt-design` tab's own on-page generation state already holds:
  `const [generatedDeck, setGeneratedDeck] = useState<{ presentationTitle:
  string; slides: PptxSlide[] } | null>(null)` (`ppt-design/hooks.ts:194`) -
  and this is the exact object `GeneratePanel` renders on the page today
  (`ppt-design/index.tsx:728-729`, `generatedDeck`/`editedSlides` passed
  straight into it).

So the PRES-1 deck-slide-model is:

```ts
export interface PresentationDeckModel {
  presentationTitle: string;
  slides: PptxSlide[]; // src/lib/pptx.ts:19-35, unchanged, imported not copied
}
```

This is not a new type - it is `GeneratedDeck` (`decks/generate.ts:36-39`)
under a PRES-1-scoped name so the field also fits alongside the other three
artifacts in section 1.4 without importing a name that reads as
`ppt-design`-owned. Using this exact shape is what makes "the DECK must be
ONE slide model that feeds BOTH the on-page preview AND `buildSlidesPptx`"
(the brief's own wording) true by construction rather than by discipline: the
preview the architect designs for R-1 renders `PresentationDeckModel.slides`
directly (the same array `GeneratePanel` already knows how to render, per the
citation above), and the download path hands the same array to
`buildSlidesPptx` unchanged. There is no second slide type anywhere on this
path to diverge from the first.

**A parallel type already exists elsewhere and must not be reached for.**
`SlideData` (`src/app/actions-types.ts:6-22`) is structurally almost
identical to `PptxSlide` (`title`, `bullets`, `code?`, `codeLanguage?`,
`notes?`, `graphic?`) but is a distinct, nominal type used by the *other*
generation pipeline - `src/lib/lms-generation/deck.ts`, the Content-tab
LMS-selection-driven generator (`parseDeckSlidesFromStructured`,
`deck.ts:131-137`, and `mergeRefinedDeckSlides`, `deck.ts:203-264`). The two
types are not interchangeable at the type level even though their fields
line up, and PRES-1 has no reason to touch that pipeline at all (R-2: reuse
`decks/`/`pptx.ts`/`deck-source`/`ta-ppt-*`, not `lms-generation/`). Naming
this is a residual for the architect, not a decision this document makes: if
implementation ever imports from `lms-generation/deck.ts` "because the shape
looks the same," that is importing the wrong pipeline - see residual R-D6.

### 1.4 Per-artifact critique - keyed, not positional

```ts
export interface ArtifactCritique {
  /** Which produced kind this critique reviews. AC-5's two enforced clauses
   * (docs/pres-1-acceptance-criteria.md:191-193): every produced-and-reviewed
   * kind has exactly one of these, and no critique exists for a kind that was
   * not produced - both are enforced by this being a PARTIAL map keyed by
   * kind, never a positional array (a positional array is exactly what AC-5
   * calls "a positional guess"). */
  text: string;
}

export type ArtifactCritiques = Partial<Record<PresentationContentKind, ArtifactCritique>>;
```

### 1.5 The generation result

```ts
export interface PresentationArtifacts {
  outline?: PresentationOutline;
  activities?: PresentationActivities;
  deck?: PresentationDeckModel;
  critiques?: ArtifactCritiques;
}
```

A field is present only when its kind was selected AND the call for it
completed (AC-4's "no more, no fewer"). `critiques` is present only when the
`critique` selection was on; when present it never has a key for a kind that
is `undefined` above it (AC-5's second clause) - this is a structural
invariant the type alone does not enforce (TypeScript cannot express
"critiques' key set is a subset of the OTHER present keys" without a
dependent type), so it is named here as an instrument obligation, not
discharged by the type: the test seat's AC-5 oracle must assert it on the
actual returned object, not trust the shape. Flagging this rather than
silently claiming the type "enforces" it is the point of writing this down
at all - a type that looks enforcing but is not is worse than one that
admits it needs a runtime check.

### 1.6 Context intake - two fields, not one, and why not one

`ppt-design` already has a materials pipeline: `extractDeckSourceFileAction`
/ `extractDeckSourceRepoAction` (`src/app/actions/deck-source.ts:34,63`) feed
`normalizeDeckSource` (`src/lib/decks/deck-source.ts:44-62`), which returns:

```ts
// src/lib/decks/deck-source.ts:32-36
export interface DeckSourceResult {
  materials: string;
  receipt: DeckSourceReceipt;
}
// src/lib/decks/deck-source.ts:21-30
export interface DeckSourceReceipt {
  name: string;
  bytes: number;
  characters: number;
  truncated: boolean;
}
```

and `ppt-design` stores the result as two separate ta- keys:
`ta-ppt-source-receipt` (`hooks.ts:117-119`) and `ta-ppt-source-materials`
(`hooks.ts:121-123`). **This single `materials` field is not enough for
PRES-1's own AC-3, which the AC document states explicitly**
(`docs/pres-1-acceptance-criteria.md:131-149`): the instructor must be able
to paste/type TEXT *and* attach a FILE, both reaching generation. In
`ppt-design` there is no typed-text box at all - `materials` is populated
only from a file/repo extraction. Reusing that one field for PRES-1 would
silently conflate "what the instructor typed" with "what the file said,"
and a second paste would overwrite the first with no trace of which supplied
what. So PRES-1 needs one more field than `ppt-design` has:

```ts
export interface PresentationContext {
  /** Directly typed/pasted free text - AC-3's "text" intake. Has no
   * equivalent in ppt-design's own state (ppt-design has no typed-text
   * box), so this is a genuinely new field, not a renamed existing one. */
  pastedText: string;
  /** Reuses the shipped file-intake receipt verbatim - no new type. */
  fileReceipt: DeckSourceReceipt | null; // src/lib/decks/deck-source.ts:21-30
  /** The file's own extracted/normalised text (DeckSourceResult.materials),
   * kept SEPARATE from pastedText so neither intake silently overwrites the
   * other. How the two are combined into one generation prompt is a
   * mechanism decision (concatenation order, a separator, a length budget
   * split between them) - out of scope here; see residual R-D7. */
  fileMaterials: string;
}
```

## 2. The regenerate-with-context history (item 4)

Re-reading the owner's words and AC-7/LEV-1 closely: "prior" in "the prior
pasted context" (`docs/pres-1-acceptance-criteria.md:228-243`) is contrasted
with *starting fresh* ("FAILS if regenerate discards the prior context
(starts fresh)", `:240-243`), not with a *different, earlier* context value.
Nothing in AC-8's persisted-state object (`:245-249`) or anywhere else in the
AC document describes context being versioned or snapshotted per round -
there is exactly one persisted context value (section 1.6's
`PresentationContext`), and "the prior pasted context" a regenerate call
folds in is that same current value, read again. This means the minimal
retained state for regenerate is **not** a context history at all - only a
critique history, one entry per content kind:

```ts
export type RegenerateHistory = Partial<Record<PresentationContentKind, { priorCritique: string }>>;
```

A regenerate call for kind `k` builds its request from
`context` (current, live - section 1.6) plus
`history[k]?.priorCritique` (if present; absent on a first generation, or
when review was never selected). This is deliberately smaller than a naive
"keep everything" history: it holds exactly the one thing that is not
already recoverable from `PresentationContext` or from the last
`PresentationArtifacts`, because the critique text is otherwise discarded
the moment a new `PresentationArtifacts` overwrites the old one (there is no
other field it survives in - see section 3's recommendation that
`PresentationArtifacts` is not persisted at all).

**Residual, named rather than resolved:** the reading above assumes the
instructor does not re-paste new context between generating one artifact and
regenerating a different, earlier one. If they do, "prior pasted context"
becomes ambiguous - the context AT GENERATION TIME for that artifact, or the
CURRENT live value - and the two are no longer the same string. The AC
document does not decide this (it was written assuming the single-pass flow
in the owner's own sentence: paste once, generate, regenerate against
comments). This is a shape question, not a data-typing one, so it is routed
rather than answered - see residual R-D8.

## 3. Persistence - the fork, and a recommendation

### 3.1 What AC-8 already settled (machine-checkable, this round)

AC-8's object is explicit: "the pasted context (text and the file-intake
receipt) and the artifact-selection control state"
(`docs/pres-1-acceptance-criteria.md:245-249`) - **not** the generated
outputs, **not** the regenerate history. So `PresentationContext` (1.6) and
`PresentationSelection` (1.1) persist via `ta-` keys through the existing
`useLocalStorageState` hook (`ppt-design/hooks.ts:15-36`), the same hook
`ppt-design` already calls six times. Illustrative key names only - the
architect names the real ones, the same restraint the AC itself applied to
AC-1's internal id string (`:106-108`):

- `ta-pres-pasted-text`
- `ta-pres-file-receipt`
- `ta-pres-selection`

**Size, measured, not guessed** (the Data/storage checker's first named
question, `docs/loop/seats.md:218-219`). Command run:

```
node -e '
const DECK_SOURCE_MAX_CHARS = 20000; // src/lib/decks/deck-source.ts:19, the existing prompt budget
const materials = "Lorem ipsum dolor sit amet, consectetur.\n".repeat(Math.ceil(DECK_SOURCE_MAX_CHARS/42)).slice(0, DECK_SOURCE_MAX_CHARS);
const receipt = { name: "week7-lesson-plan.docx", bytes: 184320, characters: materials.length, truncated: true };
const selection = { outline: true, activities: true, deck: true, critique: true };
console.log(Buffer.byteLength(JSON.stringify(materials), "utf8"));
console.log(Buffer.byteLength(JSON.stringify(receipt), "utf8"));
console.log(Buffer.byteLength(JSON.stringify(selection), "utf8"));
'
```

Output: `20036`, `84`, `62` bytes (UTF-8, via `Buffer.byteLength`) for a
pasted-text value at the existing `DECK_SOURCE_MAX_CHARS` cap
(`deck-source.ts:19`), a representative file receipt, and the four-boolean
selection, respectively - about 20.2 KB combined at the UTF-8 encoding this
script measured. `localStorage` stores JS strings as UTF-16 internally, so
the browser-side quota cost for this mostly-ASCII text is roughly double:
**about 40 KB total**, against a typical per-origin `localStorage` quota of
several MB. This is comfortably small; the existing `ta-ppt-source-materials`
key already carries the same 20 KB ceiling today (`deck-source.ts:19` is
shared, not new), so PRES-1 introduces no new size risk beyond what
`ppt-design` already carries in production. If `pastedText` and
`fileMaterials` (two fields, section 1.6) are BOTH near the cap
simultaneously, the combined figure roughly doubles to ~40 KB UTF-8 / ~80 KB
UTF-16 - still small. No separate budget is proposed for `pastedText`; using
the same `DECK_SOURCE_MAX_CHARS` constant for it (rather than inventing a
second number) is a recommendation for the architect/implementer, not a
decision made here, since where a prompt-text budget is enforced is a
mechanism question.

**Write path - explicit fields, never a spread** (the checker's second named
question, `seats.md:220-221`). Each `ta-` write must enumerate exactly the
fields above, e.g. `setSelection({ outline, activities, deck, critique })`
never `setSelection({ ...someWiderComponentState })` - the latter is exactly
the failure mode the checker question names: a future field on whatever
object the spread comes from would leak into `localStorage` silently. This
is an instrument obligation for the implementer's code, stated here so the
implementer's own gate check (`git status --short` against the assignment)
has something concrete to hold the diff to; it is not itself
machine-checkable by a type test, since TypeScript does not distinguish "an
object literal with exactly these keys" from "a wider object that happens to
satisfy the same interface" at a call site using a spread.

**Retention / deletion** (the checker's fifth named question,
`seats.md:227-228`). Nothing auto-deletes a `ta-` key; it is browser
`localStorage`, cleared only by the browser's own storage-clearing UI or by
an explicit in-app "Clear" action. `ppt-design` already ships exactly that
affordance for its own source receipt - `handleClearSource`
(`ppt-design/index.tsx:414`) - and PRES-1 should get an equivalent "clear
pasted context" control rather than leaving the instructor's only way to
reset it be clearing browser data wholesale. Building that control is UX/
mechanism, not data shape; naming that it is needed, and that a precedent
for it already exists, is this pass's job. An abandoned session (tab closed
mid-paste, never generated) leaves the `ta-` values sitting in
`localStorage` indefinitely, same as every other `ta-` key in this app today
- "nothing deletes it" is the answer, stated rather than assumed.

**Hydration idiom - a measured tension worth surfacing, not silently
resolved.** AC-8's own instrument text
(`docs/pres-1-acceptance-criteria.md:250-256`) requires "any `ta-`-seeded
initial value is applied through a mount effect, not only a `useState`
initializer," citing the `persisted-details-open-hydration` failure mode.
Opening the actual shared hook shows it does NOT do that: `useLocalStorageState`
(`ppt-design/hooks.ts:15-36`) seeds its value purely through a `useState`
lazy initializer (`:16-25`) with no companion mount effect, and this is the
exact hook six existing `ppt-design` call sites already use in production
(`hooks.ts:73,81,118,122,133,195-196`) with no reported hydration bug. The
likely reconciliation: the hydration-mismatch failure mode requires a value
to affect markup present at the FIRST server-rendered paint; `ppt-design`
(and every `manualView`) mounts only after a client-side tab switch
(`page.tsx:601-603`, no course/SSR path renders it), so there is no
server-rendered markup for a `ta-`-seeded initializer to mismatch against -
the bug AC-8 is guarding against needs a component present at initial page
load, which a `manualView`-gated inner tab is not. On that reasoning, reusing
`useLocalStorageState` as-is for PRES-1's new keys is safe and matches
existing practice, and building a second, mount-effect-variant hook only for
PRES-1 would be inventing a second persistence idiom in a codebase whose own
standing rule is one idiom, reused. This is a judgement call one layer above
plain data typing (it is about component mount timing, which is UX/
mechanism territory), so it is recorded as a residual for the architect to
either confirm or overrule against the concrete component tree it designs -
R-D9 - rather than settled unilaterally here.

### 3.2 What is NOT settled by AC-8: do the generated artifacts persist?

This is the fork the brief asks this pass to recommend on, not gate on.

**Two existing tables look like candidates, and neither is a clean fit as-is:**

**Candidate A - `generated_artifacts`**
(`supabase/migrations/20261004000000_generated_artifacts.sql`, accessor
`src/lib/supabase/generated-artifacts.ts`). Exactly the right SHAPE for this
problem: `kind` (open string, no CHECK constraint - `:78` and its header
comment), `version`/`is_current` (monotonic-per-kind versioning with a
partial unique index enforcing at most one current row,
`generated_artifacts_one_current_idx`, migration `:112-113`), `text` +
`structured jsonb` (the migration's own header comment says the deck kind is
what `structured` exists for - `:38-41`, "the eventual deck kind cannot
round-trip through text alone"), and `prompt` (captured in full, exactly the
kind of thing a regenerate-with-context feature would want to record). It is
ALREADY LIVE and already used for a deck kind, wired through
`src/lib/lms-generation/deck.ts` and
`src/app/api/lms-generation/deck/route.ts` for the Content-tab
LMS-selection-driven generator - a different feature from PRES-1.

**The fit problem, measured, not assumed:** `course_id uuid not null
references public.course_hub (id)` (migration `:74`). PRES-1's own owner
decision (R-2) is to shape the new tab like `ppt-design`, and `ppt-design` is
mounted with no course context at all - `<PowerPointDesignTab />` takes no
`courseId` prop (`page.tsx:601-603`), and `deck_templates` (the table backing
it) has no `course_id` column in any of its three migrations (checked by
grep across all three; zero matches). Reusing `generated_artifacts` for
PRES-1 would therefore require either inventing a course binding PRES-1's
own owner decision did not ask for, or a schema change (nullable
`course_id`) to a table another live feature already depends on being
non-null - not a change to make inside this round's scope, and not this
seat's call to make regardless.

**Candidate B - `presentation_drafts`**
(`supabase/migrations/20260821000000_create_presentation_drafts.sql`,
accessor `src/lib/presentation-drafts.ts`). User-scoped, no `course_id` at
all - a real structural fit on that axis. But it is shaped for exactly one
thing: a single deck payload (`payload jsonb` = `{ presentationTitle,
slides, templateName?, subject?, theme? }`, migration `:11`). CORRECTION
(round-1 check BLOCKER-1, verified from the tree): this table is DORMANT with
ZERO callers - `createPresentationDraft`'s only caller is `media.ts:46`, never
ppt-design; ppt-design's `handleSaveDraft` (`index.tsx:592-620`) actually calls
`savePresentationFileAction` (`:596`, "Saved to Files"), and both the
generated_artifacts migration header (`20261004000000...:15-16`) and
REGRESSION.md:2360 record presentation_drafts as dormant. The row's own migration
comment claiming the button writes here is STALE. This does NOT change the verdict:
the table is single-deck `payload jsonb`, has no `kind` column and no versioning - it cannot hold an outline, an activities
list, or a critique without either overloading `payload` with an ad hoc
shape the table's own header comment does not describe, or adding columns to
a table whose current single caller does not need them.

**Recommendation: client-session-only for this round, for the generated
outputs specifically.** Do not add a new table or extend either existing one
this round. `PresentationArtifacts` (1.5) and `RegenerateHistory` (2) live in
React component state only, not `ta-` keys and not a server table -
reload loses them, same as `ppt-design`'s own precedent: its `generatedDeck`
is plain `useState`, explicitly NOT run through `useLocalStorageState`
(`hooks.ts:194` vs the `ta-ppt-*` keys at `:73,81,118,122,133,195-196`
immediately around it in the same file) - a deliberate, already-shipped
choice to treat generation OUTPUT as session-only by default, made durable
only by an explicit action. Reasons, together:

1. **Neither existing table fits without a change outside this round's
   scope** (the measured mismatch above), and building a *third* new table
   this round is exactly the kind of persistence decision the brief asks to
   be recommended, not defaulted into silently.
2. **AC-8 itself already drew the line** at input + selection, not output -
   adding server persistence for output would be answering a question the
   AC document does not ask.
3. **It matches shipped precedent exactly**, which is more defensible than a
   fresh design: the instructor already experiences "the deck I generated
   vanishes on reload unless I explicitly save it" in `ppt-design` today, and
   PRES-1 inheriting the same behavior is consistent, not a regression
   relative to the tool it is modeled on.
4. **AC-6's REQUIRED durability path (download) does not need any of
   this.** The `.pptx` download is a pure client-side blob
   (`URL.createObjectURL`, `ppt-design/index.tsx:553-559`) - it works with
   zero server persistence, so nothing in AC-6 forces this fork either way.

**If the owner wants more than that** - the deck (or the whole four-artifact
bundle) to survive a reload, or to show up in the Files tab automatically the
way unattended workflow deliverables do - that is real, and is recorded as a
residual (R-D1) rather than silently declined. Section 4 specifies exactly
what that would look like if adopted, so the recommendation above is a
reasoned default with a fully-specified alternative attached, not a door
closed on the question.

### 3.3 A correction to the AC document's own reuse notes

The AC's reuse notes say: "Downloadable artifact: client download via
`URL.createObjectURL(blob)` ... persist-to-Files via
`savePresentationFileAction` (`media.ts:590`)"
(`docs/pres-1-acceptance-criteria.md:302-305`), reading the two as
alternatives on the same shelf. Opening `ppt-design`'s actual "Save to
Files" button shows this is not what it does. `handleSaveToFiles`
(`ppt-design/index.tsx:565-590`) calls `saveRecordingFile` (from
`src/lib/recording-files.ts`) **directly**, client-side, with `source: null,
origin: "manual"` (`index.tsx:581-582`) - it never calls
`savePresentationFileAction` at all. `savePresentationFileAction`
(`media.ts:590-638`) and its sibling `saveLibraryFileAction`
(`media.ts:644-682`) both hardcode `source: "workflow", origin: "unattended"`
(`media.ts:628-629,672-673`) and exist specifically for the unattended
workflow-deliverable path (the function's own doc comment: "so a
workflow-generated presentation appears in the Files menu," `media.ts:586-587`).
If PRES-1's implementer reuses `savePresentationFileAction` verbatim for an
attended, instructor-clicked "Save to Files" button (the reading the AC's
citation invites), every file it saves would carry `source: "workflow"` /
`origin: "unattended"` provenance metadata that is simply false for a direct
UI click - a real, if small, correctness bug at the data layer, not a
security or UX one. **The correct reuse point, if this affordance is built at
all, is the same call `ppt-design` already makes** - `saveRecordingFile`
directly, with `source: null, origin: "manual"` - mirroring
`handleSaveToFiles` (`index.tsx:565-590`), not calling through
`savePresentationFileAction`. This is recorded as residual R-D2 rather than
fixed here, because whether PRES-1 gets a "Save to Files" button at all is
itself downstream of the fork in 3.2 (client-only this round means there is
nothing generated yet, most rounds, to explicitly save beyond the download).

## 4. If server-side persistence for generated artifacts IS adopted (the specified alternative)

Given only for completeness, per the brief's explicit ask ("If server-side,
name the table/migration shape + access control") - this is not what section
3.2 recommends shipping this round, and applying it is not authorized by this
document; it is here so the owner's answer to R-D1, if it is "yes, persist
it," has a ready shape rather than triggering a second design round.

### 4.1 Shape: a new table, not an extension of either existing one

Neither Candidate A nor B (3.2) should be altered to fit PRES-1 - A's
`course_id NOT NULL` is a live constraint another feature depends on, and B's
single-deck-payload shape has no `kind`/versioning to grow into without
becoming a second, incompatible thing under the same name. A new table,
shaped like `generated_artifacts` but keyed by `user_id` only (no
`course_hub` FK, matching `presentation_drafts`' scoping, not
`generated_artifacts`' - see 3.2's fit problem):

```sql
-- Sketch only - not applied by this document. Idempotent, matching every
-- other migration in supabase/migrations/ (create table if not exists,
-- drop policy if exists before create policy).
create table if not exists public.presentation_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- "outline" | "activities" | "deck" | "critique-<kind>" - see the note
  -- below on why critique is folded into kind rather than a separate column.
  -- No CHECK constraint, matching generated_artifacts' own open-ended
  -- precedent (migration 20261004000000, header comment) - this feature's
  -- kind set is not expected to be final either.
  kind text not null,
  version integer not null,
  is_current boolean not null default true,
  text text not null,
  -- Only the "deck" kind is expected to populate this, mirroring
  -- generated_artifacts' own documented convention (its migration's header
  -- comment, :38-41) - a PptxSlide[] (section 1.3), never a DeckSlide[].
  structured jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists presentation_artifacts_user_kind_version_idx
  on public.presentation_artifacts (user_id, kind, version);

create unique index if not exists presentation_artifacts_one_current_idx
  on public.presentation_artifacts (user_id, kind) where is_current;

alter table public.presentation_artifacts enable row level security;

drop policy if exists "Users read own presentation_artifacts" on public.presentation_artifacts;
create policy "Users read own presentation_artifacts"
  on public.presentation_artifacts for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own presentation_artifacts" on public.presentation_artifacts;
create policy "Users insert own presentation_artifacts"
  on public.presentation_artifacts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own presentation_artifacts" on public.presentation_artifacts;
create policy "Users update own presentation_artifacts"
  on public.presentation_artifacts for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own presentation_artifacts" on public.presentation_artifacts;
create policy "Users delete own presentation_artifacts"
  on public.presentation_artifacts for delete
  using (auth.uid() = user_id);
```

**Own-row RLS (four policies), not the `accessibility_scans` deny-all
pattern.** The deny-all precedent (`20261026000000_accessibility_scans.sql:16-28`)
applies specifically when the ONLY legitimate accessor is a service-role
client that carries no JWT (`auth.uid()` is null under it, so an own-row
policy would not even apply). Here the opposite is true: the natural
accessor is the instructor's own browser session reading/writing their own
rows directly (or through a thin server action gated by `requireUser()`,
mirroring `presentation-drafts.ts`'s own pattern, `:107-110` and every
exported function's signature), exactly like `generated_artifacts` and
`presentation_drafts` both already do with their four-policy own-row shape.
Applying deny-all here would break the feature; the `A11Y-RLS` precedent this
brief points at is about never shipping a table with NO row security, not
about deny-all being the universal answer - which table gets which of the
two shapes depends on which client legitimately touches it, and the
accessibility_scans migration's own comment says so explicitly (`:16-28`).

**Checker question: nullable-uniqueness-key generated column
(`seats.md:222-224`, the `42P10` upsert trap).** Checked and not applicable:
neither unique index above is on a nullable column - `user_id`, `kind`, and
`version` are all `not null`, so there is no partial-index-vs-generated-column
choice to make here (that trap is specifically about a nullable column
inside a uniqueness constraint, which this shape does not have).

**Checker question: explicit typed mapper, never a bare typed select
(`seats.md:225-226`).** A `mapPresentationArtifact` function, selecting `"*"`
(never a column subset - see `generated-artifacts.ts`'s own header comment,
`:19-27`, on why a subset select collapses to `never` in this repo) and
mapping every column explicitly, mirroring `mapGeneratedArtifact`
(`generated-artifacts.ts:79-95`) field-for-field. Not written here as code
(out of scope for this pass) - named so the implementer brief inherits the
obligation rather than rediscovering it.

**Retention.** `on delete cascade` from `auth.users(id)` (matching every
other user-scoped table cited in this document) - an account's presentation
artifacts are deleted when the account is. No other deletion path is
proposed (no TTL, no explicit per-row delete UI) unless the architect adds
one; "nothing else deletes it" is stated as the answer for the same reason
section 3.1 states it for the `ta-` keys.

**Where critique lives, if this path is taken.** Folding critique into the
same `kind` namespace (e.g. `"critique-outline"`, `"critique-deck"`) rather
than a boolean column on the content row keeps the versioning story uniform
(a critique regenerates and re-versions independently of the content it
targets, matching AC-7's per-artifact regenerate) but is itself a mechanism
choice - flagged, not decided, as R-D10.

### 4.2 Migration auto-apply, if this migration is ever added

Confirmed live and unconditional on this repo's side:
`.github/workflows/supabase-migrations.yml` triggers "on push to `main`"
whenever a path under `supabase/migrations/**` changes (or via
`workflow_dispatch`, lines 14-20). Adding the file above to
`supabase/migrations/` and pushing to `main` is sufficient to trigger the
apply - no manual "run this in the SQL editor" step, matching every other
migration cited in this document. This is a fact about the repo's existing
CI, not a claim about whether it will succeed against the live database,
which this environment cannot observe (no live Supabase connection here -
see the residual register).

## 5. Machine-checkable vs. reading vs. owner-verification

| What | Class | Instrument |
|---|---|---|
| `PresentationSelection`/`PresentationContext` types match what `ta-` keys store | MACHINE | a source-text/type test importing the interfaces and asserting the `useLocalStorageState` call sites' generic parameters against them (mirrors the manual-rail-family structure tests AC-1/AC-2 already call for) |
| A `ta-` write enumerates exact fields, no spread | READING | source review of the write call sites at implementation time - not machine-checkable, per section 3.1's own note on why a type cannot catch a spread |
| `PresentationDeckModel.slides` is literally `PptxSlide[]`, imported not redeclared | MACHINE | a source-text/import test asserting the Presentations module imports `PptxSlide` from `@/lib/pptx` rather than declaring a same-shaped local interface (the "two nearly-identical types" failure mode section 1.3 names for `SlideData` is exactly what this guards against recurring a third time) |
| The on-page preview actually renders the deck, and it is not an invisible enforcer | OWNER | AC-6's own instrument (`docs/pres-1-acceptance-criteria.md:205-215`) - unchanged by this pass, restated here only so this table is a complete map of every claim this document touches |
| `ta-` key size stays small for a realistic pasted context | MACHINE (measured once here) / READING (re-verified if `DECK_SOURCE_MAX_CHARS` or the field set changes) | the Node script in 3.1; re-run it if the budget constant changes |
| Whether the recommended client-only default (3.2) is what actually ships | READING at Verify | the verifier reads the as-built diff for whether generated artifacts got a `ta-` key or a table added, against this document's recommendation, and files a finding if it diverges without a recorded owner decision |
| Server-side migration in section 4 (if ever adopted): applies cleanly against production | OWNER | this environment has no live Supabase connection (`docs/loop/this-repo.md` section 6) - the GitHub Action's own run log is the only real signal, checked post-push |
| RLS policies are idempotent | MACHINE-adjacent (structural, not executed) | `drop policy if exists` before every `create policy`, `create table if not exists` - checked by reading the SQL, not by running it here; this repo's own migrations all follow this shape and section 4's sketch matches it |

## 6. Data/storage checker questions, answered directly

Per `docs/loop/seats.md:217-228`, one by one:

1. **Is the size claim measured or guessed?** Measured - section 3.1's Node
   script, output quoted, not recalled.
2. **Does the write path enumerate fields explicitly, or spread an object?**
   Specified as a requirement (explicit enumeration), flagged as an
   implementation-time reading check since no type system rule can enforce
   it - section 3.1.
3. **If a migration exists: stored generated column vs. partial index for a
   nullable uniqueness key? RLS present and idempotent?** No migration ships
   this round (3.2's recommendation). Section 4's specified alternative has
   no nullable column inside either unique index (checked, not applicable),
   and its RLS is own-row, four policies, each guarded by `drop policy if
   exists`, matching the two most recent RLS-bearing migrations in this repo
   (`generated_artifacts`, `presentation_drafts`).
4. **Does every read go through an explicitly typed mapper?** Named as an
   implementer obligation for section 4's alternative
   (`mapPresentationArtifact`, mirroring `mapGeneratedArtifact`); not
   applicable this round since nothing is read from a new table this round.
5. **What deletes this data, and when?** `ta-` keys: nothing, stated
   explicitly, with the existing `handleClearSource` precedent named as the
   pattern a "Clear" control should follow if the architect adds one.
   Section 4's alternative: `on delete cascade` from `auth.users`, and
   nothing else unless the architect adds a TTL or explicit delete UI.

## 7. Disposition table

Not applicable. This is the first Data/storage pass for PRES-1; there is no
prior version of this document to map requirements from into
kept/handed-over/withdrawn.

## 8. Residual register

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-D1 | The persist-server-vs-client-only fork (section 3.2). Recommendation given (client-only this round); not gated on. If the owner wants generated artifacts durable across reloads or visible in the Files tab automatically, section 4 is the ready shape. | Owner (product decision), then architect (wiring) if the answer is "persist it" | Owner answers the fork; if yes, the migration in section 4 (or a revised version of it) plus the accessor/mapper the architect scopes | Escalated alongside this document's check, per the "never stall" rule's own instruction to recommend and start rather than gate; not this seat's to start (data-shape pass only, no production code) |
| R-D2 | AC's reuse note cites `savePresentationFileAction` (`media.ts:590`) for "persist-to-Files," but `ppt-design`'s actual Save-to-Files button calls `saveRecordingFile` directly with `origin: "manual"` (`index.tsx:565-590`); reusing `savePresentationFileAction` verbatim would mislabel every save as `source: "workflow"` / `origin: "unattended"`. | Architect (if a Save-to-Files affordance is built for PRES-1 at all) | Reading review of whichever save path the architect specifies, against `index.tsx:565-590` | Architect pass |
| R-D2b (round-1 check X2) | CROSS-PASS DIVERGENCE: the architecture pass reuses `savePresentationFileAction` for its persist button (architecture.md:65,462) - the exact mislabel above. NOTE: ppt-design has TWO conflicting attended save paths (handleSaveToFiles origin:manual at index.tsx:575-583, AND handleSaveDraft calling savePresentationFileAction origin:unattended at :596), with REGRESSION.md:2351-2360 documenting the draft button was routed through the unattended action. MOOT for round 1 under R-D1 (client-session-only, no server persist built); IF server persistence is later added, the manual-save target is saveRecordingFile origin:manual. | Architect (reconcile at the architecture check) | architecture.md:65,462 vs media.ts:628-629 vs index.tsx:575-583 | Architecture check |
| R-D3 | AC-4's shape residual (3-5 activity ideas is owner-verification only) - carried over from the AC document's own R-3, not duplicated in substance, only cross-referenced so this document's type (`PresentationActivities.ideas: string[]`, no length constraint) is traceable to why. | Owner | Run the deployed feature | Post-deploy owner verification (unchanged from AC document) |
| R-D6 | `SlideData` (`actions-types.ts:6-22`) is a near-duplicate of `PptxSlide` from a different pipeline (`lms-generation/deck.ts`); an implementer reaching for it "because the shape matches" would be importing the wrong pipeline for PRES-1 (R-2 scopes reuse to `decks/`/`pptx.ts`, not `lms-generation/`). | Implementer brief author (architect/plan) | Import-source-text check that the Presentations module never imports from `@/lib/lms-generation/deck` or `@/app/actions-types`'s `SlideData` | Architect pass / implementer assignment |
| R-D7 | How `pastedText` and `fileMaterials` (section 1.6) combine into one generation prompt (order, separator, shared vs. split character budget) is a mechanism decision, not a data-shape one. | Architect | Design review of the prompt-assembly function once written | Architect pass |
| R-D8 | Whether "prior pasted context" (AC-7) means the LIVE current context or a per-round snapshot, in the edge case where the instructor pastes new context between generating one artifact and regenerating an earlier one. This document adopts the live-value reading as the minimal shape (section 2) but does not resolve the edge case. | Architect (shape), then test seat (if the resolution changes what LEV-1's oracle must capture) | Architect pass reconciles against AC-7's exact wording; test seat's LEV-1 oracle asserts on whichever shape the architect confirms | Architect pass, before LEV-1 oracle construction |
| R-D9 | Whether `useLocalStorageState`'s existing initializer-only pattern (no mount effect) is safe to reuse as-is for PRES-1's new `ta-` keys, given AC-8's instrument text asks for a mount-effect variant. This document's measured reasoning (section 3.1) is that it is safe because no `manualView` participates in SSR, but that reasoning is about component mount timing, which is the architect's territory to confirm against the actual tree it designs. | Architect | Confirm (or overrule) against the concrete component tree; if overruled, specify the mount-effect variant | Architect pass |
| R-D10 | Where critique rows live if section 4's alternative is ever adopted - folded into the same `kind` namespace (e.g. `"critique-deck"`) vs. a separate column - is a mechanism choice, sketched but not decided in section 4.1. | Architect (only if R-D1 resolves to "persist it") | Design review of the chosen shape against AC-5's per-artifact keying requirement | Architect pass, gated on R-D1's answer |

Every residual above names an owner, an instrument, and a step, per this
seat's own non-negotiable; none is a bare pointer with only a description.

## 9. What this seat could not determine

Per `docs/loop/this-repo.md` section 6 and this seat's own instruction not to
fill these in: whether the section-4 migration would apply cleanly against
the live Supabase project (no live database connection here); the actual
`localStorage` quota of any real browser/device the instructor uses (the
~40 KB figure in section 3.1 is a payload-size measurement, not a quota
measurement - quotas are typically several MB but this environment cannot
observe a real browser's enforced limit); and whether the owner in fact wants
generated artifacts to survive a reload at all (R-D1) - that is a product
answer this document recommends against defaulting into silently, not one it
can measure its way to.
