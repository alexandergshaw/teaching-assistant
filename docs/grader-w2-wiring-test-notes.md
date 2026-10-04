# Grader W2 panel-wiring structure-test notes (SMOOTH-GRADER / W2-AR1 + precedence)

Author: `loop-test-author` (Opus), 2026-10-04. These are NOTES; the implementer
writes the test code from them. A fresh `loop-checker` reads this file first.
I author notes; I do not write the test code.

## 0. What this closes, and why it exists

The grading-chat W1+W2 grader surface shipped CORRECT in `1eb28fa1` (verified
clean at `a7cfca10`) but the W2 verify noted ONE deferred item: the panel's
session-setup WIRING in `ensureSession` has NO machine guard. Specifically the
source-order facts the verify confirmed by read -- the Canvas-meta fetch is
`await`ed BEFORE `driver.beginSession(...)`, and `beginSession` is fed the
RESOLVED `fill.*` values rather than the stale closure state vars -- are
asserted nowhere. A future edit that made the Canvas fetch non-blocking (a
`.then` refactor), or passed the stale `instructions`/`rubric` state into
`beginSession`, or dropped the `needsFill` gate on the fetch, would pass tsc,
eslint and the entire suite today. This instrument reds a gate on exactly those
regressions.

It mirrors the just-shipped walkthrough AC-10 wiring instrument
(`docs/walkthrough-ac10-wiring-test-notes.md`, built in `6cac33d2`): slice-bound
source-text pins, comment-stripped source, one discriminating tsc-valid mutant
per pin, governance-safe. It is PROPORTIONATE -- one guard test closing a known
gap over three pins, not a redesign.

## 1. The instrument class, stated plainly (this repo's ceiling)

**SOURCE-TEXT STRUCTURE TEST. No pin may depend on mounting, rendering, focus,
keyboard, or runtime effect scheduling.** vitest here is node-env and collects
only `src/**/*.test.ts`; NO component is rendered. Every pin reads
`GradingChatPanel.tsx` as a STRING and asserts a substring / regex presence or a
character-ORDER fact on a bounded slice of it. The runtime claims this CANNOT
make -- that the awaited fetch actually blocks `beginSession` under the JS event
loop, that the session actually grades against the captured header -- are
reading claims, listed as residuals in section 7, not asserted here.

**Comments are stripped before every pin.** `GradingChatPanel.tsx` carries `//`
comments that name the very identifiers these pins target -- e.g. the block at
`GradingChatPanel.tsx:92-96` literally says "The Canvas fetch is awaited BEFORE
beginSession" and "it must not be what beginSession reads". An unstripped
presence match could stay GREEN off a comment while the code it names was
sabotaged. Strip first and the bad state cannot hide in a comment.

## 2. Write set, test-file decision, and the governance constraint

**EXTEND the existing `src/app/components/grading-chat/GradingChatPanel.structure.test.ts`. Do NOT create a new test file.** Add the three new `describe` blocks after the existing `W2 O3` block (current last block, ends `GradingChatPanel.structure.test.ts:190`).

Governance reasoning, stated explicitly (this is the load-bearing decision):

1. **The file does NOT contain the literal `stripComments`.** Measured this
   session: `grep stripComments` over
   `GradingChatPanel.structure.test.ts` returns 0 occurrences. It already
   defines and uses its OWN comment-strip helper named `withoutLineComments`
   (`GradingChatPanel.structure.test.ts:129-131`). Therefore the file is NOT in
   the enumeration performed by
   `src/tools/strip-comments-agreement.structure.test.ts` (that gate walks
   `src/**/*.test.ts` and classifies only files whose text `.includes("stripComments")`
   -- `strip-comments-agreement.structure.test.ts:508-509`). It appears in
   NEITHER `ALL_DEFINED`/`SAFE_FILES` nor `EXCLUSIONS` (confirmed by read of
   both lists, `:331-397` and `:453-490`), and it does not need to, because it
   does not mention the literal.
2. **Extending it is governance-NEUTRAL.** The governance gate enumerates FILES
   that mention `stripComments`, not occurrences. Adding `describe` blocks to a
   file that does not mention the literal changes nothing about that gate -- and
   must KEEP not mentioning it. **HARD CONSTRAINT on the implementer: the new
   blocks must reuse the existing `withoutLineComments` helper and must NOT
   introduce the literal `stripComments` (not as an identifier, an import, or a
   comment). Introducing it would pull this file into the governance
   enumeration and red that gate repo-wide until the file is classified** -- a
   burden this small hardening job must not incur. This is why we do NOT author
   a new comment-strip helper and do NOT import one named `stripComments`.
3. **`withoutLineComments` is the correct CRLF-safe UNANCHORED form.**
   `GradingChatPanel.structure.test.ts:130` is
   `source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n\r]*/g, "")` --
   it strips `/* */` blocks (dot-all via `[\s\S]`, never the forbidden `/s`
   flag) then strips `//` line comments INCLUDING trailing ones (`[^\n\r]*` is
   unanchored and stops at the line terminator, preserving `\n`/`\r`). This is
   NOT the trailing-comment-blind anchored `/^[ \t]*\/\/.*$/gm` form the traps
   card forbids. It is string-UNaware, but no pinned slice below contains a `//`
   or `/* */` inside a string literal (no URL literals, no comment-look-alikes
   live in `ensureSession`), so "strip then match" is sound here. Confirmed by
   read of lines 97-133.
4. The file is ALREADY the home of the grader W2 source-text canaries
   (`GradingChatPanel.structure.test.ts:126-190`, "GRADER W2") and already reads
   `PANEL` via its `read()` helper (`:8-12`), so the new blocks drop in beside
   `W2 O3` with no new machinery.

A standalone `GradingChatPanel.wiring.test.ts` would be EQUALLY governance-safe
IF it likewise avoided the literal `stripComments` and duplicated
`withoutLineComments` locally (never a cross-test-file import -- that re-runs the
imported file's describe blocks). I recommend EXTENDING rather than a new file
because it reuses the existing helper and `read()` with zero duplication and
matches the AC-10 precedent; the new-file route costs a duplicated helper for no
governance benefit. The implementer may take the new-file route only if they
duplicate `withoutLineComments` verbatim and keep the literal out.

- **No new `ta-` key. The grading-chat canary stays 4.** This instrument adds no
  persisted key and must not touch `grading-chat-storage-keys.structure.test.ts`.
  (The four keys are `ta-grading-chat-instructions`, `ta-grading-chat-rubric`
  (`GradingChatPanel.tsx:34-35`), `ta-grading-chat-input-mode`
  (`ChatComposer.tsx:28`), plus the fourth held by that canary; this test reads
  source only and persists nothing.)
- **No emojis, LF line endings, no `/s` regex flag** (TS1501). Section 4 shows
  how one pin needs dot-all behaviour and achieves it with `[\s\S]`, never `/s`.

## 3. Facts pinned, confirmed at HEAD by direct read

Every quantity names the `file:line` I opened (HEAD this session). Lines drift;
the pins anchor on stable text, not raw line numbers. All reads are of
`src/app/components/grading-chat/GradingChatPanel.tsx`, which this test file
already reads via `read(PANEL)`.

| # | Fact | Where (HEAD) |
|---|---|---|
| F1 | The Canvas-meta fetch is AWAITED (`const meta = await fetchCanvasMetaAction(canvasUrl.trim());`) and this awaited fetch sits textually BEFORE the `driver.beginSession(` call | fetch `:104`, beginSession `:116` |
| F2 | `driver.beginSession(...)` is fed `{ assignmentInstructions: fill.instructions, rubric: fill.rubric }` -- the RESOLVED values from `resolveSetupFill`, NOT the closure state vars `instructions` / `rubric` | `:116` (call); `fill` resolved at `:108-112`; state vars declared `:60-61` |
| F3 | The Canvas fetch is GATED by `if (canvasUrl && scope && needsFill)`, where `needsFill = !instructions.trim() \|\| !rubric.trim()`; the gated block closes before `const loaded =` | guard `:103`, `needsFill` def `:100`, fetch `:104`, `const loaded` `:107` |

Supporting facts (read, not independently pinned, context for the checker):

- `ensureSession` is the single site of both the fetch and `beginSession`
  (`:97-133`); `handleSubmitUrl` (`:158-162`) is the only caller that passes a
  `canvasUrl`, so the Canvas path runs only on a URL submission. The caller
  chain (ChatComposer url mode -> `onSubmitUrl` -> `handleSubmitUrl` ->
  `ensureSession(url)`) is already exercised structurally by the existing suite
  and is NOT re-pinned here.
- PRECEDENCE CORRECTNESS ("typed always wins; Canvas then memory fill only blank
  fields") is enforced INSIDE `resolveSetupFill` (`chatSetupFill.ts:40-44`,
  `pick` returns typed first) and is covered by `chatSetupFill.test.ts`. The
  `needsFill` gate (F3) is a FETCH-AVOIDANCE guard -- it stops an unnecessary
  network call / memory read when both fields are already typed -- NOT the
  precedence authority. F3 is pinned on that honest basis (see section 6); it is
  not claimed to enforce precedence correctness.
- `fetchCanvasMetaAction` is imported at `:18` (`import { fetchCanvasMetaAction } from "../../actions/grading"`). That import line is OUTSIDE the `ensureSession` slice and carries no `await`, so it cannot satisfy the F1 pin -- but the F1 pin MUST slice to `ensureSession` regardless (see section 4).

## 4. Pins (what the implementer writes)

All pins read STRIPPED source: `const stripped = withoutLineComments(read(PANEL));`
(reuse the existing helper and the existing `PANEL` constant,
`GradingChatPanel.structure.test.ts:12`). Every slice asserts BOTH its anchors
resolve (`> -1`) before slicing -- the repo's "anchor-resolves at both ends"
rule. The one common slice:

```
const sliceStart = stripped.indexOf("const ensureSession = async");
const sliceEnd = stripped.indexOf("const handleSubmitText");
// assert both > -1
const ensureBlock = stripped.slice(sliceStart, sliceEnd);
```

Both anchors are unique in the file (`ensureSession` declared once at `:97`,
`handleSubmitText` declared once at `:135`) and `sliceStart < sliceEnd` at HEAD.
Every pin below operates on `ensureBlock`, so an identifier ELSEWHERE in the
panel (the `fetchCanvasMetaAction` import at `:18`; nothing else references
`beginSession` / `needsFill` / `fill.instructions` outside this function) cannot
satisfy any pin.

### Group AR1 -- F1: the Canvas fetch is awaited BEFORE beginSession

```
const fetchIdx = ensureBlock.indexOf("await fetchCanvasMetaAction(");
const beginIdx = ensureBlock.indexOf("driver.beginSession(");
expect(fetchIdx).toBeGreaterThan(-1);   // the fetch is AWAITED (load-bearing)
expect(beginIdx).toBeGreaterThan(-1);
expect(fetchIdx).toBeLessThan(beginIdx); // awaited fetch precedes beginSession
```

- **AR1a (awaited-presence, THE load-bearing discriminator):** the anchor
  includes the `await` keyword. If a future edit makes the fetch non-blocking
  (e.g. `fetchCanvasMetaAction(...).then(meta => ...)` with `beginSession` moved
  out of the callback), the literal `await fetchCanvasMetaAction(` disappears and
  `fetchIdx` becomes -1 -> red. This is the regression tsc does NOT catch (see
  the ledger note).
- **AR1b-order (textual order):** `fetchIdx < beginIdx`. Partially backstopped by
  tsc/data-flow (the fetch result flows `meta` -> `canvasMeta` (`:105`) ->
  `fill` (`:108-112`) -> `beginSession` (`:116`), so a naive reorder that puts
  `beginSession` first references `fill` before its declaration and fails tsc).
  Kept because it is cheap, documents the seam, and reds under a `.then`
  refactor that hoists `beginSession`.

### Group AR1b -- F2: beginSession is fed the RESOLVED fill values

```
const beginStart = ensureBlock.indexOf("driver.beginSession(");
const beginEnd = ensureBlock.indexOf("});", beginStart);
expect(beginStart).toBeGreaterThan(-1);
expect(beginEnd).toBeGreaterThan(-1);
const beginBlock = ensureBlock.slice(beginStart, beginEnd);
expect(beginBlock).toMatch(/assignmentInstructions:\s*fill\.instructions\b/);
expect(beginBlock).toMatch(/\brubric:\s*fill\.rubric\b/);
```

Pins that `beginSession` consumes `fill.instructions` and `fill.rubric` (the
`resolveSetupFill` output), NOT the closure state vars `instructions` /
`rubric`. The `fill.` prefix is the whole fact: `assignmentInstructions: instructions`
or `rubric: rubric` would grade the NEXT student against stale, pre-resolution
text -- the exact silent-stale hazard `GradingChatPanel.tsx:92-96` documents.
The `}` + `)` + `;` of the one-line call at `:116` yields the substring `});`,
so `beginEnd` resolves; it is the FIRST `});` after `beginStart` (confirmed by
read). Slicing to `beginBlock` is belt-and-suspenders -- `assignmentInstructions:`
is already unique to this call -- but keeps the pin bound at both ends.

### Group AR1c -- F3: the Canvas fetch is gated by the needsFill guard

```
const guardIdx = ensureBlock.indexOf("if (canvasUrl && scope && needsFill)");
const loadedIdx = ensureBlock.indexOf("const loaded =", guardIdx < 0 ? 0 : guardIdx);
expect(guardIdx).toBeGreaterThan(-1);
expect(loadedIdx).toBeGreaterThan(-1);
const guardBody = ensureBlock.slice(guardIdx, loadedIdx);
expect(guardBody).toContain("fetchCanvasMetaAction");
```

Pins that the `fetchCanvasMetaAction` call lives lexically inside the
`if (canvasUrl && scope && needsFill)` block (between the guard open and the next
statement `const loaded =`). Deliberately does NOT re-use the AR1 `fetchIdx`
anchor (which carries `await`) so that AR1's `.then` mutant does not also red
AR1c -- `guardBody.toContain("fetchCanvasMetaAction")` stays green under a
`.then` refactor because the identifier is still inside the guard. Framed as a
FETCH-AVOIDANCE guard, not precedence (section 3, section 6).

## 5. Sabotage ledger -- one discriminating mutant per pin

Every mutant is applied to the PRODUCTION source (`GradingChatPanel.tsx`), the
named pin confirmed RED, then the source RESTORED FROM A cp-BACKUP (NEVER
`git checkout --`, which reverts to the index and destroys uncommitted work) and
the pin confirmed GREEN again. Discrimination column: does the mutant red
EXACTLY its pin and leave the other two green? Every mutant is tsc-VALID -- that
is the point: these are the silent wiring regressions no other gate sees.

| Pin | Mutant (edit to production) | Reds | tsc still passes? | Discriminates |
|---|---|---|---|---|
| AR1 | Replace `const meta = await fetchCanvasMetaAction(canvasUrl.trim()); if (!("error" in meta)) canvasMeta = {...};` with a non-blocking `void fetchCanvasMetaAction(canvasUrl.trim()).then((meta) => { if (!("error" in meta)) canvasMeta = { instructions: meta.description, rubric: meta.rubricText }; });` | AR1 only (`fetchIdx` -> -1, `expect(fetchIdx).toBeGreaterThan(-1)` fails) | yes -- `canvasMeta` is `let` (`:102`), reassigned in the closure; `fill` at `:108` reads it as null before the callback runs; `meta.description` is typed inside the `.then` callback so no Promise-member error | YES -- AR1b's `beginSession` call is untouched (green); AR1c's `guardBody.toContain("fetchCanvasMetaAction")` still true (green) |
| AR1b | `:116` -> `driver.beginSession({ assignmentInstructions: instructions, rubric: fill.rubric })` (pass the stale state var for instructions) | AR1b only (`/assignmentInstructions:\s*fill\.instructions\b/` fails) | yes (both are `string`) | YES -- AR1 fetch/order untouched; AR1c guard untouched |
| AR1c | `:103` -> `if (canvasUrl && scope)` (drop `&& needsFill`, fetch no longer gated on a blank field) | AR1c only (`guardIdx` -> -1, `expect(guardIdx).toBeGreaterThan(-1)` fails) | yes (`canvasUrl && scope` is still boolean) | YES -- AR1 `await fetchCanvasMetaAction(`/order untouched (green); AR1b call untouched (green) |

Corroborating sabotage for AR1b (same pin, not a separate pin): `:116` ->
`rubric: rubric` reds the second AR1b regex `/\brubric:\s*fill\.rubric\b/`. Reported
as corroboration that AR1b catches the stale-var swap on EITHER field.

**No mutant above is red-in-both or green-in-both.** If, when run, any mutant
survives, do NOT add an assertion until it dies -- first check whether the
mutant is bad (mutates the wrong object, or produces a tsc-forbidden state);
rebuild it and SAY SO, per the test-seat rule. The AR1 mutant in particular is
the one to watch: if the implementer writes a simpler "drop the `await` keyword
only" mutant (`const meta = fetchCanvasMetaAction(canvasUrl.trim());`), that
variant reds AR1 as intended BUT also reds tsc (`meta.description` on a Promise
at `:105`), so it is NOT a clean tsc-valid discriminator -- use the `.then` form
in the table, which is the tsc-valid regression the pin uniquely guards.

## 6. The pin most likely to be built wrong (flagged for the checker)

**FLAG, primary: AR1 is the pin most likely to be built TOO LOOSE.** The naive
build is `read(PANEL).includes("fetchCanvasMetaAction")` plus
`.includes("beginSession")`. That is a DEAD pin three ways: (a) it matches the
import at `:18`, (b) it drops the `await` and so misses the non-blocking `.then`
regression -- the ONLY regression here tsc cannot catch -- and (c) it asserts no
order. The build MUST (1) slice to `ensureBlock` first, (2) anchor on the
literal `await fetchCanvasMetaAction(` INCLUDING the `await`, and (3) assert
`fetchIdx < beginIdx`. If the checker sees a whole-file match or a missing
`await` in the anchor, the pin is not done.

**FLAG, secondary: AR1b is the pin most likely to be built TOO TIGHT
(spelling-brittle) -- and here the tightness is JUSTIFIED as a frozen-literal
exception.** The `fill.instructions` / `fill.rubric` spelling IS the fact: the
distinction the pin exists to catch is `fill.X` (resolved) vs bare `X` (stale
closure state). I deliberately relaxed the SURROUNDING shape (`\s*` around the
colon, `\b` boundaries) so a whitespace reflow does not false-red, and I pinned
ONLY the two key:value bindings, not the object's other structure -- so a
legitimate add of a third field to `beginSession`'s argument does not false-red.
What I did NOT do: pin the ORDER of the two keys, or the exact `{ ... }`
punctuation. Over-specifying those would force a contorted implementation, the
documented repo failure mode.

**Honesty flag on AR1c (for the checker, not a looseness bug):** AR1c guards
"don't fetch when both fields are already typed," NOT precedence correctness.
Precedence lives in `resolveSetupFill` (`chatSetupFill.ts:40-44`) and is covered
by `chatSetupFill.test.ts`. I include AR1c because it discriminates cleanly (one
tsc-valid mutant, reds exactly it) and guards a real structural fact that
matters in a network-blocked environment -- NOT because it enforces the "typed
wins" rule. Do not let a reviewer or a later note re-label it as a precedence
guard.

## 7. Executable here vs. argued; residual register

**Executable here (this instrument):** F1-F3's SOURCE-TEXT presence / ordering
facts, pins AR1, AR1b, AR1c. Each is proven red by its section-5 mutant and
green on restore.

**Argued, NOT asserted by any test here (reading claims only):**

- That the awaited fetch actually BLOCKS `beginSession` under the JS event loop
  at runtime. AR1 pins the SOURCE order and the presence of `await`; it does not
  prove the runtime await chain. Reading claim.
- That the session actually grades every submission against the first-captured
  header. That is `useContinuousGradingRun.beginSession` behaviour, covered by
  `useContinuousGradingRun.lifecycle.test.ts`, not by this structure test.
- That `resolveSetupFill` resolves typed-over-canvas-over-memory correctly. AR1b
  pins only that its OUTPUT (`fill.*`) is what `beginSession` consumes; the
  resolution logic is `chatSetupFill.ts` + `chatSetupFill.test.ts`.

**Residual register:**

| ID | Not proven by this instrument | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-GCW2-a | The awaited fetch blocks beginSession at runtime; the session begins only after Canvas returns | repo owner | real browser: submit a Canvas URL into the grader, watch the session begin only after the fetch resolves | OWNER live walk, Verify after this guard lands |
| R-GCW2-b | `resolveSetupFill` precedence (typed > canvas > memory) | implementer + existing `chatSetupFill.test.ts` | that suite (already green) | already covered; named so it is not mistaken for this test's job |
| R-GCW2-c | `beginSession` captures-once / grades against the first header | implementer + existing `useContinuousGradingRun.lifecycle.test.ts` | that suite | already covered; named for the same reason |
| R-GCW2-d | AR1b-order is partially tsc-backstopped by the `meta`->`fill`->`beginSession` data dependency | n/a | tsc + this pin | documented; the load-bearing half of AR1 is AR1a (awaited-presence), not the order |

Each residual names an owner, an instrument, and the step that measures it; none
is a silent deletion.

## 8. Satisfiability proof (the red tests are satisfiable)

For a source-text test over ALREADY-SHIPPED code, the reference implementation
IS the HEAD source (shipped `1eb28fa1`, clean at `a7cfca10`). I verified by
direct read this session that every anchor and every pinned substring/ordering
resolves against HEAD: `const ensureSession = async` (`:97`),
`const handleSubmitText` (`:135`), `await fetchCanvasMetaAction(` (`:104`),
`driver.beginSession(` (`:116`) with `assignmentInstructions: fill.instructions`
and `rubric: fill.rubric` on the same line, the `});` terminator of that call,
`if (canvasUrl && scope && needsFill)` (`:103`), and `const loaded =` (`:107`),
with `:104` textually before `:116` and the guard at `:103` before the fetch at
`:104` before `const loaded` at `:107`. The GREEN state is therefore proven to
exist -- the pins are not vacuous and not contradictory. The implementer's
remaining obligation is the RED half: apply each section-5 mutant, confirm the
named pin reds and nothing else does, restore from a cp-backup, confirm green. I
did NOT run vitest (I author notes; the implementer runs them), and I say so
rather than claim a run I did not make.

## 9. Gate command

Single file (extended), so either form is valid; use the wrapper for consistency
with the repo convention. The path exists at HEAD (confirmed by read); the
`test:paths` script is defined in `package.json` (confirmed this session) -- no
phantom path:

```
npm run test:paths -- src/app/components/grading-chat/GradingChatPanel.structure.test.ts
```

If run alongside the lifecycle suite, name both explicitly (NEVER a raw
multi-path `vitest run a b`, which silently drops an unmatched argument and
exits 0):

```
npm run test:paths -- src/app/components/grading-chat/GradingChatPanel.structure.test.ts src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts
```
