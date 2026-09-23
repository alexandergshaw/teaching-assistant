# A32 scope: walkthrough-announcement scheduling

Row: `docs/backlog.yml`, `- id: 'A32'` (measured `grep -n "id: 'A32'" -A 40 docs/backlog.yml`, line 506). State at
scoping time: `unscoped`, `owns: []`, `verify: null`. No prior `docs/a32-*.md` exists (`find docs -iname "*a32*"`
returns only this file after it is written), so there is nothing to restructure and no disposition table is owed -
this is a first pass, not a revision.

Everything below was opened this pass, 2026-09-23, from the repo root. Every quantity names the command that
produced it.

---

## 1. The exact gap, re-measured (do not inherit the row's number unchecked)

**The library, opened directly:** `src/lib/canvas/announcements.ts:420-427`

```
export async function createAnnouncementFromMarkdown(
  courseUrl: string,
  title: string,
  markdownBody: string,
  code?: string,
  delayedPostAt?: string | null,
  image?: AnnouncementBodyImage
): Promise<CanvasAnnouncement>
```

Six parameters, no defaults (two are optional/nullable, not defaulted). `delayedPostAt` is consumed at
`:436-442`: if truthy, it is re-parsed with `new Date(...)`, a `NaN` result throws `"Could not read the scheduled
visibility time."`, and a valid date is sent to Canvas as `delayed_post_at` via `.toISOString()`. `image` is
consumed at `:434` through `buildAnnouncementBodyHtmlFromMarkdown(markdownBody, image)` (`:405-409`), which appends
an `<img>` tag when `image` is supplied.

**The call, opened directly:** `src/app/actions/walkthrough-announcement.ts:603`

```
const announcement = await createAnnouncementFromMarkdown(courseUrl, title, markdownBody, acronym);
```

Four positional arguments: `courseUrl, title, markdownBody, acronym` (the fourth maps to the library's `code`
parameter). `delayedPostAt` and `image` are both omitted, so they take their default (`undefined`) inside the
callee.

**Verdict: the row's claim is correct as re-measured.** Four of six parameters are passed; `delayedPostAt` and
`image` are the two dropped, and both do exactly what the row says: `delayedPostAt` is the only path to
`delayed_post_at`, and `image` is the only path to the appended `<img>` tag. I did not inherit this from the row -
I opened both signatures myself and counted.

---

## 2. Census of every caller, with the sibling that already schedules

Command: `grep -rn "createAnnouncementFromMarkdown" src --include=*.ts --include=*.tsx | grep -v "\.test\."`

```
src/app/actions/prompt-announcement-post.ts:10   (comment)
src/app/actions/prompt-announcement-post.ts:15   import
src/app/actions/prompt-announcement-post.ts:27   call site
src/app/actions/walkthrough-announcement.ts:56   import
src/app/actions/walkthrough-announcement.ts:590  (comment)
src/app/actions/walkthrough-announcement.ts:603  call site
src/lib/canvas/announcements.ts:420              declaration
src/lib/canvas.ts:76                             barrel re-export
```

**Two production call sites, exactly as the row's instrument states.** Absence canary, run before trusting the
above as complete: `grep -rn "createAnnouncementFromMarkdownXYZNOPE" src --include=*.ts --include=*.tsx` exits 1
with no output, proving the pattern above is not silently matching zero lines. Neither grep was piped through
`head`.

**The sibling that already schedules:** `src/app/actions/prompt-announcement-post.ts:18-32`

```
export async function postPromptAnnouncementAction(
  courseUrl: string,
  title: string,
  markdownBody: string,
  acronym?: string,
  delayedPostAt?: string
): Promise<{ announcement: CanvasAnnouncement } | { error: string }> {
  try {
    await requireUser();
    const announcement = await createAnnouncementFromMarkdown(courseUrl, title, markdownBody, acronym, delayedPostAt);
    return { announcement };
  ...
```

Five of six arguments - only `image` is dropped here. The file's own header comment (`:10-12`) already names this
exact contrast: *"Reuses `createAnnouncementFromMarkdown` unchanged, including its `delayedPostAt` fifth parameter -
unlike `postWalkthroughAnnouncementAction` ..., which drops it."* This action's sole caller is
`src/app/components/canvas-tab/announcements-panel.tsx:259` (`grep -n "postPromptAnnouncementAction("
src/app/components/canvas-tab/announcements-panel.tsx`).

**The sibling's own UI is the precedent to copy**, `src/app/components/canvas-tab/announcements-panel.tsx:462-489`:
a single MUI `TextField` with `type="datetime-local"`, `slotProps.htmlInput.min` pinned to `toDatetimeLocalValue(new
Date())` (blocks picking a past time in the browser's own date-picker widget), a hint line, and a "Clear" button
that appears only when a value is set. The state (`visibleAt`, declared `:82`) is validated and converted to
`delayedPostAt` in `handlePost` (`:234-292`, the conversion at `:237-251`):

```
let delayedPostAt: string | undefined;
let scheduledLabel = "";
if (visibleAt) {
  const when = new Date(visibleAt);
  if (Number.isNaN(when.getTime())) {
    setPostNote({ kind: "error", text: "Enter a valid date and time for when students can see this." });
    return;
  }
  if (when.getTime() > Date.now()) {
    delayedPostAt = when.toISOString();
    scheduledLabel = when.toLocaleString();
  }
}
```

A past or present `visibleAt` is **not an error** - it silently falls through to an immediate post
(`delayedPostAt` stays `undefined`). Only a malformed string is refused, client-side, before the server action is
even called. The button label and success copy branch on `willSchedule = visibleAt.trim().length > 0` (`:296`,
button text `:507-513`, success text `:280-282`).

**A second, unrelated "scheduling" surface exists and must not be confused with this one.**
`src/app/components/canvas-tab/utils.ts:26-36` defines `SCHEDULING_TIME_ZONES`, and its only consumer
(`grep -rn "SCHEDULING_TIME_ZONES" src --include=*.ts --include=*.tsx`) is
`src/app/components/canvas-tab/inbox-panel.tsx:610-625`, inside a "Schedule a call with a student" calendar-booking
modal (`ModalShell label=... "Schedule a call"`, `:580`). That is a meeting-booking timezone override, unrelated to
`delayed_post_at` announcement visibility. I opened it because the name collision is real and a future reader
searching "scheduling" in this directory will hit it; it is not a precedent for A32 and contributes nothing to the
design below.

---

## 3. What the surface would need

**Reachability check, done before proposing anything:** `WalkthroughAnnouncementPanel.tsx` (985 lines, below) is
the file that imports and calls `postWalkthroughAnnouncementAction`
(`src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx:65,647`). But the actual per-draft
Post button, its confirm/arm state, and its user-facing copy do **not** render in that file - they render in
`AnnouncementDraftSlot.tsx`, a separate component the panel maps its `slots` array into
(`WalkthroughAnnouncementPanel.tsx:899-912`). The panel supplies a `postDraft` callback
(`WalkthroughAnnouncementPanel.tsx:644-657`) with a fixed two-argument shape, `(title, message) => Promise<{course}
| {error}>`, whose type is declared in `useAnnouncementDraftSlots.ts:148-151` and invoked at that file's `:332`.
This three-file split is the reason "which component renders the draft controls" does not have a one-file answer,
and it is why the write set in section 8 below is four files deep on the UI side alone.

**A correctness requirement the row does not mention, found by opening the render path:**
`AnnouncementDraftSlot.tsx:221-229` hardcodes the confirm-arm consequence text:

```
Posting publishes this announcement to every student in {courseName ?? "the course"} immediately -
Canvas has no unpublished state for an announcement - and this app cannot recall or delete it afterward.
```

and the button labels at `:238-244` are `idleLabel="Post to Canvas"` / `loadingLabel="Posting…"` with no scheduled
variant. If A32 ships scheduling without touching this component, the app will tell an instructor their post is
immediate and irrevocable at the exact moment it is neither - a false statement the feature itself would
introduce, not one it inherits. This must be in scope, not deferred: the copy needs a scheduled branch (mirroring
`willSchedule` / `scheduledLabel` in the sibling, `announcements-panel.tsx:296,507-513`), which means
`AnnouncementDraftSlot.tsx` needs a new prop (a `scheduledLabel: string | null` or similar) threaded from wherever
the schedule value ends up living (see the design fork below).

**The design fork the architect must resolve - not decided here, but priced here:**

The walkthrough panel drafts and posts **multiple independent slots** (`slots.map`, `WalkthroughAnnouncementPanel.
tsx:899`), unlike the sibling's single-draft form. Whether the scheduled time is one panel-level field applied to
whichever slot is posted next, or a per-slot field, is a real shape decision with different costs:

| Branch | Where state lives | Est. lines added to `WalkthroughAnnouncementPanel.tsx` (985/1000) | Est. lines added elsewhere | Persistence question |
|---|---|---|---|---|
| A. Global field, unpersisted (mirrors sibling exactly) | New `useState` in the panel | ~45-55 (1 state line + ~26-line JSX block copying `announcements-panel.tsx:462-489` + ~10-15 lines of validation/conversion inside `postDraft` + a few lines threading a label prop into the `slots.map` call) | `AnnouncementDraftSlot.tsx` +10-15 (new prop, conditional copy/labels); `useAnnouncementDraftSlots.ts` +0 (postDraft's exposed 2-arg shape is unchanged - the panel's closure captures the new state) | Sibling precedent is to NOT persist (`visibleAt` has no `STORAGE_KEY_*`, confirmed by absence below) |
| B. Global field, persisted under a new `ta-` key | Same as A plus a `STORAGE_KEY_VISIBLE` const + init + effect | A's total **+11** (mirrors the `STORAGE_KEY_MODULE` pattern, `WalkthroughAnnouncementPanel.tsx:182-192`, 11 lines) | Same as A, plus the structure-test canary bump in section 6 | Diverges from the sibling; needs an explicit reason if chosen |
| C. Per-slot field | New reducer action + slot field in `useAnnouncementDraftSlots.ts`; control renders inside `AnnouncementDraftSlot.tsx` itself | ~5-10 (thin wiring only - no JSX block added to the panel itself) | `useAnnouncementDraftSlots.ts` +20-30 (new action type + reducer case, mirroring the existing `edit` action at `:240`); `AnnouncementDraftSlot.tsx` +35-40 (its own JSX control plus the conditional copy) | Sidesteps the persistence question entirely - a per-slot value on a dynamically added/removed slot has no natural singleton key |

**Absence check backing the "sibling does not persist" claim:** `grep -n "visibleAt" src/app/components/canvas-tab/
announcements-panel.tsx` returns five lines (`:82,241,242,296,469,480` - state declaration, two reads inside
`handlePost`, the `willSchedule` derivation, and the two JSX usages), none of them `localStorage`. Canary:
`grep -n "visibleAtXYZNOPE" src/app/components/canvas-tab/announcements-panel.tsx` exits 1.

**The line-count consequence, measured with both instruments this repo disagrees on:**

```
PowerShell: $f="src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx"
  @(Get-Content $f).Count                       -> 985   (the mandated instrument)
  (Get-Content $f | Measure-Object -Line).Lines  -> 918   (67 lower - NOT the 42 this-repo.md cites for a
                                                            different file; do not inherit that figure)
Bash:  wc -l "<same path>"                       -> 985   (agrees with the mandated instrument)
```

`src/file-size-ceiling.structure.test.ts` sets `LIMIT = 1000` at `:41` and this path is not present in its
`ALLOWED_OVERAGE` ratchet map (`grep -n "WalkthroughAnnouncementPanel" src/file-size-ceiling.structure.test.ts`
returns nothing - the plain 1000-line limit applies, not a grandfathered one). Nor is it covered by the
recording-directory check (`COVERED_BY_RECORDING_SPLIT_CHECK`, same file `:51-54`, lists only `RecordingTab.tsx`
and `TabShell.tsx`). **At 985/1000 by the mandated instrument, only 15 lines of headroom exist.** Branch A/B both
exceed the ceiling (985+50=1035, 985+61=1046); Branch C's own thin-wiring estimate (985+5 to 985+10 = 990-995)
leaves 5-10 lines of margin, which is not enough for anything else this file will need in the same wave (updating
`postDraft`'s call to include the new argument, for instance) and is fragile on its own terms - this file's header
comment (`:6-15`) already records it as having spent its "one available JSX extraction" once before, and
`docs/loop/this-repo.md` records a sibling panel (`SnapshotGradingPanel.tsx`) failing lint on an untouched callback
purely from React Compiler reacting to a changed hook shape after an extraction.

**Conclusion for this section: an extraction from `WalkthroughAnnouncementPanel.tsx` is required in this chunk
regardless of which branch the architect picks**, because even the cheapest branch leaves single-digit headroom on
a file that has already needed rescuing once. This is a Wave 1 (architect) decision, not something to invent here.

---

## 4. The image parameter's disposition: DEFERRED, not covered by A32

**A32 should scope `delayedPostAt` only and explicitly defer `image`.** Reasoning, measured rather than assumed:

- `AnnouncementBodyImage` (`announcements.ts:283-286`) is the type both `createAnnouncementFromMarkdown` and
  `createAnnouncement` (the plain-text sibling, `:329-336`) accept as their `image` parameter.
- Via `createAnnouncementFromMarkdown` specifically (the function this row is about), it is **never constructed by
  any caller** - both production call sites (`prompt-announcement-post.ts:27`, `walkthrough-announcement.ts:603`)
  omit it, confirmed in section 2.
- It is **not dead app-wide**, though: `createAnnouncement` (the plain-text, non-markdown sibling) reaches a real,
  live image-attach path through a different feature entirely. `src/app/actions/canvas-inbox.ts:284-307`
  (`createAnnouncementAction`) uploads and resolves an image via `resolveAnnouncementImage`
  (`src/lib/canvas/announcement-image-upload.ts:138`) when one is supplied, and
  `src/app/components/recording/useTakeAnnouncement.ts:745-769` is the one caller that actually builds and passes
  one (a captured photo/whiteboard image, `altText` from `buildAnnouncementImageAltText`,
  `src/lib/take-announcement.ts:316`). So the upload/resolve mechanism already exists in this repo and is proven
  working for the "Take announcement" surface - it is just never wired to the **markdown** posting path either
  surface (walkthrough or prompt-driven) uses.
- Building image support into `createAnnouncementFromMarkdown`'s callers is a second, separable capability (an
  image-attach control on a markdown draft) with its own UX questions (where does the image come from on the
  walkthrough surface - a captured frame? an upload? neither exists there today) that the row's own title does not
  ask for ("cannot SCHEDULE an announcement" - no mention of images in the title, only in the instrument's
  parenthetical). Folding it into A32 would double the surface this chunk touches for a capability nobody has
  asked for on this surface.

**Residual, recorded here in substance (not a pointer) per `iteration-caps.md`'s definition (owner, instrument,
step):**

- **Object:** `image` parameter of `createAnnouncementFromMarkdown` (`announcements.ts:426`), unreached from both
  its production callers.
- **Owner:** the repo owner - whether the walkthrough or prompt-driven markdown surfaces should ever attach an
  image is a product decision, not one this scoping pass can make (no UI, no capture path, and no request for it
  exists on either surface today).
- **Instrument:** `grep -rn "createAnnouncementFromMarkdown(" src --include=*.ts --include=*.tsx | grep -v
  "\.test\."` and confirm the 5th positional argument is still absent from every call site (today: both sites
  pass 4-5 args, never 6). Canary: the same grep with a nonsense function name exits 1, proving the pattern
  actually matches when present.
- **Direction of failure:** stays RED (meaning: still a live gap, not yet decided) for as long as no backlog row
  or scope document exists that carries an owner and a step for it. It is a deletion, per `iteration-caps.md`'s
  definition, the moment it stops appearing in `docs/BACKLOG.md`.
- **Step:** the owner's next pass over the walkthrough/prompt-announcement surfaces (the same "next pass" the row's
  own note already names for A17/A18/A19/A32), or a fresh backlog row filed if/when an image-capture UI is wanted
  on a markdown-posting surface. Not blocking A32's own scheduling work.

---

## 5. Timezone and validation

**What Canvas expects, per the code (not verified against a live Canvas instance - see the limits section):**
`delayed_post_at` as an ISO 8601 UTC string. Confirmed at `announcements.ts:441`
(`params.append("delayed_post_at", when.toISOString())`) and identically in the plain-text sibling at `:351`. Both
functions build this from whatever string `delayedPostAt` arrives as, via `new Date(delayedPostAt.trim())`.

**What the browser supplies:** a `datetime-local` input's value is a **local wall-clock string with no timezone
offset** (`"YYYY-MM-DDTHH:mm"`, per `src/app/components/canvas-tab/utils.ts:19-22`'s own
`toDatetimeLocalValue` comment, "the local wall-clock value a datetime-local input expects"). `new Date(...)` on
that string is interpreted by the JS engine in the **browser's own local timezone**. This is where the conversion
to UTC happens today, client-side, in the sibling's `handlePost` (`announcements-panel.tsx:242,248`,
`when.toISOString()`), before the value ever reaches the server action. `createAnnouncementFromMarkdown` /
`createAnnouncement` re-parse whatever string arrives and re-stringify it - a defensive second pass, not the
primary conversion.

**Consequence for A32:** the conversion must happen the same way - a `datetime-local` value read with `new
Date(value)` and sent as `.toISOString()` - or a scheduled time will be silently wrong by the instructor's UTC
offset. There is **no timezone-override control** on this path anywhere in the codebase (the only "timezone
override" that exists, `SCHEDULING_TIME_ZONES`, belongs to the unrelated call-booking feature in section 2 above).
The implicit assumption, inherited unchanged from the sibling, is that the instructor's browser timezone is the
timezone they mean - which is unverifiable here (no live browser session against a real Canvas course) and is
flagged as a residual below rather than asserted as correct.

**Validation, as the library actually enforces it (not as I would design it):**
- A malformed/unparseable string throws `"Could not read the scheduled visibility time."`
  (`announcements.ts:438-440`). This propagates through `postWalkthroughAnnouncementAction`'s existing
  `catch` (`walkthrough-announcement.ts:605-607`, `{ error: err.message }`), which
  `WalkthroughAnnouncementPanel.tsx`'s `postDraft` already turns into an instructor-facing string:
  `` `Canvas refused the announcement - ${result.error}. Nothing was posted.` `` (`:650`). So a malformed date
  would surface to the instructor, verbatim, as: **"Canvas refused the announcement - Could not read the scheduled
  visibility time. Nothing was posted."** No new error copy is needed for this case; the existing wrapper already
  produces a sane sentence.
- A **past-dated** time is **not rejected** by the library - it is only rejected client-side, and only by the
  sibling's own `handlePost`, which silently treats it as "post now" rather than surfacing an error
  (`announcements-panel.tsx:247-250`, the `when.getTime() > Date.now()` guard). If A32 does not replicate this
  client-side guard, a past-dated string would reach Canvas raw, and what Canvas does with a past
  `delayed_post_at` is **not verifiable in this environment** (no live Canvas, no API key - `docs/loop/
  this-repo.md` section 6). The honest, checkable requirement is: **replicate the sibling's client-side guard
  exactly** (treat non-future as immediate, refuse only on `NaN`), so the walkthrough surface's behavior for a
  past-dated pick is identical to the surface that already ships this, rather than an unverified new behavior.
- The browser's own `min` attribute on the `datetime-local` input (`slotProps.htmlInput.min`,
  `announcements-panel.tsx:472-474`) additionally prevents *picking* a past time through the native picker widget,
  though a typed/pasted value can still bypass it - which is exactly why the client-side re-check at submit time
  is load-bearing, not decorative.

---

## 6. Persistence

**The repo-wide rule, as stated in the task and as this directory already implements it:** every new
textbox/select/checkbox persists across reloads under a `ta-` prefixed localStorage key.

**This directory's exact-set canary, opened directly:**
`src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts:103-128` scans every
non-test file in the directory for the pattern `` /(?<![a-zA-Z])ta-[a-z-]*[a-z]/g `` and asserts:

```
it("finds exactly five distinct ta- keys across every non-test file in this directory today
    (ta-rec-wta-course, ta-rec-wta-module, ta-rec-wta-notes, ta-rec-wta-emoji, ta-rec-wta-resources)", () => {
  expect(distinctKeys.size).toBe(5);
});
```

(`:117-122`). This is an **exact-set assertion, not a floor** - adding any new `ta-` literal anywhere in this
directory's non-test files (including inside a comment, since the regex has no comment-awareness) turns this test
red until the count and the enumerated key list in the `it()` description are both bumped in the same commit,
exactly as the file's own `:118-121` comment records happening once already (bumped from 3 to 5 when the
emoji/resource toggles landed).

**Whether this canary needs bumping for A32 depends entirely on the design-fork answer in section 3:**

- **Branch A (global, unpersisted)** - matches the sibling's own precedent of *not* persisting a scheduled-visibility
  field (section 3's absence check). No new `ta-` key, no canary bump. This is a deliberate divergence from the
  blanket "every new control persists" rule, and if chosen it needs its own one-line justification in the
  criteria document (the precedent above, plus the reasoning that a stale future timestamp surviving a reload
  could silently schedule against a now-wrong date) rather than being silently exempted.
- **Branch B (global, persisted)** - needs a new `STORAGE_KEY_VISIBLE = "ta-rec-wta-visible"` (or similar, matching
  the directory's own `ta-rec-wta-*` segment convention, `WalkthroughAnnouncementPanel.tsx:97-102`'s comment) and
  the canary at `:117-122` bumped from 5 to 6 **in the same commit**, plus the six keys re-enumerated in the test's
  own description string.
- **Branch C (per-slot)** - has no natural singleton key (slots are added/removed dynamically,
  `useAnnouncementDraftSlots.ts`'s `add`/`remove` actions), so it sidesteps the question rather than answering it;
  whether that is acceptable is itself a question for whoever resolves the design fork.

**This is a residual only in the sense that the AC/architect wave must pick one before an implementer can act -
it is not something this scoping pass can settle**, because the canonical precedent in this very directory
(the sibling in `announcements-panel.tsx`) and the repo's general persistence rule disagree with each other, and
resolving that disagreement is a design decision, not a measurement.

---

## 7. The leverage question, answered honestly

**The mechanism, named concretely rather than asserted:** Canvas's own server holds `delayed_post_at` and reveals
the announcement to students at that instant with nobody - not this app, not the instructor - present or running
anything at the moment it happens. A chat window cannot do this at all: it has no path to Canvas's API, scheduled
or otherwise, so the closest a chat gets is producing the announcement text and telling the instructor to paste it
into Canvas at 8am Monday themselves, which requires the instructor (or some other automation) to be present at
that exact moment. This is a real instance of the INTEGRATION class in `docs/loop/leverage.md` (external system
acts on the app's behalf with no human relaying it at execution time) - though the trigger direction is reversed
from that card's own worked example (a GitHub webhook firing *into* this app; here, this app fires *into* Canvas
once, and Canvas executes unattended afterward). Worth flagging to the AC seat as a shape this card's taxonomy
does not describe exactly, even though the "a chat cannot do this" argument holds.

**Earned or inherited - the honest answer is inherited, and the count says so precisely.** Applying
`leverage.md`'s own failure-mode-B test (count how many comparable modules already carry the mechanism unearned):
of the app's three Canvas-announcement-posting surfaces, **two already have Canvas-side scheduling today** -
`createAnnouncementAction` / `announcements-panel.tsx` (`canvas-inbox.ts:297,302`, `delayedPostAt` threaded) and
`postPromptAnnouncementAction` (`prompt-announcement-post.ts:27`, confirmed in section 2). Only the walkthrough
surface (`postWalkthroughAnnouncementAction`) lacks it, and it lacks it purely because of the four-of-six arity
gap this row exists to close - not because the underlying capability had to be invented. The library function
(`createAnnouncementFromMarkdown`) already implements the scheduling logic in full; A32 adds zero new scheduling
mechanism to this codebase. This is the same shape `docs/loop/leverage.md`'s struck classes describe: a mechanism
already free to every comparable surface describes the platform, not the feature that merely reaches it.

**Concretely, then: A32 is reachability work, not a new leverage claim.** Per `docs/DEV_LOOP.md`'s Criteria step
("the requested feature is sometimes already built and merely unreachable - if so, say that") and this repo's own
recorded rule ("verify reachability, not just correctness"), the honest framing is that the INTEGRATION-class
advantage above was already earned once, by whichever change first added `delayed_post_at` support to
`createAnnouncement`/`createAnnouncementFromMarkdown` and wired it into the other two surfaces - not by this row.
The backlog row's own note calls this "a feature question, not a regression" because the walkthrough surface gets
a *new user-facing control* it never had, which is true and is why Acceptance criteria should still run (per
`seats.md`'s trigger table: "any change a user can see, click" fires User experience; a brand-new control is not a
pure bug fix). But the criteria document should state plainly - mirroring the `AskAiModal.tsx` negative example in
`leverage.md` - that the advantage is real, already earned by the platform, and not newly invented by this chunk,
so a later reader does not credit A32's diff with inventing Canvas-side scheduling it merely extends to a third
surface.

---

## 8. Wave plan and write sets

**Every wave below includes the file that calls whatever it adds**, per the repo's own recurring failure mode
(a wave shipping an export with no caller reads green and does nothing).

**Wave 0 - design (must land before Wave 1's file list is finalized):**
- **Seat:** Architect + reuse (Wave 1 per `seats.md`'s default, but sequenced first here because everything below
  depends on it). Resolves the Branch A/B/C fork in section 3 and the persistence question in section 6 together -
  they are the same decision, not two.
- **Also needed:** a concrete extraction plan for `WalkthroughAnnouncementPanel.tsx` (985/1000, section 3), sized
  against this feature's own addition, not against the 1000-line wall in isolation - this repo has already shipped
  one extraction that technically fit under the wall and still left the file "at the ceiling" for the next feature
  (recorded lesson, not re-derived here).
- **Files read, none written:** all files cited in sections 1-6.

**Wave 1 - action layer (server-side threading, no UI):**
- **Write set:** `src/app/actions/walkthrough-announcement.ts` (add `delayedPostAt` as a 5th parameter to
  `postWalkthroughAnnouncementAction`, `:595-608`, forwarded to `createAnnouncementFromMarkdown`),
  `src/app/actions/walkthrough-announcement.test.ts` (the exact-arity assertion at `:566-571` will fail the
  moment a 5th argument is added to the call - `toHaveBeenCalledWith` checks the full argument list - so it must
  be updated in this wave, plus new tests: delayedPostAt forwarded verbatim, and the NaN-date error path already
  proven by the library is not swallowed or reworded by the action).
- **No change needed to `src/lib/canvas/announcements.ts`** - `createAnnouncementFromMarkdown` already supports
  `delayedPostAt` end to end; this wave only reaches the parameter that already exists.
- **Caller included:** N/A for this wave in isolation (the UI caller is Wave 2, and Wave 1 is not independently
  shippable without it - a 5th parameter with no caller supplying it is inert, which is exactly the
  "wave must include the caller" rule; recording it here as a known exception because a mid-file parameter
  addition cannot itself be the whole chunk).

**Wave 2 - UI, gated on Wave 0's design decision:**
- **Write set (Branch A/B, global field):** `src/app/components/walkthrough-announcement/
  WalkthroughAnnouncementPanel.tsx` (new state and/or persistence per Wave 0's decision; the JSX control; the
  `postDraft` callback updated to compute and forward `delayedPostAt`, `:644-657`; a label/prop threaded into the
  `slots.map` call, `:899-912`), `src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` (new prop;
  conditional consequence copy at `:221-229`; conditional button labels at `:238-244`), and - only if Branch B is
  chosen - `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` (bump the
  ta-key canary from 5 to 6, `:117-122`, and re-enumerate the keys in the `it()` description).
- **Write set (Branch C, per-slot):** `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts`
  (new reducer action mirroring `edit` at `:240`, new slot field, `postDraft`'s type at `:148-151` and call at
  `:332` updated to a 3rd argument), `src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` (the
  control itself, plus the same conditional copy as above), and a thin update to
  `WalkthroughAnnouncementPanel.tsx`'s `postDraft` wiring (`:644-657`).
- **Caller included either way:** `WalkthroughAnnouncementPanel.tsx` is in every branch's write set, and it is the
  file that already calls `postWalkthroughAnnouncementAction` (`:647`) - so this wave cannot ship the action change
  from Wave 1 as dead code.

**Wave 3 - regression and the removal-test question:**
- **Baseline** (`seats.md`'s Baseline seat trigger: "area has no coverage in `docs/REGRESSION.md`") - check with
  `grep -a` before writing a new entry; not done in this pass, left for the seat that owns it.
- **Test seat** owes a removal test for the leverage claim in section 7 if AC decides one is owed at all (section
  7's own conclusion is that the advantage is inherited, not earned, which per `leverage.md`'s disposal rules is a
  legitimate "no claim, or a reduced claim" outcome, not a gap to force a test around).
- No component renders under vitest here (`vitest.config.ts` `include: ["src/**/*.test.ts"]`, node environment) -
  every UI/copy claim above (the confirm-arm text, the button labels, the field layout) is a **reading claim**, not
  a tested one, and must be confirmed by the owner in a real browser before being trusted as shipped correctly.

---

## Residual register

1. **Image parameter of `createAnnouncementFromMarkdown`.** Owner: repo owner (product decision on whether markdown
   surfaces need image attach). Instrument: `grep -rn "createAnnouncementFromMarkdown(" src --include=*.ts
   --include=*.tsx | grep -v "\.test\."`, confirmed today at 4-5 positional args, never 6. Object: the unused 6th
   parameter and its dead-from-this-path `AnnouncementBodyImage` argument. Direction of failure: treat as a
   deletion the moment it stops appearing in `docs/BACKLOG.md` with an owner and a step. Step: the owner's next
   pass over the walkthrough/prompt-announcement surfaces, or a fresh row if an image-capture UI is designed for a
   markdown-posting surface. Full reasoning in section 4.

2. **Instructor-browser-timezone assumption.** Owner: repo owner, requires a real browser against a real Canvas
   course (unverifiable here - no live Canvas, no API key, `docs/loop/this-repo.md` section 6). Instrument: post a
   scheduled walkthrough announcement in a real session and confirm Canvas reveals it at the wall-clock time the
   instructor actually picked, in the instructor's own timezone, not the course's or the server's. Object: the
   actual Canvas-side reveal instant versus the instructor's intended local time. Direction of failure: FAIL if
   the revealed time differs from what was picked in the browser by anything other than rounding to the minute.
   Step: the owner's manual verification pass after this ships, the same pass every browser-dependent claim in
   this repo already routes to.

3. **Design-fork decision (section 3) and the persistence decision (section 6).** Not a residual in the strict
   sense (it is not "knowingly not proven" so much as "not yet decided"), recorded here so it is not lost between
   this document and Wave 0: owner of the decision is the Architect + reuse seat in Wave 0, instrument is the cost
   table in section 3 plus the precedent/rule conflict in section 6, and the step is Wave 0 itself, before any
   Wave 1/2 file list is finalized.

---

## What this pass could not determine

- Whether Canvas actually honors `delayed_post_at` the way the existing sibling's own comments assume (no live
  Canvas access in this environment).
- Real click counts or keyboard/focus behavior for any of the three UI branches - no component renders under
  vitest here, so these are reading claims only, owed to the User experience and Accessibility seats in Wave 2,
  and ultimately to the owner's own browser check.
- Which of Branch A/B/C the architect will pick, and therefore the exact final line count for
  `WalkthroughAnnouncementPanel.tsx` - only the cost table (section 3) and the conclusion that an extraction is
  needed regardless of branch are established here.

---

## Verification run for this document's own write set

Command: `npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`

Per-argument coverage lines and exit code recorded from a file, not a pipe, immediately below this document's
creation (see the accompanying report for the exact output and exit code). This document's own write set is
exactly one file: `docs/a32-scope.md` - confirmed by `git status --short` in the accompanying report.
