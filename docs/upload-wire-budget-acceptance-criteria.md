# Acceptance criteria - upload caps measured in the unit that matters

Backlog group C from `docs/SESSION-HANDOFF-2026-08-10.md` section 2.3, which
recorded "15 unfixed upload paths, nine with no cap at all". That count was
re-derived from code rather than inherited, and it was wrong in several ways -
see "Corrections to the audit" below.

Sequencing note, stated plainly: the specification for this work was carried in
the six implementer briefs, and this document was written as the consolidated
record once they returned. The AC is not retrofitted to the code - every
requirement below was in a brief before it was implemented - but the document
itself post-dates the round.

---

## The defect, in one sentence

Vercel rejects a request body over roughly 4.5MB **at the platform layer, before
the function runs**, so a size check written inside an action never executes for
an oversized request and the user sees an opaque failure instead of the friendly
message the code carefully prepared.

Every wrong cap in this repo was wrong the same way: it compared a file's size
**on disk** against a limit that applies to its size **on the wire**. base64
inflates by 4/3, so `file.size > 4.5MB` permits a roughly 6MB request and does
not protect the thing it guards.

## AC1 - one owner for the platform fact

`src/lib/upload-budget.ts` is new, dependency-free (safe to import from a client
component, a server action or a Route Handler) and owns:

| export | purpose |
|---|---|
| `VERCEL_BODY_LIMIT_BYTES` | the platform cap, informational |
| `UPLOAD_WIRE_BUDGET_BYTES` | 3.5MB, deliberately below the cap for body overhead |
| `BASE64_INFLATION` | 4/3 |
| `wireBytesForFile` / `maxFileBytesForWireBudget` | the conversion, both directions |
| `checkWireBudget` / `checkFileWireBudget` | the two refusals, named for their unit |
| `sumBase64WireBytes` | several payloads sharing one request |

Two units, named so they cannot be confused: **FILE bytes** (`File.size`) and
**WIRE bytes** (`base64.length`). No other module may declare a budget constant.
`src/lib/chat/attachments.ts` - which got this right first, and whose behaviour
is unchanged - now takes both its constant and `formatMB` from here, because two
copies of a platform number is exactly how `MAX_SLIDE_BYTES` drifted into two
files with the same wrong value.

Covered by `upload-budget.test.ts` (16 tests). Its central assertion is named
for the defect: *a 4.5MB file does NOT fit a 4.5MB body cap, because it rides at
6MB*. Sabotage-checked - removing the conversion fails four tests.

**Known sharp edge, recorded rather than papered over.** `checkWireBudget` takes
WIRE bytes and `checkFileWireBudget` takes FILE bytes, distinguishable only by
name. Passing `sumBase64WireBytes` output into the file variant double-applies
the 4/3 inflation and silently under-permits. One implementer hit exactly this
and avoided it deliberately; a future change should consider a branded type or a
single entry point taking a discriminated unit.

## AC2 - budget the request, not the file

Wherever several files ride in ONE request, the budget applies to their TOTAL.
A per-file check passes four individually-fine files that together exceed the
cap, and that is precisely the case it misses. Applied to: the textbook image
sets, the voice-clone samples, the Gemini context-plus-homework bundle, and the
`lecture-qa` slide batch.

Where a path posts one file PER request (`generate-worked-examples` iterates and
calls the action once per file), the budget is per file - correctly, because
that is what a request contains there. Two call sites of one shared helper can
need different groupings; the helper takes an array and each caller passes what
actually rides in its own request.

## AC3 - the choke point

`extractPptxSlidesAction` (`src/app/actions/media.ts`) is reached, unprotected,
from SIX production call sites across three features - Slide Studio deck mode,
file preview, and four workflow steps. ONE wire-byte guard inside the action
protects five that had nothing and corrects the sixth, whose client cap measured
raw bytes at 6MB (about 8MB on the wire). No per-caller change.

Same treatment for `extractDocxTextAction` and `extractTextbookInfoAction` in
the same file.

## AC4 - client pre-flight AND server guard

A server guard alone still lets the browser encode and post a doomed payload,
and the platform still wins the race. A client pre-flight refuses instantly,
before reading the file, and is the only place the user can be told why. Both
halves are required wherever a component owns the file picker: the syllabus
template library (both entry points - `handleCreate` and the per-row
`handleReplace`), the Add Course syllabus upload, the voice-clone uploaded-file
path (which had no client check at all), and both Course Engine paths.

## AC5 - the stopgap is labelled as one

The lecture-planning repo `.zip` has no cap and fails in production today. Its
correct fix is browser-to-Storage, which is a separate, larger piece of work.
This round gives it an honest pre-flight refusal so instructors stop hitting an
unexplained platform rejection, with a comment stating plainly that this is a
stopgap, that the real fix is a Storage upload, and that a course repo
legitimately needs to exceed any request-body cap. The message says "too large
to upload in one request" and does not imply the limit is permanent.

A stopgap must not ship looking like a solution.

## AC6 - false user-facing text is deleted, not softened

Three pieces of text actively misinformed and are corrected:

1. `useLessonPlanner.ts` claimed *"The Gemini path extracts text server-side and
   is not subject to this cap."* False - where extraction happens is irrelevant,
   the base64 still crosses the wire in the Server Action's body. This comment
   is very likely WHY that branch had no check at all.
2. The `slides` workflow input said "~6 MB each"; the real figure is about
   2.6MB combined.
3. `LecturePlanningTab.tsx` said "Maximum upload size: ~7 MB zip", which was
   never true.

## Corrections to the audit that specified this work

- **Not 15 paths.** 12 action symbols / 16 cap sites / 21+ call sites depending
  on how you count, and the audit MISSED an entire file (`syllabus-templates.ts`,
  three call sites).
- **Voice-clone samples were never uncapped.** A real check existed and
  converted units correctly; it compared against 7MB DECODED, about 9.33MB on
  the wire. Wrong ceiling, not absent check.
- **The Course Engine has two call sites, not one.** The audit described the one
  with a wrong ceiling and missed the one with no cap at all.
- **Two further uncapped actions nobody had listed**: `describeScreenRecordingAction`
  and `generateVideoNarrationAction` both take frame arrays bounded only by a
  30-frame COUNT cap, never a byte budget.
- **`handleUploadSyllabus`**, not `handleSyllabusUpload`.
- **The two duplicated slide blocks were not fully identical** - the constants
  and encoder were, the surrounding request grouping was not.

## Deliberately NOT done

- **`saveLibraryFileAction`'s 15MB cap is untouched.** It is inconsistent with
  the platform reality, but it is also called from unattended workflow runs where
  there may be no HTTP boundary, and it has 20+ callers whose invocation paths
  could not all be established. Shrinking it blind risked breaking legitimate
  large generated-file saves. Recorded as a follow-up rather than guessed at.
- **No browser-to-Storage conversions.** The audit's own ordering puts them in a
  later, larger round: the lecture-planning repo zip and the syllabus-adaptation
  codebase zip. Each opens the orphaned-object window that entry 254 documents.
- **`extractTextbookFromImageAction` and `extractTextbookInfoAction` remain two
  near-identical actions** in two files with independently maintained rules. Both
  now use the same shared helper so they cannot drift in behaviour, but they
  should be consolidated.

## Testing

vitest here is node-env and collects only `src/**/*.test.ts`, so no component is
rendered - every client-side pre-flight is verified by reading, and only the
server guards and pure helpers are executable.

Every guard is sabotage-checked, and the requirement was the verbatim failure
message, not a claim of one. The strongest of these reintroduced the ORIGINAL
defect (raw bytes against the old 6MB threshold) rather than merely disabling the
guard, and confirmed three tests fail - which is the question that matters:
would this suite have caught the bug that shipped?
