# PRES-1 test notes and frozen oracles (round 1)

- Item: PRES-1, area `presentations-authoring`, kind feature.
- Seat: `loop-test-author` (Opus). A fresh `loop-checker` gates this document
  before any implementer writes a single test from it.
- Consumes, and binds to as the ANCHOR for shape: `docs/pres-1-architecture.md`
  (the route-handler seam B1, the single-artifact executors, `validateDeck` B2,
  `selectedContentKinds`, `ProducedArtifact`, `buildRegeneratePrompt`, the
  3-file reachability ladder, the three waves). Also consumes
  `docs/pres-1-acceptance-criteria.md` (AC-1..AC-8, LEV-1), `docs/pres-1-security.md`
  (SEC-1/2/3, R-SEC-*), `docs/pres-1-sre.md` (pass conditions 1a/2a/2b/3a/3b/4a/4b/4c/5a),
  `docs/pres-1-data.md` (the state shapes, the `ta-pres-*` keys).
- Produces: the oracle for every MACHINE-testable requirement across the three
  waves, each as object / instrument / direction, with a NAMED discriminating
  sabotage; the frozen oracles stated as constructions; the attack-my-own-guard
  log; the executable-versus-argued split; the owner-verification walk; the
  residual register.
- Does NOT produce: production code, test code, mechanism, or wave ordering.
  This is notes-only, per the dispatch. Every `file:line` below was opened this
  round; every quantity names the command that produced it.

Where the architecture and another design doc diverge on SHAPE, the
architecture wins (it is the named anchor). One such divergence is called out
explicitly in W1-T4 (the critique model): the data pass's keyed-map
(`docs/pres-1-data.md:194`) is superseded by the architecture's
discriminated-union `ProducedArtifact` (`docs/pres-1-architecture.md:282-285`),
because the union makes the AC-5 bad state unrepresentable and the map does not.

---

## 0. Environment ceilings that bind every oracle here

Measured facts (`docs/loop/this-repo.md` sections 2, 6), not assumptions:

- **NO component is rendered by any test in this repo.** vitest 4.1.9 is
  `environment: "node"`, `include: ["src/**/*.test.ts"]` (`.test.tsx` is not
  collected, `docs/loop/this-repo.md:110-112`). Every wave-3 MACHINE test below
  is a SOURCE-TEXT test that `readFileSync`s the `.tsx` and asserts on its text,
  or an executed test over a `.ts` leaf. The tab appearing, the child strip, the
  preview drawing slides, the download button firing, and the QUALITY of any
  model output are OWNER-verification (section 9), never machine-checkable.
- **No API key.** Every `callLlm` path is exercised only through mocks. The
  network is blocked: `vitest.setup.ts` throws on any real `fetch`
  (`docs/loop/this-repo.md:126-132`). **Mock `callLlm`, never `fetch`** - a live
  401 once made a sabotage check pass (`AGENTS.md` memory
  `tests-are-network-blocked.md`; `docs/loop/traps-tests.md:8-15`). PRES-1 never
  touches `canvasFetch`, so the only mock target on the generation path is
  `@/lib/llm`'s `callLlm`.
- **In-house AI only** is a hard standing rule; the egress oracle (W3-T3) is the
  machine enforcer of it, with the honesty caveat stated there.

---

## 1. Global test conventions (bind every test written from these notes)

1. **Mock `callLlm`, never `fetch`.** Use the exact idiom already shipped at
   `src/lib/decks/sequence.test.ts:6-9`:

   ```ts
   vi.mock("@/lib/llm", async () => {
     const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
     return { ...actual, callLlm: vi.fn() };
   });
   import { callLlm } from "@/lib/llm";
   ```

   Capture a request with `vi.mocked(callLlm).mock.calls[i][0]`
   (`sequence.test.ts:358-359`). Resolve a success with
   `{ ok: true, text }` and a failure with `{ ok: false, status, body }` -
   these are the two arms of `LlmResult` (`src/lib/llm.ts:200-202`), so the
   `as never` cast in `sequence.test.ts:43-46` is unnecessary if you build the
   full shape; either is acceptable. `beforeEach(() => vi.clearAllMocks())`
   (`sequence.test.ts:50-52`).
2. **Never import a helper from another `*.test.ts`.** Importing
   `classTrendsDraft.not-postable.test.ts`'s walker would re-run its `describe`
   blocks (`docs/loop/traps-tests.md:46-48`; `AGENTS.md`
   `no-cross-test-file-imports.md`). DUPLICATE the walker into the presentations
   egress test, exactly as that file itself was duplicated from
   `canvas-client-boundary.transitive.test.ts` (its own header, `:22-24`).
3. **No dotAll `/s` flag** in any regex the implementer writes: it passes vitest
   and FAILS tsc (TS1501) (`docs/loop/this-repo.md`; `AGENTS.md`
   `regex-s-flag-fails-tsc.md`). Match across newlines with `[\s\S]`, the form
   the reused parsers already use (`decks/generate.ts:136,149`).
4. **A gate that names two or more test files uses `npm run test:paths <p1> <p2>
   ...`**, never a raw multi-path `vitest`/`npm test`, which silently drops any
   unmatched argument (`docs/loop/this-repo.md:31-46`;
   `docs/loop/traps-tests.md:84-95`). A single path may use `npx vitest run
   <path>`. The concrete run commands are in section 6.4.
5. **Every source-text SLICE asserts its anchors resolve at BOTH ends** before
   asserting on the slice. `indexOf` returning `-1` plus `slice(start, end)`
   silently widens to nearly the whole file (`AGENTS.md`; the seat's own
   standing failure). Every slice test below states its two anchors and requires
   both `> -1` and `end > start`. This is why W2-T2 and W3-T5 spell the anchors
   out.
6. **Comment stripping**, where any test strips comments before scanning, is
   `.split(/\r?\n/)` plus an UNANCHORED `/\/\/.*$/` per line - the anchored
   `/^[ \t]*\/\/.*$/gm` form is trailing-comment-blind and has a defeat on
   record here (`AGENTS.md`). None of the oracles below REQUIRE comment
   stripping; if an implementer adds it to reduce false positives, it must be
   the unanchored form.

---

## 2. Satisfiability posture (honest, because notes cannot execute)

The elevated-seat obligation is to PROVE the red tests are satisfiable by
building a reference implementation and getting it green in an isolated tree
(`docs/loop/seats.md:438-446`). **This round is notes-only by the dispatch's
explicit constraint (no production code, no test code), so I did NOT build a
reference implementation this round.** I discharge the obligation instead by
reasoning each oracle's satisfiability from an ALREADY-SHIPPED, ALREADY-GREEN
template opened this round, and I name the template per oracle. Where a
requirement is RED-by-construction only because the feature does not exist yet
(not because it is contradictory), I label it RED-BY-CONSTRUCTION and name the
green sibling that proves the SAME assertion shape passes on a real
implementation. **The one thing I could not do this round is execute a throwaway
reference implementation; that is recorded as residual R-T1 with the test seat
as owner and "build the reference tree at Build time" as the step.** No oracle
below is contradictory or unsatisfiable-by-construction; each names why.

---

## 3. WAVE 1 - backend logic (`src/lib/presentations/*`), fully machine-verifiable

All wave-1 tests are executed unit tests over pure functions or mocked-`callLlm`
executors. Files: `types.ts` (type-only), `prompts.ts`, `parse.ts`,
`generate.ts`, `deck-file.ts` (`docs/pres-1-architecture.md:113-119`).

### W1-T1 - `selectedContentKinds` returns exactly the selected content kinds, in fixed order, `review` never a kind (AC-4)

- Object: the array returned by `selectedContentKinds(selection)`
  (`docs/pres-1-architecture.md:326`), over MULTIPLE selections.
- Instrument [MACHINE, pure, no `callLlm`]: a FROZEN-LITERAL expected-value
  table (section 6.1). For each row, assert `selectedContentKinds(input)` deep-
  equals the frozen literal list. The table ranges over at least
  {outline-only, activities-only, deck-only, outline+deck, all-three, none, and
  a case with `review:true` set while only one content kind is selected}.
- Direction of failure: RED if a proper-subset selection returns all kinds
  (all-or-nothing); RED if a selected kind is missing; RED if a deselected kind
  appears; RED if `review` ever appears in the output; RED if the order drifts
  from `["outline","activities","deck"]`.
- Discriminating sabotage: in `generate.ts`, change the filter so it ignores the
  `deck` flag and always includes `"deck"`. Expected: the `activities-only` and
  `outline-only` rows go RED (they now contain `"deck"`), the `all-three` row
  stays GREEN. Restore: all GREEN. DISCRIMINATES (a single "all-selected" case
  would not have caught it - that is why the table must range over subsets, the
  partial-fix trap `docs/loop/traps-spec.md:98-106`).
- Satisfiable by: `selectedContentKinds` is a `["outline","activities","deck"]`
  filter (`docs/pres-1-architecture.md:346-352`); the identical shape (a fixed
  list filtered to flags) is what `MANUAL_VIEW_ORDER`-derived helpers already
  do. Trivially satisfiable.
- ATTACK MY OWN GUARD: an oracle that built its expected list by filtering the
  same `CONTENT_KINDS` constant the function filters would be a TAUTOLOGY - it
  would pass on the sabotage above because both sides would drift together
  (`docs/loop/traps-tests.md:35-40`; `AGENTS.md` `refactor-disarms-tests.md`).
  The expected values in section 6.1 are therefore FROZEN LITERALS
  (`["outline","deck"]`, etc.), never `CONTENT_KINDS.filter(...)`.

### W1-T2 - `generateOneArtifact` issues exactly one `callLlm`, built from the passed context (AC-4 call-boundary, AC-3 in-house)

- Object: the `callLlm` call record and its request argument after
  `await generateOneArtifact(kind, context)`
  (`docs/pres-1-architecture.md:330-332`).
- Instrument [MACHINE, mocked `callLlm`]: mock `callLlm` to resolve a valid
  per-kind response. Assert `vi.mocked(callLlm).mock.calls.length === 1`
  (`sequence.test.ts:353` idiom) and that the captured request text
  (`mock.calls[0][0]`, walking `contents[].parts[].text`) contains a NONCE
  planted in `context.text` (e.g. `"CTXNONCE_A1"`). Run once per content kind
  (`outline`, `activities`, `deck`).
- Direction of failure: RED if the call count is not exactly 1 (an extra call
  is a budget/latency regression, SRE 2a); RED if the context nonce is absent
  from the request (the context did not reach the prompt).
- Discriminating sabotage: in `generateOneArtifact`, drop the `context` argument
  from the prompt builder call (build the prompt from a constant). Expected: the
  nonce assertion goes RED for all three kinds; call count stays 1 (so the
  count assertion stays GREEN - the nonce assertion is what discriminates).
  Restore: GREEN. DISCRIMINATES the context-drop; does NOT discriminate a
  wrong-provider bug (see W3-T3 for egress).
- Satisfiable by: `sequenceConcepts` is the shipped template that calls `callLlm`
  once and is asserted with `toHaveBeenCalledTimes(1)` plus a `mock.calls[0][0]`
  request-shape assertion (`sequence.test.ts:350-366`). Same idiom.
- Note on the deck kind: `generateOneArtifact("deck", ...)` internally runs
  `parseDeckSlides` (slice, map to `PptxSlide[]`, `enforceTitleLength`, then
  `validateDeck`); the mock's `text` must be a valid deck JSON matching
  `SLIDE_DECK_JSON_SHAPE` (`src/lib/slide-prompt.ts:40-63`) so the parse
  succeeds. W1-T5 covers the failure path.

### W1-T3 - `reviewArtifact` issues exactly one `callLlm`, built from the produced content (AC-5 provenance)

- Object: the `callLlm` call record and request after
  `await reviewArtifact(produced, context)`
  (`docs/pres-1-architecture.md:335-337`).
- Instrument [MACHINE, mocked `callLlm`]: build a `ProducedArtifact` whose
  content carries a NONCE (e.g. outline markdown `"OUTLINENONCE_B2"`). Mock
  `callLlm`; assert exactly one call, and that the captured request text
  contains the produced content's nonce (the critique is generated FROM that
  artifact, not from thin air).
- Direction of failure: RED if the review request does not carry the produced
  content's text (it would then be reviewing nothing specific); RED if the call
  count is not 1.
- Discriminating sabotage: make `reviewArtifact` build its prompt from `context`
  only, ignoring `produced.content`. Expected: the produced-content-nonce
  assertion goes RED; the count stays 1. Restore: GREEN. DISCRIMINATES.
- Satisfiable by: same `sequence.test.ts:350-366` request-capture template.

### W1-T4 - Per-artifact critique keying is structural; no critique for a non-produced kind (AC-5)

- Object: the `ProducedArtifact[]` a full generate-with-review produces, where
  each element is one arm of the discriminated union
  `{ kind; content; critique: Critique | null }`
  (`docs/pres-1-architecture.md:282-285`).
- Instrument [MACHINE, mocked `callLlm`]: drive the client-shaped flow the tab
  uses - call `generateOneArtifact` for `outline` and for `deck`, then
  `reviewArtifact` on each, assembling the `ProducedArtifact[]`
  (`docs/pres-1-architecture.md:361-364`: the array IS the client-assembled
  `GenerationResult`). Mock `reviewArtifact`'s `callLlm` to return
  KIND-DISTINGUISHABLE critique text (`"CRITIQUE_OUTLINE"` for the outline
  review, `"CRITIQUE_DECK"` for the deck review - achieved by
  `mockResolvedValueOnce` in call order, or by branching the mock on the
  request's content nonce). Assert: (1) the array has exactly two elements,
  kinds `outline` and `deck`; (2) the outline element's `critique.text` contains
  `"OUTLINE"` and the deck element's `critique.text` contains `"DECK"` - each
  critique landed on ITS OWN artifact; (3) NO element has `kind === "activities"`
  (activities was not produced, so no critique for it can exist).
- Direction of failure: RED if review is a single undifferentiated blob applied
  identically to both (assertion 2 fails: the wrong nonce is on an artifact);
  RED if a produced-and-reviewed artifact has `critique === null`; RED if an
  `activities` artifact appears.
- Discriminating sabotage: change the assembly so both artifacts receive the
  SAME critique object (e.g. the outline's critique is written onto the deck
  too). Expected: assertion 2 goes RED (the deck now carries `"OUTLINE"`).
  Restore: GREEN. DISCRIMINATES the single-blob failure - which a mere
  `critique !== null` check would NOT have caught.
- Satisfiable by: the discriminated union means the critique field lives INSIDE
  the produced artifact, so keying is by construction; the mock-per-call idiom
  is `mockResolvedValueOnce` chaining, standard vitest.
- ATTACK MY OWN GUARD: an oracle asserting only `each.critique !== null` passes
  VACUOUSLY on the single-blob mutant (both are non-null). The kind-distinguishable
  nonce assertion (2) is what makes the guard real; that is the whole point of
  planting `"OUTLINE"`/`"DECK"` distinctly.
- CROSS-DOC DIVERGENCE (bind here): the data pass models critique as
  `Partial<Record<PresentationContentKind, ArtifactCritique>>`
  (`docs/pres-1-data.md:194`), a keyed map, and itself flags that the type
  CANNOT enforce "critiques' key set is a subset of the produced keys"
  (`docs/pres-1-data.md:210-219`). The architecture's discriminated union
  (`ProducedArtifact`, `docs/pres-1-architecture.md:282-285`) makes that bad
  state UNREPRESENTABLE, which is the construction the AC-checker prefers over a
  runtime assertion of absence (`docs/loop/seats.md:110-114`). BIND THE ORACLE
  TO THE UNION. If the implementer nonetheless ships the keyed map, this oracle
  must ADD a runtime assertion that `Object.keys(critiques)` is a subset of the
  produced content kinds (the data pass's own named-but-undischarged obligation,
  `docs/pres-1-data.md:210-219`), and that becomes a REQUIRED extra case, not an
  optional one.

### W1-T5 - `validateDeck` rejects empty slides, empty titles, and non-array bullets BEFORE `buildSlidesPptx` (SRE 3b / B2)

- Object: `validateDeck(deck)` (`docs/pres-1-architecture.md:390`), and the
  behaviour of `generateOneArtifact("deck", ...)` on a malformed model response.
- Instrument [MACHINE, pure + mocked `callLlm`]:
  - PURE: assert `validateDeck` returns `null` for each of (a) `{ presentationTitle:"X", slides: [] }`; (b) a deck whose one slide has `title: "   "` (whitespace); (c) a deck whose one slide has `bullets` that is not an array; AND returns the deck UNCHANGED (deep-equal) for a valid non-empty deck with a non-empty trimmed title and an array of bullets.
  - EXECUTED: mock `callLlm` for the deck kind to resolve `text` that parses to a zero-slide deck (or a non-array-bullets slide). Assert `generateOneArtifact("deck", ...)` surfaces a GENERATION FAILURE (the executor signals `null`/error that the route turns into `{ error }`, `docs/pres-1-architecture.md:403-405`). CORRECTION (round-1 check B1): do NOT add a `buildSlidesPptx not.toHaveBeenCalled()` assertion here - it is VACUOUS. `generateOneArtifact` never touches the serializer (it returns structured `GeneratedDeck` content; serialization runs downstream only in the tab's download handler on an already-`validateDeck`-passed deck). So "malformed deck never reaches `buildSlidesPptx`" is a STRUCTURAL guarantee (generation returns content, not bytes) plus an owner-verified download-path property (R-4), not a call-count assertion on this executor. The real discriminator for this oracle is the GENERATION-FAILURE assertion above.
- Direction of failure: RED if a zero-slide, blank-title, or non-array-bullets
  deck reaches `buildSlidesPptx` (which SRE MEASURED either crashes with the
  internal message `"slide.bullets.map is not a function"` or silently ships a
  content-empty ~45.6KB file - `docs/pres-1-sre.md:294-298`); RED if a valid
  deck is rejected.
- Discriminating sabotage: change `validateDeck`'s empty-slides guard from
  `slides.length > 0` to `slides.length >= 0`. Expected: the `slides: []` PURE
  case goes RED (validateDeck returns the deck instead of `null`), and the
  EXECUTED case goes RED (generateOneArtifact no longer surfaces a GENERATION
  FAILURE for the zero-slide deck - the corrected discriminator, NOT a
  buildSlidesPptx call-count). Restore: GREEN. DISCRIMINATES.
- Additional named sabotages (round-1 check I2), one per guard: (i) drop the
  title-trim guard so a `title:"   "` slide passes -> the blank-title PURE case
  goes RED; (ii) drop the `Array.isArray(bullets)` guard so a non-array-bullets
  slide passes -> the non-array PURE case goes RED. Each RED one way, GREEN after
  restore; each discriminates its own guard (the slides.length mutation above
  leaves both green).
- ATTACK MY OWN GUARD: the AC-6 serializer test (W1-T6) asserts `byteLength > 0`,
  which a MISLEADING empty-deck success PASSES - SRE measured `slides: []`
  yields ~45654 bytes (`docs/pres-1-sre.md:294`). So the empty-deck refusal
  CANNOT live in W1-T6; it MUST live here in `validateDeck` upstream. A
  byte-threshold test that tried to distinguish empty from populated by eyeballing
  the ~45654-vs-~51769 gap is explicitly forbidden (`docs/pres-1-sre.md:375-378`).
- Satisfiable by: `validateDeck` is a pure predicate over
  `deck.slides.every(s => s.title.trim() !== "" && Array.isArray(s.bullets))`
  plus `deck.slides.length > 0`; the SRE probe (`docs/pres-1-sre.md:280-298`)
  already MEASURED the exact crash inputs against real `pptxgenjs`, so the guard's
  targets are real, not hypothetical.

### W1-T6 - The `.pptx` serializer returns a non-empty buffer for a non-empty deck (AC-6 DOWNLOADABLE, MACHINE)

- Object: the `ArrayBuffer` from `serializeDeckToPptx(deck)`
  (`docs/pres-1-architecture.md:414`) for a non-empty `GeneratedDeck`.
- Instrument [MACHINE, executed]: build a valid deck (>=1 slide, non-empty
  title, array bullets), `await serializeDeckToPptx(deck)`, assert
  `result.byteLength > 0`. `buildSlidesPptx` runs under vitest with no network -
  the SAME serialization is already exercised by a real test suite via
  `src/lib/lms-generation/artifact-download.ts:187`
  (`buildSlidesPptx({ presentationTitle, slides })`), which
  `artifact-download.test.ts` calls (confirmed: `buildSlidesPptx` appears in 6
  `*.test.ts` files, `grep` this round).
- Direction of failure: RED if the serializer returns a zero-byte buffer for a
  non-empty deck.
- Discriminating sabotage: make `serializeDeckToPptx` return `new ArrayBuffer(0)`
  unconditionally. Expected: RED. Restore: GREEN. DISCRIMINATES a broken
  serializer.
- Necessary-not-sufficient caveat (stated so nobody over-reads a green):
  `byteLength > 0` does NOT prove the deck has content - an empty deck also
  yields ~45654 bytes (`docs/pres-1-sre.md:294`). The content guarantee is
  W1-T5's upstream refusal, not this byte count.
- No-theme construction (B2 / SRE 3.4): `serializeDeckToPptx`'s signature is
  `(deck, author?)` with NO `theme` param (`docs/pres-1-architecture.md:414,422-432`).
  This is a CONSTRUCTION, not a test: SRE measured `buildSlidesPptx` THROWS
  `"Cannot read properties of undefined (reading 'startsWith')"` on a `theme`
  with `backgroundKind:"solid"` and no `backgroundColor` (`pptx.ts:104-107`;
  `docs/pres-1-sre.md:298`). Not building a theme closes that crash mode
  entirely. There is a MACHINE guard for the construction: W3-T5's source-text
  scan asserts `serializeDeckToPptx`'s signature and its `buildSlidesPptx` call
  pass no `theme` argument (direction: RED if a `theme:` key is introduced into
  the `buildSlidesPptx(...)` call in `deck-file.ts`).

### W1-T7 - `buildRegeneratePrompt` folds prior context AND prior critique as two SEPARATELY-DELETABLE lines (LEV-1 / AC-7)

This is the leverage removal test, owned here (AC R-6 / R-A1). It is the single
highest-consequence oracle in PRES-1.

- Object: the string returned by `buildRegeneratePrompt(input)`
  (`docs/pres-1-architecture.md:373,376-380`), and, through it, the request
  `regenerateArtifact` hands `callLlm`.
- Instrument [MACHINE, two layers]:
  - PURE (preferred, faster, no mock): call `buildRegeneratePrompt` directly with `input.priorContext.text = "CTXNONCE_R1"`, `input.priorContext.sources = [{ name:"f", text:"SRCNONCE_R2" }]`, and `input.priorCritique = { text: "CRITNONCE_R3" }`. Assert the returned string CONTAINS all three nonces: `CTXNONCE_R1`, `SRCNONCE_R2` (a file-source text also folds in, AC-3), and `CRITNONCE_R3`.
  - EXECUTED (end-to-end, drives the production path per `docs/loop/seats.md:457-465`): mock `callLlm`, call `regenerateArtifact(input)` with the same nonces, capture `vi.mocked(callLlm).mock.calls[0][0]` and assert the request text contains the context nonce AND the critique nonce.
- Direction of failure: RED when the line that folds `priorContext` is deleted
  (context/source nonce missing) OR when the line that folds `priorCritique` is
  deleted (critique nonce missing). It must fail on REMOVAL of the fold-in, not
  only on unrelated breakage (`docs/pres-1-acceptance-criteria.md:71-74,241-243`).
- Discriminating sabotage - TWO distinct mutations, each isolating one fold:
  - S7a: delete ONLY the critique-fold line in `buildRegeneratePrompt`, keep the context-fold line. Expected: the `CRITNONCE_R3` assertion goes RED; the context-nonce assertions stay GREEN. Restore: GREEN. DISCRIMINATES the critique fold specifically.
  - S7b: delete ONLY the context-fold line, keep the critique-fold line. Expected: `CTXNONCE_R1`/`SRCNONCE_R2` go RED; `CRITNONCE_R3` stays GREEN. Restore: GREEN. DISCRIMINATES the context fold specifically.
  - NON-discriminating mutation to AVOID (stated so the sabotage pass does not bank a worthless kill): deleting the WHOLE `buildRegeneratePrompt` body, or making it `return ""`, turns EVERY assertion RED at once and tells you nothing about WHICH fold broke - it is red in one direction only and discriminates the two folds from each other not at all. Use S7a and S7b, which each go red on exactly one fold.
- ATTACK MY OWN GUARD - the inert-fold trap: an oracle that asserted the prompt
  contains the LABELS `"PRIOR CONTEXT"` and `"PRIOR CRITIQUE"` (or any fixed
  scaffolding string the builder always emits) would GREENLIGHT an inert fold - a
  builder that prints the labels but interpolates neither value. Planting UNIQUE
  NONCES in the VALUES and asserting the NONCES appear is what defeats this: a
  label-only prompt does not contain `CRITNONCE_R3`, so S7a still goes RED on the
  inert build. This is the direct analogue of the `AGENTS.md`
  `refactor-disarms-tests.md` lesson: assert the fact (the value reached the
  prompt), pinned by a frozen nonce, not the spelling of the scaffolding.
- Satisfiable by: `buildRegeneratePrompt` is pure string concatenation of
  `contextToPromptText(input.priorContext)` and `input.priorCritique.text`
  (`docs/pres-1-architecture.md:376-383`); the request-capture idiom is
  `sequence.test.ts:358-359`. Trivially satisfiable; the two folds are named as
  separate lines precisely so S7a/S7b can isolate them.
- `priorCritique === null` case (first regenerate, or review never ran): assert
  `buildRegeneratePrompt` with `priorCritique: null` still folds the context
  (context nonce present) and emits NO critique section - direction RED if a
  `null` critique throws or injects the literal `"null"`.

### W1-T8 - The deck uses ONE slide model: `PptxSlide`, imported not redeclared (data pass 1.3, one-slide-model)

- Object: the imports of `src/lib/presentations/types.ts` and `parse.ts`.
- Instrument [MACHINE, source-text]: assert `types.ts` obtains its slide type by
  `import type { PptxSlide } from "@/lib/pptx"` and that `DeckContent` is
  `GeneratedDeck` from `@/lib/decks/generate`
  (`docs/pres-1-architecture.md:243-244,273`), and that NO file under
  `src/lib/presentations/` declares a local `interface`/`type` whose name or
  shape duplicates a slide model (no local `title`+`bullets` interface). Also
  assert no presentations file imports `SlideData` from `@/app/actions-types` or
  anything from `@/lib/lms-generation/deck` (the wrong pipeline, data pass R-D6,
  `docs/pres-1-data.md:167-179,719`).
- Direction of failure: RED if a second, same-shaped slide interface is declared
  locally, or if `SlideData`/`lms-generation/deck` is imported.
- Discriminating sabotage: add `interface LocalSlide { title: string; bullets:
  string[] }` to `parse.ts` and use it. Expected: RED. Restore: GREEN.
  DISCRIMINATES the divergent-type failure the data pass names as its third
  recurrence risk (`docs/pres-1-data.md:671`).
- Satisfiable by: `ppt-design/hooks.ts:11` already does
  `import type { PptxSlide } from "@/lib/pptx"`; identical.

---

## 4. WAVE 2 - the route handler (`src/app/api/presentations/generate/route.ts`)

The action-guard ratchet (`action-guard-coverage.test.ts`) scans `"use server"`
files and does NOT scan Route Handlers (`docs/pres-1-security.md:163-186`), and
per B1 PRES-1 adds NO new `"use server"` action at all (the intake reuses the
existing `extractDeckSourceFileAction`, `docs/pres-1-architecture.md:63`). So
SEC-1's arrow-function constraint (`docs/pres-1-security.md:413-432`) has NO new
action to bind to this round - recorded as R-T2 (a constraint that fires only if
a future wave adds a `"use server"` file). The route's auth is instead enforced
by the tests below.

### W2-T1 - The route awaits `requireUser()` BEFORE any generation (SRE 2b, auth)

- Object: the behaviour of the exported `POST` in `route.ts`
  (`docs/pres-1-architecture.md:471`).
- Instrument [MACHINE, EXECUTED - drive the production path]: in a
  `route.test.ts`, `vi.mock("@/lib/supabase/auth", ...)` so `requireUser` is a
  `vi.fn()` that REJECTS (unauthenticated), and `vi.mock("@/lib/presentations/generate", ...)`
  so `generateOneArtifact`, `reviewArtifact`, `regenerateArtifact` are `vi.fn()`s.
  Import `{ POST }` from the route, call
  `await POST(new Request("http://x/api/presentations/generate", { method:"POST",
  body: JSON.stringify({ op:"generate", kind:"outline", context:{text:"",sources:[]},
  withReview:false }) }))`. Assert: the three executor mocks were NOT called
  (`expect(generateOneArtifact).not.toHaveBeenCalled()`), and the response is an
  error status (not a 200 `ProducedArtifact`).
- Direction of failure: RED if a generation executor runs before the auth check
  resolves (auth absent or after generation), which is the exact ordering SEC-2b
  forbids.
- Discriminating sabotage: move the `await requireUser()` call to AFTER the first
  `generateOneArtifact` call (or delete it). Expected: the
  `not.toHaveBeenCalled()` assertion goes RED (the executor ran on an
  unauthenticated request). Restore: GREEN. DISCRIMINATES - and it discriminates
  BECAUSE it drives the real `POST`, not a source-text proxy: a source-text
  "requireUser appears before generateOneArtifact" check is defeated by the
  import line (`import { generateOneArtifact }` textually precedes the
  `requireUser` call), which is why the EXECUTED test is primary here.
- ATTACK MY OWN GUARD: a source-text `indexOf("requireUser") <
  indexOf("generateOneArtifact")` test passes on a broken route because
  `generateOneArtifact` first appears in the IMPORT statement at the top of the
  file, before any call. The executed test above cannot be fooled that way. If a
  source-text companion is wanted, it must slice the `POST` function body
  (anchors: `export async function POST` and the file end / next top-level
  `export`, both asserted `> -1`) and search WITHIN the slice for the CALL forms
  `requireUser(` and `generateOneArtifact(` - and even then the executed test
  remains the authority.
- Satisfiable by: `class-trends-insight/route.ts:3,32-34` is the shipped
  template - `requireUser` first, `runtime="nodejs"`, `maxDuration=60`,
  `dynamic="force-dynamic"`, then one model call. Importing and calling an
  exported route function under vitest with mocked auth is standard; the network
  block never trips because the executors are mocked (no `callLlm`, no `fetch`).

### W2-T2 - Route module constants: `runtime`, `maxDuration = 60`, single-kind body (SRE 2a/2b, Hobby cap)

- Object: the exported constants of `route.ts` and the shape of its request type.
- Instrument [MACHINE]:
  - EXECUTED: import `{ runtime, maxDuration }` from the route; assert `runtime === "nodejs"` and `maxDuration === 60`. (These are plain module-level exports, readable directly - stronger than any source-text scan.)
  - SOURCE-TEXT (for the body shape, which is a compile-time type and cannot be read as a runtime value): slice `route.ts` between the two asserted anchors `type PresentationsRequest` (start, `> -1`) and the next top-level `export`/`async function POST` (end, `> end > start`), and assert within the slice that a generate op carries a single `kind:` and NO `kinds:` array and NO `ArtifactSelection` field, and a regenerate op carries a single `input:` (`docs/pres-1-architecture.md:467-469`). Direction: RED if the body accepts or loops a kinds array (the never-loop contract, `command-interface.ts:26-32`).
- Direction of failure: RED if `maxDuration` is missing or above 60 (fails to
  build on Hobby, `class-trends-insight/route.ts:30-31`); RED if `runtime` is
  not `"nodejs"`; RED if the body type admits an array of kinds.
- Discriminating sabotage: change `maxDuration` to `300`. Expected: the
  `maxDuration === 60` assertion goes RED. Restore: GREEN. DISCRIMINATES. A
  second sabotage: add `kinds: ContentArtifactKind[]` to the generate arm.
  Expected: the source-text slice assertion goes RED. Restore: GREEN.
- The sequential-`callLlm` bound (SRE 2a) is guaranteed BY CONSTRUCTION under the
  single-kind boundary: each `POST` does at most 2 sequential `callLlm`
  (produce + review, or regenerate + re-review), so 2 x ~10.6s worst-case
  backoff = ~21.2s, under the 50s soft budget
  (`docs/pres-1-architecture.md:506-516`; `docs/pres-1-sre.md:265-274`). The
  MACHINE half of 2a that is checkable here is the call-count-per-invocation:
  W1-T2/T3 already pin each executor at exactly 1 `callLlm`; a route test that
  runs `op:"generate"` with `withReview:true` (executors NOT mocked, `callLlm`
  mocked) and asserts `vi.mocked(callLlm)` was called at most twice pins the
  per-request ceiling. Direction: RED if a request ever issues a third
  sequential `callLlm` (the condition RE-FAILS the moment a future edit lets one
  entry point issue a third call, `docs/pres-1-architecture.md:751-754`).
- ARGUED, not asserted: real Gemini latency (R-SRE-1 / R-A2) can only raise the
  ~21.2s bound; it is owner-verified post-deploy, not machine-checkable here.

### W2-T3 - A build-throw or validate-failure returns `{ error }`, never a crash (SRE 3a upstream)

- Object: `POST`'s response when generation fails.
- Instrument [MACHINE, EXECUTED]: with executors NOT mocked but `callLlm` mocked
  to resolve a malformed deck response (zero slides), call
  `POST({ op:"generate", kind:"deck", ... })`; assert the response is a JSON
  `{ error }` with a non-2xx status, and that the process did not throw out of
  `POST` (the call resolves). A second case: mock `callLlm` to resolve
  `{ ok:false, status:500, body:"boom" }`; assert `{ error }`, not a throw.
- Direction of failure: RED if a malformed generation surfaces as an unhandled
  throw / rejected `POST` (which on Vercel is a 500 with no worded body) rather
  than a returned `{ error }`.
- Discriminating sabotage: remove the `try/catch` (or the `null`-parse guard)
  around the deck generation in `POST` so a `null` parse throws. Expected: the
  `POST` call rejects, the `{ error }` assertion goes RED. Restore: GREEN.
  DISCRIMINATES.
- Satisfiable by: `class-trends-insight/route.ts` returns a worded error on the
  model-phase failure (`MODEL_PHASE_ERROR`, `:55-56`) rather than throwing; same
  discipline.

---

## 5. WAVE 3 - surface and nav wiring

All wave-3 MACHINE tests are source-text (`readFileSync`) or executed over the
ladder `.ts`; NONE renders a component (section 0). The owned frozen-test edits
are enumerated first because they go RED the instant the nav symbols change and
MUST be updated in the same wave (`docs/pres-1-architecture.md:794-808`).

### W3-T1 - The reachability-ladder frozen arrays (AC-1, AC-2)

These are ALREADY-SHIPPED frozen assertions that this change breaks; the
implementer UPDATES them, and their RED-on-omission is what proves the ladder
was wired. The chosen internal id is the architect's (recommended
`"presentations"`, adjacent to `"ppt-design"`,
`docs/pres-1-architecture.md:796-802`); the oracle binds to the STRUCTURE, not
to the exact id string, except where the frozen array literally lists it.

- `src/app/components/manual/manual-rail.test.ts:195-203` - `MANUAL_VIEW_ORDER`
  is a FROZEN exact-array (`toEqual([...])`, opened this round: 7 entries, the
  describe at `:189` says "seven subtabs"). Adding `"presentations"` REQUIRES
  editing this literal AND the "seven" wording in the describe/comment at
  `:188-194`. Direction: RED (array mismatch) until updated.
- `src/app/components/manual/manual-rail.test.ts:249-253` - "should return null
  for single-view subtabs" asserts `getInnerDestinations` is null for
  `version-control`, `recording`, `ppt-design`. Presentations MUST NOT be added
  here: it is an inner-nav view, so `getInnerDestinations("presentations")` is a
  non-null list containing a "Slide Deck Creation" destination (AC-2). A NEW
  assertion of that shape is added, mirroring the grading block at `:237-247`.
- `src/app/components/manual/manual-rail.test.ts:262-272` - the I1 parity loop
  asserts, for EVERY `MANUAL_VIEW_ORDER` member, `getInnerDestinations(view)
  !== null` IFF `getInnerNavAriaLabel(view) !== null`. This is a PRE-EXISTING
  enforcer of AC-2's "the inner tablist is aria-labelled": once `presentations`
  is in the order WITH inner destinations, it MUST also get an inner-nav aria
  label, or this frozen loop goes RED. No new test needed for that clause - this
  loop already covers it. State this to the implementer so the aria label is not
  forgotten.
- `src/app/components/manual/manual-rail.test.ts:529-538` - `isManualViewType`
  loops over `MANUAL_VIEW_ORDER`; DERIVED, auto-covers the new member with no new
  case. This is the restore-across-reload guard (ladder hop 3,
  `docs/pres-1-architecture.md:160-165`); it stays GREEN by construction, which
  is the whole point of R-2 reusing the derived mechanism.
- `src/app/components/tabs/tab-rails.test.ts:54-66` - frozen
  `TOOLS_RAIL_ITEMS.map(id)` (10 entries) plus `toHaveLength(10)`. Add
  `"manual:presentations"` and bump to `11`.
- `src/app/components/tabs/topLevelTabs.wiring.test.ts:374` -
  `expect(TOOLS_RAIL_ITEMS).toHaveLength(10)`; bump to `11`.
- Command that establishes the RED-on-change facts (paste at the wave gate):
  `grep -n "toEqual(\[\|toHaveLength(10)" src/app/components/manual/manual-rail.test.ts src/app/components/tabs/tab-rails.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts`
  (`docs/pres-1-architecture.md:813`).
- Direction of failure (whole ladder): RED if the frozen arrays/counts are not
  updated in lockstep with `manual-rail.ts`; RED if `getInnerDestinations` is
  wired null for `presentations`; RED (I1 loop) if the inner nav has no aria
  label. The `useAppNavigation.ts` `ManualView` union hop-4 edit
  (`docs/pres-1-architecture.md:166-171`) is caught by `tsc`, not by a test.
- ATTACK MY OWN GUARD - the frozen-count trap: `topLevelTabs.wiring.test.ts:374`
  is a count assertion; a count with no demonstrated failure input reads as
  coverage while catching nothing (`docs/loop/traps-tests.md:30-33`). Its
  failure input is DEMONSTRATED: adding the rail chip via `MANUAL_VIEW_ORDER`
  makes `TOOLS_RAIL_ITEMS` length 11, so the `10` literal goes RED - that is the
  chip's own reachability being proven, not a frozen number for its own sake.
- Satisfiable by: these are the exact edits the grading sub-tab landed
  (`manual-rail.test.ts:237-247` is grading's own non-null block, shipped and
  green).

### W3-T2 - `ta-pres-*` persistence via `useLocalStorageState`, value-bound, no seeded-initializer-only visibility (AC-8)

- Object: the new intake/selection state in
  `src/app/components/presentations/hooks.ts` and `SlideDeckCreationTab.tsx`.
- Instrument [MACHINE, source-text]: assert the intake text, the file-intake
  receipt, and the selection state each go through `useLocalStorageState` with a
  key that starts `"ta-pres-"` (the house idiom, `ppt-design/hooks.ts:15-36`;
  recommended keys `ta-pres-source-text`, `ta-pres-source-receipts`,
  `ta-pres-source-materials`, `ta-pres-selection`,
  `docs/pres-1-architecture.md:561-567`). Assert NO new intake/selection control
  is a bare `useState` with no `ta-` key. Assert no persisted open/visibility
  state is expressed as `<details open={seeded}>` (the hydration hazard,
  `AGENTS.md` `persisted-details-open-hydration.md`;
  `docs/pres-1-architecture.md:582-593`): if a `<details` appears, its `open`
  must not be bound directly to a `ta-`-seeded value.
- Direction of failure: RED if a new intake/selection control uses plain
  `useState`; RED if a `ta-`-seeded value drives a `<details open={...}>`
  attribute directly.
- Discriminating sabotage: change one selection control from
  `useLocalStorageState("ta-pres-selection", ...)` to `useState(...)`. Expected:
  RED. Restore: GREEN. DISCRIMINATES the persistence omission.
- ARGUED, not asserted: whether the value actually SURVIVES a reload is
  OWNER-verification (nothing renders under vitest, no `localStorage` round-trip
  is executed here). The source-text test proves the IDIOM is used, not the
  runtime behaviour - stated so a green is not over-read. The data pass's own
  measured reasoning (`docs/pres-1-data.md:390-413`, R-D9) is that the
  initializer-only hook is safe here because no `manualView` participates in SSR;
  that remains an architect confirmation, not a machine claim.
- Satisfiable by: `ppt-design/hooks.ts:118,122` already persist
  `ta-ppt-source-receipt`/`ta-ppt-source-materials` this exact way.

### W3-T3 - In-house-only egress: no external generation SDK, no external viewer embed (AC-3 MACHINE, SEC-2, I2)

This is the requirement most at risk of a FALSE denylist. I split it into a
STRONG constructive half and a BOUNDED denylist half, and I state the bounded
half's incompleteness plainly rather than dressing it as a proof.

- Object: the value-import closure of `src/lib/presentations/*.ts` and
  `src/app/api/presentations/generate/route.ts`, PLUS the source text of
  `src/app/components/presentations/*.tsx` (especially `SlideDeckPreview.tsx`).
- Instrument, half A [MACHINE, CONSTRUCTIVE, strong] - the positive anchor: a
  DUPLICATED import-walker (copied, never imported, from
  `classTrendsDraft.not-postable.test.ts:80-148` - its `resolveSpecifier`,
  `valueImportSpecifiers` with the type-only skip, and `walkForForbiddenImports`;
  the `IMPORT_RE` at `:96` handles `import` AND `export ... from` and is `/gm`,
  no `/s`) walks the closure of `route.ts` and `generate.ts` and asserts
  `@/lib/llm` IS reached. Without this anchor the "no other egress" half is
  vacuous - a module that does nothing has no egress
  (`docs/loop/seats.md:110-114` construction-over-absence). Direction: RED if
  `callLlm`/`@/lib/llm` is NOT in the closure (generation is not in-house, or
  not happening at all).
- Instrument, half B [MACHINE, BOUNDED denylist, EXPLICITLY INCOMPLETE] - the
  new-egress scan: over the SAME presentations files (lib + route + components),
  scan the source text for (1) an import of a network client other than
  `@/lib/llm` (`axios`, a bare `http`/`https` node import, `XMLHttpRequest`,
  `WebSocket`, `EventSource`, `navigator.sendBeacon`); (2) a `fetch(` whose first
  argument is not a same-origin relative path string beginning `/api/`
  (the tab's own `fetch("/api/presentations/generate")` is allowed,
  `docs/pres-1-architecture.md:496-498`); (3) an external-viewer embed in any
  `presentations/*.tsx`: the literal tokens `<iframe`, `office.com`,
  `officeapps`, `docs.google.com`, `/viewer` (the exact set the security pass
  grepped and found zero of today, `docs/pres-1-security.md:228-229,486-493`).
  Direction: RED if any is introduced.
- Discriminating sabotage: add `<iframe src="https://view.officeapps.live.com/...">`
  to `SlideDeckPreview.tsx`. Expected: half B goes RED. Restore: GREEN.
  Second sabotage: remove the `callLlm` call from `generate.ts`. Expected: half A
  goes RED. Restore: GREEN. Both DISCRIMINATE.
- HONEST LIMITATION (this is the load-bearing sentence, not a footnote): half B
  is a DENYLIST and cannot prove the absence of a NOVEL egress - a new
  external-viewer host not in the token set, or a network primitive not in the
  list, defeats it. This is the unbounded-set failure the AC-checker warns about
  (`docs/loop/seats.md:115-121`). I do NOT claim half B is complete. The
  construction that actually closes SEC-2 is architectural, not a test: the
  preview renders STRUCTURED `PptxSlide` data as React text (W3-T4's one-slide-
  model), so there is no `.pptx` binary to hand to a viewer in the first place -
  but "renders as text" is not machine-checkable here (no render). Therefore the
  RESIDUAL R-SEC-1 (owner: architect/security; instrument: this scan PLUS a
  human read of the preview component at Verify; step: wave-2 security re-check
  against the built diff) carries the part half B cannot. I record it as a
  residual, not a deletion, exactly because the denylist is half the guard
  (`AGENTS.md` `allowlist-is-half-the-breakglass.md`).
- Satisfiable by: `classTrendsDraft.not-postable.test.ts` is the shipped,
  green walker; canary 2a/2b there prove the walk recurses and canary 3 proves a
  real closure returns zero violations.

### W3-T4 - One slide model: the preview and the download read the SAME `deck.slides` (AC-6 wiring, no divergence)

- Object: the wiring in `SlideDeckCreationTab.tsx` between the deck state, the
  preview, and the download.
- Instrument [MACHINE, source-text]: assert `SlideDeckCreationTab.tsx` passes
  `deck.slides` (the same state object) to `<SlideDeckPreview ...>` AND calls
  `serializeDeckToPptx(deck)` on that SAME `deck`, with NO second slide array
  constructed in the tab (`docs/pres-1-architecture.md:658-665`). Concretely:
  the file contains exactly one deck-state declaration; the preview prop and the
  serialize argument both derive from it; there is no `.map(`-built parallel
  slide array assigned to a second variable that the preview reads instead.
- Direction of failure: RED if the preview builds its own slides or the download
  reads a different field (they could then diverge, and the downloaded file
  would not match what the owner saw).
- Discriminating sabotage: give `<SlideDeckPreview slides={someOtherSlides} />` a
  different variable than the one `serializeDeckToPptx` reads. Expected: RED.
  Restore: GREEN. DISCRIMINATES.
- ARGUED, not asserted: whether the preview VISIBLY draws slides is OWNER (R-4);
  this test pins the wiring only.
- CAVEAT on the slice: if the test slices the tab to locate the two call sites,
  both anchors (the `<SlideDeckPreview` tag and the `serializeDeckToPptx(` call)
  must be asserted `> -1` (convention 5); a missing anchor must FAIL the test,
  not silently widen it.

### W3-T5 - Download handler surfaces an error STATE on throw; and the no-theme construction (SRE 3a / B2)

- Object: the download handler's `catch` in `SlideDeckCreationTab.tsx`, and the
  `buildSlidesPptx` call in `deck-file.ts`.
- Instrument [MACHINE, source-text, BOUNDED]:
  - 3a: slice the download handler function (anchors: the handler's `const handle...Download` / `async () =>` start and its closing, both asserted `> -1`), find the `catch` block within it, and assert the `catch` contains at least one state-setter call (an identifier matching `set[A-Z]\w*\(`), NOT solely `console.error`. Direction: RED if the only effect in `catch` is `console.error` - the exact anti-pattern at `ppt-design/index.tsx:560-562` that must NOT be copied (`docs/pres-1-architecture.md:535-544`).
  - no-theme: assert `deck-file.ts`'s `serializeDeckToPptx` signature has no `theme` parameter and its `buildSlidesPptx({ ... })` call passes no `theme:` key (W1-T6's construction guard). Direction: RED if a `theme` is threaded in.
- Direction of failure: as above.
- Discriminating sabotage: replace the `set...Error(...)` call in the download
  `catch` with `console.error("Download failed:", err)` only. Expected: 3a goes
  RED. Restore: GREEN. DISCRIMINATES. Second: add `theme` to the `buildSlidesPptx`
  call. Expected: the no-theme assertion goes RED.
- HONEST LIMITATION: the setter NAME is not frozen (source-text cannot know the
  implementer's state variable), so 3a asserts the SHAPE (a setter is called in
  the catch), not the identity of the state. Whether an error actually RENDERS is
  OWNER (R-4). The throw itself is hard to trigger post-`validateDeck` and
  post-no-theme, so 3a pins the handler's shape, which is all a non-rendering
  environment can pin (`docs/pres-1-architecture.md:692-694`).
- Satisfiable by: `ppt-design/index.tsx:549-552` is the shipped good branch
  (`setGenerateError(out.error)`); the handler copies that discipline, not the
  bare-`console.error` catch two lines below it.

---

## 6. Frozen oracles, stated as constructions

Each is a construction with a proof it can be built from the tree.

### 6.1 The `selectedContentKinds` expected-value table (W1-T1), FROZEN LITERALS

Construction: for each selection, the expected list is written as a literal, NOT
derived from `CONTENT_KINDS`. The axis (the selection inputs) comes from
enumerating the 3 content booleans; the expected values are hand-frozen - so the
two sources DIFFER (`docs/loop/seats.md:421-424`, the axes-from-a-different-
source rule), which is what stops a generator/oracle shared-axis tautology.

| selection input (outline, activities, deck, review) | frozen expected |
|---|---|
| (T, F, F, F) | `["outline"]` |
| (F, T, F, F) | `["activities"]` |
| (F, F, T, F) | `["deck"]` |
| (T, F, T, F) | `["outline", "deck"]` |
| (T, T, T, F) | `["outline", "activities", "deck"]` |
| (F, F, F, F) | `[]` |
| (F, F, T, T) | `["deck"]` (review is NOT a content kind) |
| (T, T, T, T) | `["outline", "activities", "deck"]` (review absent) |

Buildable: `selectedContentKinds` is a pure filter (`docs/pres-1-architecture.md:346-352`).

### 6.2 The regenerate nonce oracle (W1-T7), FROZEN NONCES

Construction: `priorContext.text = "CTXNONCE_R1"`, `priorContext.sources =
[{ name:"f", text:"SRCNONCE_R2" }]`, `priorCritique = { text:"CRITNONCE_R3" }`.
Assert the built prompt (and the captured request) CONTAINS each nonce. The
nonces are the frozen literals; the fact under test is "the value reached the
prompt", pinned by the nonce, never the spelling of the surrounding scaffolding.
Buildable: pure string concat (`docs/pres-1-architecture.md:376-383`).

### 6.3 The `validateDeck` case table (W1-T5), FROZEN INPUTS

| input | frozen expected |
|---|---|
| `{ presentationTitle:"X", slides: [] }` | `null` |
| `{ presentationTitle:"X", slides:[{ title:"   ", bullets:[] }] }` | `null` |
| `{ presentationTitle:"X", slides:[{ title:"T", bullets:"nope" as unknown }] }` | `null` |
| `{ presentationTitle:"X", slides:[{ title:"T", bullets:["a"] }] }` | the deck unchanged (deep-equal) |

The three `null` inputs are the SRE-MEASURED crash/misleading-success shapes
(`docs/pres-1-sre.md:294-298`). Buildable: pure predicate.

### 6.4 The multi-file gate commands (convention 4)

- Wave-1 logic suite (single directory, but multiple files -> use test:paths):
  `npm run test:paths src/lib/presentations/generate.test.ts src/lib/presentations/prompts.test.ts src/lib/presentations/parse.test.ts src/lib/presentations/deck-file.test.ts`
- Wave-3 nav frozen suite:
  `npm run test:paths src/app/components/manual/manual-rail.test.ts src/app/components/tabs/tab-rails.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts`
- A single file (e.g. the route test) may use
  `npx vitest run src/app/api/presentations/generate/route.test.ts`.
- The exact test filenames are the implementer's to name; the commands above
  assume the conventional `<module>.test.ts` sibling. Whatever names are chosen,
  a gate over two or more of them uses `test:paths`, never raw multi-path
  `vitest`.

---

## 7. Attack-my-own-guard log (consolidated - the vacuous passes I closed)

1. W1-T1: a self-comparison (`expected = CONTENT_KINDS.filter(sameFlags)`) is a
   tautology; FROZEN LITERALS instead (6.1).
2. W1-T4: `critique !== null` passes on the single-blob mutant; KIND-DISTINGUISHABLE
   nonces assert the right critique landed on the right artifact.
3. W1-T7: asserting the LABELS `"PRIOR CONTEXT"`/`"PRIOR CRITIQUE"` greenlights
   an inert fold; FROZEN VALUE NONCES assert the values actually reached the
   prompt, and S7a/S7b isolate each fold.
4. W1-T5 vs W1-T6: an empty deck passes a `byteLength > 0` test (~45654 bytes);
   the empty-deck refusal lives in `validateDeck` UPSTREAM, never in the byte
   test, and no test eyeballs a byte threshold.
5. W2-T1: a source-text "requireUser before generateOneArtifact" is defeated by
   the import line; the EXECUTED test drives the real `POST` and asserts the
   executor mock was not called on an unauthenticated request.
6. W3-T3: the external-viewer scan is a DENYLIST that a novel host defeats; I
   state that plainly, keep the import-walk POSITIVE anchor as the constructive
   half, and file the residual R-SEC-1 for the part the denylist cannot prove.
7. Sabotage hygiene (W1-T7): deleting the whole `buildRegeneratePrompt` body is
   red-in-one-direction and discriminates the two folds not at all - S7a/S7b are
   the discriminating mutations; the whole-body deletion is explicitly NOT banked
   as a kill.

---

## 8. Executable here versus argued only

**Executable under vitest in this checkout (mocked-`callLlm` / pure / source-text):**
- W1-T1 selection map; W1-T2/T3 executor call-count + request-nonce; W1-T4
  per-artifact critique keying; W1-T5 `validateDeck` + generation-failure path;
  W1-T6 serializer non-empty; W1-T7 regenerate fold-in (both layers); W1-T8
  one-model imports.
- W2-T1 executed auth-before-generation; W2-T2 route constants +
  per-request call ceiling; W2-T3 `{ error }`-not-crash.
- W3-T1 frozen ladder arrays; W3-T2 `ta-pres-*` idiom scan; W3-T3 egress
  import-walk + denylist scan; W3-T4 one-slide-model wiring; W3-T5 download
  error-state shape + no-theme.

**Argued only (labelled as argued, NOT asserted as verified):**
- The per-request sequential-`callLlm` wall-clock staying under 60s in
  PRODUCTION (real Gemini latency, R-SRE-1/R-A2) - arithmetic lower bound is
  machine (W2-T2), the real number is owner.
- Whether any `ta-pres-*` value actually survives a reload (W3-T2) - the idiom
  is machine, the round-trip is owner.
- Whether the egress denylist (W3-T3 half B) is COMPLETE - argued incomplete;
  the residual carries the gap.
- Whether the download `catch`'s setter actually renders an error (W3-T5) -
  shape is machine, render is owner.

**RED-BY-CONSTRUCTION (the feature does not exist yet, not contradictory):**
- Every wave-1/wave-2 oracle is red until the module exists; each names a shipped
  green sibling proving the SAME assertion shape passes (W1-T2/T3/T7 =
  `sequence.test.ts`; W1-T6 = `artifact-download.test.ts`; W2-T1/T2 =
  `class-trends-insight/route.ts`; W3-T1 = the grading sub-tab's own frozen
  edits; W3-T3 = `classTrendsDraft.not-postable.test.ts`).

---

## 9. Owner-verification walk (OV) - what NO test here can reach

Nothing renders under vitest, so this is the human's walk, in order, and it is
the ONLY proof of these clauses (AC R-4/R-5, `docs/pres-1-architecture.md:869-882`):

1. OV-1 (AC-1): open Tools; a "Presentations" chip is present; click it; the
   view is Presentations; RELOAD; the view is still Presentations (not bounced to
   Build Courses - the `artifact-design` regression class, `manual-rail.test.ts:525-528`).
2. OV-2 (AC-2): under Presentations, a child strip shows "Slide Deck Creation".
3. OV-3 (AC-3): paste text AND attach a file; both are accepted; both reach
   generation (the produced artifacts reflect both).
4. OV-4 (AC-4): deselect an artifact; confirm it is not produced; select a proper
   subset; confirm exactly that subset comes back.
5. OV-5 (AC-5): each produced item shows its OWN critique; the critique reads as
   genuinely adversarial (R-5, quality).
6. OV-6 (AC-6 VISIBLE): a generated deck draws slides ON THE PAGE (real slides,
   not a `data-` attribute or hidden node - the invisible-enforcer failure this
   seat has paid for, `.claude/agents/loop-ac.md:27-28`).
7. OV-7 (AC-6 DOWNLOADABLE): click download; a `.pptx` file downloads and OPENS
   in PowerPoint.
8. OV-8 (AC-7): regenerate an artifact; the new output reflects the prior
   critique (the fold-in the machine test proves is IN the request; that it
   IMPROVED the output is quality, R-5).
9. OV-9 (AC-8): paste context; reload; it is still present.
10. OV-10 (SRE): force a partial failure (one artifact fails); the successful
    ones still show, the failed one shows an error, not silence (R-SRE-6).
11. OV-11 (R-3): a real run returns 3-5 useful activity ideas and on-topic deck
    content (model quality, no API key here).

---

## 10. Sabotage register (one row per requirement; every mutation named)

| Req | Named mutation | Expected RED | GREEN on restore | Discriminates? |
|---|---|---|---|---|
| W1-T1 | force `"deck"` always included, ignore the flag | subset rows (outline-only, activities-only) | yes | YES |
| W1-T2 | build prompt from a constant, drop `context` | context-nonce assertion | yes | YES (context reach) |
| W1-T3 | build review prompt from `context` only, drop `produced.content` | produced-content-nonce assertion | yes | YES |
| W1-T4 | write one critique onto both artifacts | kind-distinguishable-nonce assertion | yes | YES (single-blob) |
| W1-T5 | `slides.length > 0` becomes `>= 0` (+ title-trim drop, `Array.isArray` drop per I2) | empty-deck PURE case + the EXECUTED generation-failure assertion (NOT a buildSlidesPptx call-count - B1: generation never serializes); title/bullets guards each caught by their own PURE case | yes | YES |
| W1-T6 | serializer returns `new ArrayBuffer(0)` | byteLength assertion | yes | YES (broken serializer) |
| W1-T7 | S7a delete critique-fold; S7b delete context-fold | S7a: critique nonce; S7b: context nonces | yes | YES (each isolates one fold); whole-body delete does NOT and is not banked |
| W1-T8 | add a local same-shape slide interface | duplicate-type assertion | yes | YES |
| W2-T1 | move/delete `await requireUser()` before generation | executor-not-called assertion (executed) | yes | YES (executed, not source-text) |
| W2-T2 | `maxDuration = 300`; or add `kinds[]` to the body | const assertion; slice assertion | yes | YES |
| W2-T3 | remove try/catch around deck gen | `{ error }`-not-throw assertion | yes | YES |
| W3-T1 | omit the frozen-array/count updates | array/length mismatch | yes | YES (the chip's own reachability) |
| W3-T2 | one control switched to plain `useState` | `ta-`-idiom scan | yes | YES |
| W3-T3 | add an `<iframe office.com>`; or remove `callLlm` | half B; half A | yes | YES (both) |
| W3-T4 | preview reads a different slide array than download | one-model wiring | yes | YES |
| W3-T5 | `catch` becomes `console.error`-only; or thread a `theme` | catch-setter scan; no-theme assertion | yes | YES |

---

## 11. Residual register (owner, instrument, step - none is a bare pointer)

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-T1 | No reference implementation was built this round to prove the red tests satisfiable by execution (notes-only dispatch); satisfiability is ARGUED from named green templates per oracle. | Test seat | Build a throwaway `src/lib/presentations/*` reference in an isolated tree, run the wave-1/wave-2 oracles green (`docs/loop/seats.md:438-446`) | At Build, before the implementer's tests are trusted |
| R-T2 | SEC-1's arrow-function constraint has NO new `"use server"` action to bind to (B1 uses a Route Handler); it fires only if a future wave adds a `"use server"` file. | Implementer-brief author + wave gate | `action-guard-coverage.test.ts:61,127` (`GUARD_CALL`, the `/^export async function/` collector) | Any future wave that adds a `"use server"` file under `src/app` |
| R-T3 (extends R-SEC-1) | W3-T3 half B is a bounded denylist and cannot prove absence of a novel external-viewer host or a novel network primitive. | Architect + security seat | The W3-T3 scan PLUS a human read of `SlideDeckPreview.tsx` at Verify (built-from-structured-data, not a `.pptx`-binary viewer) | Wave-2 security re-check against the built diff |
| R-T4 (extends R-SEC-2) | The regenerate fold-in has no machine-checked SIZE CEILING across N cycles; W1-T7 proves the folds are PRESENT, not that a repeated fold stays bounded. | Architect (design the ceiling) + test seat (assert it) | `DECK_SOURCE_MAX_CHARS` pattern (`src/lib/decks/deck-source.ts:19`); a unit test over the fold across 2+ cycles | Architect confirms the ceiling; test seat adds the case at Build |
| R-T5 (from SRE 4a/4b/4c) | Regenerate re-entrancy / stale-response / failed-regenerate-preserves-prior are SRE pass conditions whose oracle depends on the architect's Pattern-A-vs-B choice (R-SRE-4, undecided). | Architect (pick pattern), then test seat | Mocked-`callLlm` + controllable-promise unit tests once the guard pattern is chosen (`docs/pres-1-sre.md:439-459,485-492`) | Architect pass; test seat builds the matching oracle at Build |
| R-T6 (from SRE 5a) | Per-artifact diag redaction (`key=` never un-redacted) is machine-checkable but depends on whether PRES-1 attaches a diag fragment at all (architect's call). | Architect (decide diag) + test seat | `redactSensitiveText` property test, same discipline as `generation-diag.test.ts` (`docs/pres-1-sre.md:538-547`) | Architect decides; test seat asserts if adopted |
| R-3 / R-4 / R-5 (AC) | Model quality (3-5 ideas, on-topic deck, genuinely adversarial critique); tab/preview/download reachability; critique usefulness. | Owner | The OV walk (section 9) | Post-deploy owner verification |
| R-SRE-1 / R-A2 | Real Gemini per-call latency; whether the ~21.2s lower bound holds in production. | Owner | Time real requests; read Vercel function-duration data | Post-deploy owner verification |

---

## 12. What I could not determine this round

- I did NOT execute a reference implementation (notes-only); satisfiability is
  argued, not proven-by-execution (R-T1). No oracle above is contradictory - each
  names a green template of the same shape - but "argued" is the honest word.
- The exact state-setter identifier in the download `catch` (W3-T5 3a) is
  unknowable from notes; the test asserts the SHAPE (a setter is called), and the
  render itself is owner (R-4).
- The completeness of the egress denylist (W3-T3 half B) is, by construction, not
  determinable by a source-text scan; R-T3 carries it.
- Whether the implementer ships the architecture's discriminated-union
  `ProducedArtifact` or the data pass's keyed map (W1-T4) changes whether the
  AC-5 subset invariant is enforced by construction or needs a runtime assertion;
  I bound the oracle to the union and stated the fallback, but the choice is the
  implementer's and is checked at the wave gate against the built diff.
