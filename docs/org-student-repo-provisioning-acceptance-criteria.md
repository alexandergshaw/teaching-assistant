# Per-student repo provisioning from the Roster column - acceptance criteria

Request (2026-08-17), as revised twice in the same session:

1. "add a button to kick off this process into the organization column of the
   courses table, and be sure to poll and display the status of all invitations"
2. "actually, change this so that there's a button next to each student's
   name/repo in the roster column. this button should prov a new repo in the org
   and add the student as an outside collab"
3. "next to each of these rows in the roster is where the status of the
   invitation should be displayed"

**The revised design supersedes the first.** There is no control in the
Organization column and no bulk kickoff. The unit of action is ONE student:
a button on that student's roster row creates that student's repo and invites
that student, and that same row shows that student's invitation status.

"This process" is the GitHub-Classroom pattern already shipped as the
`assign-student-repos` workflow step: a repo generated from a template into the
course's GitHub org, plus a repo-level collaborator invitation (an
outside-collaborator invite, never an org membership). That step stays exactly
as it is - this feature exposes the same per-student action one student at a
time, from the roster.

## Scope

- F1: the Roster cell's expanded view becomes a per-student table: student,
  GitHub username, target repo, invitation status, action.
- F2: a per-student **provision** button that creates that one repo and sends
  that one invitation, plus the small settings strip its inputs come from.
- F3: invitation status polled from GitHub and displayed on each student's row.
- F4: one canonical repo-naming helper shared by the provisioner and the
  status resolver (today the transform is duplicated in two files).

Out of scope: changing the workflow step, the workflow presets, the
Organization column, or any Supabase schema. No migration. Nothing about org
membership. No bulk "provision everyone" control (the workflow preset already
covers that case, and per-repo invite caps make an unattended sweep the wrong
default - see AC3.7a).

## Reuse survey (vetted - read the code, not just the name)

| Use | Where | Verified |
| --- | --- | --- |
| Per-student provisioning (create repo + invite) | `setupStudentRepoAction(org, templateRepo, prefix, student, username, isPrivate, permission)` - `src/app/actions/github.ts:171` | Read in full. Returns `ClassroomRowResult` = `{repo, created: "created"\|"existed"\|"failed", createError?, invited, inviteError?}` or `{error}`. Already exported through the `src/app/actions.ts` barrel. Re-runs are safe: an "already exists" create error is caught and reported as `existed`, never overwritten. **This action already IS the per-student unit this feature needs - call it directly from the cell. Do NOT write a new provisioning action.** |
| Repo collaborator invite | `setRepoCollaborator` - `src/lib/github.collab.ts:32` | `PUT /repos/{owner}/{repo}/collaborators/{username}`. Already what `setupStudentRepoAction` calls. |
| Listing a repo's direct collaborators | `listRepoCollaborators` - `src/lib/github.collab.ts:13` | `affiliation=direct&per_page=100`, returns `{login, permission}` sorted. Used by the status resolver to distinguish "accepted" from "never invited". |
| Listing an org's repos by name prefix | `listOrgRepos(org, prefix?)` - `src/lib/github.repos.ts` (exported from `src/lib/github.ts:31`) | Already used by `StudentReposCell`'s "Pull repos from org" (REGRESSION entry 52). One call establishes which expected repos exist. |
| Authenticated GitHub fetch | `ghFetch` / `ghJson` - `src/lib/github.repos.ts:28,53`, exported at `:283` | Ordinary named exports (not module-private, as an earlier draft of this table wrongly said - which is exactly why `github.collab.ts:3` can import them). New `github.invitations.ts` imports them the same way. Throws `GithubHttpError` carrying status + headers. |
| Roster parsing | `rosterToRows(text)` / `rosterStats(roster)` - `src/lib/courses-tab-helpers.ts:194,189` | Splits on the LAST `\|`. **Does NOT strip a leading `@` from the username** - `setupStudentRepoAction` does (`username.trim().replace(/^@/,"")`), and `parseRosterLines` (`src/lib/workflows/registry-helpers.ts:231`) does. The status resolver MUST normalize identically or an `@handle` roster row silently never matches its invitation. |
| The repo-name transform | `repoSlug` - `src/app/actions/github.ts:126`, duplicated verbatim at `src/lib/repo-student-bindings.ts:82` | Both read `s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+\|-+$/g,"")`. The duplicate carries a comment explaining it cannot import from a `"use server"` file. F4 fixes this properly. |
| The cell this feature extends | `RosterCell` - `src/app/components/courses/RosterCell.tsx:36` | Read in full. Display state shows `rosterStats` plus View/Hide/Copy/From LMS text buttons and, when expanded, `.rosterPreview` rendering each raw roster line in a `<div>`. **That expanded preview is what becomes the per-student table.** The editor state (the Student / GitHub username row editor) is NOT touched. |
| Poll + persisted rows + cancel idiom | `useCopilotAgents` - `src/app/components/bulk-repo/hooks/useCopilotAgents.ts` | Read in full. `localStorage` seeding in `useState` initializers with a validating parse, write-back effects, `cancelRef`, `checkedAt`, a `setInterval` gated on an `active` flag with `clearInterval` cleanup, and a guard so a poll never overlaps an in-flight check. **Copy this shape.** |
| Template repo picker options | `ownedRepos: string[] \| null` | Already threaded `useCoursesData -> CoursesTable -> CourseRow` (`CourseRow.tsx:64`) and consumed by `RepoCell.tsx:56` as Autocomplete options. Needs one new prop hop into `RosterCell`. |
| The "org action from a course cell" precedent | `StudentReposCell.pullFromOrg` - `RosterCell.tsx:195` | The exact idiom for this feature's guard rails: reads `course.githubOrg`, disables the control and shows "Set the course's Organization first." when it is blank, surfaces the action's error inline in `var(--danger)`, always clears the busy flag. |
| localStorage key convention | `ta-` prefix, e.g. `ta-vc-bulk-copilot-title` | Matches the standing rule that every new control persists across reloads. |

### Deliberately NOT reused

- The `assign-student-repos` workflow step (`src/lib/workflows/registry/steps.github.ts:180`) is left untouched. It calls the same action; duplicating its roster/course-tile fallback into the cell would create a second definition of the same behavior.
- `parseRosterLines` (registry-helpers) is NOT used here. Precisely: the expanded preview this feature replaces does NOT parse at all today - it splits `course.roster` raw at `RosterCell.tsx:132-135`. `rosterToRows` is used only in the EDITOR, on the draft (`:62`). So the new table introduces `rosterToRows` to the display path for the first time, and the reason to prefer it over `parseRosterLines` is consistency with the editor in the same cell. Verified safe: both the current raw split and `rosterToRows` are `split("\n") -> trim -> filter(Boolean)`, so the set of lines shown does not change.

## Constraints that shape the design

1. **`RosterCell.tsx` is 318 lines and holds two exported components.** The
   per-student table, its settings strip and its polling hook go into NEW
   files; `RosterCell.tsx` changes only where it renders `.rosterPreview`.
   Neither `src/app/components/CoursesTab.tsx` (471 lines - measured, note it
   is NOT under `components/courses/`) nor `CoursesTable.tsx` (778) needs to be
   edited at all: `ownedRepos` is already declared on `CourseRowProps`
   (`CourseRow.tsx:64`), destructured at `:107`, and supplied by
   `CoursesTable.tsx`, so reaching `RosterCell` costs one prop at
   `CourseRow.tsx:281` and nothing above it.
2. **`"use server"` files may export only async functions.** Every shared type
   and every pure helper lives in `src/lib/`, never in the action file.
3. **The vitest suite is node-env and collects only `src/**/*.test.ts`.** No
   `.tsx` is ever rendered. Component behavior is verified by reading; the
   testable logic must therefore be pushed OUT of the components into pure
   modules (`src/lib/student-repo-status.ts`), which is where the assertions go.
4. **Rate limits.** A 30-student roster must not cost 60+ calls per poll. See
   F3's call budget.

## F1 - The roster becomes a per-student table

**AC1.1** `RosterCell`'s display state keeps everything it has today: the
`rosterStats` summary line, Edit, View/Hide, Copy, and From LMS, with the same
behavior and the same conditions. The editor state is unchanged.

**AC1.2** When expanded ("View"), the raw-line `.rosterPreview` is replaced by
a real `<table>` with one row per roster entry and these columns, in order:

| Student | GitHub username | Repository | Status | Action |

- **Student** - the roster row's student text, verbatim.
- **GitHub username** - the handle, normalized (leading `@` stripped), or the
  text `Not set` when blank.
- **Repository** - the exact repo name the provisioner will create or has
  created, from `studentRepoName` (F4). Once the repo exists it is a link to
  github.com. It is rendered in the app's monospace treatment, since it is an
  identifier, not prose.
- **Status** - F3's per-row invitation status.
- **Action** - F2's per-student button.

**AC1.3** A roster with zero entries shows the existing "Not set" empty state,
not an empty table.

**AC1.4** The table is horizontally scrollable inside the cell rather than
widening the column; the Roster column's existing `minWidth: 220` is unchanged
so no other column shifts.

**AC1.5** The cell issues **no** GitHub requests on mount or on render, and
none while collapsed. Requests happen only while the roster is expanded. This
is deliberate: the table renders one Roster cell per course, and an on-mount
fetch would multiply every poll by the number of visible rows.

## F2 - The per-student provision button

**AC2.1** Each row's Action cell carries one button whose label states what it
does for that student:

| Row state | Button | Effect |
| --- | --- | --- |
| status not yet resolved | `Create repo and invite` | the safe default - re-runs are harmless (AC2.8) |
| repo does not exist yet | `Create repo and invite` | `setupStudentRepoAction` for this one student |
| repo exists, student not invited | `Invite` | invite only |
| invitation pending or expired | `Resend` (plus `Cancel invitation`) | see AC3.7 / AC3.7a |
| accepted | (no provisioning action) | the repo link is the only affordance |
| no GitHub username | `Create repo` (enabled) | repo only, no invite - see AC2.1a |

**AC2.1a - a student with no GitHub username can still get a repo.** An earlier
draft disabled the button entirely for these rows. That would make this UI
strictly less capable than the workflow step it mirrors:
`setupStudentRepoAction` requires `student.trim() || username.trim()` - either,
not both (`src/app/actions/github.ts:184`) - and gates only the INVITE on a
handle (`:206`, `if (user && created !== "failed")`). The repo is created
regardless, and the `assign-student-repos` step exercises that path today. So
the button reads `Create repo`, runs, and the row afterwards reports the repo
plus `No username`. Only the invite half is unavailable, and the row says so.

**AC2.1b - the state before the first poll resolves.** AC1.5 forbids any
request until the roster is expanded, so on first expand every row's status is
unresolved. The Status column reads `Checking...` (not a state word, so it
cannot be mistaken for one) and the Action column shows
`Create repo and invite`, which is safe in every case because a re-run reports
`Already existed` and re-attempts the invite. Rows restored from `localStorage`
(AC3.9) show their stored state with the stored `checkedAt`, never as fresh.

**AC2.2** The button is unavailable, with a visible one-line reason - never a
`title`-only explanation, and via `aria-disabled` rather than `disabled` so the
reason stays reachable by keyboard (AC5.1) - when:
- the course has no `githubOrg` -> **"Set the course's Organization first."**
  This string is copied EXACTLY from `RosterCell.tsx:275`, which reads "the
  course's", not "this course's". (Note the existing usage sits in
  `StudentReposCell`'s EDITING branch while this one is in the expanded display
  branch, and that code uses `title` in one place; this feature does not - see
  AC5.1.)
- no template repository has been chosen (AC2.3) -> "Choose a template
  repository first.";
- a provisioning call for that row is already in flight (this one may use the
  real `disabled` attribute - it is transient, not a configuration gap).

A missing GitHub username does NOT make the button unavailable - see AC2.1a.

**AC2.3** Above the table sits a compact settings strip supplying the inputs
`setupStudentRepoAction` needs. Each control is seeded from and written back to
`localStorage` under a `ta-roster-provision-<field>-<courseId>` key, so it
survives a reload:
- **Template repository** - MUI `Autocomplete` with `freeSolo`, options
  `ownedRepos ?? []` (the `RepoCell.tsx:56` idiom). Required.
- **Repo name prefix** - text. Defaults on first open to
  `repoSlug(course.courseCode || course.name)`, editable, may be cleared.
- **Student access** - select: `push` (default) / `pull` / `maintain`.
- **Visibility** - select: `private` (default) / `public`.

**AC2.4 - the row is its own confirmation.** Because the repo name in the
Repository column is computed from the live settings strip, the user can read
the exact repo that will be created, for the exact student, before clicking.
There is therefore no confirmation dialog on the create/invite path. `Revoke`
DOES confirm first (AC3.7) because it withdraws access a student may already
be using.

**AC2.5** Clicking calls the existing `setupStudentRepoAction` once, with that
row's student and username and the strip's template/prefix/permission/
visibility. Only that row goes busy; every other row stays interactive.

Per-student clicking makes a write burst *unlikely*, but not impossible, and it
is worth being precise about why rather than claiming the problem away: one
click is already TWO writes (`generateFromTemplate` then `setRepoCollaborator`,
`actions/github.ts:193` and `:208`), the first of which is a content-creating
request under GitHub's separate content-creation limit; AC2.7 adds a status
refresh immediately after; and the 60-second poll runs on the same single
`GITHUB_TOKEN`, once per expanded roster. So the client keeps **one shared
in-flight gate** covering the poll, the per-row refreshes and the provisioning
calls: at most one GitHub-bound request set is in flight at a time, and a
mutation's follow-up refresh resets the poll timer instead of racing it.

**AC2.6** The row reports the outcome from `ClassroomRowResult` in place:
`Created`, `Already existed`, or `Failed: <message>`, plus the invite outcome
(`Invited`, `Invite failed: <message>`, `No username`). Error text from the
action is surfaced **verbatim** - never replaced with a generic message. This
matters most for GitHub's 422 on the 50-invitations-per-repo-per-24-hours cap,
whose own wording is the only useful diagnosis.

**AC2.7** When the call finishes, that row's invitation status refreshes
immediately (AC3.8) rather than waiting for the next poll tick.

**AC2.8** A row whose repo already exists is not blocked from being clicked
again: `setupStudentRepoAction` reports `existed` and re-attempts the invite,
which is precisely how a student who never accepted gets re-invited.

**AC2.9** Provisioning never writes to the course record. The roster text,
`course.studentRepos` and every other stored field are left alone; the repo is
discovered by the status poll, not by mutating the tile. (Whether to bind the
new repo into `course.studentRepos` is a separate decision with its own
column and its own existing merge logic.)

## F3 - Invitation status, polled, on each row

**AC3.1** New `src/lib/github.invitations.ts` exports:
- `listRepoInvitations(owner, repo): Promise<RepoInvitation[]>` -
  `GET /repos/{owner}/{repo}/invitations?per_page=100`, mapped to
  `{id, inviteeLogin, permission, createdAt, expired, htmlUrl}`. **The API's
  source field is `permissions` (PLURAL); the mapped field is `permission`
  (singular).** Reading `raw.permission` yields `undefined` for every
  invitation. `invitee` is nullable in the API schema; such a row maps
  `inviteeLogin` to `""` and is never matched to a student.
- `deleteRepoInvitation(owner, repo, invitationId): Promise<void>` -
  `DELETE /repos/{owner}/{repo}/invitations/{id}` (returns 204, no body).
Both go through the module-private `ghFetch`/`ghJson`, imported from
`./github.repos` exactly as `github.collab.ts` does. Both are re-exported from
the `src/lib/github.ts` barrel with their types.

**AC3.1a - the permission spelling flips between request and response.**
`PUT /repos/{owner}/{repo}/collaborators/{username}` ACCEPTS
`pull | triage | push | maintain | admin` (the `RepoPermission` type the app
already has). The invitation object RETURNS
`read | write | triage | maintain | admin`. `read` is `pull` and `write` is
`push`. `github.invitations.ts` therefore also exports
`invitationPermissionToRepoPermission(p: string): RepoPermission`, mapping
`read -> pull`, `write -> push`, and the three shared spellings to themselves,
with any unrecognised value falling back to `pull` (the least privilege).
Round-tripping a permission string through both endpoints without this mapping
is the single most likely defect in this feature.

**AC3.1b - what the list endpoint actually contains.** The docs describe it as
"all currently open repository invitations". That an ACCEPTED invitation
disappears from the list is an inference from that wording, not a documented
guarantee, and the fate of a DECLINED one is not documented at all. The
`expired` boolean on the response schema implies expired invitations are still
returned, but that too is undocumented. The state machine in AC3.2 must
therefore degrade safely rather than depend on any of it: if an expired
invitation is silently absent from the list, the row falls through to
`not-invited`, whose offered action ("Invite") is exactly the right next step
anyway. Do not write code that asserts an invitation must be present.
Invitations expire after **7 days** (product docs; the REST reference does not
state it), which is worth showing in the panel's help text.

**AC3.2** New pure module `src/lib/student-repo-status.ts` exports the type
`StudentRepoInvitationRow` and a pure function
`resolveInvitationRow(input): StudentRepoInvitationRow` that takes already-
fetched facts and derives the state. No I/O, no imports from action files -
this is the unit under test. States, in strict precedence order (the first
matching row wins):

| # | State | Condition | Label shown |
| --- | --- | --- | --- |
| 1 | `error` | the lookup for this row failed | `Unknown` (+ the message in `detail`) |
| 2 | `no-username` | roster row has no GitHub username | `No username` |
| 3 | `missing` | expected repo not present in the org | `No repo yet` |
| 4 | `expired` | an invitation for the student exists AND is expired (see AC3.2a) | `Expired` |
| 5 | `pending` | an invitation for the student exists | `Pending` |
| 6 | `accepted` | no invitation and the student is a direct collaborator | `Accepted` |
| 7 | `not-invited` | repo exists, no invitation, not a collaborator | `Not invited` |

The label vocabulary is one or two words, matching what products in this exact
domain actually ship: GitHub Classroom uses `Accepted` for this state, and
`Pending` is the near-universal word for an unaccepted invite (GitHub, Vercel,
Slack, Linear, Postman, Notion all use it). `Unknown` rather than a blank or a
stale value for a failed lookup follows Primer's `unavailable` state label,
which exists precisely for degraded reads.

**AC3.2a - do not trust `expired` alone.** GitHub's own UI has a long-standing
defect in which expired repository invitations still render as pending. The
resolver therefore treats a row as expired when EITHER the API's `expired`
boolean is true OR `createdAt` is more than **7 days** before the current time.
`resolveInvitationRow` takes `now: number` (epoch milliseconds) as an explicit
input so this stays a pure function - it must never read the clock itself.

**AC3.2b - a pending row shows its remaining time.** For a `pending` row the
resolver also returns `expiresAt` (`createdAt` + 7 days, ISO), so the table can
show `Pending - expires in 2 days`. This is the single most useful derived
field on the panel and no comparable product surfaces it.

`error` outranks everything because a failed lookup must never be reported as
a confident state. `no-username` outranks `missing` because this row is about
an invitation: a student with no handle cannot be invited no matter what
happened to their repo, and the Repository column already shows the repo's
absence independently.

`student-repo-status.ts` also exports `summarizeInvitationRows(rows)` ->
`{total, counts, text}`, used for the one-line summary above the table.

**AC3.3** Username matching is **case-insensitive** and strips a leading `@`
from the roster side before comparing, because `rosterToRows` does not strip it
and GitHub logins never contain one. A roster row of `Smith, John | @jsmith`
and an invitation for `JSmith` match.

**AC3.4** New `src/app/actions/github-student-repos.ts` (a new file - not
`actions/github.ts`, which is already 862 lines) exports:
- `studentRepoInvitationStatusAction(org, prefix, rosterText)` ->
  `{rows: StudentRepoInvitationRow[], checkedAt: number} | {error}`.
- `resendStudentRepoInviteAction(org, repo, username, permission)` ->
  `{ok: true} | {error}`. Deletes any existing invitation for that user, then
  calls `setRepoCollaborator` to issue a fresh one.
- `revokeStudentRepoInviteAction(org, repo, invitationId)` ->
  `{ok: true} | {error}`.
All three call `requireOwner()` first, like every sibling action. Added to the
`src/app/actions.ts` barrel.

**AC3.5 - call budget, stated honestly.** One status refresh costs:
- `ceil(total org repos / 100)` calls for `listOrgRepos(org, prefix)`. This is
  NOT one call: `listOrgRepos` (`src/lib/github.repos.ts:139-152`) is a page
  loop of up to 10 requests, and its `prefix` is filtered **client-side after
  the fetch** (`:146`), so it does not reduce request count at all. An org
  holding several terms of student repos costs 3-4 calls here every refresh.
- 1 `listRepoInvitations` per roster row whose repo exists.
- 1 `listRepoCollaborators` per row with no matching invitation.

Worst case for a 30-student class in a 300-repo org is about 3 + 30 + 30 = 63
requests per refresh. Against 5,000/hour that is fine for one expanded roster;
it is the reason AC3.6 stops polling rather than the reason to add caching.

**There is no "accepted is terminal, skip it" optimization.** An earlier draft
claimed one. It is removed deliberately, for two reasons: the memory would have
to live somewhere, and `studentRepoInvitationStatusAction` is a stateless
server action whose signature carries no such set; and it is unsound anyway -
a collaborator removed on github.com would read `Accepted` forever, and AC3.9
restores rows across reloads, so the staleness would outlive the session.

**AC3.5a - concurrency and wall clock.** GitHub's "make requests serially
instead of concurrently" guidance is about avoiding secondary limits on
**writes**. A strictly serial refresh at 200-400 ms per round trip would take
6-12 s for 30 students and 20-40 s for 100, inside a single server action, and
this app's server actions run under a page-level `maxDuration` that the courses
page does not declare. Therefore:
- **Reads** (invitations, collaborators) run with a **concurrency of 4**. Far
  below the documented 100-concurrent cap and 900-points-per-minute ceiling,
  and it brings a 30-student refresh under ~3 s.
- **Writes** (the provisioning PUT/POST, resend, revoke) stay strictly serial.
- A refresh processes at most **80 roster rows**; beyond that it returns the
  first 80 rows resolved and a note naming how many were not checked. A silent
  truncation would read as "everyone is fine".

**AC3.6 - first fetch on expand. THIS IS SEPARATE FROM THE POLL AND MUST NOT
BE GATED BY IT.** Expanding the roster triggers exactly one immediate status
refresh, unconditionally - it does not depend on any row already being
`pending`, on stored rows existing, or on auto-refresh being enabled. Collapsing
and re-expanding triggers another.

This AC exists because its absence shipped a dead feature past a fully green
gate. The rules below stop the POLL once there is nothing left to learn; an
earlier draft stated only those rules, and the implementation correctly applied
rule 2 to the initial state as well - where `rows` is `[]`, so nothing is
`pending`, so the timer never armed and no request was ever issued. Every test
passed, every lint and type check passed, and the panel showed "Checking..." on
every row under a summary reading "No students" until the user happened to
find the manual Refresh button. Reachability is not implied by correctness:
trace the path from the control to the request, every time.

**AC3.6a - polling.** Base interval **60 seconds**, in a `useEffect` whose
cleanup clears the timer, plus four rules that between them keep the steady
state near zero. All four govern the RECURRING poll only, never the first
fetch above:

1. **Only while expanded.** Never polls while the roster is collapsed or the
   cell is unmounted.
2. **Stop when there is nothing left to learn.** If no row is `pending`, the
   poll stops entirely - accepted, missing and not-invited states only change
   as a result of an action the user takes in this panel, and those already
   refresh the row themselves (AC3.8). This is the single largest saving.
3. **Pause when the tab is hidden.** A `visibilitychange` listener suspends the
   timer on `document.hidden` and does one immediate refresh on return. This is
   the default behavior of both TanStack Query and SWR, for good reason.
4. **Back off when nothing changes.** After consecutive no-change refreshes,
   step 60 -> 120 -> 180 s, capped at 180. Any change, or a manual refresh,
   resets to 60.

A manual **Refresh** control forces one immediately and is always available.
The dataset stays visible during a refresh - never blanked, never replaced by a
spinner. A `Checked <relative time>` line sits with the summary above the table.

**AC3.6b - a Pause control is required, not a nicety (WCAG 2.2.2, Level A).**
"Pause, Stop, Hide" applies to "any auto-updating information that starts
automatically and is presented in parallel with other content", which is
exactly what a polled status table is. The panel therefore carries a
**Pause / Resume auto-refresh** toggle next to Refresh. Paused is a real state:
the timer stops, the `Checked <time>` line keeps ageing honestly, and manual
Refresh still works. The preference persists per course under
`ta-roster-provision-autorefresh-<courseId>`. This is Level A - it is not
satisfied by the AC3.6 rules that merely make polling less frequent.

**AC3.6a - conditional requests are a deliberate deferral, not an oversight.**
`GET /repos/{owner}/{repo}/invitations` honours `If-None-Match`, and a 304 does
not count against the primary rate limit at all, which would make polling
essentially free. It is NOT implemented here because the ETag would have to be
stored per repo and round-tripped through the client on every call (the server
action is stateless), and AC3.5's budget plus AC3.6's four rules already put a
single expanded roster at roughly 31 requests per minute worst case against a
5,000/hour limit. Recorded so the next person sees a decision rather than a
gap.

**AC3.7 - per-row actions.** A `pending` or `expired` row offers **Resend** and
**Revoke**; a `not-invited` row with a username offers **Invite**. Revoke
confirms first; Resend and Invite do not.

**AC3.7a - there is no resend endpoint.** GitHub's REST API has no operation
that re-sends or extends a repository invitation; `PATCH .../invitations/{id}`
can only change its permission. "Resend" is therefore implemented as
`DELETE .../invitations/{id}` followed by a fresh
`PUT .../collaborators/{username}`, which is the only path the documentation
supports. Each re-invite consumes one of GitHub's **50 invitations per
repository per 24 hours**; when that cap is hit the API answers 422 and the row
surfaces the API's own message verbatim. There is no "resend all" control -
a sweep across a class is exactly the shape that exhausts that cap.

**AC3.8 - freshness after a mutation.** Provision, Resend, Revoke and Invite
each refresh that row's status when they finish, so the table never shows a
state the user just changed.

**AC3.9 - persistence.** The last resolved rows and `checkedAt` are written to
`localStorage` under `ta-roster-provision-status-<courseId>` so an expanded
roster shows last-known status immediately on reopen instead of a blank column
while the first poll runs. The stored value is parsed defensively (the
`useCopilotAgents` validating-parse idiom); a malformed or unrecognised payload
yields an empty list, never a crash. Restored rows are visibly marked as of
their stored `checkedAt`, never presented as fresh.

**AC3.9a - restored rows must be reconciled, or they lie.** The stored list is
keyed only by course, while the table is built from the CURRENT roster. Three
reachable ways for the two to disagree, all of which must be handled:
- A student removed from the roster would render as a ghost row. Restored rows
  are matched to current roster rows by **normalized username**, and any
  restored row with no match is dropped, never rendered.
- A student whose handle was edited would show the old handle's status. Same
  rule handles it: the old key no longer matches, so the row is dropped and
  that student starts unresolved.
- **The prefix is itself persisted and user-editable** (AC2.3), and changing it
  changes every computed repo name at once. The stored payload therefore
  records the prefix it was computed under; on load, a prefix mismatch discards
  the whole stored list rather than showing status for repos that are no longer
  the ones this roster points at.

The parse-and-reconcile step is a pure function in `student-repo-status.ts`
(`parseStoredStatusRows`), not inline in the component, so it is covered by the
node suite.

## F4 - One canonical repo-naming helper

**AC4.1** New pure module `src/lib/student-repo-names.ts` exports:
- `repoSlug(s: string): string` - the transform verbatim, behavior unchanged.
- `studentRepoName(prefix: string, student: string, username: string): string` -
  the naming rule lifted verbatim out of `setupStudentRepoAction`:
  `base = prefix.trim() ? repoSlug(prefix) : ""`,
  `suffix = repoSlug(student.trim() || username.trim()) || "student"`,
  result `(base ? base + "-" + suffix : suffix).slice(0, 95)`.

**AC4.2** `src/app/actions/github.ts` deletes its local `repoSlug` const and
imports both helpers, using `studentRepoName` in `setupStudentRepoAction`. The
repo name it produces for every input is **byte-identical** to today's.

**AC4.3** `src/lib/repo-student-bindings.ts` deletes its duplicated `repoSlug`
and imports the shared one. Its header comment explaining why it was duplicated
is replaced with one naming the shared module. Its existing behavior and its
existing test file are unchanged.

**AC4.4** A frozen literal oracle test pins the transform: a table of inputs to
expected outputs written as literals in the test file, NOT computed by calling
the production function. This is the guard required before consolidating two
implementations - a test that compared the two copies to each other would
become tautological the moment they became one function. The failure it exists
to catch: a drift in the transform silently orphans every repo the workflow
step already created, because the status poll finds a student's repo by
recomputing its name.

## Cross-cutting

**AC5.1 Accessibility.** Each of these is a checkable requirement, not a
principle.

*Table semantics*
- A real `<table>` - never divs with table roles, and never a CSS `display`
  change that would strip the semantics on a narrow column.
- `<th scope="col">` on every column header; `<th scope="row">` on the student
  name cell.
- A `<caption>` naming the table for the course, e.g.
  "Student repository and invitation status for CS 101". It may be visually
  hidden, but it exists.
- No `role="grid"`. A grid is a composite widget that owes the user arrow-key
  navigation; this is a static table with buttons in it.

*The live region*
- The table is **not** a live region. A 60-second poll re-announcing 30 rows is
  unusable, and a live region flattens structure to a text string, losing the
  row and button semantics entirely.
- Exactly one visually hidden `role="status"` region, **present and empty in
  the initial markup** (a region injected along with its content frequently
  fails to announce at all). It receives the one-line summary only.
- Announce only when the counts actually **change** - never on a poll that
  found nothing new. Debounce writes, and clear the region shortly after each
  write so an identical next message still announces.
- Do not move focus on a poll.

*Updating without breaking the reader*
- Update cell text in place; do not replace `<tbody>` wholesale. A full
  re-render drops focus and invalidates the screen reader's buffer.
- Row buttons keep stable identity across refreshes so focus survives one.
- Set `aria-busy="true"` on the table wrapper during a swap, then `"false"`.

*Controls*
- Every control is a real `<button>` with an accessible name that includes the
  student, so a reader does not meet 30 buttons all called "Create repo and
  invite".
- A control that is unavailable because of configuration (no org, no template,
  no username) uses **`aria-disabled="true"`, not the `disabled` attribute**,
  so it stays focusable and can announce its own reason. A control that is
  unavailable only because its own request is in flight may use `disabled`.
- (The surrounding click-to-edit cells being mouse-only is a pre-existing gap
  already recorded in `docs/REGRESSION.md` under the courses-table
  accessibility debt list. This work must not add to it.)

*Colour and contrast*
- Every status carries a **word**. A coloured dot alone fails WCAG 1.4.1 at
  Level A. If a dot or glyph is used it is in addition to the word, and the
  glyph SHAPE differs per state so the column reads without colour at all.
- Status label text meets 4.5:1 against whatever it sits on (its badge fill, if
  it has one - not the page background).

**AC5.1a Error and empty wording.** Row-level failures follow
`[subject] can't [action] because [reason]`, then the fix. No "you"/"your", no
blame, no "invalid"/"failed" where "incorrect"/"unable to" will do, object
names in quotes, one cause per message. Worked examples:
- `"jdoe99" isn't a GitHub account. Correct the username on the roster, then
  invite again.`
- `"asmith" already has access to "cs101-smith-john". No invitation was sent.`
- `GitHub's invitation limit for this repository was reached. Try again in 24
  hours.`

The empty state (roster present, nothing provisioned) is a short titled phrase,
a one-line explanation under about 14 words in active voice, and an action
whose label echoes the title - not a generic "Get started".

**AC5.2 No emojis** anywhere - code, comments, strings, labels.

**AC5.3 File size.** Every file created or modified stays under 1000 lines.

**AC5.4 UI style.** Professional, modern, minimal; reuses `page.module.css` /
`CoursesTable.module.css` classes and the MUI components the surrounding cells
already use. No new colour system, no icon font, no new dependency.

## Frozen signatures

These are the contract between the three waves. An adversarial review found
that without them the plan's claim of concurrent waves was false - Wave C
cannot learn that `row.repoUrl` or `row.invitationId` exists from prose, and
the test fixtures pin structural details (`collaborators` as logins, not
`RepoCollaborator[]`) that a plausible reading of the reuse survey would get
wrong and fail `tsc` on. Implement these exactly.

```ts
// src/lib/student-repo-names.ts
export function repoSlug(s: string): string;
export function studentRepoName(prefix: string, student: string, username: string): string;

// src/lib/github.invitations.ts
export interface RepoInvitation {
  id: number;
  inviteeLogin: string; // "" when the API's `invitee` is null or absent
  permission: string;   // RAW response spelling from the API's `permissions` field
  createdAt: string;    // "" when absent
  expired: boolean;     // false when absent
  htmlUrl: string;      // "" when absent
}
export function listRepoInvitations(owner: string, repo: string): Promise<RepoInvitation[]>;
export function deleteRepoInvitation(owner: string, repo: string, invitationId: number): Promise<void>;
export function invitationPermissionToRepoPermission(p: string): RepoPermission;

// src/lib/student-repo-status.ts
export type StudentRepoInvitationState =
  | "error" | "no-username" | "missing" | "expired" | "pending" | "accepted" | "not-invited";

export const STATUS_LABELS: Record<StudentRepoInvitationState, string>;
export const INVITATION_EXPIRY_DAYS = 7;

export interface StudentRepoStatusInput {
  student: string;
  username: string;          // raw roster value; may carry a leading "@"; may be ""
  org: string;
  repo: string;              // bare repo NAME, no owner
  repoExists: boolean;
  invitations: RepoInvitation[];
  collaborators: string[];   // LOGINS only - the action flattens listRepoCollaborators
  error?: string | null;
  now: number;               // epoch ms; the resolver never reads the clock itself
}

export interface StudentRepoInvitationRow {
  student: string;
  username: string;              // normalized: "@" stripped, "" when absent
  repo: string;                  // "org/name"
  repoUrl: string;               // https://github.com/org/name
  state: StudentRepoInvitationState;
  label: string;                 // === STATUS_LABELS[state]
  invitationId: number | null;
  invitedAt: string | null;      // the invitation's createdAt, verbatim
  expiresAt: string | null;      // ISO, createdAt + 7 days; null if none/unparseable
  detail: string | null;         // the error message, else null
}

export function resolveInvitationRow(input: StudentRepoStatusInput): StudentRepoInvitationRow;
export function summarizeInvitationRows(rows: StudentRepoInvitationRow[]): {
  total: number;
  counts: Record<StudentRepoInvitationState, number>;
  text: string;
};
export function formatProvisionOutcome(result: ClassroomRowResult, hasUsername: boolean): string;
export function parseStoredStatusRows(
  raw: string | null,
  currentUsernames: string[],
  currentPrefix: string
): { rows: StudentRepoInvitationRow[]; checkedAt: number };

// src/app/actions/github-student-repos.ts  ("use server" - async exports only)
export async function studentRepoInvitationStatusAction(
  org: string, prefix: string, rosterText: string
): Promise<{ rows: StudentRepoInvitationRow[]; checkedAt: number; notChecked: number } | { error: string }>;
export async function resendStudentRepoInviteAction(
  org: string, repo: string, username: string, permission: RepoPermission
): Promise<{ ok: true } | { error: string }>;
export async function revokeStudentRepoInviteAction(
  org: string, repo: string, invitationId: number
): Promise<{ ok: true } | { error: string }>;
```

In the three action signatures `repo` is the **bare repo name** within `org`,
never `owner/name`.

`summarizeInvitationRows(...).text` is a contract, not a suggestion:
`"<n> student[s] - "` followed by the non-zero counts in the fixed order
**accepted, pending, expired, not invited, no repo, no username, unknown**,
joined by `", "`. An empty list yields exactly `"No students"`.

**Two pure helpers exist specifically so the suite can reach them.**
Constraint 3 says testable logic must live outside components;
`formatProvisionOutcome` (AC2.6's verbatim-error line) and
`parseStoredStatusRows` (AC3.9/AC3.9a) would otherwise be stranded inside
`StudentRepoRoster.tsx` where nothing can render them.

## Implementation plan - three disjoint file sets

**Wave A - lib primitives**
- NEW `src/lib/student-repo-names.ts`
- NEW `src/lib/github.invitations.ts`
- EDIT `src/lib/github.ts` (barrel)
- EDIT `src/app/actions/github.ts` (F4.2 only)
- EDIT `src/lib/repo-student-bindings.ts` (F4.3 only)

**Wave B - status resolution + server actions**
- NEW `src/lib/student-repo-status.ts`
- NEW `src/app/actions/github-student-repos.ts`
- EDIT `src/app/actions.ts` (one barrel line)

**Wave C - UI**
- NEW `src/app/components/courses/StudentRepoRoster.tsx` (settings strip +
  per-student table)
- NEW `src/app/components/courses/useStudentRepoInvitations.ts` (poll hook)
- EDIT `src/app/components/courses/RosterCell.tsx` (expanded state renders the
  new table; `ownedRepos` accepted as a prop)
- EDIT `src/app/components/courses/CourseRow.tsx` (pass `ownedRepos` to
  `RosterCell` - it is already in scope at line 107)
- EDIT `src/app/components/courses/CoursesTable.module.css` (table styles)

The three sets share no file. B and C depend on A's and B's exported
signatures, which are frozen in this document, so all three run concurrently.

**Test files (written before implementation, owned by the reviewer - the
implementers may add tests but must not weaken or delete these). They exist and
currently FAIL; make them pass without changing what they assert. If one of
them is wrong, report it rather than editing it - a wrong test here is a
planning defect that needs to be known, not silently fixed.**
- `src/lib/student-repo-names.test.ts` - the frozen naming oracle
- `src/lib/student-repo-status.test.ts` - the state machine and the summary
- `src/lib/student-repo-status.helpers.test.ts` - `formatProvisionOutcome` and
  `parseStoredStatusRows`
- `src/lib/github.invitations.test.ts` - the invitations client and the
  permission mapping

**Known coverage gap, stated rather than hidden.** The three server actions in
`github-student-repos.ts` have no test: they call `requireOwner()` (Supabase)
and mocking that is a bigger fixture than the actions' own logic justifies.
What they do beyond orchestration - name computation, existence matching, state
resolution, storage parsing, outcome formatting - is entirely in the pure
modules above and IS covered. The orchestration itself (including the
DELETE-then-PUT resend order in AC3.7a) is verified by reading in the verify
pass. There is deliberately no `.tsx` wiring test: nothing renders under this
suite, and a source-text assertion would pin spelling rather than behavior.
