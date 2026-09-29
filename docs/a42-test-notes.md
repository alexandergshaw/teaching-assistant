# A42 test notes / frozen oracles: the MIME-wildcard block-comment strip defect

Status: TEST NOTES AND ORACLE DESIGN ONLY. No production code and no test code
were written or changed for this document. Round 1 of 2
(`docs/loop/iteration-caps.md`: two rounds per artifact, then the question
goes to the owner). A fresh `loop-checker` gates this before any implementer
builds from it.

Consumes: `docs/a42-scope.md` (checked, DISPATCHABLE) - specifically its
section 1.3 six live-reaching scanners, its section 1.4 LATENT verdict, its
section 2.4 fix recommendation, its AC5, and its ROUND-1 CHECK COROLLARIES
(Finding 2 and INFO-B). This document does not restate that scope; it turns
its acceptance criteria into instruments, oracles and sabotages, and it
re-measures every quantity it depends on rather than inheriting it.

Every quantity below names the command that produced it. The measurement log
is section 9. Two line-counting tools in this repo disagree by 42 on one file
(`AGENTS.md`), so nothing here is recalled.

---

## 0. The defect, stated as the object every instrument binds to

The vulnerable operation is a regex that strips block comments by matching a
literal `/*`, then any run of characters including newlines, then the first
`*/`. Six spellings of it were found in the six live-reaching scanners
(measured, section 9):

- `buttonVariant.test.ts:107-115` - `stripComments`: `.replace(/\{\/\*[\s\S]*?\*\/\}/g,"")` (JSX first) then `.replace(/\/\*[\s\S]*?\*\//g,"")` then a `.split(/\r?\n/).map(line => line.replace(/\/\/.*$/,"")).join`.
- `confirmArmButtons.test.ts:26-35` - `stripComments`: identical shape (JSX comment removed braces-and-all first, then block, then trailing line).
- `autoGradeTransition.wiring.test.ts:24-26` - `stripComments`: `.replace(/\/\*[\s\S]*?\*\//g,"")` then trailing-line split.
- `submission-kind-callsites.structure.test.ts:43-49` - `stripComments`: same as autoGrade.
- `page-module-css-classes.test.ts:202-204` - `stripSourceComments`: `.replace(/\/\*[\s\S]*?\*\//g,"")` then `.replace(/^[ \t]*\/\/.*$/gm,"")` (ANCHORED line-comment strip, trailing-comment-blind by design).
- `page-module-css-orphan-classes.test.ts:173-175` - `stripSourceComments`: identical to the classes sibling.

The fix target is the hand-written string-aware tokenizer already committed at
`src/app/components/ui/modalAdoptionSourceScan.ts:155-229` (`stripComments`),
which tracks `code` / `line-comment` / `block-comment` / `string-single` /
`string-double` / `template` as mutually exclusive modes, so a `/*` inside a
string literal is never a comment opener. Its documented limits are the
`)`/`}` regex-ambiguity heuristic (`:104-109`) and the unterminated-regex
scan-to-end-of-line (`:151-153`); both are argued benign for today's tree by
the scope and re-confirmed benign by the full-population oracle in section 5
(0 new failures over 327 files).

Importing that module into a `*.test.ts` file IS allowed and IS the sanctioned
pattern: it is a non-test module (the bundle guard forbids only application
imports of it and cross-`*.test.ts` imports), and the L13 probe's own
`EXCLUSIONS` map already records five test files that import `stripComments`
from it (`strip-comments-agreement.structure.test.ts:411-436`). This is
"drive the production path" (test-seat practice 3): the conversion imports the
real tokenizer rather than copying a seventh regex.

Direction of the defect, measured (section 9.3): a `/*` opened inside a string
(from `accept="image/*"`) and closed by the first later `*/` deletes every
character between them, including live `styles.<class>` references. The
deletion is a SUBSET of the real content in every case (deletion, never
fabrication).

---

## R1. Extend the L13 probe with a fixture of A42's ACTUAL shape

**Object under comparison.** Each stripper the L13 probe tracks (`ALL_DEFINED`
in `strip-comments-agreement.structure.test.ts:401`), plus the production
tokenizer imported from `modalAdoptionSourceScan.ts`, run against a new
fixture whose block-comment opener is UNCLOSED WITHIN ITS STRING.

**Why a new fixture is needed.** The probe's existing
`FIXTURE_STRING_LOOKALIKE` (`:176-177`) puts a FULLY CONTAINED fake comment
inside one string (`"/* ECHO_MARKER not real */"`), which self-closes and can
therefore never swallow code after it. `isStringAware` (`:256-259`) checks
only that this self-contained case survives. A42 is the opposite and worse
shape: the `/*` opens inside a string and its matching `*/` is OUTSIDE any
string, later in the file. No fixture in the probe exercises this today.

**Instrument (the CONSTRUCTION).** Add:

```
// A42 shape: /* opens INSIDE a string literal (an accept="image/*" attribute),
// its matching */ lies OUTSIDE any string, later in the input, and real code
// (a distinctive marker) sits between them. A string-unaware stripper deletes
// the marker; a string-aware one keeps it AND still strips the trailing real
// block comment.
const FIXTURE_MIME_WILDCARD =
  'const x = <input accept="image/*" />;' + LF +
  "const y = KEEP_MARKER_survivor;" + LF +
  "/* a real block comment REMOVE_MARKER */" + LF +
  "const z = 1;";

function isMimeWildcardSafe(fn) {
  let out;
  try { out = fn(FIXTURE_MIME_WILDCARD); } catch { return false; }
  return (
    out.includes("KEEP_MARKER_survivor") &&   // real code after the wildcard survives
    out.includes('accept="image/*"') &&        // the string itself is intact
    !out.includes("REMOVE_MARKER")             // a real block comment is still stripped
  );
}
```

`LF` is the probe's existing `String.fromCharCode(10)` at `:36` (this repo
normalises the index to LF; a heredoc/Write-materialised literal newline is a
different trap - build it from `LF`, do not paste a raw newline).

**Assertions to add.**

- R1a (the vulnerability, pinned as a documented finding, mirroring the
  existing `:524-535` "no duplicated copy is string-literal-aware" test):

  ```
  for (const file of ALL_DEFINED) {
    expect(isMimeWildcardSafe(loadCopy(file)), file).toBe(false);
  }
  ```

  This locks in that EVERY duplicated copy still corrupts the A42 shape today,
  and turns red the moment any copy is fixed in place (which is a genuine
  improvement the probe should surface, not hide - same rationale the probe
  gives at `:529-534`).

- R1b (the fix target is correct), importing the production tokenizer:

  ```
  import { stripComments as productionTokenizer } from "@/app/components/ui/modalAdoptionSourceScan";
  ...
  it("the production string-aware tokenizer is MIME-wildcard safe", () => {
    expect(isMimeWildcardSafe(productionTokenizer)).toBe(true);
  });
  ```

**Direction of failure.** R1a is RED if any tracked copy stops deleting the
marker between the string-embedded `/*` and the later `*/`. R1b is RED if the
production tokenizer deletes it, or if it stops stripping the trailing real
block comment (which would prove the fix degenerated into "never treat `/*`
as a comment").

**Named sabotage, R1b.** In `modalAdoptionSourceScan.ts:197`, delete the
`if (ch === '"') { out += ch; push("string-double"); i++; continue; }` branch
so a double-quoted string no longer enters string mode. Expect: R1b goes RED
(the tokenizer now treats the `/*` inside `accept="image/*"` as a comment
opener and deletes `KEEP_MARKER_survivor`), R1a stays GREEN. Restore -> R1b
GREEN. DISCRIMINATES: yes - it fails exactly on the property R1b measures and
nothing else. (Do not run this sabotage on the shared tree while any sibling
agent is verifying; `modalAdoptionSourceScan.ts` is a shared file.)

**Named sabotage, R1a.** Replace one `ALL_DEFINED` copy's body in a throwaway
call with the production tokenizer's body. Expect: R1a goes RED for that entry
(a copy that is now MIME-safe violates "all copies unsafe"). DISCRIMINATES:
yes. This is the same style of proof the probe already uses at `:544-565`
(hand-written mutant helpers), so it needs no real-file mutation.

**Satisfiable?** Proven. Measured (section 9.3): the production tokenizer
returns `KEEP_MARKER_survivor` and `accept="image/*"` intact and drops the
real comment; the buggy regex deletes `KEEP_MARKER_survivor`. So R1a is true
for the buggy copies and R1b is true for the tokenizer as they stand today.

---

## R2. Correct the probe's enumeration - the invisible copies and the stale count

**Object.** The set of vulnerable block-comment strippers the L13 probe
accounts for, versus the true population.

**Two measured gaps (section 9.1, 9.2):**

1. THE STALE COUNT. The probe's comment at `:525` says "every one of the 68
   copies". The arrays parse to `ALL_DEFINED = 67` (`SAFE_FILES` 67 +
   `MODE2_BLIND_FILES` 0 + `MODE1_BLIND_FILES` 0). Off by one. The comment
   must be corrected to the true `ALL_DEFINED.length` (and stated as computed,
   not a literal, so it cannot drift again). NOTE: the enumeration invariant at
   `:482` (`ALL_DEFINED.length + Object.keys(EXCLUSIONS).length === mentioning.length`)
   is machine-checked and passes today; the "68" is only a PROSE drift, but it
   is exactly the "remembered not measured" class this repo bans.

2. THE INVISIBLE COPIES. The probe enumerates by walking `*.test.ts` and
   filtering on `fileText.includes("stripComments")` (`:454-457`), then
   extracting a function/variable NAMED `stripComments` (`:95-107`). Five
   vulnerable copies escape this entirely:
   - `page-module-css-classes.test.ts` and `page-module-css-orphan-classes.test.ts`
     define `stripSourceComments`. Measured: neither file contains the
     substring `stripComments` (`grep -c stripComments` -> 0 each, section 9.2),
     so the walk never lists them, and even if it did, the name-based extractor
     would not find `stripComments`.
   - `prompt-announcement-draft.test.ts`, `prompt-announcement-post.test.ts`,
     `promptAnnouncementDraft.test.ts` use the vulnerable regex INLINE
     (`.replace(/\/\*[^]*?\*\//g,"")`) with no named function at all, and also
     contain zero `stripComments` substring (section 9.2). Invisible on both
     counts. (These three are the untraced scanners in the scope's residual 1 -
     their reach to a trigger file is still unverified; see the residual
     register.)

**Instrument (the CONSTRUCTION), for the direction AC2 states ("RED if a
canary file added under a new name or spelling is absent from the corrected
enumeration").** The enumeration must be by DEFECT, not by name. Replace the
`.includes("stripComments")` walk filter with a census of files whose text
contains a block-comment-stripping regex, built from the union of the
newline-matching character classes this repo actually uses:

```
// A file carries a vulnerable block-comment stripper if its text contains
// /\* followed by a newline-matching character class then *? or * then \*\/.
// Built as a construction over the class alternatives, NOT a hand list, so a
// new spelling is caught by adding one alternative here, in one place.
const NEWLINE_CLASSES = ["[\\s\\S]", "[^]", "[\\S\\s]", "[\\d\\D]"];
const BLOCK_STRIP_RE = new RegExp(
  "/\\\\/\\\\\\*(" + NEWLINE_CLASSES.map(escapeForCharClassSearch).join("|") + ")\\*\\??\\\\\\*\\\\/"
);
```

The exact regex is the AC2 pass's to finalise (residual 2 of the scope
recommends a `ts.createSourceFile` AST walk over every `.replace(` argument,
which is stronger than a text search and immune to the spelling escaping above
- prefer it if the AC2 pass has budget). What R2 REQUIRES of any construction:
it must, run against today's tree, return a set that INCLUDES all five
invisible copies above plus the 90 `[\s\S]`-spelled files and the 5
`[^]`-spelled files (section 9.1). Pin that as a canary.

**Direction of failure / named sabotage.** Add a canary fixture file (a real
`*.test.ts` under a fixtures dir, or a synthetic string the enumeration is run
against) that defines a block-comment stripper under a NEW name
(`stripJunk`) with the `[\S\s]` spelling. Expect: the corrected enumeration
lists it (GREEN); the OLD name-based enumeration does not. Remove the canary
-> the "canary is enumerated" assertion goes RED. DISCRIMINATES: yes - it is
red exactly when the enumeration reverts to name-based. A denylist of the five
known-invisible files would pass this only until the sixth spelling appears,
which is the forbidden move (`iteration-caps.md`: freeze the construction, do
not lengthen a list).

**Coordination cost this creates (load-bearing, see R6).** Broadening the
enumeration to include the two `stripSourceComments` css files and the three
inline copies means those five now must be CLASSIFIED (into a bucket) or
EXCLUDED (with a reason), or the invariant at `:482` fails. The two css files
classify as `safe`-on-mode-1-and-2 but string-UNAWARE and MIME-UNSAFE (they
are exactly the defect). The three inline copies have no extractable function
body for `classify()`; they need either an inline-extraction path or an
EXCLUSIONS entry stating "inline vulnerable regex, tracked by the defect
census not the function extractor". This is real work and it is why R2 is
flagged as the larger half of the probe change; the MANDATORY minimum for A42
is R1 plus the stale-count fix, with the full defect census recommended and
its construction specified here.

**Satisfiable?** The count fix is trivially satisfiable. The defect census is
satisfiable: section 9.1 shows the union of the four literal spellings already
finds 95 files by grep; an AST or regex construction over the same alternatives
reproduces that set plus the inline copies.

---

## R3. The conversion oracle - guard before migration, one file at a time

**Object.** For each of the six scanners, the FULL stripped output over that
scanner's OWN scanned population, under the tokenizer, frozen as a literal
BEFORE the file's stripper is converted.

**Why a frozen literal and not a self-comparison.** After conversion the
file's stripper IS the tokenizer. Comparing the converted stripper's output to
the tokenizer's output is a tautology (the refactor-disarms-tests trap:
`docs/loop/traps-tests.md`, "A refactor disarms the test that compared the two
things it merged"). The oracle is therefore a FROZEN SNAPSHOT captured from the
tokenizer before conversion, and the post-conversion assertion compares the
file's actual behaviour to that snapshot literal. It is not recomputed from the
same function.

**Instrument, per file.** Before converting file F:

1. Enumerate F's scanned population exactly as F does (its own walk / its own
   `SOURCE_PATH` / `SECTION_4_DIRS`). Do NOT re-derive the walk; call it.
2. For each scanned file, capture BOTH `oldStripper(text)` and
   `tokenizer(text)`, and record the per-file DIFF (the set of positions/
   substrings that change). Freeze the DIFF, not the whole output - the whole
   output of 327 files is megabytes; the diff is the load-bearing part and is
   small (measured: 2 recovered references for the orphan file, section 9.4).
3. Assert the diff is confined to the INTENDED change class:
   - real code recovered inside a previously-corrupted (string-embedded `/*`)
     span, AND
   - for `buttonVariant.test.ts` and `confirmArmButtons.test.ts` ONLY, the JSX
     `{/* ... */}` residue difference: their regex removes the braces too
     (`/\{\/\*[\s\S]*?\*\/\}/g`), the tokenizer leaves `{}` (measured by
     reading the tokenizer: `{` pushes a code frame, `/* */` is stripped, `}`
     pops). Autograde and submission-kind do NOT special-case JSX comments, so
     their regex already leaves `{}` - for those two the tokenizer swap changes
     ONLY the corruption behaviour.
4. Assert NOTHING ELSE changes: no scanned file's downstream verdict (the
   count, the membership test, the frozen expectation that file F actually
   asserts on) moves, EXCEPT where R4 carves out the orphan pin.

**Direction of failure.** RED if the post-conversion stripper's output on any
scanned file differs from the frozen tokenizer snapshot (proves the conversion
was not a faithful swap), OR if the diff-vs-old-stripper contains any change
outside the two intended classes above.

**Named sabotage.** After capturing the frozen snapshot, mutate the tokenizer's
line-comment handling (`modalAdoptionSourceScan.ts:167-171`) to also strip the
newline (`if (ch === "\n") { stack.pop(); }` without `out += ch`). Expect: the
snapshot-equality assertion goes RED for every scanned file that has a line
comment (the output loses a newline the snapshot has), while the
recovered-reference diff is unaffected. Restore -> GREEN. DISCRIMINATES: yes -
it isolates "the converted stripper equals the frozen tokenizer output" from
"references were recovered".

**The L13 near-miss this guards against.** The L13 conversion
(`96015a49`) mechanically swapped 39 files and surfaced a real defect in
exactly one (`moduleCard.selection.wiring.test.ts`) where the value changed
while the specific assertion still read the same literal. Step 4 above (assert
per-scanned-file verdict, not just the file's own green/red) is what catches
that class.

**Satisfiable?** Proven for the two css files (section 9.4, 9.5: full-
population diff is exactly the 2 recovered references, 0 other changes, 0 new
classes-test failures). For the four non-css scanners, the tokenizer is a
string-aware superset whose only other difference is the assertion-neutral JSX
`{}` residue; their frozen snapshots are constructible and the argued
satisfiability is that no `{}` residue can introduce a `variant="contained"`,
`editsSurface="canvas"`, `role=...` or `<Button` token - LABELLED ARGUED, to be
confirmed by the implementer running the frozen snapshot, not asserted here.

---

## R4. Finding 2 - the AC5 orphan-pin carve-out, with a frozen recovered-reference delta

**Object.** `page-module-css-orphan-classes.test.ts`'s `totalOrphanCount`
(`:272`) and its exact-equality pin `PINNED_ORPHAN_CEILING = 120`
(`:290`, asserted `toBe` at `:351`).

**The intended change, MEASURED (section 9.4), not recalled.** Converting
`stripSourceComments` to the tokenizer changes `totalOrphanCount` from 120 to
118. The delta is exactly two references legitimately recovered, both in
`src/app/page.module.css`: `courseRepoRow` and `page`. No stylesheet gains a
newly-orphaned class (measured: `newlyOrphan` empty for every sheet). The pin
`PINNED_ORPHAN_CEILING` MUST be lowered to 118 in the SAME change, which the
file's own failure message at `:342-344` already demands.

**Why a naive AC5 "any value change is RED" is wrong here, and the instrument
that fixes it.** AC5 (scope) says RED if any assertion's ACTUAL VALUE changes.
Applied naively, lowering 120 to 118 reads as a regression. The carve-out
instrument distinguishes INTENDED recovery from UNINTENDED loss by freezing the
recovered set as an expected delta and asserting the new orphan set equals the
old minus EXACTLY that set:

```
// Frozen, measured 2026-09-29 by running the orphan computation under the
// buggy stripSourceComments and under the tokenizer (section 9.4).
const EXPECTED_RECOVERED = {
  "src/app/page.module.css": ["courseRepoRow", "page"],
};
// After conversion:
//  (1) totalOrphanCount === 118  (pin lowered in the same change)
//  (2) for every stylesheet: newOrphans === oldOrphans MINUS EXPECTED_RECOVERED[sheet]
//      -> no orphan is newly ADDED, and exactly the expected two are removed.
```

To build (2) as a real oracle rather than a re-run of production, the frozen
`oldOrphans` per sheet is captured as a literal (or, cheaper and equally
sound, the assertion is: `oldCount - newCount === 2` AND the two removed names
are exactly `{courseRepoRow, page}` AND no sheet's orphan set gains a member).

**Direction of failure.**
- RED if `totalOrphanCount !== 118` after conversion (pin not lowered, or the
  swap recovered a different number than measured).
- RED if any sheet's post-conversion orphan set gains a member not present
  before (an UNINTENDED loss of a real reference - e.g. the tokenizer strips a
  trailing `// styles.x` the anchored regex kept; see the semantic note below).
- RED if the removed set is anything other than exactly
  `{page.module.css: courseRepoRow, page}`.

**Semantic note the oracle must carry (measured-benign, argued-durable).** The
css `stripSourceComments` strips line comments ONLY when `//` opens the line
(`/^[ \t]*\/\/.*$/gm`); the tokenizer strips TRAILING `//` too. So the swap
also changes line-comment handling, not only block-comment handling. Measured
today: this changes nothing (the css file's own comment at `:195-200` states no
trailing `// styles.x` case exists in the tree, and the full-population count is
still exactly 120 -> 118 with 0 newly-orphaned). The "no newly-orphaned"
assertion above is precisely the guard that catches a future trailing-comment
reference the tokenizer would newly strip.

**Named sabotage 1 (intended-change guard).** Leave `PINNED_ORPHAN_CEILING` at
120 after conversion. Expect: `toBe(120)` vs measured 118 goes RED with the
file's "lower it to 118" message. Restore to 118 -> GREEN. DISCRIMINATES: yes.

**Named sabotage 2 (unintended-loss guard).** Set `EXPECTED_RECOVERED` to
`{page.module.css: ["courseRepoRow"]}` (drop `page`). Expect: the "removed set
equals expected" assertion goes RED (an unexpected extra recovery). Restore ->
GREEN. DISCRIMINATES: yes - it fails when the actual delta diverges from the
frozen delta in EITHER direction.

**Satisfiable?** Proven, section 9.4: OLD `totalOrphanCount` 120, NEW 118,
delta 2, recovered `{courseRepoRow, page}` in page.module.css, `newlyOrphan`
empty everywhere.

---

## R5. A removal test that proves the CSS-class guard is re-armed, not just that counts moved

**Object.** `page-module-css-classes.test.ts`'s "every reference resolves to a
defined class" verdict (`:342-368`, its `failures` array), against a synthetic
undefined-class reference placed INSIDE a currently-corrupted span.

**Why counts moving is not enough.** R4 proves references were recovered. It
does not prove the recovered references are actually CHECKED against the
stylesheet. The classes guard's job is to catch an undefined class reference;
the removal test proves that a reference that was invisible (because it lived
in a deleted span) becomes visible AND is checked.

**Instrument (the CONSTRUCTION), a throwaway fixture, not a real-file
mutation.** Build a fixture string whose `/*` opens inside `accept="image/*"`
and whose `*/` is a later real comment, with a MISSPELLED (undefined) class
reference between them, and run the classes-test's own
`extractReferences` + defined-class lookup against it under both strippers:

```
const fixture =
  'const x = <input accept="image/*" />;' + "\n" +
  "const y = styles.adaptPnaelTitle;" + "\n" +   // undefined (misspelled adaptPanelTitle)
  "/* a real block comment */" + "\n" +
  "const z = 1;";
// under the OLD stripSourceComments: extractReferences(fixture,"styles") does
//   NOT contain "adaptPnaelTitle" (deleted with the corrupted span) -> the
//   guard cannot flag it -> UNDETECTED (green: the bug).
// under the tokenizer: extractReferences contains "adaptPnaelTitle" -> the
//   guard flags it as undefined -> CAUGHT (red -> the fix works).
```

**Direction of failure.** This is a removal-test/before-after pair: the
assertion is that the undefined reference is UNDETECTED under the old stripper
and DETECTED under the tokenizer. A fix that cannot flip this has not re-armed
the guard.

**Named sabotage.** Choose a class name that IS defined (`styles.linkButton`)
instead of the misspelling. Expect: DETECTED-under-tokenizer half stays GREEN
(the reference resolves, so it is correctly not a failure) - which would make
the removal test NOT flip, showing the test only measures re-arming when the
embedded reference is genuinely undefined. This confirms the test discriminates
"guard re-armed" from "reference happens to resolve". DISCRIMINATES: yes, and
it documents the exact condition (undefined name) the removal test depends on.

**Satisfiable?** Proven, section 9.6: old extraction returns `[]` (no
`adaptPnaelTitle`), tokenizer extraction returns `["adaptPnaelTitle"]`.

---

## R6. Non-regression against the L13 probe's existing assertions and its bookkeeping

**Object.** The L13 probe's existing behaviour: `classify()` on every
`SAFE_FILES` entry (`:506-510`), the enumeration invariant (`:482`), the
string-awareness finding (`:524-535`), the block-comment support set
(`:537-542`), and the self-check mutants (`:544-580`).

**The load-bearing coupling the conversion creates.** Four of the six scanners
(`buttonVariant`, `confirmArmButtons`, `autoGradeTransition`,
`submission-kind-callsites`) are currently in `SAFE_FILES` because they define
a function named `stripComments`. Converting them to IMPORT the tokenizer and
DELETE the local function means:

- the name-based extractor (`:95-107`) can no longer extract them (an import is
  neither a function declaration nor a variable initializer), so they cannot
  stay in `ALL_DEFINED` - `loadCopy` would throw at `:485-489`;
- they must MOVE from `SAFE_FILES` to `EXCLUSIONS` with the reason "imports
  stripComments from the shared module @/app/components/ui/modalAdoptionSourceScan
  - not a duplicated definition", exactly as the five existing shared-module
  importers are recorded (`:411-436`);
- the invariant `ALL_DEFINED.length + Object.keys(EXCLUSIONS).length === mentioning.length`
  (`:482`) MUST still hold after the move - it is the machine check that a
  botched conversion (removed from SAFE, not added to EXCLUSIONS) fails on.

**Instrument / direction of failure.** After each conversion, the probe's own
enumeration test (`:453-483`) is RED if the converted file is orphaned from
both `ALL_DEFINED` and `EXCLUSIONS`, or if `mentioning` no longer matches. The
`classify()` test (`:506-510`) must be RED if any STILL-DEFINED copy's
classification moves (non-regression: the conversion of one file must not
disturb the other 63). The string-awareness finding (`:524-535`) must stay
GREEN: every remaining duplicated copy is still string-unaware, and the
tokenizer is not a "duplicated copy" (it is imported, in EXCLUSIONS), so
"no duplicated copy is string-aware" remains true.

**Named sabotage.** Remove `buttonVariant.test.ts` from `SAFE_FILES` without
adding it to `EXCLUSIONS`. Expect: the enumeration test at `:466-467`
(`unaccounted`) goes RED naming `buttonVariant.test.ts`. Restore the
EXCLUSIONS entry -> GREEN. DISCRIMINATES: yes - it is the exact guard against a
half-done conversion.

**Satisfiable?** Yes - the move SAFE -> EXCLUSIONS is a pure bookkeeping edit
that preserves the invariant by construction (one file leaves `ALL_DEFINED`,
one file joins `EXCLUSIONS`, `mentioning` unchanged because the file still
contains the substring `stripComments` via its import).

**Caveat that changes R6 for the two css files.** `page-module-css-*.test.ts`
are NOT in the probe today (R2). If R2's defect census is implemented, they
enter the enumeration; converting them then also requires an EXCLUSIONS move
(they will import the tokenizer). If R2's defect census is deferred, converting
them does not touch the probe at all. The implementer MUST sequence R2 and the
css conversion consistently - either both, or neither-in-the-probe - or the
invariant breaks mid-wave. Recommended order: R1 + stale-count first (cheap,
independent), then per-file conversion with its EXCLUSIONS move, then R2's
defect census LAST so it sees the final state.

---

## 7. What is executable here versus what is only argued

Executable under this repo's node-env vitest (proven satisfiable in section 9):

- R1 fixture discrimination (buggy copies unsafe, tokenizer safe) - MEASURED.
- R4 orphan delta 120 -> 118, recovered `{courseRepoRow, page}`, 0 newly-
  orphaned - MEASURED over the full 327-file population.
- R5 undefined-class-in-corrupted-span before/after flip - MEASURED.
- R3 for the two css files (full-population diff is exactly the 2 recoveries,
  classes-test failures `[]` -> `[]`, 0 introduced) - MEASURED.
- R6 enumeration/invariant behaviour - the probe already runs it; the move is
  bookkeeping.

Argued, NOT asserted as verified here (LABELLED ARGUED):

- R3 for the four non-css scanners: the tokenizer swap changes no verdict
  because the JSX `{}` residue cannot introduce a scanned token. This is sound
  by reading the tokenizer and the scanners, but it is the implementer's frozen
  full-population snapshot that must CONFIRM it, per R3 step 4. Do not ship it
  as measured.
- The tokenizer's documented `)`/`}` and unterminated-regex limits
  (`modalAdoptionSourceScan.ts:104-109, 151-153`) are benign for today's tree.
  The scope and section 9.5 measure 0 new failures across 327 files, but this
  is a property of TODAY'S CONTENT, not of the mechanism - stated as such.
- NO COMPONENT IS RENDERED BY ANY TEST HERE. Every scanner above is a
  source-text structure test; none of this proves anything about markup, focus
  or keyboard behaviour, and A42 touches none of those.

---

## 8. Residual register

Each entry names an owner, an instrument, and the step that will measure it.
Missing any of the three, it is a deletion.

1. **The three inline `[^]` scanners' reach to a trigger file is unverified.**
   `prompt-announcement-draft.test.ts` (`deriveCanvasForbiddenFiles`),
   `prompt-announcement-post.test.ts`, `promptAnnouncementDraft.test.ts`, and
   the scope's residual 1 pair (`announcements-panel.wiring.test.ts`
   `deriveCaptureForbiddenFiles`). OWNER: the implementer wave doing the
   conversion. INSTRUMENT: run each `walk()` closure against the 9 trigger
   files with the node methodology of scope section 1.3, and if any reaches a
   trigger, add it to the conversion set with its own R3 oracle. STEP: before
   any claim that "all reaching scanners are converted" is made.

2. **The defect census construction (R2) is specified, not finalised.** OWNER:
   the AC2 pass / architect. INSTRUMENT: the `ts.createSourceFile` AST walk over
   `.replace()` arguments (scope residual 2), canaried to include the five
   invisible copies and the 95 grep-found files. STEP: the pass that implements
   R2. Until then the probe remains name-based and the two css files plus three
   inline copies stay outside it (recorded here so it is not lost).

3. **R3's four non-css frozen snapshots are argued, not measured** (section 7).
   OWNER: the implementer. INSTRUMENT: capture `oldStripper` vs `tokenizer`
   over each scanner's real population and assert per-scanned-file verdict
   stability. STEP: before converting each of the four.

4. **CSS-text comment stripping is out of A42 scope** (scope residual 4). The
   `extractDefinedClasses` CSS-comment strip (`/\/\*[\s\S]*?\*\//g` on `.css`
   text, `classes:116`, `orphan:75,100`) is NOT converted - the tokenizer is a
   JS/TS tokenizer and must not be applied to CSS text. A `/*` inside a CSS
   string value is the same mechanism against `.module.css` files. OWNER: none
   in A42 (becomes its own row only if the owner files one). INSTRUMENT: a
   census of `content:\s*"[^"]*\/\*` across `*.module.css`. STEP: a future
   backlog row; not a blocker for A42.

5. **No test code was written by this seat** - by design. OWNER: the
   implementer wave. INSTRUMENT: the requirements R1-R6 above, each with its
   oracle and sabotage. STEP: the build wave consuming these notes, which per
   AGENTS.md "two rounds then ask" is a new activity with its own two rounds.

---

## 9. Measurement log

All commands run from the repo root on 2026-09-29. Grep is ripgrep-backed or
git-bash `grep -F` (never `grep -P`, broken here per `docs/loop/this-repo.md`).
Node harnesses were written to a temp file in the repo (so `typescript`
resolves), run, and deleted; the tree was confirmed clean afterwards
(`git status --short` empty).

### 9.1 The vulnerable-stripper population and spellings
```
grep -rlF '[\s\S]*?\*\/' src --include=*.test.ts | wc -l      # 90 files
grep -rlF '[^]*?\*\/'   src --include=*.test.ts               # 5 files:
  src/app/actions/prompt-announcement-draft.test.ts
  src/app/actions/prompt-announcement-post.test.ts
  src/app/components/canvas-tab/announcements-panel.wiring.test.ts
  src/app/components/canvas-tab/promptAnnouncementDraft.test.ts
  src/lib/prompt-announcement-types.test.ts
```
Of the 5 `[^]` files: 2 (`announcements-panel`, `prompt-announcement-types`)
are already in the probe's `SAFE_FILES` (named `stripComments`, caught by the
name walk despite the spelling). 3 use the regex INLINE with no `stripComments`
name (`prompt-announcement-draft` at `:86-87` and `:136`,
`prompt-announcement-post` at `:26`, `promptAnnouncementDraft` at `:22`).

### 9.2 The probe's blind spots (invisible copies)
```
node -e '...parse ALL_DEFINED arrays...'   # SAFE_FILES 67, MODE2 0, MODE1 0 -> ALL_DEFINED 67
grep -n "68 " src/tools/strip-comments-agreement.structure.test.ts   # :525 "every one of the 68 copies"
grep -c stripComments src/app/components/courses/page-module-css-classes.test.ts        # 0
grep -c stripComments src/app/components/courses/page-module-css-orphan-classes.test.ts # 0
node -e 'console.log("stripSourceComments".includes("stripComments"))'                  # false
grep -c stripComments <each of the 3 inline files>                                      # 0, 0, 0
```

### 9.3 Synthetic A42-shape fixture, tokenizer vs buggy regex
Fixture: `const a = <input accept="image/*" />; const b = styles.survivor; /* a real comment */ const c = 2;`
```
buggyCss keeps styles.survivor?   false     (corruption reproduced)
tokenizer keeps styles.survivor?  true      (fix)
tokenizer still strips real comment? true   (not a blanket "never a comment")
```

### 9.4 Orphan count over the full 327-file population (R4)
Replicated `page-module-css-orphan-classes.test.ts`'s computation exactly,
swapping only `stripSourceComments`:
```
stylesheets: 29    importing files: 327
OLD (buggy)  totalOrphanCount: 120     (== PINNED_ORPHAN_CEILING today)
NEW (tokenizer) totalOrphanCount: 118
DELTA: 2
recovered (page.module.css): courseRepoRow, page
newlyOrphan (any sheet): none
```

### 9.5 Classes-test failures over the full 327-file population (R3, INFO-B)
Replicated `page-module-css-classes.test.ts`'s `failures` computation:
```
failures under OLD (buggy):     0
failures under NEW (tokenizer): 0
failures INTRODUCED by the swap: 0
```
Confirms the recovered references all resolve to defined classes; the swap does
not turn the classes guard red.

### 9.6 Removal test discrimination (R5)
Fixture with `accept="image/*"`, then `styles.adaptPnaelTitle` (undefined),
then a real `*/`:
```
buggy extraction:     []                    -> undefined class UNDETECTED
tokenizer extraction: ["adaptPnaelTitle"]   -> undefined class CAUGHT
```

### 9.7 Behavioral difference read from the tokenizer (R3, buttonVariant/confirmArmButtons)
`modalAdoptionSourceScan.ts:184-223`: a JSX comment `{/* ... */}` becomes `{}`
under the tokenizer (`{` pushes code, `/* */` stripped, `}` pops), whereas
`buttonVariant.test.ts:110` / `confirmArmButtons.test.ts:32`
(`/\{\/\*[\s\S]*?\*\/\}/g`) remove the braces too. `autoGradeTransition` and
`submission-kind-callsites` do not special-case JSX comments, so they already
leave `{}` - for those two the swap changes only the corruption behaviour.
`confirmArmButtons.test.ts:47-56`'s JSX-comment canary asserts only absence of
the comment text and presence of the Button, both of which the tokenizer
satisfies.
```

## Run discipline (round-1 check INFO-1)

Every multi-file instrument in these notes - the L13 probe plus each converted
scanner's own *.test.ts, and any verification that runs 2+ paths - MUST use
`npm run test:paths -- <p1> <p2> ...`, NEVER a raw multi-path `vitest run a b`
(which silently drops an unmatched path and exits 0). This is carried from scope
AC3; restated here because the implementer runs their instruments from this file.
