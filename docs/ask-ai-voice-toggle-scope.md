# ASK-AI-VOICE-TOGGLE — scope / recon

Architecture seat. Scope only: AC + architecture + wave plan + forks + residuals.
No code. A fresh `loop-checker` reads this before any build.

Owner request (verbatim): "i need a toggle in the ask ai chat bot modal that opens
up, that designates whether I need a response in my voice or whether I'm asking the
chatbot a question for my own good."

Two modes:
- VOICE ("Draft in my voice"): the reply is drafted in the instructor's own writing
  voice/style (e.g. something they could send to a student).
- INFORMATIONAL ("Answer me"): a plain answer to the instructor's own question.

Every quantity below names the command that produced it. Every `file:line` was opened.

---

## 0. The reframing finding — the brief's central premise is disprovable, and I measured it

The brief says: "informational mode is the current default behavior" and asks the
build to "prove the default path is byte-identical to today." **The tree disagrees,
and this changes the shape of the feature.** I am required to measure a handed fact
the tree contradicts, report the conflict, and adopt neither value silently.

**What today actually does on the FAB chat (`/api/ai-chat`):**

1. `src/app/api/ai-chat/route.ts:492` computes
   `const styleBlock = userId ? await getWritingStyleBlock(userId) : "";`
2. `:651` calls `systemInstruction: buildChatSystemInstruction(styleBlock)`.
3. `buildChatSystemInstruction` (`src/lib/chat/system-instruction.ts:39-43`): when
   `styleBlock` is non-empty it appends the sample plus the directive "Mimic this
   writing tone (word choice, rhythm, sentence length, personality) in every reply"
   (`:42`).
4. `getWritingStyleBlock` (`src/app/actions/writing-style-block.ts:9-33`) returns a
   non-empty block whenever the instructor has saved a writing sample
   (`src/lib/user-style.ts:23-44`, `user_style.writing_sample`).

So **today, a FAB-chat user who has saved a writing sample already gets their replies
mimicked into their voice unconditionally, on every turn.** "Informational" is NOT the
current default for those users — auto-voice is. "Informational" (plain answer) is only
today's behavior for users with NO sample.

Consequence for the feature: "byte-identical to today" has TWO referents, not one, and
they differ:
- informational mode output === today's **no-sample** output (base instruction only);
- voice mode output === today's **with-sample** output (base + sample + "Mimic").

Both are byte-identical to *a* real path today. The feature's net new behavior is a
single thing: **a sample-having FAB user can now get a plain answer (informational),
which today they cannot.** That is also the behavior change this scope must surface
(residual R3, fork F3) — defaulting to informational REMOVES implicit auto-voice from
existing sample-having users until they opt into voice.

Commands:
`@(Get-Content src/app/api/ai-chat/route.ts).Count` = 717;
`grep -n "buildChatSystemInstruction\|getWritingStyleBlock" src/app/api/ai-chat/route.ts`
resolves `:6, :7, :492, :651`. Opened all four.

---

## 1. Fork F1 — which modal, RECOMMENDED + ride to owner

**Recommend: the app-wide FAB chat.** Its modal body is `AiChatWindow.tsx`, opened by
`AiChatFab.tsx` (the floating window, `chatOpen` at `AiChatFab.tsx:85`). Its send path
POSTs to `/api/ai-chat` (`AiChatFab.tsx:503`), whose system instruction is the voice
seam traced in section 0. This is the chat "that opens up" and the one whose reply the
writing-style mechanism already flows through.

The other two candidates, recorded so the owner can redirect:

| Candidate | Why not recommended | If owner redirects |
|---|---|---|
| `src/app/components/courses/AskAiModal.tsx` + `askAboutCourseAction` (`src/app/actions/llm-content.ts`) | Course-scoped, one model call, no writing-style injection today (it is the *named negative example* in `docs/loop/leverage.md:100-130`). A different action, different seam. | Re-target the voice seam onto `askAboutCourseAction` instead of the route; the UI toggle pattern transfers, the pure-function seam does not. |
| Inline Knowledge-tab Ask AI | Not a modal/floating window; inline panel. Owner said "the modal that opens up". | Likely out of scope entirely. |

Cost of being wrong on F1: wave 2 (the UI) lands on the wrong surface; wave 1 (the
pure seam + route) is specific to `/api/ai-chat` and would be partly wasted. Because
wave 1 touches only the FAB route, the blast radius of a wrong F1 is bounded to that
route + the pure function.

---

## 2. Leverage claim (feature work) — flagged; DISPOSAL is fork F5 (owner's call)

This chunk changes a capability a user reaches, so a leverage claim is owed
(`DEV_LOOP.md`, "The loop / Criteria"). The AC seat owns the final wording; as
architect I record the honest reading and the fork, because `docs/loop/leverage.md:111-130`
rules the disposal is "decided by the human who scoped it, never defaulted by the agent."

**Honest reading.** Voice mode's advantage is CORPUS-shaped — it drafts in the
instructor's *own saved writing sample*, read back from `user_style.writing_sample`
via `getUserStyle`/`getWritingStyleBlock`, which a chat window cannot do (it has no
persisted per-user writing sample to read back). **But that mechanism is INHERITED,
not earned by this toggle:** `getWritingStyleBlock` is shared infrastructure already
imported by announcement drafting, message replies, discussion replies, media scripts,
and the FAB route itself (`grep -rln "getWritingStyleBlock" src | wc -l` = 20 files;
opened `messaging.ts:110,439,507`, `message-replies.ts:199`, `walkthrough-announcement.ts:399`).
A class carried unearned by ~all comparable modules describes the platform, not this
feature (`leverage.md:20-28`, failure mode B).

What this toggle genuinely earns is thin and real: **per-question CONTROL + click-cost**
— the instructor chooses voice vs plain per message, inside the chat, without re-pasting
their style or leaving for another tool. That is the `AskAiModal` "accept the cost
explicitly" shape (`leverage.md:112-119`), not a new categorical advantage.

**F5 — leverage disposal (owner):** (a) Accept-the-cost-explicitly (recommended: state
in AC that the advantage is control/click-cost over an inherited CORPUS mechanism, not a
new categorical advantage); (b) Redesign (add a real earned mechanism — out of proportion
to a toggle); (c) Reject the claim (keep the feature, withdraw the claim). Recommend (a).
Cost of (a) being wrong: a later reader over-credits the toggle with integration it does
not have — cheap to correct, and the removal-mechanism oracle (AC-6) pins the real seam.

---

## 3. Acceptance criteria

Each criterion names its instrument, or is marked an owner residual where no instrument
exists in this repo (no component renders; no API key; `this-repo.md:245-264`).

- **AC-1 (two-mode control present).** The FAB chat modal shows a two-state control with
  options "Answer me" (informational) and "Draft in my voice" (voice).
  Instrument: source-text wiring test asserts `AiChatWindow.tsx` renders the response-mode
  control. The *rendered* control is a reading claim (R2, owner walk).
- **AC-2 (voice mode injects the sample).** When mode is voice AND a sample exists, the
  composed system instruction contains the instructor's writing sample and the "Mimic"
  directive. Instrument: frozen-oracle unit test on the pure seam (AC-6 / Wave 1).
- **AC-3 (informational mode is byte-identical to today's no-sample path).** When mode is
  informational, the composed system instruction equals `buildChatSystemInstruction("")`
  — i.e. base instruction only, no sample, no "Mimic" — regardless of whether a sample
  exists. Instrument: frozen-oracle unit test (AC-6 / Wave 1).
- **AC-4 (voice mode preserves today's with-sample output).** When mode is voice, the
  composed system instruction equals today's `buildChatSystemInstruction(styleBlock)`
  output byte-for-byte. Instrument: frozen-oracle unit test (AC-6 / Wave 1).
- **AC-5 (persistence).** The mode persists across reloads under the localStorage key
  `ask-ai-voice-mode` (stored as `ta:ask-ai-voice-mode` via `AiChatFab`'s `LS_PREFIX`,
  `AiChatFab.tsx:57`), following the persist-ui-control-state rule. Instrument:
  source-text wiring test asserts the `readLS("ask-ai-voice-mode", ...)` /
  `writeLS("ask-ai-voice-mode", ...)` literal. The reload round-trip itself is a reading
  claim (R5).
- **AC-6 (removal-mechanism oracle — the load-bearing pin).**
  - Object under comparison: the string returned by
    `buildChatSystemInstruction(chatStyleBlockForMode(styleBlock, mode))` for a fixed
    non-empty `styleBlock`, across `mode ∈ {"informational","voice",undefined,garbage}`.
  - Instruments: `chatStyleBlockForMode` and `buildChatSystemInstruction`, both pure
    functions in `src/lib/chat/system-instruction.ts`, called directly under node-env
    vitest (no network, no DB).
  - Direction of failure: the test goes RED if informational mode's output contains the
    sample text or the word "Mimic" (informational leaked voice), OR if voice mode's
    output omits the sample text (voice lost the mechanism). Deleting the styleBlock
    injection collapses voice→informational and reddens the voice half — this IS the
    removal test for the voice MECHANISM.
- **AC-7 (voice disabled without a sample — F2).** When no writing sample exists, or the
  provider is embedded, the voice option is disabled with a hint linking to the
  Voice & Writing Style settings page (`/account/voice-style`). Instrument: source-text
  wiring test asserts the disabled wiring reads the existing tone status; the *rendered*
  disabled state is a reading claim (R2). Note the route is already robust here (AC-8).
- **AC-8 (no-sample robustness is not UI-dependent).** With no sample,
  `getWritingStyleBlock` returns `""` (`writing-style-block.ts:13,26`), so
  `chatStyleBlockForMode("", "voice")` returns `""` and the composed instruction is the
  base either way. Instrument: frozen-oracle unit test with empty `styleBlock`. Failure
  direction: red if an empty styleBlock in voice mode produces anything other than the
  base. This proves F2 correctness does not depend on the UI disabling the control.
- **AC-9 (other chat surfaces unchanged).** `SelectionChatWidget` (which uses
  `AiChatWindow` but posts to `selectionChatAction`, not `/api/ai-chat` —
  `SelectionChatWidget.tsx:5,7`) renders no response-mode control and its request shape
  is unchanged. Instrument: the response-mode prop on `AiChatWindow` is optional and
  omitted by `SelectionChatWidget`, same pattern as `institutionTypeahead`
  (`AiChatWindow.tsx:93,149`); source-text wiring test asserts omission.
- **AC-LEVERAGE (F5, owner).** One acceptance statement recording the disposal of F5.
  No categorical removal test is buildable here (the earned advantage is control/
  click-cost, like LIVE-LOOP — nothing renders; `leverage.md:177-183`). Record as a
  residual with owner + step (R4). AC-6 is the mechanism oracle, not the categorical one.

---

## 4. Architecture — the shape decision and every file

### 4.1 The seam: a new pure function, `buildChatSystemInstruction` UNTOUCHED

The machine-checkable requirement is that the system-instruction composition be a pure
function. The route handler is NOT unit-testable here (no route-handler harness;
`route.ts:90` says so). So the mode→styleBlock decision must live in a pure function, not
inline in the route.

**Decision: add one tiny pure function, do NOT modify `buildChatSystemInstruction` or its
existing test.** New export in `src/lib/chat/system-instruction.ts`:

```
export function chatStyleBlockForMode(styleBlock: string, mode: ChatResponseMode | undefined): string
  // returns ""        when mode === "informational"
  // returns styleBlock otherwise  (voice, undefined, or any non-"informational" value)
```

The route becomes `buildChatSystemInstruction(chatStyleBlockForMode(styleBlock, body.responseMode))`.

Why this shape (and why NOT change `buildChatSystemInstruction`'s signature):
- `buildChatSystemInstruction`'s existing behavior and its 5 tests
  (`system-instruction.test.ts:21-64`) stay green untouched — the single-arg path that
  the existing tests pin is exactly today's with-sample / no-sample composition.
- Byte-identical is then LITERAL and provable by composition of two tested pure functions:
  informational → `chatStyleBlockForMode(sample,"informational")=""` →
  `buildChatSystemInstruction("")` = today's no-sample output (AC-3); voice →
  `chatStyleBlockForMode(sample,"voice")=sample` → `buildChatSystemInstruction(sample)` =
  today's with-sample output (AC-4).
- **Wire-absent defaults to voice** (anything not exactly `"informational"` → styleBlock),
  so a stale client that never sends the field keeps today's behavior exactly — this makes
  Wave 1 a no-op for every existing client and independently pushable. The ONLY producer of
  informational is an explicit `"informational"`, which only the new UI (Wave 2) sends.

This is the "surface is a layer" discipline: the surface the user reaches is the toggle +
the explicit `responseMode` on the wire; the layer beneath is `chatStyleBlockForMode`; the
route is the wiring file that joins them, and it is in Wave 1's write set as the caller of
the new export.

The voice DIRECTIVE itself is reused verbatim from today's "Mimic this writing tone..."
(`system-instruction.ts:42`); whether to STRENGTHEN it to an explicit "draft a message you
could send to a student" is fork F4 (recommend reuse — see section 5).

### 4.2 The toggle UI — reuse the house `SegmentedToggle`, thin leaf wrapper

The house segmented control already exists: `src/app/components/ui/SegmentedToggle.tsx`
(generic over value type, controlled `value`/`onChange`, per-option `disabled`, roving
tabindex, `role="group"`, `aria-pressed`, house-styled via `RecordingControls.module.css`
`.segmented`/`.segment`). It is the correct reuse (rejecting MUI `ToggleButtonGroup` for
its own skin/focus-ring is documented at `SegmentedToggle.tsx:10-13`).

**New leaf `src/app/components/chat/ResponseModeStrip.tsx`** composes `SegmentedToggle`
plus an optional hint line (reusing the existing no-sample link copy to `/account/voice-style`
already present at `AiChatWindow.tsx:729-739`). Props: `value: ChatResponseMode`,
`onChange`, `voiceDisabled: boolean`, `voiceDisabledHint?: ReactNode`.

Why a leaf and not inline in `AiChatWindow`: **the ceiling.** Measured sizes
(`@(Get-Content <f>).Count` and `wc -l <f>` AGREE on all four):

| File | Lines | Headroom to 1000 |
|---|---|---|
| `src/app/components/AiChatWindow.tsx` | 973 | **27** |
| `src/app/components/AiChatFab.tsx` | 924 | 76 |
| `src/app/api/ai-chat/route.ts` | 717 | 283 |
| `src/lib/chat/system-instruction.ts` | 43 | 957 |

`AiChatWindow` has only 27 lines of headroom. An inline SegmentedToggle strip (~22 lines)
would push it to ~995 — one edit from the `file-size-ceiling.structure.test.ts` wall
(`LIMIT = 1000`, `:41`). The leaf holds the ~30 UI lines; `AiChatWindow` grows by only an
import + an optional prop + one render line (~5 lines → ~978). Neither `AiChatWindow` nor
`AiChatFab` is in that test's `ALLOWED_OVERAGE` ratchet
(`grep -n "AiChat" src/file-size-ceiling.structure.test.ts` returns nothing), so they are
bound only by the 1000 ceiling.

### 4.3 Threading — single source of truth in `AiChatFab`

- `AiChatFab.tsx` owns `const [responseMode, setResponseMode] = useState<ChatResponseMode>(() => readLS("ask-ai-voice-mode", "informational"))`, persists via `writeLS` on change
  (`readLS`/`writeLS` at `AiChatFab.tsx:59-75`). Hydration-safe because the FAB renders
  `null` on the server via its `mounted` guard (same reasoning already recorded for
  `chatPos` at `AiChatFab.tsx:263-266`), so there is no SSR/hydration mismatch.
- `AiChatFab` already fetches `toneStatus` (`AiChatFab.tsx:215,223-245`) via
  `getChatToneStatusAction` (`src/app/actions/chat-style.ts:27-35`), which reports
  `active`/`no-sample`/`embedded` from the SAME `getWritingStyleBlock` the route uses.
  Reuse it for F2: `voiceDisabled = toneStatus !== "active"`.
- `AiChatFab` passes a new optional `responseMode` prop to `AiChatWindow` and includes an
  **effective** mode in the POST body at `AiChatFab.tsx:506-519`:
  `responseMode: toneStatus === "active" ? responseMode : "informational"` (never send
  voice when there is no usable sample; harmless even if it did, per AC-8).
- `AiChatWindow` renders `{responseMode && <ResponseModeStrip {...responseMode} />}` as a
  strip near the composer, mirroring its existing optional-prop pattern
  (`institutionTypeahead`, `AiChatWindow.tsx:93,149,898`).
- `route.ts` adds `responseMode?: ChatResponseMode` to `RequestBody` (`:36-85`, additive —
  same posture as `contextPageIds`/`selectionContextText`) and changes `:651`.
- `ChatResponseMode` type added to `src/lib/chat/types.ts` (where `ChatToneStatus`,
  `ChatMessage` already live).

### 4.4 Reuse list (symbol — file:line — what it gives us)

| Symbol | file:line | Gives us |
|---|---|---|
| `buildChatSystemInstruction` | `src/lib/chat/system-instruction.ts:39` | the composition — UNCHANGED, called as-is |
| `getWritingStyleBlock` | `src/app/actions/writing-style-block.ts:9` | the sample block, `""` on no-sample/failure — the voice source |
| `getChatToneStatusAction` / `ChatToneStatus` | `src/app/actions/chat-style.ts:27`; `src/lib/chat/types.ts` (`"active"/"no-sample"/"embedded"`) | F2 no-sample/embedded detection, already fetched into `AiChatFab`'s `toneStatus` |
| `SegmentedToggle` | `src/app/components/ui/SegmentedToggle.tsx:74` | the house two-state control (keyboard, ARIA, styling) |
| no-sample link markup | `AiChatWindow.tsx:729-739` | existing copy + `/account/voice-style` link to reuse for the F2 hint |
| `readLS`/`writeLS` | `AiChatFab.tsx:59,69` | `ta:`-prefixed persistence |

**Do-not-reuse:** MUI `ToggleButtonGroup` (own skin + second focus ring, rejected at
`SegmentedToggle.tsx:10-13`); `AskAiModal`/`askAboutCourseAction` (different surface, F1).

### 4.5 Not trivially revertible

Nothing. No migration, no persisted-shape change to an existing key (a NEW localStorage key
only), no change to a shared function's existing behavior (`buildChatSystemInstruction` and
its tests are untouched; the route change is a pure-function wrapping). Smallest safe revert
is per-file.

---

## 5. Forks (each: recommendation + cost)

| Fork | Options | Recommend | Cost of wrong |
|---|---|---|---|
| **F1 — target modal** | (a) FAB chat / `AiChatWindow` + `/api/ai-chat`; (b) `AskAiModal` + `askAboutCourseAction`; (c) inline Knowledge Ask AI | **(a)** | Wave-2 UI on wrong surface; Wave-1 seam partly wasted (bounded to the route) |
| **F2 — no sample** | (a) disable voice + link to voice-style page; (b) generic "friendly instructor" fallback; (c) allow + warn | **(a)** — "my voice" is meaningless without a sample, and the app already has the exact `no-sample` chip + link to reuse | (b)/(c) promise a voice that does not exist; cheap to change (UI only; route already base-safe per AC-8) |
| **F3 — default mode** | (a) informational; (b) preserve-today (voice when a sample exists) | **(a)** — matches owner's words and the no-sample majority; makes voice explicit/opt-in | (a) REMOVES implicit auto-voice from existing sample-having FAB users (R3). If the owner wanted today preserved, pick (b). This is the real product decision; surfaced, not defaulted. |
| **F4 — voice directive strength** | (a) reuse today's "Mimic this writing tone..." (`system-instruction.ts:42`); (b) add a stronger "draft a message you could send to a student" directive | **(a)** — zero churn, already shipped+tested; `INSTRUCTOR_AUDIENCE_INSTRUCTION` (`:17-18`) already covers producing student-facing material | (b) edits `buildChatSystemInstruction` + its test (more blast radius) and its prose quality is unverifiable here (owner walk, R1). If the owner finds voice mode insufficiently "drafty", (b) is the upgrade. |
| **F5 — leverage disposal** | (a) accept-cost-explicitly; (b) redesign; (c) reject claim | **(a)** | over-crediting the toggle with inherited CORPUS; cheap to correct |

Per the owner's two-rounds rule, F1/F3 are the forks most worth a single batched question;
F3 in particular is a genuine product decision because it changes existing sample-users.
Recommended readings above are startable now (the scope is written on them); the question
rides alongside.

---

## 6. Wave plan

Both waves gate with `npm run test:paths <p1> <p2> ...` (one path per arg — never a raw
multi-path vitest, which silently drops unmatched args, `this-repo.md:52-66`) PLUS
`npx vitest run src/file-size-ceiling.structure.test.ts` unconditionally
(`this-repo.md:42-49`), PLUS `npx tsc --noEmit` and `npm run lint` (exit 0, no NEW warning
in files this wave writes). Wave gate also runs `git status --short` against the assignment
(`this-repo.md:268-272`, stale-worktree hazard).

### Wave 1 — pure seam + wire (no UI; independently pushable; a no-op for every existing client)

Write set:
- `src/lib/chat/types.ts` — add `export type ChatResponseMode = "informational" | "voice";` (type-only addition)
- `src/lib/chat/system-instruction.ts` — add `chatStyleBlockForMode` (pure)
- `src/lib/chat/system-instruction.test.ts` — add the frozen-oracle cases (AC-2/3/4/6/8).
  Existing 5 tests untouched.
- `src/app/api/ai-chat/route.ts` — add `responseMode?: ChatResponseMode` to `RequestBody`;
  change `:651` to wrap with `chatStyleBlockForMode`. **This file is the caller of the new
  `chatStyleBlockForMode` export** (satisfies the caller-in-wave rule; the type addition to
  `types.ts` is the one type-only module, which emits no runtime code).

Gate: `npm run test:paths src/lib/chat/system-instruction.test.ts` + the ceiling test + tsc
+ lint. (The route handler has no unit harness here; its one-line change is covered by the
pure-function oracle plus tsc.)

Why independently pushable: wire-absent defaults to voice, so until Wave 2 sends an explicit
`"informational"`, every client's composed instruction is byte-identical to today.

### Wave 2 — UI + persistence + wiring (the surface the user reaches)

Write set:
- `src/app/components/chat/ResponseModeStrip.tsx` (NEW leaf) — composes `SegmentedToggle`
  + F2 hint. Caller of the existing `SegmentedToggle` export.
- `src/app/components/AiChatWindow.tsx` — add optional `responseMode?` prop; render
  `{responseMode && <ResponseModeStrip .../>}`. Caller of the new `ResponseModeStrip` export.
- `src/app/components/AiChatFab.tsx` — own + persist `responseMode` (LS key
  `ask-ai-voice-mode`); compute `voiceDisabled` from `toneStatus`; pass the prop; add the
  effective `responseMode` to the `/api/ai-chat` POST body (`:506-519`). The surface.
- `src/app/page.module.css` — only if the strip needs spacing the existing
  `.selectionChatContext`/segmented classes do not give; reuse first.
- `src/app/components/chat/responseMode.wiring.test.ts` (NEW source-text) — asserts: (1)
  `AiChatFab` sends `responseMode` in the POST body; (2) persistence literal
  `ask-ai-voice-mode`; (3) default literal `"informational"`; (4) `AiChatWindow` renders
  `ResponseModeStrip`; (5) `SelectionChatWidget` omits the prop (AC-9).

Gate: `npm run test:paths src/app/components/chat/responseMode.wiring.test.ts
src/app/components/ui/segmentedToggle.test.ts` + the ceiling test (confirms
`AiChatWindow`/`AiChatFab` stayed < 1000; re-measure with `@(Get-Content <f>).Count`) + tsc
+ lint.

**Adopted / checked-safe (tests that read a write-set file as source text but are not owned)**
— from `grep -rln "AiChatFab\|AiChatWindow\|api/ai-chat" src --include=*.test.ts`, each
opened for its negative assertions:
- `askAiSelection.wiring.test.ts` (reads route + AiChatFab): asserts no `position:fixed`, no
  `Dialog/Modal` import, `SELECTION_CHAT_MAX_ITEMS` absence, `setSelectionContext(null)`
  placement — none match an additive `responseMode` body field. Checked-safe.
- `institutionTriggerWiring.test.ts` / `institutionResolutionWiring.test.ts` (read
  AiChatWindow): assert `htmlInput` has no `onKeyDown`/`onKeyUp`, specific `role=` absences —
  the `ResponseModeStrip` render is a separate element, not in `htmlInput`. Checked-safe.
- `accommodations.structure.test.ts`, `knowledge-context.test.ts`, `FabQuickActionsMenu.wiring.test.ts`,
  live-class/manual/recording-launch tests: reference `AiChatFab` for unrelated concerns;
  no assertion on the POST body field set or `AiChatWindow` prop set. Checked-safe.

None of these is in a write set, and none asserts an exact body-field or prop COUNT, so
additive fields do not red them. The verifier should re-confirm by running the full suite
once per wave.

---

## 7. Residual register (owner + instrument + step) — MUST be filed in `docs/BACKLOG.md`

A residual not in `docs/BACKLOG.md` does not exist; the orchestrator files these at disposal.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | Voice-mode OUTPUT QUALITY — does the model actually produce a sendable, in-voice draft? | Owner | Browser walk (no API key here; every LLM path is mock-only, `this-repo.md:252-253`) | Post-deploy: open FAB chat, toggle voice, send a prompt, judge the reply |
| R2 | The RENDERED toggle — markup, focus order, keyboard, disabled state visibility | Owner | Reading claim only (no component renders, `this-repo.md:262-264`); `SegmentedToggle`'s keyboard model is source-asserted at `segmentedToggle.test.ts` but nothing renders it | Owner browser walk; verifier records the reading claim |
| R3 | BEHAVIOR CHANGE: default informational removes implicit auto-voice from existing sample-having FAB users (section 0) | Owner | This scope + a `docs/REGRESSION.md` baseline entry stating today's always-mimic-when-sample behavior | Baseline seat records current behavior BEFORE build; owner rules on F3 |
| R4 | Leverage categorical removal test not buildable here (advantage is control/click-cost) | Owner | None in-repo (`leverage.md:177-183`); AC-6 pins the MECHANISM, not the categorical claim | Owner rules F5; AC seat records the chosen disposal in AC-LEVERAGE |
| R5 | Persistence reload round-trip (localStorage) and hydration safety | Owner | Source-text wiring pins the LS key literal (AC-5); the round-trip + SSR-null guard are reading claims | Owner reload walk; verifier records reading claim |

These five are DELETIONS if the push records none of them (`DEV_LOOP.md:200-215`). R3 and R4
are the two that need an owner ruling (F3, F5) before the feature's meaning is settled.

---

## 8. What I could not determine (stated, not worked around)

- **Whether voice mode "feels" like the instructor's voice / produces a sendable draft** —
  no API key, every model path is mock-only here (`this-repo.md:252-253`). R1, owner-only.
- **The rendered toggle, its focus order and keyboard behavior in a real browser** — no
  component is rendered by any test (`this-repo.md:134,262-264`). R2, reading claim + owner walk.
- **Whether the owner wants F3=(a) informational-default (changes existing sample users) or
  (b) preserve-today** — a product decision; surfaced as F3, recommended (a), not defaulted.
- **Exact post-build line counts of `AiChatWindow`/`AiChatFab`** — must be re-measured with
  `@(Get-Content <f>).Count` at the Wave-2 gate; the plan keeps both under 1000 via the leaf,
  but the ceiling test is the authority, not this estimate.

---

## 9. Disposition (no prior version of this artifact)

This is the first version of `docs/ask-ai-voice-toggle-scope.md` (`git status` shows it
untracked). No prior requirements to map; no renumbering.
