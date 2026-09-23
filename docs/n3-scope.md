# N3 scope: flip failedCount to gating in sweep-orphan-uploads.yml

Row: `docs/backlog.yml`, `- id: 'N3'` (`grep -n "id: 'N3'" docs/backlog.yml`
returns line 73). Read in full this pass (lines 73-83). This is the first
`n3-scope.md` in `docs/` (`ls docs | grep -i "^n3-"` returns nothing, exit 1)
- there is no prior version, so the disposition-table requirement for a
restructuring does not apply. Everything below is a fresh finding against the
tree, measured 2026-09-23.

The row's own text: "Flip failedCount to gating in
.github/workflows/sweep-orphan-uploads.yml. A one-line edit an agent makes
here; blocked on V3's (formerly 1.3's) INPUT, not on capability. Until the
semantics are known, a wrong guess in either direction poisons the only
outbound alert this deployment has." Per the brief, this is a hypothesis to
test, not an instruction to execute. Every quantity below names the command
that produced it; every code claim is a `file:line` opened this pass.

**Unverifiable in this environment, stated up front so it is not silently
assumed anywhere below:** anything about the live GitHub Actions run
(whether the workflow actually fires on schedule, what the response body of
a real tick looks like, whether GitHub's failure-email notification is
enabled for this repo, whether any branch-protection rule references this
workflow's status check). This checkout has no `.env`, no live Supabase
project, and no `gh` CLI (`docs/loop/this-repo.md` section 5 and 6) - so
every claim about runtime behavior below is a READING claim (what the code
and workflow YAML say they will do), labelled as such, never an executed
observation.

---

## 1. What the workflow does today, end to end

File: `.github/workflows/sweep-orphan-uploads.yml`, 149 lines
(`wc -l .github/workflows/sweep-orphan-uploads.yml`).

- **Trigger** (`:22-25`): `schedule: cron: "9,24,39,54 * * * *"` (four times
  an hour) plus `workflow_dispatch: {}` for a manual run.
- **Concurrency** (`:32-34`): `group: sweep-orphan-uploads`,
  `cancel-in-progress: false` - overlapping ticks of *this* workflow are
  serialized, but the comment at `:27-31` states explicitly that "a manual
  curl or a second automation hitting the same endpoint is a separate,
  unsolved overlap case." This matters for section 3.
- **What it runs** (`:37-58`): one `ubuntu-latest` job, one step. It reads
  `CRON_SECRET` from repo secrets, fails closed with `exit 1` if unset
  (`:44-48`), then `curl`s
  `https://teaching-assistant-pi.vercel.app/api/cron/sweep-orphan-uploads`
  with `Authorization: Bearer $CRON_SECRET` (`:49-51`), capturing the HTTP
  status and body. A non-200 status is a hard failure (`:55-58`,
  `exit 1`) - this path is **already gating** today.
- **What `failedCount` is today** (`:60-134`): the response body is parsed
  with `jq` (or a documented, deliberately-crude `grep` fallback if `jq` is
  absent, `:78-98`) into `failedCount`, `totalUserPrefixes`, and
  `listingErrors`. Per the binding "RULING 1" comment at `:60-67`,
  `failedCount` is read and logged (`:105`) but explicitly does **not** fail
  the workflow: a nonzero value only produces a non-failing
  `::warning::` annotation (`:132-134`). Two *other* signals in the same
  script already gate today: `totalUserPrefixes === null` (phase 1 of the
  sweep did not complete at all) is a hard `exit 1` at `:127-130`, and a
  missing/unparseable `failedCount` value itself fails closed at `:100-103`.
  So "gating" is not a new mechanism this workflow would need to learn - it
  already uses `exit 1` for three other conditions in the same step - the
  question is only whether `failedCount != 0` should join them.

**What "gating" concretely means here, and why the three readings the task
asks me to distinguish collapse into one for this file:** because the whole
job is a single step, a non-zero exit call at `:132-134` fails the step,
which fails the (only) job, which marks the workflow run red. There is no
separate "job vs. step" distinction to make in this file - it is one job,
one step. A "notification" is not a fourth alternative implemented in this
file at all: no step here sends an email, Slack message, or otherwise pages
anyone. The comment at `:16-17` and `:101,124-125` all say some version of
"this workflow's failure email is the only alert this deployment has,"
which is a claim about **GitHub's own default behavior when a workflow run
fails** (a repo-level/account-level notification setting), not something
configured in this file. I could not find any step in this workflow, or in
`.github/workflows/unattended-runs.yml` or
`.github/workflows/supabase-migrations.yml`, that sends a notification
through any other channel (`grep -n "slack\|email\|webhook\|notify" .github/workflows/*.yml`
returns nothing). So the only "who sees it" channel this repo's own comments
assert is GitHub's platform-default failed-run email, and I cannot confirm
from this checkout whether that default is actually enabled for this
repository or this account - that is an owner-only check (residual 2,
section 6).

---

## 2. What happens when it gates - failure modes and which are transient

Reading `src/lib/orphan-upload-sweep.ts` (438 lines,
`wc -l src/lib/orphan-upload-sweep.ts`) and the route it backs
(`src/app/api/cron/sweep-orphan-uploads/route.ts`, 149 lines,
`wc -l src/app/api/cron/sweep-orphan-uploads/route.ts`), a nonzero
`failedCount` has exactly two causes, both visible in the reconciliation
loop at `orphan-upload-sweep.ts:400-421`:

1. **`error` was non-null on the batched `remove()` call** (`:414-417`,
   message `"Not confirmed removed (error)"`) - a real removal failure
   (permissions, a revoked service-role key, a genuine Storage error). This
   is the one cause that is a real defect signal.
2. **`error` was null but the requested path was simply absent from
   `removedNames`** (`:414,418`, message `"Not confirmed removed (object
   was not present in the removal response - possibly already deleted by a
   concurrent sweep)"`). The code's own comment names the concurrent-sweep
   race as the expected cause, and section 3 below adds a second,
   structural cause the comment does not name explicitly.

If gating fires on cause 1, the failure is real: on a schedule, with no PR
and no human watching the run, the only description this checkout's own
comments give of "what happens" is that GitHub sends its default
failed-run-email (see section 1) - there is no further escalation, retry,
or paging step in this workflow or its siblings. What the recipient "does
about it" is not specified anywhere in this repo I could find
(`grep -rn "runbook\|on-call\|escalat" .github .github/workflows docs/loop 2>/dev/null`
returns nothing under `.github`), which is itself worth naming as a gap
rather than assuming a runbook exists.

If gating fires on cause 2 for the concurrent-sweep sub-case, it is
transient by the code's own account and self-heals: the object is already
gone, and the "failure" is a bookkeeping artifact of two ticks racing on
the same prefix-segment, not a defect requiring action. Alerting on it
trains the reader to distrust the one signal this deployment has - exactly
the risk the row itself names ("poisons the only outbound alert").

Distinct from `failedCount`, `listingErrors` (`orphan-upload-sweep.ts:152-160`,
surfaced at `route.ts:141` and checked at `sweep-orphan-uploads.yml:145-147`)
is **already** kept separate from `failedCount` and is **not** part of this
row's scope - it is a warning-only signal today and the row does not ask to
touch it. It is the one condition the code explicitly calls "a DIFFERENT
failure mode than budget exhaustion" (`orphan-upload-sweep.ts:154-159`), and
a real listing failure (wrong bucket, revoked key, a policy change,
per `sweep-orphan-uploads.yml:136-138`) would likely correlate with, but is
counted independently from, `failedCount`.

---

## 3. Can `failedCount` be non-zero for reasons that are not defects?

Yes, and there are two distinct non-defect causes, one already named in the
code and one that is structural and not named as such anywhere in the
comments:

1. **The concurrent-sweep race**, named explicitly at
   `orphan-upload-sweep.ts:418` and in the workflow's own header
   (`sweep-orphan-uploads.yml:27-31`, "a manual curl or a second automation
   hitting the same endpoint is a separate, unsolved overlap case"). The
   `concurrency:` block (`:32-34`) only serializes overlapping *scheduled/
   dispatch* runs of this one workflow; it does nothing about a manual
   `curl` against the same CRON_SECRET-guarded endpoint, which the header
   comment names as a real, unsolved possibility.

2. **The unmeasured `remove()` response shape** - this is the larger and
   more important one, and it is the entire reason `V3` exists and blocks
   this row. `OrphanSweepResult`'s doc comment at
   `orphan-upload-sweep.ts:161-168` states plainly: "the SDK's real
   `remove()` response shape for a named delete is unmeasured in this
   checkout, and this module accepts either shape defensively" (leaf name
   via `matchedByLeafName`, or full path via `matchedByFullPath`,
   `:400-421`). If the live SDK returns a *third* shape neither counter
   recognizes, **every genuinely successful deletion** is reconciled into
   `failed`, not just the occasional race. That would make `failedCount`
   nonzero on essentially every tick that deletes anything at all - not a
   rare transient blip but a systematic false positive. `V3`
   (`docs/backlog.yml:29-39`, state `verification`) exists precisely to
   read "the first production tick's raw body" and settle which shape the
   live SDK uses; until that lands, whether nonzero `failedCount` means
   anything at all is unknown, not merely unconfirmed at the margins.

Both causes are non-defect causes of a nonzero count; the code gives no
example of a defect-only path to a nonzero `failedCount` that isn't also
reachable by one of these two (a real permission/policy failure would also
show up, but nothing in the reconciliation logic can currently distinguish
"real failure" from "already gone" or "unrecognized shape" - they all land
in the same `failed` array with only the error string differing, and the
workflow script only reads the count, never the per-item error text
`sweep-orphan-uploads.yml:74-98`).

---

## 4. Blast radius of a red workflow here

Checked, not assumed, per the brief's instruction:

- **No other workflow depends on this one's status.** `grep -n "needs:\|workflow_run" .github/workflows/*.yml`
  returns no matches referencing `sweep-orphan-uploads` (the only hits are
  unrelated `jq` filters inside `unattended-runs.yml` matching the literal
  substring `status` in JSON field names, not a `workflow_run` trigger).
- **No badge references it.** No `README.md` exists at the repo root to
  check (`grep -rn "badge" README.md` produced no output because the file
  itself was not found in this pass's listing) and no other `.md` under
  `docs/` embeds a workflow-status badge for this file
  (`grep -rln "sweep-orphan-uploads" --include=*.md .` returns only
  `docs/a29-architecture.md`, `docs/backlog-reconciliation-2026-09-21.md`,
  `docs/BACKLOG.md`, and `docs/backlog.yml` - all prose references, none a
  badge image).
- **No CODEOWNERS file exists** (`find . -maxdepth 1 -iname CODEOWNERS`
  returns nothing) to require a review gated on this workflow.
- **Migrations do not re-trigger from this file.** The repo's migrations
  auto-apply via `.github/workflows/supabase-migrations.yml`, whose trigger
  (`:14-19`) is `on: push: branches: [main]: paths:
  ["supabase/migrations/**", ".github/workflows/supabase-migrations.yml"]`.
  Editing `sweep-orphan-uploads.yml` does not match either path, so a push
  that only touches the sweep workflow does **not** re-run the migrations
  workflow. This is a real check against the "a workflow-level change is
  not automatically inert" caution in the brief, and for this specific file
  the caution does not apply - but it was worth checking rather than
  assuming, since the two workflows share a secrets store and a repo.
- **`vercel.json`'s only cron entry is `/api/cron/run-schedules`**
  (`cat vercel.json`) - the sweep endpoint is invoked *only* by this GitHub
  Actions workflow, never by a Vercel Cron entry, confirming the workflow
  file's own header claim (`sweep-orphan-uploads.yml:3-8`) that "this
  workflow is the only thing that ever revisits" the orphaned objects.
- **Not checked, and not checkable from this repo: branch-protection
  rules.** Whether `sweep-orphan-uploads` is (or could be) registered as a
  required status check on `main` is a GitHub repository setting, not
  something stored in the tree - this environment has no `gh` CLI
  (`docs/loop/this-repo.md` section 5), so it cannot be queried locally.
  Recorded as residual 3 (section 6) rather than assumed either way. Note
  this workflow's only triggers are `schedule` and `workflow_dispatch`
  (section 1) - GitHub does not attach a schedule-only workflow's run to
  any specific commit's PR checks, so even if some other run of this
  workflow's *name* were listed as required, a scheduled failure would not
  block a pull request the way a `pull_request`-triggered check would. This
  is a reading claim about GitHub Actions' own semantics, not something
  this checkout can execute, and the owner should still confirm it via the
  web UI if branch protection is ever suspected to reference this workflow.

**Net finding for this section:** the blast radius of a red run, as far as
this repo's own files show, is confined to the workflow's own run history
and whatever the GitHub default failure-email produces - nothing else in
this tree reads, gates on, or re-triggers from this workflow's pass/fail
state. The one piece that stays open is whether that default email actually
reaches anyone (residual 2) and whether a repo setting neither of us can see
from here changes that (residual 3).

---

## 5. Is it genuinely one line?

**No - not even confined to this file.** Two separate reasons:

**(a) Within the workflow file, it is a two-line change to a three-line
block, not one line.** The block that would need to change is
`sweep-orphan-uploads.yml:132-134`:

```
          if [ "$failedCount" != "0" ]; then
            echo "::warning::failedCount is nonzero this tick ($failedCount) - logged for the post-deploy measurement in Ruling 1, not failing this workflow."
          fi
```

The minimal mechanical diff, matching the style already used two blocks
above it for the `totalUserPrefixes === null` case (`:127-130`), is:

```
          if [ "$failedCount" != "0" ]; then
            echo "::error::failedCount is nonzero this tick ($failedCount) - failing this workflow (Ruling 1 gating enabled)."
            exit 1
          fi
```

That changes the existing `echo` line's annotation level and message, and
adds one new `exit 1` line - one line changed plus one line added, not a
single-line edit. Small and mechanical, yes; literally "one line," no.

**(b) The row's own premise - that this is a change "an agent makes here,"
confined to the workflow file - is contradicted by the fact that the
observational-only behavior is asserted as a named, binding ruling in the
comments of three separate files, not just this one.** "RULING 1" is stated,
near-verbatim, in:

- `.github/workflows/sweep-orphan-uploads.yml:60-67` ("does NOT fail this
  workflow in this first deployment... this workflow only reads
  `failedCount` to log it for that purpose")
- `src/app/api/cron/sweep-orphan-uploads/route.ts:26-32` ("the
  delete/failure accounting in the response body is OBSERVATIONAL ONLY in
  this first deployment... only the `failedCount` is not wired to the
  calling workflow's exit code")
- `src/lib/orphan-upload-sweep.ts:13-20` ("the delete/failure accounting
  below ships OBSERVATIONAL ONLY... the caller (the route) does not fail
  the workflow's exit code on a nonzero `failedCount` in this first
  deployment")

If only the workflow YAML is edited, these two `.ts` file comments become
false the moment the edit lands - they would keep asserting "does not fail
the workflow" about a workflow that, by then, does. That is exactly the
stale-doc failure mode this repo's own `AGENTS.md` and `DEV_LOOP.md` warn
about generally, and it would be created by "the one-line edit" itself, not
found later. So a scoped N3 build, whenever it is unblocked, has a file set
of at least these three files' comment blocks, not one - none of them are
in this document's own write set, and none were touched by this pass.

---

## 6. Residual register and recommendation

| # | What is not settled | Owner | Instrument | Object / direction of failure | Step that measures it |
|---|---|---|---|---|---|
| 1 | Whether the live Supabase SDK's `remove()` response for a named delete is reconciled by `matchedByLeafName` or `matchedByFullPath` (or neither) - decides whether nonzero `failedCount` is ever meaningful | Whoever closes `V3` (currently unowned, state `verification`) | The first production tick's raw JSON body in the GitHub Actions log (`docs/backlog.yml:37`, `V3`'s own instrument) | Object: `matchedByLeafName` / `matchedByFullPath` counts in that one response body. Failure direction: if both stay 0 while `deletedCount > 0`, the reconciliation logic itself is broken and `failedCount` is meaningless until fixed - gating must not ship before this is read | The already-queued `V3` row; `N3` is `blocked_by: ['V3']` in `docs/backlog.yml:80` and must stay blocked until V3 closes |
| 2 | Whether GitHub's default failed-workflow-run email is actually enabled and reaches anyone for this repository - the comments assert it is "the only alert" but nothing in this checkout can confirm the setting is on | Repo owner | GitHub web UI (repo Settings > Notifications, or the owning account's own notification preferences) - no `gh` CLI available here (`docs/loop/this-repo.md` section 5) | Object: the account's/repo's notification configuration. Failure direction: if the email is not actually enabled, gating produces a red badge nobody is emailed about, and the row's own premise ("the only outbound alert") is false | One manual `workflow_dispatch` run engineered to fail (or the next genuine failure), followed by checking whether an email arrived |
| 3 | Whether `sweep-orphan-uploads` (the workflow name) is or could be registered as a required branch-protection status check on `main` | Repo owner | GitHub web UI (Settings > Branches > main) or the GitHub REST API via `curl` (no `gh` CLI here) | Object: `main`'s branch-protection required-checks list. Failure direction: if it is ever added there, this section's "confined blast radius" finding no longer holds and red runs would block merges, not just sit unread | A one-time owner check before N3 ships, and again if branch protection rules are ever changed |
| 4 | Whether, once V3 answers reason 1, a bare nonzero-count gate (vs. a threshold across consecutive ticks) is the right rule, given the still-real concurrent-sweep race named at `orphan-upload-sweep.ts:418` and `sweep-orphan-uploads.yml:27-31` | Whoever scopes/implements N3 after V3 closes | Multiple ticks' worth of Actions run logs (`failedCount` trend across ticks), read the same way `V3` reads the first one | Object: the sequence of `failedCount` values across several ticks. Failure direction: gating on a single tick's count re-creates the exact single-tick race the code's own comment names, alerting on a self-healing condition | The N3 implementation itself, once unblocked - this document does not resolve it, only names it as the open design question the next pass must answer |

**Recommendation: leave it alone.** `N3` should stay `blocked_by: ['V3']`
exactly as `docs/backlog.yml:80` already has it, and no code or workflow
edit should ship yet. The row's own stated risk - "a wrong guess in either
direction poisons the only outbound alert this deployment has" - is
confirmed, not merely repeated, by this pass: residual 1 shows a wrong
guess could make `failedCount` permanently and systematically nonzero
(false positives on every deleting tick), and section 2 shows the workflow
has no distinction today between "a real failure" and "an artifact of a
known race," so gating now cannot tell them apart. When `V3` closes, the
recommendation is **ship with a threshold**, not a bare one-tick gate: the
concurrent-sweep race (residual 4) is a real, code-acknowledged, self-
healing condition independent of whatever `V3` finds, so even a confirmed-
correct reconciliation rule would still alert on an occasional single-tick
race if gated on one tick alone. Whoever takes N3 next should also update
the three comment blocks named in section 5(b), not only the workflow YAML,
so the shipped behavior and the code's own binding-ruling comments do not
contradict each other the moment the change lands.

---

## Verification of this document

- Byte check: `tr -d -c '\000' < docs/n3-scope.md | wc -c` must return `0`
  (no NUL bytes, per `src/source-bytes.structure.test.ts`).
- ASCII check: this file was written in plain ASCII throughout (no
  em/en-dashes, curly quotes, or other non-ASCII punctuation); verified by
  running the byte/structure tests below rather than by eye alone.
- Gates run for this pass: `npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`,
  exit code and `git status --short` recorded in the hand-off message, not
  in this file, since this file's own byte content is part of what is being
  checked.
