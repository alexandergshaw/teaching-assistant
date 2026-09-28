# RULING 139: a brief's constraint is not a gate

## What happened

`docs/ruling-136.md` was committed carrying two U+276F arrows and four U+00D7
signs, pasted straight from vitest terminal output. `src/lib/no-emojis.test.ts`
flags both code points (U+276F sits inside the file's own Dingbats/arrow-like
detection range used for other glyphs, and U+00D7 falls in a range the scan
covers), and it cascaded: `src/tools/backlog/closure-runner.test.ts` spawns a
real `npx vitest run src/lib/no-emojis.test.ts` subprocess and asserts exit 0 /
`ok: true`, so the one pasted glyph failed two test files, not one. A sibling
agent working on an unrelated file found it. That is luck, not process.

The brief for that ruling stated, in words, "no vitest arrow glyphs in any
doc." The rule was written down, agreed, and violated anyway, because a
sentence in a brief is not a gate - nobody ran a command that would have
caught it before the commit landed.

## The fix

`npm run docs:gate` (added in `package.json`), which runs:

```
npm run test:paths src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts
```

via the `test:paths` wrapper (never a raw multi-path `vitest run` - a
structure test freezes the exact set of raw multi-path commands appearing in
`docs/**/*.md`, and the wrapper family is exempt from that freeze; using it
raw here would have made that structure test red the moment this doc was
written).

### Membership, and why each file is in or out

- `src/lib/no-emojis.test.ts` - the direct enforcer of AGENTS.md's no-emoji
  rule. Its own file-walk scans `src/` and `docs/` (its `roots` array), so it
  is the one that actually would have caught the pasted glyphs.
- `src/source-bytes.structure.test.ts` - also walks `docs/` (via its
  `TEXT_EXTENSIONS`/`collect()` over the repo root, `.md` included) and would
  catch a different class of doc-writing mistake this ruling is not about but
  that the same "pasted from a terminal" failure mode can produce: a literal
  control byte or a UTF-8 BOM from a shell redirect. Included because it scans
  the same surface (documents) for a sibling hazard, not because it is about
  emoji.
- `src/tools/vitest-paths/gate-commands.structure.test.ts` - its S8 block
  freezes the exact set of raw multi-path vitest commands appearing in
  `docs/**/*.md`. A doc that pastes a new raw multi-path command (rather than
  the `test:paths` wrapper) turns S8 red. This scans documents directly, so it
  belongs in a "does this doc pass what guards documents" gate.
- `src/tools/backlog/closure-runner.test.ts` - **deliberately excluded from
  membership.** It does not scan `docs/` or any document; it is a test of the
  backlog closure runner's own logic, and it only fails here as a side effect
  of spawning `no-emojis.test.ts` as a real subprocess inside one of its own
  assertions. It is collateral damage of the bug, not a guard of documents,
  so it does not belong in a script whose job is "gate a document." See
  "Scope" below for what this means for `docs:gate`'s coverage.

## Prove it

**1. Throwaway glyph, run, verbatim failure, cleanup.**

A file `docs/_throwaway-glyph-test.md` was created containing a single U+276F
arrow. `npm run docs:gate` was run against it and exited 1. The verbatim
failure:

```
 [FAIL marker] src/lib/no-emojis.test.ts (18 tests | 1 failed) 18ms
     [x] has no emoji anywhere in src/ or docs/ outside the authorized exception

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/no-emojis.test.ts > no emojis in the codebase (real source scan) > has no emoji anywhere in src/ or docs/ outside the authorized exception
Error: Found 1 emoji violation(s) of AGENTS.md's "no emojis in the codebase" rule. Remove the emoji, or - if this is a genuinely new, deliberately authorized exception like CHECKLIST_DONE_PREFIX - add it to AUTHORIZED_EXCEPTIONS in src/lib/no-emojis.test.ts with a one-line reason.

docs/_throwaway-glyph-test.md:3: "[U+276F glyph]" (U+276F)

 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 48 passed (49)
vitest exited 1
```

(The glyph itself is written here as `[U+276F glyph]` rather than pasted -
pasting it into this very doc would repeat the exact mistake this ruling
exists to prevent.) The file, line and code point are printed by
`no-emojis.test.ts` itself; `docs:gate` does not duplicate that reporting.
The throwaway file was then deleted and `git status --short` confirmed clean
of it.

**2. Green on the tree as it stands.**

`npm run docs:gate` on the real tree (glyphs already stripped from
`ruling-136.md`) passed: `Test Files 3 passed (3)`, `Tests 49 passed (49)`,
exit 0.

**3. The cascade.**

The same throwaway glyph was left in place and
`npm run test:paths -- src/tools/backlog/closure-runner.test.ts` was run
directly. It also failed - the subprocess-spawning test
`treats a real passing run as a PASSED verify` got `exitCode: 1` instead of
`0`, because the `npx vitest run src/lib/no-emojis.test.ts` it spawns
inherited the glyph failure.

**`docs:gate` does not surface this.** It does not run
`closure-runner.test.ts` (see "Membership" above), so a doc-writing agent who
runs only `docs:gate` sees the direct emoji failure and not the second,
independent test-file failure the same glyph causes. That is a known,
accepted gap, not an oversight: `docs:gate` gates documents, and
`closure-runner.test.ts` is not a document guard. A gate that reports half the
damage from one cause is still worth having - it stops the glyph from
shipping at all - but it should not be described as catching everything the
glyph breaks.

## Scope - what this catches and what it does not

`npm run docs:gate` catches: emoji/pictograph characters (the ranges
`no-emojis.test.ts` defines) anywhere under `src/` or `docs/`; literal control
bytes and UTF-8 BOMs anywhere the repo's text-extension walk reaches; and a
new raw multi-path vitest command pasted into `docs/**/*.md` instead of the
`test:paths` wrapper.

It does NOT catch: any other doc-writing defect no test scans for - broken
markdown, a stale citation, a wrong file path, a claim about the tree that
isn't true, prose that contradicts another section of the same doc, or any
character outside the code-point ranges `no-emojis.test.ts` treats as emoji
(curly quotes, en/em dashes, arrows used as UI affordances, and box-drawing
characters are explicitly NOT emoji per that file's own carve-outs, and this
script inherits that). It also does not, by itself, surface the
`closure-runner.test.ts` cascade documented above - run that file directly if
that specific interaction matters to the change at hand. This script converts
one class of brief-stated-but-ungated constraint into a command; it is not a
general document-quality gate, and no wording in this ruling should be read
as claiming that it is one.
