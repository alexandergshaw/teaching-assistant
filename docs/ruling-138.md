# RULING 138: shrink-only ratchet on wholesale `@/lib/supabase/auth` mocks

Source: `docs/r2-overtightening-audit.md`, residual RES-E. "Whether the 82
wholesale auth mocks under `src/app/actions` are being added faster than they
are removed. 81 at `269e58d`, 82 at `587c210`. Each one blinds its file to
every guard change." The audit found the growth mid-session, while other R2
sub-waves were busy landing NEW executing-guard tests
(`canvas-inbox.guard.test.ts`, `grading.guard.test.ts`,
`submission-repo.guard.test.ts`, and six more) precisely because the files
they cover cannot see their own guard - nothing in the repo was watching the
population size or membership.

## The headline: a false-clean instrument, found twice now

The audit's own measurement command reports a clean population of zero:

```
git grep -F -l -e 'vi.mock("@/lib/supabase/auth"' HEAD -- src/app/actions
```

returns **0** on this machine. The working tree actually holds **82** files
matching that exact string. The gap is not a stale index or a missed commit -
`git grep` here is passed through MSYS's argument path-conversion layer, which
rewrites a token that looks like a path (`@/lib/supabase/auth`, or more
precisely the whole `-e` argument containing it) before `git` ever receives
it. The fix confirmed by the audit and reproduced below is
`MSYS_NO_PATHCONV=1`, which disables that rewrite for the one command.

**A search that returns zero because the shell silently rewrote the argument
is worse than no search at all** - it reports confidence rather than absence
of a check. This is the SECOND instrument trap of this exact shape recorded in
this repo, a direct sibling of the `grep -P` trap already on file
(`docs/loop/...` memory: "Emoji scan: use the committed test - never hand-roll
one ... `grep -P` here reports clean without checking"). Both traps share the
same failure mode: a command-line tool available on this machine silently
mangles or ignores a pattern, and the tool still exits 0 with an empty match
list, which is indistinguishable from "checked, found nothing" unless the
count is cross-checked with a second, differently-broken-or-not tool and a
positive canary.

## Measurement, reproduced

Naive (the audit's own reported false clean):

```
$ git grep -F -l -e 'vi.mock("@/lib/supabase/auth"' HEAD -- src/app/actions | wc -l
0
```

Corrected, two independent tools, in agreement:

```
$ MSYS_NO_PATHCONV=1 git grep -F -l -e 'vi.mock("@/lib/supabase/auth"' HEAD -- src/app/actions | wc -l
82

$ grep -rlF 'vi.mock("@/lib/supabase/auth"' src/app/actions | wc -l
82
```

Canary (proves the search mechanism itself is not broken - a pattern known to
exist widely in the same directory):

```
$ MSYS_NO_PATHCONV=1 git grep -c 'requireOwner' HEAD -- src/app/actions | wc -l
147
```

147 files matched the canary, so the zero above is not "the tool is broken and
reports zero for everything" - it is specific to the `@/lib/...`-shaped
pattern, consistent with the MSYS path-conversion theory.

The new ratchet test itself
(`src/app/actions/wholesale-auth-mock-population.structure.test.ts`) never
shells out to `git grep` at all - it reads files directly with Node's `fs` and
a plain regex, which has no MSYS argument-rewriting step in its path, so it
cannot repeat this exact trap. It carries its own canary
(`requireOwner\s*\(` over the same directory) as a second, independent
insurance against a future regression in its own read/match logic reporting a
silent zero.

## The exact-set-versus-count decision

The audit's own suggested resolution shape for RES-E was a count pin, in the
style of `MEDIA_OWNER_ONLY_ACTIONS.length` at
`action-guard-coverage.test.ts:599`. **This ratchet instead freezes the exact
sorted file-name array** (`FROZEN_WHOLESALE_AUTH_MOCK_FILES`), compared with
`toEqual([])` against the set difference, not a bare `.length` comparison.

What a count alone would miss, concretely: if a file left the population
(someone rewrote its mock to the `*.guard.test.ts` idiom - real progress) in
the same commit that a different, previously-clean file added a fresh
wholesale mock, a count pin at 82 would see 82 before and 82 after and pass
silently. That swap is exactly the kind of churn RES-E exists to catch - "are
they being added faster than removed" is a question about the SET, not just
its size. An exact-set comparison catches it: the sorted array changes even
when its length does not.

The cost of the exact-set choice, paid deliberately: a legitimate rename of a
covered file must also touch this ratchet file. That is treated as a feature,
not friction - matching the `REVIEWED_PERMISSIVE` idiom in
`guard-overtightening.test.ts`, which reasons the same way about the same
shape of problem ("a derived set forgets an entry at exactly the moment the
entry is deleted... two lists that disagree is a failure mode this repo has
shipped"). A rename is exactly the moment a human should look at whether the
file still deserves a wholesale mock at all, not a maintenance tax to route
around with a weaker instrument.

## Shrink-only semantics

- Removing a name from `FROZEN_WHOLESALE_AUTH_MOCK_FILES` is always safe and
  never fails the ratchet (a file leaving the live population, or the frozen
  list no longer naming a file that moved to the executing-guard idiom).
- The ratchet fails only when the LIVE scan finds a `vi.mock("@/lib/supabase/
  auth", ...)` in a file that is NOT in the frozen list - i.e. growth. Adding
  one is possible, but only by also editing this file in the same commit,
  which is the deliberate, reviewed act RES-E asks for.
- The failure message tells the implementer what to do instead: mock
  `@/lib/supabase/server` and `@/lib/supabase/app-users`, never
  `@/lib/supabase/auth` itself, following `canvas-inbox.guard.test.ts`,
  `grading.guard.test.ts`, and `submission-repo.guard.test.ts`.

## Proof run (this session)

**RED - adding a file to the pattern:**

A throwaway file `src/app/actions/__ruling138-throwaway.test.ts` containing
`vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn() }));` was
created. `npm run test:paths --
src/app/actions/wholesale-auth-mock-population.structure.test.ts` then failed:

```
× the live population of wholesale-auth-mocking files has not grown beyond the frozen set
AssertionError: ... expected [ '__ruling138-throwaway.test.ts' ] to deeply equal []
- []
+ [
+   "__ruling138-throwaway.test.ts",
+ ]
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

The throwaway file was then deleted and `git status --short` confirmed the
tree held no trace of it.

**GREEN - removing one from the live population, shrink-only:**

`src/app/actions/announcement-image.test.ts` line 12 was changed from
`vi.mock("@/lib/supabase/auth", ...)` to
`vi.mock("@/lib/supabase/auth-TEMP-SHRINK-TEST", ...)` (simulating that file
leaving the wholesale-mock population while the frozen list still names it -
exactly the "removal is fine" case). The same command then passed:

```
PASS src/app/actions/wholesale-auth-mock-population.structure.test.ts (4 tests) 32ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

The file was restored from a copy taken OUTSIDE the repo
(`/tmp/ruling138-backup/announcement-image.test.ts.bak`, copied before the
edit) via `cp`, and `diff` against that backup reported no differences
(byte-identical). `git status --short` on that path showed no change.

## Non-vacuity

The ratchet asserts, independently of the shrink-only check: the frozen list
is non-empty; the file walk under `src/app/actions` finds more than 100 test
files (proving the directory walk itself works); and the canary pattern
(`requireOwner\s*\(`) is found in at least one file (proving the regex-match
mechanism itself works, so a "found 0 wholesale mocks" result cannot be
silently caused by a broken scanner rather than a genuinely clean tree).

## What the ratchet cannot see

Stated in the test file's own header, repeated here:

- A file that stubs the guard through an INDIRECTION - mocking a local wrapper
  module that itself re-exports `requireUser`/`requireAppOwner` from
  `@/lib/supabase/auth` - is invisible to this scan. It is a literal
  source-text match on `vi.mock("@/lib/supabase/auth"` (either quote
  character), nothing more.
- A file that mocks a DIFFERENT module which happens to re-export the guard
  functions under new names is equally invisible.
- Whether any individual entry's wholesale mock is actually JUSTIFIED (a pure
  business-logic test with no guard-relevant branch) versus a real coverage
  gap. This ratchet freezes population size and membership; it does not audit
  each entry's merit. That audit is exactly the "dedicated pass, not an R2
  sub-wave" RES-E already assigned to the repo owner.

## Files touched by this ruling

- `src/app/actions/wholesale-auth-mock-population.structure.test.ts` (new) -
  the shrink-only ratchet.
- `docs/ruling-138.md` (this file).
