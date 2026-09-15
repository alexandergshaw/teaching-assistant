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
returns 382; the entries are numbered to 428 (re-measured 2026-09-15; this card
said 364 and 410, and `this-repo.md` said 366 - three different stale numbers
for one file). Do not infer one from the other, and do not quote any of them -
read the tail for the next number.

**`gh` is not installed here.** Verify GitHub Actions runs through the web UI or
`curl`; a command that "found no failing runs" because the CLI is missing is a
false absence with a clean exit.

**Quoting a gate's own output into a doc trips the emoji gate.** Measured while
writing `this-repo.md`: `next build` prints a U+2713 check mark and `eslint`
prints a U+2716 cross mark, and pasting those lines verbatim as "what passing
looks like" produced four violations in `src/lib/no-emojis.test.ts`. The scan
covers `docs/` as well as `src/`. Describe the mark; do not paste it.

**An identifier-shaped search cannot find a surface that reaches its data
another way, and its zero looks exactly like a real absence.** The A8 scoping
pass concluded "there is no surface in this tree that renders discussion
contributions as peer items" and named Canvas's own SpeedGrader as the likely
source of the owner's screenshot. Every piece of its evidence grepped for the
Canvas-discussion data layer - `DiscussionPost`, `initialPosts`, `isReply`,
`parentUserId`, `DiscussionActivity`, `contributionCount`. Each grep was
correct and each returned nothing. Two surfaces exist anyway:
`recording/DiscussionReplyTable.tsx` over a `ReplyRow` that carries `author`,
`postedAt` and `threadPosition: "root" | "reply"`, and the screen-capture
submissions list built from `ExtractedSubmission`. Neither mentions a single
one of those identifiers, because both reach the same real-world thing through
a different data source.

The tell is that the search terms all come from ONE module's vocabulary. When
you are looking for a SURFACE, search by what it would put on screen - a
per-item timestamp, a list of people's names, a heading with a particular word
in it, the CSS module beside it - not by the type name you happen to have in
hand. A zero from a single identifier family is evidence about that family and
nothing else.

The cost is not a wasted grep. That conclusion had already propagated into a
disposition row ("the surface is MISSING, not mislabelled - it must be built,
not corrected") and into a chunk whose `owns` pointed at a table the owner
never photographed. Both would have shipped green.

**When one line-level answer from the human would settle it, ask - but do not
wait.** The same A8 case: the owner knows which screen they photographed. That
is one sentence against an unbounded search, and `iteration-caps.md` names
asking the human a scope question as one of the three moves that ends a chain.
Ask it batched, alongside the work that does not depend on the answer, and
scope so both answers stay cheap.

**The Bash heredoc HALVES backslashes here, so a doubled escape reaches the
interpreter as a single one.** Measured 2026-09-15 while writing the card above.
A `python - <<'PY'` heredoc is supposed to pass its body through untouched, and
single-quoting the delimiter is the documented way to ask for that. It does not
hold in this environment: a body containing a doubled backslash followed by
`000` arrived at Python as a SINGLE backslash followed by `000`, which Python
read as an OCTAL ESCAPE and wrote as a real NUL byte into `docs/loop/this-repo.md`.
The card being written at that moment was the one explaining that the NUL was
gone. `src/source-bytes.structure.test.ts` caught it on the next run, after the
commit.

This is the same class as "Write/Edit materialise escapes", with a different
mechanism, so the same rule applies and one more: when a string must contain a
backslash, do not write the backslash - build it, `chr(92)` in Python, and
verify the bytes afterwards. A literal proved it: `b.replace(b'\', ...)`
in a heredoc failed with an unterminated-string SyntaxError, because the escape
that was supposed to protect the quote had already been eaten.

**`vitest` output contains NUL bytes, so piping it to `grep` reports "Binary
file (standard input) matches" and prints nothing.** A failing run then looks
like a silent pass. Pipe through `tr -d ''\000''` first, or use `grep -a`.
This is the same false-absence shape as the `REGRESSION.md` NUL, on a gate's own
output rather than on a document.

