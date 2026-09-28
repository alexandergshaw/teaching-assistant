# RULING 108: privilege downgrade in prepareGradingRunAction

## The defect

A39 wave 4 shipped `src/app/actions/grading-incremental.ts` guarded with
`await requireUser()` (any active account), while it performs the same
GitHub-repository ingestion as the rest of the grading surface, which reaches
the owner's GitHub personal access token.

Path verified by direct reading, line numbers as of this fix:

- `src/app/actions/grading-incremental.ts:61` - `prepareGradingRunAction`
  calls `extractCanvasEntries(canvasUrl)`.
- `src/lib/grade/extraction.ts:14` - imports `fetchGradableRepoContent` from
  `./repo-content`.
- `src/lib/grade/extraction.ts:213,221` - branches on
  `looksLikeGithubUrl(work.submissionUrl)` and calls
  `await fetchGradableRepoContent(work.submissionUrl)`.
- `fetchGradableRepoContent` (`src/lib/grade/repo-content.ts`) reaches
  `lib/github`, which holds the owner's GitHub PAT.

So any signed-in, non-owner user could invoke `prepareGradingRunAction` with
a Canvas URL and cause the server to fetch GitHub repository content using
the repo owner's credential.

The instrument that caught it: `action-guard-coverage-github-cohort.test.ts`'s
`githubReachingActionFiles()` live-closure check, which walks the real import
graph (not a static file list) from every "use server" module and flags any
file reaching `lib/github.repos.ts`. Before this fix it found
`actions/grading-incremental.ts` as an undeclared member of the GitHub-PAT
cohort, alongside the already-tracked `actions/llm-content.ts`.

## Correction to the ruling's own citation

RULING 108 characterized `requireOwner()` (the alias `grading.ts` calls at
its seven guard sites) as "owner-only." Reading
`src/lib/supabase/auth.ts:451` shows this is no longer accurate: `requireOwner`
is now a thin, deliberately-less-restrictive alias that delegates to
`requireUser()` - "any active account" - per that function's own doc comment
(":436-450"). It is `requireAppOwner()` (`:408`) that is the actual owner-only
guard. This does not change the fix - the new action reaches an owner-private
secret at runtime regardless of what its file-level precedent currently
enforces - but the claim "the entire existing grading surface is owner-only"
is not supported by the code as it stands today; `grading.ts`'s calls to
`requireOwner()` currently admit any active account, the same gap this ruling
exists to close for `grading-incremental.ts`.

## Why enumeration alone was the wrong remedy

The wave-4 implementer's proposed fix - adding
`"actions/grading-incremental.ts"` to `GITHUB_FILES` with no guard change -
would have silenced the live-closure alarm without closing the exposure.
`GITHUB_FILES` only records which files reach the PAT; membership alone
carries no guard requirement. Only the paired check, "no action in a
GITHUB_FILES module calls requireUser() directly unless reviewed safe,"
enforces a guard - and that check would have then required either
`requireAppOwner()` or a `GITHUB_NOT_OWNER_ONLY` entry with a stated safety
reason. There is no such reason available here: the action performs the
identical GitHub-reaching ingestion its file's whole-run precedent does, so
listing it as reviewed-safe-on-`requireUser()` would have been false on its
face.

## The fix

- `src/app/actions/grading-incremental.ts`: guard changed from `requireUser()`
  to `requireAppOwner()` (import and call site).
- `src/app/actions/action-guard-coverage-github-cohort.test.ts`: added
  `"actions/grading-incremental.ts"` to `GITHUB_FILES` (not to
  `GITHUB_NOT_OWNER_ONLY` - it was reviewed and found to need tightening, not
  reviewed safe on `requireUser()`).

## What now fails if the guard is loosened

No new assertion was needed. The existing check "no action in a GITHUB_FILES
module calls requireUser() directly unless reviewed safe"
(`action-guard-coverage-github-cohort.test.ts`, describe block "R2 wave 0:
GitHub-PAT cohort defaults to owner-only (RULING 83)") already fails the
moment `prepareGradingRunAction` calls `requireUser()` again, because the file
is now in `GITHUB_FILES` and the action name is not in
`GITHUB_NOT_OWNER_ONLY`. Proved by reverting the guard to `requireUser()` and
running the test; the assertion failed with:

```
AssertionError: these GitHub-cohort actions call requireUser() directly without a per-action review listing them in GITHUB_NOT_OWNER_ONLY - default posture for this cohort is requireAppOwner() (RULING 83); either switch to requireAppOwner() or add a reviewed GITHUB_NOT_OWNER_ONLY entry with a stated reason: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "actions/grading-incremental.ts:48 prepareGradingRunAction",
+ ]
```

The guard was then restored from an out-of-repo backup
(`cp` to a temp directory and back, never `git checkout --`), and the test
re-run to confirm green.

## Known, out-of-write-set residual

`src/app/actions/grading-incremental.test.ts` (uncommitted, part of the same
A39 wave 4 delivery, not in this ruling's write set) mocks only `requireUser`
from `@/lib/supabase/auth`. With the guard now calling `requireAppOwner()`,
six of its cases fail with "No `requireAppOwner` export is defined on the
`@/lib/supabase/auth` mock." This needs its `vi.mock` updated to also return
`requireAppOwner`, and its "auth is checked" assertion updated to check
`requireAppOwner` was called - a small change, but outside the three-file
write set this ruling specified. Flagged for the next wave rather than fixed
here.
