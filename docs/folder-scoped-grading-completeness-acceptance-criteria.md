# When a grading folder is specified, all of its code reaches the grader

The owner's requirement, verbatim (2026-08-25): *"any time i'm grading the
repos of students and specifying a specific folder, all code within that folder
should get pulled into the grader."*

Today it does not, and every reason is invisible.

## What actually happens now

A survey traced the whole path from the folder input to the prompt text. The
folder match itself is fine - it is a case-insensitive prefix on the full path,
it recurses to any depth, and `SKIP_DIR` correctly excludes `node_modules` and
friends even inside the chosen folder. What fails is everything after it.

| # | Cut | Where | Visible? |
| --- | --- | --- | --- |
| 1 | **12,000-character cap on the WHOLE merged submission** | `grade/engine.ts` via `truncateSubmission`, default from `gemini.ts:4` | No - only a sentence inside the prompt |
| 2 | 40-file cap, 220,000-byte digest cap | `github.digest.ts:59-60` | Sets `digest.truncated`, which the grading actions discard |
| 3 | 8,000-byte slice per file | `github.digest.ts:98-100` | Same discarded flag |
| 4 | Any blob >= 60,000 bytes never fetched | `github.digest.ts:74` | No |
| 5 | Extension allowlist; no-extension files dropped unless literally README/Dockerfile/Makefile | `github.digest.ts:8-14, 69-79` | No |
| 6 | A file whose fetch throws is skipped | `github.digest.ts:92-97` | No |

**Cut 1 is the dominant one.** The digest can assemble 220 KB and then have
~95% of it removed immediately before the model call. That is the likeliest
reason the owner saw code missing.

## Acceptance criteria

### C1 - a specified folder is a scoping decision, and must be honoured as one

1. **When a path prefix is given, the ingest budget rises to match.** The
   existing caps were chosen for "digest a whole repo for context"; a folder the
   instructor named is already narrow, and applying whole-repo caps to it
   discards the very thing they scoped to. Raise the file count, the total byte
   budget, the per-file slice and the per-blob ceiling substantially for the
   prefixed case. State the new numbers and why each is where it is.
2. **The per-submission character cap must not silently undo the ingest.** For
   repo grading the cap rises to a value chosen against the model's real
   context, not the current 12,000. `GRADE_MAX_CHARS_PER_SUBMISSION` must keep
   working as an override for anyone who sets it.
3. Caps still EXIST. "All code" is the goal; an unbounded prompt is a cost and
   failure risk, and a run that dies from an oversized request grades nothing.
   The requirement is that a normal assignment folder fits comfortably, not
   that no limit exists anywhere.

### C2 - nothing is dropped silently, ever again

4. Every exclusion is counted and reported back to the caller: how many files
   were skipped for type, for size, for the count/byte cap, and how many failed
   to fetch. A number the instructor can see is the difference between "the
   model read my folder" and "I assumed it did".
5. **`digest.truncated` must stop being discarded.** `gradeRepoAction` and
   `gradeReposAction` both compute it and drop it before returning - the one
   flag that exists to report this is thrown away on exactly the paths that
   needed it.
6. A prefix that matches NOTHING is reported as its own distinct outcome, not
   as an empty grade. A student who nested their folder one level deeper
   currently produces a silent near-empty digest.
7. Truncation of the merged submission is reported to the caller, not only
   written into the prompt.

### C3 - "all code" means code this app can read

8. The extension allowlist gains the common source extensions it lacks, and the
   no-extension case is fixed: `fileExt` splits the FULL PATH on ".", so a file
   with no dot returns the whole path and can never match - which is why only
   literal README/Dockerfile/Makefile survive. Extensionless scripts, `LICENSE`,
   `Procfile` and similar are dropped today.
9. Genuinely non-code artifacts stay excluded - images, archives, binaries,
   lockfiles, minified bundles and source maps. Pulling a PNG into a text prompt
   helps nobody. "All code" is not "all bytes".
10. `SKIP_DIR` keeps excluding `node_modules`, `.git`, build output and vendor
    directories even inside the chosen folder. A student who commits
    `node_modules` must not evict their own source through the byte budget.

### C4 - what must not change

11. The prefix match's semantics: case-insensitive, anchored at the path root,
    trailing slash enforced so `week1` cannot match `week10`. Do not make it
    fuzzy - a folder that matches nothing must be REPORTED (item 6), not
    guessed at.
12. The embedded (non-LLM) provider path, which already bypasses the character
    cap entirely.

### C5 - gates

`npx eslint` clean on touched paths; `npx tsc --noEmit` clean; full `vitest
run` green from the 13726 baseline measured at dispatch; `npx next build`
reaching "Compiled successfully" and "Finished TypeScript". The ingest
filtering decisions are pure and must be tested directly - vitest here is
node-env and collects only `src/**/*.test.ts`.
