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
