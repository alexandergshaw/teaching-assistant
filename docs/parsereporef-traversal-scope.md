# Scope: PARSEREPOREF-TRAVERSAL

Backlog row: PARSEREPOREF-TRAVERSAL (docs/BACKLOG.md:182). Branch main, HEAD
d230ffcb. This is a READ-ONLY scoping pass; it writes no production code. Every
quantity below names the command that produced it; every citation was opened.

## 0. One-line statement of the defect

`parseRepoRef` (src/lib/github.repos.ts:99-106) applies no traversal guard to
the `owner`/`repo` it extracts, and those two values are interpolated UNENCODED
into authenticated `api.github.com` paths. A dot-segment, a leading slash, a
percent-encoded dot, or a query/fragment character in either part steers or
truncates the authenticated call. The sibling `parseSubmissionGithubUrl`
(src/lib/submission-repo.ts:49-99) was hardened against exactly this class by
74acf814; `parseRepoRef` was not.

## 1. The real surface, confirmed against the tree

### 1.1 parseRepoRef as it exists (src/lib/github.repos.ts:99-106)

```
export function parseRepoRef(ref: string): { owner: string; repo: string } | null {
  const trimmed = ref.trim().replace(/\.git$/, "");
  const url = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if (url) return { owner: url[1], repo: url[2] };
  const slug = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slug) return { owner: slug[1], repo: slug[2] };
  return null;
}
```

Both the URL branch (`[^/]+`) and the slug branch (`[^/\s]+`) capture `.`,
`..`, `%`, `?`, `#` freely. Nothing after the match rejects a dot-segment or a
query character.

### 1.2 The unencoded interpolation sinks

`owner`/`repo` from `parseRepoRef` flow to lib functions that build the path by
raw template interpolation. The branch/ref part of these same paths IS now
encoded (via `encodeRefSegment`, added by the in-flight branch-merge work), but
owner/repo are not. Confirmed sinks (opened):

- src/lib/github.files.ts:39 `/repos/${owner}/${repo}/git/trees/${encodeRefSegment(branch)}?recursive=1` (getRepoTreeWithMeta - the branch-merge security pass's measured sink)
- src/lib/github.files.ts:54 `/repos/${owner}/${repo}/contents/${encodePath(path)}...`
- src/lib/github.repos.ts:122 `/repos/${owner}/${repo}` (getRepo)
- and every other `/repos/${owner}/${repo}/...` builder across github.*.ts reached through the actions below.

`ghFetch` (src/lib/github.repos.ts:28-51) prepends `const API =
"https://api.github.com"` (src/lib/github.repos.ts:5) and passes the composed
string to `fetch`, i.e. through the WHATWG URL parser, which is where
dot-segment collapse and `?`/`#` splitting happen.

### 1.3 Payloads re-measured against the REAL regexes (not a Node copy)

Command (run from repo root; the function body copied verbatim from
github.repos.ts:99-106, interpolated into github.files.ts:39's path shape):

```
node -e '<parseRepoRef verbatim>; const API="https://api.github.com";
for (const i of [...]) { const p=parseRepoRef(i);
  const path = p ? new URL(`${API}/repos/${p.owner}/${p.repo}/git/trees/main`).pathname : "(null)";
  console.log(JSON.stringify(i),"=>",JSON.stringify(p),"=>",path); }'
```

Output:

| raw input | parsed {owner,repo} | resulting pathname |
|---|---|---|
| `../x` | `{..,x}` | `/x/git/trees/main` (escapes /repos entirely) |
| `o/..` | `{o,..}` | `/repos/git/trees/main` (both segments gone) |
| `o/.` | `{o,.}` | `/repos/o/git/trees/main` (repo segment dropped) |
| `./x` | `{.,x}` | `/repos/x/git/trees/main` |
| `o/%2e%2e` | `{o,%2e%2e}` | `/repos/git/trees/main` (URL parser decodes %2e) |
| `o/r?x=1` | `{o,r?x=1}` | `/repos/o/r` (+ `?x=1` query injected; path truncated) |
| `o/r#f` | `{o,r#f}` | `/repos/o/r` (+ `#f` fragment; path truncated) |
| `/o/r` | `null` | already rejected (two slashes, leading slash) |
| `https://github.com/../x/git` | `{..,x}` | `/x/git/trees/main` |
| `https://github.com/o/r?x=1` | `{o,r?x=1}` | `/repos/o/r` |
| `octocat/Hello-World` | `{octocat,Hello-World}` | `/repos/octocat/Hello-World/git/trees/main` (unchanged) |
| `my-org_1/repo.name-2_x` | `{my-org_1,repo.name-2_x}` | `/repos/my-org_1/repo.name-2_x/git/trees/main` (unchanged) |
| `https://github.com/octocat/Hello-World.git` | `{octocat,Hello-World}` | `/repos/octocat/Hello-World/git/trees/main` (unchanged) |
| `org/repo.with.dots` | `{org,repo.with.dots}` | `/repos/org/repo.with.dots/git/trees/main` (unchanged - internal dots are safe) |

The three payloads the row named reproduce exactly, PLUS `o/.` (single dot),
`./x`, `o/%2e%2e`, and `o/r#f`. `/o/r` was already null, so a leading slash on a
bare slug needs no new handling (the URL form is the one to watch).

### 1.4 Call sites (grep, not recall)

```
grep -rn "parseRepoRef(" src/ | grep -v "\.test\.ts"
```

Production callers: src/app/actions/github-repos.ts (22 call sites: :83 :98
:113 :158 :171 :184 :196 :208 :227 :254 :269 :286 :305 :321 :333 :345 :357 :369
:381 :392 :403 :414 :431 :443 :456 :470 :528 :543 :561 :579 :594 :712 :889),
src/app/actions/github.ts (17 call sites incl. :28 :101 :249 :315 :562 :648 and
the grade/bulk paths), src/app/actions/github-content.ts (:31 :213 :393). Every
one follows the pattern `const parsed = parseRepoRef(repoRef); if (!parsed)
return { error: ... };` - so the fix (returning `null` for a dangerous ref)
flows through the EXISTING error path at every site with no caller change. The
definition itself: src/lib/github.repos.ts:99; re-exported via src/lib/github.ts:27.

## 2. Provenance: can an attacker-controlled value reach parseRepoRef?

The row flags this UNDETERMINED and says treat as not-safe until traced. Traced:

### 2.1 Every reaching action requires the app owner

`src/app/actions/github-repos.guard.test.ts` asserts all 18 actions in that file
are owner-restricted (its own header, :17); `gradeRepoAction` is exercised at
:209. `gradeRepoAction` itself calls `await requireAppOwner()` before
`parseRepoRef` (src/app/actions/github-repos.ts:704 then :712). So no anonymous
or student request reaches `parseRepoRef` directly; the only principal who can
trigger a call is the authenticated owner.

### 2.2 Where the repoRef string itself comes from

- Repo Grades surface: `row.repo` -> `gradeRepoAction(row.repo, ...)`
  (src/app/components/repo-grades/useRepoGradesGradingActions.ts:269). `row.repo`
  is built by `buildRepoGradeGridModel(scan.repos, roster, studentRepos,
  orgPrefix)` (src/app/components/repo-grades/index.tsx:185) - `scan.repos` is
  the org listing returned by GitHub itself (listOrgRepos -> `r.full_name`,
  src/lib/github.repos.ts:139-152). GitHub-authoritative, not student text.
- Older bulk panel: `gradeReposAction(repos, ...)` maps `item.repoRef`
  (src/app/actions/github.ts:648); `repos` derives from `course.studentRepos`.
- `course.studentRepos[].repo` write paths: roster/Canvas import sets `repo: ""`
  for every new entry (src/lib/workflows/roster-merge.ts:228, :293, :416 - all
  `repo: ""`); existing bindings are preserved, never derived from a student's
  submitted URL or GitHub username. The instructor types the binding via
  GithubRepoPicker (src/app/components/courses/AddCourseForm.tsx:316) or edits
  the Courses-tab studentRepos cell (RosterCell.tsx:428, also `repo: ""` on a
  new row). No traced write path lets a student populate `repo`.
- Other callers (CopyRepoPanel `repoRef`, content-tab `repoPairingState.repoRef`,
  org/template refs) are instructor-typed or instructor-configured.
- Student-submitted URLs go through `parseSubmissionGithubUrl`
  (grading-chat-intake.ts:242, submission-repo.ts:37, grade/repo-content.ts:56),
  which is ALREADY guarded (submission-repo.ts:87). No traced path routes a
  student-submitted URL into `parseRepoRef`.

### 2.3 Risk rating (gated on the trace)

MEDIUM / defense-in-depth, NOT a confirmed live student-exploitable path.
Justification: (a) every reaching action is owner-gated; (b) no traced write
path puts student-controlled text into a repoRef that reaches `parseRepoRef`.
The guard is still warranted, for three reasons the row and the tree support:

1. `parseRepoRef` is a shared primitive with ~40 production call sites; a future
   caller that forwards a less-trusted string inherits the hole silently.
2. The sibling `parseSubmissionGithubUrl` was hardened for this exact class
   (74acf814); leaving its twin unguarded is an inconsistency that defeats the
   earlier fix's intent.
3. An owner typo (`o/..`) today silently targets the wrong authenticated repo
   rather than failing cleanly - a correctness win independent of attacker
   control.

This rating is a finding, not a gate. If provenance is ever found
student-influenced (a self-service repo-binding intake is added), the rating
rises to HIGH and the diagnostic in section 6 becomes required - recorded as a
conditional residual (R2).

## 3. The fix (design; no code here)

A reject guard INSIDE `parseRepoRef`, applied to BOTH the URL branch and the
slug branch before returning, mirroring `parseSubmissionGithubUrl`'s proven
pair:

- Accept only `^[A-Za-z0-9_.-]+$` (the existing `SAFE_NAME`,
  src/lib/submission-repo.ts:40) for each of `owner` and `repo`. This single
  rule rejects every dangerous payload in 1.3 except bare dot-segments: `%`,
  `?`, `#`, `/`, space, and all other traversal/injection characters fall
  outside the class.
- PLUS a dot-segment guard: reject a part that is exactly `.` or `..` even
  though it matches `SAFE_NAME` (the existing `DOT_SEGMENT = /^\.{1,2}$/`,
  src/lib/submission-repo.ts:41). This is the lesson that `encodeURIComponent`
  does not neutralise a bare dot and the URL parser collapses it
  (github-ref-name.ts:5-10 records the same lesson for refs).
- On rejection, return `null` - the existing contract. Every call site already
  maps `null` to its user-facing "Enter a repository as owner/name..." error, so
  no caller changes.
- Strip `.git` before validation (the current line already does
  `.replace(/\.git$/, "")`), so `Hello-World.git` still accepts as
  `Hello-World`.

Internal dots stay legal (`repo.with.dots` accepts), matching GitHub's own repo
naming and the measured safe row in 1.3.

### 3.1 Placement (FORK - recommended reading acted on)

The guard logic is a pure string check. Two homes are defensible:

- READING A (recommended): add a pure `validateGithubOwnerRepo` (or
  `isSafeRepoNamePart`) to src/lib/github-ref-name.ts and have `parseRepoRef`
  import it. Rationale: that leaf is already the designated "validate an
  identifier before it is interpolated into a GitHub REST path" module
  (github-ref-name.ts:1-10), it is a plain non-"use server" `.ts` so the helper
  stays synchronous and unit-testable, and it co-locates the repo-name validator
  beside the ref validator (`encodeRefSegment`) so a future reader finds both in
  one place. Note the policies DIFFER (a ref permits `/`, `#`, `%`; a repo name
  does not), so the function is a genuinely new validator, not a duplicate of
  `encodeRefSegment` - the row's "do NOT duplicate a validator that will exist"
  warning is about the ref validator and is respected.
- READING B: a new sibling leaf src/lib/github-repo-name.ts. Larger (new file +
  its own directory-canary bump, see section 5), buys nothing A does not.

Cost if A is wrong: if a later maintainer expects github-ref-name.ts to concern
ONLY branch refs, the repo-name validator there is a mild surprise - a one-line
doc-comment update to the file header, cheap. Cost if B is chosen needlessly: an
extra file and a frozen-roots canary bump for no behavioural gain.

Acting on READING A. The build proceeds on it; this is the architect's reading,
not an owner ruling. If the owner prefers a sibling, the only delta is the file
name and a canary bump.

Known minor duplication: `SAFE_NAME`/`DOT_SEGMENT` already live inline in
submission-repo.ts:40-41. Reading A duplicates those two regexes (about two
lines) rather than editing the shipped `parseSubmissionGithubUrl` to share them.
This is deliberate: editing a proven, test-covered traversal guard to DRY up two
regexes risks the shipped fix for near-zero gain. De-duplication is recorded as
an OPTIONAL follow-up (R3), not part of this scope.

## 4. Instruments (machine-verifiable only; network is blocked)

New test file: src/lib/github.repos.parseref-traversal.test.ts (a `.test.ts`
leaf, collected by vitest's `src/**/*.test.ts` glob; node-env, no network, no
component render - all three instruments are pure-function assertions).

### Instrument A - reject/accept matrix

Object under comparison: the return value of `parseRepoRef(raw)` for a frozen
table of raw inputs. Instrument: `parseRepoRef` itself (the real export).
Direction of failure: a REJECT row whose result is non-null fails; an ACCEPT row
whose result is not the expected `{owner, repo}` fails.

- REJECT rows (each MUST return `null`): `../x`, `o/..`, `o/.`, `./x`,
  `o/%2e%2e`, `o/r?x=1`, `o/r#f`, `o/r&y=1`, `https://github.com/../x/git`,
  `https://github.com/o/r?x=1`, `https://github.com/o/..` , and `a b/c` (space).
- ACCEPT rows (each MUST return the stated parse): `octocat/Hello-World`,
  `my-org_1/repo.name-2_x`, `org/repo.with.dots`,
  `https://github.com/octocat/Hello-World`,
  `https://github.com/octocat/Hello-World.git` -> `{octocat, Hello-World}`.

### Instrument B - URL-construction assertion (pins the PURPOSE, not the spelling)

Object under comparison: `new URL(API + "/repos/" + owner + "/" + repo +
"/git/trees/main").pathname`, where `API` is imported or mirrored as
`https://api.github.com`. Instrument: the WHATWG `URL` parser (`new URL`).
Direction of failure:

- For every ACCEPT row, let `p = parseRepoRef(raw)` (non-null by Instrument A);
  assert `new URL(...).pathname === "/repos/" + p.owner + "/" + p.repo +
  "/git/trees/main"` AND `new URL(...).search === ""`. Fails if the pathname
  differs from the intended one or any query leaked in.
- A frozen RAW-DANGER oracle demonstrates the collapse the guard prevents, so
  the test is not a tautology (refactor-disarms-tests lesson): a literal table
  pairs each dangerous raw input with the KNOWN-BAD pathname that UNGUARDED
  interpolation of its raw captured parts produces (the exact strings measured
  in 1.3, e.g. `o/..` -> `/repos/git/trees/main`, `o/r?x=1` ->
  `/repos/o/r`+search). The test asserts (i) that bad pathname is NOT equal to
  the intended `/repos/o/.../git/trees/main` (proving the danger is real), and
  (ii) `parseRepoRef(dangerousRaw) === null` (proving the guard blocks it before
  that pathname is ever reachable). Use the parsed-part equality / `.pathname` /
  `.search` comparison, NEVER `not.toContain("..")`.

### Sabotage proofs (the build's sabotage pass MUST show each fails)

- S1: replace the guarded `parseRepoRef` body with the pre-guard body
  (github.repos.ts:99-106 as it is at HEAD). Instrument A's REJECT rows must go
  red (they would return non-null). Restore from a cp-backup, never `git
  checkout --` (sabotage-restore-needs-a-copy lesson).
- S2: weaken the guard to `SAFE_NAME` only (drop the dot-segment check).
  Instrument A rows `o/..`, `o/.`, `./x`, `../x` must go red - proving the
  dot-segment guard is load-bearing and not subsumed by `SAFE_NAME`.
- S3: in the placement leaf, if `validateGithubOwnerRepo` is added to
  github-ref-name.ts, its own matrix (sibling of github-ref-name.test.ts) runs
  under the same sabotage: break the regex, that matrix goes red.

No live-GitHub criterion anywhere. Every assertion is a pure call plus `new
URL`. This environment has no API keys and blocks the network
(docs/loop/this-repo.md section 6); nothing here needs either.

## 5. Waves, collision, and serialization

One wave; the change is small and single-purpose.

- Wave 1 (only wave): edit `parseRepoRef` in src/lib/github.repos.ts; add the
  pure validator to src/lib/github-ref-name.ts (Reading A); add
  src/lib/github.repos.parseref-traversal.test.ts; add the validator's own
  matrix rows to src/lib/github-ref-name.test.ts.

COLLISION with the in-flight branch-merge work (REPO-GRADES-BRANCH-MERGE-CHECK,
a3c4719b lineage). Measured working-tree state:

```
git status --short
 M src/lib/github.files.ts
?? src/lib/github-ref-name.ts
?? src/lib/github-ref-name.test.ts
?? src/lib/repo-grade-merge-check.ts
?? src/app/actions/github-repos.branch-merge-check.test.ts
 M src/app/actions/github-repos.ts
```

github-ref-name.ts and github-ref-name.test.ts are UNTRACKED (authored by the
branch-merge Wave 1, not yet committed at HEAD d230ffcb). github.files.ts and
github-repos.ts are MODIFIED by that same in-flight work. This fix edits
github-ref-name.ts and github-ref-name.test.ts directly, so it is NOT disjoint
with branch-merge Wave 1 and MUST SERIALIZE AFTER branch-merge Wave 1 commits.
Running them concurrently would have two authors editing the same untracked leaf
(parallel-disjointness.md: a shared file is a collision regardless of line
distance; no-git-stash-under-concurrency lesson). github.repos.ts (the lib,
where parseRepoRef lives) is not itself in the branch-merge MODIFIED set, but the
shared leaf alone forces serialization.

If branch-merge Wave 1 has already committed by build time, re-run `git status
--short` and re-confirm github-ref-name.ts is tracked and stable before
starting; the serialization constraint is satisfied the moment that file is at a
committed, non-conflicting state.

Directory canary: the only NEW root file this fix adds is a `.test.ts`
(github.repos.parseref-traversal.test.ts). If src/lib has a frozen-roots/basename
canary (gate-must-include-directory-canary lesson), confirm whether it counts
test files; if it does, bump the frozen list and its N in the same commit.
github-ref-name.ts is NOT new (it exists in the working tree), so editing it
triggers no canary.

## 6. Diagnostics (DEV_LOOP b907ff8e)

Decision: NO new diagnostic/log entry. Justification (stated, not assumed, per
the diagnostics-representation rule):

- This is a hardening / correctness fix to a pure parser, not a new capability a
  user reaches. It adds no new data path and no new user-visible surface.
- A rejected ref already folds into the EXISTING observable failure: every
  caller maps `null` to its "Enter a repository as owner/name..." error string,
  which the instructor already sees. The failure is visible today; the fix only
  makes it fire for `o/..` as well as for `garbage`.
- Given the section 2 provenance finding (owner-authored inputs), a rejection is
  overwhelmingly a typo, not an attack, so a dedicated "rejected-traversal"
  security counter would report near-zero and cost an edit to
  gradingActionSeam.ts - a file in active branch-merge flux (modified in the
  working tree), widening the collision in section 5 for no observability gain.

Conditional residual (R2 below): IF provenance is ever found student-influenced,
a rejected-repoRef count in the grade seam becomes required at that time.

## 7. The related residual sweep (row names ~10 sites) - RECOMMEND SEPARATE ROW

```
grep -rn "encodeURIComponent((branch|ref))" src/lib        (plus the heads/<branch> and ?ref= shapes)
```

14 raw `encodeURIComponent(branch|ref)` sinks that pass a bare `.`/`..` through
(dot-segment survives encoding), NOT yet routed through `encodeRefSegment`:

- src/lib/github.actions.ts:68 (branch), :120 (ref)
- src/lib/github.collab.ts:86 (branch, in `/branches/<branch>/protection`)
- src/lib/github.copy.ts:47 (branch), :159, :177, :337, :385 (destBranch / defaultBranch)
- src/lib/github.branches.ts:7 (fromBranch), :20 (branch), :35 (ref)
- src/lib/github.digest.ts:445 (branch, zipball)
- src/lib/github.files.ts:72 (branch, putFile), :113, :134 (commitTreeChanges heads)

RECOMMENDATION: a SEPARATE follow-up row (REF-DOTSEGMENT-SWEEP), not this scope.
Reasons:

1. Different object class: this scope hardens OWNER/REPO (SAFE_NAME policy, no
   `/`); the sweep hardens the REF/BRANCH segment (git-ref policy, `/` legal) -
   a different validator (`encodeRefSegment`) and a different char set.
2. Different, larger write set: six lib files across the branch/copy/digest
   paths, several of them (`github.copy.ts`, `github.files.ts`) also in the
   branch-merge MODIFIED set - folding them in here would balloon the collision
   surface and the serialization dependency.
3. Several sinks take GitHub-API-sourced values (destRepo.defaultBranch), not
   user input, so the sweep needs its own per-sink provenance triage; bundling
   it hides which sinks actually matter.

Cost if wrong (i.e. if bundled instead of separated): the one small, cleanly
verifiable owner/repo fix gets blocked behind a 6-file sweep and its triage,
delaying a MEDIUM finding behind a larger LOW-to-MEDIUM one, and widening the
branch-merge collision. Cost of separating (the recommended path): one extra
backlog row to track. The sweep is cheap to defer because it is defense-in-depth
on an owner-gated path, same as this scope.

## 8. owns file list (derived)

Command: `grep -rn "parseRepoRef" src/` plus the sinks grep in 1.2.

EDITED by the build:
- src/lib/github.repos.ts (parseRepoRef guard)
- src/lib/github-ref-name.ts (new pure validator - Reading A)
- src/lib/github-ref-name.test.ts (validator matrix rows)
- src/lib/github.repos.parseref-traversal.test.ts (NEW - Instruments A and B)

READS parseRepoRef AS SOURCE TEXT or mocks it (could go red; must be checked by
the build even though this fix does not edit them):
- src/app/actions/github-repos.grading.test.ts:62 (defines a `parseRepoRef`
  mock)
- src/app/actions/github-repos.grading.unmerged-branch.test.ts:30 (mock)
- src/app/actions/github.grading.test.ts:63 (mock)
- src/app/actions/github-repos.branch-merge-check.test.ts:21 (mock - branch-merge
  in-flight)

These four REPLACE parseRepoRef with a mock, so the guard does not change their
behaviour UNLESS a mock input happens to be a dangerous string (none observed).
The build must still run them to confirm green. They are NOT edited by this fix.

## 9. Residual register

- R1 (provenance finding): `parseRepoRef` is reachable only through owner-gated
  actions and no traced write path feeds it student-controlled text; rating is
  MEDIUM/defense-in-depth. Owner: this scope's Verify pass. Instrument: the
  section 2 citations re-checked against the built diff. Step: Verify re-judges
  the rating against what shipped. Must be entered in docs/BACKLOG.md on the
  build's push.
- R2 (conditional diagnostic): IF a student-influenced repo-binding intake is
  ever added, a rejected-repoRef count in the grade seam becomes required.
  Owner: whoever adds that intake. Instrument: a seam counter test. Step: raised
  to HIGH and scoped at that time. Record in docs/BACKLOG.md.
- R3 (optional de-dup): `SAFE_NAME`/`DOT_SEGMENT` exist both inline in
  submission-repo.ts:40-41 and (after this fix) in the new validator. Owner: a
  future refactor row. Instrument: both guards' existing matrices must stay
  green after extraction to a shared helper. Step: optional follow-up; do NOT
  edit the shipped parseSubmissionGithubUrl guard inside this scope. Record in
  docs/BACKLOG.md.
- R4 (the ref-dotsegment sweep, section 7): recommended as its own row
  REF-DOTSEGMENT-SWEEP. Owner: a new backlog row. Instrument: a URL-construction
  matrix per sink + sabotage. Step: filed by the orchestrator when this scope
  lands. Record in docs/BACKLOG.md.

A residual not written into docs/BACKLOG.md does not exist; all four are to be
filed at the build's push, each with its owner, instrument, and step as above.

## 10. ASCII check

Run before hand-off: `LC_ALL=C grep -nc '[^ -~\t]' docs/parsereporef-traversal-scope.md`
must print `0`.
