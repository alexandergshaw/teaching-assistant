# A37, second pass - the block still holds

Row: `docs/backlog.yml`, `- id: 'A37'` now at line 569 (block `569-579`, read in
full this pass). Line numbers drifted from the prior pass's `562-572` because
four A39 waves landed between the two passes and added lines above this row's
position in the file - the row's own text is otherwise unchanged from what the
prior pass quoted (diffed by eye against `docs/a37-scope.md`'s quotation;
`state: 'unscoped'`, `blocked_by: ['A12', 'A13']` at line 576).

Prior pass: `docs/a37-scope.md`, commit `e068f80`, dated `2026-09-23 08:04:04
-0500` (`git log --format="%H %ci %s" -1 e068f80`). That pass's verdict was
"the block holds." This pass's job, per the brief, is to re-measure rather
than inherit that verdict, because multiple waves have landed on this area
since - including, by name, rubric provenance and a fingerprint leaf on the
grading path.

## Verdict up front

**The block still holds.** Nothing landed since `e068f80` touches the re-run
identity question A12 and A13 hold, or the zip-path identity question N15a
holds. Two commits did touch the exact two files A12's own note names as
where an identity answer would have to appear (`src/lib/grade/types.ts` and,
loosely, `src/lib/github.ts`) - but both add rubric-fingerprint provenance, a
different concern (which rubric a run graded against, not which submission
produced a row), and neither adds an id, a stable key, or anything else a
re-run could dispatch against. Section 2 has the diffs. This pass does not
scope a remedy, per the brief's instruction to stop here if the block holds.

## 1. What landed since the prior pass, on the files that matter

Command: `git log --oneline --since="2026-09-23 08:04:04" -- src/lib/grade/types.ts src/lib/grade/engine.ts src/lib/github.ts src/app/actions/grading.ts src/app/actions/github-repos.ts src/app/actions/github.ts src/app/components/GradingResults.tsx src/app/components/GradingTab.tsx src/app/components/GithubGradingPanel.tsx src/app/components/LiveFeedPanel.tsx`
(run from the repo root, Git Bash, `--since` set to the prior pass's own
commit timestamp so "since the prior pass" is exact rather than a round date).

Result, five commits:

| Commit | Date | Files touched (of the list above) |
|---|---|---|
| `c031050` | 2026-09-23 10:15:16 | `src/app/actions/grading.ts`, `src/app/components/GradingTab.tsx` |
| `a9d9771` | 2026-09-23 08:23:25 | `src/app/actions/grading.ts` |
| `8a977b1` | 2026-09-27 07:47:06 | `src/lib/grade/types.ts`, `src/lib/grade/engine.ts`, `src/app/components/GradingTab.tsx` |
| `775f26b` | 2026-09-27 08:12:23 | `src/app/components/GradingTab.tsx`, `src/app/components/LiveFeedPanel.tsx` |

(`src/lib/github.ts`, `src/app/actions/github-repos.ts`, `src/app/actions/github.ts`,
`src/app/components/GradingResults.tsx`, `src/app/components/GithubGradingPanel.tsx`
have zero commits in this window - confirmed by the same command returning no
line for any of them individually, re-run per file.)

## 2. What each commit actually did, opened directly

- **`c031050`** ("grading one submission no longer requires a zip", A39 wave
  1). `git show c031050 -- src/app/components/GradingTab.tsx` - adds
  `SINGLE_SUBMISSION_EXTENSIONS` and widens the file-input `accept` attribute
  and its caption. `git show --stat c031050` shows the rest of the diff is
  `src/app/actions/grading.budget.test.ts`, `src/lib/grade/single-file-entry.ts`
  and its test. Nothing here adds an id, a caller tag, or any field to
  `GradeResult`, `GradingRunOptions`, or the `GradingResults` mount props.
- **`a9d9771`** ("the zip path had no wire-budget check"). `git show a9d9771 --
  src/app/actions/grading.ts` - adds one `checkFileWireBudget` call before the
  zip is read. No identity field, no new `GradingRunOptions` member.
- **`8a977b1`** ("rubric memory and version provenance", A39 wave 2) - the one
  the brief names. `git show 8a977b1 -- src/lib/grade/types.ts`: adds two
  optional fields to `GradingRun` (not `GradeResult`) - `rubricUsed?: string`
  and `rubricFingerprint?: string` - stamped once per run to record which
  rubric text and content-fingerprint the run graded against, so editing a
  saved rubric later cannot change what a past run reports. `git show 8a977b1
  -- src/lib/grade/engine.ts`: stamps those same two fields at every
  `GradingRun` return site. Neither field is per-submission, neither is a re-run
  key, and neither touches `sourceIndex`, `GradeResult`, or `GradingRunOptions`.
  This is a rubric-identity mechanism, not a submission-identity one - the two
  are easy to conflate by name ("provenance", "fingerprint") but answer
  different questions. Its `GradingTab.tsx` hunk (rubric-memory restore UI) does
  not touch the `<GradingResults>` mount or its props.
- **`775f26b`** ("route an instructor with no Canvas credential to where they
  set one", A39 wave 5). `git show 775f26b -- src/app/components/GradingTab.tsx
  src/app/components/LiveFeedPanel.tsx` - adds a conditional credential-CTA
  link in both files and mounts `RubricProvenance` on `LiveFeedPanel` too.
  Neither hunk changes the `canvasUrl` or `editsSurface` arguments passed into
  `<GradingResults>`, and neither adds a `GradingRunOptions` member.

**None of the four commits bears on the re-run identity question.** They were
worth opening because the brief named this exact area as active, but the
diffs are additive in an orthogonal direction (rubric provenance, upload-type
widening, a wire budget, a credential CTA) and none of them is a false
negative on the identity question by virtue of being unrelated.

## 3. The identity question itself, re-read from current source

**`GradeResult` still carries no id.** `grep -n "as a re-run key\|sourceIndex:
number;\|export type GradeResult" src/lib/grade/types.ts` returns the same
three hits as the prior pass, at the same lines: the comment "// as a re-run
key re-runs the wrong student." at `:149`, `sourceIndex: number;` immediately
after at `:150` (and again at `:164` for the other member of the union), and
`export type GradeResult = GradedResult | UngradedResult;` at `:295`. No
drift, no change.

**`GradingRunOptions` still has exactly one member.** `sed -n '120,140p'
src/lib/grade/engine.ts`: the interface is declared at `:127` with its sole
member `readonly deadlineMs?: number;` at `:133` - identical to both the prior
pass's citation and the row's own instrument text. `8a977b1` did not touch
this interface (its new fields went on `GradingRun`, a different type).

**The GitHub-path identity gap is unchanged, and its file citation is more
precise than either A12's note or the prior pass's.** `parseRepoRef` is
defined at `src/lib/github.repos.ts:99` (`export function parseRepoRef(ref:
string): { owner: string; repo: string } | null`) and re-exported through the
barrel `src/lib/github.ts:27`. Its return type carries only `owner`/`repo`, no
stable id distinct from those two strings - so A12's own open question
("whether `parseRepoRef`'s output and a repo fullName are the same identity")
is exactly as open as before. `repoDigestToEmbeddedEntry` exists in **two**
places, both unchanged since the prior pass (zero commits touch either file,
per section 1): `src/app/actions/github.ts:574-596` (the function A13's note
cites) and a structurally identical sibling at `src/app/actions/github-repos.ts:602-621`.
Both build a `StudentSubmissionEntry` with only `student`, `content`,
`mergedFileCount`, `submittedFiles` - no `gradedRepo`, `gradedRef`, or
`userId`, confirmed by reading both functions in full. **Correction to A12's
own note, worth recording since it names the wrong file**: A12 assigns the
next identity chunk to "the next chunk whose write set includes
`src/lib/grade/types.ts` or `src/lib/github.ts`" - but `repoDigestToEmbeddedEntry`
lives in `src/app/actions/github.ts` (an actions file) and its sibling in
`src/app/actions/github-repos.ts`, neither of which is `src/lib/github.ts` (the
re-export barrel, which contains no identity-relevant logic itself). Whoever
picks up this chunk should target the actions files, not the barrel, or the
grep A12's own note recommends will find nothing.

**`gradeOneSubmissionAction` is still Canvas-only with one caller.**
`grep -rn "gradeOneSubmissionAction" src --include=*.ts --include=*.tsx | grep
-v "\.test\."` returns the definition at `src/app/actions/grading.ts:599` and
exactly one caller, `src/lib/workflows/registry/steps.grading-singles.ts:238` -
a workflow step, never a UI control. Unchanged from A13's own citation.

**Conclusion: on every file either row names as where an answer would have to
land, nothing has landed.** The two commits that did touch `types.ts` and
`engine.ts` this week added a rubric-identity mechanism, not a
submission-identity one, and the brief's own framing ("including rubric
provenance and a fingerprint leaf") is the reason this pass opened those two
diffs directly rather than trusting the commit summary - they turned out to be
adjacent, not responsive.

## 4. N15a, the third leg, re-read

`docs/backlog.yml:162-173`. **State changed since the prior pass: `unscoped`
before, `owner` now** (`:164`), and the row grew a `question:` field
(`:163`) that was not present when `docs/a37-scope.md` was written. Reading
it: it is a scoping seat's finding, filed 2026-09-23, presenting the owner
with two readings of the same feature and a recommendation, closing "NOTHING
IS BLOCKED: A39's own waves continue regardless." It is a question awaiting
the owner's answer, not a decision. The specific fact the prior pass drew
from N15a - "whether the multi-student bulk zip stays supported alongside
[one-upload-per-student]... Do not default it" (`:173`) - is not addressed by
the new `question:` field, which is about a different fork (repeated single
uploads vs. one multi-select upload) than the bulk-zip-coexistence question.
**N15a's zip-identity question is therefore still open, now explicitly with
the owner rather than sitting unscoped.** This is a status change worth
recording (moved from the scoping queue to the owner's queue) but not a
resolution, and it does not touch A12/A13's GitHub-path or Canvas-path
identity questions at all, which N15a never claimed to answer.

## 5. Disposition of the prior pass's "owed" table

`docs/a37-scope.md` section 7 named three items owed to clear the block, each
with an owner and a step. Re-checked against this pass's findings:

| Item owed (prior pass) | Disposition | Why |
|---|---|---|
| GitHub-path re-run identity (`parseRepoRef` vs. repo fullName) | **KEPT, citation corrected** | Still unanswered (section 3). Owner text corrected above: the actions files (`src/app/actions/github.ts`, `src/app/actions/github-repos.ts`), not `src/lib/github.ts`, are where the fix would land. |
| Canvas/zip-path re-run identity for a failed or bound-stopped row | **KEPT, unchanged** | `gradeOneSubmissionAction` is still the sole Canvas-only action, still one caller, still no UI wiring (section 3). No commit in this window touched it. |
| Whether the multi-student bulk zip stays supported alongside one-upload-per-student | **KEPT, status updated** | N15a moved `unscoped` to `owner` (section 4) but the specific question is still unanswered - the new `question:` field is a different fork of the same row. |

No item is withdrawn and none is handed to a new owner; this pass found no
basis to change any of the three assignments beyond the one file-path
correction above.

## 6. Residual register

Carried forward from `docs/a37-scope.md` section 8, re-verified rather than
copied, plus one addition from this pass:

| Entry | Owner | Instrument | Object | Direction of failure | Step |
|---|---|---|---|---|---|
| R1: GitHub-path re-run identity (`parseRepoRef` vs. repo fullName) unresolved | Next chunk whose write set includes `src/app/actions/github.ts` or `src/app/actions/github-repos.ts` (corrected from A12's own `src/lib/github.ts` citation - section 3) | Read `parseRepoRef` and its two `repoDigestToEmbeddedEntry` callers; yes/no on identity | Whether a dropped repo row carries a stable re-run key | A design or copy change ships that assumes re-run works on this surface before the yes/no exists | Next scoping pass on this area |
| R2: Canvas/zip re-run identity and reload survival unresolved | Whichever chunk next touches `GradingResults.tsx` / `src/lib/grade/types.ts` | Compare `gradeOneSubmissionAction`'s required inputs against `GradingResults`'s available fields | Whether a failed/ungraded row can be re-dispatched from the review table | Copy or a control implies re-run is available on this surface before this is settled | Next chunk touching those files |
| R3: multi-student bulk zip coexistence with one-upload-per-student identity | N15a's own scoping/owner resolution | Read N15a in full; decide, do not default | Whether two identity regimes coexist on the zip path | N15a ships silently defaulting to one regime, breaking the other without a stated reason | N15a's owner decision, then its scoping pass |
| R4: `editsSurface`'s two deliberate collapses (`"zip"`/`"canvas"` into `"canvas"`; `"livefeed"` into `"canvas"`) must not be widened without re-checking the shared-storage rationale | Whoever eventually implements A37's remedy | Re-read `GradingResults.tsx:114-123`'s doc comment and A36's own note before touching `editsSurface`'s value set | Whether widening the discriminator silently breaks A36's edits-sharing fix between `GradingTab` and `LiveFeedPanel` | A37's remedy widens `editsSurface` (or adds a second discriminator) without checking `GradingTab`/`LiveFeedPanel` still intentionally want to share one edits key | The build wave that finally implements A37, after the block clears |
| R5: a scoping pass on this row must grep the target component's own prop list before asserting a discriminator does not exist | Whoever scopes the next row in this family | `grep` the target surface's own props before writing "the surface cannot tell" | Whether a future row's premise matches the current tree | A future row repeats A37's own original gap | Every future scoping pass in this area |
| R6 (new this pass): two A39 waves (`8a977b1`, `775f26b`) added rubric-provenance and credential-CTA logic to the exact three mount files (`GradingTab.tsx`, `LiveFeedPanel.tsx`) this row's instrument reads - re-open and re-grep those three mounts' `canvasUrl`/`editsSurface` arguments before reusing this pass's line citations, since A39 is still landing waves on this area | Whoever next scopes or builds this row | `grep -n "<GradingResults" src -r --include=*.tsx` plus `grep -n 'editsSurface="'` on the three mount files | Whether the three mounts still supply the same four discriminator values this pass measured | A future pass inherits this pass's mount-site line numbers or prop values without re-running the greps, and A39 has since changed one of them | The next pass that touches this row, before trusting any line number cited above |

R1-R5 restate the prior pass's own residuals with one correction (R1's owner
file path); R6 is new, filed because A39's waves are landing on this exact
area weekly and the next pass should not inherit this pass's citations
uncritically either.

## 7. Verification

Per-argument wrapper run for the two gates this brief requires (not a raw
multi-path `vitest run`):

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Output (PowerShell, this pass):

```
Test Files  2 passed (2)
     Tests  21 passed (21)
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
EXITCODE=0
```

Exit code read from `$LASTEXITCODE` immediately after the run (PowerShell),
not through a pipe: **0**.

Write set for this pass:

```
git status --short
```

Result: this pass added exactly one new path, `?? docs/a37-scope-2.md`
(this file). All other entries in the same output are pre-existing and
untouched by this pass: ` M docs/a25-scope.md`, ` M docs/css-orphans.md`,
` M src/app/actions/deck-template-files.ts`,
` M src/app/components/ppt-design/GeneratePanel.tsx`, five modified files
under `src/app/components/walkthrough-announcement/`,
` M src/lib/decks/office-template-fill.test.ts`,
` M src/lib/decks/office-template-fill.ts`,
`?? src/lib/decks/fit-report.test.ts`, `?? src/lib/decks/fit-report.ts` - all
under other agents' write sets per this brief (`walkthrough-announcement`,
`grading-recording`, `snapshot-grading`, `ppt-design`, `src/lib/decks` are
explicitly out of scope here), none of which this pass opened for editing.

ASCII check for this file itself:

```
tr -d -c '\000' < docs/a37-scope-2.md | wc -c
```

run after writing the file, expected and required to return `0` (no NUL
bytes); a second check, `grep -n '[^ -~	]' docs/a37-scope-2.md`, is run to
catch any non-ASCII character (accented letters, curly quotes, em-dashes)
that a NUL scan would not catch, since the brief requires ASCII-only content
and not merely NUL-free content.

## 8. What this pass could not determine

- No component under test here renders (`docs/loop/this-repo.md` section 6),
  so nothing above is a rendering claim - all of it is a reading claim over
  the source, exactly as the prior pass stated.
- Whether the owner intends to resolve N15a's open `question:` (section 4)
  before or independently of A12/A13's GitHub/Canvas identity questions is a
  product sequencing call this pass does not make - it only reports that all
  three are still open today.
- Whether `8a977b1`'s rubric-fingerprint mechanism could later be repurposed
  or extended to also carry a submission-level identity is speculative design
  and out of scope for a pass whose brief is to re-measure the block, not to
  design around it.
