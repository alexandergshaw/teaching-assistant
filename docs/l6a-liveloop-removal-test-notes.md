# L6(a) test notes: the LIVE-LOOP removal test

Seat: test-notes / oracle (Opus). Item: L6(a) - give the LIVE-LOOP
derived-advantage class (docs/loop/leverage.md) the removal test it was shipped
without, so the advantage cannot erode silently the way the GUARANTEED class
did before its guard was fixed (leverage.md, "The removal test").

Artifact produced: `src/app/components/snapshot-grading/snapshotKeyboardLayer.liveloop.test.ts`
(authored and run by this seat; no loop-implementer needed for a single test
file). Production code was NOT touched - the advantage is assertable from
source without a new seam.

L6(b) (re-derivation cadence) is NOT in this seat's scope; it is closed
separately as "no schedule, stretch signal fires naturally."

---

## 1. The advantage pinned (measured against HEAD 7c1c63f7)

The leverage.md cite for LIVE-LOOP reads
`SnapshotGradingPanel.tsx:516-558 - a window-level keydown layer`. **That cite
is STALE and I did not inherit it.** Measured against HEAD:

- `SnapshotGradingPanel.tsx:516-558` is now the submission-ZIP handler and the
  clipboard-paste guard - no keydown layer there.
- The keydown layer was EXTRACTED into
  `src/app/components/snapshot-grading/useSnapshotKeyboardShortcuts.ts` (landed
  with N14 wave 1, `git log` commit on that file). The panel's call into the
  hook is at `SnapshotGradingPanel.tsx:618`.

The concrete advantage, as it exists at HEAD, in three parts:

1. **Ambient listener** - `useSnapshotKeyboardShortcuts.ts:121`
   `window.addEventListener("keydown", onKey)` (handler declared `:81`). Window-
   level, not element- or document-scoped, so it is usable with focus and
   attention on the shared screen being graded, gated only by the three
   eligibility booleans (`:83-89`, active sub-tab / not in an editable field /
   no modal open).
2. **Key -> meaning** (the pure matcher, `snapshot-keys.ts:122`
   `matchSnapshotKeyEvent`): bare `s` -> `snap` (`:155`); bare `n` and the
   `Alt+G` chord -> `arm-next-student` (`:156`, `:139`); digits `1-6` via
   `ROLE_BY_DIGIT` (`:24-31`) -> `arm-role` (`:161-162`); the `Alt+R` chord ->
   `capture-rubric` (`:140`).
3. **Meaning -> action** (the dispatch bridge, inside `onKey`,
   `useSnapshotKeyboardShortcuts.ts:92-119`):
   `const match = matchSnapshotKeyEvent(e)` (`:92`), then
   `snap` -> `handleSnap()` (`:93-94`),
   `arm-next-student` -> `setNextStudentArmed(true)` (`:97-98`),
   `arm-role` -> `setArmedRole(match.role)` (`:112-113`),
   `capture-rubric` -> `onCaptureRubric()` (`:117-118`). Each callback is a hook
   PARAMETER the panel passes in (`:70-78`); the hook calls no action directly
   (confirmed consistent with `snapshot-autofire.structure.test.ts:190`).

Why a chat cannot do this: a chat needs the user's hands on the keyboard typing
a message and has no notion of an ambient control layer running underneath an
activity in progress. The erosion risk the orchestrator named: "someone deletes
the keydown handler or replaces it with onClick-only."

## 2. What already guards parts of this, and the gap

- `snapshot-keys.test.ts` fully pins part 2 behaviourally (keys -> match types,
  plus all modifier/repeat negatives).
- `snapshot-grading.structure.test.ts:457-484` (N14 wave-1 reachability canary)
  pins that the panel imports/calls the hook and that the hook attaches a
  `window` keydown listener - i.e. part 1's *existence*.
- **Nothing pinned part 3, the bridge.** A matcher that still maps keys and a
  listener that is still attached can coexist with a deleted dispatch - press S,
  snap nothing - and every gate stays green. That is the LIVE-LOOP erosion with
  no guard, and it is this file's subject.

## 3. Assertion form chosen, and why

Candidate forms (brief step 2): (a) handler present/bound; (b) the specific key
bindings present; (c) keyboard actions are the SAME actions as the mouse path.

**Chosen: a hybrid of (a) and (b), structured so coverage is a property of
construction.** (c) in full is REJECTED as over-specified and brittle here: the
mouse path reaches `handleSnap` through cross-file prop-threading
(SnapshotGradingPanel -> SnapshotCaptureBar prop renames), so proving "one
shared handler" would pin incidental prop spellings across files and force
contorted code on any refactor - the source-text-over-specification failure this
repo has shipped twice (MEMORY: source-text-tests-overspecify). The advantage is
that the KEYBOARD path exists and drives the actions; it does not require the
mouse path to exist, so I pin the keyboard path directly.

Accepted weakness (orchestrator-ruled): nothing renders under vitest, so
"usable without a mouse" cannot be observed by rendering. The buildable form is
source-text + a behavioural matcher assertion. This is weaker than the
GUARANTEED class's import-prefix guard, and that cost is accepted because it
catches the realistic erosion (dispatch deleted / mouse-only) that nothing else
catches - proven in section 6.

## 4. Requirements, instruments, directions

Every slice is anchored at BOTH ends and both anchors are asserted to resolve
before the slice is read (brief non-negotiable; the slice is
`hookStripped.slice(handlerStart, listenerExec.index)`, with `handlerStart > -1`
and `listenerExec.index > handlerStart` both asserted - if either fails the slice
is `""` and the dispatch checks red rather than widening to the whole file).

| # | Object under comparison | Instrument | Direction of failure (RED when) |
|---|---|---|---|
| R1 | The set of non-`none` match types the real bindings reach | `matchSnapshotKeyEvent` (production matcher) fed `s`, `n`, `Alt+G`, every `ROLE_BY_DIGIT` key, `Alt+R`; `.toEqual` a frozen literal | the produced set != `["arm-next-student","arm-role","capture-rubric","snap"]` - a binding stopped firing, or a new one appeared |
| R2 | Each produced type's dispatch mapping | `Object.hasOwnProperty` over a frozen `DISPATCH_HANDLER` map | a produced type has no frozen handler entry (a new bound action with no dispatch pinned) |
| R3 | The ambient listener | `indexOf` the `onKey` decl + regex `window.addEventListener("keydown", onKey)` | the handler decl is gone, or no window keydown listener is bound to `onKey` |
| R4 | The handler reads the real matcher | `handlerBody.includes("matchSnapshotKeyEvent(")` | the handler reimplements an inline key map instead of driving the tested matcher |
| R5 | The count of grading actions checked | `producedTypes.length === 4` | the parametrized dispatch check would run over fewer than four actions (guards R6 against vacuous pass) |
| R6 (x4, one per produced type) | The dispatch bridge for one action | within the anchored handler body, `indexOf("match.type === \"<t>\"")` then `indexOf(<handler needle>)`, asserting call-after-guard ordering | the `match.type === "<t>"` guard is missing (unreachable by keyboard), OR its callback needle is absent/before the guard (dead/partial subset - mouse-only) |

Handler needles (R6), the FACT being pinned (which action each key drives),
tolerant of whitespace, pinning ordering not spelling: `snap`->`handleSnap(`,
`arm-next-student`->`setNextStudentArmed(`, `arm-role`->`setArmedRole(match.role`
(also pins `match.role` is threaded), `capture-rubric`->`onCaptureRubric(`.

## 5. Frozen oracles as CONSTRUCTIONS

- **R1's produced set is CONSTRUCTED, not listed.** The axes (key events) come
  from the test; the values come from feeding the PRODUCTION matcher - different
  sources, so no shared-hardcoded-axis branch that can never fire. The digit
  axis is read from `ROLE_BY_DIGIT` (production), so a change to the role-digit
  map flows through. Possible to construct from the tree: confirmed - the
  matcher is a pure, DOM-free leaf importable under node-env.
- **R6's coverage is CONSTRUCTED from R1's produced set** (`it.each(producedTypes)`),
  not a hand-written list of four. A new matcher type grows `producedTypes`,
  which reds R1 (frozen literal) and R2 (missing map entry) until a human adds
  both the binding and its dispatch. A removed type shrinks it, which reds R1 and
  R5. This is why R5 exists: when the set shrinks, `it.each` silently runs fewer
  cases (measured in SAB-3: 4 cases -> 3), so a standalone count assertion is
  what keeps R6 non-vacuous.

## 6. Reference implementation and sabotage (RED then GREEN)

**Reference implementation:** the real hook at HEAD. The test is GREEN on the
unmodified tree (9 tests in this file; 13 with the ceiling gate) - the red
assertions are satisfiable, proven by an implementation that passes them.

Sabotages run with cp-backup + restore (never `git checkout --`, which reverts
to the index; MEMORY: sabotage-restore-needs-a-copy). Final
`git status --short` on both production files was empty (byte-restored).

| Sabotage | Mutation | Result | Discriminates? |
|---|---|---|---|
| SAB-1 | `useSnapshotKeyboardShortcuts.ts:94` `handleSnap();` -> `void 0;` | **RED: exactly the `snap` R6 case** (12 passed / 1 failed), GREEN after restore | YES - the load-bearing proof. Under SAB-1, `snapshot-keys.test.ts` + the N14 reachability canary (109 tests) ALL stay GREEN. This file catches an erosion nothing else in the repo catches. |
| SAB-2 | delete `useSnapshotKeyboardShortcuts.ts:121` `window.addEventListener("keydown", onKey)` | **RED: 6 tests** (R3 listener anchor, R4, all four R6 - handler body collapses to `""` when the end anchor fails), GREEN after restore | YES |
| SAB-3 | `snapshot-keys.ts:155` `s` -> `NO_MATCH` (matcher gutted) | **RED: R1 frozen set + R5 count** (2 failed), GREEN after restore | YES for part 2's oracle (also redundantly caught by `snapshot-keys.test.ts`) |

No sabotage was red-in-both-directions or green-in-both; none was rebuilt. Every
requirement has a sabotage that discriminates.

## 7. Executable here vs argued

- **Executable (verified by running):** R1-R6 above, all through
  `npm run test:paths`. The matcher behaviour (R1) is executed against the real
  matcher; R2-R6 are source-text/source-order over the comment-stripped hook.
- **Argued, NOT asserted:** that a key press is *physically* usable with a mouse
  untouched and focus on the shared screen. No component renders under vitest
  (node-env, network-blocked), so actual focus/keyboard behaviour is an
  owner-verification claim, not a test claim. This file asserts the SOURCE
  STRUCTURE that makes the ambient keyboard path exist; it does not and cannot
  assert the rendered keystroke.

## 8. Residual register

| Residual | Owner | Instrument | Measuring step |
|---|---|---|---|
| RES-L6a-1: rendered keyboard reachability (keystroke with mouse untouched, focus on the shared screen, across the three eligibility guards reading the live DOM) is never executed here | owner | a real browser / a rendering test harness this repo does not have | owner manual pass, or a future jsdom/render harness if one is ever added |
| RES-L6a-2: leverage.md's LIVE-LOOP row cites the stale `SnapshotGradingPanel.tsx:516-558`; the layer is now `useSnapshotKeyboardShortcuts.ts:81,121` + `snapshot-keys.ts` | orchestrator | edit docs/loop/leverage.md | one-line cite correction in the backlog reconcile (doc-only) |

RES-L6a-2 is a doc-citation repair the orchestrator can apply at reconcile; it
does not gate this test.

## 9. Gate commands (measured, from PowerShell/bash)

- `npx tsc --noEmit` -> exit 0
- `npx eslint src/app/components/snapshot-grading/snapshotKeyboardLayer.liveloop.test.ts` -> exit 0
- `npm run test:paths -- src/app/components/snapshot-grading/snapshotKeyboardLayer.liveloop.test.ts src/file-size-ceiling.structure.test.ts`
  -> 2 files, 13 tests passed; both paths reported COVERED (two paths, so the
  wrapper is mandatory - a raw multi-path `vitest` would silently drop an
  unmatched arg).

## 10. House-rule compliance notes

- Comment stripper named `withoutLineComments` (CRLF-safe, UNANCHORED
  `/\/\/.*$/` after `split(/\r?\n/)`); the forbidden helper name is never
  written in the file, so `strip-comments-agreement.structure.test.ts`'s
  enumeration does not require classifying it.
- No cross-`*.test.ts` import: the `keyEvent` helper is duplicated from
  `snapshot-keys.test.ts`, not imported.
- No `/s` (dotAll) regex flag anywhere (would pass vitest, fail tsc TS1501).
- Canvas/network: not on any Canvas path; no `fetch`/`canvasFetch` involved.
- No emojis / non-ASCII; file is ~165 lines, well under the 1000 ceiling.
