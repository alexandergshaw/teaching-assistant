# The cron heartbeat - shipped alone, ahead of scheduled publishing

Parent contract: `docs/scheduled-publishing-from-modules-acceptance-criteria.md`
sections F5 and F9(2). F9 ranks "does the Actions cron fire reliably for this
repo?" as the second highest-risk unknown in that feature and says to **ship
the heartbeat from F5 ALONE first** - it is a genuinely shippable increment
that answers the question with real data before any of the rest is built.
This document is that increment's own contract. Scheduled publishing itself
(release rows, unpublish-at-commit, the bulk-bar group) is NOT in scope here.

## The hole

With an empty due list, `/api/cron/run-schedules` performs **zero database
writes**. So a dead cron and a quiet one are indistinguishable from inside the
app. `last_run_status` cannot close this: it is per-schedule state written only
by a tick that actually ran, so it can never report the tick that never
happened. And this repository is PUBLIC, so GitHub's 60-day auto-disable of
scheduled workflows on inactive repos applies (F3) - a quiet summer stops the
tick and nothing notices.

## Acceptance criteria

### H1 - the write

1. `/api/cron/run-schedules` writes a heartbeat on **every** tick, including a
   tick with nothing due. This is the entire point: the write must not be
   conditional on there being work.
2. The heartbeat write is **best-effort and never aborts the tick**. A
   monitoring feature that can break the thing it monitors is worse than no
   monitoring. `recordCronHeartbeat` already returns a boolean and never
   throws; the route logs a false and carries on.
3. The heartbeat is written even when the schedule loop or the trigger runner
   throws - a tick that crashed still fired, and that is exactly the tick whose
   record matters. Its `last_error` carries that failure; a per-schedule
   failure does NOT (that lives on the schedule's own row).
4. `last_tick_at` is when the tick **started**, so a tick that hangs past the
   60-second `maxDuration` cap shows as a stale heartbeat rather than as no
   heartbeat. **Corrected after verification:** storing the start time is not
   sufficient on its own to deliver that, because the write lived in a
   `finally` and a function killed at the platform cap never runs its
   `finally` - it would have written nothing at all. The tick therefore writes
   the heartbeat TWICE: once at start (zero counts, null duration) and once at
   the end with the real values. Do not delete the first write as redundant.
5. The tick records `schedules_processed`, `triggers_processed` and
   `duration_ms`. All zero is the normal healthy case and must never be
   presented as a problem.
6. The caller identifies itself via a `?source=` query parameter (the GitHub
   Actions workflow sends `github-actions`); an absent or unrecognised value
   records `unknown` and never fails the request. Whatever the source, it is
   stored as free text - a new caller must not be able to make the heartbeat
   write fail.
6a. **Added after verification.** Rows are keyed per (tick, caller), via
   `heartbeatIdForSource`. `vercel.json` registers this SAME route on its own
   cron and Vercel auto-sends the bearer, so it passes the auth gate; on the
   Hobby plan Vercel throttles sub-daily crons to roughly once a day. Sharing
   one row would let that daily tick stamp `last_tick_at` and render "last ran
   3 minutes ago" over a completely dead 15-minute GitHub cron - the
   reassuring-while-broken state this whole feature exists to expose. Two
   callers, two rows; the app watches the `github-actions` row, whose cadence
   is the one every threshold is derived from. The Vercel entry is labelled
   `source=vercel-cron` so it lands in its own row rather than in `unknown`.
7. The authorization check stays exactly as it is, and an unauthorized request
   writes NO heartbeat. An attacker able to stamp the heartbeat could make a
   dead scheduler look alive, which is precisely the state this feature exists
   to expose.

### H2 - the read and the classification

8. `classifyCronHeartbeat(heartbeat, nowMs)` is pure, takes `nowMs` as a
   parameter, and returns one of `never` / `healthy` / `failing` / `late` /
   `stalled` with a whole-minute gap and a ready-to-render sentence.
8a. **Added after verification.** `failing` exists because reading only
   `last_tick_at` renders a cron that fires punctually and throws every single
   time as "ran less than a minute ago", forever - a false healthy on a
   genuinely broken scheduler. Precedence: not-firing outranks firing-badly,
   so a late or stalled gap still reports late/stalled even when `last_error`
   is set.
9. Thresholds derive from `CRON_TICK_INTERVAL_MINUTES` (15, matching
   `.github/workflows/unattended-runs.yml`'s `4,19,34,49`), never hardcoded
   minutes: `late` at two missed ticks plus five minutes of GitHub scheduling
   lag (35), `stalled` at eight missed ticks (120).
10. Ordinary jitter is NOT reported as a problem. A monitor that cries wolf
    every other afternoon is ignored exactly when it is right.
11. A future timestamp (runner/browser clock skew) reads as zero minutes ago
    and healthy, never as a negative gap.
12. A read failure and a never-fired scheduler both classify as `never` - the
    app cannot tell them apart, and must not claim otherwise.

### H3 - the surface

13. The Automations hub shows the scheduler's own status: the last-run
    sentence always, and a visible warning when `late` or `stalled`. This is
    the view that already answers "what is set to run automatically", so it is
    where "is the runner alive at all" belongs.
14. The status is fetched through a server action (the table is read-only to
    the app; the route is the only writer), refreshed when the hub opens - not
    on a timer, and never on every render.
15. `never` is worded as "has not reported yet", not as a failure - a fresh
    deployment has genuinely never ticked.
16. The warning names the concrete next step (the repository's Actions tab,
    and the 60-day auto-disable rule), because the reader of this warning is
    the one person who can fix it.

### H4 - the table

17. One row per (tick name, caller) - `run-schedules:github-actions`,
    `run-schedules:vercel-cron` - keyed on that composite id and upserted, not
    an append-only log with a retention policy to maintain. See 6a for why the
    caller is part of the key rather than just a recorded field.
18. Not user-scoped: a cron tick belongs to the deployment. Reads are open to
    any authenticated session; there is deliberately **no** insert/update
    policy, so only the service-role client in the route can write.

### H5 - gates

19. `npx eslint` clean on every touched path; `npx tsc --noEmit` clean; full
    `vitest run` green; `npx next build` reaching "Compiled successfully" and
    "Finished TypeScript" (the env-dependent prerender tail is expected to
    fail locally).
20. The classifier's boundaries are pinned by unit tests at exactly 34/35 and
    119/120 minutes, and the tests are sabotage-checked - a threshold shifted
    by one minute must turn them red.
20a. **Added after verification.** A test captures the upsert payload and
    asserts every column key in it against the migration's own SQL text. The
    table handle is cast to `any` (the generated Database type does not know
    this table), so a mis-spelled column name is invisible to tsc, eslint,
    vitest AND `next build` while every tick 400s in production. This guard is
    the only thing between that typo and a silently dead feature, and it is
    sabotage-checked by renaming a column.
21. The migration applies itself through the existing GitHub Action on push to
    main; verify that run rather than instructing a manual apply.
