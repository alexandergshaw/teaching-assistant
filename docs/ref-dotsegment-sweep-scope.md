# Scope: REF-DOTSEGMENT-SWEEP

Backlog row: REF-DOTSEGMENT-SWEEP (docs/BACKLOG.md:183). Branch main, HEAD
61bdf2ce (`git rev-parse --short HEAD`). READ-ONLY scoping pass; writes no
production code. The committed `encodeRefSegment` guard this sweep routes
through landed in ancestor 41cde1e3 (`git log --oneline -1 41cde1e3`:
REPO-GRADES-BRANCH-MERGE-CHECK Wave 1) and is unchanged since. Every quantity
names the command that produced it; every citation was opened. This is a
hardening/bug-fix chunk, not a feature a user reaches - no LEVERAGE CLAIM is
owed (fired trigger: security hardening of a parser, no new capability).

## 0. One-line statement

`encodeURIComponent` neutralises `../` and a leading `/` (both become `%2F`),
but it leaves a BARE `.` or `..` untouched, and the WHATWG URL parser inside
`fetch` then collapses that bare dot-segment when it sits in a PATH position - a
`ref`/`branch` of `..` turns `/repos/o/r/git/ref/heads/..` into
`/repos/o/r/git/ref/`, an authenticated call aimed one level up from where the
caller intended. The committed `encodeRefSegment` (src/lib/github-ref-name.ts:56-60,
landed by branch-merge Wave 1 at 41cde1e3) TRIMS and THROWS on a bare `.`/`..`
and is the canonical guard; the sweep routes the raw PATH sinks through it, and
LEAVES the QUERY sinks (where the attack is not reachable) with a stated reason.

## 1. MEASUREMENT RECONCILIATION - the row's count is wrong, and I am not adopting it

The row (and the PARSEREPOREF scope section 7 it inherits from) says "14 sinks"
but LISTS 15 line citations, and the real tree has 16 ref/branch
`encodeURIComponent` sinks. Measured, not recalled:

Command: `grep -rn "encodeURIComponent" src/lib/github*.ts`, then each hit
classified by its ARGUMENT (ref/branch vs owner/repo/username/path/sha/workflowRef)
and by its URL POSITION (path segment vs query string). Full output was read.

- The row's 15 listed citations:
  actions.ts:68,120 (2); collab.ts:86 (1); copy.ts:47,159,177,337,385 (5);
  branches.ts:7,20,35 (3); digest.ts:445 (1); files.ts:72,113,134 (3) = 15,
  described as "14". The prose figure and the citation list disagree by one in
  the source row.
- The tree has a SIXTEENTH ref/branch sink the row omits:
  **src/lib/github.copy.ts:262** `encodeURIComponent(sourceBranch)` in
  `copyPathsToRepo` (`/git/trees/${encodeURIComponent(sourceBranch)}?recursive=1`)
  - a PATH sink, user-influenced, structurally identical to copy.ts:47 which the
  row DID list. Omitting it would ship the same hole in the sibling function.

Per "refuse a ruling you can disprove": the build triages 16 sinks, not 14.
The discrepancy is recorded, neither figure adopted silently.

Three `encodeURIComponent` calls in these files are ref/branch-SHAPED-adjacent
but OUT of this sweep's object class, listed here so the build does not wrap them
by reflex:
- collab.ts:38 `encodeURIComponent(username)` - a collaborator login, not a ref.
- copy.ts:343 `encodeURIComponent(headSha)` - a GitHub-returned 40-hex SHA.
- files.ts:7 `encodePath` / :78 - a file PATH (its own splitter), not a ref.
And owner/repo sinks (invitations.ts:30,45; the owner/repo in every path) are
PARSEREPOREF-TRAVERSAL's object, not this one.

One ADJACENT path-collapse finding that is NOT a ref/branch and is flagged, not
silently folded: see section 7 (actions.ts:105 `workflowRef`).

## 2. The core triage: PATH vs QUERY, then provenance (per sink)

The attack requires BOTH (a) the value in a PATH segment (query values never
collapse the path) AND (b) a reachable value of exactly `.` or `..`. Each sink
is classified on both axes. The intended-pathname proof is the WHATWG rule:
`new URL("https://api.github.com" + path)` collapses a bare dot-segment; a `/`
inside the ref is already `%2F` (encodeURIComponent encodes it) so a multi-segment
ref like `feature/..` becomes ONE opaque segment `feature%2F..` and does NOT
collapse - only a value that is exactly `.`/`..` after trim is dangerous, which
is precisely what `encodeRefSegment` throws on.

### 2.1 PATH sinks, USER-INFLUENCED, reject-testable -> ROUTE through encodeRefSegment (7)

Each is reached by a server action whose `catch` returns `err.message` (verified
below), so `encodeRefSegment`'s thrown `Error("That is not a valid branch name.")`
folds into the existing user-facing error path with ZERO caller change. These 7
are the sinks whose guard is LOAD-BEARING on the production path - a bare `.`/`..`
reaches this sink first (for its ref value), so removing the guard is observable
and a per-sink sabotage reddens the sink's own isolated assertion (section 5).
Three further PATH sinks are ALSO routed but their throw is unreachable or
shadowed by an earlier guard on the same value (copy.ts:385, files.ts:113,
files.ts:134); they move to the defense-in-depth group in 2.2.

| # | sink (file:line) | expr today | ref value & provenance | action wrapper (try/catch -> err.message) |
|---|---|---|---|---|
| 3 | branches.ts:7 | `/git/ref/heads/${encodeURIComponent(fromBranch)}` | `fromBranch` typed by instructor | createBranchAction github-repos.ts:153-165 (:162 catch) via createBranch :160 |
| 4 | branches.ts:20 | `/git/refs/heads/${encodeURIComponent(branch)}` | `branch` typed by instructor | deleteBranchAction github-repos.ts:167-178 (:175 catch) via deleteBranch :173 |
| 6 | collab.ts:86 | `/branches/${encodeURIComponent(branch)}/protection` | `branch` typed in OrgManagementPanel.tsx:301 / workflow step | setBranchProtectionAction github-repos.ts:572-586 (:583 catch) via :581 |
| 7 | copy.ts:47 | `/git/trees/${encodeURIComponent(branch)}?recursive=1` | `branch = opts.sourceBranch \|\| sourceRepo.defaultBranch` (copyRepo) | copyRepoAction github-repos.ts:92-105 (:102 catch) via :100 |
| 10 | copy.ts:262 | `/git/trees/${encodeURIComponent(sourceBranch)}?recursive=1` | `sourceBranch = opts.sourceBranch \|\| sourceRepo.defaultBranch` (copyPathsToRepo) | copyPathsToRepoAction github-repos.ts:107-119 (:117 catch) via :115 |
| 11 | copy.ts:337 | `/git/ref/heads/${encodeURIComponent(destBranch)}` | `destBranch = opts.destBranch \|\| destRepoInfo.defaultBranch` | copyPathsToRepoAction (as above) |
| 13 | digest.ts:445 | `/zipball/${encodeURIComponent(branch)}` | `branch = ref \|\| defaultBranch`; `ref` from getRepoZipAction github-repos.ts:891 (user `branch` arg) and copy.ts:101,297 (`sourceBranch`) | getRepoZipAction github-repos.ts:883-... (:887 try) via :891; src/app/actions/github-content.ts:36 passes no ref (default only) |

`branch`/`fromBranch`/`destBranch`/`sourceBranch` are only `.trim()`ed before
reaching the sink; `normalizeTargetBranch` is applied at exactly ONE site in the
whole tree - github-repos.ts:709, the grade path - and NONE of the 12 routed
sinks go through it (`grep -rn "normalizeTargetBranch" src/` -> one production
call, :709). So the raw dangerous value reaches the sink today.

Mixed-provenance note for #11/#13: when the user omits the optional branch, the
value falls back to a GitHub-returned `defaultBranch` (safe by construction);
when the user supplies it, it is user text. Guarding is correct because the WORST
case is user-controlled, and the throw is unreachable for the fallback value.

### 2.2 PATH sinks, ROUTED but throw UNREACHABLE or SHADOWED -> ACCEPT-only, no reject/sabotage (5)

These 5 are routed through `encodeRefSegment` for uniformity, but a bare `.`/`..`
can NEVER reach the sink along the production path - either the value class
excludes `.`/`..` (GitHub-assigned), or an EARLIER guard on the SAME value throws
first. So the guard here is defense-in-depth: its throw is dead code on every
reachable call. They are instrumented by ACCEPT rows only; no REJECT row and no
per-sink sabotage is possible through the real caller, and section 5 states that
per sink.

| # | sink | ref value | why the throw is unreachable/shadowed on the production path |
|---|---|---|---|
| 8 | copy.ts:159 | `/git/ref/heads/${encodeURIComponent(destRepo.defaultBranch)}` | `destRepo` is the return of createRepo/createOrgRepo (copy.ts:85-96); its `defaultBranch` is GitHub-assigned, never `.`/`..` |
| 9 | copy.ts:177 | `/git/refs/heads/${encodeURIComponent(destRepo.defaultBranch)}` | same GitHub-assigned `destRepo.defaultBranch` |
| 12 | copy.ts:385 | `/git/refs/heads/${encodeURIComponent(destBranch)}` | SAME `destBranch` value (copy.ts:294) is guarded ONE call earlier at copy.ts:337 (#11, read-ref); on a bare `.`/`..` destBranch, :337 throws INVALID before control reaches :385, so :385's own guard never fires on the real path |
| 15 | files.ts:113 | `/git/ref/heads/${encodeURIComponent(branch)}` | `commitTreeChanges` is PRIVATE (files.ts:105); its only callers deletePaths (:169) and movePaths (:206) each call `getRepoTree` FIRST (files.ts:157,:185) -> `getRepoTreeWithMeta:39` -> `encodeRefSegment(branch)`, so a bare `.`/`..` branch is rejected UPSTREAM at :39 and can never reach :113 |
| 16 | files.ts:134 | `/git/refs/heads/${encodeURIComponent(branch)}` | SAME `branch` value; shadowed both by the upstream :39 guard (as #15) and by the same-function read-ref at :113 which fires first |

Decision: ROUTE all five through `encodeRefSegment` anyway. Rationale: the throw
is PROVABLY unreachable for the value that reaches each sink (no regression - the
task's "throw on a legitimate API-returned ref is a REGRESSION" hazard does not
bite, because the dangerous value either cannot occur or is already rejected
earlier); and routing keeps each consistent with the live ref interpolations
beside it (#8/#9 with #7 in copyRepo, #12 with #11 in copyPathsToRepo, #15/#16
with the Wave-1 `encodeRefSegment` at files.ts:39/:54), so a future reader does
not have to reason about why two adjacent ref interpolations differ. This is a
deliberate, justified consistency choice, not a blanket wrap. The instrument
consequence is that NONE of these five can be shown load-bearing by a per-sink
sabotage - which is precisely the defense-in-depth property, and the reason they
are NOT in the live reject set of 2.1.

If the checker disagrees and wants zero guard on #8/#9 (GitHub-returned), the
fallback is LEAVE them with the one-line justification "defaultBranch is
GitHub-assigned, cannot be `.`/`..`". Either way the behaviour is identical
because the throw never fires; the only delta is two lines of diff. (FORK A, low
cost - see section 6.1.) #12/#15/#16 should stay routed regardless, because the
upstream/earlier guard on the same value is the live protection and the second
guard is a cheap, harmless belt-and-suspenders on the identical value.

### 2.3 QUERY sinks -> LEAVE, with justification (4)

| # | sink | expr today | why the attack is NOT reachable |
|---|---|---|---|
| 1 | actions.ts:68 | `...?per_page=1&branch=${encodeURIComponent(branch)}` | ref is in the QUERY string |
| 2 | actions.ts:120 | `...?branch=${encodeURIComponent(ref)}&event=...` | ref is in the QUERY string |
| 5 | branches.ts:35 | `/commits?per_page=${perPage}&sha=${encodeURIComponent(ref)}` | ref is in the QUERY string |
| 14 | files.ts:72 | `/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}` | ref is in the QUERY string |

Proof the attack cannot reach the path: `new URL("https://api.github.com/repos/o/r/actions/runs?branch=..").pathname`
is `/repos/o/r/actions/runs` and `.search` is `?branch=..` - a bare `..` in a
QUERY VALUE never participates in path dot-segment collapse, and
`encodeURIComponent` already encodes every query-structural character
(`& = # / ? ` space). So the value is inert: GitHub filters on a branch literally
named `..` (which does not exist) and returns an empty set. No path steering, no
parameter injection.

Decision: LEAVE all four. Routing them through `encodeRefSegment` would add a
THROW on a bare `.`/`..` that buys NO path-steering protection (the bug is not
reachable here) while introducing a new failure on an input that is currently
harmless - a net regression risk for zero security gain. putFile (#14) has NO
path ref sink at all: its WRITE at files.ts:78 puts `branch` in the JSON BODY
(:85), not the URL, so the only URL ref is this inert query on the existence
check.

### 2.4 Summary count

16 ref/branch sinks = 7 user-influenced PATH, reject-testable (ROUTE; 2.1) + 5
defense-in-depth PATH, ACCEPT-only / throw unreachable or shadowed (ROUTE; 2.2)
+ 4 QUERY (LEAVE; 2.3). 12 routed, 4 left. The 7/5 split is the ONLY change from
the round-1 10/2 split: copy.ts:385, files.ts:113 and files.ts:134 moved from
reject-testable to defense-in-depth because an earlier guard on the same value
(copy.ts:337; getRepoTreeWithMeta:39) makes their own throw dead on the
production path. Routing of all 12 is unchanged.

## 3. No second export is needed (task point 2)

Every ROUTED sink lives in a function whose nearest server-action caller has a
`try { ... } catch (err) { return { error: err instanceof Error ? err.message
: ... } }` wrapper (each cited in the 2.1/2.2 tables and opened:
github-repos.ts:102,117,162,175,583,887; github.ts:430,456). A thrown
`encodeRefSegment` INVALID therefore surfaces as a clean error string, exactly
as it already does for the Wave-1 sinks files.ts:39/:54. So NO sink needs a
"reject-to-null/skip" non-throwing variant, and `github-ref-name.ts` needs NO
new export - the sweep IMPORTS the committed `encodeRefSegment` and adds nothing
to that file. (This also keeps github-ref-name.ts out of the sweep's write set,
which matters for section 5.)

The one place a throw's blast radius is worth a sentence: digest.ts:445 is also
reached inside copyRepo (copy.ts:101) and copyPathsToRepo (copy.ts:297) via
`downloadRepoZipball(owner, repo, sourceBranch)`. There `sourceBranch` is the
SAME value already guarded at copy.ts:47/:262 one call earlier, so by the time
control reaches the zipball the value has already passed `encodeRefSegment`
(it throws at the trees call first). The guard at :445 is still added for the
direct caller getRepoZipAction (github-repos.ts:891), which reaches the zipball
without a prior trees call.

## 4. Task point 3 - what Wave 1 already wired in github.files.ts

Measured (`grep -rn "encodeRefSegment\|encodeURIComponent" src/lib/github.files.ts`):
- files.ts:39 (getRepoTreeWithMeta) ALREADY uses `encodeRefSegment` - Wave 1.
- files.ts:54 (getFileText) ALREADY uses `encodeRefSegment` - Wave 1.
- files.ts:72 (putFile existence check, QUERY) still `encodeURIComponent` -> LEAVE (2.3 #14).
- files.ts:113, :134 (commitTreeChanges) still `encodeURIComponent`, PATH -> ROUTE
  as defense-in-depth (2.2 #15/#16; throw shadowed by getRepoTreeWithMeta:39 upstream).

So of the THREE sinks the row names in files.ts (:72,:113,:134), NONE is already
routed; :39 and :54 ARE routed but are not in the row's list. The build must NOT
re-touch :39/:54 (double-wrap would be `encodeRefSegment(encodeRefSegment(...))`).

## 5. Instruments (machine-verifiable; network blocked)

New test file: **src/lib/github.refs.sweep.ref-traversal.test.ts** (a `.test.ts`
leaf collected by vitest's `src/**/*.test.ts` glob; node-env, no network, no
component render). Template already in the tree:
src/lib/github.files.ref-traversal.test.ts - it mocks `fetch` (NEVER `@/lib/github`),
stubs `GITHUB_TOKEN`, and asserts on `new URL(u).pathname` / `.search`. Copy that
harness. Do NOT import a helper from it (no-cross-test-file-imports lesson);
duplicate the `okJson`/`beforeEach` setup.

### Instrument P (per ROUTED path sink) - URL-construction + reject/accept

Object under comparison: the `pathname` of the URL the sink hands `fetch`,
captured from `fetchMock.mock.calls`. Instrument: the WHATWG `URL` parser.
Direction of failure stated per row.

For EACH of the 12 routed sinks, drive the sink through its EXPORTED lib
function (the production path, not a direct string build), with `fetch` mocked to
return the minimal shape that function needs to proceed:

- ACCEPT row: call with a benign multi-segment ref `feature/x`; assert the
  captured `pathname` equals the intended literal with the ref encoded as
  `feature%2Fx` in the correct segment, and that no OTHER segment moved. Fails if
  the pathname differs. Example anchors (exact intended pathnames):
  - createBranch("o","r","new","feature/x") -> first call pathname
    `/repos/o/r/git/ref/heads/feature%2Fx` (branches.ts:7).
  - deleteBranch("o","r","feature/x") -> `/repos/o/r/git/refs/heads/feature%2Fx`.
  - setBranchProtection("o","r","feature/x",opts) -> `/repos/o/r/branches/feature%2Fx/protection`.
  - downloadRepoZipball("o","r","feature/x") -> `/repos/o/r/zipball/feature%2Fx`.
  - deletePaths/movePaths ("o","r","feature/x",...) -> the ref-read call pathname
    `/repos/o/r/git/ref/heads/feature%2Fx` and the final ref-update
    `/repos/o/r/git/refs/heads/feature%2Fx` (files.ts:113,:134).
  - copyRepo / copyPathsToRepo: mock `getRepo`/create flows via the fetch mock so
    the trees call fires; assert the trees pathname
    `/repos/o/r/git/trees/feature%2Fx` (copy.ts:47,:262). The dest-ref calls
    (copy.ts:159,177,337,385) assert `/repos/<destOwner>/<destRepo>/git/ref[s]/heads/<enc>`.
- REJECT row (ONLY the 7 reject-testable sinks of 2.1; the 5 defense-in-depth
  sinks of 2.2 get NO reject row - see the note below): call the SAME function
  with `..` (and separately `.` and `" .. "`). A bare `rejects.toThrow()` is a
  TAUTOLOGY on every one of these sinks and MUST NOT be used alone: with the guard
  REMOVED, an unguarded collapsed ref still throws DOWNSTREAM anyway (empty tree ->
  "Nothing selected to copy."; a `undefined` sha -> "Could not read the destination
  branch head" / `Could not resolve branch`), so `rejects.toThrow()` stays green on
  an UNGUARDED sink. The assertion must ISOLATE the specific sink, in one of two
  forms by whether a SIBLING fetch precedes the guard:
  - FIRST/ONLY-fetch sinks - branches.ts:7 (createBranch), branches.ts:20
    (deleteBranch), collab.ts:86 (setBranchProtection), digest.ts:445
    (downloadRepoZipball called WITH a bad `ref`, so the `||` getRepo is skipped):
    nothing fetches before the guard, so assert `expect(fetchMock).not.toHaveBeenCalled()`
    AND that the thrown message `=== "That is not a valid branch name."` (the exact
    `INVALID` string, github-ref-name.ts:26). `not.toHaveBeenCalled()` is the
    load-bearing part - it goes false the instant an unguarded collapsed call fires.
    (Mirrors github.files.ref-traversal.test.ts:39-47,58-61.)
  - SIBLING-fetch sinks - copy.ts:47 (copyRepo, preceded by getRepo at :41),
    copy.ts:262 (copyPathsToRepo, preceded by getRepo at :257), copy.ts:337
    (copyPathsToRepo, preceded by getRepo/trees/zipball/blob fetches): a sibling
    fetch fires BEFORE the guard throws, so `not.toHaveBeenCalled()` is false even
    when the guard WORKS and must NOT be asserted. Instead assert (a) the sink's OWN
    collapsed pathname is ABSENT from `fetchMock.mock.calls` - inspect every recorded
    call URL via `new URL(u).pathname` and assert none equals the collapsed form
    from the Instrument O table (e.g. `/repos/o/r/git/trees/` for copy.ts:47/:262,
    `/repos/<destOwner>/<destRepo>/git/ref/` for copy.ts:337) - AND (b) the thrown
    message `=== "That is not a valid branch name."`, NOT a downstream "Nothing
    selected"/"Could not read the destination branch head"/JSON-parse message.
  Direction of failure: the reject row goes red if the sink's dangerous/collapsed
  pathname reaches `fetch`, or if the thrown message is the downstream one (guard
  absent) rather than the exact INVALID string.

NO reject row for the 5 defense-in-depth sinks (copy.ts:159, copy.ts:177,
copy.ts:385, files.ts:113, files.ts:134): along the production caller their throw
is unreachable (GitHub-assigned value, #8/#9) or shadowed by an earlier guard on
the SAME value (copy.ts:337 for #12; getRepoTreeWithMeta:39 for #15/#16), so no
input driven through the real function can make these sinks throw before the
earlier guard does. They are covered by ACCEPT rows only. Attempting a reject row
would either pass vacuously (the earlier guard throws) or require bypassing the
production path - both forbidden. This is the defining difference from 2.1 and the
reason the per-sink sabotage below excludes them.

### Instrument O - the FROZEN raw-danger oracle (not a tautology)

A literal table pairing each dangerous raw ref with the KNOWN-BAD pathname that
UNGUARDED `encodeURIComponent` interpolation produces, measured once with
`new URL`:

| sink shape | raw ref | unguarded pathname (BAD) | intended pathname |
|---|---|---|---|
| git/ref/heads | `..` | `/repos/o/r/git/ref/` | `/repos/o/r/git/ref/heads/<ref>` |
| git/refs/heads | `..` | `/repos/o/r/git/refs/` | `/repos/o/r/git/refs/heads/<ref>` |
| branches/_/protection | `..` | `/repos/o/r/branches/protection` | `/repos/o/r/branches/<ref>/protection` |
| git/trees | `..` | `/repos/o/r/git/` (+`?recursive=1`) | `/repos/o/r/git/trees/<ref>` |
| zipball | `..` | `/repos/o/r/` | `/repos/o/r/zipball/<ref>` |
| git/ref/heads | `.` | `/repos/o/r/git/ref/heads/` | `/repos/o/r/git/ref/heads/<ref>` |

The test asserts (i) each BAD pathname != the intended one (the danger is real),
and (ii) the guarded production function blocks that raw ref before its BAD
pathname is reachable - which, per the Instrument P reject forms, means: for a
first/only-fetch sink, NO fetch fires (`not.toHaveBeenCalled()`) and the throw is
the exact INVALID message; for a sibling-fetch sink, the sink's OWN collapsed
pathname is ABSENT from `fetchMock.mock.calls` and the throw is the exact INVALID
message (sibling fetches on other values may fire). Use `.pathname`/`.search`
equality against the computed intended/collapsed string - NEVER `not.toContain("..")`
(refactor-disarms-tests / the comment at github.files.ref-traversal.test.ts:3-5).

### Instrument Q (per LEFT query sink) - pin the deliberate LEAVE

For each of the 4 query sinks, drive the lib function with ref `..` and assert it
does NOT throw and the captured URL has the UNCHANGED pathname plus `..` in the
query:
- getLatestWorkflowRun("o","r","..") -> pathname `/repos/o/r/actions/runs`,
  search contains `branch=..`.
- findWorkflowRunSince("o","r","..","<iso>") -> pathname `/repos/o/r/actions/runs`,
  search contains `branch=..`.
- listCommits("o","r","..") -> pathname `/repos/o/r/commits`, search contains `sha=..`.
- putFile("o","r","p","c","m","..") -> the existence-check call pathname
  `/repos/o/r/contents/p`, search `?ref=..`.
This pins the decision: a future "helpful" wrap that adds a throw to a query sink
turns these green->red, forcing a re-justification. Direction of failure: the
test goes red if the query value starts steering the path OR if a throw is
introduced.

### Sabotage proofs (the build's sabotage pass MUST show each fails)

- S1 (PER-SINK, for each of the 7 reject-testable sinks of 2.1 INDIVIDUALLY):
  revert that ONE sink's `encodeRefSegment(x)` to `encodeURIComponent(x)`, leaving
  every other sink guarded, and show that sink's reject row goes red AND that it
  reddens for a reason specific to THAT sink:
  - first/only-fetch sink (branches.ts:7, branches.ts:20, collab.ts:86,
    digest.ts:445): the collapsed call now fires, so `not.toHaveBeenCalled()`
    reddens and the thrown message is no longer the INVALID string.
  - sibling-fetch sink (copy.ts:47, copy.ts:262, copy.ts:337): the sink's OWN
    collapsed pathname now appears in `fetchMock.mock.calls`, so the absent-pathname
    assertion reddens, and the thrown message becomes the downstream one.
  A SINGLE file-wide revert is NOT acceptable as the proof: it does not show that
  THIS sink's guard (as opposed to a sibling guard in the same file on the same
  value) is the load-bearing one. That is exactly why copy.ts:385 / files.ts:113 /
  files.ts:134 are NOT in this list - reverting any of them changes nothing
  observable through the production caller, because the earlier guard on the same
  value (copy.ts:337; getRepoTreeWithMeta:39) still throws first. A per-sink
  sabotage that CANNOT redden is the signal a sink is defense-in-depth, not live.
  Restore each sink from a cp-backup, never `git checkout --`
  (sabotage-restore-needs-a-copy lesson).
- S2: in the oracle (Instrument O), break the intended-pathname string so BAD ==
  intended; the "danger is real" assertion goes red - proving the oracle is not a
  tautology.
- S3 (negative, for the LEAVE decision): temporarily wrap a query sink (e.g.
  files.ts:72) in `encodeRefSegment`; Instrument Q's no-throw assertion for that
  sink goes red - proving Q actually guards the LEAVE.

All assertions are a pure call plus `new URL` on a mocked fetch. No live-GitHub
criterion anywhere (docs/loop/this-repo.md section 6: no API keys, network
blocked; vitest.setup.ts throws on real fetch - mock `fetch`, never `@/lib/github`,
tests-are-network-blocked lesson).

## 6. Waves, collision, serialization

One wave; the change is a mechanical per-sink wrap plus one import line per file.

- Wave 1 (only wave): in each of the 6 lib files, (a) ensure
  `import { encodeRefSegment } from "./github-ref-name";` is present (github.files.ts
  already has it at :5; the other 5 add it), and (b) replace `encodeURIComponent(x)`
  with `encodeRefSegment(x)` at the 12 ROUTED sinks only. Add the new test file.
  Leave the 4 QUERY sinks and the 3 out-of-scope sinks untouched.

Write set (7 paths):
- src/lib/github.actions.ts (NOTE: only out-of-scope/query sinks here - :68/:120
  are LEFT; the file is touched ONLY if the checker also wants :105 addressed,
  see 7. If :105 is deferred, github.actions.ts is NOT in the write set.)
- src/lib/github.branches.ts (route :7,:20; leave :35)
- src/lib/github.collab.ts (route :86)
- src/lib/github.copy.ts (route :47,:159,:177,:262,:337,:385)
- src/lib/github.digest.ts (route :445)
- src/lib/github.files.ts (route :113,:134; leave :72; do NOT touch :39,:54)
- src/lib/github.refs.sweep.ref-traversal.test.ts (NEW)

Corrected write set given the triage: github.actions.ts has NO routed ref/branch
sink (both its ref sinks are query -> LEAVE), so absent the section-7 decision it
drops out, leaving a FIVE-file production write set: branches, collab, copy,
digest, files, plus the test.

1000-line ceiling (measured now, `@(Get-Content <file>).Count`): github.actions.ts
295, github.collab.ts 91, github.copy.ts 403, github.branches.ts 45,
github.digest.ts 447, github.files.ts 208. The edits add ~1 import line + 0 net
lines per sink (a same-length token swap), so none approaches 1000.

### Collision and serialization

Working-tree state measured at session start (`git status --short`): NONE of the
github `src/lib` files are modified - all six are committed and unchanged since
41cde1e3 (current HEAD 61bdf2ce), and `src/lib/github-ref-name.ts` is tracked
(branch-merge Wave 1 landed its `encodeRefSegment` at 41cde1e3). So
`encodeRefSegment` is available to import today.

File-set DISJOINTNESS vs the sibling items:
- Intersect sweep's edited paths with PARSEREPOREF-TRAVERSAL's edited paths
  (github.repos.ts, github-ref-name.ts, github-ref-name.test.ts,
  github.repos.parseref-traversal.test.ts). Intersection is EMPTY - the sweep
  edits none of those, and PARSEREPOREF edits none of the sweep's five lib files.
  The sweep only READS github-ref-name.ts (imports encodeRefSegment); it adds
  NOTHING to it.

So the sweep and PARSEREPOREF do not collide by edited path. BUT two shared,
file-list-invisible resources force ordering (DEV_LOOP standing rules,
no-git-stash-under-concurrency, test-paths):
1. github-ref-name.ts is EDITED by PARSEREPOREF (adds `validateGithubOwnerRepo`)
   and IMPORTED by the sweep. Building the sweep against a half-rewritten import
   source is the hazard. The sweep does not NEED PARSEREPOREF's new export (it
   uses the already-committed `encodeRefSegment`), so there is no logical
   dependency - only a file-stability one.
2. `npx tsc --noEmit` has ONE caller (races on tsconfig.tsbuildinfo) and no two
   agents may sabotage-verify on the tree at once.

The BUILD therefore serializes: (a) after branch-merge Wave 1 (DONE, 41cde1e3);
(b) not CONCURRENTLY sabotage-verifying with the PARSEREPOREF build, and
preferably AFTER PARSEREPOREF commits so github-ref-name.ts is stable while the
sweep imports it; (c) behind any other running build (shared tsc/full-test).
Recommended default: serialize the sweep AFTER PARSEREPOREF lands - simplest,
and the two share github-ref-name.ts as import source. (If the loop wants them
concurrent, it is permissible ONLY because the edited paths are disjoint, and
ONLY with the explicit gate that neither tsc/sabotage-verifies while the other
is mid-verify - the cheaper and safer choice is to serialize.)

Directory canary: searched for a src/lib frozen-roots / root-file-count canary
(`grep -rln "readdirSync" src/lib/*.test.ts` + inspection; none freezes the
src/lib root listing or counts github*.ts membership). Adding ONE new `.test.ts`
leaf trips no canary, and the sweep adds no new NON-test root file. If the build
discovers a canary this pass missed, bump the frozen list + its N in the SAME
commit (gate-must-include-directory-canary lesson).

## 6.1 Forks (recommended readings, cost-if-wrong)

- FORK A (minor): route copy.ts:159/:177 (GitHub-returned defaultBranch) or
  leave them. RECOMMENDED: route, because the throw is provably unreachable for a
  GitHub default branch so there is no regression, and it keeps adjacent ref
  interpolations uniform. Cost if wrong (routed but a future refactor feeds a
  user value into destRepo.defaultBranch): none - routing only ever helps. Cost
  of leaving: two adjacent ref interpolations in copyRepo differ with no reason a
  reader can see. Acting on ROUTE; this is the architect's reading, not an owner
  ruling - the only delta either way is two lines and the throw never fires.
- FORK B (scope boundary): whether to address the ADJACENT workflowRef collapse
  (section 7) in this chunk or a separate row. RECOMMENDED: separate row. Cost of
  folding it in: it needs its OWN guard (encodeRefSegment's message "not a valid
  branch name" is wrong for a workflow id, and `..` is a different object), which
  widens this mechanical sweep into a second validator design. Cost of
  separating: one more backlog row. See section 7.

## 7. ADJACENT finding, flagged not folded: workflowRef (actions.ts:105)

`dispatchWorkflow` builds `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowRef)}/dispatches`
(github.actions.ts:105) - a PATH segment. A `workflowRef` of `..` collapses:
`new URL(".../actions/workflows/../dispatches").pathname` = `/repos/o/r/actions/dispatches`.
Provenance: dispatchWorkflowAction (github.ts:782-798, :793) forwards a
user-chosen `workflowRef`; dispatchTestsAction (:805-, :823) uses a
GitHub-derived path OR a user `workflowRef`. So it IS user-influenceable and
path-positioned - SAME dot-segment class, but a DIFFERENT OBJECT (a workflow file
name/id, not a git ref). It must NOT be routed through `encodeRefSegment`: that
guard's policy and error text are ref-specific. It needs its own tiny
"reject bare `.`/`..` workflow id" guard.

Recommendation: a SEPARATE micro-row (WORKFLOWREF-DOTSEGMENT), not this sweep.
Cost if wrong (left unaddressed): an owner-gated typo/`..` targets
`/actions/dispatches` (a 404, not a cross-repo write) - LOW, same owner-gated
defense-in-depth class as the rest. Recorded as residual R3.

## 8. Diagnostics (DEV_LOOP b907ff8e)

Decision: NO new diagnostic/log entry. Justification (stated, not assumed, per
the diagnostics-representation rule):
- Pure parser hardening of existing sinks; no new capability, no new data path,
  no new user-visible surface.
- A rejected ref folds into the EXISTING observable failure: every routed sink's
  action wrapper already returns `err.message` ("That is not a valid branch
  name."), which the instructor already sees for other invalid input. The failure
  is visible today; the fix only makes it fire for `..` as well.
- Provenance is owner-gated (section 2 wrappers all `await requireAppOwner()`),
  so a rejection is overwhelmingly a typo, not an attack - a dedicated
  "rejected-ref" counter would report near-zero and touch files in no gain.

## 9. owns file list (derived)

Command: `grep -rn "encodeURIComponent" src/lib/github*.ts` (classification) plus
the caller greps in section 2 (`grep -rn "<fn>(" src/ | grep -v test`).

EDITED by the build (production):
- src/lib/github.branches.ts (route :7,:20)
- src/lib/github.collab.ts (route :86)
- src/lib/github.copy.ts (route :47,:159,:177,:262,:337,:385)
- src/lib/github.digest.ts (route :445)
- src/lib/github.files.ts (route :113,:134)
- src/lib/github.actions.ts ONLY if FORK B folds workflowRef in (default: NOT edited)

ADDED:
- src/lib/github.refs.sweep.ref-traversal.test.ts (NEW - Instruments P, O, Q)

READ-ONLY dependency (imported, NOT edited):
- src/lib/github-ref-name.ts (encodeRefSegment - committed at 41cde1e3)

READS the edited lib exports AS SOURCE TEXT or mocks them (could go red; the
build MUST run them even though this fix does not edit them). Derived with
`grep -rln "github.copy\|github.branches\|github.collab\|github.digest\|createBranch\|deleteBranch\|setBranchProtection\|copyRepo\|copyPathsToRepo\|downloadRepoZipball\|deletePaths\|movePaths\|commitTreeChanges" src/ --include=*.test.ts`
(the build re-runs this grep and pastes the current output before starting):
- src/lib/github.files.ref-traversal.test.ts (Wave-1 ref tests on the SAME file
  the sweep edits - MUST stay green; the sweep does not touch :39/:54 it covers).
- Any github.copy / github.branches / github.collab / github.digest unit or
  action tests that assert on the URL these functions build or mock these lib
  functions. The build pastes the grep output and confirms each is green; none is
  edited.

The guarded functions change behaviour ONLY when a caller passes a bare `.`/`..`
ref (now throws instead of mis-steering). A benign ref's emitted URL is
byte-identical except `/`->`%2F` was ALREADY the case under `encodeURIComponent`,
so `encodeRefSegment` produces the SAME encoding for every valid ref - no
existing green URL assertion should move. If one does, it was asserting a
dangerous input and is itself a finding.

## 10. Residual register

A residual not written into docs/BACKLOG.md does not exist; all are to be filed
at the build's push, each with owner, instrument, step.

- R1 (QUERY-sink LEAVE, section 2.3): the 4 query sinks (actions.ts:68,120;
  branches.ts:35; files.ts:72) are deliberately NOT guarded. Owner: this sweep's
  Verify pass. Instrument: Instrument Q (pins no-throw + inert query on `..`).
  Step: Verify confirms Q is present and green against the built diff, and
  re-judges that no query sink was wrapped. Record in docs/BACKLOG.md.
- R2 (defense-in-depth sinks, section 2.2): the 5 sinks copy.ts:159, copy.ts:177,
  copy.ts:385, files.ts:113, files.ts:134 are guarded though a bare `.`/`..` can
  never reach them - the value is GitHub-assigned (:159/:177) or an earlier guard
  on the SAME value throws first (copy.ts:337 shadows :385; getRepoTreeWithMeta:39
  shadows :113/:134, and :113 shadows :134). So each throw is dead code on the
  production path and no per-sink sabotage can redden it. Owner: Verify pass.
  Instrument: Instrument P ACCEPT rows for these five sinks (no reject row exists).
  Step: Verify confirms the accept pathname is correct AND re-confirms the
  shadowing (the earlier guard is present and unchanged), so the second guard
  stays a deliberate belt-and-suspenders rather than a silently-dead line that a
  later refactor could delete unnoticed. Record in docs/BACKLOG.md.
- R3 (adjacent workflowRef, section 7): actions.ts:105 collapses on a bare
  `.`/`..` workflowRef; SAME class, different object, needs its own guard. Owner:
  a new backlog row WORKFLOWREF-DOTSEGMENT. Instrument: a URL-construction
  reject/accept matrix on dispatchWorkflow + sabotage. Step: filed by the
  orchestrator when this sweep lands. Record in docs/BACKLOG.md.
- R4 (count correction, section 1): the row says "14", lists 15, true is 16
  (adds copy.ts:262). Owner: the orchestrator reconciling the row at push.
  Instrument: `grep -rn "encodeURIComponent" src/lib/github*.ts` + classification.
  Step: update the REF-DOTSEGMENT-SWEEP row's note to "16 ref/branch sinks: 12
  routed, 4 query left" when the build lands. Record in docs/BACKLOG.md.

## 11. ASCII check

Run before hand-off:
`LC_ALL=C grep -nc '[^ -~\t]' docs/ref-dotsegment-sweep-scope.md` must print `0`.
