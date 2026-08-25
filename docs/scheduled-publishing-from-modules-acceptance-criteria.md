# Scheduling when content becomes visible to students

Chunk F of the Modules-view backlog.

**The ask, verbatim (2026-08-23):** "also build in a control on the bulk actions
that dteremines when something becomes publishedd on canvas"

**The decision, made by the repo owner after the options were costed:**
students see **nothing at all** until the release time - not a locked
placeholder. That single answer rules out the Canvas-native route and settles
the whole design.

---

## 0. Why this cannot be Canvas-native, and what that costs

Verified against `instructure/canvas-lms` and the Canvas REST docs,
2026-08-23.

**There is no "publish at" field for most content types.** Publishing is a
boolean. What Canvas offers instead:

| Type | Native scheduled PUBLISH? | What exists |
| --- | --- | --- |
| Page | **YES** - `wiki_page[publish_at]` | but gated on an account feature option |
| Discussion | **YES** - `delayed_post_at` | genuinely unpublished until the timestamp |
| Assignment | No | `unlock_at` / `lock_at` only |
| Quiz (classic) | No | `unlock_at` / `lock_at` only |
| New Quiz | No | dates settable, `published` not via that endpoint |
| File | No | `unlock_at` / `lock_at` / `hidden` / `locked` |
| Module | No | `unlock_at` - LOCKS, does not hide |
| Module item | No | none |

**The distinction that decided this chunk.** "Unpublished" means the object
does not exist for students - no title, no gradebook column. "Published with a
future `unlock_at`" means it is listed, visible, has a gradebook column, and
renders as locked with a "will unlock" date. Module `unlock_at` was verified
from `context_module.rb`: `available_for?` returns a locked descriptor
carrying the unlock timestamp, so it **locks and does not hide**.

The owner wants invisible. Canvas can express that natively for exactly two
types. So:

**AC0.** This is an app-side scheduler that flips `published` at the requested
time. Canvas-native fields are NOT used, even for the two types that support
them, because a control that silently means "invisible" for eight types and
"visible but locked" for the rest is worse than one that means one thing
everywhere. Uniformity is the point.

**AC0b (the cost, disclosed in the UI, not buried here).** Release lands
within roughly **15 minutes** of the requested time, not on it. The unattended
runner is a GitHub Actions cron at `4,19,34,49 * * * *`
(`.github/workflows/unattended-runs.yml`) - offset minutes deliberately,
because on-the-interval crons are load-shed by GitHub and this repo's original
one silently never fired. Add GitHub's own best-effort lag. "9:00 AM sharp" is
not deliverable and the control must not imply it is.

---

## 1. Reuse survey

Vetted by reading, 2026-08-23.

| Need | Reuse | Where |
| --- | --- | --- |
| The four per-kind `published` param spellings Canvas needs | `bulkUpdateRequest` already maps `assignment[published]` / `quiz[published]` / bare `published` / `wiki_page[published]` | `src/lib/canvas-modules/bulk.ts:160-188` |
| Publishing a module item (cascades to content) | `updateModuleItemAction` -> `module_item[published]` | `src/lib/canvas-modules/module-items.ts:38-61` |
| Publishing a module | `updateModuleAction` -> `module[published]` | `src/lib/canvas-modules/modules.ts:80-90` |
| One shared throttle budget across a loop | `bulkUpdate`'s own budget | `bulk.ts:199-203` |
| A pure planner that decides one action per slot | `planAnnouncements`'s shape - `create` / `already-present` / `skip-past` / `reschedule` / `leave-posted` | `src/lib/announcement-schedule.ts:179` |
| Write-ahead pending -> confirmed ordering, and why | the migration header | `supabase/migrations/20260925000000_weekly_announcement_schedule.sql` |
| A per-user RLS table keyed to a course | same migration | as above |
| The cron endpoint, atomic claim, stale-claim recovery, `last_run_status` | `src/app/api/cron/run-schedules/route.ts` | already built |
| Deadlines computed in the BROWSER | entry 328's rule | `useLmsGeneration.post()` |

**What is NOT reusable, and this is the honest part.** The weekly-announcement
scheduler LOOKS like the precedent and is not: it hands `delayed_post_at` to
Canvas and lets Canvas own the clock. Its table is a **dedupe ledger**, not a
queue, and **nothing in this repo polls a table and then acts on Canvas**. The
cron route dispatches WORKFLOWS, not arbitrary rows. So this chunk either
becomes a workflow (inheriting `isHeadlessSafeWorkflow` gating and the
fan-out machinery) or the route grows a second dispatch path. **That choice is
the step-4 architect's, and it is the biggest decision in the chunk.**

---

## 2. Acceptance criteria

**AC1 (the control).** A datetime input plus a commit action in the bulk bar,
declared in `bulkBarGroupCatalog.ts` like every other control since entry 329.
It is **`destructive` tier**: it schedules a state change to an instructor's
live course that they will not be watching when it fires. Its group therefore
never collapses and carries an always-visible `consequenceTag` stating the
~15-minute granularity.

**AC2 (what it applies to).** Whatever is selected - items, modules, or both -
using the same selection the rest of the bar reads. No new selection concept.

**AC3 (draft-then-commit).** Per this project's standing rule for side
effects, scheduling shows what WILL be scheduled - how many objects, at what
local time, with the granularity stated - and commits on a second, explicit
action. Arming via the existing `isConfirmArmed` / `selectionSignature` idiom
is sufficient; a modal is not required.

**AC4 (timezone).** The requested instant is computed **in the browser** and
stored as an absolute UTC timestamp. Entry 328 records why: a wall-clock Date
built on a UTC server encodes the server's offset, so a server-side
computation silently shifts every schedule. The stored row carries the
absolute instant; the runner never re-derives it.

**AC5 (idempotency, and the decision this chunk owes).** Canvas offers no
idempotency key. A row must therefore be the only dedupe, following the
announcement table's write-ahead discipline: commit the row, then act, and
treat a `pending` row found later as AMBIGUOUS rather than failed - resolve it
by reading Canvas back, never by blind re-publishing. State the unique
constraint explicitly (one pending schedule per content object, replaced
rather than duplicated when rescheduled).

**AC6 (unpublish is NOT the symmetric inverse).** Canvas refuses to unpublish
a classic quiz once submissions exist. A scheduled unpublish is therefore not
simply the same mechanism with a flag flipped. Either scope this chunk to
scheduled PUBLISH only and say so in the UI, or handle the refusal per object
- but do not silently fail.

**AC7 (visible pending state).** The bar and the module tree must show that a
schedule exists, and when. The read model has NO field for this today
(`CanvasModuleItem` carries `published` but nothing about a pending schedule),
so this needs its own path. Without it the feature is invisible between
scheduling and firing - which is precisely the "shipped but looks absent"
shape this repo keeps hitting.

**AC8 (failure is visible).** If the tick is paused, the secret rotates, or a
write fails, the instructor must be able to see that the content never went
live. `last_run_status`/`detail` already exist on the schedule tables and are
surfaced in the Automate panel; this chunk must surface its own equivalent
where the instructor is actually looking.

**AC9.** Any new textbox/select persists per course under a `ta-` key, read
through a tolerant resolver.

---

## 3. Non-goals

- No Canvas-native `unlock_at` / `delayed_post_at` / `publish_at` (AC0).
- No second scheduler substrate; reuse the existing cron.
- No per-student or per-section overrides.
- No sub-15-minute precision (AC0b).

## 4. Gates

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build      # compile line only
```

No emojis; ASCII only in comments. 1000-line ceiling counted with
`@(Get-Content path).Count`. **`ModulesView.tsx` is at 998 of 1000 - it MUST be split before
touching it.** Migrations auto-apply via GitHub Actions on push to main;
verify the run, never instruct a manual apply.
Baseline entering this chunk: 634 test files / 12654 tests, all passing.

---

## Post-design corrections - THIS SECTION IS THE FINAL CONTRACT

Written 2026-08-24 after a design pass that read Canvas's own source
(`instructure/canvas-lms` master) and this repo's scheduler machinery rather
than reasoning from the summary above. It found twelve errata. **Where this
disagrees with anything above, this wins.** Nothing above is deleted - the
wrong claims stay as a record.

**F1. THE PREMISE IS PARTLY WRONG, AND THE CONCLUSION SURVIVES ANYWAY.** The
document above claims a discussion with a future post date is genuinely hidden.
It is not: `published?` returns false for `workflow_state == "post_delayed"`
**only when `is_announcement`**, and `low_level_locked_for?` folds
`delayed_post_at` into the same branch as `unlock_at`. So an ordinary discussion
with a future post date is **LISTED AND LOCKED, not hidden** - which is exactly
why this repo's weekly-announcement scheduler looks like a precedent for this
feature and is not one. The natively-invisible set is **ONE type (Page)**, and
even that is gated on an account feature flag whose off-state produces
PERMANENT SILENT INVISIBILITY - the docs also say a future publish date
unpublishes an already-published page. So the owner's "students see nothing
until release" still requires an app-side scheduler; the argument for it is
just different, and stronger, than the one written above.

**F2. DO NOT REUSE `workflow_schedules`. REUSE ITS TRANSPORT AND ITS IDIOMS.**
Three disqualifying reasons: its claim function ADVANCES OR DISABLES the row,
which is wrong for a one-shot release; N targets in a `field_values` jsonb blob
makes "crashed after publishing 3 of 10" unrepresentable, and that state is the
whole problem; and becoming a workflow inherits the `isHeadlessSafeWorkflow`
gate, which **SILENTLY SKIPS** - a release that never happens and never says so
is the exact failure this feature exists to prevent. Build a new table keyed on
`course_url` (not a `course_hub` foreign key - `resolveCourse` needs only URL
plus acronym), and reuse the existing CAS and stale-sweep idioms rather than
inventing concurrency control. **Run releases FIRST in the existing cron route,
under their own sub-budget**, or a long workflow run eats the 60-second cap and
releases silently miss their window.

**F3. THE 15-MINUTE FLOOR IS A CHOICE, NOT A CONSTRAINT, AND THE REPO BEING
PUBLIC MATTERS.** Worst-case lateness is 14m59s plus GitHub's own scheduling
lag. GitHub's minimum cron interval is FIVE minutes, so the non-goal above
("no sub-15-minute precision") is a decision we are making, not a platform
limit - say so rather than implying otherwise. And this repository is PUBLIC,
which means **GitHub's 60-day auto-disable of scheduled workflows on inactive
repos DOES apply** - a quiet summer disables the scheduler, and nothing in the
current design would notice.

**F4. THE MOST SURPRISING BEHAVIOUR IN THE FEATURE IS NOT IN THE DOCUMENT AT
ALL.** Delivering "students see nothing until release" requires **UNPUBLISHING
anything already published, immediately at commit time** - otherwise scheduling
a release for next Monday leaves this week's content visible until then, which
is the opposite of what was asked. And Canvas CAN REFUSE: a quiz's
`can_unpublish?` is false once it has student submissions. The document frames
refusal as a scheduled-unpublish problem; it actually bites the scheduled-
PUBLISH flow, at commit, before anything is scheduled. Decide and state what
happens when the hide is refused - refuse the whole schedule, or schedule it
and warn - and make it visible at the moment the instructor commits.

**F5. THE SILENT-FAILURE HOLE IS NOT THE ONE THE DOCUMENT NAMES.** With an
EMPTY due list the cron route performs **zero database writes**, so a dead cron
and a quiet one are indistinguishable from the outside - and `last_run_status`
is per-row state written only by a tick that actually ran, so it can never
report the tick that never happened. Fix with three cheap pieces: a one-row
HEARTBEAT the tick always writes even with nothing to do, client-side overdue
detection that compares the heartbeat against now when the app opens, and
fire-on-open so a missed release lands the moment someone looks. This is the
"content never publishes and the instructor finds out from a student complaint"
failure, and the existing nav badge does not cover it.

**F6. TIER IS `fan-out-write`, NOT `destructive`.** The shipped model reserves
`destructive` for the four already-armed writes; `Publish` and `Unpublish` are
`fan-out-write`, which ALREADY gives never-collapses plus a mandatory
consequence tag. Arm the control anyway - arming and tier are independent
decisions, and this one both unpublishes existing content (F4) and schedules a
future change.

**F7. THE PERSISTENCE CLAIM IS CONTRADICTED BY THE CATALOG.** The requirement
above that the date control persist is wrong for this bar: `itemsDueDate`, an
IDENTICAL `datetime-local` in the same bulk bar, is `persistKey: null` with a
written `ITEM_TYPE_UNPERSISTED` reason. Follow the neighbour, and cite it, so
`auditGroupModel`'s I6 is satisfied by precedent rather than by a new rationale.

**F8. THE GATE NOTE IS STALE IN TWO WAYS.** `ModulesView.tsx` lives at
`src/app/components/content-tab/`, not in `modules/`, and it measures **732**
lines, not 998 - the orchestration extraction landed in chunk D.

**F9. THE THREE HIGHEST-RISK UNKNOWNS, RANKED, EACH WITH ITS EXPERIMENT.**
(1) Does an item published inside an UNPUBLISHED module actually become visible
to students? This decides the entire target set - whether releases operate on
items, modules, or both - and it is ten minutes in Student View. (2) Does the
Actions cron fire reliably for this repo? **Ship the heartbeat from F5 ALONE
first** - it is a genuinely shippable increment that answers the question with
real data before any of the rest is built. (3) What does Canvas actually return
when it refuses to unpublish a quiz with submissions? Fifteen minutes with
curl, and it decides F4's wording.

## F10. The target-set decision - taken 2026-08-24, by the repo owner

F9's first unknown (does an item published inside an UNPUBLISHED module become
visible to students?) is **still unrun**. Asked to choose between waiting for
the experiment and building without it, the owner chose to build: **releases
target BOTH the module and its items.**

**Why that is safe under either answer, and it is the only assumption that
is.** The two directions this feature needs are "after release, students can
see it" and "before release, students cannot". Targeting both is the superset
in each direction: publishing the module AND its items guarantees visibility
whichever level actually controls it, and unpublishing both guarantees
invisibility the same way. A narrower target set is only correct if the
experiment says so; a wider one is correct regardless.

**What it costs, stated plainly:** more writes per release than may be
necessary, against a live course. If the experiment is later run and shows one
level governs visibility on its own, the other level's writes can be dropped -
that is a REMOVAL, made with confidence, which is exactly the shape F9 said its
experiments would buy. Until then the extra writes are the price of not
guessing.

**Consequences that follow immediately:**

- A selected module contributes the module target AND one target per item it
  holds. A selected item contributes itself. An item that is both selected
  directly and held by a selected module is ONE target, not two - dedupe on
  (kind, id).
- `module_id` is now known at schedule time for every item target, so it is
  stored on the row. This closes the follow-up REGRESSION entry 339 recorded:
  the runner no longer needs a `listModules` call to find an item's owning
  module.
- F4's unpublish-at-commit hides both levels too.

**F4's refusal question, decided here.** Canvas can refuse to unpublish a quiz
that has student submissions (`can_unpublish?` is false). The choice F4 left
open was "refuse the whole schedule" or "schedule it and warn". Neither: the
refusal is surfaced **before the instructor commits**, in a review step that
lists per target whether it can be hidden - matching the draft/review/commit
idiom every comparable control in this app already uses (entries 331, 337). A
target Canvas will refuse to hide is shown as such, so committing is an
informed act rather than a warning read after the fact. The release itself is
still scheduled for a refused target: publishing later is harmless and the
instructor may simply accept that one item stays visible in the meantime.

## F11. Cancelling a scheduled release - the requirement F4 created and never named

Entry 340 shipped the commit; nothing could see or call off a release once
made. This section is that gap's contract.

**F11.1 - THE TRAP, AND WHY CANCEL MUST RESTORE.** Committing a release
UNPUBLISHES the selected content immediately (F4). So a cancel that merely
deletes the row leaves every target hidden - permanently, with no scheduled
event coming to reveal it. The instructor's mental model of "cancel" is
undo, and delivering "your content is now invisible forever, silently" against
that word is the single worst thing this feature could do.

**Therefore cancelling RESTORES the published state the commit changed**, and
says so at the point of cancelling. It is the honest inverse of commit, not a
row deletion. A target the commit found already unpublished is left alone -
restoring it would publish something the instructor never had visible.

**F11.2 - THAT REQUIRES REMEMBERING WHAT WE CHANGED.** The plan already reads
each target's `published` state to classify hide-ability; the commit must
persist it (`was_published`) so cancel can act on fact rather than assumption.
This is the same lesson G1 forced in the command interface: capture what you
overwrote, at the moment you overwrite it, because nothing else can recover it
later. A row with `was_published` null - written before this section existed -
must be cancelled WITHOUT a restore attempt and must say so, never guess.

**F11.3 - CANCEL IS A COMPARE-AND-SET ON `pending`, NOT A DELETE.** A row the
cron has already claimed is mid-flight; cancelling it would race the publish.
Cancel therefore transitions `pending -> cancelled` via the same CAS idiom the
claim uses, and a lost race reports honestly that the release already ran
rather than silently doing nothing. `cancelled` is a new terminal status, kept
rather than deleted so "what did I call off, and when" remains answerable -
the same reasoning entry 333 applied to the gradebook audit trail.

**F11.4 - WHERE IT LIVES.** The Automations hub - the view that already answers
"what runs automatically", and which entry 334 gave the scheduler's own health
line. Releases are created in the Modules view but they are not a Modules
concern once made; and `ModulesView.tsx` is at 867 lines against a 1000 cap.
The commit result in the Modules review names where to go, so the control that
creates a release tells the instructor where to cancel it.

**F11.5 - WHAT THE LIST MUST SHOW.** Per row: the target, the course, the
release instant in the reader's own locale, the status, and whether cancelling
will restore visibility. A pending release whose instant has already passed but
which has not yet fired is NOT an error - it is waiting for the next tick, and
must read that way rather than as "late".
