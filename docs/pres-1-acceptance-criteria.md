# PRES-1 acceptance criteria

- Item: PRES-1, area `presentations-authoring`, kind feature, state unscoped.
- Source: owner request 2026-09-29, made TOP PRIORITY in the same message
  (`docs/backlog.yml:1075-1086`).
- Seat: `loop-ac` (Opus). A fresh `loop-checker` gates this document before any
  later seat consumes it.
- This is the AC round only. No mechanism, no wave plan, no oracle, no code. The
  architect owns shape and the reachability ladder; the test seat owns oracle
  and sabotage; the plan owns wave ordering. Where this document names a code
  location it is to make a criterion satisfiable, never to design the build.

## The owner's words (quoted, from `docs/backlog.yml:1079`)

> "A new Tools sub-tab 'Presentations' with one child tab for now, 'Slide Deck
> Creation'. The instructor pastes files/text as context for an upcoming week's
> lesson (homework, chapter objectives, lesson plan copied from the LMS), then
> gets back ANY COMBINATION of: (a) a lecture outline; (b) 3-5 ideas for a
> simple hands-on lecture activity students can follow along with; (c) a slide
> deck whose contents deal with those concepts; and (d) adversarially reviewed
> comments/critiques for EACH thing produced. The slide deck must be VISIBLE
> and DOWNLOADABLE on the page, with a REGENERATE-WITH-CONTEXT button. Intended
> flow: paste the week's materials, get a slide outline plus adversarial review
> comments, regenerate the plan from those comments, then do the same for the
> deck."

Where any criterion below and this sentence diverge, the sentence wins.

## Environment ceilings that bind every criterion

Measured facts, not assumptions (`docs/loop/this-repo.md` sections 2, 6):

- NO component is rendered by any test here (vitest is node-env,
  `include: ["src/**/*.test.ts"]`). Every claim about the tab appearing, the
  deck being rendered on screen, the download button working, or a click landing
  is a READING claim or an OWNER-VERIFICATION claim - never machine-checkable.
  Each such criterion says so.
- No API key. Every `callLlm` path is exercised only through mocks. The
  generation and adversarial-review LOGIC (selection, per-artifact routing,
  regenerate payload assembly, output shape) IS machine-checkable with a mocked
  `callLlm`; the QUALITY of any model output is owner-verification.
- In-house AI only is a hard standing rule (`AGENTS.md` memory
  `in-house-ai-only.md`): generation stays inside the app via the in-house LLM
  path; the instructor is never routed to an external tool.

## Leverage claim (one paragraph, one removal-test criterion)

PRES-1 earns the GUARANTEED class (`docs/loop/leverage.md:44`), compounding with
CORPUS (`:37`). The earned mechanism is the built-in adversarial-review loop
made structural: each produced content artifact carries its OWN attached
critique by construction, and the REGENERATE-WITH-CONTEXT action folds the prior
pasted context AND the prior critique for that artifact into the next model
request by code, not by the human re-pasting. In a plain LLM chat the human IS
the transport for that loop - they must copy the critique back into the next
prompt themselves, and nothing in the transcript guarantees they did, or that
the regeneration answered the critique rather than drifting. Here the code holds
that record regardless of what the model returns. CORPUS compounds it: the
pasted per-week context persists across reload (AC-8) and is read back by the
regenerate act. This is not the thin `AskAiModal` shape
(`docs/loop/leverage.md:100-130`); the mechanism is real and checkable. The
class call is the human's to confirm, not this seat's to finalize.

- **LEV-1 (removal test, owned by the test seat).**
  - Object under comparison: the request object passed to `callLlm` on a
    regenerate-with-context of a given artifact, versus that same request with
    the fold-in of prior context + prior critique removed.
  - Instrument: a pure unit test with `callLlm` mocked to capture its request
    argument; assert the captured request contains BOTH the prior pasted context
    and the prior adversarial critique for the artifact being regenerated.
  - Direction of failure: RED when the line that folds the prior context, OR the
    line that folds the prior critique, is deleted (regenerate then starts from
    an empty or context-only prompt). It must fail on REMOVAL of the fold-in, not
    only on unrelated breakage. A regenerate that silently drops the critique and
    still returns text must turn this RED.
  - Named to the test seat because construction of the oracle is theirs
    (`docs/loop/seats.md:59`).

## Numbered acceptance criteria

Each criterion names object / instrument / direction of failure, and its class:
[MACHINE] pure or mocked-`callLlm` testable; [READING] verified by reading source
only; [OWNER] verified only by the owner in the deployed app.

### AC-1 - The "Presentations" Tools sub-tab exists and reuses the inner-nav mechanism [READING + OWNER]
- Owner's words: "A new Tools sub-tab 'Presentations'".
- Object: the Tools-tab rail (the manualView chips - `manual-rail.ts:144`
  "the first seven chips of the Tools tab's single rail") gains one new member
  whose visible label is "Presentations", reusing the existing `ManualViewType`
  construction (`manual-rail.ts:14-21`, `MANUAL_VIEW_ORDER:154-162`,
  `MANUAL_VIEW_LABELS:164-172`, `isManualViewType` built FROM the order list at
  `:180-184`), NOT a newly invented navigation mechanism.
- Instrument: [READING] a source-text/structure test in the manual-rail family
  (siblings: `manual-rail.test.ts`, `tab-rails.test.ts`, `url-state.test.ts`)
  asserting the new member is present in `MANUAL_VIEW_ORDER`, accepted by
  `isManualViewType`, and carries the label "Presentations" in
  `MANUAL_VIEW_LABELS`. [OWNER] the owner opens the Tools tab and sees a
  "Presentations" chip, and it survives a reload (the reachability ladder in
  `docs/loop/traps-spec.md:58-64` - a sub-tab needs the launch-view union, the
  runtime validator array, the recView union, the `||` restore ladder, and the
  tab-strip literal; omitting the ladder leaves a structure test green while the
  view reverts to default on reload).
- Direction of failure: FAILS if `isManualViewType("<the new id>")` is false;
  FAILS if a bespoke nav container is introduced instead of a new
  `ManualViewType` member; FAILS (owner) if the chip is absent, or if it appears
  but the view reverts to the default on reload.
- Note: the architect chooses the internal id string; this criterion binds to
  the visible LABEL and the reuse of the existing union, so it does not
  pre-empt that naming.

### AC-2 - "Slide Deck Creation" child tab, under an extensible inner nav [READING + OWNER]
- Owner's words: "with one child tab for now, 'Slide Deck Creation'" and
  (`docs/backlog.yml:1085`, requirement 2) "built so more children can be added
  later".
- Object: the "Presentations" view is an INNER-NAV view (like `grading` and
  `content` - `InnerNavViewType` / `INNER_NAV` at `manual-rail.ts:192-198`,
  `getInnerDestinations` at `:212-216`), whose inner destinations are an ARRAY
  holding a destination labelled "Slide Deck Creation" - not a single hardcoded
  mount of the kind used by `version-control` / `recording` / `ppt-design`
  (single-destination views, `manual-rail.ts:96-118`), which cannot take a
  sibling without restructuring.
- Instrument: [READING] a manual-rail-family test asserting
  `getInnerDestinations` for the new view returns a non-null list containing a
  destination labelled "Slide Deck Creation", and that `INNER_NAV` names the
  view (so it has an aria-labelled inner tablist). [OWNER] the owner sees a
  child tab strip under Presentations with "Slide Deck Creation" on it.
- Direction of failure: FAILS if the child is wired as a single non-list mount
  (foreclosing future siblings, violating "built so more children can be
  added"); FAILS if `getInnerDestinations` returns null for the view; FAILS if
  no "Slide Deck Creation" destination label is present.

### AC-3 - Context intake accepts files AND text, in-house only [READING + MACHINE + OWNER]
- Owner's words: "The instructor pastes files/text as context" +
  (`docs/backlog.yml:1085`, requirement 3) "accepting files AND text ... in-house
  AI only ... never send the instructor to an external tool".
- Object: the Slide Deck Creation surface offers TWO intake affordances - typed
  or pasted TEXT, and uploaded or pasted FILES - both reaching the generation
  path; and the generation path calls only the in-house LLM path.
- Instrument: [READING] the intake surface exposes both a text field and a file
  intake (reuse an existing idiom - see reuse notes: `deck-source.ts` extract
  actions, `ta-ppt-source-*` intake, TextbookPhotoModal paste/drop/upload).
  [MACHINE] an import/source-text test that the Presentations action or route
  imports only the in-house generation path (`callLlm` / the in-house deck
  generator) and introduces no egress to a non-in-house generation endpoint and
  no link that sends the instructor to an external tool. [OWNER] the owner
  pastes text, attaches a file, and both are accepted and reach generation.
- Direction of failure: FAILS if only text OR only files is accepted; FAILS
  [MACHINE] if any code on the path issues generation egress to an external
  service or renders an out-link to an external authoring tool; FAILS (owner) if
  an attached file is silently ignored at generation time.

### AC-4 - Four independently-selectable artifacts; any combination, not all-or-nothing [MACHINE + OWNER]
- Owner's words: "get back ANY COMBINATION of: (a) a lecture outline; (b) 3-5
  ideas for a simple hands-on lecture activity ...; (c) a slide deck ...; and
  (d) adversarially reviewed comments/critiques for EACH thing produced" +
  (requirement 4) "the instructor chooses which, they are not all-or-nothing".
- Object: the generation orchestration takes a SELECTION over the four artifact
  kinds and produces exactly the selected subset - no more, no fewer.
- Instrument: [MACHINE] a pure/mocked-`callLlm` unit test over the orchestrator:
  for a representative set of selections (at minimum: outline-only; deck-only;
  outline+deck; all four), the returned output contains exactly the selected
  content artifacts, and no model call is issued for a deselected artifact
  (asserted via the `callLlm` mock's call record). Because there are 4 kinds,
  the pass condition must range over more than one selection - a single "all
  selected" case passes trivially and proves nothing (the partial-fix trap,
  `docs/loop/traps-spec.md:98-106`). [OWNER] the owner deselects an artifact and
  confirms it is not produced.
- Direction of failure: FAILS if selecting a proper subset still generates all
  (all-or-nothing); FAILS if a selected artifact is missing from the output;
  FAILS if a deselected artifact is produced or triggers a model call.
- Reconciliation of the owner's (b) "3-5 ideas": the SHAPE constraint (the
  activities artifact is a small list and its prompt asks for 3-5 ideas) is
  [MACHINE] on the request/parse shape; whether a real run returns exactly 3-5
  useful ideas is [OWNER] (no API key here). See residual R-3. Do not write a
  criterion that asserts a model returns exactly N items from a mocked call -
  that would be unsatisfiable-by-construction here.

### AC-5 - Adversarial review is a first-class PER-artifact output [MACHINE + OWNER]
- Owner's words: "adversarially reviewed comments/critiques for EACH thing
  produced" + (requirement 5) "critiques/comments attached to each of the
  outline, activities, deck".
- Object: when the adversarial-review artifact (d) is produced, the output maps
  EACH produced content artifact (whichever of outline / activities / deck were
  selected) to its OWN critique - not a single undifferentiated review blob, and
  not a critique for an artifact that was not produced.
- Instrument: [MACHINE] a pure/mocked-`callLlm` unit test: generating
  outline+deck with review on yields a critique keyed to the outline AND a
  critique keyed to the deck, and NO critique keyed to activities (not
  produced). The per-artifact keying must be a structural property of the output
  type (each artifact carries or is joined to its critique), not a positional
  guess. [OWNER] the owner sees each produced item shown with its own critique.
- Direction of failure: FAILS if review is a single blob not attributable
  per-artifact; FAILS if a produced-and-reviewed artifact has no attached
  critique; FAILS if a critique is produced for a non-produced artifact.
- Reconciliation: the owner lists review both as selectable artifact (d) and as
  "for EACH thing produced". Read together: review is selectable, and WHEN
  selected it critiques each other produced artifact. This criterion binds to
  that reading; if the architect finds a cleaner shape it must still satisfy the
  per-artifact keying and the "not for non-produced artifacts" clause (both
  clauses enforced - the two-clause trap, `docs/loop/seats.md:98-102`).

### AC-6 - The slide deck is VISIBLE (rendered on the page) AND DOWNLOADABLE [OWNER + MACHINE]
- Owner's words: "The slide deck must be VISIBLE and DOWNLOADABLE on the page".
- Object: a generated deck is BOTH (a) rendered on the page as viewable slides
  the human can see, AND (b) obtainable as a downloaded file.
- Instrument: [OWNER] "visible/rendered" is verified ONLY by the owner opening
  the tab, generating a deck, and SEEING slides drawn on screen. This criterion
  explicitly forbids satisfying "visible" with an invisible enforcer (e.g. a
  `data-` attribute or a hidden node) - that is the exact failure this seat has
  paid for (`.claude/agents/loop-ac.md:27-28`). [MACHINE] the DOWNLOAD path's
  serializer is a pure function: given a deck structure it returns a non-empty
  byte payload of the declared MIME type (reuse `URL.createObjectURL` client
  idiom at `ppt-design/index.tsx:554`, and/or `savePresentationFileAction`
  `media.ts:590`). A logic test asserts non-empty output of the declared format
  for a non-empty deck. [OWNER] the owner clicks download and gets a file that
  opens.
- Direction of failure: FAILS (owner) if the deck is downloadable but NOTHING is
  rendered on the page (owner sees no slides); FAILS (owner) if slides render but
  no working download exists; FAILS [MACHINE] if the serializer returns empty /
  zero-byte / wrong-MIME output for a non-empty deck.
- FORK: the deck FORMAT (pptx via existing `buildSlidesPptx`, versus in-page
  HTML/reveal, versus PDF) decides HOW "visible AND downloadable" is satisfied,
  because pptx is downloadable but needs an added in-page renderer to be
  "visible", whereas HTML renders in-page natively. OWNER RESOLVED 2026-09-29 (R-1): the format is .pptx via the shipped builder, so DOWNLOADABLE is a
  .pptx serializer test and VISIBLE is an on-page slide PREVIEW the architect designs (a .pptx does
  not render inline by itself). This criterion
  does not pick the format; it binds to the conjunction the owner stated.

### AC-7 - REGENERATE-WITH-CONTEXT re-runs an artifact carrying prior context and prior critique [MACHINE + OWNER]
- Owner's words: "with a REGENERATE-WITH-CONTEXT button ... regenerate the plan
  from those comments, then do the same for the deck" + (requirement 7) "re-runs
  a given artifact carrying the prior context (and, per the flow, the prior
  adversarial comments)".
- Object: the regenerate action for a chosen artifact builds its model request
  from the prior pasted context PLUS the prior adversarial critique for that
  artifact.
- Instrument: [MACHINE] the same mocked-`callLlm` request-capture as LEV-1: on
  regenerate, the captured request includes both the prior context and the prior
  critique for the artifact. [OWNER] the owner regenerates and sees output that
  reflects the prior critique.
- Direction of failure: FAILS if regenerate discards the prior context (starts
  fresh); FAILS if regenerate omits the prior critique; the failure direction
  must be RED-on-absence (removing the fold-in fails it), never a direction that
  rewards discarding the critique (`.claude/agents/loop-ac.md:36-37`).

### AC-8 - Pasted context and control state persist across reloads via `ta-` keys [READING + OWNER]
- Standing rule (`AGENTS.md` memory `persist-ui-control-state.md`): every new
  textbox/select/checkbox persists across reloads via localStorage `ta-` keys.
- Object: the pasted context (text and the file-intake receipt) and the
  artifact-selection control state persist across a reload under `ta-` keys.
- Instrument: [READING] a source-text test that the new intake and selection
  state use `useLocalStorageState` with `ta-` keys (the house idiom, e.g.
  `ppt-design/hooks.ts:73,118,122,195`), and that any `ta-`-seeded initial value
  is applied through a mount effect, not only a `useState` initializer
  (`AGENTS.md` memory `persisted-details-open-hydration.md` - a
  localStorage-seeded initializer never shows on reload). [OWNER] the owner
  pastes context, reloads, and it is still present.
- Direction of failure: FAILS if any new intake/selection control is plain
  `useState` with no `ta-` key; FAILS (owner) if a value is gone after reload;
  FAILS if a `ta-`-seeded value is set only in an initializer and so does not
  survive a reload's hydration.

## Forks the architect/owner must settle (NOT decided here)

Both are recorded as residuals (R-1, R-2). They are FORKS: this seat recommends a
reading and does not choose, per `docs/loop/leverage.md:113` and the never-default
rule.

- **R-1 deck FORMAT** decides AC-6's "visible AND downloadable". Recommended
  reading (not a decision): in-page HTML/reveal-style slides render natively in
  the page (satisfying VISIBLE cheaply) and are downloadable as a self-contained
  file; pptx via the shipped `buildSlidesPptx` (`src/lib/pptx.ts`) is
  download-native but needs an added on-page renderer to be VISIBLE. The owner's
  conjunction ("VISIBLE and DOWNLOADABLE on the page") slightly favors an in-page
  render, but the shipped pptx pipeline is real reuse. The architect prices both;
  the owner picks.
- **R-2 relationship to the existing `ppt-design` "PowerPoint Design" tab AND to
  A43.** MEASURED, not assumed: a Tools sub-tab that creates slide decks ALREADY
  EXISTS - `ppt-design` (`ManualViewType` member at `manual-rail.ts:19`, label
  "PowerPoint Design" / description "Create presentation slides" at `:110`,
  mounted in `page.tsx:601-603` as `PowerPointDesignTab`), backed by
  `src/app/components/ppt-design/` and `src/lib/decks/` (generate, presets,
  types, sequence, fit-report, office-template-fill - all present) plus
  `src/lib/pptx.ts`. A43 (`deck-generation-from-source`,
  `docs/backlog.yml:727-738`) has shipped waves S, T1, T2 (deck from a source /
  uploaded template, with a fit/refusal report). So A43 infra EXISTS; it is not
  unbuilt. PRES-1's differences from both: it works from PASTED lesson context
  with no template required, produces FOUR artifacts (outline / activities /
  deck / per-artifact adversarial review), and has the regenerate-with-critique
  loop. Recommended reading (not a decision): REUSE `src/lib/decks/*`,
  `src/lib/pptx.ts`, the `deck-source` extract actions, the download idioms, and
  the `ta-ppt-*` intake pattern rather than reinventing them; and treat
  "Presentations" as a NEW inner-nav sibling tab (the owner named a new tab), NOT
  a silent replacement of `ppt-design` - but whether PRES-1 eventually subsumes
  or absorbs `ppt-design`/A43 is the owner's call. Do not merge silently.

## Reuse notes (vetted, file:line - for the architect, not a design)

Opened and confirmed during this AC round; the architect owns the survey.

- Inner-nav / sub-tab mechanism: `src/app/components/manual/manual-rail.ts` -
  `ManualViewType` (`:14-21`), `MANUAL_VIEW_ORDER` (`:154-162`),
  `MANUAL_VIEW_LABELS` (`:164-172`), `isManualViewType` from the order list
  (`:180-184`), `destinations` groups (`:75-130`), `InnerNavViewType`/`INNER_NAV`
  (`:192-198`), `getInnerDestinations` (`:212-216`), `getInnerNavAriaLabel`
  (`:222-225`). Grading (`GradingView` at `:43`) is the worked precedent for an
  inner-nav view with multiple children. Mounted per-view in `src/app/page.tsx`
  (the `ppt-design` branch at `:601-603`).
- In-house LLM path: `src/lib/llm.ts` - `callLlm` (`:375`, always routes to
  Gemini), `LlmRequest` (`:48`). Generation/review logic is unit-testable with
  `callLlm` mocked; the network is blocked under vitest.
- Existing deck generation to reuse: `src/lib/decks/generate.ts`
  (`generateDeckFromTemplate`), `src/lib/decks/{presets,types,sequence,
  fit-report,office-template-fill}.ts`, `src/lib/pptx.ts` (`buildSlidesPptx`),
  and the deck route `src/app/api/lms-generation/deck/route.ts` (a Route Handler
  with `maxDuration` because deck gen fans out several sequential LLM calls -
  relevant to reliability, not to AC).
- Context intake idioms: `src/app/actions/deck-source.ts`
  (`extractDeckSourceFileAction`, `extractDeckSourceRepoAction`), the
  `ppt-design` source intake (`ta-ppt-source-receipt` / `ta-ppt-source-materials`,
  `ppt-design/hooks.ts:118,122`), and TextbookPhotoModal paste/drop/upload
  (per the brief; not re-opened this round).
- Downloadable artifact: client download via `URL.createObjectURL(blob)` at
  `src/app/components/ppt-design/index.tsx:554`; persist-to-Files via
  `savePresentationFileAction` (`src/app/actions/media.ts:590`) which delegates
  to `saveRecordingFile` (`src/lib/recording-files.ts`).
- Persistence idiom: `useLocalStorageState("ta-...")` (`ppt-design/hooks.ts`,
  multiple keys).

## Residual register

Each residual carries owner, instrument, and the step that will measure it. A
residual missing any of the three is a deletion. **These residuals must be filed
as rows in `docs/BACKLOG.md` by the orchestrator** (this seat does not write the
backlog under concurrency); until then they exist only in this document, which
`iteration-caps.md` counts as not yet real.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | RESOLVED by owner 2026-09-29: DECK FORMAT = .pptx (reuse the shipped src/lib/pptx.ts buildSlidesPptx). Download is native .pptx. IMPLICATION for AC-6: "visible on the page" is met by an ON-PAGE PREVIEW of the slides (thumbnails / rendered preview), which the architect must design (a .pptx is not natively viewable inline). A .pptx cannot render itself in the DOM, so the preview is a distinct build item, not free. | Architect (design the on-page preview + wire buildSlidesPptx) | AC-6 machine test on the serializer + owner-verify the preview | Architect pass |
| R-2 | RESOLVED by owner 2026-09-29: NEW SIBLING TAB, REUSE INFRA. Presentations is a new Tools inner-nav sibling; reuse the decks/ + pptx.ts libraries, deck-source extract actions, the download idioms, and the ta-ppt-* intake under the hood. Leave the existing ppt-design "PowerPoint Design" tab UNTOUCHED (no subsume, no replace this round). | Architect (reuse-not-rebuild) | Reuse survey already in this AC + the architect pass | Architect pass |
| R-3 | Whether a real run returns 3-5 useful activity ideas and on-topic deck content (model QUALITY) | Owner | Run the deployed feature (no API key here) | Post-deploy owner verification |
| R-4 | Tab reachability, child-tab appearance, deck RENDERED-on-page visibility, working download button (nothing renders under vitest) | Owner | Open Tools > Presentations > Slide Deck Creation in prod; generate; see slides; download | Post-deploy owner verification |
| R-5 | Whether the adversarial critique is genuinely adversarial/useful per artifact (QUALITY, not structure) | Owner | Read the critiques on a real run | Post-deploy owner verification |
| R-6 | LEV-1 removal test construction (the leverage oracle) | Test seat | Mocked-`callLlm` request-capture oracle | Test seat, after Build and Verify (`docs/loop/seats.md:59`) |

## Disposition table

Not applicable: this is the first AC version for PRES-1; no prior criteria were
restructured, so there is nothing to map to kept / handed-over / withdrawn.

## Out of scope for this document (routed, per `docs/loop/seats.md:77-84`)

- Mechanism (how the tab is wired, the five-edit reachability ladder, the
  generation pipeline shape) -> architect.
- Wave ordering and write-set disjointness -> plan.
- Oracle, fixtures, sabotage, the LEV-1 removal test construction -> test seat.
- Reliability of the multi-call deck route (timeout against the 60s Hobby cap),
  security of pasted-file intake reaching a prompt, admin/persistence of any new
  stored artifact -> the wave-2 design seats.
