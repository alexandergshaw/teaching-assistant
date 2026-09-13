# Traps: search and false absence

Every tool on this card can report "nothing found" when the thing is there. That
is worse than an error, because an error stops you.

**Every absence claim needs a canary that proves the instrument can find a known
positive.** "I searched and found none" is not a finding until the same search
has found something you planted. `src/lib/no-emojis.test.ts` and
`src/lib/use-server-exports.test.ts` both structure themselves this way: a
detector, a canary block that proves the detector fires on known-bad AND
known-good fixtures, and only then the real scan.

---

**`grep -P` is broken in this environment and fails in the direction that looks
clean.** Measured here:

```
grep -P "x" <file>            -> exit 2, "grep: -P supports only unibyte and UTF-8 locales"
grep -P "\x{1F600}" <file>    -> exit 0
```

A PCRE emoji scan therefore reports success without having checked anything.
Never build a check on `grep -P`.

**Do not hand-roll an emoji scan.** `src/lib/no-emojis.test.ts` owns the policy,
including its one authorized exception - a checklist prefix the owner asked for
explicitly and told us not to "fix" away in a future sweep. An ad-hoc scan has
no way to know about the exception, and one previously flagged it as a
violation.

**`grep -a` is required on `docs/REGRESSION.md`.** That file contains a raw NUL
byte, so plain `grep` classifies it as binary and prints nothing while exiting
cleanly - a silent false absence on the repo's own memory. The NUL got there
from the same defect the file documents as item 10.

**A file with a literal control byte drops out of every text tool at once.** A
composite map key written as `${name}\x00${index}` is fine as an escape; written
as a materialised NUL byte the string has the identical runtime value, so tsc,
eslint, vitest and the build all pass - and git calls the file binary, diffs
show nothing, and ripgrep skips it silently. In a repo that leans on source-text
tests, the file quietly drops out of its own wiring tests. `src/source-bytes.structure.test.ts`
is the byte-level check; a note describing the hazard could not catch it, and
did not.

**Write/Edit materialise `\uXXXX` escapes as the literal character.** This is
how the NUL got in, and it recurred across twelve files in one pass. When the
intent is an escape sequence in the source text, verify the bytes afterwards -
`src/source-bytes.structure.test.ts` owns the scan; do not hand-roll it.

**A stale worktree copy is returned FIRST by `Glob`.** There is a second git
worktree at `.claude/worktrees/friendly-meninsky-8032bc`. An agent can find a
path there, edit it, pass every gate, and change nothing in the real tree.
`git status --short` in the main checkout is the only acceptable proof that a
wave landed.

**A wrong glob syntax returns "no files found" instead of erroring.** The empty
result is indistinguishable from a real absence. Confirm the pattern matches
something you know exists before trusting a zero.

**A heading count is not an entry count.** `grep -ac "^## " docs/REGRESSION.md`
returns 364; the entries are numbered to 410. Do not infer one from the other -
read the tail for the next number.

**`gh` is not installed here.** Verify GitHub Actions runs through the web UI or
`curl`; a command that "found no failing runs" because the CLI is missing is a
false absence with a clean exit.

**Quoting a gate's own output into a doc trips the emoji gate.** Measured while
writing `this-repo.md`: `next build` prints a U+2713 check mark and `eslint`
prints a U+2716 cross mark, and pasting those lines verbatim as "what passing
looks like" produced four violations in `src/lib/no-emojis.test.ts`. The scan
covers `docs/` as well as `src/`. Describe the mark; do not paste it.
