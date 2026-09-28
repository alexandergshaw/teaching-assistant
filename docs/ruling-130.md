# RULING 130: closing the traversal hole in isKnownUploadPath

Written 2026-09-28 against the tree at `4ed61cc` (RULING 128's own follow-up
commit chain). Closes the "second entry point" RULING 128 found while fixing
`isInstitutionAttachmentStoragePath`, reported there rather than fixed
(`docs/ruling-128.md`, "Second entry point found").

## Write set

- `src/lib/syllabus-upload-source.ts` - the validator itself
  (`isKnownUploadPath`).
- `src/lib/syllabus-upload-source.test.ts` - extended, not newly created.
- `docs/ruling-130.md` (this file).

Not touched: `src/lib/course-files.ts` or `src/lib/institution-page-attachments.ts`
(RULINGS 127 and 128 own those, both landed). Also not touched (a sibling
implementer was live on these during this pass): `src/app/actions/grading.ts`,
`src/lib/grade.ts`, `src/lib/grade/engine.ts`, `src/lib/grade/extraction.ts`,
`src/lib/grade/utils.ts`, `src/lib/grade/extraction.test.ts`,
`src/app/components/grading-results/gradingResultsHelpersEditState.test.ts`.

## The defect

`isKnownUploadPath(userId, storagePath)` was a bare prefix check, once per
candidate segment in `UPLOAD_PATH_SEGMENTS`:

```
return UPLOAD_PATH_SEGMENTS.some((segment) => {
  const prefix = `${userId}/${segment}/`;
  return storagePath.startsWith(prefix) && storagePath.length > prefix.length;
});
```

`"user-1/syllabus-uploads/../../user-2/x.pdf"` starts with
`"user-1/syllabus-uploads/"` and is longer than it, so it passed. This is the
one function standing between a browser-supplied `storagePath` and
`withUploadedSyllabusFile`, which both downloads AND deletes whatever path it
is handed, against the service-role client the server action uses, in the
"course-files" bucket (the same bucket RULING 127 hardened for its own three
findings - syllabus uploads and rubric uploads share this lifecycle, see this
file's own module header).

This is the third instance of the identical bug class in this session:
RULING 127 fixed the missing check in `course-files.ts`, RULING 128 fixed the
weak check RULING 127 had cited as the good example
(`isInstitutionAttachmentStoragePath`), and this function is the one RULING
128 found on its way past and explicitly deferred.

## The validator, the exact-set-membership decision, and the extract-or-duplicate decision

Segment-checking logic follows `isOwnCourseFilesStoragePath`
(`src/lib/course-files.ts`, RULING 127) and `isInstitutionAttachmentStoragePath`
(`src/lib/institution-page-attachments.ts`, RULING 128): split on `/`, refuse
if any segment is empty, `.`, `..`, or - once percent-decoded exactly once -
becomes one of those or introduces a `/` or `\` it did not already spell
literally. Malformed percent-encoding (`decodeURIComponent` throwing) is
refused rather than guessed at.

**The second segment must be an exact member of `UPLOAD_PATH_SEGMENTS`.**
Confirmed, as the ruling predicted: `segments[1]` is checked with
`UPLOAD_PATH_SEGMENTS.includes(segments[1] as UploadPathSegment)`, an exact
membership test, replacing the per-candidate `startsWith` loop. This is
functionally the shape the old code already achieved for the "merely starts
with" case (`"rubric-uploads-extra"` never satisfied
`startsWith("rubric-uploads/")` because of the trailing slash baked into the
old prefix), but the new form states it as an actual set-membership check
rather than an accidental side effect of string concatenation, and it drops
the `.some()` loop entirely since one membership test replaces N prefix
tests.

**Duplicated a third time, not imported and not newly extracted.** Followed
RULING 128's stated reasoning: `src/lib/course-files.ts` carries this
feature's own unrelated weight - chunked-upload constants, a fetch-based
download-with-retry loop instrumented for production incidents, and Supabase
Storage upload/download orchestration - none of which
`syllabus-upload-source.ts` has any use for. That module's own header
(quoted in the file) states its entire design point is staying free of any
`@supabase/supabase-js` or `lib/supabase` dependency so it can be imported
from a server action, a client component, and a plain node-env test with no
mocking. Importing `course-files.ts` to reach a 15-line segment-check
primitive would violate that design point directly, which is a stronger
reason than RULING 128's ("this module doesn't need that weight") - here,
taking on that weight would break the property the module exists to have.

I considered extracting a shared primitive instead (the ruling asked me to
decide, not just duplicate reflexively). I did not, and did not touch
`course-files.ts` or `institution-page-attachments.ts` to do it, per the
ruling's instruction that an extraction affecting those two files must stop
and be reported as a proposal rather than executed, since they are outside
this write set. **Proposal, not executed:** a fourth module,
e.g. `src/lib/storage-path-segments.ts`, exporting just
`isTraversalOrSeparatorSegment` (and possibly a small
`isValidatedPrefixedPath(userId, storagePath, { extraFixedSegments, allowedSecondSegments })`
helper), with all three call sites importing from it instead of restating it.
That module would carry zero dependencies of its own (no Supabase, no
Storage), so all three current copies could import it without violating any
of their own stated design constraints - `course-files.ts`'s weight is
irrelevant to this decision since the new module would not import
`course-files.ts`, only the reverse. This is a real option, but out of scope
here because it requires editing `course-files.ts` and
`institution-page-attachments.ts` to replace their own copies, which this
ruling's write set forbids. **Three copies of the segment rules is now one
too many and is itself a drift risk worth its own row**: nothing but a
paired comment ("DUPLICATED, not imported... search in both/all files")
enforces that the three copies change together, and that comment now has to
be updated in three places rather than two whenever the rule changes.

## RED before / GREEN after, on the traversal case

Verified against the actually-reverted source: the fixed file was copied to
a location outside the repo first
(`%TEMP%\claude\ruling130-backup\syllabus-upload-source.ts.fixed`), a Python
script replaced the live `isKnownUploadPath` body with the exact original
`.some()`/`startsWith` implementation (text-mode, `newline=""`, so line
endings were not touched), the test file was run against that reverted
source, then the fixed file was copied back and `diff` confirmed byte-for-byte
identical to the backup ("IDENTICAL - restore confirmed") before continuing.

RED (validator reverted to the bare `startsWith` loop):

```
 Test Files  1 failed (1)
      Tests  6 failed | 40 passed (46)
```

6 failures, all newly-added cases: the traversal case, the empty-segment
case, the bare-`.` case, the percent-encoded-`..` case, the
percent-encoded-`/` case, and the malformed-`%` case. The 40 passing tests
were every pre-existing case in the file (including the ones that already
happened to reject a "merely starts with" segment or userId, because the old
code's trailing-slash-in-the-prefix concatenation already handled those by
accident) plus the three new positive controls - confirming the failures are
specific to the new refusal cases, not a broken fixture.

GREEN (fix restored):

```
 Test Files  5 passed (5)
      Tests  117 passed (117)
```

(Full targeted run, all five gate files together - see Gates below.)

## Newly-refused vs already-refused, per shape

| Case | Old check | New check | Verdict |
|---|---|---|---|
| `user-1/syllabus-uploads/../../user-2/x.pdf` (traversal) | accepts | refuses | **NEWLY refused** - the defect this ruling closes |
| `user-1/syllabus-uploads//abc.docx` (empty segment) | accepts | refuses | **NEWLY refused** |
| `user-1/syllabus-uploads/./abc.docx` (bare `.`) | accepts | refuses | **NEWLY refused** |
| `user-1/syllabus-uploads/%2e%2e/abc.docx` (encoded `..`) | accepts | refuses | **NEWLY refused** |
| `user-1/syllabus-uploads/a%2fb/abc.docx` (encoded `/`) | accepts | refuses | **NEWLY refused** |
| `user-1/syllabus-uploads/%/abc.docx` (malformed `%`) | accepts | refuses | **NEWLY refused** |
| `user-12/syllabus-uploads/abc.docx` (userId merely starts with) | refuses | refuses | already refused - `segments[0] !== userId` (old: the concatenated prefix `"user-12/..."` never matched `"user-1/syllabus-uploads/"`) |
| `user-1/syllabus-uploads-extra/abc.docx` (second segment merely starts with an allowed one) | refuses | refuses | already refused - old: the prefix's own trailing `/` meant `startsWith("syllabus-uploads/")` never matched `"syllabus-uploads-extra"`; new: exact-membership `includes()` never matches it either |
| `attacker/user-1/syllabus-uploads/abc.docx` (prefix as a substring, not a start) | refuses | refuses | already refused - pre-existing test, unaffected by this fix |
| `user-1/syllabus-uploads/abc.docx` (legitimate) | accepts | accepts | positive control, unchanged |
| `user-1/rubric-uploads/abc.pdf` (legitimate, second valid segment) | accepts | accepts | positive control, unchanged |
| `user-1/syllabus-uploads/sub/abc.docx` (nested, legitimate shape) | accepts | accepts | positive control, unchanged |

Six of the twelve checked shapes were newly closed by this fix; the other six
(three refusal shapes plus three positive controls) already behaved
correctly - the bare prefix check was not wrong about everything, only about
segment-level traversal and encoding tricks, exactly the class of hole a pure
`startsWith` test cannot see. This matches RULING 128's own finding on the
sibling institution-attachments validator almost shape-for-shape.

## Positive controls

One legitimate path per member of `UPLOAD_PATH_SEGMENTS` (`syllabus-uploads`,
`rubric-uploads`), plus the nested-uploadId shape, all still accepted - see
the table above and the three `it("positive control: ...")` cases in
`src/lib/syllabus-upload-source.test.ts`. All pre-existing tests in the file
(the happy path, the always-delete guarantee on parse failure/download
failure/removal failure, and every pre-existing `isKnownUploadPath` case)
stayed green throughout, unmodified.

## Fourth site check

Checked every place this module's own exports (`isKnownUploadPath`,
`UPLOAD_PATH_SEGMENTS`, `UploadPathSegment`, `syllabusUploadStoragePath`,
`withUploadedSyllabusFile`) are imported:

- `src/app/actions/syllabus-upload.ts` - both `uploadSyllabusAction` and
  `extractSyllabusTextAction` call `withUploadedSyllabusFile`, which is the
  one function that calls `isKnownUploadPath` internally; neither action
  calls the validator directly or takes a shortcut around it.
- `src/lib/orphan-upload-sweep.ts` - imports `UPLOAD_PATH_SEGMENTS` and the
  `UploadPathSegment` type only, to build its own sweep's allow-list of
  segments to enumerate and delete under; it never receives a fresh
  caller-supplied `storagePath` to validate - it lists objects Storage itself
  already reports as existing under `${userId}/${segment}/`, so there is no
  unvalidated-path callsite here for `isKnownUploadPath` to guard.

**No fourth site found.** Every fresh caller-supplied path in this module's
blast radius goes through `withUploadedSyllabusFile`, and every existing
caller of that function is a server action reached from
`SyllabusUploadControl.tsx` / `RubricInputModal.tsx` / the
course-schedule-from-source workflow step - none of which bypasses it.

## What this hole exposed, and what it did not - an honest bound

**What is confirmed:** any authenticated caller of `uploadSyllabusAction` or
`extractSyllabusTextAction` could have supplied a crafted `storagePath`
containing `..` segments that `isKnownUploadPath` would have accepted,
letting `withUploadedSyllabusFile` proceed to call `storage.download()` and
`storage.remove()` against that path on the service-role Supabase client the
server action uses for the "course-files" bucket - the same bucket RULING
127 hardened, bypassing RLS entirely.

**What is not established and cannot be settled from this checkout:**
whether Supabase Storage's object-key namespace actually resolves a `..`
segment as a relative-path escape the way a POSIX filesystem would, or
instead treats the whole string (including the `..` characters) as an inert,
opaque key - the identical unresolved half both RULING 127
(`docs/service-role-predicate-audit.md`'s RES-C) and RULING 128 left open,
for the same reason: this checkout has no live Storage bucket to test
against. This document does not claim a confirmed cross-tenant download or
delete was demonstrated end to end; it claims the codebase's own gate would
have let the attempt through to a service-role download-and-delete call,
which is itself the actionable defect, and is refused unconditionally now
regardless of the unresolved Storage-side question.

## Gates

- `npm run test:paths --` over `src/lib/syllabus-upload-source.test.ts`,
  `src/lib/course-files.test.ts`,
  `src/lib/institution-page-attachments.storage-path.test.ts`,
  `src/lib/no-emojis.test.ts`, `src/file-size-ceiling.structure.test.ts`:
  exit 0, `Test Files 5 passed (5)` / `Tests 117 passed (117)`.
- `npx tsc --noEmit --incremental false` (no file args): exit 0, no output.
- `npm run lint`: exit 0, `7 problems (0 errors, 7 warnings)` - IDENTICAL to
  the baseline recorded before this pass's first edit (`RecordingTab.tsx`'s
  exhaustive-deps warning, three unused-var warnings in
  `useDiscussionCapture.wiring.test.ts`, one in
  `repoGradesSliceA.guards.test.ts`, two in `new-quiz.test.ts`) - none of it
  in this write set.
- `npm run build`: reached `Compiled successfully in 19.1s` and
  `Finished TypeScript in 52s`, then the prerender tail failed on
  `/_not-found` for the expected reason (`@supabase/ssr: Your project's URL
  and API key are required` - no `.env` in this checkout), matching both
  prior rulings' pass condition.
- `npm test` (full suite, output redirected to a file and read back): see
  reconciliation below - a sibling implementer was landing grading changes
  concurrently in `src/app/actions/grading.ts`,
  `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts`,
  `src/lib/grade.ts`, `src/lib/grade/engine.ts`, `src/lib/grade/extraction.ts`,
  `src/lib/grade/extraction.test.ts`, `src/lib/grade/utils.ts` throughout this
  pass.
- Sizes: `src/lib/syllabus-upload-source.ts` - `wc -l` 299, PowerShell
  `@(Get-Content ...).Count` 299 (both agree).
  `src/lib/syllabus-upload-source.test.ts` - `wc -l` 499, PowerShell count 499
  (both agree). Both well under the 1000-line ceiling.
- No emojis: `src/lib/no-emojis.test.ts` passed (18/18) in the targeted run
  above.
