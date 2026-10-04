# W1b test notes + frozen oracles: `finalizeTakeDraft` leaf

Seat: test-notes/oracle (Opus). These are NOTES for the implementer, not test code. A `loop-checker` reads them first. Everything below was measured in this checkout; no file was added to the repo tree (`git status --short` shows only the three pre-existing sibling edits and `docs/loop-retro-roles-acceptance-criteria.md`, none mine). My satisfiability reference lives only in the session scratchpad.

Scope under test: W1b of `docs/announcement-from-recording-scope.md` — a NEW pure leaf `finalizeTakeDraft` that wraps `draftAnnouncementAction`'s result before it reaches review, closing defects G1 (embedded = prompt), G2 (blank accepted), G4c (no URL guard). Built on F2=a (do NOT edit `draftAnnouncementAction`; 8 non-test call sites in 5 files) and F1=a. Does NOT touch `MessageDraftsTab.tsx`, `takeAnnouncementTranscription.ts`, `take-transcript.ts`, `audio-sidecar.ts` (W1a's).

---

## 0. The one decision the orchestrator asked me to pin: REFUSE in the leaf (not coerce in runDraft)

**INFO-2, re-measured by me, not recalled.** `src/lib/llm.ts:384-385`: `callLlm` does `void provider; return callGemini(req);` — it discards the provider argument and always calls Gemini. Transcription (`transcribeLiveAudioAction` -> `callLlm`) therefore ALWAYS sends the recording's audio to Gemini regardless of the provider toggle. So a user who selected "embedded" already sent their audio off-device at the transcription step. Refusing (or coercing) the embedded DRAFT adds no new privacy posture — the choice was already moot on this route. Both readings are privacy-equivalent, which is why the scope correctly calls this fork-free.

**I pin REFUSE IN THE LEAF, keyed on the provider enum value.** `finalizeTakeDraft` receives the provider; when `provider === "embedded"` it returns an error result, so the embedded scaffold never reaches review. Three reasons, in order of weight:

1. **It drives the production path** (test-seat practice #3). In production the embedded branch of `draftAnnouncementAction` (`messaging.ts:417-419`) STILL fires and returns `scaffoldAnnouncement(instruction)`; the leaf catches it. The orchestrator's own frozen oracle is "feed the embedded-provider output THROUGH `finalizeTakeDraft`" — that is only the production path under refuse. Coerce-in-runDraft would make the embedded scaffold a dead, untested path, and the frozen oracle would test code production never runs.
2. **The guard is on a closed enum** (`LlmProvider = "gemini" | "other" | "embedded"`, `llm.ts:22`), NOT on scanning the body for the standing instruction. Scanning body text for `TAKE_ANNOUNCEMENT_INSTRUCTION`/`"TRANSCRIPT:"` would be exactly the keyword-guard-defeated-by-four-appended-words trap this seat exists to prevent. Branching on an enum value makes the bad state unrepresentable without a heuristic.
3. INFO-2 above: refusing costs no privacy regression, and a clear app-voice refusal is honest and actionable.

**Cost of this pin, flagged for UX/owner (W3), not for W1b:** under "embedded" the route stops working until the user switches the toggle to the AI engine. The scope already rules this fork-free (both satisfy ARC-D2's outcome). If the owner would rather it "just work," the alternative is coerce-in-runDraft (`runDraft` passes a non-embedded provider); that changes ONLY the mechanism, and I would then rewrite ARC-D2's instrument to a pure `resolveTakeDraftProvider` leaf over the closed enum plus a source-text wiring assertion. I did not do that because the orchestrator's frozen oracle names the leaf. **Checker: if you reject the refuse pin, the D2 instrument must change with it — do not leave the "feed embedded output through the leaf" oracle attached to a coerce implementation, or it tests a dead path.**

---

## 1. The leaf seam (proposed; the architect may adjust names, the oracles bind OUTCOMES)

```
// NEW src/lib/take-announcement-draft.ts  (pure, node-drivable, no React, no "use server")
export const EMBEDDED_DRAFT_REFUSAL = "The deterministic engine can't draft an announcement from a recording. Switch to the AI engine and try again.";
export const BLANK_DRAFT_ERROR = "Generated announcement is empty. Try again."; // byte-match walkthrough-announcement.ts:476

export type TakeDraftRaw = { title: string; message: string } | { error: string }; // draftAnnouncementAction's own return
export type FinalizeResult = { ok: true; title: string; message: string } | { ok: false; error: string };

export function collectTakePermittedUrls(carriers: readonly string[]): ReadonlySet<string>;
export function finalizeTakeDraft(
  raw: TakeDraftRaw,
  args: { provider: LlmProvider; transcript: string; context: TakeAnnouncementContext }
): FinalizeResult;
```

Pinned leaf order (so sabotages discriminate cleanly): (a) `"error" in raw` -> pass the action's own error through; (b) `provider === "embedded"` -> `EMBEDDED_DRAFT_REFUSAL`; (c) trimmed title OR message empty -> `BLANK_DRAFT_ERROR`; (d) else strip unpermitted URLs from `message` and return ok.

**Carriers available to the leaf = transcript + the typed context strings only** (`topic`, `objectives`, `cardTitle`, `cardSubtitle`). The writing-style sample is fetched server-side inside `draftAnnouncementAction` (`getWritingStyleBlock(user.id)`, `messaging.ts:421`) and is NEVER returned to the client hook, so the client leaf cannot see it. Consequence: a URL that appears ONLY in the instructor's style sample would be stripped as "unpermitted." This is a known false-positive, recorded as residual R-W1b-1 below — NOT a W1b blocker (the take prompt reproduces transcript content, not the style sample's links).

**Shared-normalization requirement (load-bearing, do not skip).** `collectTakePermittedUrls` MUST build the permitted set with the exact normalization `stripUnpermittedUrls` compares against — strip `[\t\r]`, run `sanitizeResourceUrl` (`src/lib/urls.ts:224`), `new URL(...)`, compare `protocol//hostname-lowercased/pathname-trailing-slash-trimmed` — the private `normalizeForComparison` in `src/lib/walkthrough-announcement-link-guard.ts:88-98`. If the collector uses a DIFFERENT normalizer, a legitimate transcript URL silently stops matching and is stripped (the "coercion changes set membership" / "fixtures must match emitted shape" traps). Cleanest: add `collectTakePermittedUrls` INTO `walkthrough-announcement-link-guard.ts` beside `stripUnpermittedUrls`, reusing its `normalizeForComparison` + `BARE_URL_RE`, and have the leaf import both from there. Do NOT reach for the existing `collectPermittedUrls` — its arg shape is walkthrough-specific (`outline: AnnouncementOutline`, `coverageBlock`, `researchedResources`) and does not fit the take carriers.

---

## 2. The four requirements — object / instrument / direction, each with its sabotage

Test file: NEW `src/lib/take-announcement-draft.test.ts`. All MACHINE (pure leaf over node). The stage transitions and the rendered "Try again" affordance are READ (R6), not asserted here.

### ARC-D2 (G1, load-bearing) — the embedded draft is never the prompt
- **Object:** the `FinalizeResult` for `provider === "embedded"` fed the real embedded scaffold output.
- **Instrument / construction:** build the input the way production does — `scaffoldAnnouncement(buildTakeAnnouncementInstruction(T, CTX))` with T, CTX frozen below. This is the measured mutant (scope §11; I re-confirmed the producers). Assertions:
  1. **PRECONDITION (keeps the mutant alive):** `input.title` contains the frozen `LEAD` AND `input.message` contains `"TRANSCRIPT:"`. If a future change to `buildTakeAnnouncementInstruction`/`scaffoldAnnouncement` stops embedding the prompt, this fails LOUDLY rather than letting the real test pass vacuously. This directly answers the "a test that could not fail" failure mode.
  2. `finalizeTakeDraft(input, {provider:"embedded", transcript:T, context:CTX}).ok === false`.
  3. `.error === EMBEDDED_DRAFT_REFUSAL` (distinguishes it from the blank refusal — asserts the RIGHT branch fired, not just some refusal).
  4. Guard-the-strings: if the result were ever `ok`, neither `title` nor `message` may contain `LEAD` or `"TRANSCRIPT:"`.
- **Fails when:** an embedded call yields an ok draft (prompt text reaches review).
- **Sabotage (proven RED):** delete the `if (provider === "embedded")` branch. Measured: assertion 2 goes RED, PRECONDITION stays GREEN (mutant real). Restore -> GREEN. **Discriminates.**

### ARC-D1 (G2) — a blank model result never reaches review
- **Object:** `FinalizeResult` over the product {title ∈ (empty, whitespace, present)} x {message ∈ (empty, whitespace, present)}.
- **Instrument:** unit table. Axes come from the type's own field cross-product, not a hand list. Expected: `ok === false` with `.error === BLANK_DRAFT_ERROR` for every case where title OR message is empty-after-trim; `ok === true` only when BOTH are non-whitespace. Plus ONE frozen-copy-literal assertion `expect(BLANK_DRAFT_ERROR).toBe("Generated announcement is empty. Try again.")` — the deliberate single place the spelling IS the fact (user-facing consistency with walkthrough sibling `walkthrough-announcement.ts:476`).
- **Fails when:** any single-blank-field result is `ok`.
- **Sabotage (proven RED):** change `!title || !message` to `!title && !message`. Measured: the four single-field cases (blank title, blank message, whitespace title, whitespace message) go RED; "both blank" and "both present" stay GREEN — proving EACH field is independently load-bearing. Restore -> GREEN. **Discriminates.**

### ARC-D3 + ARC-L1 (G4c + the removal test) — invented URL stripped, transcript URL kept byte-for-byte
- **Object:** `finalizeTakeDraft(rawWithTwoUrls, {provider:"gemini", transcript:T_WITH_URL, context:CTX}).message`.
- **Instrument:** model message carries one transcript URL (`KEPT_URL`, byte-present in T) and one invented URL (`INVENTED_URL`, in no carrier), driven through the REAL `stripUnpermittedUrls` + `collectTakePermittedUrls`. TWO assertions, at BOTH ends of the slice:
  1. `.message` does NOT contain `INVENTED_URL`.
  2. `.message` DOES contain `KEPT_URL` (exact substring, byte-for-byte).
- **Fails when:** invented URL survives, OR transcript URL is removed/altered.
- **Sabotages (both proven, opposite directions):**
  - **ARC-L1 removal:** delete the `stripUnpermittedUrls(...)` call (return `message` unchanged). Measured: assertion 1 (invented stripped) RED, assertion 2 (kept) GREEN. This is the removal test — deleting the guard flips the assertion, not just breaking it.
  - **Strip-everything:** replace the permitted set with `new Set()`. Measured: assertion 2 (kept byte-for-byte) RED, assertion 1 GREEN. This proves assertion 2 is not decorative — it catches an over-strip that assertion 1 cannot.
  - Both restore -> GREEN. **Both discriminate, in opposite directions.**

### ARC-L1 source-text wiring half — `runDraft` consumes the leaf
- **Object:** `src/app/components/recording/useTakeAnnouncement.ts` source.
- **Instrument:** a source-text test MIRRORING `useTakeAnnouncement.image-copy-safety.test.ts` (read the file with `fs.readFileSync`; DO NOT import from another `*.test.ts` — duplicate the `readFileSync` boilerplate). Pin the FACT and the ORDERING, never the spelling (the "source-text tests over-specify" trap, twice-measured here):
  1. The module imports `finalizeTakeDraft` from the leaf module (`/import\s*\{[^}]*\bfinalizeTakeDraft\b[^}]*\}\s*from\s*["']@?\.?.*take-announcement-draft/`).
  2. `runDraft`'s body contains a call `finalizeTakeDraft(` AND the `setSubject(...)`/`setBody(...)` calls that currently read `result.title`/`result.message` (`useTakeAnnouncement.ts:536-537`) now read from the finalized ok result — assert `setSubject`/`setBody` arguments are NOT the raw action `result` (i.e. the body between `finalizeTakeDraft(` and `setSubject(` is non-trivial). Keep this loose: assert the identifier `finalizeTakeDraft` is called and that `setSubject`/`setBody` exist after it; do not pin exact variable names.
  3. A self-check "finds at least one `finalizeTakeDraft(` — a check over nothing proves nothing" (mirrors the sibling's own line 32-35 discipline).
  4. An in-file sabotage check (a frozen sabotaged snippet string) proving the regex would catch removal — exactly as the sibling's lines 51-56 do.
- **Fails when:** `runDraft` stops calling the leaf (the defect ships with the leaf present-but-unwired — the "assignment must include the wiring file" / "capability can ship dead" trap).
- **Sabotage:** remove the `finalizeTakeDraft(` call from `runDraft`; the source-text regex goes RED. (Argued, not executed — I cannot run a source-text test against an edited hook without writing to the repo; the sibling pattern is proven to discriminate at `image-copy-safety.test.ts:51-56`.)

**Error-passthrough axis (free, strengthens D1/D2):** `finalizeTakeDraft({error:"Draft failed: HTTP 500"}, ...).ok === false` and `.error === "Draft failed: HTTP 500"`. Proven GREEN in the reference; guards against a leaf that swallows the action's own transport error into a generic message.

---

## 3. Satisfiability proof (test-seat practice #1 — OBLIGATION, done)

One reference leaf passes the embedded-refuse, blank-guard, and URL-strip oracles AT ONCE. Scratchpad: `.../scratchpad/finalize-ref.ts` + `finalize.probe.test.ts`, run with a plain-object config (importing `vitest/config` from outside the repo fails to resolve — the scope seat hit the same, I reused their workaround). Result: **11 tests, all green.** Sabotages then measured one at a time:

| Mutation | Red assertion(s) | Still green (proves discrimination) |
|---|---|---|
| remove `provider==="embedded"` branch | D2 refuse | PRECONDITION (mutant real) |
| `\|\|` -> `&&` in blank guard | 4 single-field blank cases | both-blank, both-present |
| remove `stripUnpermittedUrls` call | D3 invented-stripped (= ARC-L1 removal) | D3 kept-byte-for-byte |
| empty permitted set (strip-everything) | D3 kept-byte-for-byte | D3 invented-stripped |

No mutant was rebuilt or banked without discriminating; every one above is red in exactly one direction and green on restore. The reference is NOT a hand-off artifact — the implementer writes the real leaf; it only proves the four red tests are jointly satisfiable.

A note worth surfacing: the shared scratchpad already holds W1a's `plan.probe.test.ts`, whose 600s/9.6M-sample case OOM-kills a node worker. My `finalize.probe.test.ts` is independent; I narrowed the include glob to isolate it. If W1a and W1b ever run probes under one config, that OOM is theirs, not a W1b signal.

---

## 4. Frozen literals / constructions (state them as the implementer must freeze them)

- `LEAD = "Write a short announcement for students about this recording"` — the first sentence of `TAKE_ANNOUNCEMENT_INSTRUCTION` (`take-announcement.ts:126-127`), which is ALSO the embedded scaffold's title (`embedded/communication.ts:17-28`, measured in scope §11 and re-confirmed). This is a frozen COPY literal: the spelling IS the fact (the draft must not contain this exact prompt text).
- `TRANSCRIPT_MARKER = "TRANSCRIPT:"` — emitted at `take-announcement.ts:241`.
- `BLANK_DRAFT_ERROR = "Generated announcement is empty. Try again."` — byte-match `walkthrough-announcement.ts:476`.
- `EMBEDDED_DRAFT_REFUSAL` — I propose the wording in §1; its EXACT spelling is UX-seat copy (W3). The D2 test asserts `result.error === EMBEDDED_DRAFT_REFUSAL` by SYMBOL (imported from the leaf), so the branch is pinned without freezing a spelling in the test file. Whatever ships must be a single named constant, not an inline string.
- `CTX: TakeAnnouncementContext = { takeName: "Take 1", durationSec: 90 }`.
- `T_WITH_URL = "Today we covered loops. The lab is at https://canvas.example.edu/courses/5/assignments/9 due Friday."`; `KEPT_URL = "https://canvas.example.edu/courses/5/assignments/9"`; `INVENTED_URL = "https://totally-invented.example/handout"`.
- The embedded D2 INPUT is CONSTRUCTED live via `scaffoldAnnouncement(buildTakeAnnouncementInstruction(T_WITH_URL, CTX))` (drives the production producers) and GUARDED by the precondition — not frozen as a string literal, because freezing scaffold output would rot silently if the producers change; the precondition is what keeps it honest.

---

## 5. Executable here vs argued

- **Executable (MACHINE), proven green + sabotage-red in the scratchpad:** ARC-D1 (blank guard, all axes), ARC-D2 (embedded refuse + precondition), ARC-D3 (strip invented), ARC-L1 leaf half (removal + strip-everything), error passthrough.
- **Argued, NOT executed (labelled as argued):** the ARC-L1 SOURCE-TEXT wiring half. I cannot run a source-text test against an edited `useTakeAnnouncement.ts` without writing to the repo tree. Its discrimination is inherited from the proven `image-copy-safety.test.ts:51-56` pattern. The implementer MUST include the in-file sabotage self-check so this is executable once written.
- **READ / OWNER (not asserted here):** the `{phase:"failed", stage:"draft"}` transition rendering the error with a "Try again" affordance (R6, `useTakeAnnouncement.ts:531` is the existing sink the leaf error flows into); whether the refusal copy reads in the app's voice; the actual on-screen behaviour under embedded.

---

## 6. Residual register (owner / instrument / measuring step — none missing all three)

| Id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-W1b-1 | The client leaf cannot see the server-side writing-style sample, so a URL present ONLY in the style sample is stripped as unpermitted (false positive) | architect (confirm acceptable) / owner (product) | read `messaging.ts:421` (style block fetched server-side, never returned) | architect pass on W1b seam; owner decides if style-sample links must survive |
| R-W1b-2 | Refusing "embedded" blocks the route until the user switches the toggle | UX seat (W3 copy) / owner | READ of the refusal affordance; no render under vitest | W3 UX pass + owner verify in a real browser |
| R-W1b-3 | `collectTakePermittedUrls` and `stripUnpermittedUrls` must share `normalizeForComparison`; drift silently strips legit transcript URLs | implementer; checker verifies | the D3 kept-byte-for-byte assertion is the guard, IF the collector is co-located; a separate normalizer would need its own test | build + checker of W1b test code |
| R-W1b-4 | D2 input is constructed from live producers; if `buildTakeAnnouncementInstruction`/`scaffoldAnnouncement` change, the PRECONDITION fails loudly (by design) rather than the test passing vacuously | test author (this seat) | the PRECONDITION assertion itself | every run of the D1-D3 suite |

---

## 7. Constraints honored
Frozen literals, no recomputation (constructions stated). Pure/node-drivable; `draftAnnouncementAction`/`callLlm` never invoked with a real provider — the leaf takes the RAW result, so no network, no mock-the-wrong-thing (`canvasFetch`/`fetch` not on this path). No emojis. No cross-`*.test.ts` imports (duplicate the `readFileSync` boilerplate). 1000-line ceiling respected: the logic lives in the NEW `take-announcement-draft.ts` leaf; `useTakeAnnouncement.ts` (measured 915 by scope) gains only the import + the `finalizeTakeDraft(...)` call + the ok/error branch in `runDraft` (~6-8 lines), well inside its ~85-line headroom. No `/s` dotAll flag anywhere. This is DISJOINT from W1a (I touched none of its files).

## Files the build will create/edit (for the plan/implementer)
- NEW `src/lib/take-announcement-draft.ts` (leaf + `EMBEDDED_DRAFT_REFUSAL`, `BLANK_DRAFT_ERROR`, `collectTakePermittedUrls`, `finalizeTakeDraft`) — or put `collectTakePermittedUrls` into `src/lib/walkthrough-announcement-link-guard.ts` to share `normalizeForComparison` (my recommendation; see R-W1b-3).
- NEW `src/lib/take-announcement-draft.test.ts` (ARC-D1/D2/D3/L1 leaf half).
- EDIT `src/app/components/recording/useTakeAnnouncement.ts` (`runDraft` ~:513-537: import + call the leaf, branch on ok/error into existing `setSubject`/`setBody` / `setStage({phase:"failed",stage:"draft"})`).
- NEW `src/app/components/recording/useTakeAnnouncement.draft-finalize.wiring.test.ts` (ARC-L1 source-text half, mirroring `image-copy-safety.test.ts`).
