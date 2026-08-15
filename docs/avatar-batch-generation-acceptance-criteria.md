# Generate several avatar scripts and videos at once

Instructor request: "make the avatar recording page able to generate several
scripts/videos at once."

## What is actually singular today, and what is not

Surveyed before design. The important finding is that **the server and the
database are already plural; only the browser state and the UI are singular.**

`avatar_videos` (migration `20260922000000_avatar_likenesses.sql:83-97`) has no
per-user unique index and no "one in flight" constraint - it already models N
rows per user. `startAvatarVideoAction` and `refreshAvatarVideoAction`
(`media-likeness.ts:512`, `:561`) are already per-job and owner-scoped. **No
migration is needed to run N renders.** Contrast training, which is
DELIBERATELY single (`findNonTerminalAvatarLikeness`, enforced at
`media-likeness.ts:214-220`, because each attempt burns a paid Tavus slot) -
that stays single and is out of scope.

What is singular is incidental UI shape, never a recorded decision:
- `script: string` (`useAvatarScript.ts:47`), overwritten by every generate.
- `videoJobId: string | null` (`useAvatarVideo.ts:36`) - one in-flight render,
  and its poll effect is keyed on it, so a second render clobbers the first's
  polling. `startVideo` also clears the previous result (`:51-52`), erasing the
  earlier outcome.
- `disabled={videoBusy}` on Render (`AvatarStudioPanel.tsx:569`) - the hard
  one-at-a-time gate.
- No results list exists at all. `AvatarStudioPanel.tsx:581-583` is three
  conditional paragraphs.
- The render name is `prompt.slice(0, 60)` (`useAvatarVideo.ts:54`), so N
  renders from one prompt produce N identically-named files.

## The architectural decision, and why

**Kickoff and progress are browser-driven; completion is ALSO swept
server-side.** Neither half alone is sufficient, and the reasons are concrete:

A purely browser-driven batch inherits a real defect and multiplies it by N.
The client poll is what triggers the server-side MP4 download
(`media-likeness.ts:604-611`, which fetches the finished video into function
memory and re-uploads it to Storage). N simultaneous completions means N
concurrent multi-hundred-megabyte downloads racing the 60s ceiling, from a page
that declares no `maxDuration` at all. Worse, nothing resumes a batch after a
reload: close the tab and the Tavus renders still finish, but nothing ever
downloads them.

A purely server-side queue was rejected on a different ground: Vercel Cron on
Hobby fires at most daily (`api/cron/run-schedules/route.ts:44-46`), which would
make a batch arrive tomorrow. But this project already drives unattended runs
from GitHub Actions rather than Vercel Cron, which removes that objection for a
sweep specifically - the sweep is a safety net that must run eventually, not
within seconds.

So: the page starts N renders and shows live per-item progress while it is open,
and a server-side sweep finishes any render whose browser went away. A Tavus
webhook is permanently foreclosed - REGRESSION entry 231 check 20 records that
Tavus publishes no signature scheme, so a callback would be an unauthenticated
public endpoint.

## Acceptance criteria

**AC1. A batch is a list of items, each with its own steering.**
Each item carries its own prompt, course, purpose, generated script, job id,
status, error and resulting file. The shared single `script`/`prompt` state is
replaced, not supplemented. An item can be added, removed and edited before the
batch runs.

**AC2. Scripts generate as a bounded fan-out, not a serial crawl or an
unbounded burst.** `draftWeeklyAnnouncements`
(`src/lib/announcement-drafting.ts:41-117`) is the template and is reused in
shape: a fixed concurrency (its `DEFAULT_CONCURRENCY = 4`), a wall-clock budget
checked BEFORE an item is considered started, one keyed outcome per item, and a
quota short-circuit - `isNonTransientQuotaRefusal` (`src/lib/llm-refusal.ts`) so
that when one LLM call comes back with a hard quota refusal, the remaining items
report that real reason instead of each burning a call. An item stopped by the
budget reports as deferred, not failed.

**AC3. Every item's outcome is named. No aggregate-only reporting.**
REGRESSION entry 260 check 5 records the existing bulk pattern's defect - the
per-item `failures` array is computed and then DISCARDED, so the instructor
never learns which items failed. That is acceptable for a Canvas checkbox toggle
and NOT acceptable here: each avatar item is a multi-minute paid render. Best-
effort looping is kept (a failure at item 3 of 10 still attempts 4-10); the
discarding is not.

**AC4. Renders are bounded and re-entrant-safe.** A "render all" control cannot
be double-fired into duplicate paid renders. REGRESSION entry 284 check 5 is the
recorded precedent for a double-clicked button in this exact panel doing real
damage. Concurrency is bounded by an explicit constant with its reasoning
written next to it.

**AC5. Per-item render names and file names.** Derived from the item's own
script or prompt, never from a shared one, so a batch does not produce N
identically-named files in the Files tab.

**AC6. Progress is per item, and the list is the UI.** A results region with one
row per item and its own status, modelled on the likeness list
(`AvatarStudioPanel.tsx:453-480`) rather than the three paragraphs at `:581`.
Status wording comes from one place, the way `likenessStatusText` (`:36-56`)
already centralises it.

**AC7. A closed tab no longer strands a render.** A server-side sweep finds
`avatar_videos` rows in a non-terminal status and runs the same completion logic
`refreshAvatarVideoAction` already implements - poll Tavus, and on success
download and store the file. This is the piece that does not exist today for
either single or batch renders, and it is what makes a batch trustworthy. It
reuses the existing owner-impersonation machinery (`runAsOwner`, guarded by
`CRON_SECRET`) rather than inventing a second trust boundary, and it must be
idempotent: a row already carrying `recording_file_id` is skipped, exactly as
`refreshAvatarVideoAction:570` already short-circuits.

**AC8. The batch survives a reload, because the DB is the source of truth.**
On mount the page reconstructs in-flight items from `avatar_videos` rows rather
than from localStorage alone. Entry 231 check 8 relies on this same property for
training.

**AC9. Persistence must not fight the canary.** The `ta-rec-*` key canary
(`recording-split.structure.test.ts:119-163`) scrapes with `/ta-rec-[a-z-]*/g`,
so a key containing a DIGIT is silently truncated - `ta-rec-avatar-script-1`
scrapes as `ta-rec-avatar-script-`. A per-item numeric-suffix scheme therefore
fights the test. Use ONE key holding a JSON array (e.g. an items key replacing
`ta-rec-avatar-script`/`-prompt`), and update the canary's expected key list in
the SAME commit. Two further traps: any comment containing the literal `ta-rec-`
in that directory injects a bogus key, and the scan is non-recursive and
`.ts`-only, so a new `.tsx` file or subdirectory escapes it entirely.

**AC10. Hook boundaries stay primitive.** REGRESSION entry 285 check 4 records
that `UseAvatarStudioReturn` already has 67 fields and that no inline object,
array or callback literal may cross a sub-hook boundary - "the usual way this
refactor silently makes an effect re-run every render". A batch passing an array
across that boundary walks straight into it, so the array must be memoised and
the poll effect keyed on a stable derived value, never on a fresh array
identity.

**AC11. Nothing about training changes.** One training run at a time stays
enforced. The paid-slot rationale is unchanged.

**AC12. Degradation stays honest.** No API key, no ready likeness, a script over
the cap (`TAVUS_SCRIPT_MAX_CHARS = 4000`, this app's own limit and stated as
such per entry 231 check 18), a per-item failure, a deferred item - each states
itself. Generation stays DISABLED rather than error-on-click when no likeness is
ready, per entry 231 check 19.

## Out of scope

- Batch TRAINING of likenesses. Deliberately single; each attempt burns a paid
  slot.
- The HeyGen deck-narration path (`media-avatar.ts`), a separate unbuilt
  backlog item whose provider endpoints retire 2026-11-01.
- Any Tavus webhook. Permanently foreclosed on security grounds.

## Related defect found during this survey

`useAvatarTraining.ts:181-183` installs its 3-minute poll with NO leading tick,
unlike `useAvatarVideo.ts:114` which correctly calls `void poll()` before
`setInterval`. So after training completes, opening the page and reloading
within three minutes never calls Tavus at all, and the UI keeps showing
"Training in progress" - the instructor reported exactly this. Additionally the
poll's error branch is `if (!("error" in r))`, so an expired or missing
`TAVUS_API_KEY` is indistinguishable from "still training": silent. Both are
one-line fixes and are NOT part of this feature, but AC7's sweep is the durable
answer to the same class of problem.
