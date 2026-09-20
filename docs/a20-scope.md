# A20 scope: auto-download the recording on stop (round 2)

Backlog row: `docs/backlog.yml:396-407` (`id: 'A20'`, `state: 'unscoped'`).
Owner ruling, 2026-09-20 (row `note`, `docs/backlog.yml:406`): **"JUST THE TWO
THAT ALREADY RECORD - discussion replies and message replies. GROUP 2 IS OUT
OF SCOPE AND STAYS OUT."** This document treats that as a hard boundary, not a
starting point.

This is round 2. Round 1 of this document returned NOT CLEAN: 5 blockers, 6
majors (numbered M1-M7, M4 unused - the check's own numbering, not a gap
introduced here), 6 minors. Five rulings (Y1-Y5) from the orchestrator settle
the blockers that needed a decision rather than a rewrite; the rest are
corrections applied directly. Section 0 is the disposition table the checker
audits before reading anything else, per `iteration-caps.md`'s entry gate 3.
Every citation below was re-opened at HEAD on 2026-09-20 for this round, not
copied forward from round 1 - the round-1 citations that were already correct
are re-confirmed with the same command/line, not re-derived from scratch.

This is a scope/acceptance-criteria document. No code is written here, and no
sabotage described below has been run against real code, because the code
does not exist yet - each sabotage is a specified recipe for the test seat and
implementer to execute once it does, except where noted as already
mechanically provable by construction (a fixed-length array cannot silently
absorb a new match).

---

## 0. Disposition table (round 1 to round 2)

Per `iteration-caps.md` entry gate 3: kept (with id) / handed over (naming
receiver and obligation) / withdrawn (with reason and enforcer). The rightmost
column is filled in LAST, after every section below was renumbered, per this
task's own instruction (a sibling artifact failed that gate twice).

| Round-1 ID | Severity | What it was | Disposition | Where it lives now |
|---|---|---|---|---|
| B1 | Blocker | Declined `triggerFileDownload` on an inverted rationale | Kept, reversed by RULING Y3 - the mechanism now IS `triggerFileDownload(blob, filename)` | Section 5.3, Section 6 (Trap 2), AC5 |
| B2 | Blocker | The "existing review link" is not a fallback because it renders identically in all three states | Kept, RULING Y1 - a differing post-stop state is now a non-optional requirement | Section 5.6, Section 6 (Trap 1), AC7 |
| B3 | Blocker | AC1's message-side claim leaned on a count-only canary that a read-with-no-write still satisfies | Kept - a real read+write assertion added to the host wiring test | AC1 (revised), Section 12 (`owns`) |
| B4 | Blocker | `owns` derivation used `grep -v .test`, which makes test consumers unfindable by construction | Kept - re-derived with a command that can find them, plus a placement constraint | Section 12 (revised) |
| B5 | Blocker | AC7 (extension fix on the manual link) was optional/separable, creating two extensions for one blob on Safari | Kept, RULING Y2 - folded into AC6 as one criterion, both-or-neither | AC6 (merged) |
| M1 | Major | R1 claimed no removal test is buildable; false - a source-text assertion on the call site is buildable and already shipped elsewhere | Kept - the assertion is now AC5's instrument and doubles as R1's removal test | AC5, Section 1 (removal test) |
| M2 | Major | AC6's title claimed the extension always matches the real format; the mapping does not cover matroska/quicktime/ogg | Kept - mapping widened to name every container Section 6 already discusses, title narrowed to match exactly what it covers | AC6 (revised mapping) |
| M3 | Major | (a) AC7's cost-dependency was stated backwards; (b) AC7's instrument over-specified the exact expression syntax | Kept, both fixed | Section 5.3 (dependency direction), AC6 instrument (fact-only, not spelling) |
| M5 | Major | Section 11 asserted `docs/a19-scope.md` does not exist without running the check ("found nothing" was not run) | Kept - the file exists; re-run the real intersection, which is still empty | Section 11 (revised, real command run) |
| M6 | Major | The leverage three-way call (Redesign/Accept/Reject) was defaulted by this document instead of put to the owner | Kept, RULING Y5 - moved to a batched, non-gating owner question; working default (Accept the cost explicitly) already acted on | Section 1, Section 13 (batched owner question) |
| M7 | Major | The "not touching these four files" inventory missed a second AC13-equivalent comment and the one executable AC13 enforcer, and never checked whether walkthrough-announcement has an enforcer at all (it does not) | Kept - inventory corrected, the coverage gap on `walkthrough-announcement/` recorded as a residual (it is real but outside this row's write set, so this row cannot close it) | Section 2 (inventory), Section 9 residual R5 |
| m1 | Minor | Five citation slips (`useTakes.ts:114`->`:115` twice; `expectedKeys` range/count; C5c block range; `discussion-capture.ts` header range; link block ranges) | Kept - all five corrected in place | Section 3, Section 4, Section 7 (AC6/AC7) |
| m2 | Minor | Revoke-trigger inventory named two of three triggers, missing `clearRecording()` | Kept - third trigger added | Section 6 (Trap 2) |
| m3 | Minor | R1 mis-disposed as an unbuildable residual (it is buildable, per M1); R2 mis-disposed as "a scope decision" residual instead of an owner question put now | Kept, both re-disposed | Section 9 (R1 relocated), Section 13 (R2 as a batched owner question) |
| m4 | Minor | Nothing instructed R1-R4 and Section 8 to be appended to `docs/BACKLOG.md`; Section 8's owner was a placeholder ("whoever accepts this row") | Kept - owner named plainly; an explicit handoff obligation added, naming the receiver (the push step) since this document may edit only `docs/a20-scope.md` | Section 8 (owner named), Section 14 (handoff obligation) |
| m5 | Minor | 5.4 specified a visual fieldHint with no `aria-describedby`, and invoked the wave-3 boundary to refuse "hide" while itself deciding "disable" and writing copy | Kept - both branches of the decision (and its accessibility wiring) relocated to Wave 3 together; a factual correction added (the cited precedents do not actually use a fieldHint paragraph) | Section 5.4 (revised), AC4 (revised) |
| m6 | Minor | Typo ("a occasional empty file") in the sentence carrying the zero-byte disposal, and the disposal itself under-stated the silent-wrong-answer risk Y1 also names | Kept - typo fixed, disposal strengthened and cross-referenced to Y1 | Section 5.5 (revised) |

---

## 1. Leverage claim

Per `docs/loop/leverage.md`, a capability change owes one paragraph naming a
mechanism class, or an explicit statement that none applies. Checked against
the six-class taxonomy: auto-download is not CORPUS (no later act reads
anything back), not CAPTURE (the capture pipeline already exists and is
untouched by this row), not LIVE-LOOP, INTEGRATION, SCALE, or GUARANTEED. It
removes exactly one click - clicking the "Download recording" link that
already renders after a save-video capture stops
(`DiscussionRepliesPanel.tsx:771-777`, `MessageRepliesPanel.tsx:362-368`,
both reopened and confirmed for this round). That is the taxonomy's **struck
class, click cost**: "real and worth counting... but not a categorical
advantage over a chat... real leverage only when named explicitly as
click-cost, never dressed up as integration or persistence it does not have"
(`docs/loop/leverage.md:64`).

**RULING Y5 applied.** Per the worked negative example at
`docs/loop/leverage.md:98-125`, the three legal calls (Redesign / Accept the
cost explicitly / Reject) are "decided by the human who scoped it, never
defaulted by the agent writing the criteria" (`leverage.md:111`). Round 1
wrote "This row takes Accept the cost explicitly" as if this document could
make that call - it cannot. The call is now a **batched, non-gating owner
question** (Section 13), with the working assumption stated plainly as
**Accept the cost explicitly** so the rest of this document, and any build
that starts before the owner answers, is not blocked on it: the advantage is
one click saved per capture, nothing more, and no reader should credit it
with persistence or integration it does not have unless the owner chooses
Redesign instead.

**RULING M1 applied - the removal test.** Round 1 recorded "no removal test
is buildable here" as Residual R1, reasoning that click cost cannot be
observed by any test in this repo. That reasoning is wrong about this
specific claim: the claim is not "a click was saved" (unobservable) but "the
download call exists, fires exactly once, only when requested, only while
mounted" - which is a source-text fact, not a click. AC5's instrument (a
new `useDiscussionCapture.wiring.test.ts`, Section 7) asserts the
`triggerFileDownload(...)` call appears exactly once, inside the
`if (mountedRef.current)` branch of `recorder.onstop`, guarded by
`opts.autoDownload`. **State the deletion, trace the assertion** (leverage.md's
own check on a draft removal test): delete that one call, and the "appears
exactly once" count assertion's value changes from 1 to 0 - RED. That is a
real removal test. R1 is disposed via **(a) Relocate** to AC5's instrument,
not carried forward as an unbuildable residual - see Section 9.

---

## 2. Scope boundary - what this row does and does not touch

**IN SCOPE**, confirmed against HEAD (git commands below, re-run this round):
- Discussion replies capture path: `useDiscussionReplies.ts`,
  `discussion-persisted-controls.ts`, `DiscussionCaptureSettings.tsx`,
  `DiscussionRepliesPanel.tsx`, `useDiscussionCapture.ts`,
  `discussion-capture.ts` (all under `src/app/components/recording/`), plus
  `recording-split.structure.test.ts` (the canary this row's new key must
  keep green), `discussion-capture.test.ts` (new unit cases, Section 7 AC6),
  and a **new** file, `useDiscussionCapture.wiring.test.ts` (AC5's
  instrument - does not exist today, confirmed:
  `find src/app/components/recording -iname "useDiscussionCapture.wiring.test.ts"`
  returns nothing).
- Message replies capture path: `useMessageReplies.ts`,
  `useMessagePersistedControls.ts`, `MessageCaptureSettings.tsx`,
  `MessageRepliesPanel.tsx` (all under `src/app/components/message-replies/`),
  plus `message-replies.structure.test.ts`, `useMessagePersistedControls.wiring.test.ts`
  (AC1's revised instrument, Section 7), and `MessageCaptureSettings.wiring.test.ts`
  (at risk of breaking on the new checkbox's placement - Section 12).
- `useDiscussionCapture.ts` is **shared** by both surfaces (see 5.1) - one
  touch point serving two owners, not a third surface.

**OUT OF SCOPE, AND MUST STAY OUT** - re-measured against HEAD this round:

```
grep -rn "saveVideo" src --include=*.ts --include=*.tsx | grep -v .test
```

confirms all four still pass `saveVideo: false` unconditionally with no
persisted control and no blob:

| Surface | Line (re-measured) |
|---|---|
| `GradingRecordingPanel.tsx` | `:531` `void start({ saveVideo: false });` |
| `LegibilityProbeModal.tsx` | `:168` `void start({ saveVideo: false });` |
| `ModuleDeckCapturePanel.tsx` | `:455` `await start({ saveVideo: false });` |
| `WalkthroughAnnouncementPanel.tsx` | `:515` `await start({ saveVideo: false });` |

**M7 correction - the inventory of what documents this boundary was
incomplete.** Round 1 named only `ModuleDeckCapturePanel.tsx:30,:126`. Reopened
this round:
- `ModuleDeckCapturePanel.tsx:30` and `:126` - present, unchanged, as round 1
  said.
- **A second, near-identical comment round 1 missed**:
  `WalkthroughAnnouncementPanel.tsx:129-130` -
  `// AC13-equivalent: saveVideo is ALWAYS false - a recording blob never` /
  `// crosses a Server Action for this surface either.` - confirmed at HEAD.
- **The one executable enforcer among all four, also missed**:
  `ModuleDeckCapturePanel.wiring.test.ts:90-96` -
  `describe("capture never records a blob (AC13)", ...)` with two `it`
  blocks: one asserts `start({ saveVideo: false })` appears in real code, the
  other asserts `saveVideo: true` appears nowhere in the file, including
  comments. This is a real, running gate.
- **`WalkthroughAnnouncementPanel.tsx` has NO such enforcer.** Confirmed:
  `grep -rn "saveVideo" src/app/components/walkthrough-announcement/*.test.ts`
  returns nothing. The comment at `:129-130` is prose, not a test. This is a
  real coverage gap, but it is a gap in a file this row **must not touch**
  (the owner's ruling forbids editing `WalkthroughAnnouncementPanel.tsx` at
  all), so this row cannot close it - recorded as **Residual R5** (Section 9)
  rather than silently noted and dropped.

**This artifact proposes no edit to `ModuleDeckCapturePanel.tsx`,
`GradingRecordingPanel.tsx`, `LegibilityProbeModal.tsx`, or
`WalkthroughAnnouncementPanel.tsx`.** No acceptance criterion below widens
`saveVideo` on any of them. An implementer who touches any of these four
files has exceeded this row regardless of what else they built correctly.

---

## 3. Re-measured instrument (every citation reopened at HEAD, 2026-09-20, round 2)

**Discussion side:**
- `useDiscussionCapture.ts:382` - `const start = useCallback(async (opts: { saveVideo: boolean }) => {` - confirmed.
- `useDiscussionCapture.ts:465` - `if (opts.saveVideo) {` - confirmed.
- `useDiscussionCapture.ts:472-482` - `recorder.onstop = () => { ... }`: blob
  construction at `:473`, `URL.createObjectURL` at `:474`, the
  `if (mountedRef.current)` branch at `:475-478` (sets `recordingUrlRef`,
  `recordingUrl`, `recordingBytes`), the `else` branch at `:479-481`
  (`URL.revokeObjectURL(url)` - unmounted, nothing to receive a file),
  closing brace `:482`. `recorder.start()` is `:483`.
- `useDiscussionCapture.ts:166-170` - `clearRecording`, a third revoke
  trigger (m2 correction, Section 6).
- `useDiscussionReplies.ts:619` - `await captureRef.current.start({ saveVideo: saveVideoRef.current });` - confirmed.
- `useDiscussionReplies.ts:779` - `captureRef.current.clearRecording();` inside `clearTable` - confirmed (m2).
- `discussion-persisted-controls.ts:139-141` - `saveVideo` state, seeded from
  `readLocalStorage("ta-rec-disc-save-video")` - confirmed. Header at `:26-28`
  states keys are whole string literals because the structure test's canary
  derives its key set with a regex over literal source - confirmed.
- `discussion-persisted-controls.ts:198` - `saveVideo,` in the hook's
  returned object - confirmed.

**Message side:**
- `useMessageReplies.ts:592` - `await captureRef.current.start({ saveVideo: saveVideoRef.current });` - confirmed.
- `useMessageReplies.ts:645` - `captureRef.current.clearRecording();` inside `clearTable` - confirmed (m2).
- `MessageCaptureSettings.tsx:117` - the Save-video `Checkbox` - confirmed.
- `useMessagePersistedControls.ts:29-37` - nine `STORAGE_KEY_*` consts,
  including `STORAGE_KEY_SAVE_VIDEO = "ta-rec-msg-save-video"` at `:37` -
  confirmed.
- `useMessagePersistedControls.ts:104-108` - `saveVideo` state and setter -
  confirmed.

**Download precedent, re-checked:**
- `useTakes.ts:106-120` - `handleDownload`. **m1 correction**: `a.href = take.url;`
  is `:115`, not `:114` (round 1 cited `:114` twice). `a.download` is `:116`.
  Extension logic (`:107-112`) branches on `take.mimeType`; video's branch is
  `ext = take.mimeType.includes("mp4") ? "mp4" : "webm"` (`:111`). This
  function reuses an ALREADY-EXISTING object URL (`take.url`) - it never
  calls `URL.createObjectURL` itself and never revokes.
- `announcementImagePipeline.ts:107-126` (`downloadImage`) does not hand-roll
  the dance - its own comment at `:115-116` says so, and the body at
  `:121-126` calls the shared helper.
- **`triggerFileDownload(blob, filename)`** - `src/app/components/course-planning/utils.ts:19-28`,
  reopened in full this round:
  ```
  export function triggerFileDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  ```
  Mints its own URL from the `Blob` it is handed, clicks, and revokes
  synchronously in the same call - no lingering second URL.
- **`triggerFileDownload` is already imported by BOTH in-scope panels**:
  `DiscussionRepliesPanel.tsx:66` and `MessageRepliesPanel.tsx:27`
  (`import { triggerFileDownload } from "../course-planning/utils";`), and
  `DiscussionRepliesPanel.tsx:58` (a header rule on a file this row edits)
  reads: `// triggerFileDownload, never a hand-rolled object-URL dance.` -
  both confirmed at HEAD.
- **`discussion-capture.ts`'s header is `:1-13`** (m1 correction; round 1
  said `:1-12`).

**RULING Y3 applied - which download mechanism this row uses, reversed from
round 1.** Round 1 chose to borrow the long-lived `recordingUrl` (`useTakes.ts`'s
pattern) and declined `triggerFileDownload` on the grounds that it would mint
a "second URL... for no benefit." That rationale is inverted by four measured
facts:
1. `triggerFileDownload` is not a fourth, unprecedented location - it has
   roughly 24 call sites repo-wide (`grep -rln "triggerFileDownload(" src --include=*.ts --include=*.tsx | wc -l`
   - re-run this round, 24) and is the house standard, not an outlier.
2. Both in-scope panels already import it (`:66`, `:27` above) - reusing it
   here adds no new dependency.
3. `DiscussionRepliesPanel.tsx:58`'s own header rule - on a file this row
   edits - names it as the required idiom, and round 1's own Section 3 quoted
   `announcementImagePipeline.ts:115-116` making the identical point without
   applying it here.
4. At the point in `onstop` where the download would fire, `blob` is already
   a local variable (`useDiscussionCapture.ts:473`), so
   `triggerFileDownload(blob, filename)` needs no second `URL.createObjectURL`
   call reasoned about across time - it creates and revokes its own URL
   **synchronously inside one function call**, which is a strictly *shorter*
   lifetime to reason about than borrowing `recordingUrl`, not a longer one.
   Borrowing `recordingUrl` would make the download a second, longer-lived
   consumer of a URL that already has three independent revoke triggers
   (Section 6, Trap 2) - `triggerFileDownload`'s own URL has none, because it
   is gone before the function returns.

**Mechanism, corrected: `triggerFileDownload(blob, filename)`, called from
inside `recorder.onstop`'s `if (mountedRef.current)` branch, guarded by
`opts.autoDownload`.** Full design in Section 5.3.

---

## 4. Baseline measurement of the two structure tests this row must keep green

```
npx vitest run src/app/components/recording/recording-split.structure.test.ts src/app/components/message-replies/message-replies.structure.test.ts
```
Output, 2026-09-20: `Test Files  2 passed (2)` / `Tests  62 passed (62)`.
Re-confirmed for this round; unchanged from round 1 (no other in-flight work
touches these two files - Section 11).

**m1 correction to the exact-set canary's citation.** The literal array is
`recording-split.structure.test.ts:341-405` (the `const expectedKeys = [` /
`];` pair), holding **63 entries at `:342-404`** (`404 - 342 + 1 = 63`), not
"16 ta-rec-disc-* entries" as round 1's Section 3 loosely described it -
sixteen is the count of entries matching the `ta-rec-disc-*` prefix
specifically (confirmed by counting `grep -c "ta-rec-disc-" <(sed -n
'342,404p' recording-split.structure.test.ts)` = 16), out of 63 total keys in
that array covering every `ta-rec-*` prefix in the directory. The count
assertion this row must bump is at `:515-517`
(`expect(discKeys).toHaveLength(16)`), inside a **separate, narrower** block
(`:470-542`, corrected below) that derives and checks only the
`ta-rec-disc-*` subset - not the 63-entry array.

**m1 correction to the C5c wiring block's range.** The "every ta-rec-disc-*
key is wired to both a read and a write" describe block is
`recording-split.structure.test.ts:470-542`, not `:470-517` as round 1 cited
- `:470-517` stops mid-block, before the load-bearing `it.each` assertion at
`:531-541` that actually checks each key's read/write wiring (the range round
1 cited only reaches the two setup assertions at `:511-517`, the "finds at
least one" check and the "finds exactly sixteen" count).

Both structure-test facts (62/62 passing today, the 63-entry array, the
16-entry `ta-rec-disc-*` subset) are unchanged by this round's design
revisions - AC2/AC3 (Section 7) are unaffected by the RULING Y1-Y3 changes,
since those only touch key COUNT, not the download mechanism.

---

## 5. Design decisions

### 5.1 One new persisted control, or ride on "Save video"?

**Unchanged from round 1 - confirmed sound at round 1's check.** A new,
separate persisted control per surface ("Download automatically when
recording stops" - wording taken verbatim from the row's own note,
`docs/backlog.yml:406`), defaulting to **off**. `saveVideo` answers "keep the
recording at all"; auto-download answers "in addition, push it to the
instructor's downloads folder without being asked" - a real, distinct
preference an instructor may hold independently in either direction.

### 5.2 One shared implementation, or two independent ones?

**Unchanged from round 1 - confirmed sound.** Two independent
persisted-control implementations (one added to `discussion-persisted-controls.ts`,
one to `useMessagePersistedControls.ts`), matching each file's own existing
convention (whole-string-literal keys vs. `STORAGE_KEY_*` consts - see
Section 3), while the actual download mechanism and the extension mapping
live once, inside the shared `useDiscussionCapture.ts` / `discussion-capture.ts`
that message-replies already imports directly
(`useMessageReplies.ts:39,257`).

### 5.3 The mechanism (where the download actually happens) - revised (RULING Y3, M1, M3a)

`useDiscussionCapture.ts`'s public interface (`UseDiscussionCaptureReturn`,
`:33-69`) gains:
- `start`'s options: `(opts: { saveVideo: boolean; autoDownload?: boolean; downloadFileNameBase?: string }) => Promise<void>` (was `{ saveVideo: boolean }`, `:58`).
- A new field, `recordingMimeType: string | null` (alongside `recordingUrl`/`recordingBytes`, `:49-50`) - today nothing exposes the negotiated mime type; the hook computes `recorder.mimeType || mimeType || "video/webm"` inline as the `Blob`'s `type` argument (`:473`) and never stores it.

**M3a correction - the dependency this field exists for, stated in its real
direction.** Round 1 said AC7 (the manual-link extension fix) "costs nothing
extra once `recordingMimeType` is threaded to the panel," implying the
threading happens for some other reason and AC7 merely rides along. That is
backwards: **AC6 (the merged extension rule, below) is the ONLY reason
`recordingMimeType` needs to reach either panel at all.** AC4/5.4's
disabled-state reasoning depends on `saveVideo`, which is already threaded
independently and needs no mime-type information. If AC6 is ever dropped,
`recordingMimeType` threading to the panel drops with it - nothing else in
this document needs it there. (The hook itself still needs to know the mime
type internally, to compute the auto-download filename's extension - that
part is not optional and does not depend on any panel-level threading.)

Inside `recorder.onstop` (`:472-482`), name the existing inline expression:
```
const resolvedMimeType = recorder.mimeType || mimeType || "video/webm";
```
used for the `Blob`'s `type` (replacing the inline expression at `:473`) and
for the new `recordingMimeType` state, set in the same `if (mountedRef.current)`
branch as `recordingUrl`/`recordingBytes` (`:475-478`).

**Revised per RULING Y3**: in the same branch, when `opts.autoDownload` is
true, call:
```
triggerFileDownload(blob, `${opts.downloadFileNameBase ?? "recording"}.${videoExtensionFromMimeType(resolvedMimeType)}`);
```
using the `blob` variable already in scope at `:473` - **not** the anchor
built against `url`/`recordingUrl`. `triggerFileDownload` needs importing
into `useDiscussionCapture.ts` from `../course-planning/utils` (a third and
fourth caller now import it - see Section 3's ~24-site count; both in-scope
panels already do). This never runs in the `else` branch (`:479-481` -
component already unmounted, nothing to receive a file).

`videoExtensionFromMimeType` (below) replaces the two-way ternary round 1
proposed - see AC6 (Section 7) for the widened mapping and the reason
(RULING Y4).

Each orchestrator threads its own `downloadFileNameBase`, matching the
existing hardcoded manual-link names exactly:
- `useDiscussionReplies.ts:619` becomes `start({ saveVideo: saveVideoRef.current, autoDownload: autoDownloadRef.current, downloadFileNameBase: "discussion-capture" })`.
- `useMessageReplies.ts:592` becomes the same shape with `downloadFileNameBase: "message-replies-capture"`.

`autoDownloadRef` mirrors the existing `saveVideoRef` exactly
(`useDiscussionReplies.ts:295-298`, `useMessageReplies.ts:318-321`) - a
`useRef` seeded from the persisted value, kept current by a one-line
`useEffect`, for the same stale-closure reason the original ref exists.

### 5.4 What happens when "Save video" is off - revised (m5)

**m5 correction, factual.** Round 1 cited `disabled={!canCopyReply}`
(`DiscussionReplyRow.tsx:665`) and `disabled={!canSaveOrSend}`
(`MessageThreadRowActions.tsx:219,230`) as precedent for "disabled, with a
visible fieldHint paragraph explaining the dependency." Reopened this round:
neither precedent does that. `DiscussionReplyRow.tsx:665`'s `Button` carries
a `title` tooltip, not a visible paragraph. `MessageThreadRowActions.tsx:219,230`
carry no adjacent reason at all - visual or ARIA. **The "disabled, not
hidden" shape is a real, confirmed house pattern; the specific
fieldHint-paragraph mechanism round 1 proposed on top of it is not - it would
be a new invention for this row, not a copy of an existing one**, and this
document's own claim to be copying a pattern was wrong.

**m5 correction, structural.** Round 1's 5.4 refused to decide "hide vs.
disable" ("a Visual/aesthetic-seat concern this document is not authorized
to resolve, per `seats.md`'s wave-3 boundary") while, in the same paragraph,
deciding "disable" and writing the copy itself - applying the boundary to one
branch of the same decision and not the other.

**Revised decision: this document states the REQUIREMENT, not the
mechanism.** The requirement: a control disabled by an unmet dependency
(`saveVideo` off) must have its reason discoverable by more than sighted
mouse-hover alone - the existing precedents in this codebase do not clear
that bar for a *checkbox* the way `title` marginally does for a *button* with
a tooltip. The following are relocated together, as one obligation, to Wave 3
(User experience + Accessibility, `seats.md`), since splitting the decision
from its accessibility wiring is exactly the mistake round 1 made:
- whether the new control is hidden or disabled when `saveVideo` is off;
- the exact copy explaining the dependency, if any is shown;
- how the reason reaches assistive technology (an `aria-describedby` pointing
  at a hint element is one candidate, matching the pattern already proven
  correct elsewhere in this same directory for a different purpose -
  `DiscussionReplyRow.tsx:546,575` - but Wave 3 owns the actual choice here).

**Not relocated, because it is not a UX decision**: the checkbox's persisted
value must exist and be readable/writable regardless of which display choice
Wave 3 makes (Section 5.1), and `disabled={!saveVideo}` (if Wave 3 keeps
"disable") must not clear or hide the persisted value while disabled -
whatever the instructor had checked before turning "Save video" off must
still be there if they turn it back on. This is a data-integrity requirement
on the persisted control (5.1), not a rendering choice.

### 5.5 Zero-byte or failed blob - revised (m6)

Two distinct failure shapes exist in `:466-494` today:

- **MediaRecorder construction or `.start()` throws** (existing `catch`,
  `:485-494`) - `recorder.onstop` is never assigned to a live recorder, so it
  never fires. Auto-download cannot run here by construction.
- **`onstop` fires normally but `chunksRef.current` is empty** -
  `new Blob([], { type: resolvedMimeType })` has `size === 0`, and today's
  code already renders the manual "Download recording (0.0 MB)" link
  unconditionally on blob size. **Decision, unchanged from round 1**:
  auto-download uses the identical gate the manual link already uses - no
  added byte-size check, so the two paths cannot disagree about whether a
  "download" happened for the same event.

**m6 correction.** Round 1's sentence read "a occasional empty file" (typo,
fixed) and under-stated the risk this creates once auto-download exists. A
rendered link the user declines to click costs nothing. **An automatic
0-byte file silently written to Downloads is a different risk class: it is
indistinguishable, to the instructor, from a successful save** - they did not
choose to click it, so a 0 KB file with no error banner reads as "it worked"
rather than "nothing was captured." Combined with RULING Y1 (Section 5.6),
this is the same silent-wrong-answer shape Y1 exists to prevent, on the
byte-count axis rather than the browser-permission axis. This document does
not resolve it - unlike Y1, it is a genuine product tradeoff (auto-downloading
a file the manual link would also have offered vs. skipping a possibly-real
0-byte capture) - so it is put to the owner now, batched, non-gating
(Section 13), not silently shipped and not left as an inert residual with no
step (m3's finding on R2).

### 5.6 The differing post-stop state (RULING Y1, new)

**The defect Y1 identifies.** `DiscussionRepliesPanel.tsx:771-777` and
`MessageRepliesPanel.tsx:362-368` render the "Download recording" link
identically whether auto-download is off, on-and-succeeded, or
on-and-silently-dropped by the browser (Trap 1, Section 6). A control present
in all three states cannot be the fallback for the middle-vs-third case,
because nothing distinguishes them - an instructor who turned the setting on
and got nothing sees the exact screen they would have seen with it off.

**The requirement (non-optional, per RULING Y1).** The post-stop state MUST
differ based on whether auto-download was requested, independent of whether
it can be shown to have succeeded (this repo cannot detect that - Trap 1).
Minimum: one additional element renders **only when `autoDownload` was true
for this session**, alongside the existing unconditional link. This turns an
indistinguishable silence into an interpretable one: an instructor who sees
the extra element and finds nothing in Downloads has actionable information
("it should be there; if it isn't, use the link below") that an instructor
who never asked for auto-download does not need and will not see.

**What is relocated to UX (Wave 3), per RULING Y1's own instruction**: the
exact copy and its placement. This document fixes only the REQUIREMENT that
the states differ and the mechanism that makes it checkable (below) - not the
sentence itself. A strawman, non-binding illustration for scale only: a
second line under the existing link, shown only when auto-download was
requested, along the lines of "this should already be in your Downloads
folder - if it isn't there, use the link above." UX owns whether that is the
right sentence, its exact wording, and where relative to the existing link it
sits.

**Why this is checkable despite no component rendering under any test
here.** The claim is not "the browser actually saved a file" (unverifiable,
Trap 1, Section 8) but "the panel's JSX contains a conditional block gated on
whether auto-download was requested, distinct from the unconditional
`recordingUrl`-only block" - a structural fact about markup, which
`this-repo.md`'s own load-bearing category (source-text tests) can check by
reading. See AC7 (Section 7).

---

## 6. The four traps, addressed explicitly

**Trap 1 - browser may silently refuse the download.** `recorder.onstop` is
an event callback, not a click handler; nothing in this repo can observe
whether a given browser honors a programmatic `a.click()` download issued
from it (the same limit applies whether the click runs through
`triggerFileDownload` or a hand-rolled anchor - RULING Y3 changes the
mechanism, not this limit). **RULING Y1 changes what must exist as a result:
round 1's answer ("the existing link already covers it, no new code needed")
is the defect the ruling identifies, not a resolution of this trap.** The
existing link is retained (still needed for the off-and-on-but-succeeded
cases and as the actual download path when auto-download is declined or
fails), but it is no longer treated as sufficient on its own - Section 5.6 /
AC7 is the code this trap now requires. **Owner verification row is Section
8**, first-class, not a footnote, for the part that genuinely cannot be
checked here: whether a real browser actually writes the file.

**Trap 2 - object URL ownership - revised (RULING Y3, m2).** There remains
exactly one long-lived object URL for the whole session's recording
(`recordingUrlRef.current` / `recordingUrl` state), created once in
`onstop`, revoked on any of **three** triggers (m2 correction - round 1 named
two):
1. `revokeRecordingUrl()` at the top of the next `start()` (`:419`);
2. on unmount (`:377`, per the comment at `:375-376`);
3. **`clearRecording()`** (`:166-170`), called from `useDiscussionReplies.ts:779`
   and `useMessageReplies.ts:645` when the reply table is cleared - missed in
   round 1's inventory.

**RULING Y3 removes the auto-download path from this URL's lifetime
entirely.** `triggerFileDownload(blob, filename)` mints and revokes its OWN,
separate object URL from the `blob` value, synchronously, inside one
function call (Section 3) - it never touches `recordingUrlRef.current`, never
races any of the three triggers above, and has no lifetime that outlives the
`onstop` callback that creates it. This is a *smaller* surface than round
1's "borrow `recordingUrl`" design, not a larger one - no second consumer of
the long-lived URL exists, so none of the three triggers above needs any new
reasoning.

**Trap 3 - extension is not always webm - revised (RULING Y2, Y4, M2, M3b).**
`RECORDER_MIME_TYPES` (`useDiscussionCapture.ts:73`) lists only `video/webm`
variants; `pickRecorderMimeType()` (`:75-81`) returns `""` on a browser
supporting none of them (e.g., Safari), and the browser then picks its own
default, not guaranteed to be webm. `recorder.mimeType` (read after the fact)
is the only place this is knowable.

**RULING Y4 - the mapping was under-inclusive relative to its own title.**
Round 1's `videoExtensionFromMimeType` mapped everything that is not `mp4` to
`.webm`, including `video/x-matroska`, `video/quicktime`, and `video/ogg` -
three containers this very section already names as possible outcomes of an
unconstrained browser default. AC6's title claimed "the extension matches the
real recorded format" while its own implementation could not be true for
exactly the case this section describes as real. **Revised mapping (AC6,
Section 7)** widens the function to name every container this section
discusses, and the title is narrowed to state exactly that scope - it does
not claim coverage of a mimeType nobody has named a reason to expect.

**RULING Y2 - AC7 folded into AC6, one extension rule, both paths.** Round 1
shipped AC6 (the pure mapping function) and AC7 (an optional, separable fix
to the manual link's hardcoded `.webm`) as two criteria, either of which
could ship without the other. On a Safari-negotiated `video/mp4` capture,
that split produces `discussion-capture.mp4` from the auto-download path and
`discussion-capture.webm` from the manual link, for the identical blob - one
of the two names will not open, which is strictly worse than today's
consistently-wrong `.webm` on both. **AC6 (Section 7) now requires ONE
extension computation used by BOTH paths - both ship together or neither
ships**, enforced by construction (both consumers call the same exported
function on the same stored value) rather than by two independent
assertions that could each pass while the other regresses.

**Trap 4 - persistence and the hydration mount-effect concern.** Unchanged
from round 1 - confirmed sound, not re-litigated. The new control's `useState`
initializer copies `saveVideo`'s exact existing shape in each file
(`discussion-persisted-controls.ts:139-141`, `useMessagePersistedControls.ts:104`).
Whether that shared shape already has a live SSR/hydration bug is not
decidable by any measurement available here (no component renders under any
test in this repo) - recorded as Residual R3 (Section 9), unchanged.

---

## 7. Acceptance criteria

Each names the object under comparison, the instrument, and the direction of
failure, plus a sabotage. AC1 and AC6 are revised from round 1; AC2, AC3 and
Trap 4's disposition are unchanged; AC7 is new (replacing round 1's AC7,
which is withdrawn into AC6 - see the disposition table, Section 0).

**AC1 - both new persisted keys exist and are read/write-wired - revised (RULING B3).**
- Object: `ta-rec-disc-auto-download` (in `discussion-persisted-controls.ts`)
  and `ta-rec-msg-auto-download` (in `useMessagePersistedControls.ts`).
- Instrument, discussion side (unchanged): `recording-split.structure.test.ts`'s
  "every ta-rec-disc-* key is wired to both a read and a write (C5c)" block,
  `:470-542` (m1-corrected range; the load-bearing `it.each` is `:531-541`),
  which derives its own key list from source and needs no new hardcoded name
  to find this key.
- Instrument, message side - **revised, no longer relies on the ordinal
  canary alone**: `message-replies.structure.test.ts:101-103`'s "finds
  exactly fourteen distinct ta- keys" is a COUNT, and a read with no write
  still counts toward it - a key that is read but never written would move
  the count from 14 to 15 exactly as a correctly-wired key would, and the
  test cannot tell the two apart. A genuine wiring assertion is added
  instead, in `useMessagePersistedControls.wiring.test.ts` (the host file for
  this key - `:13-27` already runs the equivalent "literal string present"
  check for all nine existing keys the same way): a new case asserting (a)
  a `STORAGE_KEY_AUTO_DOWNLOAD = "ta-rec-msg-auto-download"` const exists,
  (b) `readLocalStorage(STORAGE_KEY_AUTO_DOWNLOAD)` appears, (c)
  `writeLocalStorage(STORAGE_KEY_AUTO_DOWNLOAD` appears - the same
  DIRECT/INDIRECT distinction `recording-split.structure.test.ts`'s own C5c
  comment already documents for this directory's `STORAGE_KEY_*` convention.
- Direction of failure: RED if either the read or the write call for
  `ta-rec-disc-auto-download` is missing (discussion side, per the existing
  proven sabotage on a sibling key, `:496-501`); RED if any of the three new
  assertions on the message side fails.
- Sabotage, discussion side: delete the write call, leaving the read -
  expected RED on that key's write assertion only, proven shape
  (`:496-501`). Sabotage, message side: delete the `writeLocalStorage(STORAGE_KEY_AUTO_DOWNLOAD`
  call - expected RED on the new write assertion, while the ordinal count
  assertion (still bumped to 15 per AC3) stays green, demonstrating exactly
  the gap this revision closes.
- `useMessagePersistedControls.wiring.test.ts` is added to `owns` (Section 12).

**AC2 - discussion side's exact-set canary is updated in the same commit.**
Unchanged from round 1, confirmed sound.
- Object: the 63-entry literal array at `recording-split.structure.test.ts:341-405`
  (entries `:342-404`) and the count assertion at `:515-517` ("finds exactly
  sixteen" `ta-rec-disc-*` keys, a different, narrower count than the 63).
- Instrument: `npx vitest run src/app/components/recording/recording-split.structure.test.ts`.
- Direction of failure: RED if `ta-rec-disc-auto-download` is added to the
  source without adding it to the array (alphabetically between
  `"ta-rec-disc-audience"` at `:364` and `"ta-rec-disc-course"` at `:365` -
  confirmed by string comparison: `audience` < `auto-download` < `course`)
  and bumping `16` to `17` at `:516`.
- Sabotage: add the key to source only. Expected RED by construction (a
  fixed-length array compared against a set that grew by one cannot pass).

**AC3 - message side's ordinal canary is updated in the same commit.**
Unchanged from round 1, confirmed sound.
- Object: `message-replies.structure.test.ts:101-103` ("finds exactly
  fourteen distinct ta- keys").
- Instrument: `npx vitest run src/app/components/message-replies/message-replies.structure.test.ts`.
- Direction of failure: RED if the count is not bumped to 15 in the same
  commit that adds `ta-rec-msg-auto-download`.
- Sabotage: add the key, leave `14`. Expected RED by construction.

**AC4 - the new checkbox is disabled (or hidden - Wave 3's call) when "Save video" is off, on both surfaces, with its reason reaching assistive technology - revised (m5).**
- Object: the new control in `DiscussionCaptureSettings.tsx` and
  `MessageCaptureSettings.tsx`, and its accessible-name/description wiring.
- Instrument: **none executable.** No component is rendered by any test in
  this repo, so neither the show/hide/disable choice nor its ARIA wiring can
  be asserted mechanically here.
- Direction of failure: n/a - reading claim, not a measured one.
- Not a criterion with a sabotage; **Residual R4** (Section 9), narrowed this
  round to explicitly include the accessibility wiring decision, not only
  "does it disable correctly."
- **Relocated as one obligation** (m5): the disable-vs-hide choice, its exact
  copy, and how its reason reaches assistive technology are Wave 3's
  (User experience + Accessibility) to decide together - not split across two
  authorities the way round 1 split them.

**AC5 - the auto-download call exists exactly once, inside the mounted branch, guarded correctly, and never fires post-unmount - revised (RULING M1, Y3).**
- Object: the `triggerFileDownload(...)` call site inside
  `useDiscussionCapture.ts`'s `recorder.onstop`.
- Instrument: a **new** file, `useDiscussionCapture.wiring.test.ts` (added to
  `owns`, Section 12), mirroring the already-shipped idiom at
  `repoGrades.wiring.test.ts:733` (slicing a handler's body between two
  literal anchors) and `:770` (`expect(source).toContain("triggerFileDownload")`
  as the "uses the shared helper, not a hand-rolled dance" check). Concretely:
  read the source; slice the text between the literal `onstop = () => {` and
  the literal `recorder.start();` that follows it (both already present today
  and stable under this row's own diff) to isolate the handler body; within
  that slice, assert (a) `triggerFileDownload(` occurs exactly once; (b) that
  occurrence's nearest enclosing `if` is `if (mountedRef.current)`, not the
  `else`; (c) it is directly guarded by `if (opts.autoDownload)`. Pin the
  FACT (count, branch, guard), not the exact surrounding whitespace or
  variable name chosen for the filename expression (source-text-tests
  over-specify trap, `docs/loop/traps-tests.md`).
- Direction of failure: RED if the call is missing, duplicated, moved into
  the `else` branch, or unguarded by `opts.autoDownload`.
- Sabotage 1 (removal - also M1's removal test for the leverage claim,
  Section 1): delete the call. The "exactly once" assertion's value changes
  from 1 to 0 - RED.
- Sabotage 2 (guard): delete `if (opts.autoDownload)`, calling
  `triggerFileDownload` unconditionally. The "directly guarded" assertion
  goes RED; the "exactly once" count is unaffected, which is why both
  assertions are needed, not one.
- Sabotage 3 (branch): move the call into the `else` (post-unmount) branch.
  The "enclosing branch is mountedRef.current" assertion goes RED.
- **What remains unverifiable, unchanged from round 1**: whether a real
  browser actually honors the resulting `a.click()` and writes a file. That
  is Trap 1 / Section 8, not this criterion.

**AC6 - ONE extension rule, both paths, matching the real recorded format for every container this document names - revised and merged with round 1's AC7 (RULING Y2, Y4, M2, M3b).**
- Object: `videoExtensionFromMimeType(mimeType: string): "mp4" | "webm" | "mkv" | "mov" | "ogv"`
  in `discussion-capture.ts`, and its use at BOTH the auto-download filename
  (inside `useDiscussionCapture.ts`'s `onstop`, Section 5.3) and the manual
  review link's `download=` attribute in `DiscussionRepliesPanel.tsx` and
  `MessageRepliesPanel.tsx` (via the new `recordingMimeType` field threaded
  down alongside the existing `recordingUrl`/`recordingBytes` destructuring
  at `DiscussionRepliesPanel.tsx:136-137` and `MessageRepliesPanel.tsx:94-95`).
- **RULING Y4 - the mapping, widened to match its own title.** Round 1's
  mapping (`mimeType.includes("mp4") ? "mp4" : "webm"`) silently mapped
  `video/x-matroska`, `video/quicktime`, and `video/ogg` to `.webm` - three
  containers Trap 3 (Section 6) already names as real possibilities on a
  browser with no `RECORDER_MIME_TYPES` match. Revised:
  ```
  mimeType.includes("mp4") ? "mp4"
    : mimeType.includes("webm") ? "webm"
    : mimeType.includes("matroska") ? "mkv"
    : mimeType.includes("quicktime") ? "mov"
    : mimeType.includes("ogg") ? "ogv"
    : "webm"  // unrecognized or empty mimeType - today's existing fallback, unchanged
  ```
  The title's claim is honest for exactly this list; a mimeType this
  function has never been told to expect still falls back to `.webm`
  (matching today's behavior) and is not claimed as "the real format" for
  that case - this is a known, named limit, not a silent gap.
- **RULING Y2 - both-or-neither, by construction.** Both consumers (the
  hook's filename computation and each panel's `download=` attribute) call
  the SAME exported function on the SAME stored mime-type value
  (`recordingMimeType` in the panels, `resolvedMimeType` in the hook,
  Section 5.3) - they cannot diverge without one of them stopping using the
  shared function, which the instrument below checks for directly.
- Instrument: (1) `discussion-capture.test.ts` (existing file) gains cases
  for each named branch: `"video/webm;codecs=vp9"` -> `"webm"`,
  `"video/mp4"` -> `"mp4"`, a matroska mimeType -> `"mkv"`, a quicktime
  mimeType -> `"mov"`, an ogg mimeType -> `"ogv"`, and `""` -> `"webm"`
  (fallback case, pinning the documented limit rather than hiding it). (2) A
  **fact-only** source-text assertion (M3b correction - see below) on both
  panels: the `download` attribute is not the literal string
  `"discussion-capture.webm"` / `"message-replies-capture.webm"`, and the
  file both imports and calls `videoExtensionFromMimeType` somewhere in
  computing the value that attribute uses.
- **M3b correction - the instrument was over-specified in round 1.** Round 1
  required the `download` prop to "reference a computed expression involving
  the panel's own `recordingMimeType`" - literally, which rejects correct
  code like `download={downloadName}` computed one line above and used by
  reference. Per the source-text-tests-over-specify trap
  (`docs/loop/traps-tests.md`), the revised instrument pins the FACT (not a
  literal `.webm` suffix; the shared function is imported and called
  somewhere in the file) and not the exact spelling or locality of the
  expression.
- Direction of failure: RED if either panel reverts to a hardcoded `.webm`
  literal, or if `videoExtensionFromMimeType` is imported but unused, or if
  the pure-function mapping regresses on any named branch.
- Sabotage 1 (divergence, Y2's whole point): hardcode `.webm` back onto ONE
  panel only, leaving the other computed. Expected: RED on that panel's
  assertion only - proving the two paths are checked independently and
  cannot silently drift apart while the other stays green.
- Sabotage 2 (mapping): invert or delete one named branch (e.g., swap the
  `mp4`/`webm` results, or delete the `matroska` branch so it falls through
  to the `webm` default). Expected: the corresponding unit-test case(s) flip
  to RED.
- This is the one part of the whole feature with no browser dependency at
  all for the pure-function half, and a real, if narrow, dependency (does
  `download=` still reference the shared computation) for the panel half -
  both are executable today, unlike AC4/AC5's browser-only remainder.

**AC7 - the post-stop state differs based on whether auto-download was requested (RULING Y1, new).**
- Object: a JSX block in `DiscussionRepliesPanel.tsx` and
  `MessageRepliesPanel.tsx`, rendered only when `autoDownload` was true for
  the session that just stopped, distinct from and in addition to the
  existing unconditional `recordingUrl && (...)` link block
  (`DiscussionRepliesPanel.tsx:771-777`, `MessageRepliesPanel.tsx:362-368`).
- Instrument: a new source-text assertion (implementer's choice of file - the
  panel's own wiring test, or a new one) checking (a) a conditional block
  exists whose condition includes the panel's `autoDownload` value (however
  it is named once threaded - pin the fact of a second, narrower condition,
  not its exact identifier spelling, per the over-specification trap), and
  (b) that block is textually distinct from the unconditional
  `recordingUrl`-only block (i.e., there exist two separate conditionally-
  rendered regions in the stopped-state area, not one that merely got a
  second sentence appended inside the same condition it always had).
- Direction of failure: RED if the new block's condition does not reference
  the auto-download-requested value, or if there is only one conditional
  block where two are required.
- Sabotage: fold the new copy into the EXISTING unconditional
  `recordingUrl && (...)` block instead of adding a second, narrower
  condition. Expected RED - this reproduces the exact defect Y1 identifies
  (a control present in all three states, not a differentiator) inside the
  test itself, so the test would catch a "fix" that only adds words without
  adding a real conditional.
- **What remains unverifiable, unchanged**: whether the browser actually
  wrote a file, and therefore whether the instructor's observed absence is
  "browser blocked it" vs. "still downloading" vs. some other cause. That
  granularity is Trap 1 / Section 8's owner-verification item, not something
  this criterion or any exact copy can resolve from inside the app.
- Exact copy and placement are UX's (Section 5.6) - this criterion enforces
  only that a structurally distinct, conditionally-rendered element exists.

---

## 8. Owner verification (Trap 1) - first-class, not a footnote

**Item:** does the auto-download actually produce a file in a real browser
when triggered from inside `recorder.onstop`, on at least Chrome and Safari
(the two engines Trap 3's mime-type divergence already distinguishes)? Does
the new differing-state element (AC7) read correctly against what actually
happened in each case?

**Why no instrument here can answer it:** `vitest` here is `environment:
"node"`, collects `src/**/*.test.ts` only, and renders no component
(`docs/loop/this-repo.md` section 2). There is no jsdom, no `MediaRecorder`,
no real anchor-click-to-download browser behavior available to any test in
this repo.

**What settles it:** a person, in a real browser, with real Canvas data,
turning on both "Also save the screen recording" and "Download automatically
when recording stops," running a short capture, clicking Stop, and checking
whether a file lands in Downloads without further interaction, and whether
AC7's new element reads sensibly. Repeat once on a browser known to negotiate
a non-webm mime type if one is available, to exercise AC6 end to end.

**Owner (m4 correction - named, not a placeholder):** the owner - the same
person recorded as `from: 'Owner, 2026-09-20, mid-turn'` on this row
(`docs/backlog.yml:406`) and on every other ruling cited in this document.
This repo's own cards (`this-repo.md` section 6, `DEV_LOOP.md`'s "Record
disposals") consistently use "the owner" as this fixed role, not a rotating
"whoever accepts it" - there is one person who can run a real browser against
real Canvas data here, and it is the same person who filed this row.

**Step:** after Build and before this row is marked closed in
`docs/BACKLOG.md` - see Section 14 for who is responsible for getting this
row's residuals into that file, since this document may edit only itself.

---

## 9. Residual register

| # | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | ~~No removal test exists for the click-cost leverage claim~~ - **disposed this round (RULING M1, m3): relocated, not carried forward.** The removal test is AC5's instrument (Section 7): delete the `triggerFileDownload(...)` call, and AC5's "exactly once" count assertion goes from 1 to 0. | Test seat | `useDiscussionCapture.wiring.test.ts` (Section 7, AC5) | Runs as part of AC5's own gate - no separate step needed |
| R2 | ~~A zero-byte capture already renders a manual link today, and auto-download will match that behavior rather than fix it~~ - **re-disposed this round (m3): this is a product tradeoff, not a residual with no step - put to the owner NOW as a batched question (Section 13), not parked.** | Owner | n/a - a decision, not a measurement | Section 13, this round, non-gating |
| R3 | Whether the existing `saveVideo` persisted-control pattern already has a live SSR/hydration mismatch that the new `autoDownload` key would inherit unchanged (Section 6, Trap 4) | Owner / a future render-capable check | None - no component renders under any test here | A real browser reload check, same owner-verification session as Section 8, or whenever this repo gains a render-capable test |
| R4 | Whether the new checkbox's show/hide/disable choice (AC4) is correct and whether its reason reaches assistive technology, and whether the download actually fires once from a real click in a real browser (AC5's browser-only remainder, beyond the call-site shape AC5 now proves) | Owner / Accessibility seat (Wave 3) | Real browser, manual interaction; Accessibility seat's reading pass for the ARIA wiring choice | AC4's disposal happens in Wave 3, before Build; the browser-behavior half is the same owner-verification session as Section 8 |
| R5 | `WalkthroughAnnouncementPanel.tsx` has a documented AC13-equivalent comment (`:129-130`) but NO executable enforcer - `grep -rn "saveVideo" src/app/components/walkthrough-announcement/*.test.ts` returns nothing (Section 2, M7) | Test seat, on whichever future row next touches `walkthrough-announcement/` | A new `*.wiring.test.ts` mirroring `ModuleDeckCapturePanel.wiring.test.ts:90-96`'s two-assertion shape (call exists; `saveVideo: true` appears nowhere) | Before that future row's own push - this row cannot close it, since it must not edit any file under `walkthrough-announcement/` |

---

## 10. Disposition of the row's own group-2 analysis

Unchanged from round 1 - confirmed sound, not re-litigated. Group 2
(grading-from-a-recording, legibility probe, module deck capture, walkthrough
announcement) is **(d) Delete** from this row's own scope, per the owner's
own ruling in `docs/backlog.yml:406`, with the enforcer it protects named:
`ModuleDeckCapturePanel.tsx`'s AC13 point 3 (`:30`, `:126`, re-confirmed
Section 2) and, per this round's M7 correction, `WalkthroughAnnouncementPanel.tsx:129-130`'s
matching comment. Nothing in this document reopens that question.

---

## 11. Collision surface with A18 / A19 / A8-R - revised (M5)

**M5 correction.** Round 1's Section 11 stated `docs/a19-scope.md` "does not
exist yet (checked: `ls docs/a19-scope.md` at the start of this session found
nothing)" without that command having actually been run this round - an
unrun check reported as done. Re-run for real, this round:

```
ls docs/a19-scope.md docs/a18-scope.md docs/a8r-scope.md
```
All three exist at HEAD (`docs/a19-scope.md` was added in commit `ba15be7`,
two commits before this session's work began - confirmed in this session's
own git log). The disposition round 1 reached anyway - no real intersection -
**survives**, but only because it is re-derived here, not because the
original claim was safe to leave uncorrected:

```
grep -noE "src/[A-Za-z0-9_./-]+\.(ts|tsx)" docs/a19-scope.md | cut -d: -f2 | sort -u
```
returns files entirely under `src/app/components/walkthrough-announcement/`,
`src/lib/walkthrough-*`, `src/app/actions/walkthrough-announcement*`, and
`src/file-size-ceiling.structure.test.ts` (a shared structural gate every row
touches, not an exclusive write). None of these paths are under
`src/app/components/recording/` or `src/app/components/message-replies/`.

```
sort a20_files.txt a18_files.txt | uniq -d   -> (empty)
sort a20_files.txt a8r_files.txt | uniq -d   -> src/app/components/recording/discussion-capture.ts
```
The one A8-R hit is unchanged from round 1 and remains a false positive on
inspection: A8-R's own scope cites `discussion-capture.ts` only as evidence
for an unrelated ruling about `grading-submission-merge.ts`; it is not in
A8-R's write set.

The concurrently in-flight, uncommitted work at this session's start
(`GradingResults.tsx`, `src/app/components/grading-results/*`,
`src/app/components/grading-recording/*`, per the session's own `git status`)
remains entirely outside `src/app/components/recording/*` and
`src/app/components/message-replies/*`. No overlap with this row's file set.

---

## 12. `owns` - derived, not asserted - revised (RULING B4)

**B4 correction.** Round 1's derivation command,
`grep -rn "saveVideo" src --include=*.ts --include=*.tsx | grep -v .test`,
excludes every test file BY CONSTRUCTION - `grep -v .test` cannot, under any
input, return a path containing `.test`. It is fine as the OUT-OF-SCOPE
derivation (Section 2, where excluding test files from a "who calls
`start({saveVideo: false})` in production code" question is correct), but it
was also relied on implicitly for `owns`, which must include every test
consumer of a file this row edits, not just the production callers.

**Re-derived with a command that CAN find test consumers**, run against each
file this row edits, requiring the filename to appear inside quotes (an
import specifier or an `fs.readFileSync`/`join` path argument), which
excludes comment-only mentions - spot-checked two: `captureLiveRegion.test.ts`
and `useDiscussionNotices.test.ts` both mention `DiscussionRepliesPanel.tsx`
/ `useDiscussionReplies.ts` only in prose comments, never in a quoted path or
import, and both are correctly excluded by this command after being wrongly
included by an earlier, looser, comment-matching attempt during this
session's own drafting:

```
for name in useDiscussionCapture discussion-capture discussion-persisted-controls DiscussionCaptureSettings useDiscussionReplies DiscussionRepliesPanel; do
  grep -lE "[\"'][^\"']*${name}(\.tsx?)?[\"']" src/app/components/recording/*.test.ts
done | sort -u | wc -l
```
returns **20** discussion-side test files. The message-side equivalent:
```
for name in useMessagePersistedControls MessageCaptureSettings useMessageReplies MessageRepliesPanel; do
  grep -lE "[\"'][^\"']*${name}(\.tsx?)?[\"']" src/app/components/message-replies/*.test.ts
done | sort -u | wc -l
```
returns **5**. These counts are this session's own measurement, run this
round; they are not an attempt to reproduce the round-1 check's illustrative
"16 and 7" (that check's own command was not available to re-run, and this
document does not fabricate a match to it - the point of B4's correction is
the derivation mechanism, not a specific target number). Both counts are
floors, not the full set, per `docs/loop/traps-spec.md`'s "the orchestrator's
enumeration is a FLOOR" rule: directory-wide scanners that read every file
without naming any single one (`recording-split.structure.test.ts`,
`message-replies.structure.test.ts`) are real consumers too and are already
handled separately (AC1-AC3), so they are correctly absent from a
per-filename derivation and should not be added to this count.

**None of the 20+5 goes red under this row's design as specified** - the
change adds a key and a call site, it does not rename or remove anything an
existing test asserts on - **except one, which needed a placement
constraint, not a code change, to stay that way:**

**`MessageCaptureSettings.wiring.test.ts` has two placement-sensitive
assertions** (confirmed by opening the file this round):
- `:81` - `const rowOpenIdx = stripped.lastIndexOf("<div", skipIdx);` - finds
  the NEAREST preceding `<div` before the "Skip answered threads" text, then
  asserts that div carries `styles.adaptRow`. **If the new auto-download
  checkbox's own wrapper `<div>` is inserted between the existing row's
  opening tag and the "Skip answered threads" text, this assertion would
  find the NEW div instead of the original row's, and fail** (or, worse,
  silently pass against the wrong element if the new div coincidentally also
  carries `adaptRow`).
- `:53-58` - `const block = stripped.slice(skipIdx, showIdx + 200);` then
  asserts `threadExpand`/`setThreadExpand` bindings appear in that slice.
  **If new markup is inserted between the "Skip answered threads" and "Show
  the whole thread" text, this fixed-width slice could stop covering the
  binding it needs**, depending on how much markup lands inside that span.
- **Placement constraint (B4's required addition): the new auto-download
  checkbox must be placed AFTER both existing checkboxes' shared row** - no
  new `<div>` between that row's own opening tag and "Skip answered threads,"
  and nothing inserted between "Skip answered threads" and "Show the whole
  thread." Placing it as a new row following the existing skip-answered/
  thread-expand row satisfies both constraints trivially and needs no test
  change at all.
- No equivalent risk exists on the discussion side: `find src/app/components/recording -iname "DiscussionCaptureSettings*test*"`
  returns nothing - there is no dedicated wiring test for that file's DOM
  structure to place around.

Files this row's implementation will edit or add (line counts unchanged from
round 1 - confirmed sound, not re-measured; additions marked NEW):

- `src/app/components/recording/useDiscussionCapture.ts` (538 lines)
- `src/app/components/recording/discussion-capture.ts` (807 lines)
- `src/app/components/recording/discussion-capture.test.ts` (new cases only - existing file)
- `src/app/components/recording/discussion-persisted-controls.ts` (208 lines)
- `src/app/components/recording/DiscussionCaptureSettings.tsx` (191 lines)
- `src/app/components/recording/useDiscussionReplies.ts` (898 lines - 102 lines of headroom)
- `src/app/components/recording/DiscussionRepliesPanel.tsx` (933 lines - only 67 lines of headroom, the tightest file this row touches)
- `src/app/components/recording/recording-split.structure.test.ts` (590 lines)
- **NEW** `src/app/components/recording/useDiscussionCapture.wiring.test.ts` (AC5's instrument - does not exist yet)
- `src/app/components/message-replies/useMessagePersistedControls.ts` (126 lines)
- `src/app/components/message-replies/MessageCaptureSettings.tsx` (254 lines)
- `src/app/components/message-replies/useMessageReplies.ts` (775 lines - 225 lines headroom)
- `src/app/components/message-replies/MessageRepliesPanel.tsx` (466 lines - 534 lines headroom)
- `src/app/components/message-replies/message-replies.structure.test.ts` (125 lines)
- **NEW to owns** `src/app/components/message-replies/useMessagePersistedControls.wiring.test.ts` (AC1's revised instrument)
- **NEW to owns** `src/app/components/message-replies/MessageCaptureSettings.wiring.test.ts` (at risk from the new checkbox's placement - see constraint above)
- **NEW to owns** `src/app/components/message-replies/MessageRepliesPanel.wiring.test.ts` (a general consumer per the re-derived command above; no specific assertion currently targets the `recordingUrl`/download block, but it is a slice-heavy source-text file and must be re-run in full after AC7's new conditional block is added)

Not in `owns`: any of the four out-of-scope files (Section 2),
`docs/a18-scope.md`, `docs/a19-scope.md`, `docs/a8r-scope.md`, or anything
under `GradingResults.tsx` / `grading-results/` / `grading-recording/`.

---

## 13. Batched, non-gating owner question (RULING Y5, and R2's re-disposal per m3)

Per `docs/loop/traps-orchestration.md`'s "ask - but do not wait" and
`iteration-caps.md`'s (b) Reduce disposal, both questions below are asked
together, batched, and neither gates this document or any build that starts
from it. The working assumption named for each is what this document
actually specifies, so a "no answer yet" outcome ships the thinner, safer
version rather than stalling.

1. **Leverage classification (RULING Y5, replaces round 1's defaulted
   answer).** This row's only advantage is click-cost (Section 1) - one
   click saved per capture, nothing more. The three legal calls are Redesign
   / Accept the cost explicitly / Reject. **Working assumption, already
   acted on in this document: Accept the cost explicitly.** If the owner
   instead wants Redesign (for example, persisting a record of which
   captures were auto-downloaded, which would move this into CORPUS), that
   is a materially different, larger row and should be scoped separately
   rather than folded into this one after the fact.
2. **The zero-byte auto-download (Section 5.5, m6).** Today, a 0-byte
   capture renders a manual link the instructor may or may not click. Once
   auto-download exists, the identical 0-byte case would silently write an
   empty file to Downloads with no visible difference from a successful
   save. **Working assumption, already acted on in this document: ship it
   matching the manual link's existing behavior** (no added byte-size
   check), because diverging the two paths' gates would itself be an
   inconsistency (the same class RULING Y2 corrects on extensions). If the
   owner wants auto-download to skip a 0-byte blob specifically, that is a
   one-line addition (`if (opts.autoDownload && blob.size > 0)`) and is
   cheap to add later without touching anything else in this design.

---

## 14. Handoff obligation to the push step (m4)

This document may edit only `docs/a20-scope.md` (this session's own scope
constraint). Per `DEV_LOOP.md`'s "Record disposals as they happen" and step
0's rule that a residual not in `docs/BACKLOG.md` does not exist, **the
obligation to append the following into `docs/backlog.yml` (which renders
into `docs/BACKLOG.md`) belongs to whichever step next has permission to
write that file - the orchestrator, at this row's disposal or push, per
`DEV_LOOP.md`'s standing rule that only one agent may hold `docs/BACKLOG.md`
at a time:**
- Residuals R1-R5 (Section 9), each with its owner, instrument and step as
  stated there.
- The Section 8 owner-verification item, with its owner (the owner) and step
  (after Build, before this row closes).
- The two batched owner questions (Section 13), recorded as owner-decision
  items until answered, then closed per whichever answer is given.

This document does not claim that obligation is discharged - only that it is
named, and to whom.

---

## 15. What I could not do, or think may still be wrong

- I did not write or run any implementation code, and no sabotage above was
  executed against real feature code, because none exists yet - AC1-AC3's
  sabotages are argued from the enforcing test's own mechanism (a
  fixed-length array or count compared against a source-derived set cannot
  silently absorb a new match); AC5's and AC6's sabotages are argued the same
  way, from a slicing idiom already proven correct on a different file
  (`repoGrades.wiring.test.ts`) rather than demonstrated on this row's own
  not-yet-written code.
- AC6's pure-function half is the one part of this whole feature I am
  confident is fully pinned by a real unit test with no rendering dependency
  - the panel-level half of AC6 and all of AC7 are source-text assertions
  over code that does not exist yet, so their exact shape may need to change
  once an implementer writes real markup, though the FACTS they pin (one
  shared extension computation; a second, narrower conditional distinct from
  the unconditional link) should not.
- AC4 and the browser-behavior half of AC5 and AC7 have no instrument in this
  repo at all, by construction, not by a gap in this document.
- The re-derived `owns` test-consumer counts (20 discussion-side, 5
  message-side, Section 12) are floors from one specific command, not proof
  that no other test anywhere references these files by some third means
  (e.g., a re-export chain). I checked two suspected false positives by
  hand and found the command correctly excluded both; I did not check every
  one of the 25 files individually for a more exotic false negative.
- I could not determine whether `saveVideo`'s existing persisted-control
  pattern already has a live hydration bug (Trap 4, Residual R3) - no
  component renders here, so this is not decidable by any measurement
  available to me.
- Section 5.4's relocation to Wave 3 means this document does not specify
  whether the new control is ultimately hidden or disabled - that is a
  genuine open design question this round intentionally does not resolve,
  rather than an oversight.
- I did not verify whether `docs/backlog.yml`/`docs/BACKLOG.md` currently
  contain any A20-adjacent residual already recorded by a different session
  since this row was filed - Section 14 hands that reconciliation to the
  push step rather than asserting a current state of a file I did not read
  this round (and am not scoped to edit).
