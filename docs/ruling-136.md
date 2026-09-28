# RULING 136 - the symbol-count tool's lexical scan swallowed real code, and its own fixture set could not see it

Fix for `src/tools/symbol-count/count.ts`, the two-instrument counting tool
shipped at `587c210` (RULING 135). `docs/r2-overtightening-audit.md` finding
F1, written within an hour of that commit landing, found a defect of exactly
the shape the tool was built to prevent.

## The lesson first, because it is the point of this document

**A tool built to prevent a measurement error shipped with a fixture set that
omitted the breaking case.** RULING 135's own test file (`count.test.ts`) had
twenty-three tests proving the AST walk, the comment/string split, the
reconcile flag, and the naive-grep comparator - and not one of them contained
a `${`. `grep -n '\$\{' src/tools/symbol-count/count.test.ts` returned no
output before this ruling. The tool's own header even documents, in detail,
the class of thing an AST walk cannot see (string-built and
template-substituted symbols) - the author was thinking about templates and
still did not write a fixture that put one in the lexical scanner's path. The
fix here is not interesting; a hand-rolled tokenizer meeting a compiler API's
sharp edge is an ordinary bug. What is worth recording is that a tool
explicitly designed to replace "trust the number" with "two instruments that
must agree" was itself trusted on the strength of its test file, and the test
file's coverage had the identical shape as the `grep -c` mistake RULING 135
was written to retire: assertions that only exercise the easy cases inflate
confidence without inflating coverage. The instrument for catching that (a
fixture set deliberately shaped like the failure mode, not just like the
feature) has to be applied to the tool itself, not only to the things the
tool measures.

## The defect

`scanCommentsAndStrings` (`count.ts`, instrument 2) walked the TypeScript
compiler's scanner with a plain `scanner.scan()` loop. The TypeScript scanner
does not automatically know that a `}` closes a template substitution
(`${...}`) rather than a block or an object literal - that requires calling
`reScanTemplateToken()` at exactly that `}`, the same way a JSX `>` requires
`reScanJsxToken()` and a `/` requires `reScanSlashToken()`. Without it, the
`}` comes back as a plain `CloseBraceToken`, the scanner stays in "code"
mode, and the template's own closing backtick is then misread as the
OPENING delimiter of a brand new string/template token - swallowing
everything up to the next backtick (or EOF) in the file, real code included,
into what the tool reports as a string.

Confirmed independently of the audit before touching the fix:
`grep -c 'reScanTemplateToken' src/tools/symbol-count/count.ts` returned `0`
on the pre-fix file, and `grep -c '\${' src/tools/symbol-count/count.test.ts`
returned `0` on the pre-fix test file - both cited in RULING 136's own text.

## The fix

`scanCommentsAndStrings` now tracks a stack of markers, one entry per
currently-open template substitution or nested code-brace pair, using the
same shape TypeScript's own fast import scanner uses for this exact problem
(`processImports` in `node_modules/typescript/lib/typescript.js`, which finds
`import(...)` calls inside template literals without a full parse):

- `TemplateHead` seen -> push `TemplateHead`.
- `OpenBraceToken` seen while a substitution is open -> push `OpenBraceToken`
  (so `${ {a: 1} }`'s own object-literal braces are not mistaken for the
  substitution's closing brace).
- `CloseBraceToken` seen while the stack is non-empty -> pop. If what was
  popped was a `TemplateHead`, call `scanner.reScanTemplateToken(false)`
  instead of accepting the plain token; that returns `TemplateMiddle`
  (another substitution follows - keep the `TemplateHead` marker on top of
  the stack) or `TemplateTail` (the template ends here - the pop stands).

This handles arbitrary nesting (a template inside another template's
substitution) because each nesting level gets its own stack entry, and it
leaves the AST walk (instrument 1) untouched - the AST walk was never wrong.

## New fixtures, and whether each failed before the fix

All five live in `src/tools/symbol-count/count.test.ts` under
`describe("RULING 136 - the lexical scan must re-enter template mode after a ${...} substitution")`.

| Fixture | Shape | Failed before fix? |
|---|---|---|
| "does not swallow a real call AFTER a substituting template into excludedAsString" | RULING 136 F1's own reproduction: `` `hello ${x} world` `` followed by a real `guardFn()` call | **Yes.** `excludedAsString` was 1 (the call text was swallowed into the runaway mis-scanned string) and `instrumentsReconcile` was `false`. |
| "handles a template nested inside another template's substitution" | `` `outer ${`inner ${x}`} end` `` followed by a call | **No, coincidentally.** The source has an even number of backticks (4), so the pre-fix scanner's mis-paired tokens happened to close before EOF without swallowing the trailing call. The tokenization was still semantically wrong (token boundaries did not correspond to the real template structure), it just didn't happen to corrupt this particular fixture's aggregate counts. Kept in the suite because after the fix it exercises the stack's nesting logic (two `TemplateHead` entries, inner closes first) on purpose rather than by luck. |
| "handles a complete (non-substituting) template literal nested inside a substitution" | `` `outer ${`plain-inner`} end` `` followed by a call | **Yes.** The outer template's own closing `}` was never re-scanned, so its tail backtick was misread as opening a new unterminated string that ran to EOF and swallowed the call. |
| "counts a call INSIDE a `${...}` substitution as a call, never as string content" | `` `before ${guardFn()} after` `` | **No.** The corruption only swallows text AFTER the mis-scanned brace; the call sits before it in this fixture, so `excludedAsString` was already 0 and `callCount` was already 1 pre-fix. Kept as a named regression guard for the requirement stated in the brief, not as a claim it was broken. |
| "does not let a comment mention after a substituting template get misclassified as a string" | `` `before ${guardFn()} after` `` followed by a line comment mentioning the same symbol | **Yes, in classification, but `instrumentsReconcile` was ALREADY `true` before the fix too.** Pre-fix: `excludedAsComment=0`, `excludedAsString=1` (the comment text was swallowed into the runaway string token) - wrong bucket, right total (`codeOccurrences(1) + comment(0) + string(1) = 2`, matching the file's true 2 whole-word occurrences), so the reconcile flag could not see the misclassification. This is the fixture that proves the reconcile-flag finding below. |

## RED, then GREEN

RED (`npx vitest run src/tools/symbol-count/count.test.ts`, run against the
tree before the fix in `count.ts` was applied, only the new fixtures added):

```
 ❯ src/tools/symbol-count/count.test.ts (24 tests | 3 failed) 185ms
     × does not swallow a real call AFTER a substituting template into excludedAsString (RULING 136 F1's own fixture)
     × handles a complete (non-substituting) template literal nested inside a substitution
     × does not let a comment mention after a substituting template get misclassified as a string - and shows instrumentsReconcile cannot catch a comment/string swap

 Test Files  1 failed (1)
      Tests  3 failed | 21 passed (24)
```

Each failure was the expected shape: `excludedAsString` reported `1` where
`0` was expected (fixtures 1 and 3), and `excludedAsComment` reported `0`
where `1` was expected (fixture 5).

GREEN (`npx vitest run src/tools/symbol-count/count.test.ts`, after the fix):

```
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

## The mutation that must turn a fixture red

Mutation: removed the `reScanTemplateToken()` call and its branching
entirely, replacing the whole `if (top === TemplateHead) { reScan; ... } else
{ pop }` block with a bare `templateStack.pop()` - i.e. every `CloseBraceToken`
while the stack is non-empty is accepted as a plain token, which is exactly
the pre-fix behavior for the case that matters (a substitution's closing
brace). Re-ran `npx vitest run src/tools/symbol-count/count.test.ts`:

```
 ❯ src/tools/symbol-count/count.test.ts (24 tests | 3 failed) 106ms
     × does not swallow a real call AFTER a substituting template into excludedAsString (RULING 136 F1's own fixture)
     × handles a complete (non-substituting) template literal nested inside a substitution
     × does not let a comment mention after a substituting template get misclassified as a string - and shows instrumentsReconcile cannot catch a comment/string swap

 Test Files  1 failed (1)
      Tests  3 failed | 21 passed (24)
```

Identical to the pre-fix RED run, as expected - the mutation reproduces
exactly the defect the fix removes. Restored from the out-of-repo backup
(`cp` to the scratchpad before any edit) and diffed against the working tree:
the diff after restoring showed only the intended fix relative to the
pre-ruling file, confirming the mutation left no residue.

## The `instrumentsReconcile` flag: narrowed, not fixed further

The brief asked whether the reconcile flag can be made to mean what it
claims. **It cannot, fully, and the fix does not try to make it do so - the
claim in its doc comment is narrowed instead.**

`instrumentsReconcile` checks one equality:
`codeOccurrences + excludedAsComment + excludedAsString === totalWholeWordInFile`.
That equality can only ever detect a disagreement about the TOTAL between the
AST walk and the lexical scan combined. It structurally cannot detect a
misclassification WITHIN the lexical scan's own two buckets - an occurrence
that belongs in `excludedAsComment` but lands in `excludedAsString`, or vice
versa, changes neither side of that sum, so the flag stays `true`. There is
no second, independent instrument for the comment/string split the way the
AST walk is independent of the lexical scan for the code/not-code split; the
comment/string split rests entirely on the lexical scanner's own token
classification, and RULING 135 built the flag as if it verified that split
too.

The fifth fixture above ("comment mention after a substituting template")
demonstrates this directly: before RULING 136's fix, the comment's mention
was misclassified as a string, but `instrumentsReconcile` was `true` in both
the broken and the fixed version, because the total was right either way.

**Resolution:** `instrumentsReconcile`'s doc comment in `count.ts` is
rewritten to state the narrower, true claim - "the two instruments agree on
the TOTAL," not "the comment/string split is correct" - and the reconciliation
comment at its computation site cross-references the same narrowing. The
underlying comment/string split is now correct because RULING 136 fixed the
scanner defect that was producing wrong splits, not because the flag can
verify it. A future caller who wants an alarm for a comment/string swap
specifically would need a third instrument (for example, comparing the
lexical scan's comment/string counts against `ts.getLeadingCommentRanges`'s
independently-derived comment span list) - not attempted here; it is a new
instrument, out of this ruling's scope, and is a residual.

## The `.tsx` / JSX limitation: re-examined, kept open as a separate gap

The brief asked whether the tool's documented JSX limitation ("the scanner
does not specially re-scan JSX text runs, so the comment/string split is
provisional for `.tsx`") is the same defect wearing a different hat.

**It is not the same mechanism, and it is not fixed in this pass.** The
template defect corrupted the token STREAM itself: a stray backtick from a
misread `}` swallows everything up to the next backtick, including unrelated
real code, into a false string/comment count - a cascading, false-POSITIVE
failure mode. The JSX gap (missing `reScanJsxToken()` calls for literal JSX
child text) does not corrupt the stream the same way: `<` and `>` remain
their own tokens, and JSX text still scans as ordinary
identifiers/punctuation/whitespace with no runaway consumption. A symbol
occurring in literal JSX text is simply never bucketed as a comment or a
string (and is not an `Identifier` either, so the AST walk does not count it
as code) - an UNDER-count of that one occurrence, not a cascading MIS-count
of unrelated code elsewhere.

Fixing the JSX gap properly needs its own state machine mirroring
`reScanJsxToken`'s open/close-tag tracking and its own `.tsx` fixtures,
neither of which is in this ruling's write set
(`src/tools/symbol-count/count.ts`, `count.test.ts`,
`docs/ruling-136.md`). The module header in `count.ts` now states this
distinction explicitly (mechanism differs: corruption vs. undercount) rather
than leaving the two limitations looking interchangeable. This is a residual,
not a decision to leave it broken silently.

## Confirmation that `callCount` semantics are unchanged

The fix touches only `scanCommentsAndStrings` (instrument 2, the lexical
scan). `walkAst` and `classify` (instrument 1, the AST walk that produces
`declarationCount`/`callCount`/`referenceCount`) were not edited at all - diff
against the pre-ruling backup shows zero changes outside
`scanCommentsAndStrings`, its surrounding doc comments, and the
`instrumentsReconcile` doc comment and reconciliation-site comment. Every new
fixture's `callCount` assertion (all five assert `callCount === 1` where a
real call is present) passes both before and after the fix, confirming the
AST instrument's classification did not move. **The 71-site count in
`docs/r2-overtightening-audit.md`, which rests on `callCount`, is unaffected
by this fix.**

## Gates run, with true exit codes

- `npx vitest run src/tools/symbol-count/count.test.ts` - RED (3 failed / 21
  passed) before the fix, GREEN (24 passed) after, and again GREEN (24
  passed) after restoring from the mutation-kill test. Exit code 0 in the
  passing runs (vitest's own pass/fail counts are quoted above, not inferred
  from the exit code).
- `npm run test:paths -- src/tools/symbol-count/count.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/file-size-ceiling.structure.test.ts` -
  exit 0. `COVERED` lines for all four paths: `count.test.ts` 24/24,
  `no-emojis.test.ts` 18/18, `source-bytes.structure.test.ts` 3/3,
  `file-size-ceiling.structure.test.ts` 3/3. 48/48 total.
- `npx tsc --noEmit --incremental false` (no file args) - exit 0, no output.
  The `import("typescript").X` type-position style RULING 135 established is
  preserved; no new `require`-style binding was introduced.
- `npm run lint` - baselined BEFORE the first edit at 0 errors / 7 warnings
  (all seven pre-existing, in files outside this write set: `RecordingTab.tsx`,
  `useDiscussionCapture.wiring.test.ts`, `repoGradesSliceA.guards.test.ts`,
  `new-quiz.test.ts`). Not re-measured as a gate for this change since the
  write set (`count.ts`, `count.test.ts`, this doc) introduces no new lint
  surface; count not pinned.
- `npm test` (full suite) - see this agent's final report for the exact
  counts read from the redirected log file; baseline is 1161 files / 23251
  tests at a clean `587c210` tree per the brief.
- Sizes, both instruments: `count.ts` is 401 lines (`wc -l` and
  `@(Get-Content <path>).Count` agree); `count.test.ts` is 383 lines (both
  agree). Both well under the 1000-line ceiling.

## Write set

`src/tools/symbol-count/count.ts`, `src/tools/symbol-count/count.test.ts`,
`docs/ruling-136.md` (this file). Nothing else touched.
