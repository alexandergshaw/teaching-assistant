# CHATBOT-FORMALITY-SCALE - scope / recon

Owner, 2026-10-06: "include a formality scale on the ai chatbot, dictating how
formal the responses should be." A control in the app-wide chat FAB window that
sets how formal the chatbot's responses are, injected into the chat system
instruction.

This is the ARCHITECT/recon artifact. Scope only, no code. A fresh loop-checker
reads it before any build. Every quantity below names the command that produced
it. Every `file:line` was opened.

---

## 0. Measured facts this scope rests on

All commands run from repo root, this checkout, 2026-10-06.

| Fact | Command | Value |
|---|---|---|
| AiChatWindow size | `@(Get-Content src/app/components/AiChatWindow.tsx).Count` | 978 |
| AiChatFab size | `@(Get-Content src/app/components/AiChatFab.tsx).Count` | 943 |
| ResponseModeStrip size | `@(Get-Content src/app/components/chat/ResponseModeStrip.tsx).Count` | 47 |
| system-instruction size | `@(Get-Content src/lib/chat/system-instruction.ts).Count` | 54 |
| types.ts size | `@(Get-Content src/lib/chat/types.ts).Count` | 116 |
| SegmentedToggle size | `@(Get-Content src/app/components/ui/SegmentedToggle.tsx).Count` | 151 |
| No pre-existing formality code | `grep -rln "ChatFormality\|ask-ai-formality\|formalityDirective" src` | exit 1 (nothing) |

`wc -l` (Bash tool) and `@(Get-Content).Count` agreed on AiChatWindow (978) and
AiChatFab (943) - no 42-line gap on these two files. Re-measure both post-build
anyway (the ceiling gate is unconditional).

The voice-toggle seam this item reuses shipped at **0f2de815** (W1, byte-identical
seam) + **68982439** (W2, the UI). Both were opened in full.

---

## 1. The seam that already exists (opened, not recalled)

The feature rides the exact composition the voice toggle built. Four existing
pieces, each cited:

- **`src/lib/chat/system-instruction.ts:41`** - `buildChatSystemInstruction(styleBlock: string): string`.
  Composes `INSTRUCTOR_AUDIENCE_INSTRUCTION` (`:19`) + `PLAIN_TEXT_ONLY_INSTRUCTION`
  (`:27`) as `base`, then appends `styleBlock` + the "Mimic this writing tone"
  clause when `styleBlock` is non-empty (`:42-44`).
- **`src/lib/chat/system-instruction.ts:52`** - `chatStyleBlockForMode(styleBlock, mode)`:
  the pure voice-toggle function; returns `""` iff `mode === "informational"`,
  else `styleBlock`. The model under this scope is the SAME: a pure function from
  the chosen level to a directive string, `""` for the default level.
- **`src/lib/chat/types.ts:13`** - `export type ChatResponseMode = "voice" | "informational";`.
  The new `ChatFormality` type sits beside it.
- **`src/app/api/ai-chat/route.ts:82-86`** - `RequestBody.responseMode?: ChatResponseMode`,
  read at **`:656`**: `systemInstruction: buildChatSystemInstruction(chatStyleBlockForMode(styleBlock, body.responseMode))`.
  `styleBlock` is resolved at **`:496`** (`getWritingStyleBlock(userId)`, degrades
  to `""` for anonymous/missing/failed - never throws). The embedded provider
  never reaches this call (it never calls a model), so a directive injected here
  is automatically a no-op for embedded, exactly like `styleBlock` is today.
- **Client producer: `src/app/components/AiChatFab.tsx`** - owns the voice state
  (`:219-225`), persists `ta:ask-ai-voice-mode` (`:331`, via `writeLS`), sends
  `responseMode` in the `/api/ai-chat` POST body (`:523`), and passes the control
  to the window as a prop (`:869-874`). `readLS`/`writeLS` (`:60`/`:70`) prefix
  every key with `LS_PREFIX = "ta:"` (`:58`) and JSON round-trip the value.
- **Control: `src/app/components/chat/ResponseModeStrip.tsx`** (47 lines) - a thin
  leaf that composes the house `SegmentedToggle` (`src/app/components/ui/SegmentedToggle.tsx`,
  native `<button>`s, roving tabindex, `aria-pressed`, keyboard Arrow/Home/End -
  never MUI). Rendered by `AiChatWindow.tsx:725` via an optional
  `responseMode?: ResponseModeStripProps` prop (`:125,:158`), so
  `SelectionChatWidget.tsx:201` (which omits the prop) shows no control.

---

## 2. Seam design (the SHAPE this scope commits to)

### 2.1 The directive is a NEW composition arm, not a reuse of `styleBlock`

Formality is logically independent of voice (F3, below): voice decides WHOSE
style (`styleBlock`), formality decides HOW FORMAL. So formality is a SECOND
argument to `buildChatSystemInstruction`, not a mutation of `styleBlock`.

**New signature (the one shape every later wave is built against):**

```ts
// src/lib/chat/system-instruction.ts
export function buildChatSystemInstruction(
  styleBlock: string,
  formalityDirective = "",   // NEW, defaulted so existing one-arg callers are unchanged
): string {
  const base = `${INSTRUCTOR_AUDIENCE_INSTRUCTION}\n\n${PLAIN_TEXT_ONLY_INSTRUCTION}`;
  const withStyle = !styleBlock
    ? base
    : `${base}${styleBlock}\n\nMimic this writing tone (word choice, rhythm, sentence length, personality) in every reply, while still strictly obeying the plain-text formatting rule above.`;
  if (!formalityDirective) return withStyle;        // byte-identical to today
  return `${withStyle}\n\n${formalityDirective}`;   // formality LAST (see 2.3)
}
```

**Why the second parameter and not a widened `styleBlock`:** folding formality
into `styleBlock` would make it vanish whenever voice is set to informational
(`chatStyleBlockForMode` returns `""`), because the informational path drops the
whole block. Formality must survive independently of the voice choice (F3). A
separate arm is the only shape that composes both.

**Byte-identity guarantee:** when `formalityDirective === ""`, the function
returns `withStyle`, which is CHARACTER-FOR-CHARACTER today's output (the
default-neutral and wire-absent cases both resolve to `""`). The existing five
`buildChatSystemInstruction` tests call it with one argument
(`system-instruction.test.ts:28,34,43`), so the defaulted parameter leaves them
green with no edit.

### 2.2 The pure level->directive function

```ts
// src/lib/chat/types.ts  (beside ChatResponseMode at :13)
export type ChatFormality = "casual" | "neutral" | "formal";

// src/lib/chat/system-instruction.ts  (beside chatStyleBlockForMode)
export function formalityDirectiveForLevel(level: ChatFormality | undefined): string {
  if (level === "casual") return CASUAL_FORMALITY_DIRECTIVE;
  if (level === "formal") return FORMAL_FORMALITY_DIRECTIVE;
  return "";   // "neutral", undefined, and any unknown value -> no directive = today
}
```

Note the mirror of `chatStyleBlockForMode`'s backward-compatibility: an absent or
unrecognised value yields `""` (today's behaviour), never a thrown error.

**Proposed directive text (plain-text-respecting, no emojis, instructor voice).**
The test seat owns the final frozen literal; these are concrete defaults for the
oracle, not placeholders:

- `CASUAL_FORMALITY_DIRECTIVE` = `"Keep the tone casual and conversational: relaxed and friendly, contractions are fine, and prefer plain everyday words over formal ones. Stay clear and correct."`
- `FORMAL_FORMALITY_DIRECTIVE` = `"Keep the tone formal and professional: full sentences, precise and measured diction, no contractions, and no slang or casual asides."`

Both touch REGISTER only, never formatting, so neither collides with
`PLAIN_TEXT_ONLY_INSTRUCTION` (which stays verbatim and ahead of both, per its
own `:26` comment).

### 2.3 Position: formality directive LAST

The directive is appended at the END of the whole instruction - after the
"Mimic this writing tone" clause when `styleBlock` is present, after `base` when
absent. Rationale: when the user has BOTH a writing sample (voice) and an
explicit formality pick, the sample's implicit register and the explicit pick can
disagree (e.g. a casual sample + a "formal" pick). Placing the explicit pick last
gives it recency precedence, which resolves the tension toward what the user
deliberately chose. This is a judgment, not a measurable fact (no model runs
here); it is recorded as residual R3 for the owner walk.

### 2.4 The route thread

```ts
// src/app/api/ai-chat/route.ts:656  (replacing the current one-arg call)
systemInstruction: buildChatSystemInstruction(
  chatStyleBlockForMode(styleBlock, body.responseMode),
  formalityDirectiveForLevel(body.formality),
),
```

plus `formality?: ChatFormality;` on `RequestBody` (beside `responseMode` at
`route.ts:82-86`), imported from `@/lib/chat/types`.

### 2.5 Client (AiChatFab)

Mirror the voice-mode wiring, with ONE simplification: **formality needs no
disable/coercion logic.** Voice has `voiceDisabled`/`effectiveResponseMode`
(`AiChatFab.tsx:223-225`) because voice cannot be produced without a writing
sample. Formality has no such precondition - it applies to any model reply - so
the state is sent as-is. This is the concrete confirmation of F3's independence.

```ts
const [formality, setFormality] = useState<ChatFormality>(() => {
  const v = readLS<ChatFormality>("ask-ai-formality", "neutral");
  return v === "casual" || v === "formal" ? v : "neutral";   // coerce to a valid level
});
useEffect(() => { writeLS("ask-ai-formality", formality); }, [formality]);
```

- Send `formality` in the `/api/ai-chat` POST body. **Place it adjacent to
  `responseMode` (AiChatFab.tsx:523)**, early in the body, so it does not push
  `selectionContextText` past the 1200-char bounded slice that
  `askAiSelection.wiring.test.ts:255` reads (see owns note, section 6).
- Add `effectiveResponseMode` to the send callback's dep array already exists;
  add `formality` to that same dep array (`AiChatFab.tsx:564`).
- Pass a `formality` prop object to `<AiChatWindow>` (`:869`), mirroring the
  `responseMode` prop.

### 2.6 Control leaf (NEW: FormalityStrip)

A NEW thin leaf `src/app/components/chat/FormalityStrip.tsx` (~30 lines),
mirroring `ResponseModeStrip.tsx` exactly: composes `SegmentedToggle<ChatFormality>`
with three options `Casual / Neutral / Formal`, `label="Response formality"`,
`showLabel`.

```ts
export interface FormalityStripProps {
  value: ChatFormality;
  onChange: (next: ChatFormality) => void;
}
```

No `disabled`/`showSampleLink` surface (formality has no precondition).

**Why a new leaf and NOT extending ResponseModeStrip:** ResponseModeStrip carries
voice-specific props (`voiceDisabled`, `showSampleLink`) that formality does not
share; merging bloats the prop surface and couples two controls that the
in-flight CHATBOT-MODAL-VISUAL overhaul may want to lay out separately. Two thin
leaves keep AiChatWindow's addition to one import + one optional prop + one render
line, and keep each control independently styleable.

### 2.7 AiChatWindow render

```ts
// prop (beside responseMode? at :125)
formality?: FormalityStripProps;
// render (directly after the ResponseModeStrip line at :725)
{formality && <FormalityStrip {...formality} />}
```

`SelectionChatWidget.tsx:201` omits the prop -> no formality control in the
selection chat (same as it omits `responseMode`).

**DOM order / placement** is a UX/visual decision; the default here is the
formality strip immediately after the response-mode strip, before the tone-status
chip (`AiChatWindow.tsx:726`). The UX/visual seat (or the owner walk) refines it.

---

## 3. The three forks, each recommended

### F1 - GRANULARITY. RECOMMEND: discrete 3-level SegmentedToggle (Casual / Neutral / Formal).

- The house idiom for a small mutually-exclusive choice IS `SegmentedToggle`
  (`SegmentedToggle.tsx`), already used by the sibling voice toggle. A numeric
  slider (1-5) needs a NEW component this repo does not have, and the levels
  still have to map to discrete directive strings anyway - the slider buys
  nothing but surface. Three levels is the minimum that expresses "more / default
  / less" with a neutral middle that is the no-op default (F2).
- Exact levels and their directives: section 2.2. `neutral` is the middle and the
  default.

### F2 - DEFAULT. RECOMMEND: Neutral = NO directive = byte-identical to today.

- Mirrors the voice toggle's wire-absent = today. `formalityDirectiveForLevel("neutral")`
  returns `""`, and `buildChatSystemInstruction(sb, "")` is character-identical to
  today's output. Nothing changes until the user explicitly picks Casual or
  Formal. Persisted default key value is `"neutral"`.

### F3 - INTERACTION WITH VOICE MODE. RECOMMEND: independent + composable.

- Voice (`responseMode`) controls WHOSE style via `styleBlock`; formality controls
  HOW FORMAL via a separate directive arm (section 2.1). Both can be present in
  one system instruction. They are wired through DIFFERENT parameters of
  `buildChatSystemInstruction`, so neither erases the other - in particular,
  choosing "Just answer me" (informational, `styleBlock` dropped) does NOT drop
  the formality directive, and vice versa.
- **Known tension, not a contradiction:** a `formal` directive beside a casual
  writing sample ("mimic this tone") can pull in opposite directions. The default
  resolution is formality-LAST for recency precedence (section 2.3). Whether that
  feels right is unmeasurable here (no model runs) and is **residual R3**, an
  owner walk. The composition itself is sound; only the felt blend is open.

---

## 4. Acceptance criteria

Machine-checkable here means: a pure function with a frozen oracle, a persisted
key, and source-text wiring. Nothing renders and no API key exists, so felt
formality and the rendered control are owner walks.

**AC1 - the directive map is a pure function with a frozen oracle.**
Object: `formalityDirectiveForLevel`. Instrument: a unit test asserting exact
return values. Failure direction: any level mapping to the wrong string, or the
default level mapping to a non-empty string.
- `formalityDirectiveForLevel("neutral") === ""`
- `formalityDirectiveForLevel(undefined) === ""`
- `formalityDirectiveForLevel("garbage" as unknown as ChatFormality) === ""`
- `formalityDirectiveForLevel("casual") === CASUAL_FORMALITY_DIRECTIVE` (frozen literal, non-empty)
- `formalityDirectiveForLevel("formal") === FORMAL_FORMALITY_DIRECTIVE` (frozen literal, non-empty)
- `CASUAL_FORMALITY_DIRECTIVE !== FORMAL_FORMALITY_DIRECTIVE` (the two non-default levels differ)

**AC2 - default/neutral/wire-absent is byte-identical to today.**
Object: `buildChatSystemInstruction`'s output. Instrument: a unit test comparing
strings. Failure direction: the two-arg neutral form differing from the one-arg
form by a single byte. For `styleBlock` in `{"", "\n\nWRITING SAMPLE\nSome prose."}`:
- `buildChatSystemInstruction(sb) === buildChatSystemInstruction(sb, "")`
- `buildChatSystemInstruction(sb) === buildChatSystemInstruction(sb, formalityDirectiveForLevel("neutral"))`
- `buildChatSystemInstruction(sb) === buildChatSystemInstruction(sb, formalityDirectiveForLevel(undefined))`

**AC3 - a non-default level is actually composed into the instruction.**
Object: `buildChatSystemInstruction` output with a non-empty directive. Instrument:
unit test. Failure direction: the directive absent from, or not at the end of, the
output.
- `buildChatSystemInstruction("", FORMAL_FORMALITY_DIRECTIVE).endsWith(FORMAL_FORMALITY_DIRECTIVE)` is true
- the output `.includes(PLAIN_TEXT_ONLY_INSTRUCTION)` is still true (plain-text rule survives)
- with a style block present, the output contains BOTH the mimic clause AND the
  directive (voice and formality compose - the F3 removal evidence)

**AC4 - persisted key.**
Object: the `localStorage` key. Instrument: source-text (the key is only reachable
through `readLS`/`writeLS`, which prefix `ta:`). Failure direction: the FAB not
reading or not writing `ask-ai-formality`. (The literal stored key is
`ta:ask-ai-formality`.)

**AC5 - the seam is instrumented at BOTH ends so formality cannot ship dead.**
Mirror `responseMode.wiring.test.ts` (both halves). Object: route source + FAB
source. Instrument: source-text wiring test (`formality.wiring.test.ts`, section
5). Failure direction: any of (a) RequestBody not declaring `formality`, (b) route
not reading `body.formality`, (c) route not threading
`formalityDirectiveForLevel(body.formality)` into `buildChatSystemInstruction`,
(d) FAB not sending `formality:` in the POST body, (e) FAB not reading/writing the
`ask-ai-formality` key.

**AC6 (owner walk, not machine-checkable here) - felt formality + rendered
control.** The rendered SegmentedToggle's look/placement in the small chat window,
and whether Casual/Formal replies actually read casual/formal from the live model.
No instrument exists (no component renders; no API key). Residuals R1, R2, R3.

### Leverage (flag for the AC/owner, not claimed here)

This feature is the same SHAPE as the voice toggle and the `AskAiModal` negative
example in `docs/loop/leverage.md`: one directive string injected into one prompt,
one model call, the answer not persisted, no receipt, no scale. The honest claim
is thin - a persisted CONTROL that saves the user re-typing "be more formal" each
message - which is **click-cost / control-cost, not a categorical advantage over a
chat**. Recommend the **accept-the-cost-explicitly** disposal (same as the voice
toggle's `F5 leverage = accept-cost`), stated so a later reader does not credit it
with integration or persistence it does not have. There is no buildable removal
test here (the advantage is clicks/attention, which nothing in this suite can
observe) - record it as a residual with the owner as its step, per
`seats.md` Test seat. The claim decision is the owner's, never defaulted by a seat.

---

## 5. Instruments to build (test seat owns the oracle; shapes given)

1. **`src/lib/chat/system-instruction.test.ts`** (ADOPT - add describe blocks,
   leave the existing five untouched): AC1, AC2, AC3 above.
2. **`src/app/components/chat/formality.wiring.test.ts`** (NEW): AC5, mirroring
   `responseMode.wiring.test.ts` - the route-half (RequestBody declares,
   `body.formality` read, threaded through `formalityDirectiveForLevel`) and the
   client-half (FAB sends `formality:` in the POST body; FAB reads/writes
   `ask-ai-formality`).

   **Name its source-strip helper `withoutLineComments`, NOT `stripComments`.**
   `src/tools/strip-comments-agreement.structure.test.ts` enumerates every
   `*.test.ts` that DEFINES a helper named `stripComments`
   (`function stripComments(` / `const stripComments =`, matched at `:96,:103`;
   different names like `stripCommentsForScan` are explicitly NOT matched,
   `:304-307`) and reddens repo-wide until each is classified. Naming the helper
   `withoutLineComments` (the CRLF-safe idiom this-repo.md:179 sanctions) dodges
   that canary entirely - no SAFE_FILES edit, no same-commit classification. This
   is the W1 trap (0f2de815 named its helper `stripComments`, omitted the
   content-triggered canary from its gate, and left main red until 68982439
   classified it). Do not repeat it: use `withoutLineComments`.

   The route-threading assertion must tolerate the TWO-argument call - do NOT
   copy responseMode's `...\)\s*\)/` trailing form (that form asserts a sole
   argument). Assert instead that the route source contains `body.formality` and
   `formalityDirectiveForLevel(` within the `buildChatSystemInstruction(` call
   region.

The reference-implementation obligation (prove the red tests are satisfiable) is
trivially met here: section 2 is a complete reference. The test seat still states
it per its 2026-09-20 practice.

---

## 6. The `owns` file list (derived, command pasted)

Command for files that READ my edited files as source text:

```
grep -rln "api/ai-chat/route.ts\|AiChatFab.tsx\|AiChatWindow.tsx\|chat/system-instruction\|chat/types\|ResponseModeStrip\|FormalityStrip" src --include=*.test.ts | sort -u
```

Output (2026-10-06):
```
src/app/components/FabQuickActionsMenu.wiring.test.ts
src/app/components/accommodations/accommodations.structure.test.ts
src/app/components/chat/institutionResolutionWiring.test.ts
src/app/components/chat/institutionTriggerWiring.test.ts
src/app/components/chat/responseMode.wiring.test.ts
src/app/components/content-tab/modules/askAiSelection.wiring.test.ts
src/app/components/live-class/fab-live-indicator.test.ts
src/app/components/manual/manual-rail.test.ts
src/app/components/wb-remembered-fab-launch.wiring.test.ts
src/lib/chat/knowledge-context.test.ts
```

### Write set (files this item edits/adds)

| File | Disposition |
|---|---|
| `src/lib/chat/types.ts` | EDIT - add `ChatFormality` |
| `src/lib/chat/system-instruction.ts` | EDIT - 2nd param + `formalityDirectiveForLevel` + two directive consts |
| `src/lib/chat/system-instruction.test.ts` | ADOPT - new describe blocks (AC1-3); existing five unchanged |
| `src/app/api/ai-chat/route.ts` | EDIT - `RequestBody.formality` + thread at `:656` |
| `src/app/components/chat/responseMode.wiring.test.ts` | **ADOPT (MUST EDIT)** - see below |
| `src/app/components/AiChatFab.tsx` | EDIT - state/persist/send/prop |
| `src/app/components/AiChatWindow.tsx` | EDIT - prop + render line |
| `src/app/components/chat/FormalityStrip.tsx` | NEW leaf |
| `src/app/components/chat/formality.wiring.test.ts` | NEW instrument |

### The one adopted test that a CORRECT change turns RED

**`src/app/components/chat/responseMode.wiring.test.ts:33`** asserts:
```
/buildChatSystemInstruction\(\s*chatStyleBlockForMode\(\s*styleBlock\s*,\s*body\.responseMode\s*\)\s*\)/
```
The trailing `\)\s*\)` requires `chatStyleBlockForMode(...)` to be the SOLE
argument to `buildChatSystemInstruction(`. Adding the second argument
(`formalityDirectiveForLevel(body.formality)`) makes the next character after the
inner `)` a comma, so this regex **stops matching** - a correct change goes red.
This file MUST be in the write set and its regex relaxed (e.g. match
`chatStyleBlockForMode(styleBlock, body.responseMode)` without anchoring the
outer close, so it tolerates a following `,`). This is the exact "a test that
greps a string it does not own is how a correct change goes red" case; it is
owned and handled, not discovered at the gate.

### Other matched tests - checked, NOT affected (classified checked-safe)

- `askAiSelection.wiring.test.ts` reads AiChatFab's `fetch("/api/ai-chat")` body
  (`:252`, bounded slice `fetchIdx..+1200`, `:255`) and the `RequestBody`
  interface (`:264`), but asserts only `toContain("selectionContextText:")` and
  `toContain("selectionContextText")` - ADDITIVE substring checks. Adding a
  `formality` field is safe **provided** `formality` is placed adjacent to
  `responseMode` (early in the body) so `selectionContextText` stays inside the
  1200-char window (section 2.5). Run this test in the wave gate to confirm.
- The other eight matched files (`FabQuickActionsMenu`, `accommodations`,
  `institutionResolutionWiring`, `institutionTriggerWiring`, `fab-live-indicator`,
  `manual-rail`, `wb-remembered-fab-launch`, `knowledge-context`) matched on an
  incidental mention; `grep -n "RequestBody\|fetch(\"/api/ai-chat\"\|buildChatSystemInstruction"`
  found no pin on any region this item edits. Checked-safe.

### Not trivially revertible

Nothing. Every change is additive behind a byte-identical default. The route-call
shape change is covered by the adopted `responseMode.wiring.test.ts` edit. No
migration, no persisted-shape change to an existing key (a NEW `ta:` key only).

---

## 7. Wave plan

Mirror the voice toggle (W1 byte-identical seam, W2 UI). Two waves, dependency-
ordered; each independently pushable. (One wave is defensible given the small
size, but two matches the shipped precedent and keeps the byte-identical seam
provable on its own.)

**W1 - the seam (byte-identical, no UI).** Write set:
- `src/lib/chat/types.ts` (`ChatFormality`)
- `src/lib/chat/system-instruction.ts` (2nd param + `formalityDirectiveForLevel` + directive consts)
- `src/lib/chat/system-instruction.test.ts` (AC1-3)
- `src/app/api/ai-chat/route.ts` (`RequestBody.formality` + thread at `:656`)
- `src/app/components/chat/responseMode.wiring.test.ts` (relax the regex - REQUIRED by the route change)
- `src/app/components/chat/formality.wiring.test.ts` (route-half of AC5)

After W1, the wire is absent from every client -> byte-identical to today. The
caller of the new export (`formalityDirectiveForLevel`) IS the route in this same
wave (`seats.md` rule: every wave includes the file that calls each new export).
`ChatFormality` is type-only; `formalityDirectiveForLevel` and
`buildChatSystemInstruction`'s new arm are called by `route.ts` here.

**W2 - the UI.** Write set:
- `src/app/components/chat/FormalityStrip.tsx` (NEW leaf; its caller is AiChatWindow, same wave)
- `src/app/components/AiChatWindow.tsx` (prop + render; caller of FormalityStrip)
- `src/app/components/AiChatFab.tsx` (state/persist/send/pass prop; caller/producer)
- `src/app/components/chat/formality.wiring.test.ts` (ADOPT - add the client-half of AC5)

### Gate (both waves; test:paths one path per arg)

```
npm run test:paths src/lib/chat/system-instruction.test.ts src/app/components/chat/responseMode.wiring.test.ts src/app/components/chat/formality.wiring.test.ts src/app/components/content-tab/modules/askAiSelection.wiring.test.ts src/file-size-ceiling.structure.test.ts
```
- `test:paths`, never a raw multi-path `vitest`/`npm test` (which silently drops
  unmatched args, this-repo.md:53-66).
- **`src/file-size-ceiling.structure.test.ts` UNCONDITIONALLY** (this-repo.md:42-49).
  Post-W2 projected sizes: AiChatFab 943 + ~12 ~= 955; AiChatWindow 978 + ~4 ~=
  982. Both under 1000 but AiChatWindow is tight - **re-measure with
  `@(Get-Content AiChatWindow.tsx).Count` after W2** and keep the control UI in
  the FormalityStrip leaf, not inline.
- **Strip-comments canary: NOT required IF the new helper is named
  `withoutLineComments`** (section 5). If an implementer instead names it
  `stripComments`, then `src/tools/strip-comments-agreement.structure.test.ts`
  MUST be in the gate AND the new file classified into its `SAFE_FILES` in the
  SAME commit (the W1/68982439 trap). The recommendation is to use
  `withoutLineComments` and avoid the canary.
- Plus the standard wave gate: `git status --short` vs the assignment, `npx tsc
  --noEmit` (single caller), `npm run lint` (no NEW warning in written files).

---

## 8. Serialization / ordering vs CHATBOT-MODAL-VISUAL

**Shared files** (both items touch): `AiChatWindow.tsx`, `AiChatFab.tsx`, and the
chat CSS module (`page.module.css`, which `ResponseModeStrip`/`FormalityStrip`
import for `styles.selectionChatContext` etc.). CHATBOT-FORMALITY-SCALE also
shares `system-instruction.ts`/`types.ts` with the voice toggle's shipped code
(already merged, not in flight).

**These two items are NOT disjoint and must NOT run concurrently** - they edit the
same two `.tsx` files. Per `parallel-disjointness.md`, a shared file forces
serialization.

**RECOMMENDED ORDER: CHATBOT-FORMALITY-SCALE lands FIRST, then CHATBOT-MODAL-VISUAL.**
Reason: this item adds a CONTROL (the FormalityStrip leaf + its render line). The
visual overhaul then styles the COMPLETE control set (ResponseModeStrip +
FormalityStrip + composer + context strips + tone chips) in one pass, rather than
styling a control set that is about to grow. If the overhaul lands first, it must
be re-opened to style the new strip - wasted work.

The CHATBOT-MODAL-VISUAL recon (in flight, `docs/grading-chat-visual-scope.md` is
a different item; the modal-visual recon is dispatched per backlog row 231) must
be told: **a FormalityStrip control is arriving beside ResponseModeStrip; account
for both in the layout, and do not regress either strip's structure or the
`ta:ask-ai-formality` / `ta:ask-ai-voice-mode` persistence.** This is the explicit
dependency note the orchestrator carries into that item's build brief.

---

## 9. Residual register (owner + instrument + step; must be filed in BACKLOG)

A residual not in `docs/BACKLOG.md` does not exist. The orchestrator files these
onto the CHATBOT-FORMALITY-SCALE row at disposal (a seat cannot edit the backlog).

| ID | Residual | Owner | Instrument | Step (what measures it) |
|---|---|---|---|---|
| R1 | Does the live model actually honor Casual/Formal directives? | Owner | None here (no `GEMINI_API_KEY`; LLM paths are mock-only, this-repo.md:252) | Owner walk: send one message at each level in the running app, read the reply's register |
| R2 | Rendered FormalityStrip look/placement in the small draggable chat window | Owner | None here (no component renders, this-repo.md:134/262) | Owner/browser walk of the FAB chat window |
| R3 | Voice + formality blend when they disagree (casual sample + formal pick); default is formality-LAST for recency (section 2.3) | Owner | None (live model, unmeasurable here) | Owner walk; if the blend is wrong, the fix is the directive position/text, a one-file change in `system-instruction.ts` |
| R4 | Leverage claim is thin (click-cost); recommend accept-cost disposal | Owner | Verify re-judges against the as-built diff (`DEV_LOOP.md` Verify) | AC/owner records the disposal; no removal test buildable (clicks/attention) |
| R5 | Embedded provider ignores the directive (no model call) - should the control show/disable under the Embedded engine? | UX seat / owner | Source-text only (the no-op is automatic); the show/hide is a markup decision nothing renders to verify | UX seat decides show-always (default, mirrors that styleBlock is also silently ignored for embedded) vs a muted "no effect with the Embedded engine" note; owner walk confirms |

---

## 10. What this scope could NOT determine

- **Whether the directive text produces the intended register** - no API key, LLM
  paths are mock-only (this-repo.md:252). R1.
- **Anything about the rendered control** - no component is rendered by any test
  (this-repo.md:134,262). R2, R5's markup.
- **The felt voice/formality blend** - requires a live model. R3.

These are stated, not worked around. No requirement in this scope has a render as
its only enforcer; every machine-checkable AC (AC1-AC5) is a pure function, a
frozen literal, a persisted-key source-text check, or a wiring source-text check.
