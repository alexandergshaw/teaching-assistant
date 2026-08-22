# Posting generated module content into the module the selection already names

The instructor's words: "one of the bulk actions I need available on the modules
view is to produce and insert an LMS module objectives page into a given module,
given the context of what has been bulk selected."

## What already exists (reuse survey - every symbol read before this doc was written)

**The bulk action exists, is reachable, and posts a real Canvas Page.** This
chunk does not rebuild it. The survey below is the evidence, so no implementer
re-derives it or "adds" a second one.

| Piece of the request | Already exists | Where |
| --- | --- | --- |
| A bulk action on the Modules view | `GenerateFromSelectionSection`, rendered whenever anything is selected | `src/app/components/content-tab/ModulesView.tsx:551`; section at `modules/GenerateFromSelectionSection.tsx:96,135-149` (one button per offerable kind) |
| "Module objectives" as one of those buttons | `objectivesKindConfig` in the kind registry, surfaced via `GENERATION_KINDS` -> `offerableGenerationKinds(itemCount, moduleCount)` | `src/lib/lms-generation/kinds.ts:572-589`; `modules/lmsGenerationKindHelpers.ts:22-27,104-106` |
| Generated from the bulk selection's context | `generate()` expands the selection (items AND whole modules) and sends it as materials | `modules/useLmsGeneration.ts:505-532`; server expansion in `src/app/actions/lms-generation.ts:312` |
| The objectives text itself | `generateModuleObjectivesForAssignment(...)`, Bloom-contracted, URL-stripped, embedded-provider fallback | `src/app/actions/module-objectives-generator.ts:47` |
| Produced as an LMS **Page** | `commitMeta: { canvasObjectKind: "page", publishedOnCreation: false, placement: "module-item" }` | `kinds.ts:578-583`; body via `markdownLiteToHtml` in `lms-generation/post-content.ts:80` |
| **Inserted into a module** | `create-page` (or `update-page` on a same-title match) then `link-page` | planner `lms-generation/commit-plan.ts:208-224`; executor `lms-generation/commit-execute.ts:130-176` |
| The Post control | "Post to Canvas" plus the module-target select and "New module..." field | `modules/GeneratedPreviewModal.tsx:616-680` |
| Choosing an existing module or naming a new one | `resolvePostModuleTarget` -> `planModuleTarget` (case-insensitive reuse before create) | `modules/lmsGenerationModuleTarget.ts:26-40`; `commit-plan.ts:83` |
| An UNATTENDED variant of the same insert | `lms-populate` turns a `role: "objectives"` file into a Canvas Page and links it | `src/lib/workflows/registry/steps.lms-modules.ts:227-249` |
| Page title | `` `${moduleLabel} Objectives` `` | `src/app/actions/lms-generation.ts:490` |

Shipped and documented as `docs/REGRESSION.md` entry 269 and
`docs/lms-module-content-generation-acceptance-criteria.md` (chunk 3b). That
entry's own Limits already record that no module has been generated and posted
end to end against a real Canvas course; this chunk does not change that.

## The actual gap

`postModuleChoice` is initialised to `""` (`useLmsGeneration.ts:440`) and is
never seeded from anything. The instructor selects module "Week 5", presses
"Module objectives", reviews the result - and is then asked "Choose where to
post this" against a select listing **every module in the course**
(`postModuleOptionsFrom`, `lmsGenerationModuleTarget.ts:51-53`), even though the
selection they started from named exactly one module and the generated page is
already titled after it.

So the "given module" half of the request is a dropdown hunt the selection
already answered. That is the whole of this chunk: the target defaults to what
the selection says, and stays honest when the selection does not say.

## Acceptance criteria

### The pure decision

**AC1. A NEW PURE FUNCTION DECIDES THE DEFAULT, AND IT LIVES WITH THE OTHER
POST-TARGET HELPERS.** Added to
`src/app/components/content-tab/modules/lmsGenerationModuleTarget.ts`, exported
and re-exported from `useLmsGeneration.ts` exactly as `resolvePostModuleTarget`
and `postModuleOptionsFrom` already are. Exact wire contract:

```ts
export function defaultPostModuleChoiceFrom(
  items: ReadonlyArray<
    | Pick<LiveSelectedItem, "source" | "moduleId">
    | Pick<ExportSelectedItem, "source" | "moduleRef">
    | Pick<RepoSelectedItem, "source" | "moduleRef">
  >,
  /** The RAW discriminated module-selection keys - useModuleSelection's own
   * `selectedModules`, Array.from'd (the `moduleKeys` local already computed
   * at useLmsGeneration.ts:508). NOT liveModuleIdsFromKeys' numeric
   * projection: that one silently drops every `export:`/`repo:` key
   * (utils.ts:198-208), which would make clause 3 of AC2 undetectable. */
  moduleKeys: readonly string[]
): string;
```

Returns the module id as a **string** (the select's own value type - it is
compared against `String(m.id)` and fed straight to `resolvePostModuleTarget`,
which does `Number(choice)`), or `""` for "no defensible default".

The parameter type is DERIVED via `Pick` from the three real arms of
`SelectedMaterialItem`, matching `buildModuleLabel`'s signature in
`lmsGenerationSelection.ts:59-66` verbatim in shape - that file's own comment
records what a hand-written copy of this union cost when a third source arm was
added. A fourth source must break this line loudly.

**AC2. EXACTLY ONE LIVE MODULE, OR NOTHING.** The default is a module id only
when the whole selection resolves to exactly one live Canvas module:

1. Collect distinct locations the same way `buildModuleLabel` does - tagged per
   source (`live:<moduleId>` / `export:<moduleRef>` / `repo:<moduleRef>`) so a
   live module `1` and an export module `"1"` can never collide - from `items`,
   UNION the raw entries of `moduleKeys`. **The key format IS the tag format**:
   `liveModuleKey`/`exportModuleKey`/`repoModuleKey` (`utils.ts:142,151,166`)
   produce byte-identical strings to `buildModuleLabel`'s own tags
   (`lmsGenerationSelection.ts:82-86`), so the union needs no translation and no
   new import.
2. Return `String(id)` when that set has exactly one member, that member is
   live, and its ref is numeric - `Number.isFinite(Number(ref))`, because
   `resolvePostModuleTarget` does a bare `Number(choice)`.

   *(Amended during the step-10 fix pass. The member is parsed with
   `parseModuleKey` (`utils.ts:181-189`), imported from `../utils` - NOT with
   a hand-rolled `startsWith("live:")` + `slice(5)`. The hand-roll that first
   shipped did not in fact match `liveModuleIdsFromKeys`' posture, though its
   comment claimed to: that function routes through `parseModuleKey`, whose
   `if (!ref) return null` makes `liveModuleIdsFromKeys(["live:"])` the EMPTY
   set, while `Number("")` is `0` and `Number.isFinite(0)` is true - so the
   hand-roll returned `"0"` for a `live:` key with an empty ref, a
   Canvas-module-shaped id nobody selected, in violation of this very clause.
   Latent only - `liveModuleKey(id: number)` cannot emit an empty ref and
   `selectedModules` is never persisted or rehydrated - but a divergence
   between two parses of the same key format is not something to leave lying
   next to a comment asserting they agree. There is no import cycle:
   `utils.ts` imports only React types, `../../actions`, `./constants` and
   `./types`, nothing under `modules/`. X1 case 11 pins it.)*
3. Return `""` otherwise - zero locations, more than one location, any
   export/repo involvement at all, or a non-numeric live ref.

An export- or repo-sourced selection has no Canvas module id to point at, and
posting is refused for it anyway (`postUnavailableReasonFor`,
`lmsGenerationKindHelpers.ts:88-92`). Guessing a live module for it would be a
fabricated target, which is the failure mode `buildModuleLabel`'s own comment
rejects for labels.

**AC3. A WHOLE-MODULE SELECTION WITH NO ITEMS STILL SEEDS.** `moduleKeys` is a
separate parameter precisely so that selecting an empty module - or a module
whose items the client tree has not expanded - still yields that module as the
target. `items` alone is insufficient: `expandModuleSelection` returns `[]` for
an empty module, and `buildModuleLabel` degrades to `DEFAULT_MODULE_LABEL` in
that case. The target must not degrade with it.

### The wiring

**AC4. SEEDED AT GENERATE TIME, ONCE PER GENERATION, AT A NAMED SEAM.** The
value is **computed in `generate()`** - right after `moduleIds`
(`useLmsGeneration.ts:532`), from `materialItems` and `moduleKeys` - and
**applied inside `finishGenerateSuccess`, immediately before its `setPreview`
call** (`:499`), passed in as a new final parameter.

*(Amended during the step-8 audit. This criterion first named `expandedForLabel`
as the first argument. `materialItems` is what shipped, and the two are provably
interchangeable at this call site because `defaultPostModuleChoiceFrom` unions
`moduleKeys` into its own location set: `expandModuleSelection` returns
`[...items]` plus items manufactured ONLY for modules whose key is in that same
`moduleKeys` - every one of its three loops is gated on `keySet.has(...)`
(`src/lib/lms-generation/materials.ts`) - so the expansion can contribute no
location the raw keys do not already carry. `materialItems` is preferred because
it does not depend on the client `modules` tree, which `generate()`'s own
comment already documents as possibly stale and therefore display-only.)*

*(Amended again during the step-10 fix pass, twice. First, the argument above
now lives in the CODE next to `defaultPostModuleChoiceFrom` in
`lmsGenerationModuleTarget.ts` - the function it actually argues about - as the
"MATERIALITEMS VS EXPANDEDFORLABEL" note, with a two-line pointer left at the
`generate()` call site. The same AC10 reasoning that routed the persistence
prose there applies: `useLmsGeneration.ts` is the file with no headroom, and
~50 of the 70 lines this change added to it were comment prose. Second, the
equivalence rests entirely on every loop in `expandModuleSelection` staying
gated on `keySet.has(...)`, and nothing in `src/lib/lms-generation/materials.ts`
said so. A comment above `expandModuleSelection` now names that invariant and
names `defaultPostModuleChoiceFrom` as the consumer depending on it - comment
only, no logic change in that file - so a future "also include prerequisites"
expansion arm cannot break the seed silently.)*

That seam is mandatory, not stylistic. `finishGenerateSuccess` is the ONLY
opener of the preview, and both generation routes converge on it - the
`generateFromSelectionAction` branch (`:595`) and the `decks` Route Handler
branch (`:565`). Applying it there:

- makes "written on every generation" structurally true rather than
  true-by-vigilance;
- writes on NO error or refusal path - not the decks-no-template refusal
  (`:542-545`), not either `finishGenerateError` tail (`:561-564`, `:591-594`);
- makes "before the preview opens" literal in the source text, which is what
  AC-X1's source-text guard pins.

Applying it in `generate()`'s body instead would fire on the refusal and error
paths; applying it inside the non-decks async IIFE would miss the decks branch
entirely. Both are wrong.

The seed is **unconditional on kind** - do NOT gate it on
`kindNeedsModuleTarget`/`kindOffersPost`. A kind with no target select never
reads the value, and gating adds a branch whose only effect is to preserve a
stale target across an announcements/decks/qa generation, which is exactly AC6's
failure mode.

**AC5. THE INSTRUCTOR'S OWN CHOICE IS NEVER OVERWRITTEN MID-REVIEW.** Once the
modal is open, only the select's own `onChange` may change the value. The four
paths that repopulate an already-open preview must NOT reseed:
`selectVersion` (`:605`), `refine` (`:656`), `saveEdit` (`:728`) and
`closePreview` (`:600`). Only a NEW generation reseeds. A reseed on any of those
four would silently move a target the instructor set by hand.

**AC6. A BLANK SEED CLEARS, IT DOES NOT PRESERVE.** When AC2 yields `""`, the
seed writes `""` - it does not leave the previous generation's module in place.
A stale target from a previous, different selection is worse than an empty
select, because the select looks answered.

**AC7. THE NEW-MODULE FIELD IS CLEARED ALONGSIDE, UNCONDITIONALLY.**
`setPostNewModuleName("")` accompanies EVERY seed write, blank seeds included -
not only non-blank ones. A blank seed that leaves stale "New module..." text
behind is precisely the contradictory state this criterion exists to prevent.

### What the instructor sees

**AC8. THE MODAL SAYS WHERE THE DEFAULT CAME FROM.** New optional prop on
`GeneratedPreviewModalProps`:

```ts
/** True when postModuleChoice was seeded from the instructor's selection
 * (AC8) rather than picked by hand. Purely presentational. */
postTargetFromSelection?: boolean;
```

Defaulting to `false`, so every existing render site and test compiles and
behaves unchanged. Pinned in full, because each of these is something three
implementers would otherwise decide three ways:

1. **Text**: exactly `From your selection.` - including the full stop.
2. **Class**: `styles.previewMeta` (the modal's own class, already used by the
   sibling explanatory text at `:675`), NOT `styles.fieldHint`. No new CSS.
3. **Position**: inside the `postNeedsModuleTarget && (<>...</>)` fragment
   (`:638-666`), immediately after the module-target `TextField` (`:655`) and
   before the `NEW_MODULE_TARGET_VALUE` conditional (`:656`), as a plain
   `<span>`. That position is inside the `!postUnavailableReason` branch
   automatically; anywhere else and it renders for announcements or for a gated
   export selection.
4. **Render condition**: `postTargetFromSelection && postModuleChoice !== ""
   && postModuleOptions.some((m) => String(m.id) === postModuleChoice)`.

   *(Third clause added during the step-10 fix pass.) The select's options come
   from `postModuleOptionsFrom(modules)` - the LIVE client tree - while
   `postModuleChoice` is seeded when generation STARTS, and `modules` keeps
   mutating in between: `useInlineModuleEdits.ts:135` removes a module,
   `useDragReorder.ts:156,235` rewrite the tree. If the seeded module is gone
   by the time the modal renders, MUI 9.0.1 finds no matching `MenuItem` and
   renders the select **blank** (`@mui/material/Select/SelectInput.js:568-577`;
   its out-of-range warning is dev-only and compiled out in production), so
   without this clause "From your selection." would sit next to an empty box.
   The gate is **render-time and presentational only**: `postModuleChoice`
   itself is untouched, and what `post()` sends is unchanged. It does NOT
   defeat AC3, and does not reintroduce what the step-4 architect rejected -
   that rejection was of filtering the SEED against `postModuleOptions` at
   compute time in the hook. AC3's case is a module with no items, or one the
   client tree has not expanded; such a module is still present in `modules`
   and therefore still an option, so its hint still renders. The only case
   this clause suppresses is a module that is genuinely no longer there.
5. **Provenance is STATE, not derivation.** A separate `useState` in the hook,
   set true only when AC4 seeds a non-blank value. Deriving it by comparing the
   current choice to the seeded one is wrong: an instructor who changes the
   select away and back again would resurrect the hint, violating this
   criterion's own rule that the flag falls the moment the select changes.
6. **Mechanism**: the hook wraps its own setter and returns the wrapper under
   the EXISTING key name `setPostModuleChoice` - the key is load-bearing
   (`ModulesView.tsx:843` binds it by name, and the wiring test reads that
   binding by name):

   ```ts
   const choosePostModule = (v: string) => {
     setPostTargetFromSelection(false);
     setPostModuleChoice(v);
   };
   ```
7. **FORBIDDEN**: clearing the flag in a `useEffect` keyed on
   `postModuleChoice`. Such an effect fires on AC4's own seed write and clears
   the flag it just set - the hint would never render, while passing `tsc` and
   every node-env test. A feature that ships dead through every gate. The hook
   must contain no `useEffect` whose dependency array names `postModuleChoice`.
8. New field on `UseLmsGenerationReturn`: `postTargetFromSelection: boolean`,
   alongside `postModuleChoice`.
9. The hint is a plain unassociated `<span>`, matching the sibling
   `previewMeta` span at `:675`. It is deliberately not wired to the select via
   `aria-describedby` - recorded in Limits rather than silently omitted.

**AC9. NOTHING ELSE CHANGES.** Course-level kinds (announcements -
`kindNeedsModuleTarget` false) render no target select and are untouched.
Generation-only kinds (`qa`, `currentEvents`, `decks`, `scripts`) offer no Post
control and are untouched. The refusal wording when no target is resolved
(`resolvePostModuleTarget`'s two `reason` strings) is unchanged byte for byte -
it is still reachable whenever AC2 yields `""`.

**AC10. NO NEW PERSISTED CONTROL.** The post target is deliberately NOT given a
`ta-` localStorage key. The repo rule that every new textbox/select/checkbox
persists exists so a control's state survives a reload; this control's correct
value is a function of the CURRENT selection, and a persisted value from a
previous session would be exactly the stale-but-answered-looking select AC6
rejects. The select is also not new. This reasoning goes in the CODE, in
`lmsGenerationModuleTarget.ts` next to the new function (that file has ~948
lines of headroom; `useLmsGeneration.ts` has 98 and cannot afford the prose),
with a two-line pointer from the hook.

### Cross-cutting

**X1. PURE LOGIC IS SEPARATELY TESTABLE.** `defaultPostModuleChoiceFrom` is
tested with in-memory literals and no `vi.mock`. Required cases:

1. single live module via `items` -> that id
2. single live module via `moduleKeys` only, no items (AC3) -> that id
3. items in module 5 PLUS `live:5` in `moduleKeys` -> `"5"` (the union
   DEDUPES rather than counting two locations - this is the case the shared
   tag vocabulary exists to make work)
4. two live modules -> `""`
5. one live plus one export -> `""`
6. export only -> `""`
7. repo only -> `""`
8. empty items and empty keys -> `""`
9. live module `1` plus export module `"1"` -> `""` (the collision the tagging
   prevents; an untagged implementation returns `"1"` here)
10. a `live:` key with a non-numeric ref -> `""`
11. *(added in the step-10 fix pass)* a `live:` key with an EMPTY ref -> `""`,
    asserted alongside `liveModuleIdsFromKeys(["live:"]).size === 0` so the two
    parses of the same key format are pinned as agreeing rather than merely
    described as agreeing; plus an untagged key with no colon at all -> `""`.

The hook's AC4/AC5/AC6/AC8.7 behaviour cannot be tested by rendering - vitest
here is node-env and renders no component. It is pinned by a SOURCE-TEXT guard
following `useLmsGeneration.test.ts:828-932`'s existing idiom, asserting:

- `defaultPostModuleChoiceFrom(` appears in the hook exactly once, at an index
  inside `generate`'s body (between `const generate =` and
  `const closePreview =`);
- `setPostTargetFromSelection(` and `setPostModuleChoice(` appear inside
  `finishGenerateSuccess`'s body and NOT inside `refine`'s, `saveEdit`'s,
  `selectVersion`'s or `closePreview`'s;
- the hook contains no `useEffect` whose dependency array contains
  `postModuleChoice` (AC8.7);
- `setPostNewModuleName("")` co-occurs with the seed write (AC7).

*(Amended during the step-10 fix pass - three hardenings, none of them
behavioural.)*

- **The guard reads COMMENT-STRIPPED source.** It uses the same
  `stripComments` helper idiom `generatedPreviewModal.wiring.test.ts:147`
  already has. Counting `defaultPostModuleChoiceFrom(` against raw text meant
  any future comment writing that name with a paren reddened the suite - the
  over-specification this repo has already been bitten by twice. Same fix
  applied to the wiring test's own `From your selection.` count, which the
  new AC8.4 comment would otherwise have broken immediately.
- **The effect scanner matches a regex, not the literal `"useEffect("`.**
  `useLayoutEffect(` and `useEffect (` (with a space) are both real ways to
  write AC8.7's forbidden effect, and a literal marker walked past either -
  the guard would have passed while the feature shipped dead.
- **A whole-file census closes the post-`post()` blind spot.** The pairwise
  slices stop at `const post = () => {`, so a seed write added inside
  `post()`, inside `download`, or at the hook's top level satisfied every
  slice assertion. `setPostTargetFromSelection(` and `setPostModuleChoice(`
  are each asserted to appear **exactly twice** hook-wide (the
  `finishGenerateSuccess` seed and `choosePostModule`; the wrapper handed out
  under the `setPostModuleChoice` key carries no paren and is not counted),
  and both occurrences are located against the `finishGenerateSuccess` and
  `choosePostModule` anchors so the count cannot be met by two writes
  somewhere else.

**X5. THE HINT'S OWN RENDER GATE IS GUARDED.** The wiring test asserts the
`postModuleOptions.some(...)` clause sits in the hint's own condition
(located relative to the hint text's index, not anywhere in the file), so
dropping AC8.4's third clause goes red rather than silently restoring the
lying hint.

Per DEV_LOOP step 9, sabotage-check each by moving the call and confirming the
matching assertion goes red.

**X2. NO EMOJIS. NO NEW CSS.** Reuse the preview modal's existing
`styles.previewMeta` and MUI idiom.

**X3. NO WORKFLOW STEP IS ADDED**, so `headless.test.ts`'s exact-count canary
must be untouched. Confirm by running it, do not assume.

**X4. THE TAGGING EXPRESSION IS DELIBERATELY DUPLICATED, NOT EXTRACTED.**
`defaultPostModuleChoiceFrom` builds a location `Set` near-identical to
`buildModuleLabel`'s (`lmsGenerationSelection.ts:82-86`). Extracting a shared
`selectionLocationTags(items, moduleKeys)` would require editing
`lmsGenerationSelection.ts`, which is in nobody's file set this wave, and
`buildModuleLabel`'s comment at `:66-81` is load-bearing documentation attached
to that expression. Two functions, one documented rule, one chunk. Say so in the
code, so the step-10 reviewer does not file it as a duplicate-helper finding and
the fixer does not "consolidate" it across the split. Revisit only if a fourth
source arm lands.

*(Clarified during the step-10 fix pass: X4 licenses the duplicated
tag-BUILDING expression, and nothing else. It does not license a hand-rolled
tag-PARSE - see AC2 clause 2's amendment for the divergence one caused.
Building the same string two ways is checkable by eye; parsing it two ways is
where the two implementations silently disagree.)*

## File split (disjoint - this is what step 6 dispatches against)

| Owner | Files | May not touch |
| --- | --- | --- |
| A | `modules/lmsGenerationModuleTarget.ts`, NEW `modules/lmsGenerationModuleTarget.postSeed.test.ts` | anything else |
| B | `modules/useLmsGeneration.ts`, NEW `modules/useLmsGeneration.postSeed.test.ts` | A's and C's files; `ModulesView.tsx`; and `useLmsGeneration.test.ts` (932 lines - 68 from the ceiling; leave it alone) |
| C | `modules/GeneratedPreviewModal.tsx`, `modules/generatedPreviewModal.wiring.test.ts`, `ModulesView.tsx` (ONE prop binding, nothing else) | A's and B's files |

`ModulesView.tsx` belongs to C and is not optional. `ModulesView.tsx:827-854`
passes every modal prop by name - there is no spread - so without
`postTargetFromSelection={lmsGeneration.postTargetFromSelection}` at the
`<GeneratedPreviewModal>` render site the hint is unreachable in the product,
AND `generatedPreviewModal.wiring.test.ts:442-450` ("binds every prop the modal
declares, by name") goes red. Whoever owns that guard owns the file it reads.

**Line counts before the wave** (`@(Get-Content path).Count`): `useLmsGeneration.ts`
902, `useLmsGeneration.test.ts` 932, `GeneratedPreviewModal.tsx` 688,
`generatedPreviewModal.wiring.test.ts` 549, `ModulesView.tsx` 861,
`lmsGenerationModuleTarget.ts` 52. Nothing may cross 1000; B is the tight one.

**Compile-time dependencies across the split**, per DEV_LOOP step 6 - code
against the AC contract, never against files on disk:

- **B depends on A.** `useLmsGeneration.ts` imports from
  `./lmsGenerationModuleTarget` (`:166-170`) and re-exports (`:218-219`). Until
  A lands, B's `npx tsc --noEmit` fails with exactly
  `Module '"./lmsGenerationModuleTarget"' has no exported member 'defaultPostModuleChoiceFrom'`.
  That one failure is expected and REPORTED. Any other failure is not. B never
  creates the file or inlines a copy.
- **C depends on B** for the one `ModulesView.tsx` binding
  (`lmsGeneration.postTargetFromSelection`). Same rule: report, never add the
  field to the hook.
- **Order**: A first, then B and C concurrently. Nobody runs `git stash`.

## Limits (state, do not paper over)

- vitest here is node-env and renders no component. No test proves the hint
  renders, that the select shows the seeded value, or that either is reachable
  by keyboard. Those come from reading only; the hook's behaviour is pinned by
  source-text assertions, which prove where a call sits, not what React does.
- The hint is not programmatically associated with the module select (no
  `aria-describedby`), matching the sibling `previewMeta` span it stands next
  to.
- Individually-checked repo FILES are invisible to this seed:
  `useModuleSelection.selectedMaterialItems()` (`:430-447`) has no repo arm at
  all, so a repo file contributes to neither `items` nor `moduleKeys`. A
  selection of live module 5 plus loose repo files still seeds `"5"`. Whole
  repo FOLDERS are detected, via their `repo:` module keys.
- A seeded target can still outlive the option that backs it. AC8.4's third
  clause hides the HINT when that happens, but `postModuleChoice` itself is
  left holding the vanished id and the select renders blank, so an instructor
  who does not re-pick gets `resolvePostModuleTarget`'s existing refusal (or,
  worse, a post into a module that was deleted only in the client tree).
  Making the VALUE itself fall back is a real behaviour change to what gets
  posted and is deliberately out of this chunk's scope; the stale-value
  exposure is largely pre-existing, and this chunk only makes it pre-filled
  rather than blank.
- Canvas is never exercised. This chunk changes which module id the existing
  post path receives; it does not make the post path itself any more proven
  than entry 269 left it.
- The end-to-end run against a real Canvas course that entry 269's Limits call
  out as never having happened still has not happened.
