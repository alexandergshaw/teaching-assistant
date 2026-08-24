# The bulk-bar command box: instruct, propose, then apply

Chunk G. Split out of the bulk-bar reorganization's AC12h-AC12m at the
coordinator's recommendation, because it grew across three requests in one
session from "a context textbox" into the highest-consequence action the bar
would contain.

**The asks, verbatim (2026-08-23), in the order they arrived:**
1. "for all actions taken on the bulk action bar that involve an llm, give me a
   textbox i can use to provide additional context/commands"
2. "also make it so that this textbox is available even if i just select a
   module or an item, and make it so that i can submit the textbox as a
   command to an llm to modify the selected module or item"
3. "and make it so that the llm that gets called through this textbox can also
   generate entirely new modules"

**Ask 1 is chunk E's AC12a-g and is NOT in this chunk** - it is a context field
for an existing generation, small and additive. This document owns asks 2 and
3: the same box submitted as a COMMAND.

---

## 0. Why this is separate, and what makes it different from everything shipped so far

Every LLM feature in this app so far produces a NEW artifact the instructor
reviews before it goes anywhere: a discussion draft, an assignment draft, a
report, a script. This one **rewrites content that already exists in a live
course**, and can create modules. There is no undo in Canvas.

That single difference drives every criterion below.

---

## 1. The rule that governs the whole chunk

**AC1. Draft, review, commit. Never fire-and-forget.**

This project has a standing classifying rule: an action with side effects gets
a supervised variant that drafts and a review step before it commits. That
rule was written for actions far smaller than this one.

So: submitting a command produces a **PROPOSAL**. The proposal reaches Canvas
only when the instructor applies it. There is no path from typing to a Canvas
write without an explicit approval of the specific changes.

**AC1b.** The command control is `destructive` tier in the bar's consequence
model, so its group can never collapse and it carries an always-visible
consequence tag. Both follow automatically from declaring the tier correctly -
see REGRESSION entry 329.

---

## 2. Availability

**AC2.** The box renders whenever ANYTHING is selected - a module alone, an
item alone, or any mix. It is NOT gated on the Generate row being offerable.

This exposes an existing asymmetry the bar already has: the Generate row is
offered for a module-only selection, but the thirteen item-level bulk actions
are not. The box must work for both, so it belongs to the bar itself, in its
own declared group, not inside either bulk section.

---

## 3. What a command may change

**AC3.** Only fields this app can already both READ and WRITE, because a
proposal must show the current value to be reviewable:

- an item's title, and the description/body of an assignment, quiz, discussion
  or page (`getGradable` / `getPage` to read; `updateGradable` / `updatePage`
  to write)
- a module's name (read from the loaded tree; `updateModule` to write)

**AC3b. Explicitly OUT of scope, and the UI says so rather than silently
skipping:** points, due dates, submission type, rubric association, and
publish state. Every one of those has a dedicated control in this same bar,
and a free-text command that silently changed a due date would be
indistinguishable from the dedicated control having been used. A command that
asks for one of them is reported as UNSUPPORTED in the proposal - named, not
dropped.

**AC3c (new modules).** A command may also create modules. Reuse
`planBulkModuleCreation` (`src/lib/bulk-module-plan.ts:151`) - it already
returns a per-module CREATE / ALREADY-PRESENT decision by
case/trim-insensitive name, and its own header records why: Canvas offers no
idempotency key for module creation, so a name pre-check is the only dedupe.
**An LLM-driven creator that skips it duplicates every module on a second
run.** Titles go through `composeModuleTitle`, which is idempotent for a fixed
week and exists because a generated title fed back in once produced
"Module 08: Module 08: Module 08".

**AC3d.** Creating a module and populating it is NOT in scope. The bar already
has "Add to each", and chunk D covers carrying a module's pattern forward. A
command that asks for populated modules creates the modules and says plainly
that their contents were not created.

---

## 4. The proposal

**AC4.** Per affected object: what it is now, what it would become, and which
of the three outcomes applies - MODIFY, CREATE, or UNSUPPORTED. Nothing is
written before the instructor applies.

**AC5.** Per-object failure is per-object, in both the proposal and the apply
step, reusing `ModuleContentResult` / `describeOrphans` rather than a new
vocabulary. "The model returned nothing for item 3" and "Canvas rejected the
write for item 3" stay distinguishable - collapsing distinct failures into one
state is the defect this repo's loop catches most often.

**AC6.** Applying is idempotent in the weak sense that matters: re-applying an
unchanged proposal must not create duplicate modules (AC3c's pre-check) and
must not re-issue writes whose target already matches the proposed value.

---

## 5. The control

**AC7. One box, two buttons, no mode switch.** The group holds the textarea
plus one action that uses the text as CONTEXT for the next generation (chunk
E's AC12a-g, if that has landed) and one that submits it as a COMMAND. A mode
toggle would be one more thing to get wrong and would make the two behaviours
indistinguishable at a glance - the confusion the bar's consequence model
exists to prevent. The two sit at different tiers and are styled accordingly.

**AC8.** The box persists across reloads under a `ta-`-prefixed per-course key
(repo invariant), read through a tolerant resolver.

**AC9. The box is never parsed.** It is free text handed to a model. No
pattern-matching, no special tokens, and nothing downstream branches on its
contents. If structured control is ever wanted, that is a separate designed
input, not this box growing a syntax.

---

## 6. Non-goals

- No writes without an applied proposal (AC1).
- No touching the five dedicated-control fields (AC3b).
- No populating created modules (AC3d).
- No cross-course commands.

## 7. Testing reality

vitest here is node-env and renders NO component. The proposal model, the
outcome vocabulary, the module-creation plan and the unsupported-request
classifier must all be pure and extracted, because they are the only parts
that can be tested at all. Nothing will prove the proposal renders, that the
apply button is reachable, or that a screen reader announces the change count.

## 8. Gates

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build      # compile line only
```

No emojis; ASCII only in comments. 1000-line ceiling via
`@(Get-Content path).Count`. **`ModulesView.tsx` is at 998 - it MUST be split
before this chunk touches it.** Measure the test baseline at dispatch; a
carried-forward number has caused two corrections already.

## 9. Reuse survey - vetted, 2026-08-24

Every entry below was confirmed by opening the file and reading the export, not
inferred from its name or from another document's claim about it. The headline:
**the Canvas write path for everything section 3 puts in scope already exists
and is already exposed as tested server actions.** The new code in this chunk is
the proposal model, the model-to-proposal parser, and the control - not the
writing.

### Already exists, must be reused

**The writes (zero new Canvas-layer code for in-scope fields).**
- `updateGradable` (`src/lib/canvas-modules/gradables.ts:48`), exposed as
  `updateGradableAction` (`src/app/actions/canvas-files-bulk.ts:510`) - title
  and body for assignment, quiz and discussion alike.
- `updatePage` (`src/lib/canvas-modules/pages.ts:43`), exposed as
  `updatePageAction` (`canvas-files-bulk.ts:437`).
- `updateModule` (`src/lib/canvas-modules/modules.ts:80`), exposed as
  `updateModuleAction` (`src/app/actions/canvas-modules.ts:73`).
- `updateModuleItem` (`src/lib/canvas-modules/module-items.ts:38`), exposed as
  `updateModuleItemAction` (`canvas-modules.ts:230`).
- `createCourseAssignmentAction` (`canvas-modules.ts:172`) creates AND links in
  one call, returning `{addedToModule, linkError?}` - two failure domains, so a
  real assignment id survives a failed module link (entry 331 check 12).
- `createModule` (`modules.ts:49`) / `createModuleAction`.
- The reads that make a diff possible: `getGradable` (`gradables.ts:13`),
  `getPage` (`pages.ts:23`), and the already-loaded module tree.

**The bulk bar's group model.** `BulkBarGroupDef` /
`BulkBarControlDef` (`src/app/components/content-tab/modules/bulkBarGroups.ts:378`
and `:338`), the 15 group literals in `bulkBarGroupCatalog.ts:771`, and
`auditGroupModel`'s eight invariants (`bulkBarGroups.ts:576`). A group's tier is
DERIVED - `groupTier` (`:406`) takes the max over currently-visible controls -
never declared. Declaring a control `fan-out-write` or `destructive` already
buys three things for free: the group can never collapse (`mayCollapse`, `:436`,
forcing `groupOpen` true at `:456`), invariant I5 forces a non-empty
`consequenceTag`, and I3 forbids `defaultOpen: false`.

**The review-modal-before-writing stack** - the load-bearing precedent, and the
one to copy structurally:
- `useCarryModulePattern.ts` orchestrates fetch, plan and apply, arming the read
  and never fetching from an effect.
- `buildModulePatternPlan` (`src/lib/module-pattern-plan.ts:393`) is PURE - it
  takes read state plus the instructor's edits and returns a plan whose rows
  each carry a decision enum and their own blocked reason. No Canvas call.
- `buildCarryReviewRows` (`useCarryModulePattern.ts:287`) collapses the plan into
  rendered rows, exported so a node-env test can exercise it directly.
- `CarryModulePatternReviewModal.tsx` is a THIN RENDERER - it recomputes
  nothing - reusing `ModalShell` and the tab's own
  `previewHeader`/`previewMeta`/`previewContent` classes.
- `CarryModulePatternApplyOutcome` (`src/app/actions/carry-module-pattern.ts:301`)
  is a ten-variant per-object discriminated union, summarised by
  `describeCarryApplyOutcome`, which itself reuses `describeOrphans` /
  `OrphanNote` from `useBulkModuleActions.ts:30`. Section 5's "reuse the existing
  vocabulary" means THIS vocabulary.
- `confirmArming.ts` (`selectionSignature`, `isConfirmArmed`) is the two-click
  arming primitive - reusable directly, though it is an arming tool and not a
  diff tool.

**Selection.** `useModuleSelection.ts` already provides `selected: Set<string>`
(discriminated `live:`/`export:`/`repo:` keys), `selectedModules`,
`liveModuleIds`, `selectedItems()` and `selectedMaterialItems()`. A bulk hook
receives the raw key set plus a resolver and calls it itself - see
`useBulkItemActions`'s signature (`useBulkItemActions.ts:113`). No new selection
primitive is needed, and per entry 331's D15 any per-object ROLE this feature
needs must live beside the selection and be re-resolved every render, never
added as a field on the shared Sets.

**The D17 visibility rule, which this control must follow or repeat a hole
already shipped twice.** `carryApplyButton` is declared
`visible: (f) => f.carryReviewOpen` (`bulkBarGroupCatalog.ts:509`) so the group
sits at `read-only` until the review modal opens and rises to `fan-out-write`
the instant it does. The command box's Apply must be gated the same way - on
"is the write actually reachable right now", never on "is something selected",
which would leave the group permanently destructive. `isCarryReviewVisible`
(`useCarryModulePattern.ts:381`) is the shape of the predicate that both the
modal mount and the bar fact must read, because a selection change mid-fetch can
null the plan while `reviewOpen` is still true. The Generate row's
`generatePostReachable` (`bulkBarGroups.ts:289`) had this exact hole and was
patched after the fact - a cautionary precedent, not a model.

### Does not exist - must be built

1. **The proposal type.** Nothing in the repo represents a heterogeneous set of
   MODIFY/CREATE/UNSUPPORTED rows over arbitrary selected Canvas objects.
   `ModulePatternPlan` is the nearest shape but is template-and-target
   specific. Mirror its per-row decision/reason structure; do not try to reuse
   the type.
2. **A validated model-to-structured-proposal path, and this is the sharp
   edge.** There is NO shared "ask for JSON and validate it" helper. There are
   at least six independently defined local `extractJsonObject` functions
   (`src/lib/grade/rubric.ts:31`, `grade/parsing.ts:16`, `grade/prompts.ts:3`,
   `calendar-parser.ts:130`, `decks/sequence.ts:439`, and `app/actions/shared.ts:162`
   - the last with a DIFFERENT signature from the others), no schema-validation
   library anywhere (no `zod` in `package.json` or `src`), and the two closest
   generator precedents deliberately avoid JSON entirely: both
   `generateCarryModulePatternBody` (`carry-module-pattern.ts:239`) and
   `generateCurrentEventsAssignmentForModule` return PLAIN TEXT with
   hand-written backstops. So this feature needs a real multi-row structured
   reply where the codebase has only ever hand-parsed single fields. Write ONE
   shared parser, not a seventh copy. Note that section 9's "the box is never
   parsed" rule is about the instructor's INPUT; the model's REPLY still needs
   validation, and nothing here validates it today.
3. **The unsupported-field classifier** (section 3b: points, due dates,
   submission type, rubric and publish state must be NAMED when a command asks
   for one, never silently dropped). Nothing classifies free-text intent
   against a forbidden-field list. Must be a pure function per section 7.
4. **The control's own group declaration** - a new sibling group, following the
   `currentEvents` / `carryPattern` precedent of adding a group rather than
   moving another group's canaries.
5. **The wiring from an LLM-authored module-creation intent into
   `planBulkModuleCreation`** (`src/lib/bulk-module-plan.ts:151`) and
   `composeModuleTitle` (`src/lib/module-title.ts:140`). Both exist and are
   vetted; the wiring does not.
6. **Threading `ModuleContentResult` / `describeOrphans` through a free-text
   command's outcome** - integration code, not a new vocabulary.

### The one number worth re-measuring at dispatch

Do not carry a `ModulesView.tsx` line count forward from any earlier document.
Three AC docs carried three different stale counts (969/994/998) before
`1b235a3` corrected them, and entry 333 records the same class of mistake in a
sibling view. Measure it in the dispatch turn.

## 10. Post-design corrections - THIS SECTION IS THE FINAL CONTRACT

Written 2026-08-24 after a design pass that read this repo's Canvas layer, its
shipped bulk bar, and `instructure/canvas-lms` master rather than reasoning
from the summary above. **Where this disagrees with anything above, this wins.**
Nothing above is deleted - the wrong claims stay as a record.

**G1. "THERE IS NO UNDO IN CANVAS" IS WRONG FOR ONE TYPE AND WORSE THAN STATED
FOR ANOTHER, AND THE DANGER RANKING IS THE INVERSE OF WHAT A READER WOULD
GUESS.** Verified per type against Canvas source:

| Type | Native revert | Why |
| --- | --- | --- |
| Page | YES, fully | `POST /courses/:id/pages/:url/revisions/:id`; `wiki_page.rb` calls `simply_versioned` with NO `keep:`, so revisions are never pruned, and `can :read_revisions` comes with `:update_content` |
| Assignment | No reachable path | versioned but `keep: 5`, and the assignments API exposes no version action |
| Quiz (classic) | No reachable path | versioned, unlimited, no API action |
| Discussion | NONE AT ALL | `discussion_topic.rb` does not call `simply_versioned` - there is no version row even in principle |
| Module | None | `undelete` restores DELETED objects; it is not a rollback of an edit |

So **rewriting a discussion body is the most destructive thing this feature can
do, and rewriting a page is the least.** What survives: the proposal step is
still mandatory, because three of four types have no reachable undo. What
changes: a page rewrite may carry lighter confirmation and should say
"revertible from Canvas's page history"; and **for the three unrevertible types
this app must keep the pre-image itself.** It already reads the current value to
build the proposal, so storing that read alongside the applied result costs
nothing and is the only undo those types will ever have.

Note every existing "no undo" comment in this repo (`moduleContentActions.ts:164`,
`module-pattern-plan.ts:44`, `canvas-modules.ts:132`) is about a CREATE or a
DELETE. None was ever about an in-place body overwrite. The phrase was borrowed,
not verified.

**G2. SECTION 0's LOAD-BEARING CLAIM IS FALSE TWICE OVER, AND THE REFRAMING IS
THE MOST USEFUL THING HERE.** "Every LLM feature so far produces a NEW artifact;
this one rewrites content that already exists" is wrong:
`revisePageWithAiAction` (`src/app/actions/llm-tools.ts:123`) already takes a
page's current HTML plus a free-text instruction and returns a rewrite that
`PageEditorModal.tsx:101` saves via `updatePageAction`; and `bulkSetDescription`
(`useBulkItemActions.ts:728`) already overwrites the description of every
selected assignment, quiz, discussion and page from a free-text box in THIS SAME
BAR, on one click, with no arming and no proposal, at `fan-out-write`.

This chunk is therefore **the LLM sitting between two things that already ship**
- a single-object rewrite and a fan-out. Design it as that composition and most
of section 3 and 5's invention disappears. The real safety argument is not
"the first destructive write" but "the first destructive write whose CONTENT
nobody typed", which points at different mitigations: diff review and per-object
opt-out, not a novel tier.

**G3. FIXED AND SHIPPED AHEAD OF THIS CHUNK - see REGRESSION entry 335.**
`revisePageWithAiAction` still carried the catastrophic unanchored fence regex
`llm-fence.ts` exists to prevent, in a file that already imported the fix. It is
the only function in the repo whose output is written back over a live page
body. Converted to a new `unwrapHtmlDocumentFence` (a bare swap to
`unwrapDocumentFence` would have written a literal "```html" line into the page,
since that pattern does not accept the html tag). Any reuse of that action here
inherits the fix.

**G4. THE IDEMPOTENCY RULE CANNOT BE IMPLEMENTED AS WRITTEN, BECAUSE THE VALUE
SENT IS NOT THE VALUE STORED AND NOT THE VALUE RETURNED.** Three transforms sit
between them: this app's own `descriptionToHtml` (`gradables.ts:5`, applied on
every write - plain text is escaped and newlines become `<br>`); Canvas's
`sanitize_field ..., CanvasSanitize::SANITIZE` on pages, assignments and
discussions, which re-serializes through a parser so attribute order, quoting
and entity encoding are normalized even when nothing is removed; and
`Api#api_user_content` on read, which rewrites file and media links and
verifiers. A raw string comparison mismatches forever and re-issues every write
on every apply - and for pages **each redundant write creates another revision,
polluting the one native undo path G1 identified.** Compare a normalized form,
or compare against the value this app last wrote. Blocking sub-issue:
`updateGradable` returns `Promise<void>` (`gradables.ts:48`) and discards
Canvas's response, so any read-back needs that signature changed too.

**G5. THE WORST CONCRETE BUG IN THE DESIGN: A PAGE TITLE REWRITE ON RETRY
SILENTLY CREATES A DUPLICATE PAGE.** `wiki_page.rb` declares
`acts_as_url :title, sync_url: true`, so changing the title changes the slug -
this repo already knows it (`pages.ts:39`). Module items address pages BY SLUG
(`CanvasModuleItem.pageUrl` is `raw.page_url`, `mappers.ts:15`). And
`PUT /courses/:id/pages/:url` is an UPSERT. So: apply, partial failure,
instructor clicks Apply again, and every page that succeeded the first time
gets a second page created under its old slug, carrying the rewritten body,
linked to nothing. **Address pages by numeric id / `page_id:<id>` on the write
path and re-read the tree after apply.** Also note old inbound links break:
historical slugs survive only behind the site-admin `permanent_page_links`
flag, which an institution cannot enable itself.

**G6. A BULK QUIZ DESCRIPTION REWRITE EMAILS THE WHOLE ROSTER BY DEFAULT, AND
THIS DOCUMENT NEVER MENTIONS NOTIFICATIONS.** Assignments, pages and discussions
are all silent on a description-only PUT (their notification policies require
`points_possible` to change, or the `notify_of_update` parameter that this app
never sends). **Quizzes are not:** `quizzes_api_controller.rb` documents
`quiz[notify_of_update]` as "Defaults to true." Ten quizzes rewritten in one
apply is ten "the quiz has changed" notifications to every student. Send
`quiz[notify_of_update]=false` explicitly (`gradables.ts:73` does not today), or
say in the proposal that students will be notified. This is the only side effect
of this feature that reaches people outside the instructor's browser.

**G7. THE TIER IS WRONG, AND THE "IT FOLLOWS AUTOMATICALLY" CLAIM REPEATS A
DEFECT REGRESSION ENTRY 331 ALREADY PAID FOR.** Never-collapse and the
consequence tag do NOT follow automatically: `groupTier` reduces over
controls whose `visible(facts)` is TRUE (`bulkBarGroups.ts:406`), so an Apply
button living inside a proposal modal is invisible to that reduction - the
group stays `read-only`, stays collapsible, and invariant I5 stops requiring a
`consequenceTag`, so the audit then asserts in perpetuity that the most
destructive path in the bar is safe. This chunk needs its own
`commandProposalOpen` fact and `visible: (f) => f.commandProposalOpen`, exactly
as `carryApplyButton` does (`bulkBarGroupCatalog.ts:510`).
**And `destructive` is the wrong tier by the shipped model's own definition**
(`bulkBarGroups.ts:128`: reserved for the four writes that already carry a
two-click confirm-arm). The nearest analogue - `carryApplyButton`, an LLM-driven
multi-object write behind a review modal - is `fan-out-write`, which already
gives never-collapses plus a mandatory tag. Declare `fan-out-write` and arm it
separately; arming and tier are independent.

**G8. "REUSE `planBulkModuleCreation`" IS A SHAPE MISMATCH - THE RULE SURVIVES,
THE FUNCTION DOES NOT.** Its signature is `(existing, count, template, startAt)`
and it expands a `{x}` template over a CONTIGUOUS NUMERIC RANGE. It cannot
express "create a module called Ethics in AI and one called Final Project
Workshop", which is what a free-text command produces. What IS reusable is the
rule: a `Map` keyed on `name.trim().toLowerCase()` over existing modules,
marking a match `already-present` (`steps.lms-modules.ts:92`). Same one level
down: `composeModuleTitle(topic, week)` REQUIRES a week number, and a module
invented by a command has none - so either the command yields a week per created
module and the proposal shows it, or titles pass through un-composed and this
document says so.

**G9. "REUSE `ModuleContentResult` / `describeOrphans`" IS CONTRADICTED BY TWO
SHIPPED FILE HEADERS THAT ALREADY SETTLED THIS.** `module-pattern-plan.ts:52`
records that those describe what happened AFTER Canvas was called, while a
proposal is a recommendation BEFORE it was touched - collapsing them hides the
distinction this document wants preserved. And `carry-module-pattern.ts:117`
records that `describeOrphans` CANNOT be imported by an action at all: it lives
in a `"use client"` hook under `content-tab/`, and a `"use server"` file may
export only async functions so it cannot be restated locally either. Accurate
instruction: apply-time outcomes reuse `ModuleContentResult`
(`moduleContentActions.ts:58`); orphan formatting reuses `describeOrphans` FROM
THE CLIENT HOOK; the proposal gets its own vocabulary.

**G10. AC9 AND AC3b CANNOT BOTH BE TRUE AS WRITTEN, AND RESOLVING IT IS WHERE
THE REAL SAFETY LIVES.** If nothing parses the instructor's box, then the only
thing that can classify a request as UNSUPPORTED is the model - which would mean
the model both decides what it may do and self-reports its own violations. The
resolution: **the classifier is a pure allowlist over the MODEL'S STRUCTURED
OUTPUT, not over the instructor's text.** Every proposal row names a target
object and a field; any row naming a field outside
`{title, description|body, moduleName}` is rejected by code before it reaches
the proposal, and the request is surfaced as UNSUPPORTED. AC9 stays intact (the
free text is still never parsed), section 7 gets something genuinely testable,
and the guarantee becomes structural instead of a promise the model makes about
itself.

**G11. A NEW QUIZ IN THE SELECTION HITS THE WRONG ENDPOINT AND THE MODULE TREE
CANNOT TELL.** `isNewQuiz` lives on `BulkItem` (`types.ts:164`), which comes
from the course-level reader; `CanvasModuleItem` has no such field, and the
Modules view is this chunk's only selection source. So `getGradable(url,
"Quiz", contentId)` would address an assignment id against `/quizzes/`. Either
refuse New Quizzes with a named reason (the `rubric-bulk.ts` precedent) or
resolve the flag with one course-level fetch as `resolveNewQuizFlags`
(`rubric-bulk.ts:357`) does - but do not leave it undecided. Related: section 3
names four types while a module holds eight; a selection containing a File,
ExternalUrl, ExternalTool or SubHeader currently falls through to nothing.
`isCarryWriteSupportedKind` (`module-pattern-plan.ts:346`) already exists as
the pure "what can this app write" predicate.

**G12. THE PARTIAL FAN-OUT HAS A SPECIFIC MECHANISM HERE, AND IT IS NOT
NAMED.** `src/app/page.tsx` sets no `maxDuration` and Next honours it only at
the page level (`lms-generation.ts:270` says so, and routes deck generation to a
Route Handler for exactly this reason), so a server action looping N objects x
(one model call + one Canvas write) dies mid-loop on the platform default.
`callLlm`'s retry ladder alone can burn ~9s per call, and Canvas throttles on a
per-token leaky bucket that returns **403** with "Rate Limit Exceeded" at
roughly twelve concurrent requests. **Adopt the shipped precedent:**
`bulkSetDescription` (`useBulkItemActions.ts:743`) fans out FROM THE BROWSER,
one server-action invocation per item. Drive that from the proposal's row list
and mark each row as it lands - which turns "rewrote 6 of 10 then crashed" into
a RENDERED state rather than a lost one, and makes re-apply mean "the four that
did not land."

**G13. THE PROPOSAL AS SPECIFIED IS NOT REVIEWABLE.** "What it is now, what it
would become" is a review for a title and two 4KB HTML blobs side by side for a
description, ten times over - nobody reads that, and a plausible-but-wrong
rewrite passes straight through. There is no diff renderer anywhere in this
repo. Require instead: (a) a **per-object opt-out checkbox**, which entry 331
point 4 established as the affordance that makes a proposal load-bearing rather
than a courtesy; (b) the preview must show **the exact bytes that will be sent**
- after `descriptionToHtml` - or it is provably not what gets written. Note the
existing preview idiom is `dangerouslySetInnerHTML`
(`AssignmentPreviewModal.tsx:95`), which shows what the HTML LOOKS like and
therefore hides exactly the markup differences CanvasSanitize will act on.

**G14. THE PROPOSAL GOES STALE AGAINST THE SELECTION AND THE SHIPPED ANSWER DOES
NOT TRANSFER.** `confirmArming.ts:20` invalidates a stale arm by construction,
and `useCarryModulePattern` re-derives its plan via `useMemo` so a changed
selection changes the plan. Neither works here: this proposal contains MODEL
OUTPUT keyed to specific object ids and cannot be re-derived without a new model
call. Decide explicitly: pin the proposal to a `selectionSignature` at
generation time and either refuse to apply when it no longer matches, or apply
only to the intersection and say which rows were dropped. Silently applying a
proposal built for a different selection is the failure mode with no precedent
to fall back on.

**G15. STALE FACTS.** `ModulesView.tsx` lives at
`src/app/components/content-tab/`, not `modules/`, and measures **751 lines**
(re-measured 2026-08-24), not 998 - so the "MUST be split before this chunk
touches it" instruction is unnecessary. This is the SECOND document to carry
that number wrong (F8 corrects the same mistake). "The thirteen item-level bulk
actions" is wrong twice: there are **six** item-gated groups, and the union is
fifteen groups now. AC2's "this exposes an existing asymmetry" reaches the right
answer for the wrong reason - three non-head groups (`download`, `askAi`,
`visualizerCoverage`) already declare
`visible: (f) => f.moduleCount > 0 || f.itemCount > 0`, so it is established
precedent, not a new asymmetry. AC8's persistence requirement contradicts its
own neighbours: every free-text compose field in this bar is `persistKey: null`
with `COMPOSE_FIELD_UNPERSISTED` ("carrying it across a reload risks silently
reapplying old text to a different selection") - a reason that is STRONGER here,
because here the reapplication reaches Canvas. AC7's second button is specified
against chunk E's AC12a-g, which **has not landed**; the group ships with one
button until it does.

**G16. WHAT IS CORRECT AND MUST NOT BE RE-LITIGATED.** The draft/review/commit
rule; "the box is never parsed" (subject to G10's clarification of what the
classifier operates on); section 7's testing reality, which matches
`vitest.config.ts` exactly; every read/write capability claim in section 3, all
of which exist. And one fear that is broader than the facts: **rewriting a
description does not disturb submissions or grades.** An assignment's
submission-touching callbacks are gated on `points_possible`, `grading_type`,
`grading_standard_id`, `workflow_state`, `assignment_group_id` and `due_at` -
`description` appears in none. For classic quizzes,
`changed_significantly_since?` flips submissions to `pending_review` only when
points, question count or question ids change.

**G17. THE THREE HIGHEST-RISK UNKNOWNS, EACH WITH ITS EXPERIMENT. ALL THREE NEED
A LIVE CANVAS AND CANNOT BE RUN FROM THE DEV ENVIRONMENT** - they are the
repo owner's to run, and each has a stated safe default so implementation is not
blocked on them.

1. **Does the Modules view show the new title after a content-object rename?**
   The tree renders the `ContentTag`'s title (`mappers.ts:10`), not the
   assignment's, and there is a SEPARATE write path for it
   (`module_item[title]`, `module-items.ts:47`). If Canvas does not sync the
   tag, the instructor applies a rename, the proposal says it succeeded, and the
   list still shows the old name - this repo's recurring "shipped but looks
   absent" failure, on its highest-consequence feature. *Experiment:* rename one
   assignment via `PUT /assignments/:id`, then `GET /modules/:id/items` and read
   `title`. Five minutes with curl. *Safe default until answered:* write both.
2. **What does the page write path do on a retry after a title change?** G5 is a
   chain of three verified facts whose COMBINATION was inferred, not observed.
   *Experiment:* create a scratch page, PUT a new title, then PUT again to the
   OLD slug; if a second page appears, G5 is confirmed. Fifteen minutes on a
   sandbox course. *Safe default until answered:* address pages by id anyway.
3. **Does the AssignmentFreezer plugin block description writes here?**
   `description` is on the freezable list and only account admins can change a
   frozen attribute; Blueprint-derived assignments are the common case.
   *Experiment:* `GET /assignments/:id` and check whether `frozen_attributes` is
   present and non-empty. If absent, the plugin is off and the risk is zero.
   *Safe default until answered:* treat a write refusal as a named per-row
   failure rather than a crash.
