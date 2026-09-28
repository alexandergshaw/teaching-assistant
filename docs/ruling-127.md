# RULING 127: closing the cross-tenant Storage delete/read

Written 2026-09-28 against the tree at `b5210a8`, closing
`docs/service-role-predicate-audit.md` Findings 1-3. This document is the
fix's own record - what changed, why, and the RED/GREEN pair proving each
finding was real before the fix and closed after it. Findings 4 and 5 in the
audit are explicitly out of scope (owner questions, per the ruling).

## Write set

- `src/lib/course-files.ts` - the new shared validator, `isOwnCourseFilesStoragePath`.
- `src/lib/supabase/course-task-attachments.ts` - Finding 1 (write: `createTaskAttachmentRow`; sink/PC3: `taskAttachmentStorageSweep.remove`).
- `src/lib/supabase/courses.ts` - `deleteCourse`'s call site update (passes `userId` into the sweep).
- `src/app/actions/course-hub-core.ts` - Finding 2 (the four `append*File` actions).
- `src/lib/workflows/zip-run-log-completion.ts` - Finding 3 (read and delete).
- Tests: `src/lib/course-files.test.ts`, `src/lib/supabase/course-task-attachments.test.ts`,
  `src/app/actions/course-hub-core.storage-path.test.ts` (new),
  `src/lib/workflows/zip-run-log-completion.test.ts` (including two pre-existing
  fixture paths corrected from the bogus bare strings `"p1"`/`"p2"` to a real
  `${userId}/...` shape they were never checked against before), and
  `src/lib/workflows/zip-run-log-completion.blob-roundtrip.test.ts` (its
  `@/lib/course-files` mock needed `isOwnCourseFilesStoragePath` added via
  `importOriginal`, the same shape as the main test file - this file's own
  fixtures already used a genuine `${userId}/...` path so no fixture change
  was needed, only the mock).

Not touched: `src/app/actions/github*`, `action-guard-coverage*.test.ts`,
`src/lib/supabase/auth.ts`, `src/lib/institution-page-attachments.ts` (see
"The institution helper's own hole" below - reported, not fixed here, since
it belongs to a different module/bucket and is not one of Findings 1-3),
Finding 4 (`src/lib/research/db.ts`'s shared-library delete - an owner
product question per the ruling) and Finding 5 (`accessibility_scans`' RLS -
an owner-only production fact).

## The validator

`isOwnCourseFilesStoragePath(userId, storagePath)` in `src/lib/course-files.ts`.
Refuses (returns `false`, never rewrites) unless `storagePath` is exactly
`${userId}/<something>` with no empty, `.`, `..`, or separator-hiding segment
anywhere in it - checked segment by segment, including percent-decoding each
segment once and re-checking the decoded form for a `/`, `\`, `.` or `..` it
did not already spell out literally. Malformed percent-encoding is refused
rather than guessed at.

This is used at every point a caller-supplied "course-files" bucket object
path is persisted or acted on:

- `createTaskAttachmentRow` (write, Finding 1)
- `taskAttachmentStorageSweep.remove` (delete sink, Finding 1's PC3 - every
  path in the batch is checked before any `remove()` call; a mixed batch is
  refused wholesale, not partially honored)
- `appendCourseMaterialFileAction`, `appendCourseCastletopFileAction`,
  `appendCourseMiscFileAction`, `appendCourseExportFileAction` (write,
  Finding 2 - the export action checks `path` AND every entry of `parts`,
  since `downloadCourseZipBlob` prefers `parts` over `path` whenever `parts`
  is present)
- `completeCourseZipRunLog`'s read of `entry.path` and its removal of
  `r.replacedPath` (Finding 3, both read and delete)

## The institution helper's own hole - confirmed, not fixed here

The ruling asked me to check whether
`isInstitutionAttachmentStoragePath` (`src/lib/institution-page-attachments.ts:265-268`)
has the `..`-traversal hole `docs/service-role-predicate-audit.md` RES-C
flagged, and to make my own validator reject it rather than copy the mistake.

**Confirmed: it has the hole.** Its check is exactly
`storagePath.startsWith(`${userId}/${pageId}/`) && storagePath.length > prefix.length`
- a pure string-prefix test with no segment parsing at all. A path such as
`"user-1/page-1/../../victim-user/x.pdf"` satisfies `startsWith("user-1/page-1/")`
and is longer than the prefix, so it passes today. Whether that string
actually reaches a victim's object depends on how Supabase Storage treats a
`..` segment in an object key - RES-C's own unresolved half, needing a live
bucket this checkout does not have.

`isOwnCourseFilesStoragePath` does not repeat this mistake: it splits on `/`
and rejects any `.` or `..` segment outright, unconditionally, regardless of
what Storage itself does with one - see the "Its sufficiency..." row in
RES-C, which says exactly this defensive half is worth landing regardless of
the empirical answer.

This module (`institution-page-attachments.ts`) is not one of Findings 1-3
and is a different bucket (`institution-attachments`, not `course-files`), so
it is outside this ruling's write set. Reported here per the ruling's
instruction; not fixed. The owner/next wave should apply the same segment-
checking shape to it - RES-C's residual register entry already names the
instrument (a unit test asserting the validator returns `false` for any path
containing a `..` segment).

## RED before fix / GREEN after fix, for each finding

All three were verified by hand: the validation was temporarily removed from
the live source (via a scripted string-replace against the exact block, then
restored byte-for-byte from a backup taken outside the repo and diffed
identical before continuing), the test file re-run to observe failures, then
the fix restored and the test file re-run again to observe the pass. Every
RED run below is a real `npm run test:paths` invocation against the actually
reverted source, not a description.

### Finding 1 - `src/lib/supabase/course-task-attachments.test.ts`

RED (validation removed from `createTaskAttachmentRow` and
`taskAttachmentStorageSweep.remove`):

```
 Test Files  1 failed | 1 passed (2)
      Tests  6 failed | 20 passed (26)
```

6 failures: all 4 of `createTaskAttachmentRow`'s refusal cases (victim
prefix, startsWith-not-equals prefix, `..` traversal, bare userId), plus both
of `taskAttachmentStorageSweep.remove`'s refusal cases (mixed batch, lone
out-of-prefix path).

GREEN (fix restored):

```
 Test Files  2 passed (2)
      Tests  26 passed (26)
```

### Finding 2 - `src/app/actions/course-hub-core.storage-path.test.ts`

RED (validation removed from all four `append*FileAction` exports):

```
 Test Files  1 failed (1)
      Tests  5 failed | 5 passed (10)
```

5 failures: the four actions' own victim-path refusal case each, plus the
export action's parts-only-bypass case (`path` valid, one `parts` entry
foreign). The 5 positive controls (own-prefix path/parts accepted) stayed
green throughout, confirming the failures are specific to the refusal path,
not a broken fixture.

GREEN (fix restored):

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

### Finding 3 - `src/lib/workflows/zip-run-log-completion.test.ts`

RED (both checks removed from `completeCourseZipRunLog` - the `entry.path`
read guard and the `r.replacedPath` delete guard):

```
 Test Files  1 failed (1)
      Tests  2 failed | 24 passed (26)
```

2 failures: the read-half case (`downloadCourseZipBlob` was called with the
victim-prefixed `entry.path` - the assertion caught the exact call) and the
delete-half case (the function reported `ok: true` instead of refusing to
remove a victim-prefixed `replacedPath`). The positive control (an own-prefix
`replacedPath` still removed normally) and every pre-existing test in the
file stayed green.

GREEN (fix restored - the full 8-file targeted set, since the fix restore
for Finding 3 was verified together with the other two; see "Full targeted
run" below for that same output):

```
 Test Files  8 passed (8)
      Tests  116 passed (116)
```

## Positive controls

Every write/sink site has at least one passing test proving a legitimate
own-prefix path/parts value is still accepted and proceeds to the real call:
`createTaskAttachmentRow` inserts for `user-1/course-1/task-attachments/...`;
`taskAttachmentStorageSweep.remove` removes a batch that is entirely the
caller's own; each `append*FileAction` returns the real
`{replacedPath(s)}` shape (not an error) for an own-prefix `path`/`parts`;
`deleteCourse`'s existing test (`courses.deleteCourse.test.ts`) still removes
the caller's own attachments before the row delete, unmodified by this pass;
`completeCourseZipRunLog`'s existing full round-trip tests (read, rebuild,
upload, swap, remove-the-old-object) still pass end to end for the caller's
own paths, and a new explicit positive control pins the own-prefix
`replacedPath` removal case directly.

## Read-path validation: chosen, and why

The ruling asked whether to also validate on the read path, not only at
write time, unless the read path is unreachable without a write already
blocked. **Chosen: yes, validate on both**, for two of the three findings:

- Finding 1's sink (`taskAttachmentStorageSweep.remove`) is a DELETE, and its
  only caller (`deleteCourse`) is inside this write set - validating there
  is direct defence in depth, not a separate reachability question.
- Finding 3's `completeCourseZipRunLog` validates `entry.path` on the READ
  (before `downloadCourseZipBlob`) in addition to `r.replacedPath` on the
  delete. `entry.path` is read back from a row Finding 2's fix now validates
  at write time, so today it is unreachable without a write already blocked
  - but `completeCourseZipRunLog` calls `downloadCourseZipBlob` on the
    SERVICE-ROLE client, bypassing RLS entirely, and it is a shared module
    with other writers of `materials_files` outside this write set (every
    UI component listed in the audit's Finding 1/2 fan-out). A future writer
    that bypasses Finding 2's check would otherwise reach a cross-tenant read
    with zero remaining defence. The cost of validating here is one extra
    check per call; the cost of not validating is exactly Finding 2's own
    root cause recurring through a different writer. Validated.

Finding 2 itself has no separate "read path" to speak of beyond Finding 3's
own read (the append actions ARE the write); its own defence-in-depth is the
`parts`-entry check alongside `path`.

## Gates

- `npx tsc --noEmit --incremental false` - exit 0, no output.
- `npm run lint` - exit 0, 7 warnings / 0 errors, IDENTICAL to the baseline
  taken before the first edit (`RecordingTab.tsx`'s exhaustive-deps warning
  and four pre-existing unused-var warnings in unrelated test files - none of
  it in this write set).
- `npm run build` - reached `Compiled successfully in 16.3s`, then
  `Finished TypeScript in 45s`; the prerender tail then fails on
  `/account/diagnostics` for the expected reason (`@supabase/ssr: Your
  project's URL and API key are required` - no `.env` in this checkout).
- `npm test` (full suite, output redirected to a file and read back): exit 0,
  `1160 passed (1160)` files / `23202 passed (23202)` tests. Reconciles
  exactly against the 1159-file / 23167-test baseline: +1 file
  (`course-hub-core.storage-path.test.ts`, new) and +35 tests across the
  touched files (this pass's own new cases). The first run before the
  blob-roundtrip mock fix (below) showed 1 failure for exactly the reason
  named there - reconciled, not silently retried.
- Sizes: every touched file measured with both `wc -l` and PowerShell
  `@(Get-Content <path>).Count` in the report; both agree.
- No emojis: `src/lib/no-emojis.test.ts` passed (18/18) as part of every
  targeted run above, including the one covering this very file.

## Full targeted run (after the fix restored, all three findings together)

```
 Test Files  8 passed (8)
      Tests  116 passed (116)
COVERED src/lib/course-files.test.ts files=1 passed=30
COVERED src/lib/supabase/course-task-attachments.test.ts files=1 passed=22
COVERED src/app/actions/course-hub-core.storage-path.test.ts files=1 passed=10
COVERED src/lib/workflows/zip-run-log-completion.test.ts files=1 passed=26
COVERED src/lib/supabase/courses.deleteCourse.test.ts files=1 passed=4
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
COVERED src/file-size-ceiling.structure.test.ts files=1 passed=3
```
