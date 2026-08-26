# Showing a graded row's code files - acceptance criteria

Requested 2026-08-26, verbatim: "i also need a control within each of these
rows to show the code files and their contents".

## THE REFRAME - read this first

**The control already exists.** `GradingResults.tsx:607-664` renders a Files
column with a per-file Preview (eye) button and a Download button; the eye
opens `FilePreviewModal.tsx` (161 lines), which already handles text, PDFs,
images, a truncation notice, and a Run button.

The instructor is asking for it because on their surface it shows `-` or does
nothing. So this is NOT "build a file viewer". It is "fix the four reasons an
existing viewer appears absent". Building a second viewer would be the wrong
work.

## The four defects

### F1 - the Preview button is wired to a no-op
`GithubGradingPanel.tsx:726` passes `onOpenPreview={() => {}}`. The button
renders, is labelled, and takes focus - and does nothing. This is ALREADY
recorded in `docs/REGRESSION.md:23278-23286` as deferred work, including the
reason no gate caught it: a zero-arg lambda satisfies a three-arg type, so
TypeScript is happy.

Fix: wire it to the real opener. Guard it so the same class of defect fails
loudly - a lint or source-reading guard that rejects an empty-body handler
passed to `onOpenPreview`, paired with a canary proving the guard fires.

### F2 - the repo path never populates the file list
`gradeRepoAction` builds its entry with `submittedFiles: []`
(`src/app/actions/github-repos.ts:685`), and `github.ts:648` does the same.
So a repo-graded row has no files to show even once F1 is fixed.

The fix is small and needs no new fetch or type: `digest.files` is in scope on
the line above, and `repoDigestToEmbeddedEntry` (`github-repos.ts:596`, and
the mapping at `:572`) already performs exactly the needed shape conversion.
Roughly four lines across two files.

### F3 - THE ONE THAT MISLEADS, and it must be fixed before any viewer ships
The repo path hardcodes `previewTruncated: false` (`github.ts:580`,
`github-repos.ts:604`) while `RepoDigest.files[].content` is explicitly a
post-truncation slice (`github.digest.ts:169-170`, `:304-308`, at 8,000 and
40,000 bytes).

So the truncation notice is suppressed on precisely the files that WERE cut.
An instructor opens a file, reads to the end, and sees no indication that the
rest exists. Worse, the model graded that same truncated view - so an
instructor reading what they believe is the full file can reach a conclusion
the grade never reflected, and has no way to know.

Requirements:
1. `previewTruncated` must report the truth on the repo path.
2. Where a file was cut, the viewer must say so at the CUT POINT, not only in
   a header - the reader's eye is at the end of the text, which is exactly
   where the false impression forms.
3. Where the GRADER saw less than the viewer is showing, say that too. These
   are two different cuts (`github.digest.ts`'s ingest budget versus the
   submission-text truncation before the model call) and this codebase already
   names them separately for that reason - see
   `useRepoGradesGradingActions.ts`'s `digestTruncated` /
   `submissionTruncated` handling.

### F4 - restored runs and drafts are always empty, and that is CORRECT
`github-grading-run-store.ts:179` and `grading-review-rows.ts:41` both drop
`submittedFiles` deliberately, and their tests assert the empty array. Do NOT
"fix" this by re-persisting file contents into localStorage - that would bloat
a store this project already had to defend against invalidation bugs.

The honest answer is an empty state that says the files are not retained for a
restored run, not a viewer that silently shows nothing.

### F5 (adjacent, smaller) - the Canvas GitHub-link path flattens structure
`repo-content.ts:117` already has `budgeted.files` and discards the structure,
folding repo source into one `content` blob and surfacing only a
`"Submission link"` pseudo-file. About 15 lines to surface the real list.
In scope only if it does not grow the change materially.

## What to reuse, and what not to

- **Reuse `FilePreviewModal.tsx` unchanged** for viewing a single file.
- **Steal the SHAPE of `drafted-grades/SubmissionCodePanel.tsx`** (file picker
  plus a read-only editor in one panel, for browsing all files) but NOT the
  component itself: it fetches live from GitHub and is documented as possibly
  not being the graded code. Showing the instructor something other than what
  was graded is the exact failure this feature exists to avoid.
- `MonacoFileEditor.tsx` (93 lines) is reusable behind
  `dynamic(ssr: false)`.
- `repo-detail/FilesTab.tsx` is not suitable.

## Placement and size

`GradingResults.tsx` is 822 lines against a hard 1000-line cap and is already
slated to reach ~950-970 from the three-feedback-box work. The browsing panel
must therefore be its OWN component under
`src/app/components/grading-results/`; the opener inside `GradingResults.tsx`
gets at most 18 lines.

## Standing rules that apply

- Professional, modern, minimal; reuse the app's visual language; no emojis.
- Click cost is a first-class factor: opening a file should be one click from
  the row.
- Any new control's state persists under a `ta-` key.
- vitest here is node-env, collects only `src/**/*.test.ts`, and NEVER renders
  a component - so no test will exercise the markup. Test the PRODUCERS (does
  the repo path now emit files, is `previewTruncated` true when the content
  was cut) rather than the rendering, and use source-reading guards with
  canaries for the wiring.

## Sequencing

Code begins only after the three-feedback-box chunk
(`docs/grading-results-feedback-boxes-acceptance-criteria.md`) is pushed -
both touch `GradingResults.tsx` and the grading result type. Order within
this feature: F3 first (it is a correctness bug that exists whether or not
the viewer is reachable), then F2, then F1, then the browsing panel, then F5
if cheap.

A BASELINE entry goes into `docs/REGRESSION.md` before F3 changes anything,
in the same shape as entries 352 and 354.
