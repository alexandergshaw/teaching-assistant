# A37 scope - source discriminator for the grading review table

Row: `docs/backlog.yml`, `- id: 'A37'` at line 562 (block `562-572`, read in full
before this pass). State at read time: `unscoped`. `blocked_by: ['A12', 'A13']`
(line 569).

## Verdict up front

**The block holds. This scope does not choose a shape and does not produce a
build wave plan for the discriminator.** What is owed to clear it, and by
whom, is in section 6. Sections 1-5 are measurement and costing only - useful
to whoever clears the block, not a design commitment - per the brief's
instruction to establish them "whatever the block's status" while stopping
short of designing the remedy.

One finding changes the shape of the eventual work materially even though it
does not lift the block: a source-identifying value **already exists** on the
`GradingResults` props (`editsSurface`), shipped **today**, after A12/A13's own
notes were written, by a sibling row (A36) that measured the same three mount
sites. Section 3 has the citations. This does not answer the question A12/A13
gate - it changes which of A37's two candidate shapes is even live once the
gate opens.

## 0. Was the block deliberate, and does it still hold - the evidence

The row's own `note` field (`docs/backlog.yml:572`) states the block was
deliberate: "BLOCKED_BY A12 AND A13 ON PURPOSE: both hold the identity
question (a GradeResult carries no id and src/lib/grade/types.ts:143-149
states sourceIndex is not a re-run key), and a per-surface remedy that names a
re-run before that is answered ships a second false sentence."

I re-opened A12 and A13 in full (`docs/backlog.yml:249-259` and `:260-270`)
and then the tree, to see whether that identity question has since been
answered.

**A12's own note (`docs/backlog.yml:259`) says it has not**, in its own words,
naming A37 explicitly: "RES-2/RES-3, THE RE-RUN DESIGN QUESTION: whether a
single not-attempted row can be re-dispatched on its own, and whether
parseRepoRef's output and a repo fullName are the same identity. OWNER: the
next chunk whose write set includes src/lib/grade/types.ts or
src/lib/github.ts - the two files where a re-run identity would have to
appear - **and row A37, which is blocked_by this row and cannot be worked
until this answer exists.**" No such chunk has landed:

- `git log --oneline --since="2026-09-20" -- src/lib/grade/types.ts
  src/lib/grade/engine.ts` returns exactly one commit, `72058f9` (2026-09-23,
  "fix(a31): stop telling the instructor a re-run will grade the rest"). I
  opened its diff on `types.ts` (`git show 72058f9 -- src/lib/grade/types.ts`)
  and it adds `UNGRADED_NOT_ATTEMPTED_MESSAGES`, a frozen copy table - nothing
  about re-run identity.
- `git log --oneline --since="2026-09-20" -- src/lib/github.ts` returns no
  commits at all.
- `GradeResult` is still `type GradeResult = GradedResult | UngradedResult`
  (`src/lib/grade/types.ts:295`, confirmed by `grep -n "export type
  GradeResult" src/lib/grade/types.ts`) - no top-level id field.
- The "not a re-run key" comment A12/A13 both cite has moved slightly (line
  drift from the pre-72058f9 numbering) but still says the same thing today,
  at `src/lib/grade/types.ts:141-149`, ending at line 149 with "// as a
  re-run key re-runs the wrong student." (`sourceIndex` itself is declared at
  `:150`). Confirmed by `grep -n "as a re-run key\|sourceIndex: number;"
  src/lib/grade/types.ts`.

**A13's own note (`docs/backlog.yml:270`) says the same thing independently**:
"RE-RUN IS DEFERRED, NOT DROPPED, and the reason is identity:
repoDigestToEmbeddedEntry (github.ts:574-596) sets no
gradedRepo/gradedRef/userId, so a dropped repo's row carries only a display
label; types.ts:143-149 states outright that sourceIndex is not a re-run key;
and gradeOneSubmissionAction is Canvas-only and needs four values
GradingResults does not have." Nothing in the diffs above touches
`repoDigestToEmbeddedEntry` or `gradeOneSubmissionAction` either.

**The zip-path half of the same identity question is also still open**, in a
third row, `N15a` (`docs/backlog.yml:162`, state `unscoped`). Its note
(`docs/backlog.yml:172`) records the owner's decision that gave the zip path a
re-run identity ("each student will have their own zip... the upload is the
identity") and then states explicitly: "THE QUESTION THIS ROW MUST STILL
ANSWER: whether the multi-student bulk zip stays supported alongside it... Do
not default it." N15a is unscoped and unbuilt, so even the zip path's identity
regime is not settled tree-wide.

**Conclusion: the block has not lapsed.** Two independent rows (A12, A13) and
a third the identity question flows through (N15a) all still carry it as
open, and nothing in the commit history since either was scoped touches the
files their own notes name as where the answer would have to appear. Per the
brief, this scope stops short of designing the remedy and instead states
exactly what is owed (section 6).

## 1. Re-verified central measurements (all citations opened this pass)

**`GradingRunOptions` has exactly one member.** `grep -n "export interface
GradingRunOptions\|readonly deadlineMs" src/lib/grade/engine.ts` returns the
interface at `:127` and its sole member, `readonly deadlineMs?: number;`, at
`:133`. Unchanged from the row's own citation - no drift.

**Three mounts of `GradingResults`.** `grep -n "<GradingResults" src -r
--include=*.tsx` returns exactly three JSX mounts (plus the component's own
`forwardRef` definition at `GradingResults.tsx:181` and a `useRef` declaration
at `LiveFeedPanel.tsx:141`, neither a mount):

- `src/app/components/GithubGradingPanel.tsx:852`
- `src/app/components/GradingTab.tsx:427`
- `src/app/components/LiveFeedPanel.tsx:430`

Unchanged from the row's own citation - no drift.

**`canvasUrl` at each mount**, re-read directly:

- `GithubGradingPanel.tsx:854` - literal `canvasUrl=""`.
- `GradingTab.tsx:429` - `canvasUrl={canvasUrl}`, the component's own state,
  declared `useState("")` at `GradingTab.tsx:77` and set only by the Canvas
  URL field's `onChange` (`GradingTab.tsx:256`) or by `handleAutoGrade`
  (`GradingTab.tsx:139`) - empty on the zip branch and empty until either of
  those fires.
- `LiveFeedPanel.tsx:433` - `canvasUrl={canvasUrl}`, a prop passed down from
  the same `GradingTab` state (`LiveFeedPanel.tsx:104` declares it as a
  required `string` prop; `GradingTab.tsx:217` is where it is threaded into
  `LiveFeedPanel`).

So two of the three mounts (`GithubGradingPanel`, and `GradingTab` whenever
`source === "zip"`) genuinely share the empty string, exactly as the row
states. This part of the row is unchanged and confirmed.

## 2. What each caller could supply without new plumbing

I traced what value each of the three mount sites already has in scope, on
the theory that a discriminator only costs nothing if it does not need new
data threaded in.

- **`GithubGradingPanel.tsx:852`.** The entire component exists to grade
  GitHub repos; there is no ambiguity to resolve. It can supply the literal
  `"github"` with no new state.
- **`GradingTab.tsx:427`.** This single mount serves two different
  `GradingMode` values, not one: the surrounding render guard is `source !==
  "livefeed" && run && ...` (`GradingTab.tsx:426`), and that whole branch is
  itself the `else` of `source === "github" ? ... : source === "livefeed" ?
  ... : (<form>...)` (`GradingTab.tsx:208-227`) - confirmed by reading
  `GradingTab.tsx:205-230` and `:380-428` as one contiguous block, so the
  `<GradingResults>` mount at `:427` sits inside the `<form>` and only ever
  renders when `source` is `"zip"` or `"canvas"`. `GradingMode` is declared
  `"zip" | "canvas" | "livefeed" | "github"` at `GradingTab.tsx:26`, and
  `source` itself is already in scope at the mount site (declared
  `GradingTab.tsx:72`, read elsewhere in the same render at `GradingTab.tsx:230`
  for the `source === "zip"` branch). So this one mount can supply either of
  two distinct values, `"zip"` or `"canvas"`, at zero new plumbing cost - it
  already has the variable.
- **`LiveFeedPanel.tsx:430`.** `LiveFeedPanel` is its own component, mounted
  only when `source === "livefeed"` (`GradingTab.tsx:209-224`), and does not
  currently receive `source` as a prop. Exactly like `GithubGradingPanel`, it
  does not need to: it can supply the literal `"livefeed"` with no new
  plumbing, because the whole component's identity already is that value.

**So the three mounts can jointly supply four distinct values - `"github"`,
`"zip"`, `"canvas"`, `"livefeed"` - matching `GradingMode` exactly, at the
render layer, without adding a single new prop, state variable, or plumbing
hop.** This directly answers the "what can each caller actually supply"
question the row poses: none of the three mounts is short of information at
the render layer. The gap, if there is one, is not that a caller cannot name
its own surface - every one of them already can.

**The engine layer is a different, and worse, story.** I traced where
`GradingRunOptions` is actually constructed for the paths that reach
`GradingResults`:

- `gradeAction` (`src/app/actions/grading.ts:705`) is the single server
  action behind **three** of the four `GradingMode` branches: `page.tsx:63`
  wires it as `formAction` via `useActionState(gradeAction, ...)`, that
  `formAction` prop is threaded to `GradingTab` (used at `GradingTab.tsx:228`
  for the zip/canvas form) and is also invoked directly by
  `handleAutoGrade` (`GradingTab.tsx:148`), the Live Feed "Auto Grade" path
  (confirmed: `handleAutoGrade` calls `formAction(fd)` with `fd.set("canvasUrl",
  row.canvasUrl)` at `GradingTab.tsx:139-141`, no other discriminating field).
  Inside `gradeAction`, `GradingRunOptions` is built once, at
  `grading.ts:730`, from a `runDeadlineMs` FormData field alone - there is no
  field in that FormData object today that would let this one function tell
  zip, canvas, and Auto-Grade-livefeed apart from each other; a manual Canvas
  URL submission and an Auto-Grade dispatch both arrive as "non-empty
  canvasUrl, no file", indistinguishable from within `gradeAction` as
  written.
- The `"github"` branch does not go through `gradeAction` or
  `GradingRunOptions` at all for the interactive panel: `github-repos.ts:839`
  calls `gradeEntries([entry], instructions, effectiveRubric, provider)` -
  four arguments against `gradeEntries`'s six-parameter signature
  (`src/lib/grade/engine.ts:457-464`, where `pointsPossible` and `options:
  GradingRunOptions = {}` are the two omitted, defaulted parameters). So this
  call site does not merely lack a discriminator value for
  `GradingRunOptions` - it does not thread `GradingRunOptions` at all.
- `GradingRunOptions.deadlineMs` itself is written only by four unattended
  workflow-step files, re-confirmed this pass by `grep -rn "runDeadlineMs"
  src --include=*.ts --include=*.tsx | grep -v "\.test\."`:
  `steps.grading-cartridge.ts:105`, `steps.grading-draft-flow.ts:266`,
  `steps.grading-run.ts:479` and `:547` (A12's note cited `:478` and `:539`
  for the last two - both have drifted by one and eight lines respectively
  since that note was written; re-cite the numbers above, not A12's). None of
  `GradingTab.tsx`, `LiveFeedPanel.tsx`, or `GithubGradingPanel.tsx` write
  this field, confirmed by the same grep returning no hits in those three
  files.

**So at the point `GradingRunOptions` is actually constructed, a source
discriminator threaded there would (a) require new plumbing at every single
call site - a new FormData field through `gradeAction` for the three modes it
serves, and a wholly new parameter threaded through `github-repos.ts:839`'s
call for the fourth - and (b) even once built, would only ever be populated,
based on today's four writers, by the same unattended paths whose
`deadlineMs` value A12's own note already flagged as "copy for a state its
own surface cannot reach" (`docs/backlog.yml:572`, the RES-1 residual: "No
unattended run renders through GradingResults; those runs become drafts
rendered by DraftedGradesTab"). A source value written only by those four
call sites would inherit exactly the same unreachability.**

## 3. The reframe: a source discriminator already exists, shipped today

Row A37's premise, read literally, is that "nothing in the grading path knows
which caller produced the row... and the review-table surface cannot tell
either." I opened `GradingResults.tsx`'s props to check this against the
current tree rather than the row's own wording, per this repo's rule to brief
from the tree.

`GradingResultsProps` already carries a required `editsSurface: string` field
(`src/app/components/GradingResults.tsx:124`), documented at
`GradingResults.tsx:114-123`:

> "A36: which mount is rendering this (e.g. "canvas" for the classic
> zip/canvas flow and LiveFeedPanel.tsx, which intentionally share
> GradingTab's own canvasUrl state and are mutually exclusive in the UI;
> "github" for GithubGradingPanel.tsx). Used only to scope the persisted
> edits key... Required (not optional) so tsc forces every call site to
> answer explicitly."

Confirmed live at all three mounts (`grep -n 'editsSurface="' src/app/components/*.tsx`):

- `GithubGradingPanel.tsx:859` - `editsSurface="github"`
- `GradingTab.tsx:437` - `editsSurface="canvas"`
- `LiveFeedPanel.tsx:439` - `editsSurface="canvas"`

This landed at commit `6aa8e29`, 2026-09-23 01:41:06 (`git log -1 --format="%H
%ci %s" -S"editsSurface" -- src/app/components/GradingResults.tsx`), by row
**A36** (`docs/backlog.yml:554-561`, state `verification`), which measured the
exact same three mount sites A37 cites, on the same day, and shipped a
call-site-identifying prop as its fix for a different bug (edits from one
surface leaking onto another via a shared localStorage key).

**Reading the two rows side by side: A37's own instrument text does not
mention `editsSurface` at all** (`grep -c "editsSurface" docs/backlog.yml`
returns `0`), even though A37 was filed the same day, from the same
underlying "three mounts, two share an empty canvasUrl" measurement A36 also
made. This is not a stale citation - the code A37's instrument describes is
current - but the row's premise ("the review-table surface cannot tell
either") is measurably narrower than the tree: a caller-identifying prop
exists, is required at every call site, and is already wired at all three.

**What this does and does not change.** It does not answer the re-run
identity question A12/A13 hold, so it does not lift the block. What it
changes is which of A37's own two candidate shapes is still live once the
block clears: `editsSurface` is direct, present-day proof that the
`GradingResults`-prop shape costs nothing new to extend (section 2's finding
that all three mounts can already name themselves is not hypothetical - one
of the two values needed, `"github"` vs `"canvas"`, is already threaded this
way for a different purpose). The remaining gap is granularity, not
existence: `editsSurface` collapses `"zip"` and `"canvas"` into one value
(`"canvas"`, `GradingTab.tsx:437`) and collapses `"livefeed"` into the same
value again (`LiveFeedPanel.tsx:439`) - both collapses are **deliberate**, per
the same doc comment, because `GradingTab`'s classic flow and `LiveFeedPanel`
"intentionally share GradingTab's own canvasUrl state and are mutually
exclusive in the UI" and need one shared edits-storage surface. A37's
eventual work, whatever it turns out to be, must not casually widen
`editsSurface`'s own values without re-examining that shared-storage
rationale - that is a live constraint on the remedy, not a decision this pass
is making.

## 4. The two candidate shapes, costed against each other (not decided)

The row poses the choice as a `GradingResults` prop versus a
`GradingRunOptions` member. Section 2 and 3 already supply the facts a
costing needs; this section states what they imply without choosing.

**A `GradingResults` prop answers "who is rendering these rows to the
instructor" - the question per-surface copy needs.** All three render sites
already have the value in scope at zero new plumbing cost (section 2), and
one of the two needed distinctions is already live in exactly this form,
today, for a different purpose (section 3).

**A `GradingRunOptions` member answers "who asked the engine" - not the same
question.** It would cost new plumbing at every call site (a new FormData
field through the one `gradeAction` that serves three of the four modes
indistinguishably today, plus a wholly new parameter threaded through
`github-repos.ts:839`, which does not pass `GradingRunOptions` at all right
now), and even built, it would only be populated by the four unattended
workflow writers measured in section 2 - none of which render through
`GradingResults`. The row's own note already recorded the general shape of
this mistake for `deadlineMs` specifically ("copy for a state its own surface
cannot reach", `docs/backlog.yml:572`); a source member added the same way
would repeat it for the same reason - it would answer a question the
review-table's own copy is never in a position to see.

**On the measurements taken this pass, the prop is the shape that can answer
the question A37 exists to answer, and the option-member shape cannot reach
the surface at all under how the engine is called today.** This is not a
decision to build the prop - the block in section 0 still applies to any
build - it is the answer to "which question does the copy actually need
answered," which the brief asked this scope to state.

## 5. Whether a discriminator is needed at all

The brief's test: if fewer distinct values exist than surfaces, no
per-surface copy is possible and silence is the honest answer.

Measured in section 2: the three mounts can jointly supply **four** distinct
values (`"github"`, `"zip"`, `"canvas"`, `"livefeed"`) against **three** mount
sites (one of which, `GradingTab.tsx:427`, covers two of the four values
depending on `source`). Four values against three sites is not "fewer values
than surfaces" - if anything there are more candidate values than there are
physical mounts, because one mount does double duty. **The test in section
5's own terms does not foreclose a discriminator.** Whether one is actually
wanted, and in what shape, is exactly the question the block in section 0
defers - this section only establishes that the "not enough distinct values
to say anything" escape hatch does not apply here, so it cannot be the reason
to default to silence once the block clears.

## 6. The copy rule that binds any sentence this produces

A31 Ruling 1 (`docs/a31-rulings.md:18`, rule stated at `:29-31`): "a sentence
may assert only what holds on every caller and every reachable state... If
nothing is reliably actionable, say nothing rather than something false." Two
sentences in this family have already shipped false and been deleted (A31's
own history, and the row's `from` field pointing at `docs/a31-scope.md`
revision 2). Any per-surface copy this row eventually produces has to be
checked against every producer of the state it describes, not just the
surface it was written for - the same discipline A31 itself was filed to
enforce after the first version failed it.

This rule is also the mechanism of the block itself: a per-surface sentence
that names a re-run action is false unless the re-run identity question
(section 0) is answered for that surface. The `"github"` mount is the
sharpest case - it is the one surface where the identity question is
explicitly still open (A12's RES-2/RES-3) - so a source-discriminated
sentence on that mount that so much as gestures at "re-run this row" would be
exactly the second false sentence the block exists to prevent.

## 7. What is owed, and by whom, to clear the block

Not a build plan for A37 - the plan for the prerequisite the block names.

| Item owed | Owner (per the rows' own text) | Instrument | Step |
|---|---|---|---|
| GitHub-path re-run identity: whether `parseRepoRef`'s output and a repo fullName are the same identity, and whether a dropped row carries enough to re-dispatch | "The next chunk whose write set includes `src/lib/grade/types.ts` or `src/lib/github.ts`" (A12's own note, `docs/backlog.yml:259`) | Read `parseRepoRef` and its callers; answer yes/no on identity before any design | The next scoping pass on this area, per A12's own note - not a promised future pass (`docs/a31-rulings.md` RULING 5 forbids that routing) |
| Canvas/zip-path re-run identity for a failed or bound-stopped row, and whether that identity survives a reload | Unassigned in A13's text beyond "still to be established, not assumed" (`docs/backlog.yml:270`) | `gradeOneSubmissionAction`'s four required values versus what `GradingResults` actually holds (A13's own citation) | Whichever chunk next touches `GradingResults.tsx` or `src/lib/grade/types.ts` for this area |
| Whether the multi-student bulk zip stays supported alongside the one-upload-per-student identity regime | N15a's own scope, explicitly deferred ("Do not default it", `docs/backlog.yml:172`) | Read N15a in full and decide before N15a itself is built | N15a's own scoping pass, unscoped today |

Once all three land (or are affirmatively answered "no remedy is safe on this
surface"), A37 can be re-opened. At that point, sections 2-5 above are the
starting measurements - re-verify them again rather than trusting this
document's timestamps, since three sibling rows (A31, A36, N15a, A12/A13's
own residuals) are all touching this exact area in the same week.

## 8. Residual register

| Entry | Owner | Instrument | Object | Direction of failure | Step |
|---|---|---|---|---|---|
| R1: GitHub-path re-run identity (parseRepoRef vs repo fullName) unresolved | Next chunk touching `src/lib/grade/types.ts` or `src/lib/github.ts` (A12's own assignment) | Read `parseRepoRef` and callers; yes/no on identity | Whether a dropped repo row carries a stable re-run key | A design or copy change ships that assumes re-run works on this surface before the yes/no exists | Next scoping pass on this area (A12's own note) |
| R2: Canvas/zip re-run identity and reload survival unresolved | Whichever chunk next touches `GradingResults.tsx` / `src/lib/grade/types.ts` | Compare `gradeOneSubmissionAction`'s required inputs against `GradingResults`'s available fields | Whether a failed/ungraded row can be re-dispatched from the review table | Copy or a control implies re-run is available on this surface before this is settled | Next chunk touching those files |
| R3: multi-student bulk zip coexistence with one-upload-per-student identity | N15a's own scoping pass | Read N15a in full; decide, do not default | Whether two identity regimes coexist on the zip path | N15a ships silently defaulting to one regime, breaking the other without a stated reason | N15a's scoping pass |
| R4: `editsSurface`'s two deliberate collapses (`"zip"`/`"canvas"` into `"canvas"`; `"livefeed"` into `"canvas"`) must not be widened without re-checking the shared-storage rationale that motivated them | Whoever eventually implements A37's remedy | Re-read `GradingResults.tsx:114-123`'s doc comment and A36's own note before touching `editsSurface`'s value set | Whether widening the discriminator silently breaks A36's edits-sharing fix between `GradingTab` and `LiveFeedPanel` | A37's remedy widens `editsSurface` (or adds a second discriminator) without checking that `GradingTab` and `LiveFeedPanel` still intentionally want to share one edits key | The build wave that finally implements A37, after the block clears |
| R5: A37's own instrument text never checked for an existing discriminator prop before asserting none exists | Whoever scopes the next row in this family | `grep` the target component's own prop list before writing "the surface cannot tell", the way section 3 of this document did | Whether a future row's premise matches `GradingResultsProps` (or whatever surface it targets) as it exists at read time, not as an earlier note described it | A future row repeats A37's own gap and a scope is built on a premise the tree has already partly resolved | Every future scoping pass in this area, as a standing practice - no dedicated mechanical gate exists for this class in the repo today |

R4 and R5 are new to this pass; R1-R3 restate A12/A13/N15a's own already-filed
residuals so this document's disposition of the block is traceable to a
single place rather than three.

## 9. Verification

Per-argument wrapper run for the two gates this brief requires (not a raw
multi-path `vitest run`):

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Exit code, read from a file rather than a pipe (`$?` captured immediately
after the run, written to a scratch file, then read back):

- Exit code: 0 (both test files passed; see command transcript captured this
  pass - `src/lib/no-emojis.test.ts` and `src/source-bytes.structure.test.ts`
  both green, no failing assertions).

Line counts for every file this document cites a size for, both counters
named:

| File | `wc -l` | PowerShell `(Get-Content).Count` |
|---|---|---|
| `src/lib/grade/types.ts` | 406 | 406 |
| `src/lib/grade/engine.ts` | 498 | 498 |
| `src/app/components/GradingResults.tsx` | 906 | 906 |
| `src/app/components/GradingTab.tsx` | 476 | 476 |
| `src/app/components/GithubGradingPanel.tsx` | 901 | 901 |
| `src/app/components/LiveFeedPanel.tsx` | 719 | 719 |

Both counters agree on all six files measured this pass (no CRLF drift found
here; the 42/62/67/127-line disagreements this repo has recorded elsewhere are
on different files, not these).

Absence-claim canaries (run before trusting the zero-result greps used
above, never piped through `head`):

- `grep -c "editsSurface" docs/backlog.yml` returns `0` (verified the grep
  itself fires on a positive case first: `grep -n "editsSurface"
  src/app/components/GradingResults.tsx` returns four hits, so the pattern is
  not silently broken - it is genuinely absent from `docs/backlog.yml`).
- `git log --oneline --since="2026-09-20" -- src/lib/github.ts` returns
  nothing; canary-checked by running the same command with a known-touched
  file (`src/lib/grade/engine.ts`) which does return a commit, confirming the
  `--since` filter and path filter are both live.

Write set for this pass, exactly one file:

```
git status --short
```

Result: ` M docs/a24-scope.md`, ` M docs/a32-scope.md`, ` M docs/css-orphans.md`
(pre-existing, from other concurrent agents - not touched by this pass), plus
`?? docs/a37-scope.md` (this file, new). No other path was written.

## 10. What this pass could not determine

- No component under test here renders (`docs/loop/this-repo.md` section 6),
  so nothing above about which value a mount "would render as" is a rendering
  claim - all of it is a reading claim over the source, routed here for the
  owner's own confirmation on a real screen if and when a remedy ships.
- Whether the owner considers per-surface copy about GitHub re-runs valuable
  enough to justify the identity work in section 6's table is a product
  question this pass does not answer - it only states what is owed
  mechanically to make such copy true.
- Whether `editsSurface`'s two collapses (R4) are still wanted once a genuine
  source discriminator exists is an open design question for whoever clears
  the block, not something this pass can settle without also designing the
  remedy.
