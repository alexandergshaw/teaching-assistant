# RULING 124: closing two proven holes in the GitHub-cohort over-tightening check

Written 2026-09-28. Scoped write set: `src/app/actions/action-guard-coverage-github-cohort.test.ts`
and this file. Sequenced ahead of sub-wave 7 so the ratchet is sound before
~18 more `GITHUB_NOT_OWNER_ONLY` entries land on top of it.

## The two holes, both proven by execution

The check in question is the M4b `it` in
`action-guard-coverage-github-cohort.test.ts`, titled (before this ruling)
"every GITHUB_NOT_OWNER_ONLY action still calls requireUser() directly - a
silent over-tightening would leave a stale reviewed-safe reason".

- **W1**: it asserted `requireUser()` was PRESENT, never that
  `requireAppOwner()` was ABSENT. A body calling both passed it while being
  owner-only in effect.
- **W2**: its collector (`collectActionExports()`) does not strip comments,
  so a leftover `// requireUser()` line satisfied the presence check.

### Reproduced before fixing, on `actions/visualizer.ts:275` (`extractDeckConceptsAction`, a real `GITHUB_NOT_OWNER_ONLY` entry)

Mutation: `await requireUser();` -> `await requireAppOwner(); // sweep
2026-09-28: was requireUser(), see the reviewed-safe note`.

Run: `npx vitest run src/app/actions/action-guard-coverage-github-cohort.test.ts`
against the UNFIXED test file.

```
Test Files  1 passed (1)
     Tests  5 passed (5)
```

GREEN, with `extractDeckConceptsAction`'s reviewed-safe reason in
`GITHUB_NOT_OWNER_ONLY` now false: the action is owner-only in effect and
nothing in the file said so. Four appended words defeated the check.

Restored from a `cp` backup taken outside the repo
(`<scratchpad>/backup/visualizer.ts.bak`); `md5sum` matched
(`1e63e0d2dd18207ba27335d8349e8ba5`) before and after every mutation in this
work, and `git status --short` shows `visualizer.ts` untouched throughout.

## The fix

Both landed inside `action-guard-coverage-github-cohort.test.ts`, in the same
write set as the check itself:

1. A `stripComments()` helper, duplicated (not imported) from
   `guard-overtightening.test.ts`'s own copy - block comments first, then
   line comments with the unanchored `/\/\/.*$/` form, which does not go
   blind on a trailing comment the way an anchored `^[ \t]*//` form would.
2. The M4b `it` now classifies the comment-stripped body and fails if
   `requireUser()` is absent OR `requireAppOwner()` is present - closing both
   W1 and W2 in the same clause, since a body with both guards fails on the
   "owner-only present" arm regardless of what the presence arm says.
3. A new positive-control `it` proving the stripper still sees a real guard
   call after a comment line, after a block comment, and after a line holding
   a URL in a string - and that a guard token appearing only inside a comment
   does not read as present.

No entry was added to or removed from `GITHUB_NOT_OWNER_ONLY`; its size pin
(`toBe(14)`) is untouched, as required - sub-wave 7 owns the next entries.

## Both reds, after the fix, same mutation site

**Comment-bypass mutation** (`requireAppOwner(); // sweep ... was
requireUser() ...`):

```
Tests 1 failed | 5 passed (6)

AssertionError: these GITHUB_NOT_OWNER_ONLY actions no longer read as
permissive-only once comments are stripped from their bodies. [...]
expected [ Array(1) ] to deeply equal []
+ [
+   "actions/visualizer.ts:269 extractDeckConceptsAction reads as
       \"owner-only\" once comments are stripped, but was reviewed as safe
       to stay permissive on requireUser() alone",
+ ]
```

**Plain tightening, no comment** (`await requireAppOwner();`, nothing else
changed) - run separately, after restoring and re-mutating, to confirm the
fix did not trade one hole for another:

```
Tests 1 failed | 5 passed (6)

AssertionError: these GITHUB_NOT_OWNER_ONLY actions no longer read as
permissive-only once comments are stripped from their bodies. [...]
expected [ Array(1) ] to deeply equal []
+ [
+   "actions/visualizer.ts:269 extractDeckConceptsAction reads as
       \"owner-only\" once comments are stripped, but was reviewed as safe
       to stay permissive on requireUser() alone",
+ ]
```

Both restored from the same backup; `md5sum` matched
(`1e63e0d2dd18207ba27335d8349e8ba5`) after each restore, and a `diff` against
the backup was empty both times.

## GREEN on the unmutated tree

```
npx vitest run src/app/actions/action-guard-coverage-github-cohort.test.ts
Test Files  1 passed (1)
     Tests  6 passed (6)
```

(5 pre-existing `it`s plus the new positive control; the M4b `it` itself was
rewritten in place, not added, so the file's own `it` count grew by exactly
one.)

## What this fix still cannot see

Stated in the test file's own header and repeated here:

- **A runtime bypass.** A source scan proves which guard IDENTIFIER a body
  calls, never that the guard's rejection is honoured - a call inside a
  swallowed `try`, or behind a condition that is never true, still reads as
  permissive. Not attempted here; the brief names this as an open residual
  with no scheduled step (RES-3 in `docs/overtightening-instrument.md`), and
  this ruling does not change that.
- **The two guard functions being made to agree at the guard level itself**
  (i.e. `requireUser()` rejecting a non-owner, or `requireAppOwner()`
  admitting one) - that is a separate, already-existing executing instrument
  (`src/app/actions/guard-overtightening.test.ts`'s last describe, and
  `src/lib/supabase/auth.test.ts:432-493`), not duplicated here.
- **`GITHUB_NOT_OWNER_ONLY`'s size pin can still be deleted in the same
  commit that flips a site**, if an implementer edits both. This ruling
  closes the source-shape hole (a flip that keeps the reason PRESENT and
  false); it does not add a second, independent enforcement of the count -
  that is the existing `toBe(14)` assertion, left untouched per the brief.
- **The comment stripper is lexical, not string-aware.** It has no notion of
  string or template-literal boundaries. The positive control proves the one
  shape actually present in this codebase (a URL literal on its own line,
  followed by a real call on a later line) is not eaten. It does not prove
  every conceivable string shape is safe.

## Gates

All exit codes read from the command itself, never through a pipe.

| Gate | Command | Exit | Result |
|---|---|---|---|
| Named paths | `npm run test:paths -- src/app/actions/action-guard-coverage-github-cohort.test.ts src/app/actions/action-guard-coverage.test.ts src/app/actions/guard-overtightening.test.ts src/lib/supabase/auth.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts` | 0 | `Test Files 6 passed (6)` / `Tests 90 passed (90)`, `COVERED` on all six paths (counts read from vitest's own summary, not the wrapper's exit code alone, per the brief) |
| Typecheck | `npx tsc --noEmit --incremental false` | 0 | zero bytes of output |
| Lint | `npm run lint` | 0 | `7 problems (0 errors, 7 warnings)`, none in the two files this ruling touched |
| Full suite | `npm test`, redirected to a file and read from the file | 0 | `Test Files 1154 passed (1154)` / `Tests 23098 passed (23098)` |

The full-suite count is the brief's baseline (1154/23097) plus exactly +1
test, +0 files: this ruling adds no new test file (it edits the existing
cohort file in place) - the M4b `it` was rewritten and one new
positive-control `it` was added, net +1 test in that one file. Re-measure
rather than trusting this table if the tree has moved on further.

Sizes, both counters:

| File | `wc -l` | `@(Get-Content <path>).Count` |
|---|---|---|
| `src/app/actions/action-guard-coverage-github-cohort.test.ts` | 582 | 582 |

Under the repo-wide 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts`, `LIMIT = 1000` at `:41`), no
`ALLOWED_OVERAGE` entry needed.

`git status --short` at the end of this work:

```
 M src/app/actions/action-guard-coverage-github-cohort.test.ts
?? docs/ruling-124.md
```

`src/lib/supabase/auth.ts` and `src/app/actions/visualizer.ts` (the only
files touched by any mutation in this work) are clean, verified by `md5sum`
against a backup taken outside the repo before and after every mutation, and
neither appears in `git status --short` above.

## Not done, per the brief

- `guard-overtightening.test.ts` was read (required, to understand the shared
  collector shape it duplicates) but not edited - it is a sibling instrument
  freezing an independent set, not owned by this write set.
- No entries were added to `GITHUB_NOT_OWNER_ONLY` - that is sub-wave 7's job.
- `GITHUB_NOT_OWNER_ONLY`'s missing size-pin-at-deletion-time residual (RES-1
  in `docs/overtightening-instrument.md`) is unchanged; that pin already
  exists (`toBe(14)`) and was left untouched as instructed.
