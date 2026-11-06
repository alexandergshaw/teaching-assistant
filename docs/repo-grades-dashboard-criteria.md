# Repo Grades dashboard acceptance criteria

Accepted after independent round-2 check. This file transcribes the accepted criteria without reopening their substantive decisions.

Owner direction: "run the repo grading for all classes that are wired up each time the app opens for any repos that have new commits." Grades must come from the existing repo evaluator, not Canvas or another LMS. Initial evaluation, configuration-only changes, incomplete inputs, and recovery are governed by the explicit criteria below.

## Leverage claim

CORPUS + SCALE: durable evaluation history determines which changed commits require work across configured courses, while each folder retains consistent grading criteria and instructor edits. Removal tests must catch missing startup dispatch for another eligible course, repeated evaluation of an unchanged completed commit, and loss of resolved-rubric consistency during recovery.

## Acceptance criteria

1. **Startup eligibility.** Each authenticated app opening automatically processes every owned course with a saved, nonblank GitHub organization, irrespective of selected course, current week, or active/inactive status. Discovery uses that course's saved repo scope. Missing required credentials, permissions, source configuration, or grading setup produces a visible blocked state; other courses continue. Courses without an organization are explicitly not configured.

2. **Initial evaluation and changed commits.** A repo without an evaluation checkpoint receives an initial evaluation across all discovered assignment folders. Subsequently, a changed grading-source commit triggers evaluation of its available assignment folders. The source is the configured grading branch/ref, or the repo's resolved default branch when no override exists—not the merge-check target.

3. **Configuration changes alone.** Changing instructions, rubric, provider, or grading options does not automatically regrade an unchanged commit. Existing results disclose that their grading configuration differs from the current configuration and offer explicit reevaluation. A later changed commit uses the then-current course configuration.

4. **Per-course configuration.** Capture an immutable effective configuration for each course/run, using its saved settings and documented defaults independent of whichever course is selected. Never silently borrow another course's rubric, instructions, or grading options from global UI state. If required configuration cannot be resolved safely, block that course. Pass `runCode` explicitly as `false` unless that course has opted in.

5. **Existing evaluation mechanism.** Use existing repo grading tooling, including README behavior, naming deductions, and rubric handling. Resolve and persist the actual rubric fingerprint for each folder/run; every repo evaluated for that folder uses the same resolved rubric. An interrupted run resumes with that rubric rather than generating a different one. Unrelated folders do not share a generated rubric accidentally.

6. **Commit and identity fidelity.** Capture an immutable source commit before evaluating and read that commit's files. Durably identify results and attempts by account, course, exact repo, source ref, commit, folder, and effective grading configuration. A branch advancing during evaluation cannot relabel an older evaluation; the newer commit remains eligible. Student names are supported associations, never the identity key.

7. **Durable success.** Advance a successful folder watermark only after complete input retrieval, a genuine successful evaluation, and durable result storage. Persist successful cells independently so interruption does not require repeating their paid work. Browser-local storage alone does not satisfy cross-session/account-safe coordination.

8. **Precise terminal outcomes.**

   - **Graded:** Complete required tree/file retrieval and a valid saved evaluation; advances the successful watermark.
   - **No submission:** Terminal only when complete discovery and required file reads establish that no student-authored submission exists. Store a distinct terminal check for that commit, suppress repeated automatic attempts for it, and reconsider after a new commit. Never label this graded or assign zero.
   - **Partial/incomplete:** Tree truncation, failed required file fetches, partial digest, or grading-input truncation cannot advance a successful watermark, even if the grader returned a score. A provisional result may remain visible with its limitation. Do not blindly repeat paid evaluation on each opening.
   - **Failed:** A known unsuccessful attempt remains failed, with bounded retry/recovery behavior; never counts as graded.
   - **Unknown:** A provider request that may have completed without a reliably saved outcome remains uncertain. No blind automatic retry or assertion that duplicate costs are impossible.

9. **Bounded, duplicate-resistant scheduling.** Coordinate one bounded workload across eligible courses. Concurrent tabs/openings, remounts, refreshes, manual grading, and recovery cannot dispatch duplicate attempts for the same evaluation identity. Existing provider/budget/rate limits remain effective; unresolved work stays visibly pending or blocked. Provider idempotency is used where supported.

10. **Interruption and account fencing.** Persist attempt ownership and recoverable lifecycle state. Account changes stop further scheduling and fence late completions. Older work cannot overwrite newer-commit results. Provide a control to stop future scheduling and explain any already-running work.

11. **Preserve instructor edits.** Save new evaluations separately when manual score/feedback edits exist, with an explicit review/conflict state. Never silently replace instructor edits or newer results. Historical results remain visible while new work runs, identified by their evaluated commit/configuration.

12. **Automatic, honest dashboard.** Selecting a course displays all available repo/folder results without assignment selection, including saved historical entries absent from the latest scan. Initial dashboard coverage is not silently restricted by saved grading filters. Distinguish unchanged, queued, running, graded, no submission, partial, failed, unknown, blocked, and missing folder. Zero remains a score; absence remains unknown/ungraded. Report discovery coverage separately from evaluation completion.

13. **No LMS grade source or automatic posting.** Scores come exclusively from repo evaluation tooling and instructor edits. Startup work never imports LMS grades, posts grades/comments, or confirms student bindings. LMS availability cannot gate repo evaluation.

14. **Accessibility and diagnostics.** Verify rendered keyboard access, stable focus, table header associations, readable progress/conflict states, and concise announcements. Diagnostics cover discovery, checkpoint/result read-back, scheduling, evaluation, persistence, and recovery using bounded outcomes, failure categories, elapsed time, and aggregate counts. Exclude identities, URLs, code, prompts/rubrics, feedback, credentials, raw exceptions, and individual scores.
