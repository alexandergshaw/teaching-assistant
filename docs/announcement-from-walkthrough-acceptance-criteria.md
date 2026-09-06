# Announcement (and video script) from a recorded LMS walkthrough

**The request, verbatim:** "copy and paste a previous announcement into the
app, then screen record a series of pages on an LMS within the teaching app,
and then have the app spit out an announcement that covers those pages in the
same format as the prev announcement and/or a script for a video."

---

## FINDING FIRST: most of this is already built, and the work is three seams

Surveyed before writing any criterion, per the loop's reuse-survey step. Each
row was verified by reading the file, not by its name.

| Need | Already exists | Where |
| --- | --- | --- |
| Screen-record a series of LMS pages, inside this app | **Yes, shipped** | `src/app/components/module-deck-capture/ModuleDeckCapturePanel.tsx` - "Manual > Recording > Module walkthrough". It captures the screen and **extracts page content from frames DURING capture** via a serial drain loop, rather than after. |
| The capture plumbing itself | **Yes** | `recording/screen-source.ts`, `useRecorder.ts`, `useDiscussionCapture.ts` - one shared capture wiring, already used by the grading panel and the deck panel. |
| Draft an announcement from module content | **Yes, shipped** | `draftModuleAnnouncementsAction` and `draftPackageAnnouncementsAction` in `src/app/actions/weekly-announcement-drafting.ts`. |
| Write in the instructor's own voice | **Yes, shipped** | `src/lib/user-style.ts`, `src/app/actions/writing-style-block.ts`, and the writing sample captured on `/account/voice-style`. |
| Post the result to the LMS | **Yes** | `src/lib/canvas/announcements.ts`, plus scheduling. |

**So this is roughly 70 percent composition of shipped parts.** The three
things that genuinely do not exist:

**GAP 1 - a pasted announcement is a FORMAT exemplar, and this app has no such
concept.** `user-style.ts` captures *tone* from a stored writing sample, and it
is global to the instructor. "The same format as the previous announcement" is
a different thing: section order, which headings appear, whether it opens with
a greeting, whether due dates are a bulleted list or a sentence, how it signs
off, roughly how long it runs. Tone is a property of the writer; format is a
property of the artifact. Matching one does not give you the other, and today
there is nowhere to put a per-draft structural template.

**GAP 2 - nothing carries captured-walkthrough content into the drafter.** The
drafter takes a `courseUrl` plus week numbers and fetches module content
through the Canvas API, or takes an uploaded package. Neither input is "what
the screen recording just read off these pages". The deck panel's extraction
output goes to a deck download. The two halves of the user's request have
never been connected.

**GAP 3 - there is no video-script output.** The drafter emits an announcement
shape. A script is a different artifact with different constraints (spoken
register, an ordering that follows the walkthrough rather than the syllabus,
no clickable links read aloud as URLs).

---

## Scope decision

Build the three seams. Do NOT rebuild capture, drafting, style or posting.

A criterion below that would be satisfied by an existing module names that
module. If an implementer finds themselves writing a second screen-capture
path, a second style block, or a second announcement poster, they have
misread this document.

---

## AC1. The exemplar is pasted, stored per course, and reusable

An instructor pastes a previous announcement into a text area. It is saved and
offered again next time rather than re-pasted every week - the standing rule
that every new textbox persists applies, under a `ta-`-prefixed key, added to
the persistence canary's expected set in the same change.

- Plain text or pasted rich text; if rich, it is reduced to text plus a
  structural outline (see AC2), never stored as raw HTML.
- More than one exemplar may be stored per course; the most recent is the
  default. An instructor whose announcements alternate between two shapes
  (a weekly one and a module one) is a real case.
- The exemplar is **never posted anywhere**. It is an input.

## AC2. What "the same format" actually means, stated concretely

The model is not asked to "match the format" as a vibe. A pure module derives
a **structural outline** from the exemplar and that outline is what the prompt
carries:

- Ordered section list, with each section's heading text and whether it is a
  heading or an implicit paragraph break.
- Per section: prose or list, and if a list, ordered or unordered.
- Presence and position of: a greeting, a sign-off, a due-date block, a "what
  to do this week" block, links.
- Approximate length per section, in sentences, as a range rather than a
  count.

This lives in its own module with its own tests, because a rule that lives
inside a prompt string is a rule nothing can test.

**The outline is descriptive, not prescriptive about content.** It says "there
is a bulleted due-date block near the end", never "the due dates are these".

## AC3. Context goes in BEFORE the capture

The repo's standing rule, and it applies squarely here: any surface where the
instructor records something in order to generate something must offer a place
to enter context **before anything is generated**, reachable **before the
record button**, optional, persisted, and actually threaded into the prompt.

For this surface that means the exemplar box and a free-text notes box are
both present and fillable before the first frame is captured. The obligation
belongs to this destination, not to whatever launched it.

## AC4. The walkthrough drives the ordering

The generated announcement covers the pages **in the order they were walked**,
not in module order and not in syllabus order. That ordering is the one piece
of information the recording carries that an API fetch does not, and it is the
reason to record rather than to select modules from a list.

If the instructor doubles back to a page, it is covered once, at its first
appearance.

## AC5. Two outputs, one capture

From one walkthrough the instructor can produce:

- **An announcement**, in the exemplar's format.
- **A video script**, which is a different register: spoken, second person,
  no URLs read aloud, ordered to follow the walkthrough, with the on-screen
  page named at each transition so the recording can be matched to it.

Either, or both. Generating one must not require discarding the other, and
generating the second must not re-run the capture.

## AC6. Every page that was captured is accounted for

The output names which captured pages it covered. A page whose text could not
be extracted is listed as not covered rather than silently dropped - the same
honesty rule the knowledge summary already follows, and for the same reason: a
draft that silently omits a page while presenting itself as complete is worse
than one that admits the gap.

## AC7. The draft is editable before it goes anywhere

It lands in the existing draft surface and is posted by the existing poster, or
copied out. Nothing here posts automatically.

## AC8. The instructor's voice still applies

The exemplar governs FORMAT. `user-style.ts`'s writing-style block still
governs VOICE. When they conflict - the exemplar is terse, the stored style
sample is chatty - format wins on structure and voice wins on wording, and the
prompt says so explicitly rather than leaving the model to choose.

---

## Deliberately NOT in scope

Auto-posting; scheduling (the existing scheduler already covers it once a
draft exists); OCR of images inside a page beyond what the deck capture
already extracts; matching an exemplar's *branding* or HTML styling; and any
change to the capture pipeline itself.

---

## SURVEY RESULT: the three gaps were wrong. Two of them do not exist.

A reuse survey read the code rather than grepping it, and refuted two of the
three gaps above. The originals are left in place so the correction is
visible.

**GAP 3 DOES NOT EXIST. There are five script generators already.** The one
that matters is `generateModuleIntroScriptAction`
(`src/app/actions/media.ts`), which takes `materialsText` **as a plain
string** - exactly the artifact the walkthrough capture already produces - and
returns a spoken-register script sized to a target duration, with the writing
style block applied and the output-token budget scaled to length. Its pure
composer takes the materials verbatim. `generateLectureScriptAction`,
`generateAvatarScriptAction`, `generateSlideNarrationAction` (which already
demands coverage "in order") and `generateVideoNarrationAction` also exist.
The script half is wiring plus one new pure prompt composer for AC5's spoken
clauses.

**GAP 2 IS MOSTLY NOT A GAP.** Three refutations:
`draftAnnouncementAction` takes ONE free-text instruction string and knows
nothing about Canvas or weeks - it is the shared primitive behind every
announcement path in the app. `regenerateAnnouncementAction` **already takes
materialsText AND previousAnnouncement together**, which is the exact
parameter shape this feature needs (with the instruction inverted - it asks
for something deliberately DIFFERENT from the previous announcement). And
`buildTakeAnnouncementInstruction` (`src/lib/take-announcement.ts`) is a pure,
dependency-free builder that composes recorded content plus context into that
instruction string. **"Recording to editable announcement to post" is already
a shipped, complete feature** (`TakeAnnouncementPanel`). The new work is
swapping a transcript for walkthrough page text and adding the exemplar.

**GAP 1 IS REAL and is the only genuine new build.** Nothing anywhere derives
a structural outline from an example document. The style system captures TONE
and is global to the instructor, keyed by user id with no course column.

## THE CONTRADICTION IN AC4/AC6, AND HOW IT IS RESOLVED

**Page identity does not exist in the capture pipeline and cannot be
captured.** `getDisplayMedia` returns a MediaStream - pixels and encode facts.
It does not expose the shared surface's URL or title, and no standard browser
API does. A repo-wide grep across the capture path for page-url and
page-title identifiers returns ZERO hits. The instructor is screen-sharing the
LMS from another window; the app sees photons.

What the pipeline emits is an ordered stream of `ExtractedBlock` records
(heading, text, kind), where the heading is the heading PRINTED ON THE PAGE,
defaulting to "Untitled". So "covers those pages, in order" was not
satisfiable as written, and AC4/AC6 contradicted the scope section's ban on
extraction changes.

**DECIDED (owner, 2026-09-06): the model detects page boundaries.** The
extraction prompt gains a page-boundary marker so the model flags when the
layout changes to a new page. Zero extra clicks for the instructor, which the
alternatives could not offer - a manual "next page" control costs one click
per page against this repo's minimize-clicks standard, and heading-level
grouping silently splits one page with three headings into three items and
merges two pages that share a heading.

**Consequences that follow, and they are not optional:**

- **The scope section's "no change to the capture pipeline" line is REVOKED
  for this one purpose.** It was my line and it was wrong: it would have
  forced the feature to deliver something other than what was asked. The
  extraction PROMPT may change; the capture WIRING still may not.
- The prompt change touches a shipped path with its own MEASURED acceptance
  spec. Read that spec before editing, and treat a regression in deck quality
  as a blocker, not a trade.
- **The model will sometimes be wrong** - it will occasionally split one page
  or merge two. AC6's coverage report must therefore describe what the model
  BELIEVED it saw, never assert page identity as fact.
- **AC4's dedup runs against a documented, measured decision.**
  `module-blocks.ts` explicitly REJECTS a global dedupe set, because a module
  legitimately repeats short lines and a global set silently deletes real
  second occurrences. The seam join deliberately compares only adjacent
  batches. So "covered once, at first appearance" must be built as a SEPARATE
  PURE FOLD over the block array, with its collapse behaviour tested - never
  by loosening that seam.

## THE DRAFTING PATH, DECIDED

**DECIDED (owner, 2026-09-06): a new exemplar-driven drafting path, leaving
the shipped drafter untouched.**

The reason this was a real fork: `draftAnnouncementAction`'s prompt hard-codes
"do not use markdown, headings, or bullet symbols" - which forbids precisely
the structural features AC2 exists to reproduce. Reusing it unchanged would
silently defeat the whole exemplar premise, and making the rule conditional
would edit a prompt every announcement in the app already depends on.

**Two traps that come with that decision:**

- `draftAnnouncementAction`'s fixed `maxOutputTokens: 1024` (roughly 750
  words) will SILENTLY TRUNCATE a long formatted announcement. Do not inherit
  it. The script path already solved this: `lectureScriptMaxOutputTokens`
  sizes the budget to the requested length, explicitly because a fixed budget
  "truncated every script past roughly 22 minutes with nothing reporting it".
  Copy that shape.
- This repo now has FOUR different materials caps (8,000 / 8,000 / 24,000 /
  120,000). A fifth must be chosen deliberately and named, not inherited. The
  walkthrough cap of 120,000 is sized for a deck, not an announcement.

## WHERE IT LIVES: a new directory, and the reason is measured

`ModuleDeckCapturePanel.tsx` is **858 lines against the 1000-line ceiling** -
142 of headroom, against roughly 250 lines of additions. And the one available
JSX extraction has already been spent: the settings panel was carved out and
the file is still 858, because the state and the persistence effects stayed
behind. Extracting JSX does not buy headroom here; extracting state does.

So: a new sibling directory and a new Recording-tab view, mirroring how the
deck capture directory itself split off for exactly this reason. Its own
ordinal canary pins the directory's persisted-key count, so adding controls
means bumping that count in the same commit.

**The cost, stated plainly:** a second capture entry point and a second
screen-share grant. The instructor cannot get a deck and an announcement from
one recording. Mitigate by sharing the REDUCTION seam - the four pure
functions that turn frames into a materials string - and the persisted
course/module keys, not the panel. If one-capture-two-outputs turns out to be
a hard requirement, the honest answer is that the deck panel must be split
first, as its own chunk.

## Budget, measured

The style block is at most 1,600 characters. A realistic weekly walkthrough is
an estimated 4-8 pages at roughly 1,000-11,000 characters each. Worst
realistic total for one call - materials, exemplar, outline, style block,
prompt - is around 50,000 characters, roughly 12,500 tokens, about 1.2 percent
of the model's context window. **Input size is a non-issue.**

The binding constraints are elsewhere: the OUTPUT token budget (above), and
the LLM retry tail - there is no fetch timeout anywhere in the LLM client, and
when the provider returns a Retry-After the delay is capped at 20 seconds, so
four retries is 80 seconds of sleep alone, past the platform's 60-second cap.
That is pre-existing, and it is the reliability risk this feature inherits.

## Precedents an implementer must reuse rather than rebuild

- `buildTakeAnnouncementInstruction` - the structural template for composing
  recorded content plus context into one instruction string, with a
  word-boundary truncation marker.
- `renderPageMarkers` (`src/lib/knowledge-overview-prompt.ts`) - emits
  numbered markers and resolves references BY INDEX, never by title, because
  titles are not unique. Headings are not unique either, so AC6's coverage
  report needs exactly this mechanism.
- `buildDeckPrompt` - the existing "cover these in order, do not add, remove,
  merge or reorder" enforcement.
- `getWritingStyleBlock` - the injection seam to EXTEND, not rebuild. It
  already returns an empty string on failure so callers concatenate
  unconditionally.
- Every prompt composer in this codebase lives as a pure leaf in `src/lib/`,
  because a `"use server"` file may export only async functions and vitest
  here is node-env with no jsdom. Both new composers go there.

## Still open

1. The characters-per-page figure is an ESTIMATE derived from a bound, not an
   observation. No run log from a real walkthrough exists in the tree to
   measure against. Measure one before sizing the cap.
2. Whether the new surface lands its draft in the existing Canvas-tab
   announcements panel (which has headroom and already does draft-edit-post,
   but takes its input from its own textarea) or builds a small draft pane
   reusing the shipped poster. The latter matches how the take-announcement
   panel was built.
