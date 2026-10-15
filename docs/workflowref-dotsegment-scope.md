# WORKFLOWREF-DOTSEGMENT: scope

Security micro-row. Harden the one `encodeURIComponent(workflowRef)` PATH-segment
sink in `src/lib/github.actions.ts` against a bare dot-segment (`.` / `..`) that
survives `encodeURIComponent` and collapses the authenticated GitHub API path.
Same dot-segment class as the just-shipped REF-DOTSEGMENT-SWEEP (`e18e4e8b`) and
PARSEREPOREF (`2bf49baa`), but on a DIFFERENT object: `workflowRef` is a workflow
id or file name, not a git branch/ref, so `encodeRefSegment`'s error text
("That is not a valid branch name.") is WRONG for it.

READ-ONLY scope. No production code written here. One small wave at build.

Every quantity below names the command that produced it. All measurements taken
on HEAD current `main` in this checkout, 2026-10-11.

---

## 0. This is a bug fix / security hardening - no leverage claim

The feature a user reaches is unchanged; this closes a path-traversal gap in an
existing owner-only control. Per `docs/loop/leverage.md` and `seats.md`
(Acceptance criteria), there is no leverage claim to make. The AC seat records
the fired trigger ("bug fix / security hardening") and moves on. Not a
restructure of a prior artifact, so no disposition table applies (N/A).

---

## 1. The sink, re-measured

`src/lib/github.actions.ts:105` (confirmed by `Read`, and by
`grep -n "encodeURIComponent(workflowRef)" src/lib/github.actions.ts` -> one hit
at `:105`):

```
await ghFetch(`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowRef)}/dispatches`, {
```

This is a URL PATH segment (collapsible), not a query parameter (inert). It is
the ONLY `workflowRef` sink in the file: `grep -nc "workflowRef" src/lib/github.actions.ts`
returns the parameter declaration (`:101`) and this interpolation (`:105`); no
other interpolation of `workflowRef` exists. The sibling QUERY sinks in the same
file (`findWorkflowRunSince` `:120`, `listWorkflowRuns`) interpolate `ref`/branch
into `?branch=...` and are out of scope (a bare `..` in a query never collapses
the path - the sweep already triaged these as LEAVE).

Danger PROVEN by running the real construction (not reasoned), so the oracle in
section 4 is frozen from measurement, not recall:

```
node -e 'const b=r=>`/repos/o/r/actions/workflows/${encodeURIComponent(r)}/dispatches`;
for(const r of ["..",".","ci.yml","123"," .. "])console.log(JSON.stringify(r),
new URL("https://api.github.com"+b(r)).pathname)'
```

| raw `workflowRef` | encoded, interpolated path | resolved `new URL(...).pathname` |
|---|---|---|
| `..` | `/repos/o/r/actions/workflows/../dispatches` | `/repos/o/r/actions/dispatches` (DANGER: `workflows` segment removed) |
| `.` | `/repos/o/r/actions/workflows/./dispatches` | `/repos/o/r/actions/workflows/dispatches` (DANGER: id segment removed) |
| `ci.yml` | `/repos/o/r/actions/workflows/ci.yml/dispatches` | `/repos/o/r/actions/workflows/ci.yml/dispatches` (intended - must ACCEPT) |
| `123` | `/repos/o/r/actions/workflows/123/dispatches` | `/repos/o/r/actions/workflows/123/dispatches` (intended - must ACCEPT) |
| `  ..  ` (padded) | `/repos/o/r/actions/workflows/%20..%20/dispatches` | `/repos/o/r/actions/workflows/%20..%20/dispatches` (does NOT collapse un-trimmed) |

The padded `" .. "` row is the measurement that forces the fix to TRIM BEFORE the
dot check: un-trimmed it is inert (spaces encode to `%20`, blocking segment
recognition), but its TRIMMED intent is `..`, which is dangerous. The committed
`encodeRefSegment` already trims then checks then encodes the trimmed value
(`github-ref-name.ts:75-79`); the new function mirrors that exactly, so
`" .. "` is a REJECT case.

Completeness of the dot-segment class: `encodeURIComponent` does not encode
`A-Za-z0-9 - _ . ! ~ * ' ( )`. Of these only `.` participates in path-segment
collapse; every other unencoded char is an inert path char. Every other
dangerous char (`/`, control bytes, space) IS encoded (`/` -> `%2F`, control ->
`%XX`) and is therefore inert in the path after encoding - PROVEN for `foo/bar.yml`
and `a b.yml` by the same node run (both resolve to a single non-collapsing
segment). So rejecting a trimmed bare `.` / `..` is COMPLETE for the
path-collapse class; nothing else needs rejecting for the security property.
This is the same triage the sweep applied to `encodeRefSegment`.

---

## 2. Provenance (gates the risk rating)

Traced from the UI to the sink; every hop opened. `workflowRef` reaches the sink
by exactly these paths, all behind `requireAppOwner()`:

- `dispatchWorkflowAction(repoRef, workflowRef, ref, inputs)`
  (`src/app/actions/github.ts:782-798`): `requireAppOwner()` at `:789`; passes
  `workflowRef` straight to `dispatchWorkflow` at `:793`. Blank is already
  rejected (`:792 if (!workflowRef || !ref)`), but a non-blank `.` / `..` passes.
  - UI caller 1, `src/app/components/repo-detail/useActionsTab.ts:110`: value is
    `dispatchWorkflowId`, a `<TextField select>` whose only `<MenuItem value>` is
    `String(w.id)` from the listed workflows (`ActionsTab.tsx:107-110`) - a
    GitHub-returned NUMERIC id, never free text, cannot be `.`/`..`.
  - UI caller 2, `useActionsTab.ts:193`: passes `String(w.id)` from a listing -
    same, safe by construction.
- `dispatchTestsAction(repoRef, branch?, workflowRef?)`
  (`src/app/actions/github.ts:805-828`): `requireAppOwner()` at `:811`;
  `wf = workflowRef?.trim()` (`:815`) else derived from
  `chosen.path.split("/").pop()` (`:820`, a GitHub-returned basename like
  `tests.yml`); `dispatchWorkflow(..., wf, ref)` at `:823`.
  - UI caller, `src/app/components/GithubGradingPanel.tsx:452`: value is
    `workflowFile`, a FREE-TEXT `<TextField>` the instructor types
    (`GithubGradingPanel.tsx:601-607`, placeholder "e.g. tests.yml"). THIS is the
    one free-text path to the sink.

**Rating: MEDIUM / defense-in-depth + owner-typo correctness. NOT
student-exploitable.** The only free-text path (`workflowFile`) is typed by the
app owner against their own repos, behind `requireAppOwner()` (the real owner
gate, per `seats.md` Operability: not the deprecated `requireOwner()` alias).
No student/Canvas-sourced value reaches `workflowRef`. This mirrors PARSEREPOREF's
traced rating. The guard is still warranted: a clear reject beats a confusing
authenticated call to an unintended path, and a bare `..` from a fat-fingered
owner otherwise fires `POST /repos/o/r/actions/dispatches` under their token.

Command that enumerated the callers (output is the authority, not this prose):

```
grep -rn "dispatchWorkflow\b" src --include=*.ts --include=*.tsx
# -> github.actions.ts:98 (def), app/actions/github.ts:793, app/actions/github.ts:823
grep -rn "dispatchWorkflowAction\|dispatchTestsAction" src/app --include=*.tsx
# -> useActionsTab.ts:110,193 (select, numeric id); GithubGradingPanel.tsx:452 (free text)
```

---

## 3. The validator (NEW, workflow-appropriate; NOT a dup of encodeRefSegment)

Add ONE new export to the committed leaf `src/lib/github-ref-name.ts` (which
imports nothing - a self-contained pure leaf, so no import cycle is created by
`github.actions.ts` importing it):

```ts
const INVALID_WORKFLOW = "That is not a valid workflow id or file name.";

/**
 * encodeURIComponent for a workflow id or file name placed in a GitHub Actions
 * URL path, but throws on a bare "." or ".." (after trim) - the one shape
 * encodeURIComponent does not neutralise, which collapses the dispatch path.
 */
export function encodeWorkflowSegment(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed === "." || trimmed === "..") throw new Error(INVALID_WORKFLOW);
  return encodeURIComponent(trimmed);
}
```

Then change `src/lib/github.actions.ts:105` only:
`${encodeURIComponent(workflowRef)}` -> `${encodeWorkflowSegment(workflowRef)}`,
plus `import { encodeWorkflowSegment } from "./github-ref-name";` at the top.
Zero caller changes: both action callers already wrap the call in `try/catch` and
return `{ error: err.message }` (`github.ts:795-796`, `:825-826`), so the thrown
`INVALID_WORKFLOW` message surfaces to the owner through the existing error path -
the same routing the sweep used for its 12 routed sinks.

**Why a separate function, not reuse of `encodeRefSegment`:**
- `encodeRefSegment`'s message is "That is not a valid branch name." - wrong for a
  workflow id/file, and it would surface that wrong text to the owner.
- The sweep's 12 routed sinks depend on `encodeRefSegment` and its branch message;
  leaving it untouched keeps `github.refs.sweep.ref-traversal.test.ts` green.
- Precedent: the sibling added `validateGithubOwnerRepo` as a SEPARATE function
  rather than overloading `encodeRefSegment`, for the same "policy differs"
  reason (`github-ref-name.ts:52-69`).
- The ~2 shared lines (trim + dot check + encode) are deliberate duplication, not
  a refactor target: consolidating would couple two different messages/objects and
  risk the refactor-disarms-tests tautology.

**Recommended reading of the one open fork (see section 8), applied here:** the
MINIMAL guard above (reject trimmed bare `.`/`..`, then encode). Section 1 proves
it is complete for the path-collapse security class; a stricter allowlist is a
correctness/UX nicety the owner may add, not a security requirement.

---

## 4. Instruments (test seat owns final oracle construction; this is the spec)

ONE new test file: `src/lib/github.actions.dispatch-workflow-traversal.test.ts`.
NEW file (none exists for `github.actions`: `ls src/lib/github.actions*.test.ts`
-> no match). Duplicate the tiny fetch-stub harness from
`github.refs.sweep.ref-traversal.test.ts:27-85` inline (no cross-test-file import,
per the repo rule). Four instruments:

**Instrument A - pure validator matrix** (imports `encodeWorkflowSegment` from
`./github-ref-name`):
- REJECT (throws, message === "That is not a valid workflow id or file name."):
  `"."`, `".."`, `" .. "`, `"  .  "`. Object: the thrown `Error.message`.
  Direction of failure: RED if any does not throw, OR throws the wrong message.
- ACCEPT (returns the encoded trimmed value): `"ci.yml"` -> `"ci.yml"`;
  `"123"` -> `"123"`; `"tests.yaml"` -> `"tests.yaml"`;
  `"my-workflow_2.yml"` -> `"my-workflow_2.yml"`; `"  ci.yml  "` -> `"ci.yml"`.
  Direction of failure: RED if the return differs from the frozen expected string.

**Instrument B - guarded-sink reject, by pathname** (drives the real
`dispatchWorkflow` from `./github.actions` with `fetch` stubbed per the sibling
harness, GITHUB_TOKEN stubbed; `dispatchWorkflow` makes exactly ONE fetch and the
guard runs during path construction BEFORE it, so this is the sweep's "Form A /
first-and-only fetch" case - no sibling-fetch complication):
- For each of `[".."", ".", " .. "]` (trimmed to a bare dot-segment):
  `await expect(dispatchWorkflow("o","r",d,"main")).rejects.toThrow("That is not a valid workflow id or file name.")`
  AND `expect(fetchMock).not.toHaveBeenCalled()`.
  Object: the thrown message AND the recorded fetch calls. Direction of failure:
  RED if it does not throw the exact message, or if fetch was called at all.
- NOT `not.toContain("..")`: a collapsed URL no longer contains `..`, so that
  assertion is green on the bug. This is why the throw+not-called pair is used.

**Instrument C - FROZEN raw-danger oracle** (proves the UNGUARDED interpolation
is really dangerous, so the guard is not closing a non-problem). Frozen from the
section-1 node measurement:

```
{ ref: "..", bad: "/repos/o/r/actions/dispatches",            intended: "/repos/o/r/actions/workflows/../dispatches" }
{ ref: ".",  bad: "/repos/o/r/actions/workflows/dispatches",  intended: "/repos/o/r/actions/workflows/./dispatches" }
```

For each: `const pathname = new URL("https://api.github.com/repos/o/r/actions/workflows/" + encodeURIComponent(ref) + "/dispatches").pathname;`
then `expect(pathname).toBe(bad)` and `expect(pathname).not.toBe(intended)`.
Object: the collapsed pathname of the raw interpolation. Direction of failure:
RED if the WHATWG parser stops collapsing the segment (oracle drift) - the same
guard the sweep build used to catch an oracle error.

**Instrument D - guarded-sink accept, by pathname** (same driven harness):
- `await dispatchWorkflow("o","r","ci.yml","main")` then
  `expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe("/repos/o/r/actions/workflows/ci.yml/dispatches")`.
- `"123"` -> `.../workflows/123/dispatches`.
  Object: the pathname actually sent to fetch. Direction of failure: RED if the
  intended segment is dropped or altered.

**Sabotage (implementer proves each instrument can fail):**
- S1 (dot check load-bearing): in `encodeWorkflowSegment`, delete the
  `if (trimmed === "." || trimmed === "..") throw` line (return
  `encodeURIComponent(trimmed)` only). Expect Instrument A REJECT rows and
  Instrument B to go RED (fetch now called; pathname collapses to
  `/repos/o/r/actions/dispatches`). Restore -> green.
- S2 (message pinned - the whole reason for a separate function): change
  `INVALID_WORKFLOW` to the branch message "That is not a valid branch name."
  Expect Instrument A/B message assertions to go RED. Restore -> green.
- Mock `fetch` via `vi.stubGlobal` per the sibling harness, NOT `@/lib/github*`,
  so the REAL URL `dispatchWorkflow` builds is what is asserted. The network is
  blocked by `vitest.setup.ts`; the per-test stub overrides it (the sibling does
  exactly this and ships green).

---

## 5. Waves and collision

ONE small wave. Write set (edits PLUS the new test):

- `src/lib/github-ref-name.ts` - ADD `encodeWorkflowSegment` + `INVALID_WORKFLOW`
  (existing exports untouched).
- `src/lib/github.actions.ts` - change `:105` interpolation + add one import.
- `src/lib/github.actions.dispatch-workflow-traversal.test.ts` - NEW.

Every wave must include the file that CALLS the new export: `github.actions.ts:105`
is that caller and is in the write set. Not type-only. No new directory, no new
module beyond the test.

**1000-line ceiling** (`@(Get-Content <f>).Count` is the mandated instrument;
measured here with the Bash `wc -l` tool, which `this-repo.md:191` documents as
agreeing with `@(Get-Content).Count`; re-confirm in PowerShell at the wave gate):
`wc -l src/lib/github.actions.ts src/lib/github-ref-name.ts` ->
`github.actions.ts` = 295, `github-ref-name.ts` = 79. After the change:
`github.actions.ts` ~296 (one import line), `github-ref-name.ts` ~87 (6-8 added
lines), new test ~110. All far under 1000.

**Shared-tree serialization:** shares the `github-ref-name.ts` leaf with the
just-shipped sweep/parseRepoRef cluster (now COMMITTED and clean - `e18e4e8b`,
`2bf49baa`); adding a new export does not touch their code. Serializes behind any
RUNNING build on the shared `tsc`/full-test slot (`this-repo.md`: exactly one
caller runs `tsc`; no two agents sabotage-verify on the tree at once). Not
runnable concurrently with any other item that writes `github-ref-name.ts` or
`github.actions.ts`.

---

## 6. owns file list

Derived, not eyeballed. Commands and pasted output:

```
grep -rln "github-ref-name\|encodeRefSegment\|validateGithubOwnerRepo\|normalizeTargetBranch\|encodeWorkflowSegment" src --include=*.ts --include=*.tsx
-> src/app/actions/github-repos.ts
   src/lib/github-ref-name.test.ts
   src/lib/github-ref-name.ts
   src/lib/github.branches.ts
   src/lib/github.collab.ts
   src/lib/github.copy.ts
   src/lib/github.digest.ts
   src/lib/github.files.ref-traversal.test.ts
   src/lib/github.files.ts
   src/lib/github.refs.sweep.ref-traversal.test.ts
   src/lib/github.repos.ts

grep -rln "github\.actions\|dispatchWorkflow" src --include=*.test.ts
-> src/app/actions/github.test.ts
   src/lib/cron-heartbeat.test.ts
   src/lib/github.refs.sweep.ref-traversal.test.ts

grep -rln "readFileSync.*github" src --include=*.structure.test.ts --include=*.wiring.test.ts
-> (no match: no structure/wiring test enumerates these files' exports or roots)
```

Classification (every entry is EITHER edited, OR reads an edited file; the
distinction decides what the wave gate must RUN):

| File | Class | Why |
|---|---|---|
| `src/lib/github-ref-name.ts` | OWNED (edit) | new export added |
| `src/lib/github.actions.ts` | OWNED (edit) | `:105` swapped, import added |
| `src/lib/github.actions.dispatch-workflow-traversal.test.ts` | OWNED (new) | the new instrument |
| `src/lib/github-ref-name.test.ts` | ADOPTED (reads) | imports the leaf; unaffected by an ADDED export, but RUN it to confirm |
| `src/lib/github.refs.sweep.ref-traversal.test.ts` | ADOPTED (reads) | imports `github.actions` (findWorkflowRunSince/getLatestWorkflowRun, and the branch INVALID const); does NOT import `dispatchWorkflow`; unaffected, but RUN it |
| `src/app/actions/github.test.ts` | ADOPTED (reads) | exercises `dispatchWorkflowAction`/`dispatchTestsAction` whose invalid-input behaviour changes; its call uses `"workflow.yml"` (valid, still accepted) so stays green - RUN it to confirm |
| `src/lib/cron-heartbeat.test.ts` | CHECKED-SAFE | matches `dispatchWorkflow` only as a substring in unrelated heartbeat text; does not import or drive the sink - RUN it in the gate as a cheap confirmation |
| `github.branches/collab/copy/digest/files.ts`, `github.repos.ts`, `github-repos.ts`, `github.files.ref-traversal.test.ts` | CHECKED-SAFE | import OTHER `github-ref-name` exports; an ADDED export cannot change their resolution or behaviour. Not edited, not run (the `file-size-ceiling` + full `tsc` cover them). |

Wave gate (2+ paths, so `npm run test:paths`, never a raw multi-path vitest -
`this-repo.md:52-66`; a single path may use `npx vitest run <path>`):

```
npm run test:paths src/file-size-ceiling.structure.test.ts \
  src/source-bytes.structure.test.ts \
  src/lib/no-emojis.test.ts \
  src/lib/github-ref-name.test.ts \
  src/lib/github.actions.dispatch-workflow-traversal.test.ts \
  src/lib/github.refs.sweep.ref-traversal.test.ts \
  src/app/actions/github.test.ts \
  src/lib/cron-heartbeat.test.ts
```

Plus the always-on canaries for a NEW source file: `src/source-bytes.structure.test.ts`
(no BOM/NUL) and `src/lib/no-emojis.test.ts` (included above). Then `npx tsc
--noEmit` (exit 0, no output) and `npm run lint` (exit 0, no NEW warning in the
written files - never pin the absolute count). Build compile-line check
(`(check-mark) Compiled successfully`) at the group push, not per wave.
`git status --short` against this write set, and confirm no `.claude/worktrees`
copy was edited instead of the real tree (`this-repo.md:270`).

---

## 7. Diagnostics representation

NONE, and that is justified (stated per `DEV_LOOP.md` "Diagnostics
representation"). This is pure parser hardening with no new data path and no new
user-reached behaviour: the only new failure mode is a thrown validation error,
which folds into the EXISTING action error path (`{ error: err.message }` already
returned at `github.ts:795-796` and `:825-826` and already surfaced in the two UI
surfaces). No run reports through a diagnostics surface here; adding one would be
inventing a surface a bug fix does not need. Matches both siblings
(PARSEREPOREF "NO new diagnostic"; REF-DOTSEGMENT-SWEEP "Diagnostic: none").

---

## 8. The one fork (recommended reading; owner may widen)

**Fork: MINIMAL guard vs STRICT allowlist.**

- MINIMAL (recommended, scoped above): trim, reject bare `.`/`..`, then
  `encodeURIComponent`. Section 1 PROVES this is complete for the path-collapse
  security class. Consistent with the just-shipped `encodeRefSegment`, which the
  sweep deliberately kept minimal because "wrapping would add a throw on harmless
  input for zero gain." Accepts any other string and lets GitHub 404 on a
  genuinely bad id.
- STRICT allowlist (owner option): additionally require
  `^[A-Za-z0-9._-]+$` (the sibling `SAFE_NAME`) so any malformed id is rejected
  with a clear message rather than reaching GitHub. Pure UX/owner-typo
  correctness, NOT a security requirement. Risk: could reject a legitimate but
  unusual workflow filename (e.g. one containing a space), which the minimal
  guard would pass through as an inert `%20`.

**Recommendation: ship MINIMAL.** It closes the proven vulnerability, matches the
sibling philosophy, and cannot false-reject a valid id. The allowlist is a
reversible tightening the owner can request later; it is not needed for the
security property and does not block this row.

This fork does not gate the build. The scope is written for MINIMAL and is
build-ready on that reading.

---

## 9. Residual register

| Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|
| R1: STRICT-allowlist option (section 8) if the owner wants owner-typo rejection rather than a GitHub 404 | owner (product decision) | Instrument A matrix extended with allowlist reject rows (e.g. `"a b.yml"`, `"a;b"` -> throw) | a follow-up row only if the owner elects STRICT; otherwise withdrawn. If elected, it edits `github-ref-name.ts` only and re-runs the section-6 gate. |
| R2: the two UI surfaces show `err.message` verbatim; the new workflow message was read-confirmed in the code path but NO component is rendered by any test here (`this-repo.md:134`), so the on-screen rendering is a reading claim, not a measured one | owner (live browser) | manual: type `..` into GithubGradingPanel workflow field, observe the error text | owner-only; this environment renders no component. Stated, not worked around. |

Both residuals are real (owner + instrument + step each). Neither blocks the MINIMAL
ship. R1 is the fork's losing branch held open; R2 is the standing
no-render-in-test ceiling, not a gap this scope created.

If and only if the owner elects R1 or notes R2 needs filing, the orchestrator
appends it to `docs/BACKLOG.md` at the push - a residual not in the backlog does
not exist (`DEV_LOOP.md` step 0).
