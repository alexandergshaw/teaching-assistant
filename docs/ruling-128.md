# RULING 128: closing the traversal hole in isInstitutionAttachmentStoragePath

Written 2026-09-28 against the tree at `4a68f38` (RULING 127's own commit).
Tightens the one validator RULING 127 reported but explicitly did not fix
(`docs/ruling-127.md`, "The institution helper's own hole").

## Write set

- `src/lib/institution-page-attachments.ts` - the validator itself.
- `src/lib/institution-page-attachments.storage-path.test.ts` - the existing
  split-out storage-path test file (already split out of
  `institution-page-attachments.test.ts` by an earlier pass, `94131cd`, for
  the 1000-line cap); extended, not newly created.
- `docs/ruling-128.md` (this file).

Not touched: `src/lib/course-files.ts` or anything else RULING 127 changed.

## The defect

`isInstitutionAttachmentStoragePath(userId, pageId, storagePath)` was a bare
prefix check:

```
const prefix = `${userId}/${pageId}/`;
return storagePath.startsWith(prefix) && storagePath.length > prefix.length;
```

`"user-1/page-1/../../user-2/x.pdf"` starts with `"user-1/page-1/"` and is
longer than it, so it passed. This is the one function standing between a
browser-supplied `storagePath` and a row `insertInstitutionPageAttachmentRow`
persists; that row's `storage_path` is later read back by
`getInstitutionPageAttachmentUrlAction` and
`deleteInstitutionPageAttachmentAction`, both against a service-role client
that bypasses RLS entirely.

**The irony RULING 127 flagged, recorded here as asked:** RULING 127 cited
this exact function as evidence that the sibling "course-files" bucket's
missing check was an oversight, not policy - "look, the institution module
already validates its path." It did have a check. The check was wrong in the
same way a check that does not exist is wrong, for a caller who bothers to
send a `..` segment: having a check is not the same as having a correct one.

## The validator, and why duplicated rather than imported

Segment-checking logic follows `isOwnCourseFilesStoragePath` in
`src/lib/course-files.ts` (RULING 127): split on `/`, refuse if any segment
is empty, `.`, `..`, or - once percent-decoded exactly once - becomes one of
those or introduces a `/` or `\` it did not already spell literally.
Malformed percent-encoding (`decodeURIComponent` throwing) is refused rather
than guessed at.

The shape differs because this bucket's fixed prefix is two segments
(`userId`, `pageId`), not one: the first segment must equal `userId` exactly,
the second must equal `pageId` exactly, and there must be at least one more
segment after them. The per-segment rules themselves are identical to
`isOwnCourseFilesStoragePath`'s.

**Duplicated, not imported.** `src/lib/course-files.ts` is a much heavier
module than the one function this needed: chunked-upload constants, a
fetch-based download-with-retry loop instrumented for four still-unexplained
production incidents, and Supabase Storage upload/download orchestration
none of which `institution-page-attachments.ts` has any use for. Importing
it here to reach a 15-line segment-check primitive would pull that weight
into a module whose own header explicitly frames itself as the metadata/
list/get/delete/upload-orchestration layer for a *different* bucket
(`institution-attachments`, not `course-files`). A shared primitive would
only be the better call if it lived somewhere with no unrelated weight to
drag in - it doesn't, today - so `isTraversalOrSeparatorSegment` is copied
verbatim into `institution-page-attachments.ts` with a comment in both
places saying the two must be changed together. This is an explicit,
named risk: nothing enforces that the two copies stay in lockstep except
that comment. If either file changes its segment rules going forward,
whoever does it must search for "DUPLICATED, not imported" in both files.

## Whether deeper nesting is legal here

`buildAttachmentStoragePath` (this module's only path-builder) always
produces exactly one segment after the `userId/pageId/` prefix
(`${attachmentId}.${ext}` or `${attachmentId}`) - it never nests deeper. That
said, the reference validator (`isOwnCourseFilesStoragePath`) does not cap
segment count after its own one fixed segment either; it only requires "at
least one more segment" and validates each one, no matter how many there
are. To keep the two validators' behavior consistent in substance (matching
the ruling's instruction that "the segment rules should not differ"), this
validator also does not cap depth after its two-segment prefix - it accepts
`userId/pageId/sub/attach-1.txt` exactly as it accepts
`userId/pageId/attach-1.txt`, provided every segment passes the per-segment
check. This is unexercised by any real caller today (nothing in this module
ever builds a nested path), but nothing about the module's intent forbids
it, and inventing a stricter depth-1 rule not present in the reference
validator would be scope this ruling was not asked for.

## RED before / GREEN after, on the traversal case

Verified against the actually-reverted source (backed up outside the repo
first, restored via a plain file copy, diffed byte-identical to the fixed
version before continuing - `diff` reported no output, "IDENTICAL - restore
confirmed").

RED (validator reverted to the bare `startsWith` check):

```
 Test Files  1 failed (1)
      Tests  7 failed | 13 passed (20)
```

7 failures, all newly-added cases: the traversal case in both the direct
`isInstitutionAttachmentStoragePath` describe block and the
`insertInstitutionPageAttachmentRow` `it.each` table, plus the empty-segment,
bare-`.`, percent-encoded-`..`, percent-encoded-`/`, and malformed-`%` cases.
The 13 passing tests were every pre-existing case in the file plus the three
new positive controls (own-prefix path, no-extension path, nested-segment
path) and the two "already refused" negative controls (userId-startswith,
pageId-startswith) - all of which the old check already handled correctly,
confirming the failures are specific to the new refusal cases, not a broken
fixture.

GREEN (fix restored):

```
 Test Files  6 passed (6)
      Tests  135 passed (135)
```

(Run together with the full targeted set - see Gates below - all 20 cases in
this file pass individually within that 135.)

## Per-shape table: already refused vs newly refused

| Case | Old check | New check | Verdict |
|---|---|---|---|
| `userId/pageId/../../user-2/x.pdf` (traversal) | accepts | refuses | **NEWLY refused** - the defect this ruling closes |
| `userId/pageId//attach-1.txt` (empty segment) | accepts | refuses | **NEWLY refused** |
| `userId/pageId/./attach-1.txt` (bare `.`) | accepts | refuses | **NEWLY refused** |
| `userId/pageId/%2e%2e/attach-1.txt` (encoded `..`) | accepts | refuses | **NEWLY refused** |
| `userId/pageId/a%2fb/attach-1.txt` (encoded `/`) | accepts | refuses | **NEWLY refused** |
| `userId/pageId/%/attach-1.txt` (malformed `%`) | accepts | refuses | **NEWLY refused** |
| `user-12/page-1/...` (userId merely starts with) | refuses | refuses | already refused - the old literal-prefix string simply never matched (`"user-12/page-1/"` does not start with `"user-1/page-1/"`) |
| `user-1/page-12/...` (pageId merely starts with) | refuses | refuses | already refused - same reason |
| `user-1/page-1` (nothing after prefix) | refuses | refuses | already refused - old check's `length > prefix.length` |
| `user-1/page-1/attach-1.txt` (legitimate) | accepts | accepts | positive control, unchanged |
| `user-1/page-1/sub/attach-1.txt` (nested, legitimate shape) | accepts | accepts | positive control, unchanged - see "deeper nesting" above |

Six of the ten checked shapes were newly closed by this fix; the other four
(three refusal shapes plus the flat positive control) already behaved
correctly, meaning the bare prefix check was not wrong about *everything* -
only about segment-level traversal and encoding tricks, which is exactly the
class of hole a pure `startsWith` test cannot see.

## What this hole exposed, and what it did not - an honest bound

**What it exposed:** any authenticated caller of
`uploadInstitutionPageAttachmentAction` (an institution-page instructor)
could have supplied a crafted `storagePath` containing `..` segments that
`isInstitutionAttachmentStoragePath` would have accepted, letting a row be
persisted whose `storage_path` points outside their own `userId/pageId/`
prefix. Once persisted, `getInstitutionPageAttachmentUrlAction` (signed URL)
and `deleteInstitutionPageAttachmentAction` (delete) both act on that
`storage_path` against a service-role Supabase client that bypasses RLS -
so, if Storage itself resolves a `..` segment the way a filesystem would,
this could have produced a cross-tenant signed-URL read or delete of another
user's or another page's attachment object.

**What it did not establish, and could not establish from this checkout:**
whether Supabase Storage's object-key namespace actually honors a `..`
segment as a relative-path escape the way a POSIX filesystem does, or
instead treats the entire string (including the `..` characters) as an
opaque key with no such semantics - which is exactly the same unresolved
half `docs/service-role-predicate-audit.md`'s RES-C left open for the
sibling "course-files" bucket, and this checkout has no live bucket to test
either. If Storage treats `..` as a literal, inert character sequence in an
opaque key (never resolving it), then no upload with a `..`-bearing path
ever actually reached a victim's real object - the exploit's *second half*
(does the crafted key resolve to something else in Storage) is unverified,
only the *first half* (did this codebase's own guard let the key through in
the first place) is proven here. The fix is correct and necessary
regardless of that unknown - refusing unconditionally is the right call
exactly because the Storage-side behavior is unknown, per RULING 127's own
reasoning - but this document does not claim a confirmed successful
cross-tenant read/delete ever occurred or was demonstrated end to end
against live Storage; it claims the codebase's own gate would have let the
attempt through, which is itself the actionable defect.

## Second entry point found - reported, not fixed here

`isKnownUploadPath` in `src/lib/syllabus-upload-source.ts:99` has the
identical bug class:

```
export function isKnownUploadPath(userId: string, storagePath: string): boolean {
  return UPLOAD_PATH_SEGMENTS.some((segment) => {
    const prefix = `${userId}/${segment}/`;
    return storagePath.startsWith(prefix) && storagePath.length > prefix.length;
  });
}
```

A bare `startsWith` prefix test, no segment parsing, same traversal shape
(`"${userId}/${segment}/../../${otherUserId}/x"` would satisfy it). It
guards `withUploadedSyllabusFile`, which both downloads AND deletes whatever
path it is handed, against the service-role client, for the "course-files"
bucket (syllabus uploads and rubric uploads share this lifecycle - see that
file's own doc comment). This is a different module and a different write
path than this ruling's write set (`institution-page-attachments.ts`), so it
was not touched here, per the instruction to report rather than silently
widen scope. It should get the same fix - segment-by-segent, following
`isOwnCourseFilesStoragePath`'s shape, adapted for its `${userId}/${segment}/`
one-of-several-segments prefix - in its own ruling.

No other second entry point was found: every other place this module's
callers touch a `storagePath` (`AttachmentsPanel.tsx`'s `storage.remove()`
calls, the `ai-chat` route's and `knowledge-scope-context.ts`'s
`storage.download()` calls) reads `storagePath` off an already-fetched
`InstitutionPageAttachment` row - a row that can only exist if it passed
`isInstitutionAttachmentStoragePath` at insert time - never a caller-supplied
value taken fresh.

## Gates

- `npm run test:paths --` over
  `src/lib/institution-page-attachments.storage-path.test.ts`,
  `src/lib/institution-page-attachments.test.ts`, `src/lib/course-files.test.ts`,
  `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts`,
  `src/file-size-ceiling.structure.test.ts`: exit 0,
  `Test Files 6 passed (6)` / `Tests 135 passed (135)`.
- `npx tsc --noEmit --incremental false` (no file args): exit 0, no output.
- `npm run lint`: exit 0, `7 problems (0 errors, 7 warnings)` - IDENTICAL to
  the baseline RULING 127 recorded immediately before this pass's first edit
  (`RecordingTab.tsx`'s exhaustive-deps warning, three unused-var warnings in
  `useDiscussionCapture.wiring.test.ts`, one in
  `repoGradesSliceA.guards.test.ts`, two in `new-quiz.test.ts`) - none of it
  in this write set.
- `npm run build`: reached `Compiled successfully in 15.9s` and
  `Finished TypeScript in 43s`, then the prerender tail failed on
  `/account/diagnostics` for the expected reason (`@supabase/ssr: Your
  project's URL and API key are required` - no `.env` in this checkout).
- `npm test` (full suite, redirected to a file, read back): see below.
- Sizes: `src/lib/institution-page-attachments.ts` - `wc -l` 738,
  PowerShell `@(Get-Content ...).Count` 738 (both agree).
  `src/lib/institution-page-attachments.storage-path.test.ts` - `wc -l` 242,
  PowerShell count 242 (both agree). Both well under the 1000-line ceiling.
- No emojis: `src/lib/no-emojis.test.ts` passed (18/18) in the targeted run
  above, covering this pass's own additions.
