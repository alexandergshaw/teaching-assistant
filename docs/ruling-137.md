# RULING 137

`docs/r2-overtightening-audit.md` finding F2: one of R2's 71 owner-only
conversions had no executing guard test.

## The gap

R2 sub-wave 2 converted `fetchSubmissionRepoAction`
(`src/app/actions/submission-repo.ts:35`) from `requireOwner()` to
`requireAppOwner()`. It was verified by COUNT - the site was enumerated as
converted in the sub-wave's 71-site tally - not by EXECUTION.
`src/app/actions/submission-repo.test.ts` module-mocked `@/lib/supabase/auth`
wholesale (the repo-wide pattern across 82 files under `src/app/actions`), so
the real guard never ran in that file, and no `*.guard.test.ts` sibling
existed for `submission-repo.ts`.

Counting is not executing. Across the five files the R2 overtightening audit
checked, the executing per-site assertions stood at 70 against 71 sites - a
per-file aggregate ("this file's sites are covered") hides a single missed
site when the coverage is tallied by count rather than confirmed by a RED/
GREEN guard test run against each site individually.

## The fix

Added `src/app/actions/submission-repo.guard.test.ts`, following the idiom
already landed in `canvas-inbox.guard.test.ts` and `grading.guard.test.ts`:
mock `@/lib/supabase/server` and `@/lib/supabase/app-users`, never
`@/lib/supabase/auth` itself, so the real `requireAppOwner()` executes.

The new test asserts:

1. An active, signed-in non-owner is refused. `fetchSubmissionRepoAction`
   wraps its entire body - including the `requireAppOwner()` call - in one
   try/catch, so the refusal surfaces as a returned `{ error: OWNER_ONLY_MESSAGE }`,
   not a rejection. This was established by reading the source
   (`submission-repo.ts:34-118`), not assumed.
2. A non-vacuity control: the same mocked non-owner session is shown to be
   refused directly by the real `requireAppOwner()`, proving the fake session
   is not accidentally satisfying the owner check.
3. The GitHub client (`getRepo`, `getRepoTree`, `getFileText`, `listCommits`)
   - the PAT-spending dependency the guard exists to protect - is never
   called for the refused session.

Proved RED: with the guard reverted to a bare `requireUser()`, the refusal
and no-GitHub-call assertions failed (the action returned a GitHub-shaped
error instead of the owner-only error, and `getRepo` was in fact called);
the non-vacuity control alone stayed green, as expected, since it exercises
`requireAppOwner()` directly and is unaffected by the site's own guard call.
Restored the production file from an out-of-repo backup and confirmed a
byte-identical `diff`.

Also fixed a stale comment in `submission-repo.test.ts` that still said the
action "calls requireOwner()" - false since the sub-wave 2 conversion to
`requireAppOwner()`.

## Scope

This ruling adds the missing execution proof only. It does not touch
`submission-repo.ts` (the production guard is already correct) and does not
add the new file to any cohort list or ratchet.
