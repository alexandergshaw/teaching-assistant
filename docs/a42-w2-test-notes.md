# A42 wave W2: convert the 5 string-UNAWARE scanners to the tokenizer - TDD test notes + sanctioned pin retargets

Seat: `loop-test-author` (Opus). Authored 2026-10-04 at HEAD `9a527c5d`
(`git rev-parse --short HEAD`). This file is the only artifact; NO production or
test code was written here. The implementer builds W2 from these notes; a fresh
`loop-checker` gates this file first. Round 1 of 2 for this activity
(`docs/loop/iteration-caps.md`).

Built from the SHIP-checked scope `docs/a42-census-scope.md` (its W2 section 8.2)
and the W1 pins SHIPPED in `src/tools/strip-comments-agreement.structure.test.ts`
at `ca8851ee`. Every quantity below names the command that produced it; where I
could not settle a thing I say so (section 11) rather than fill it in.

### Evidence tags
- `[MEASURED <cmd>]` the command ran in this checkout, output used.
- `[READ file:line]` I opened that file at that line.
- `[ARGUED]` reasoned from READ/MEASURED facts; runtime not observed.

### What I could NOT do (stated once, per `docs/loop/this-repo.md` section 2)
Nothing renders under vitest (node-env, network-blocked `vitest.setup.ts`).
Every instrument below is a source-text / structure / extraction pin over the
tree. No component, markup, focus or keyboard behaviour is asserted anywhere.

---

## 0. The one-paragraph summary a checker can hold

W2 converts the five string-UNAWARE regex comment-strippers to the committed
string-aware tokenizer `stripComments` from
`@/app/components/ui/modalAdoptionSourceScan`. The W1 pins O2 and O3 are
TRIPWIRES that fire the moment a scanner's strip expression changes; W2 is the
intended change, so it WILL trip them. The job of these notes is to specify the
SANCTIONED retargets (same commit, guard-before-migration style), NOT to disarm
the tripwires. The protective value MOVES: O2 stops proving "a defective regex is
present and loses a marker" (which becomes vacuous once the regex is gone) and
starts proving "the tokenizer is imported, no block-comment regex remains, and no
local strip expression leaked back in"; O3 stops proving "exactly five files
spell `[^]`" and starts proving "no `*.test.ts` spells `[^]` anymore." O1 is
untouched (it guards the tokenizer, which W2 does not change). Verdict
preservation is guarded by each scanner's own frozen test count staying at
33/4/16/26/3.

---

## 1. Baseline, measured now at HEAD `9a527c5d`

`[MEASURED npm run test:paths -- <the six files>]`:

```
COVERED src/tools/strip-comments-agreement.structure.test.ts files=1 passed=24
COVERED src/app/actions/prompt-announcement-draft.test.ts         files=1 passed=33
COVERED src/app/actions/prompt-announcement-post.test.ts          files=1 passed=4
COVERED src/app/components/canvas-tab/announcements-panel.wiring.test.ts files=1 passed=16
COVERED src/app/components/canvas-tab/promptAnnouncementDraft.test.ts    files=1 passed=26
COVERED src/lib/prompt-announcement-types.test.ts                 files=1 passed=3
Test Files 6 passed (6); Tests 106 passed (106)
```

The probe is at **24** (14 pre-W1 + 10 W1 pins: O1 3 + O2 5 + O3 2). The five
scanner counts are **33 / 4 / 16 / 26 / 3**. These are the frozen numbers W2 must
hold (section 6).

The five scanners re-confirmed at HEAD (`[MEASURED grep -rlF '[^]*?\*\/' src]`
returns exactly these five, and `[READ]` each):

| # | File | Strip form today | Extracted count today |
|---|---|---|---|
| S1a | `src/app/actions/prompt-announcement-draft.test.ts` | 2 inline `const stripped = source.replace(/\/\*[^]*?\*\//g,"")...` at `:86-90` and `:136` | **2** |
| S2 | `src/app/actions/prompt-announcement-post.test.ts` | 1 inline `const stripped = ...` at `:26` | **1** |
| S3 | `src/app/components/canvas-tab/announcements-panel.wiring.test.ts` | local `function stripComments` `:26-33` AND local `function stripCommentsForScan` `:289-295` | **2** |
| S4 | `src/app/components/canvas-tab/promptAnnouncementDraft.test.ts` | 1 inline `const stripped = ...` at `:22` | **1** |
| S5 | `src/lib/prompt-announcement-types.test.ts` | local `function stripComments` `:13-19` | **1** |

Total extracted today = 2+1+2+1+1 = **7**, which is the W1 O2 count pin value
(`:883-891`). S1b, the `deriveCanvasForbiddenFiles` walker in the draft file
(`:481-509` per the scope), reads RAW text and NEVER strips - it is NOT converted
(scope section 4.3; converting it would weaken a sound absence scan).

---

## 2. The conversion contract (why the post-conversion counts are deterministic)

The extracted count going to **0** is only guaranteed if the conversion takes a
fixed shape. `extractStripExpressions`
(`src/tools/strip-comments-agreement.structure.test.ts:830-862`, `[READ]`) counts
three things: a function declaration named `stripComments`/`stripCommentsForScan`;
a variable named `stripComments`/`stripCommentsForScan` with an initializer; and a
variable named `stripped` whose initializer text contains `\*\/` AND `\/\/` AND
the word `source`. The conversion MUST therefore:

1. Add `import { stripComments } from "@/app/components/ui/modalAdoptionSourceScan";`
   (unaliased - matches the in-tree convention at
   `src/app/components/ui/buttonVariant.test.ts:27`, `[READ]`; the tokenizer is
   TEST-ONLY infra with no server import, `[READ src/app/components/ui/modalAdoptionSourceScan.ts:1-20]`,
   and its `export function stripComments(text: string): string` is at `:155`, so
   importing it from a `*.test.ts` is already done by the probe at `:5` and by
   every file in `EXCLUSIONS`).
2. Replace each inline `const stripped = source.replace(/\/\*[^]*?\*\//g,"")...`
   with `const stripped = stripComments(source);`. The initializer
   `stripComments(source)` contains no `\*\/` and no `\/\/`, so the `stripped`
   branch no longer matches -> extracted count drops.
3. DELETE the local `function stripComments` / `function stripCommentsForScan`
   definitions outright (do not keep a wrapper named `stripComments` - a
   `const stripComments = (s) => ...` wrapper would be re-counted).

FORBIDDEN conversions (each re-counts and reds the retargeted O2 count pin, by
design - see sabotages SAB-A and SAB-B):
- keeping any local helper whose name is `stripComments` or `stripCommentsForScan`;
- swapping `[^]` for `[\s\S]` inside a surviving `const stripped = ...` (still
  string-unaware, still `\*\/`+`\/\/`+`source` -> still counted);
- inlining a fresh regex under a `stripped` variable.

After this contract the extracted count is **0 per file, total 0**. `[ARGUED]`
from the extractor's three match rules above.

### 2.1 Per-scanner edit, concretely

- **S1a draft**: add the import; rewrite `:86-90` and `:136` to
  `const stripped = stripComments(source);`. LEAVE `deriveCanvasForbiddenFiles`
  (`:481-509`) untouched (raw, not a strip). File shrinks.
- **S2 post**: add the import; rewrite `:26` to `const stripped = stripComments(source);`.
- **S4 promptAnnouncementDraft**: add the import; rewrite `:22` likewise.
- **S5 types**: add the import; DELETE `function stripComments` `:13-19`; the call
  site `const stripped = stripComments(readFileSync(FILE,"utf8"))` at `:24` now
  resolves to the import. Update the stale header comment at `:7-9` (it says
  "Duplicated comment-stripping helpers, per this repo's own rule against importing
  from another *.test.ts file" - importing the non-test tokenizer module is NOT
  that rule and is allowed; correct the comment so source text does not lie).
- **S3 panel (the most involved - see section 12)**: add the import; DELETE
  `function stripComments` `:26-33` AND `function stripCommentsForScan` `:289-295`;
  the `stripComments(...)` call sites at `:35`, `:53`, `:211` now resolve to the
  import; CHANGE the one `stripCommentsForScan(` call at `:318` to `stripComments(`
  (`[MEASURED grep -nE "stripComments\(|stripCommentsForScan\("]`: exactly those
  six lines). This is the only conversion that renames a call site.

---

## 3. The sanctioned pin retargets (old -> new, exact)

All three live in `src/tools/strip-comments-agreement.structure.test.ts`. These
are guard-before-migration oracle edits, in the SAME commit as the conversion.

### 3.1 O2 count pin - RETARGET, do not delete

`A42_SCANNER_EXPRESSION_COUNTS` (`:864-870`): keep all five file names (they are
what the new import pin and the count pin iterate); change every count to 0.

OLD:
```
["src/app/actions/prompt-announcement-draft.test.ts", 2],
["src/app/actions/prompt-announcement-post.test.ts", 1],
["src/app/components/canvas-tab/announcements-panel.wiring.test.ts", 2],
["src/app/components/canvas-tab/promptAnnouncementDraft.test.ts", 1],
["src/lib/prompt-announcement-types.test.ts", 1],
```
NEW: the second element of each tuple becomes `0`.

Count-pin test (`:883-891`): `expect(found, file).toBe(expected)` still holds with
`expected = 0`. Change `expect(total).toBe(7)` -> `expect(total).toBe(0)` and the
`it(...)` title from `"(the W2 tripwire: 2+1+2+1+1 = 7)"` to e.g.
`"(post-W2: every scanner routes through the tokenizer - 0 local strip expressions)"`.

Protective value KEPT: `extractStripExpressions` keys on declaration NAME and on a
`stripped` variable whose init contains `\*\/`+`\/\/`+`source`, REGARDLESS of the
char class. So the retargeted pin catches BOTH a reverted `[^]` and a
spelling-swapped `[\s\S]` local strip (found >= 1 != 0 -> RED). This is the
char-class-agnostic enforcer; it is why the count pin, not O3, is the primary
"regex gone" guard (see SAB-B).

### 3.2 O2 "loses markers" test - REPLACE 1-for-1 (it becomes vacuous)

The test `"every extracted expression loses the D1, D2 and D3 markers"`
(`:893-902`) iterates `extractStripExpressions(...)` and asserts each extracted
`fn` loses a marker. After conversion that array is EMPTY, so the inner loop never
runs and the test passes vacuously - a disarmed instrument that reads as coverage.
REPLACE it (same describe, keeping the probe test count at 24) with a pin that
carries the protective value forward:

```
it("each converted scanner imports the tokenizer and spells NO block-comment regex (protective value O2 moves to)", () => {
  const SSS_BLOCK_NEEDLE = "[\\s\\S]" + "*?\\*\\/"; // the OTHER string-unaware spelling
  for (const [file] of A42_SCANNER_EXPRESSION_COUNTS) {
    const text = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    expect(
      text,
      `${file} must import stripComments from modalAdoptionSourceScan`
    ).toMatch(/import\s*\{[^}]*\bstripComments\b[^}]*\}\s*from\s*["']@\/app\/components\/ui\/modalAdoptionSourceScan["']/);
    expect(hasCaretBlockRegex(text), `${file} still spells a [^] block regex`).toBe(false);
    expect(text.includes(SSS_BLOCK_NEEDLE), `${file} still spells a [\\s\\S] block regex`).toBe(false);
  }
});
```

`hasCaretBlockRegex` already exists at `:927-929`. The import regex allows an
alias (`stripComments as X`) and either quote style, so it does not over-specify
spelling (`docs/loop/traps-tests.md` "source-text tests over-specify"); what it
pins is the FACT (the tokenizer module is imported and `stripComments` is the
imported name) and the ABSENCE of both string-unaware block spellings. Also rename
the enclosing describe at `:882` from `"...real strip expressions lose a marker
the tokenizer keeps"` to `"A42 W2 O2: the five scanners route through the
tokenizer (no local strip expression remains)"`.

KEEP UNCHANGED, in the same describe, all three of: `"the production tokenizer
keeps every marker the regex pipelines lose"` (`:904-909`) and the two
`"KNOWN tokenizer limit..."` tests (`:911-919`). They exercise `productionTokenizer`
directly, which W2 does not touch, and they are what still proves the tokenizer
defeats D1/D2/D3. Net: the O2 describe stays at 5 tests.

### 3.3 O3 set pin - RETARGET to empty, keep the canary

`A42_CARET_SPELLED_FILES` (`:925`) is currently derived from the count array:
`A42_SCANNER_EXPRESSION_COUNTS.map(([f]) => f)`. DECOUPLE it (the count array must
keep naming the five for 3.1/3.2) and set it explicitly empty:

OLD: `const A42_CARET_SPELLED_FILES: readonly string[] = A42_SCANNER_EXPRESSION_COUNTS.map(([f]) => f);`
NEW: `const A42_CARET_SPELLED_FILES: readonly string[] = [];`

The set test (`:937-945`): keep the enumeration (it already excludes the probe via
`rel !== PROBE_FILE_REL`); change the expectations:

OLD: `expect(found).toEqual([...A42_CARET_SPELLED_FILES].sort()); expect(found.length).toBe(5);`
NEW: `expect(found).toEqual([]); expect(found.length).toBe(0);`

and retitle to e.g. `"no *.test.ts spells a caret block-comment regex anymore (all
five route through the tokenizer; a new one reddens this)"`.

KEEP UNCHANGED the canary (`:932-935`) - it proves the enumerator still matches a
caret block regex and rejects one missing the closer, so the empty-set assertion
is non-vacuous. `[MEASURED grep -rlF '[^]*?\*\/' src]` today = the five and
nothing else, so after converting all five `found` is genuinely `[]` and any new
`[^]` block regex anywhere in `src/**/*.test.ts` reddens it. O3's domain is the
`[^]` spelling ONLY - it must NOT be broadened to forbid `[\s\S]` repo-wide,
because 97 other non-W2 files legitimately carry `[\s\S]` block regexes
(scope section 2.2); the `[\s\S]`-in-a-scanner case is covered per-file by 3.1 and
3.2.

### 3.4 O1 - DO NOT TOUCH

The `A42 W1 O1` describe (`:793-825`) reads `A42_TARGETS` (the five SOURCE `.ts`
files), `A42_MIME_TRIGGERS`, `A42_CORRUPTIBLE`, and the whole corpus, asserting
`productionTokenizer == ground truth`. W2 edits only the five TEST files + the
probe; none is in `A42_TARGETS` and the tokenizer is unchanged. O1 re-scans the
modified test files as part of the corpus-wide sweep (`:816-824`) and they remain
valid TS with ordinary comments, so tokenizer==truth still holds on them. O1 stays
green with ZERO edits. An implementer who edits any O1 frozen set has exceeded the
brief - flag it.

---

## 4. The behavioural-probe bookkeeping (SAFE_FILES 65 -> 63, EXCLUSIONS 18 -> 23)

`[MEASURED]`: today `SAFE_FILES` has 65 entries (`:332-396`) and `EXCLUSIONS` has
18 keys (`:454-489`); `ALL_DEFINED.length + Object.keys(EXCLUSIONS).length` ==
mentioning == **83**, the invariant at `:536`. The enumeration also asserts every
pinned file still mentions `stripComments` (`:527-528`) and that `ALL_DEFINED`
copies all parse/evaluate (`:539-543`).

W2 changes the mention set as follows (`[MEASURED grep -c stripComments]`: the
three inline files return 0 today - they do not yet mention the literal):

- draft, post, promptAnnouncementDraft NEWLY mention `stripComments` (via the
  import): **+3 -> 86 mentioning**. All three are added to `EXCLUSIONS`.
- announcements-panel.wiring (`:336`) and prompt-announcement-types (`:393`) are
  CURRENTLY in `SAFE_FILES` (they had local definitions). After conversion they
  still mention `stripComments` (via the import) but no longer DEFINE it, so they
  MOVE from `SAFE_FILES` to `EXCLUSIONS`.

Required edits, all in the same commit:

1. REMOVE from `SAFE_FILES`:
   `"src/app/components/canvas-tab/announcements-panel.wiring.test.ts",` (`:336`)
   and `"src/lib/prompt-announcement-types.test.ts",` (`:393`). -> **SAFE_FILES 63**.
   (`ALL_DEFINED.length` is computed, not a literal - nothing else to bump.)
2. ADD five keys to `EXCLUSIONS`, each with a reason, matching the existing A42
   wording at `:460-467` (plain ASCII, no emoji, no `\uXXXX` escapes - the Write
   tool materializes escapes, MEMORY `write-tool-materializes-escapes`):
   - draft, post, promptAnnouncementDraft, prompt-announcement-types:
     `"A42 W2: converted to import stripComments from the shared module @/app/components/ui/modalAdoptionSourceScan - not a duplicated definition"`
   - announcements-panel.wiring:
     `"A42 W2: converted to import stripComments from the shared module @/app/components/ui/modalAdoptionSourceScan (local helpers stripComments and stripCommentsForScan deleted) - not a duplicated definition"`
   -> **EXCLUSIONS 23**.

Invariant after W2: `63 + 23 = 86 == mentioning`. `[ARGUED]` from the mention
arithmetic above; the enumeration test (`:507-537`) is the executable check.

WHY the `SAFE_FILES` removal is MANDATORY, not cosmetic: the test
`"every defined copy still parses and evaluates in isolation"` (`:539-543`) calls
`loadCopy` on every `ALL_DEFINED` member, and `loadCopy` throws if it cannot
extract a local `stripComments` definition. A converted panel/types file has none,
so leaving either in `SAFE_FILES` reds that test (this is SAB-D).

The leading prose comment on `SAFE_FILES` (`:311-330`) and the `string-aware` /
`MIME-wildcard` findings comments (`:578-598`) describe the set in prose; update
the count narration if touched, but note those are comments - they do not gate.

---

## 5. What W2 must NOT change in the probe

- O1 (section 3.4).
- The L13 behavioural-probe classifier machinery, fixtures, and the
  `MODE1_BLIND_FILES` / `MODE2_BLIND_FILES` empty-by-construction arrays.
- `BLOCK_COMMENT_UNSUPPORTED` (`:438-441`) - neither converted file is in it.
- `DIALECT_EXCLUDED_FILES` (`:498`) - unaffected.

---

## 6. Verdict preservation - the executable guard is each scanner's own count

The DANGER (stated in the task) is a conversion that changes a scanner's pass/fail
on its REAL input. The guard is the scanner's own frozen test count in the gate:
**draft 33, post 4, panel 16, promptAnnouncementDraft 26, types 3**. If routing
through the tokenizer changed any stripping decision on the real file, a
presence/absence/count assertion would flip and the `COVERED ... passed=N` line
would differ. So the frozen counts ARE the verdict-preservation instrument
(executable); the reason they will not move is `[ARGUED]` from:

- scope section 7.2 + section 2.3: on each scanner's real input the tokenizer
  output EQUALS the regex-pipeline output EQUALS the parser truth (tokenizer
  2913/2913 equal), so no decision changes;
- W1 O1 (unchanged, green): tokenizer==truth on the 5 targets + 9 triggers + 21
  corruptible files.

For S3's walker specifically (`deriveCaptureForbiddenFiles`, now calling the
imported tokenizer at the former `:318`): scope section 4.4 measured the capture
forbidden set at 18 via the pipeline AND 18 via truth, so the tokenizer yields the
same 18. The panel's own tests `(i)` membership of `useDiscussionCapture.ts`,
`(ii)` positive control > 0, and `(iii)` zero violations rooted at
`announcements-panel.tsx` (`[READ :395-409]`) would red if that set changed - so
the panel's 16 are the walker's verdict guard. `[ARGUED]` from the measured set
equality.

There is no NEW pin for verdict preservation; adding one that recomputes the
forbidden set would duplicate the panel's own suite and risk a tautology
(`docs/loop/traps-tests.md`). The frozen counts are the right instrument.

---

## 7. Executable here vs argued

EXECUTABLE (the W2 gate runs them, section 9):
- the retargeted O2 count pin (3.1), the new import+regex-gone pin (3.2), the
  retargeted O3 empty-set pin (3.3), the probe enumeration/parse/classify suite
  (section 4), O1 unchanged (3.4), and the five scanners' own counts (section 6);
- `tsc --noEmit`, file-size-ceiling, no-emojis, source-bytes.

ARGUED (reasoned, not observed as a dedicated assertion):
- that the extracted count lands at exactly 0 given the conversion contract
  (section 2) - the count pin at 0 is the executable backstop;
- that no stripping decision changes on the real inputs (section 6) - the frozen
  counts are the executable backstop;
- the SAFE/EXCL arithmetic reaching 86 - the enumeration invariant is the
  executable backstop.

Nothing above is asserted as verified that is only argued.

---

## 8. Sabotages - each sanctioned edit gets one, with its discrimination verdict

Run each by mutating the tree, running the W2 gate, then restoring from a
cp-backup (NEVER `git checkout --` on an uncommitted file; MEMORY
`sabotage-restore-needs-a-copy`). "Discriminates" means RED on the mutation and
GREEN after restore.

- **SAB-A - revert one scanner's conversion.** In `prompt-announcement-post.test.ts`
  restore the inline `const stripped = source.replace(/\/\*[^]*?\*\//g,"")...` and
  remove the tokenizer import. RED: O2 count pin (post found 1 != 0); O2
  import+regex-gone pin (import missing AND caret regex present); O3 set pin
  (found = [post] != []). GREEN after restore. **Discriminates: YES** - proves all
  three retargeted pins catch an unconverted scanner.

- **SAB-B - the passing-but-wrong spelling swap (attack-your-own-guard).** Convert
  post but swap `[^]` for `[\s\S]` and DO NOT import the tokenizer:
  `const stripped = source.replace(/\/\*[\s\S]*?\*\//g,"")...` (still
  string-UNAWARE). RED: O2 count pin (the `stripped`+`\*\/`+`\/\/`+`source` match
  is char-class-agnostic -> found 1 != 0); O2 import+regex-gone pin (no import AND
  `[\s\S]*?\*\/` present). O3 set pin stays **GREEN** (no `[^]`). **Discriminates:
  count pin + import pin YES; O3 NO.** This is the load-bearing finding: O3 ALONE
  would pass a spelling-swap that leaves the scanner defective, which is exactly
  why the count pin (char-class-agnostic) and the import pin's `[\s\S]` clause
  exist. I ran this attack on paper against the retargets in section 3 and the
  count+import pins kill it; O3 does not, and I am saying so rather than claiming
  O3 covers it.

- **SAB-C - verdict change on a real input.** Convert post but call the tokenizer
  on the wrong argument: `const stripped = stripComments(join(process.cwd(),
  "src/app/actions/prompt-announcement-post.ts"));` (strips the PATH string, not
  the source). `exportLines` is then computed from a path, length 0 != 1, so the
  AC-16 export-shape test fails -> post count 4 -> not 4. RED on post's OWN suite
  (the `COVERED ... passed` line != 4). GREEN after restore to
  `stripComments(source)`. **Discriminates: YES** - proves the frozen scanner
  count catches a verdict change the probe pins do not look for.

- **SAB-D - behavioural-probe bookkeeping not updated.** Convert the panel but
  leave it in `SAFE_FILES`. RED: `"every defined copy still parses and evaluates
  in isolation"` (`:539-543`) - `loadCopy(panel)` cannot extract a `stripComments`
  definition and throws; and the `:536` invariant breaks (64 + ... != 86). GREEN
  after moving panel to `EXCLUSIONS`. **Discriminates: YES** - proves the SAFE->EXCL
  move is enforced, not optional.

- **SAB-E - O1 drift (negative control).** O1 must NOT be edited. If an
  implementer changes any O1 frozen set or the tokenizer, O1 reds (its sets are
  source files W2 does not touch). Expectation: O1 stays green with no edit; any
  O1 diff in `git status`/the W2 diff is a brief violation to flag. **This is a
  control, not a kill I am owed** - O1 staying green unedited is the correct
  outcome.

All five sabotages change KIND, not strength: none is "lengthen a denylist"
(`docs/loop/iteration-caps.md`). If, at build time, SAB-B's O3 result were to come
out RED (it should not), that would mean O3 was silently broadened - STOP and
report, do not accept it as extra coverage.

---

## 9. The W2 gate (one path per arg, `test:paths` wrapper)

Per `docs/loop/this-repo.md` "Running a named set of test files" and MEMORY
`test-paths-wrapper` (a raw multi-path `vitest run` silently drops unmatched
args). All nine paths confirmed to exist `[MEASURED test -f]`:

```
npm run test:paths -- \
  src/tools/strip-comments-agreement.structure.test.ts \
  src/app/actions/prompt-announcement-draft.test.ts \
  src/app/actions/prompt-announcement-post.test.ts \
  src/app/components/canvas-tab/announcements-panel.wiring.test.ts \
  src/app/components/canvas-tab/promptAnnouncementDraft.test.ts \
  src/lib/prompt-announcement-types.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/lib/no-emojis.test.ts \
  src/source-bytes.structure.test.ts
```

Then `npx tsc --noEmit` (exit 0, ONE caller - no concurrent tsc, it races on
`tsconfig.tsbuildinfo`).

PASS CONDITIONS:
1. Every argument prints `COVERED` (none `NOT COVERED`).
2. The five scanner counts are UNCHANGED: `passed=33 / 4 / 16 / 26 / 3`. Any
   change means a stripping decision changed (section 6).
3. The probe count is UNCHANGED at `passed=24` (the O2 "loses markers" test is
   replaced 1-for-1 by the import+regex-gone test, section 3.2; no net test
   added or removed).
4. `file-size-ceiling.structure.test.ts`, `no-emojis.test.ts`,
   `source-bytes.structure.test.ts` green.
5. `tsc --noEmit` exit 0, no output.
6. `git status --short` is EXACTLY the six files (the five scanners + the probe),
   nothing under `.claude/worktrees` (MEMORY `stale-worktree-shadows-glob`,
   `wave-gate-git-status`). No `src/lib/grade/**`, recording, or repo-grades file
   appears (the sibling GRADE-INFER-MERGE wave is out of scope; `[MEASURED
   git log --oneline -8]` shows its W1 was `cdccbea8`, disjoint from these files).

### Named: which tests the W2 diff REDS, and the sanctioned retarget for each

| Test (file:line today) | Why W2 reds it | Sanctioned retarget |
|---|---|---|
| O2 count pin `:883-891` | extracted counts drop 2/1/2/1/1 -> 0 | 3.1: counts -> 0, total 7 -> 0 |
| O2 "loses markers" `:893-902` | `fns` empty -> vacuously green (disarmed) | 3.2: REPLACE with import+regex-gone pin |
| O3 set pin `:937-945` | the five no longer spell `[^]` -> found [] != five | 3.3: `A42_CARET_SPELLED_FILES` -> `[]`, assert `[]`/len 0 |
| enumeration `:507-537` | 3 inline files newly mention; 2 move SAFE->EXCL | 4: SAFE 65->63, EXCL 18->23 |
| "every defined copy parses" `:539-543` | converted panel/types have no local def | 4: remove both from SAFE_FILES |

Unchanged-and-green (must stay so): O1 `:793-825`; O2 tokenizer-keeps-markers
`:904-909` and the two KNOWN-limit tests `:911-919`; O3 canary `:932-935`; the
L13 classifier suite.

---

## 10. Line budget

`[MEASURED wc -l]`: probe 946 (ceiling LIMIT = 1000, strictly-greater fails,
`[READ src/file-size-ceiling.structure.test.ts:41]`). W2 probe edits net roughly
+8 lines (EXCLUSIONS +5 entries ~+10; SAFE_FILES -2; the three retargets are
in-place): ~954, under 1000. MEASURE after editing with
`@(Get-Content src/tools/strip-comments-agreement.structure.test.ts).Count`
(MEMORY: `wc -l` and `@(Get-Content).Count` can disagree; use the PowerShell form
for the ceiling check); if it exceeds 1000, SHORTEN the EXCLUSIONS reason strings
(prose). The five scanner files all SHRINK (helpers/inline expressions removed,
one import line added) - no ceiling risk there. Current scanner sizes `[MEASURED
wc -l]`: draft 609, post 75, panel 410, promptAnnouncementDraft 214, types 46.

---

## 11. What I could not determine

- The exact post-edit probe line count (depends on the implementer's EXCLUSIONS
  reason wording) - section 10 bounds it and names the measurement.
- Whether `tsc`/eslint are globally green at HEAD independent of this change - not
  re-run here; the W2 gate runs `tsc --noEmit` over the change.
- Any rendered behaviour of the scanners' target components - none is asserted;
  these are all source-text structure tests.

---

## 12. S3 is the most involved conversion - keep it in W2, no blocker

S3 (`announcements-panel.wiring.test.ts`) is materially harder than the other
four: it deletes TWO local helpers and renames one call site (`stripCommentsForScan(`
-> `stripComments(` at `:318`), where the other four either rewrite an inline
expression or delete one helper. It is NOT a blocker:

- The collision the scope flagged (R-6) is NOT live. `[MEASURED git log]` and
  `[READ docs/backlog.yml:1304]`: the ANNOUNCEMENTS-TAB group is COMPLETE -
  A-W1 (`25bcbfcb`), A-W2 move (`8d898000`), A-W3 regression
  (REGRESSION.md 450); "main green at 2076d971." The A-W2 "move" relocated the
  MOUNT site (`CanvasTab` -> `AnnouncementsSubTab`, `[MEASURED git show --stat
  8d898000]` edits `CanvasTab.tsx`/`ContentTab.tsx`), NOT the file
  `announcements-panel.tsx` itself (its last touch is `bc950c41`, the a21
  feature), which is why the move-notes mark its wiring test "NEEDS NO EDIT." No
  live wave edits any of the six W2 files; S3 is free to convert now.

RECOMMENDATION: do all five in W2 as one wave (the probe retargets must land in
the same commit as any conversion anyway, so splitting S3 out would mean two
commits both editing the probe - more collision surface, not less). If the
implementer hits a real blocker on S3's double-helper deletion, convert the other
four + their probe bookkeeping first and sequence S3 as W2b in a follow-on commit
that re-touches only the probe's S3 rows - but I found no blocker and do not
expect this.

---

## 13. Residual register (owner, instrument, measuring step)

- **R-W2-1. The 97 other `[\s\S]` block-regex strippers.** Owner: a later A42 R2
  widening pass (orchestrator decides if it is a row). Instrument: the O3-style
  AST enumeration + the scope's `census10.mjs` read map. Step: the chunk that
  edits any of them, or an explicit W3. (Inherits scope R-1.)
- **R-W2-2. `docs/loop/this-repo.md:170` steers new copies out of the probe.**
  Owner: the W2 implementer or the orchestrator (shared doc - disjointness check
  vs other `docs/loop` editors first). Instrument: `grep -n "withoutLineComments"
  docs/loop/this-repo.md`. Step: a W2-adjacent doc edit pointing authors at
  `stripComments` from `modalAdoptionSourceScan`. (Inherits scope R-2.)
- **R-W2-3. S1c raw positive control (`prompt-announcement-draft.test.ts:142-145`)
  is comment-fakeable in principle.** Owner: W1 test author. Instrument:
  `callLlm` count raw vs code (3 vs 2 today). Step: optional tightening when S1a
  converts; NOT required for W2 green. (Inherits scope R-7.)

Missing any of owner/instrument/step would make an item a deletion
(`docs/loop/iteration-caps.md`); all three are named above.
