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

---

# PEER PASSES (2026-09-06): six concurrent reviews, and what they changed

Six passes ran concurrently against the criteria above - architect, UX, data
engineer, admin capability, cybersecurity, site reliability - one role per
agent. Their findings are consolidated here as DECISIONS, not as a reading
list. Where a pass contradicted this document, the correction is written
below and the original is left in place above so the change is visible.

## P1. THE FEATURE, AS SPECIFIED, WOULD HAVE POSTED LITERAL MARKDOWN

The single most important finding, and nothing above catches it.

AC7 says the draft "is posted by the existing poster". The existing poster is
`createAnnouncement` -> `buildAnnouncementBodyHtml`
(`src/lib/canvas/announcements.ts:308-312`) -> `textToHtml`
(`src/lib/canvas-core.ts:90-99`), which escapes HTML entities and wraps
blank-line-separated paragraphs in `<p>`/`<br>`. **It has zero Markdown
awareness.**

That is correct for every announcement the app writes today, because
`draftAnnouncementAction`'s prompt forbids markdown, headings and bullet
symbols (`src/app/actions/messaging.ts:436`) - which is exactly why this
document already decided on a new drafting path.

But the consequence was not carried through: a new drafter that emits
`## Section` and `- item` to match an exemplar's structure, posted through
`textToHtml`, publishes those characters LITERALLY to every student in the
course. The whole exemplar premise defeats itself at the last step, silently,
with every gate green.

**DECIDED: the announcement is posted through `markdownToHtml`
(`src/lib/markdown.ts`), not `textToHtml`.** Reasons, in order:
- `markdownLiteToHtml` is the wrong one: it has no ordered lists, and AC2
  treats ordered-vs-unordered as a structural feature it must reproduce.
- `markdownToHtml` is already the renderer this repo hardened for XSS
  (094ef65) and already the one used for model-authored text, via
  `renderOverviewMarkdown` in the knowledge overview.
- This is a NEW posting path for the new drafter. `textToHtml` stays exactly
  where it is for every existing caller - none of them emit markdown, so
  switching them would be a change with no upside and real risk.

## P2. THE ORDERING REQUIREMENT IS ALREADY MET. The prompt change buys less
## than the decision above assumed.

The owner's page-boundary decision was made on the premise that "covers those
pages, in order" was not satisfiable without it. The architect pass traced
the seam and refuted that:

- the drain effect returns early while `extracting`, so exactly one batch is
  ever in flight and batches complete serially in queue order;
- `batchBlocksRef.current` is appended in completion order;
- `appendBatchBlocks` is applied index-ordered;
- `renderMaterialsText` iterates in array order;
- and the extraction prompt already says "Order the array the way the content
  appears on the page, top to bottom."

**The materials string is already in walked order.** So the page-boundary
marker buys AC6's per-page coverage report and AC4's dedup - not AC4's
ordering, which is the thing it was decided for.

**The decision STANDS anyway, and the reason is worth stating.** Per-page
coverage is what AC6 asks for, the owner chose model detection over a manual
"next page" control on click cost, and this project's standing preference is
the fullest build rather than the trimmed one. But the marker is now correctly
understood as a nice-to-have on a measured, shipped prompt rather than a
prerequisite - so it goes LAST in the sequencing, where it can be dropped
without taking the feature with it.

**The trap that comes with it, which would ship dead:** the parser at
`module-content-extract.ts` skips any element with no non-empty `text`. If
the page boundary is emitted as its own array element rather than as a FIELD
on a block, it is silently dropped, the deck path stays green, and the
coverage report is empty with nothing reporting why. Emit it as a per-block
field.

Two more constraints on that clause, both measured: the prompt has a live
length gate (`< 6000` characters, currently ~5,301 at max module name), so
roughly 700 characters of headroom; and it must describe LAYOUT change, never
heading identity - the measured DE13 finding is that 6 of 8 distinct module
headings already collapse under the similarity rule, and a clause inviting
the model to equate "new heading" with "new page" walks straight into it.

## P3. THE EXEMPLAR GOES IN SUPABASE, NOT localStorage. AC1 was wrong.

AC1 files the exemplar under the standing "every new textbox persists under a
`ta-` key" rule. That rule is for CONTROL state. AC1's own next sentence -
more than one per course, most recent is the default - describes a managed
collection, which is a table, not a key.

The evidence, and it is direct:
- the closest shipped analogue is the institution knowledge overview
  (migration `20261011000000`): per-owner, per-scope, AI-generated-or-curated
  text. It is Supabase, and its own component storage module puts ONLY the
  panel-open state and an in-progress question draft in `ta-` keys.
- every other piece of per-course user-authored text in this app is Supabase:
  `course_task_attachments`, `generated_artifacts`,
  `institution_page_attachments`.
- localStorage quota failure is not hypothetical here: the grading-row
  serializer already carries a documented quota-fallback lever that drops its
  largest field and retries, and says in its own comment that far smaller
  payloads than expected blow the quota.
- an exemplar pasted on a laptop is expected to be there next week on any
  machine. A cache cannot promise that.

**DECIDED: a new `announcement_exemplars` table, APPEND-ONLY.** Columns:
`id`, `user_id` (cascade FK to `auth.users`), `course_id` (cascade FK to
`course_hub`), `exemplar_text`, `outline jsonb`, `label`, `created_at`. Index
on `(user_id, course_id, created_at desc)`. Four owner-scoped RLS policies,
matching every per-user table in this schema.

Three design points, each load-bearing:
- **"Most recent is the default" is DERIVED, never stored** - it is
  `order by created_at desc limit 1`. No `is_default` boolean, so nothing to
  keep in sync.
- **Nothing upserts.** Every save is a plain INSERT. That is what keeps this
  clear of this repo's documented 42P10 trap (a nullable uniqueness key plus
  a PostgREST upsert needs a STORED GENERATED arbiter). If a later change
  adds "pin one as default", THAT is when the partial-unique-index pattern is
  needed - and it must not be reached for casually.
- **Rows are mapped through an explicitly typed mapper** (`mapRecordingFile`
  pattern), never a bare typed `.select()`, which collapses to `never` here.

Retention: unbounded row growth per course, with no sweep. **Accepted, and
named rather than hidden.** At instructor-authored-text volumes this is a few
dozen rows per course over a course's life - not the every-request-writes-a-
row growth rate that made the credential rate-limiter need a cleanup. The
real risk is picker clutter, not bytes; cap the READ path at a sensible N if
it ever bites. Do not build a cron sweep for this.

Offboarding: covered automatically BY the cascade FK, and only by it. This is
the one MUST the admin pass found.

## P4. A SECOND HTML QUESTION THE CRITERIA DID NOT RESOLVE

AC1 says a rich paste is reduced to text plus a structural outline and never
stored as raw HTML. Nothing in the app does that stripping today - it has to
be built, at the paste boundary.

The primitive exists and is isomorphic: `htmlToText` (`canvas-core.ts:71-85`)
is pure string work, no DOM, no node-html-parser, so it can run in the paste
handler in the browser before any network call.

But `htmlToText` FLATTENS - it throws away exactly the heading/list structure
AC2 exists to capture. The one converter here that preserves structure is
`src/lib/markdown.ts`, and it is **server-only** (node-html-parser).

**DECIDED: the outline is derived from the reduced TEXT, in a pure leaf, not
from the pasted HTML's DOM.** The alternative - a server round trip that
parses raw HTML and then has to be trusted to discard it - reintroduces the
raw-HTML handling AC1 bans, to recover structure that a plain-text reading
can infer well enough for a prompt hint. The outline is descriptive, not a
rendering: it says "there is a bulleted due-date block near the end", and a
flattened `- ` line supports that reading fine.

## P5. TWO BUTTONS, NOT A MODE TOGGLE

AC5 says either output, or both, and never says what the control is - which
is the gap that produces the exact "wrong artifact, not noticed" failure AC5
itself worries about.

**DECIDED: two always-visible buttons, "Generate announcement" and "Generate
video script".** A segmented control or a checkbox pair puts the artifact
choice in persisted UI state that can be stale from a previous session, so a
single click silently produces something other than what the instructor
expected. Two buttons make the artifact part of the click itself; there is no
state to fall out of sync with. One output costs one click, both cost two -
no worse than the alternatives in the common case, and the entire
silent-mismatch failure mode disappears.

Each button gets its own loading state, its own error state, and its own
`fieldsTouched` flag if a regenerate confirm is armed. Sharing one flag would
arm one output's confirm step when only the other was edited.

## P6. WHAT MAKES "DO NOT RE-RUN THE CAPTURE" STRUCTURAL RATHER THAN HOPEFUL

AC5 requires that generating a second output not re-run the capture, and that
one failing not discard the other. The deck panel is the WRONG precedent to
copy: it has a single `generating`/`saved` pair built for exactly one output,
and an implementer copying it would naturally fold both outputs into one
error state, so a script failure blanks an already-good announcement.

The right precedent is already shipped: the take-announcement hook's image
companion, whose state is fully independent of the draft's, with the
invariant written in its own comment - an image failure can never block or
degrade the already-drafted, already-postable text.

**DECIDED: one durable reduced-materials value, computed once from the
capture, plus two independent output states that read from it and never
invalidate it.** That is what makes the guarantee structural.

## P7. THE OUTPUT BUDGET, AND THE FAILURE THAT LOOKS LIKE NOTHING

Confirmed against the code: `draftAnnouncementAction`'s `maxOutputTokens` is a
fixed 1024 (roughly 750 words), which a multi-section exemplar-matched
announcement will silently truncate mid-structure. Not inherited - the new
path is new precisely so it does not inherit that prompt or that budget.

The sizing shape to copy is `lectureScriptMaxOutputTokens`, and the reason it
exists is recorded in this repo: a fixed budget "truncated every script past
roughly 22 minutes with nothing reporting it".

**The non-obvious half, and it has already bitten this codebase once:**
thinking tokens share the output budget, so a too-small budget yields an
EMPTY string, not a short one. The shipped fix is to ADD a thinking-headroom
constant on top of the content estimate and then clamp - never to clamp a
content estimate UP to a floor that also has to cover thinking.

**DECIDED:** a new named budget function sized from the OUTLINE (section count
times per-section sentence range), plus the calibrated thinking headroom, then
clamped. Named deliberately, in its own leaf, with its own tests. Likewise the
materials cap: this repo has at least seven different ones, and this feature
picks an eighth on purpose rather than inheriting the deck's 120,000, which is
sized for a deck and not an announcement.

## P8. THE INHERITED RELIABILITY HAZARD, CONFIRMED

The LLM client has NO fetch timeout, and its retry backoff is capped at 20
seconds per attempt across up to four retries - 80 seconds of sleep alone,
against a 60-second Vercel Hobby cap. Confirmed by reading, not assumed.

This is pre-existing and this feature inherits it; it is not this chunk's job
to fix the LLM client. What IS this chunk's job:
- capture and extraction are already sharded into one server call per batch,
  so each gets its own fresh 60-second budget and the walkthrough as a whole
  is never subject to one timeout. A killed batch loses roughly six frames -
  about nine seconds of content - and nothing else. That failure must NOT
  force a re-record, and it does not.
- generation is a single invocation and is where the cap bites. Its failure
  must leave the reduced materials intact (P6), so retry costs one click.
- any Supabase read this feature adds needs `.retry(false)` and an explicit
  `.abortSignal(AbortSignal.timeout(...))`, because `AbortSignal.timeout()`
  rejects with `TimeoutError` while postgrest-js only recognises `AbortError`
  - an unguarded read retries three more times with fresh timeouts, roughly
  39 seconds, stacked inside the same 60-second budget.

## P9. NO ADMIN SURFACE. This is a decision, not an omission.

The admin pass's net recommendation, and it is right: this feature needs no
admin row at all, beyond the cascade-FK hygiene in P3.

The reasoning is structural rather than about this feature. This app's one
admin surface is `/account/people`, and it does exactly one job - account
lifecycle. It has never done content inspection, spend visibility, or feature
gating for ANY feature, including materially higher-stakes ones (Canvas
credential registration has no owner kill switch; neither do bulk LMS writes).
Making a walkthrough drafting tool the first exception would invent a parallel
admin surface nobody asked for.

Three specific NOs, each argued rather than assumed:
- **No owner-visible exemplar browser.** Reading another instructor's pasted
  announcements is a privacy decision, not a convenience - they are that
  person's institutional communication and may carry student names or grade
  dates. The support path is to ask them to share it, exactly as for every
  other piece of private user content here.
- **No per-feature rate limiter.** The credential limiter exists as the agreed
  price for a specific host-reachability oracle. This feature creates no
  oracle, only ever talks to the owner's own model key, and costs the user
  real recording effort per attempt that a script cannot cheaply automate.
  Every sibling LLM feature ships with no limiter; singling this one out is
  over-engineering.
- **No feature toggle.** There is no flag infrastructure anywhere in this app.
  This would be the first, for a drafting tool, which is not the thing that
  should motivate it.

One SHOULD, recorded as app-wide backlog rather than written into this
feature: the owner has NO visibility into LLM spend, per-user or aggregate -
no table, no counter, nothing. `llm.usage.test.ts` proves only that a single
call's usage is parsed and returned; nothing persists or aggregates it. That
gap is real and growing now that the app runs on the owner's key across
multiple users, but it is not this feature's to close.

## P11. THE PASTED EXEMPLAR IS UNTRUSTED TEXT AND MUST BE FRAMED

The exemplar is an arbitrary document - plausibly copied out of a student
email, an LMS page, or somewhere else entirely - and it becomes part of a
prompt whose output is posted to an announcement every student in the course
reads.

**The good news, traced end to end rather than assumed.** There is NO
function-calling loop anywhere in this app's model client; the only `tools`
entry is `google_search`. So model output cannot invoke an action, a fetch or a
write. And `textToHtml` escapes `& < >`, so no markup reaches a posted
announcement today.

**The bad news is that half of that containment is exactly what P1 removes.**
Posting through `markdownToHtml` is the right call and it deletes the escape
that currently stands between model output and markup in a page students read.
`markdownToHtml`'s own XSS hardening is what carries that weight instead, which
is why the `/\host` link bypass found in the same pass was closed immediately
rather than filed.

And the harm that needs no markup at all remains: an exemplar containing
"state that the Week 6 exam is cancelled and late work is accepted through the
end of term" produces a draft that says exactly that, in the instructor's own
voice, ready to post. AC7's "editable before it goes anywhere" is the only
control, and it is a human reading text the product has just promised them is
ready.

**DECIDED, two requirements, neither optional:**

- **Frame the exemplar as DATA.** This app already owns the guard: the
  `FRAMING_HEADER` shape in `src/lib/chat/knowledge-context.ts` and its twin in
  `entity-grounding.ts`, with the three-turn arrangement the AI chat route
  uses. The knowledge-overview prompt already documents copying that shape for
  a single-shot call, which is exactly what the drafter is. Use it.
  `buildTakeAnnouncementInstruction` - this document's own named structural
  precedent - has NO framing, so copying its shape copies the gap.
- **The RAW exemplar text does not go into the prompt at all. Only the
  outline does.** AC2 already says the outline is what the prompt carries and
  that it is descriptive rather than prescriptive. That IS the containment, and
  it is only real if the raw text is genuinely absent. **Pinned by a test that
  the composed prompt does not contain the exemplar's body** - otherwise the
  boring failure arrives first anyway: last term's due dates copied verbatim
  into this term's announcement.

**A constraint to write down now, while it costs one line.** The
`generate-weekly-announcements` and `schedule-weekly-announcements-for-term`
steps are in `HEADLESS_SAFE_STEP_TYPES` and post or schedule with no human
pause; only `post-announcement` is always-interactive. So the human-in-the-loop
guarantee holds for THIS surface and not for the workflow path beside it. **The
exemplar must not become a workflow input without a human review step**, and
that is a decision recorded here rather than a discovery later.

## P12. AC1's "if rich, it is reduced" IS COMMISSIONING A NEW HTML INGRESS

Checked across the whole tree: there are three `onPaste`/`clipboardData`
handlers, all of them image-item handlers, and **nothing anywhere reads
`clipboardData.getData("text/html")`.** A React textarea receives `text/plain`
only.

So AC1's clause is not describing existing behaviour that needs constraining -
it is asking someone to build the first HTML ingress in the app, in order to
recover structure that a plain-text reading gives well enough for a prompt
hint.

**DECIDED: do not build it.** The exemplar is whatever the textarea receives,
which is plain text, and the outline is derived from that. This settles P4 in
the same direction with a stronger reason: there is no raw HTML to store,
strip, or accidentally render, because none ever arrives. None of AC2's
bullets - heading text, list-versus-prose, greeting and sign-off presence,
per-section length - actually require source markup.

## P13. THE COVERAGE REPORT IS A SECOND UNSCRUBBED TEXT ARTIFACT

Where the capture's own text actually goes, traced file by file: the video blob
never leaves the browser (`saveVideo: false`, always); the JPEG frames go to
one fixed host, the model API; the extracted page text goes there too AND is
persisted in full, indefinitely, in `generated_artifacts.prompt` - deliberately,
per that migration's own header, before any redaction runs.

The existing capture log carries the materials text in full and is scrubbed by
nothing. Its own header is admirably honest about it: the text "can
incidentally carry anything visible on an LMS page in transit (a gradebook
column, a discussion thread)", and forwarding the export forwards whatever made
it through extraction.

**AC6's coverage report is a second artifact of exactly that kind, and this
document did not say so.** It must carry the same stated property, and it must
not name a student even if the model returned one.

Worth being precise about what protects that today: **the only defence against
student data in the extracted text is a sentence in a prompt.** The extraction
prompt's student-privacy clause is well written, but it is a request to a
model, not a control - nothing filters a returned block containing a name or a
grade. That is an accepted risk this feature inherits rather than creates. What
it DOES do is add a second consumer and turn the result into a report the
instructor is invited to trust as complete.

**Consequence for P2's prompt change: the student-privacy clause and the
page-furniture clause are load-bearing and must survive verbatim.** A new
marker inserted between them is exactly where a careless edit drops one.

## P14. TWO SMALLER CORRECTIONS, BOTH VERIFIED

- **`requireOwner()` is not an owner check.** It is now an alias for
  `requireUser()` - any active account - and several file headers still
  describe it as though it gates the owner. **The new actions are written
  against `requireUser()` explicitly**, so the guard's name matches its
  meaning and the eventual reclassification pass has nothing to fix here.
- **Do not copy `artifact-templates.ts` as the persistence precedent**, which
  is the module an implementer would naturally reach for ("a reusable template
  a user saves and picks again"). It had a live cross-tenant delete and an
  upsert that reassigned another user's row; both were fixed on discovery, but
  the rule that made them possible still applies to any new table here:
  **every write and delete filters on the SERVER-DERIVED user id, never on a
  client-supplied id alone, because the service-role client bypasses RLS
  entirely.** Copy `generated_artifacts` instead, which does this correctly on
  both its read and its update.

## P15. THE DISCLOSURE THIS PRODUCT IS NOT MAKING

The instructor is asked to screen-share their LMS while logged in. This
document itself concedes a walkthrough can pass over a gradebook or a
discussion thread. Frames of that screen are uploaded to a third-party model
API.

**Currently disclosed: nothing.** The one live line during capture reports
frames kept and model calls made - deliberately never tokens or currency, and
never where the frames go. No copy anywhere on the capture surface names a
third party.

**DECIDED: a disclosure before the first frame**, saying that frames are sent
to a third-party AI provider to be read, that a single window should be shared
rather than a whole screen, and that a gradebook, inbox or submission should be
closed first. The second point doubles as the quality advice the capture
surface already gives, and the whole thing goes in AC3's pre-capture block,
where the obligation already sits - so it costs no extra clicks and lands where
the instructor is already reading.

## P16. LIMITS ON THESE PASSES THEMSELVES

- **Nothing was run.** No `.env` exists on this machine, and there is no live
  Canvas, database or model endpoint. Every claim above is read from source.
- **Deck output quality under a modified extraction prompt cannot be gated.**
  There is no automated deck-quality test anywhere in the tree. If the
  page-boundary clause ships, a real walkthrough run - twice, before and
  after - IS the acceptance test. Nothing else can measure it.
- **The characters-per-page figure is still an estimate**, exactly as this
  document's "Still open" item 1 already said. The deck's own materials cap is
  documented in its source as unmeasured and reasoned.
- **A possible race in the serial drain loop was found and NOT run to
  ground.** `setExtracting(true)` happens after an await inside the extraction
  call, while the drain effect checks `extracting` synchronously; the
  batch-append is a read-modify-write on a ref, so an overlap would lose a
  batch and scramble order. The cancelled-flag on effect re-run appears to
  close the window. This is pre-existing and the deck path tolerates it, but
  this feature's ordering guarantee leans on it harder. Worth its own look
  before the ordering claim is made to a user.
