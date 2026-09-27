# G5 wave plan - bounding the image model transport

**Write set: `docs/g5-waves.md` only.** No file under `src/` was written,
read-modified or mutated. No scratch directory or file was created inside the
repository (verified at the end with a control, because `find` exits 0 when it
matches nothing).

**Consumed, in order, at these commits** (`git log --oneline -1 -- <file>`):
`docs/g5-scope.md` `4adff06`, `docs/g5-test-notes.md` `471737c`,
`docs/g5-check.md` `313edbb`, `docs/g4-scope.md` `935ffa6`,
`docs/loop/parallel-disjointness.md` `11fdb5a` (RULING 96),
`docs/loop/traps-spec.md` `f310e6a`. Plus `docs/DEV_LOOP.md` and
`docs/loop/iteration-caps.md`. The G5 row was read via
`grep -a -n "G5" docs/BACKLOG.md` (file line **96**; the G4 row is line 95).
**`docs/backlog.yml` was not opened or touched.**

**Settled upstream and not reopened here:** RULING 75 (racing bounds the
caller's patience, not the work), RULING 76 (elapsed-aware, per-invocation),
RULING 77's constants, RULING 94 (the bound goes in both places), and the whole
of `docs/g5-test-notes.md` section 3 - its seven requirements are treated as
binding inputs, and each one is discharged by name in section 8 below.

**What this document does NOT contain, by boundary:** no oracle, no sabotage
protocol, no mutation family. `docs/g5-test-notes.md` owns those (sections 4, 5,
6, 7 and 11) and RULING 86 already had to restore that boundary once. Section 7
below states only what the waves REQUIRE of that seat, and section 9 states
where I believe it needs one addition.

---

## 0. The answer, up front

**TWO waves, strictly ordered, and they MUST NOT RUN CONCURRENTLY.**

1. **Wave G5-1 - the inner (server) bound**, in `src/app/actions/`.
2. **Wave G5-2 - the outer (client-patience) bound**, in
   `src/app/components/recording/`.

Their write sets are **disjoint by exact path** - the intersection is printed
empty in section 3, with a control proving the command fires. The sequencing is
**not** forced by a shared path; it is forced by **informational** coupling in
one direction, computed and pasted in section 3.2. RULING 96's obligation to
print the overlap is discharged either way, and the concurrency ban is stated in
the ruling's own words because the disjointness gate that would normally catch a
collision does not apply to a pair I have deliberately ordered.

**Each wave is independently gateable and neither leaves the suite red.** Each
wave contains the caller of everything it exports, and each wave contains, in
the same wave, the production wrap that its own red structural walker requires -
which is the ordering constraint `docs/g5-test-notes.md` section 3.2 states.

---

## 1. One wave or two - the proof, not the assertion

`docs/g5-scope.md` section 6 plans **one** wave. I am splitting it, and the
argument has to be better than "smaller diffs are nicer", because a split that
breaks either the caller rule or a walker's population is worse than a single
large wave.

### 1.1 The thing that makes a split possible: the walkers are PER-IDENTIFIER

`docs/g5-test-notes.md` section 10 assigns the structural requirements as:

| Test file | Requirements | Identifier its walk partitions |
|---|---|---|
| `src/app/actions/announcement-image.wiring.test.ts` | W-1, W-3, W-2's inner arm, the section-8 stripper canaries | `generateGeminiImage` |
| `src/app/components/recording/announcementImagePipeline.wiring.test.ts` | W-1, W-3, W-2's outer arm | `generateAnnouncementImageAction` |

So each wave's walker partitions **one** identifier. That is what decides
whether a split is legal, so it was measured rather than read off the table.

```
grep -rn "generateGeminiImage" src --include=*.ts --include=*.tsx | grep -v "\.test\."
```

```
src/app/actions/announcement-image.ts:8:// generateGeminiImage (src/lib/llm.ts) with a prompt built from the
src/app/actions/announcement-image.ts:28:import { generateGeminiImage, describeLlmFailure, describeEmptyLlmImage } from "@/lib/llm";
src/app/actions/announcement-image.ts:52:    const result = await generateGeminiImage(prompt);
src/app/components/recording/announcement-image-filename.ts:13:// generateGeminiImage (src/lib/llm.ts) ever returns (image/png -> png,
src/lib/gemini.ts:14: * `Api-Revision: 2026-05-20` header required) - see generateGeminiImage in
src/lib/llm.ts:205: * Result of an image-generation call (generateGeminiImage). Three shapes,
src/lib/llm.ts:446: * {status, body} failure. callGemini (text) and generateGeminiImage
src/lib/llm.ts:450: * it out (rather than duplicating the retry loop in generateGeminiImage) is
src/lib/llm.ts:647:        // shared here because generateGeminiImage routes through this same
src/lib/llm.ts:790:export async function generateGeminiImage(prompt: string): Promise<LlmImageResult> {
src/lib/take-announcement.ts:267: * Builds the prompt sent to generateGeminiImage (src/lib/llm.ts) for the
```

```
grep -rn "generateAnnouncementImageAction" src --include=*.ts --include=*.tsx | grep -v "\.test\."
```

```
src/app/actions/announcement-image.ts:42:export async function generateAnnouncementImageAction(
src/app/components/recording/announcementImagePipeline.ts:36:import { generateAnnouncementImageAction } from "@/app/actions/announcement-image";
src/app/components/recording/announcementImagePipeline.ts:57: * Calls generateAnnouncementImageAction with a prompt built from the CURRENT
src/app/components/recording/announcementImagePipeline.ts:69:  const result = await generateAnnouncementImageAction(prompt);
```

Control, same filter, on a name that cannot exist:

```
grep -rn "generateGeminiImageZZZ" src --include=*.ts --include=*.tsx | grep -v "\.test\."
-> empty, exit 1 (read from the command, not through a pipe)
```

**What that buys.** The `generateGeminiImage` population contains **no
occurrence in `announcementImagePipeline.ts`**, and the
`generateAnnouncementImageAction` population contains **exactly one non-test
file each side of the seam**. So wave G5-2's edits cannot move wave G5-1's
walker between buckets, and wave G5-1's edits cannot move wave G5-2's between
buckets. Each wave's `other` bucket empties when and only when that wave's own
wrap lands.

Note that only `llm.ts:790` and `announcement-image.ts:52` place a `(`
immediately after `generateGeminiImage`; every other hit above is prose with a
space or a `)` after the name, so none of them enters the partition even before
comment stripping. Stripping is still required for the C1-C8 shapes
`docs/g5-test-notes.md` section 8 measured - this is not an argument against it.

### 1.2 The thing that makes a split WORTH it

- **The complexity is entirely in the inner wave.** Wave G5-1 carries the
  elapsed-aware clamp, the `Date.now` stub seam, a four-row frozen literal
  oracle, the `{kind:"timedout"}` and `{kind:"failed"}` translations, and the
  two LANDED tests (`announcement-image.test.ts:100-105` and `:107-112`) that
  are the only enforcer of the `{kind:"failed"}` translation. Wave G5-2 carries
  one fixed constant and one discriminating behavioural pair. Mixing them means
  a red in either one lands in a diff spanning both a server module and a client
  leaf.
- **The sabotage protocol already forces a sequence.**
  `docs/g5-test-notes.md` section 11 rule 7: no two agents sabotage-verify on
  the tree at once, and exactly one caller runs `npx tsc --noEmit`. A single
  wave covering both placements has to serialise its own sabotage cycles
  internally anyway; two waves make that serialisation the wave boundary
  instead of an unenforced instruction inside one brief.
- **Each half is a coherent shipped improvement.** After wave G5-1 the action
  bounds itself at the clamp and returns a worded `{error}`; the client waits as
  long as the platform lets it, exactly as today. After wave G5-2 both bounds
  exist. Neither intermediate state is broken.

### 1.3 The order is forced, and in this direction

**Wave G5-1 (inner) must land first.** Two independent grounds:

1. **Informational, directional.** `CLIENT_PATIENCE_MS = 30_000` is chosen
   *relative to* the inner clamp's `MODEL_WAIT_MAX_MS = 24_000`
   (`docs/g5-scope.md` section 4: it "must strictly exceed the inner clamp"). The
   inner clamp is what wave G5-1 lands. Under
   `docs/loop/parallel-disjointness.md` section 3 a directional coupling is
   resolved by running the establisher first.
2. **The reversed order puts the wrong message in front of the instructor.**
   If G5-2 landed alone, then for the whole window between the two waves the
   client would give up at 30,000 ms while the server had no inner bound at
   all, so every slow-but-eventually-successful call would surface the OUTER
   generic wording and the inner specific wording would never be reachable.
   That is the exact direction of failure `docs/g5-scope.md` residual R6 states.
   The chosen order never produces it.

### 1.4 If a checker prefers one wave, what actually changes

Stated so this is a decision and not a preference: merging them back satisfies
every rule literally too (one write set, one gate, no ordering). What it costs is
1.2's three points, and what it does NOT cost is correctness. I recommend the
split; a ruling for one wave requires only that the single wave's gate be the
verbatim six-path command in section 4.3 and that the two structural walkers and
both production wraps land in the same commit.

---

## 2. The wave table

Sizes below are by **both** instruments, re-run this pass. `wc -l` (Bash) and
`@(Get-Content <file>).Count` (PowerShell) **agree on every file measured**;
where this document names one number, both produced it. `Measure-Object -Line`
was not used.

| file | `wc -l` | `@(Get-Content).Count` | `countLines()` (the gate's own instrument) |
|---|---|---|---|
| `src/app/actions/announcement-image.ts` | 68 | 68 | 68 |
| `src/app/actions/announcement-image.test.ts` | 113 | 113 | - |
| `src/app/components/recording/announcementImagePipeline.ts` | 126 | 126 | 126 |
| `src/lib/bounded-race.ts` | 75 | 75 | - |
| `src/lib/bounded-race.test.ts` | 66 | 66 | - |
| `src/lib/llm.ts` | 821 | 821 | - |
| `src/lib/llm.test.ts` | 917 | 917 | - |
| `src/app/components/ui/modalAdoptionSourceScan.ts` | 405 | 405 | - |

`countLines` is the real `src/lib/count-lines.ts`, imported and executed from the
scratchpad probe in section 10; it is the function
`src/file-size-ceiling.structure.test.ts` and
`src/app/components/recording/recording-split.structure.test.ts` both enforce
with, so its agreement with the other two instruments is what makes the ceiling
arithmetic in section 6 trustworthy.

---

### Wave G5-1 - the inner, elapsed-aware bound

**Write set.** Derived, not enumerated: the command below is the one that
produced it, and it ranges over the whole non-test tree AND over the test tree,
because a filter that excludes tests cannot find the tests that assert on the
behaviour being changed.

```
grep -rn "generateGeminiImage" src --include=*.ts --include=*.tsx
```

Everything that hit and is not prose, plus every test file that asserts on the
changed behaviour:

| path | why it is in the set | new or existing |
|---|---|---|
| `src/app/actions/announcement-image.ts` | holds the only non-declaration call site (`:52`); the wrap goes here | existing, 68 lines |
| `src/app/actions/announcement-image.test.ts` | asserts on this function's returned value; holds I-1, I-2, I-3 and the nine landed assertions of I-4 | existing, 113 lines, extended |
| `src/app/actions/announcement-image.wiring.test.ts` | W-1, W-3, W-2's inner arm, the stripper canaries | NEW |

**Read as source text but NOT written** (named because the wave's gate depends on
them and a sibling writing them invalidates this wave's gate, not this wave's
code): `src/lib/llm.ts` (holds the `declaration` bucket's single member, so
W-3's instrument C reads it), `src/lib/bounded-race.ts` (imported, arity 2 -
measured in section 10), `src/app/components/ui/modalAdoptionSourceScan.ts`
(supplies `stripComments` and `walkFiles`), and **every one of the 1,593
non-test `.ts`/`.tsx` files under `src/`** that W-1's partition ranges over. See
section 3.3 - this is the widest constraint in the plan and it is not visible in
the three-path write set.

**What it exports, and where that export is called.** Nothing new is exported.
The four RULING 77 constants are module-private **by force**: `announcement-image.ts`
is `"use server"` (`head -1` -> `"use server";`) and
`src/lib/use-server-exports.test.ts:96-117` legalises exactly four export forms -
`export async function`, `export default async function`, `export type`,
`export interface`. `export const MODEL_WAIT_MAX_MS` is therefore illegal and
red on a landed gate. `docs/g5-test-notes.md` section 3 requirement 3 is
correct, verified by reading the enforcer rather than by citing it.

**So the caller rule is satisfied vacuously for exports and substantively for
the wrap:** the file that calls `raceWithTimeout(generateGeminiImage(...))` is
the same file that changes. Nothing ships that nobody imports.

**RED before, GREEN after.**

| instrument | before this wave | after this wave |
|---|---|---|
| `announcement-image.test.ts` nine landed assertions (I-4) | GREEN (`passed=9`, measured, section 4.1) | GREEN, `passed=9` or more |
| I-1 / I-2 / I-3 (new assertions in that file) | do not exist | GREEN |
| `announcement-image.wiring.test.ts` W-1 (`other` bucket) | **RED if landed alone** - `docs/g5-test-notes.md` E8/S1a measures one `other` member at `announcement-image.ts` on today's tree | GREEN |
| `announcement-image.wiring.test.ts` W-3 A/B/C | would be GREEN even today | GREEN |
| everything else in the suite | GREEN | GREEN |

**The ordering that follows, stated as an instruction and not a footnote:** the
wrap and `announcement-image.wiring.test.ts` land in the **same** wave.
`docs/g5-test-notes.md` section 3 requirement 2 forbids landing W-1 in an earlier
wave, because it would put a permanently-red test on `main`. Inside the wave the
implementer may write the test first (it is the TDD order), but the WAVE GATE is
measured on the end state, and a wave that ends with `other` non-empty has not
passed.

**Independently gateable: YES.**

---

### Wave G5-2 - the outer, client-patience bound

**Write set.** Same derivation, other identifier:

```
grep -rn "generateAnnouncementImageAction" src --include=*.ts --include=*.tsx
```

| path | why it is in the set | new or existing |
|---|---|---|
| `src/app/components/recording/announcementImagePipeline.ts` | holds the only call site (`:69`); the wrap and `CLIENT_PATIENCE_MS` go here | existing, 126 lines |
| `src/app/components/recording/announcementImagePipeline.test.ts` | O-1, O-2, O-3 | NEW |
| `src/app/components/recording/announcementImagePipeline.wiring.test.ts` | W-1, W-3, W-2's outer arm | NEW |

**Read as source text but NOT written:** `src/app/actions/announcement-image.ts`
(holds the `declaration` bucket's single member for this identifier, so W-3's
instrument C reads it - this is the coupling that forces the sequencing, section
3.2), `src/lib/bounded-race.ts`, `src/app/components/ui/modalAdoptionSourceScan.ts`,
and the same whole-tree 1,593-file population.

**What it exports, and where that export is called.** One new export:
`CLIENT_PATIENCE_MS = 30_000`. Legal here - this module is not `"use server"`
(`grep -n "use client\|use server" src/app/components/recording/announcementImagePipeline.ts`
-> empty, exit 1) and it already exports an `interface` and three synchronous
functions.

Its callers, both inside this wave:

1. `announcementImagePipeline.ts:69`'s own wrap, in the **same file** - this is
   what makes the constant used rather than decorative, and it is what W-2's
   outer arm asserts (`/raceWithTimeout\([^;]*?CLIENT_PATIENCE_MS/`, the shape
   `walkthrough-announcement.structure.test.ts:350-351` already uses).
2. `announcementImagePipeline.test.ts`'s O-1 (`expect(CLIENT_PATIENCE_MS).toBe(30_000)`)
   - the only consumer of the `export` keyword itself.

**This is not the type-only exception and it does not need to be.** The caller is
a real caller in the same wave. See section 9 finding F3 for the one thing about
this export that is worth a checker's attention.

**RED before, GREEN after.**

| instrument | before this wave | after this wave |
|---|---|---|
| `announcementImagePipeline.wiring.test.ts` W-1 (`other` bucket) | **RED if landed alone** - `docs/g5-test-notes.md` E8/S1b measures one `other` member at `announcementImagePipeline.ts` today | GREEN |
| O-2 (the 29,999 / 30,000 pair) | **RED on today's unwrapped shape** - E7 measures it as the ONLY one of the four outer assertions that discriminates | GREEN |
| O-1, O-3 | E7 measures both as GREEN on the unwrapped shape; they are change-detectors and regression guards | GREEN |
| everything from wave G5-1 | GREEN | GREEN |

**Independently gateable: YES**, once wave G5-1 has landed.

---

## 3. Disjointness, computed in BOTH senses

### 3.1 Exact path

Two files were written in the scratchpad, one per wave, each holding that wave's
write set, and intersected mechanically:

```
cat w1.txt w2.txt | sort | uniq -d
```

```
[no output]
```

**Empty output is the only pass, and empty output is what it produced.** Because
an empty result is also what a broken command produces, the same command was run
with a deliberately overlapping pair as a control:

```
cat w1.txt w1.txt | sort | uniq -d
```

```
src/app/actions/announcement-image.test.ts
src/app/actions/announcement-image.ts
src/app/actions/announcement-image.wiring.test.ts
```

The control fires on all three paths, so the empty result above is evidence
about the sets and not about the instrument.

**RULING 96's print obligation is therefore discharged with an empty overlap.**
The ruling's shape does not apply here - no wave needs to write another wave's
file, so the caller rule and disjointness do not collide. The concurrency ban
below comes from sense two, not from a shared path, and I say so rather than
borrowing the ruling's authority for a different reason.

### 3.2 Informational independence - and this is where they are COUPLED

The facts each wave must assume, and who establishes each:

| fact a wave assumes | established by | coupling |
|---|---|---|
| `raceWithTimeout(work, timeoutMs)` takes the wait as its second positional parameter, and its outcome has exactly the kinds `settled`/`timedout`/`failed` | already landed in `src/lib/bounded-race.ts`; **executed** in section 10 (arity 2, all three kinds reached) | none - neither wave writes it |
| RULING 77's four constants and the clamp formula | already landed at `class-trends-insight/route.ts:47,:48,:49,:51` and `:143-144`; **re-read and recomputed** in section 10 | none - neither wave writes it |
| the emitted inner wait is 24,000 ms in every reachable production invocation | **wave G5-1** | **wave G5-2 designs against it** (its 30,000 ms must strictly exceed it) - DIRECTIONAL |
| the `generateAnnouncementImageAction` declaration occurs exactly once, in `src/app/actions/announcement-image.ts` (W-3 instrument C) | the tree; **but wave G5-1 REWRITES that file** | **wave G5-2's GATE READS wave G5-1's FILE as source text** - DIRECTIONAL |
| the `generateGeminiImage` declaration occurs exactly once, in `src/lib/llm.ts` | the tree; no wave writes `llm.ts` | none |
| the walk's own file list exceeds 1,200 entries (W-3 instrument A) | the tree; **each wave ADDS files to it** | monotone upward only, so neither wave can falsify the other's floor |

Two directional couplings, both pointing the same way. Under
`docs/loop/parallel-disjointness.md` section 3 the resolution for a directional
coupling is **sequence the establisher first**, which is what section 1.3
already concluded on independent grounds.

**Therefore: WAVE G5-1 AND WAVE G5-2 MUST NOT RUN CONCURRENTLY.** Wave G5-1
lands and gates green; only then is wave G5-2 dispatched.

The second coupling is the one that would have been invisible. Nothing in the
two three-path write sets shows it: wave G5-2 writes no file wave G5-1 writes,
and its walker never edits `announcement-image.ts` - it **greps a string it does
not own**, inside a file a sibling is concurrently rewriting. Under concurrency
wave G5-2's `declaration.length` assertion would be reading a half-written file,
and a pass or a fail would mean nothing either way.

### 3.3 The constraint that is wider than either write set

Both walkers partition **every non-test `.ts`/`.tsx` file under `src/`**.
Measured:

```
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -not -name "*.test.ts" -not -name "*.test.tsx" -print | wc -l
-> 1593
```

Control, the same walk unfiltered, which must be strictly larger:

```
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -print | wc -l
-> 2721
```

1,593 matches the population `docs/g5-test-notes.md` section 7 W-3 states, so
the two derivations agree.

**The consequence, stated because it binds whoever dispatches these waves:**
**neither wave may be GATED while any other item is writing a non-test file
under `src/`.** W-1's `other` bucket ranges over all 1,593 files, so a sibling
adding an unbounded call to either identifier anywhere in the tree turns this
wave's gate red for a reason that is not this wave's. W-3's floor and its
declaration count have the same reach.

Because that cannot always be guaranteed, the wave gate carries a disambiguation
rule rather than a prohibition: **if `other` is non-empty and names a file
outside this wave's write set, that is a SIBLING finding to report with the file
and the preceding-text excerpt, not this wave's defect** - and the wave gate must
say which of the two it is before anyone reads the red as a failure of this
wave. W-1's own failure message is already shaped for that
(`file@index after "...<60 chars of preceding text>"`).

**This condition occurred DURING this pass, which is why it is a rule and not a
caution.** Between the start of this document and its final tree check, a sibling
began writing six files under `src/` - `src/lib/grade/utils.ts`,
`src/lib/grade/utils.test.ts`, `src/lib/grade/identityInvariants.test.ts`, and
three files under `src/app/components/grading-results/` (see section 13's
`git status --short`). Measured for impact on this plan rather than assumed
harmless:

```
grep -rn -E "generateGeminiImage|generateAnnouncementImageAction" <the six sibling paths>
-> empty, exit 1
```

Control, the same filter on the file that does contain one:
`grep -c -n -E ... src/app/actions/announcement-image.ts` -> `4`, exit 0.

And the walk population is unchanged, because the sibling's one new file is a
test file and its one non-test file already existed:

```
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -not -name "*.test.ts" -not -name "*.test.tsx" -print | wc -l
-> 1593        (the same number measured earlier in this pass)
```

So no bucket and no floor in either wave moved. **The point is that this had to
be measured**: a sibling writing under `src/` is the normal state of this tree,
not an exception, and each wave gate re-derives rather than inheriting the
numbers in section 4.1.

---

## 4. The gates

### 4.1 Baselines, measured immediately before any change

Everything below was run on the tree as it stands, so "no NEW failure" and "no
NEW warning" have something to be measured against.

**These baselines are dated, not durable.** They were measured at a tree state
that had already moved by the end of this pass (section 3.3, section 13): a
sibling began writing six files under `src/` in the interval. **Each wave gate
re-runs every baseline command immediately before its own change and compares
against its OWN run**, never against the numbers below. The numbers below are
here to show what a pass looks like and to prove the commands work, not to be
compared against later.

**Behavioural paths that exist today:**

```
npm run test:paths -- src/lib/llm.test.ts src/lib/bounded-race.test.ts src/app/actions/announcement-image.test.ts
```

```
 Test Files  3 passed (3)
      Tests  83 passed (83)
COVERED src/lib/llm.test.ts files=1 passed=68
COVERED src/lib/bounded-race.test.ts files=1 passed=6
COVERED src/app/actions/announcement-image.test.ts files=1 passed=9
```

That reproduces `docs/g5-test-notes.md` E11 exactly, including the `passed=9`
that its section 3 requirement 7 makes the I-4 baseline.

**The structural sweeps that read these waves' files as source text.** None of
these appears in the test notes' gate command, and every one of them can turn a
correct behavioural change red. Baselined together:

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/file-size-ceiling.structure.test.ts src/lib/use-server-exports.test.ts src/app/actions/action-guard-coverage.test.ts src/app/components/recording/recording-split.structure.test.ts src/app/components/ui/modalAdoption.wiring.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts
```

```
 Test Files  8 passed (8)
      Tests  180 passed (180)
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
COVERED src/file-size-ceiling.structure.test.ts files=1 passed=3
COVERED src/lib/use-server-exports.test.ts files=1 passed=14
COVERED src/app/actions/action-guard-coverage.test.ts files=1 passed=19
COVERED src/app/components/recording/recording-split.structure.test.ts files=1 passed=53
COVERED src/app/components/ui/modalAdoption.wiring.test.ts files=1 passed=42
COVERED src/tools/vitest-paths/gate-commands.structure.test.ts files=1 passed=28
```

What each one binds, read from the file rather than assumed:

| sweep | what it does to these waves | which wave |
|---|---|---|
| `src/lib/use-server-exports.test.ts:96-117` | legalises only `export async function`, `export default async function`, `export type`, `export interface` in a `"use server"` module. This is why the four constants stay module-private and the oracle is a frozen literal by force | G5-1 |
| `src/app/actions/action-guard-coverage.test.ts:104,:111` | flat-walks `src/app/actions`, skipping any name containing `.test.`; floors are `>100` actions and `>70%` guarded. A new test file in that directory is invisible to it; a new exported action would not be | G5-1 |
| `src/app/components/recording/recording-split.structure.test.ts:79-91` | walks the recording directory INCLUDING `.test.ts` and enforces `countLines <= 1000` on every one. Both of wave G5-2's new files enter it | G5-2 |
| the same file, `:279-281` | builds `combinedRecordingSource` from that directory EXCLUDING `.test.ts`, then pins `ta-rec-disc-*` at 17 and `ta-rec-ann-*` at 3. `announcementImagePipeline.ts` is in that corpus, so wave G5-2 must add no `ta-` string. `CLIENT_PATIENCE_MS = 30_000` adds none | G5-2 |
| `src/file-size-ceiling.structure.test.ts:41,:106` | repo-wide, `src/` only, `.ts`/`.tsx`, limit 1000 via `countLines` | both |
| `src/lib/no-emojis.test.ts:270-277` | walks `src/` AND `docs/`, floor `>500`. Scans **this document** too. Never hand-roll an emoji scan; this file owns the rule and its one authorized exception | both, and this document |
| `src/source-bytes.structure.test.ts:48,:69,:84` | walks from the repo root, floor `>500`; literal control bytes and BOM. Scans **this document** too | both, and this document |
| `src/app/components/ui/modalAdoption.wiring.test.ts:619-641` | `modalAdoptionSourceScan.ts` imports `node:fs`, so only test files may import it. Read line by line: the violator list filters `/\.test\.tsx?$/` **before** flagging, so a `*.wiring.test.ts` importer is excluded by construction. This confirms `docs/g5-test-notes.md` A3 by reading the enforcer, which A3 itself could not do | both |
| `src/tools/vitest-paths/gate-commands.structure.test.ts:94,:256-279` | walks `docs/**/*.md` except `docs/BACKLOG.md` and asserts, exact both ways, that the set of raw multi-path test commands equals a frozen list. **This document is inside that walk.** Any raw multi-path run of the test runner written into it is RED | this document |

**Lint.** `npm run lint` -> **exit 0**, `7 problems (0 errors, 7 warnings)`, in
four files:

```
src/app/components/RecordingTab.tsx                                   react-hooks/exhaustive-deps
src/app/components/recording/useDiscussionCapture.wiring.test.ts      no-unused-vars x3
src/app/components/repo-grades/repoGradesSliceA.guards.test.ts         no-unused-vars
src/lib/canvas-modules/new-quiz.test.ts                                no-unused-vars x2
```

**None of those four files is in either wave's write set**, and the baseline is
recorded as that SET OF FILES, not as a number. Note one of them sits in wave
G5-2's own directory (`recording/useDiscussionCapture.wiring.test.ts`) but not in
its write set, so a pre-existing warning there must not be read as new.

**Do not pin an absolute warning count.** The brief records four different values
in one day (4, 7, 8, 7). This pass adds a fifth reason not to: my own
`grep -c -i "warning"` over the same output returned **8** while eslint's own
summary line said **7 warnings** - the grep counted the summary line itself. Two
instruments, one output, two numbers. The pass condition is exit 0 and no new
warning naming a file in this wave's write set.

### 4.2 Wave G5-1's gate

```
npm run test:paths -- src/lib/llm.test.ts src/lib/bounded-race.test.ts src/app/actions/announcement-image.test.ts src/app/actions/announcement-image.wiring.test.ts
```

Pass looks like: `Test Files 4 passed (4)`, and four `COVERED` lines, with
`COVERED src/app/actions/announcement-image.test.ts files=1 passed=9` or higher
(fewer than 9 means an assertion was deleted, not satisfied -
`docs/g5-test-notes.md` section 3 requirement 7), plus
`COVERED src/lib/llm.test.ts files=1 passed=68` and
`COVERED src/lib/bounded-race.test.ts files=1 passed=6` unchanged.

Then, in the same gate and nowhere else:

```
npx tsc --noEmit --incremental false
```

Pass is no output. **Exactly one caller runs this** - `tsconfig.json` sets
`incremental: true` and concurrent runs race on `tsconfig.tsbuildinfo`
(`docs/loop/parallel-disjointness.md` section 5).

Then `npm run lint`, pass condition as 4.1.

Then the structural sweeps from 4.1 that this wave can move:

```
npm run test:paths -- src/lib/use-server-exports.test.ts src/app/actions/action-guard-coverage.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/app/components/ui/modalAdoption.wiring.test.ts
```

Pass is `Test Files 6 passed (6)` with each `COVERED` line's `passed=` at or
above its 4.1 baseline (14, 19, 3, 18, 3, 42 respectively).

Then the tree gate:

```
git status --short
```

Pass is exactly the three paths of this wave's write set, plus any entry a named
sibling owns, and nothing else. A report is not evidence, and a
`.claude/worktrees` copy is returned first by `Glob`, so this command is what
proves what was actually touched.

Byte hygiene, at the end of every sabotage cycle and again at the gate, on every
file the cycle touched:

```
tr -dc '\r' < <file> | wc -c
```

Pass is `0`. **Do not use `grep -c $'\r'`.** Reproduced this pass on a CRLF copy
of `announcement-image.ts` made outside the repository, holding 68 real CR
bytes: `tr -dc` reported **68**, and `grep -c $'\r'` reported **0 with exit 1** -
the same reading it gives a clean file. Both of this wave's production files
report 0 CR today.

**Why this gate is a SUBSET of `docs/g5-test-notes.md` section 3 requirement 6's
six-path command, and why that is not a contradiction.** The wrapper refuses a
path that does not exist yet, measured directly:

```
npm run test:paths -- src/lib/bounded-race.test.ts src/app/actions/announcement-image.wiring.test.ts
```

```
PRE-CHECK FAILED
does not exist on disk: src/app/actions/announcement-image.wiring.test.ts
```

with exit code **1**, read from the command. `preCheckArgs`
(`src/tools/vitest-paths/paths-gate.ts:31-49`) probes every argument before the
runner is invoked and returns a decision with no tests run at all. So the
verbatim six-path command **cannot** be run at wave G5-1, because three of its
paths do not exist until wave G5-2. It is the ITEM gate, run once at the end of
wave G5-2. Requirement 6 names the command; it does not say at which wave, and
this is the only reading under which it is runnable.

A wave that runs the six-path command early gets `PRE-CHECK FAILED` and exit 1.
That is the wrapper working, not a failing suite, and it must not be reported as
one.

### 4.3 Wave G5-2's gate

The verbatim command from `docs/g5-test-notes.md` section 3 requirement 6, used
as given rather than composed:

```
npm run test:paths -- src/lib/llm.test.ts src/lib/bounded-race.test.ts src/app/actions/announcement-image.test.ts src/app/actions/announcement-image.wiring.test.ts src/app/components/recording/announcementImagePipeline.test.ts src/app/components/recording/announcementImagePipeline.wiring.test.ts
```

Pass looks like: `Test Files 6 passed (6)`, six `COVERED` lines, with
`src/lib/llm.test.ts files=1 passed=68`,
`src/lib/bounded-race.test.ts files=1 passed=6`, and
`src/app/actions/announcement-image.test.ts files=1 passed=9` or higher.

Then `npx tsc --noEmit --incremental false` (one caller), `npm run lint` (4.1's
condition), and this wave's structural sweeps:

```
npm run test:paths -- src/app/components/recording/recording-split.structure.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/app/components/ui/modalAdoption.wiring.test.ts
```

Pass is `Test Files 5 passed (5)` with `passed=` at or above 53, 3, 18, 3, 42.

Then `git status --short` against this wave's three paths, and the `tr -dc` CR
check on each file touched.

**One typing hazard specific to this wave, named because it is the shape that
ships green elsewhere.** `announcementImagePipeline.ts:70` currently reads
`if ("error" in result)`. After the wrap, `result` becomes a
`BoundedOutcome<GenerateAnnouncementImageResult>`, and the `{kind:"failed", error: unknown}`
variant ALSO has an `error` key - so a reused `"error" in ...` test would
silently capture the failed arm. The implementer must branch on `outcome.kind`
first. `tsc` does catch the consequence (`error: unknown` is not assignable to
`setImageError: (v: string | null) => void`), which is why
`npx tsc --noEmit --incremental false` is in this wave's gate and not optional.

---

## 5. Line-shift obligations these waves create

Both waves insert lines above existing pinned citations, so this is a real
obligation and it has been dropped in this repo before.

**Wave G5-1, in `src/app/actions/announcement-image.ts`.** The additions are a
`raceWithTimeout` import, four module-private constants, a `startedAtMs` read at
entry (before `requireOwner()`, per I-2), the `remainingMs`/`waitMs`
computation, and the outcome branching. The file is 68 lines today.

**The mitigation, and it is cheap enough to be a requirement rather than a
suggestion: put every new import and every new constant AFTER the existing
import block, which ends at `:28`.** That makes lines `1-28` fixed, which
preserves these citations exactly:

| citation | in | survives |
|---|---|---|
| `announcement-image.ts:21-25` (the "never blocks or degrades the text" header) | `docs/g5-test-notes.md` section 4.2 | YES |
| `announcement-image.ts:28` (the `@/lib/llm` import) | `docs/g5-scope.md` section 0, `docs/BACKLOG.md:96` | YES |
| `announcement-image.ts:38` (the `callLlm` doc-comment hit) | `docs/g5-scope.md` section 0, `docs/BACKLOG.md:96` | YES |

These do NOT survive, and each needs re-pinning:

| citation | in | delta |
|---|---|---|
| `announcement-image.ts:52` (the call site) | `docs/g5-scope.md` sections 0, 4, 5; `docs/g5-test-notes.md` section 0; `docs/BACKLOG.md:96` | shifts down by exactly the number of lines inserted between `:29` and `:52` |
| `announcement-image.ts:42` and `:42-68` (the declaration and the whole function) | `docs/g5-scope.md` sections 1, 2; `docs/g5-check.md` | `:42` shifts by the count inserted above it; `:68` shifts by the total added |
| `announcement-image.ts:46` (the `requireOwner()` call) | `docs/g5-check.md` | shifts with `:42` |

**The delta is not guessable, so it is not guessed.** The obligation is:
**the implementer of wave G5-1 reports `wc -l` and `@(Get-Content).Count` on
the file before and after, plus the new line numbers of the declaration, the
`requireOwner()` call and the wrapped call site.** The **orchestrator** then
re-pins `docs/BACKLOG.md:96` at the push, in the same reconciliation that
strikes the row - that file is the orchestrator's, not an implementer's, and
this repo has already had to re-pin a citation whose range stopped resolving
(`8545ed6`). `docs/g5-scope.md`, `docs/g5-test-notes.md` and `docs/g5-check.md`
are historical artifacts of a finished activity; re-pinning them is optional,
and if it is not done, the fact that their `:52` citations are stale must be
stated at the push rather than discovered later.

**Wave G5-2, in `src/app/components/recording/announcementImagePipeline.ts`.**
`CLIENT_PATIENCE_MS` and a `raceWithTimeout` import go in above the interface,
so everything from `:41` down shifts:

| citation | in | delta |
|---|---|---|
| `announcementImagePipeline.ts:41-54` (`AnnouncementImageDeps`) | `docs/g5-scope.md` section 5, `docs/g5-test-notes.md` section 6 | shifts by the lines inserted above `:41` |
| `announcementImagePipeline.ts:69` (the call site) | `docs/g5-scope.md` sections 0, 4, 6; `docs/BACKLOG.md` context | shifts by the lines inserted above `:69` |
| `announcementImagePipeline.ts:65-82`, `:16-22`, `:30-33`, `:57` | `docs/g5-scope.md` section 2, this document section 1.1 | `:16-22` and `:30-33` survive if the insertion goes at or after `:35`; the rest shift |

**Mitigation, same shape: put the import and the constant at or after `:35`**
(the existing import block starts at `:35`), which preserves `:16-22` and
`:30-33`. Same reporting obligation on the implementer, same owner for
`docs/BACKLOG.md`.

**Nothing in `src/` pins a line number in either file.** Measured:

```
grep -rn -E "announcement-image\.ts|announcementImagePipeline\.ts" src --include=*.test.ts --include=*.test.tsx
-> empty, exit 1
```

Control, same filter on a path that cannot exist
(`announcement-image-NOPE.ts`): empty, exit 1. Both empty, so this one is
reported with its limit rather than as a proof - the control cannot distinguish
"no test names these paths" from "the filter cannot see them". What it does
establish is that no test file contains either path as a literal string, which is
the form a path-pinning test would have to take. The line-shift exposure is
therefore confined to `docs/`, and no test goes red from the shift itself.

---

## 6. Ceilings - checked before placing, not after

The 1000-line ceiling is enforced by `src/file-size-ceiling.structure.test.ts`
(repo-wide, `src/`, limit 1000 at `:41`) and, for wave G5-2's directory, again by
`recording-split.structure.test.ts:79-91` including test files. Both use
`countLines` from `src/lib/count-lines.ts`, which section 10 executed and which
agreed with `wc -l` and `@(Get-Content).Count` on both production files.

| file | today | wave | after (estimated) | headroom |
|---|---|---|---|---|
| `src/app/actions/announcement-image.ts` | 68 | G5-1 | order of 90 | vast |
| `src/app/actions/announcement-image.test.ts` | 113 | G5-1 | order of 250 | vast |
| `src/app/actions/announcement-image.wiring.test.ts` | does not exist | G5-1 | order of 200-300 | vast; the naming precedent `announcements-panel.wiring.test.ts` is 410 lines by `wc -l` |
| `src/app/components/recording/announcementImagePipeline.ts` | 126 | G5-2 | order of 150 | vast |
| `src/app/components/recording/announcementImagePipeline.test.ts` | does not exist | G5-2 | order of 150-250 | vast |
| `src/app/components/recording/announcementImagePipeline.wiring.test.ts` | does not exist | G5-2 | order of 200-300 | vast |

The "after" column is an estimate and is labelled one; the measured facts are the
"today" column and the limit.

**`src/lib/llm.ts` (821) and `src/lib/llm.test.ts` (917) are the two files near
the wall, and neither is touched by either wave.** `docs/g5-scope.md` section 6
and `docs/g5-test-notes.md` section 3 requirement 5 both say so, and **the plan
holds it**: wave G5-1 writes three paths under `src/app/actions/`, wave G5-2
writes three under `src/app/components/recording/`, and `llm.ts` appears in
neither write set. It is read as source text by wave G5-1's W-3 instrument C
(section 2), which does not write it.

**Nothing in this plan approaches a ceiling, so nothing here plans an
extraction.** If a wave's implementer finds a file heading past 1000, it stops
and the orchestrator rules; three files reached the wall in one day before that
routing existed.

This document states no count of its own lines.

---

## 7. What the waves require of the test-notes seat

Nothing new. Every instrument the waves gate on is already specified in
`docs/g5-test-notes.md`, and its section 12 reference implementations already
proved each one satisfiable (inner 8/8, landed nine 9/9, outer 4/4, walkers green
on both identifiers). The requirements, restated only as a mapping so no wave
gates on something nobody wrote:

| wave | requires, by id | owner |
|---|---|---|
| G5-1 | I-1 (four oracle rows R1/R3/R5/R6 plus the two-run extra assertion and `toHaveBeenCalledTimes(1)`), I-2 (no separate instrument - a measured finding, not an omission), I-3 (the frozen `{error}` literal of section 4.2), I-4 (the nine landed assertions, with `:100-105` and `:107-112` NOT rewritten), W-1 and W-3 for `generateGeminiImage` including the alias assertion, W-2's inner arm, the section-8 C2/C7 stripper canaries | `docs/g5-test-notes.md` |
| G5-2 | O-1, O-2, O-3, W-1 and W-3 for `generateAnnouncementImageAction` including the alias assertion, W-2's outer arm, the frozen wording of section 4.3, the constant of section 4.4 | `docs/g5-test-notes.md` |

**Three pass conditions no wave may rest on**, carried forward verbatim because a
wave that gates on a non-discriminating assertion is a wave with a green gate and
no evidence:

- **I-3 does not discriminate elapsed-awareness.** Measured GREEN on all four
  mutants. A wave may not cite it as covering I-1.
- **O-1 does not discriminate.** Measured GREEN on the unwrapped mutant. A
  constant can exist, be exported, be asserted, and be used by nothing; it is a
  change-detector, and it earns its place only paired with W-2's outer arm.
- **O-3 does not discriminate.** Both arms measured GREEN on the unwrapped
  mutant. They are regression guards on the two paths that exist today.

So wave G5-1's discriminating evidence is I-1's row R3 and W-1; wave G5-2's is
O-2's 30,000 arm and W-1. Everything else is regression or change detection, and
the wave gate should say so when it reports green.

**The alias hole is not optional.** An aliased import
(`import { generateGeminiImage as gen }`) contains no `generateGeminiImage(`
substring, so W-1's partition reports green on a genuinely unbounded caller -
measured in E8/S8. Re-measured here, independently, over both identifiers:

```
grep -rn -E "import[[:space:]]*\{[^}]*\b(generateGeminiImage|generateAnnouncementImageAction)[[:space:]]+as[[:space:]]+" src --include=*.ts --include=*.tsx
-> empty, exit 1
```

Control, the same regex against a synthesized aliasing line written **outside**
the repository:

```
import { generateGeminiImage as gen } from "@/lib/llm";
-> matched, exit 0
```

Zero today and the canary fires, so the absence claim rests on a filter that can
see the pattern. `grep -E`, never `grep -P`, which is broken in this checkout and
reports clean without checking.

**No wave writes an oracle, a wording literal, a mutation family or a sabotage
step.** Those are read from `docs/g5-test-notes.md` and copied verbatim.

---

## 8. `docs/g5-test-notes.md` section 3's seven requirements, discharged by name

| # | requirement | where this plan discharges it |
|---|---|---|
| 1 | the inner wrap and a test file under `src/app/actions/` land in the SAME wave | Wave G5-1's write set holds `announcement-image.ts` and both test files under `src/app/actions/` |
| 2 | W-1 is RED today, so it cannot land before the wrap | Section 2, wave G5-1's RED/GREEN table, stated as an instruction rather than a footnote; and wave G5-2's, which has the same shape for the other identifier |
| 3 | the constants must NOT be exported | Wave G5-1's export analysis, with the enforcer read at `use-server-exports.test.ts:96-117` rather than cited |
| 4 | `CLIENT_PATIENCE_MS` must be exported | Wave G5-2's export analysis, with both callers named and both inside that wave; and finding F3 |
| 5 | nothing touches `src/lib/llm.ts` or `src/lib/llm.test.ts` | Section 6; neither appears in either write set, and `llm.ts` is named as read-only |
| 6 | the gate command, spelled once; `tsc` by the wave gate and nobody else; lint's exit-0-no-new-warning condition with no absolute count | Sections 4.2 and 4.3. The verbatim six-path command is used AS GIVEN at wave G5-2; wave G5-1 runs its four existing paths, because the wrapper pre-check refuses a path that does not exist - measured, with the output pasted |
| 7 | the I-4 baseline is `passed=9` | Section 4.1's measured baseline reproduces it; both wave gates state `passed=9 or higher` and call a lower number a deletion |

---

## 9. Findings, including one correction to my own brief

**F1 - my brief contains an instruction that belongs to a different item, and
acting on it would have put a false gate condition in this plan.** The brief told
me to note "the test notes' own conditional: one helper's only caller is a copy
clause, so if the refusal wording changes so no clause names a folder, that
helper loses its caller and must stay module-private," and to state it as a gate
condition. **No such conditional exists in G5's artifacts.** Measured, with a
control:

```
grep -n -i -E "refusal|copy clause|folder" docs/g5-test-notes.md docs/g5-scope.md
-> empty, exit 1

grep -c -n -i -E "raceWithTimeout" docs/g5-test-notes.md docs/g5-scope.md
-> docs/g5-test-notes.md:26, docs/g5-scope.md:23, exit 0     (same filter, term known present)

grep -c -i -E "refusal|copy clause|folder" docs/a44-test-notes.md
-> 160, exit 0
```

The same filter that returns nothing on both G5 documents returns 160 hits on
`docs/a44-test-notes.md`. The instruction is A44's, carried into this brief. I
did not invent a G5 analogue for it. **What G5 does have, and it is a different
shape, is F3 below** - an export whose only consumer outside its own module is a
test assertion. Stating it as the brief's conditional would have been a
fabricated gate.

**F2 - the six-path gate command is not runnable at the first wave, and the
failure it produces looks like a red suite.** Measured in 4.2: `PRE-CHECK FAILED
/ does not exist on disk: <path>`, exit 1, with no tests run. This is a
refinement of `docs/g5-test-notes.md` section 3 requirement 6, not a
contradiction of it - that requirement names the command and does not say at
which wave. Under a one-wave reading the question never arises, which is probably
why it was not addressed.

**F3 - `CLIENT_PATIENCE_MS`'s `export` keyword is required by exactly one
assertion, and that assertion is one the test notes themselves measured as
non-discriminating.** Traced: W-2's outer arm is a source-text check on the same
file and needs no export; O-2 drives the real `raceWithTimeout` behaviourally
and needs no export; only O-1 (`expect(CLIENT_PATIENCE_MS).toBe(30_000)`) reads
it across the module boundary, and section 6 of the test notes records that O-1
"passed on the unwrapped mutant" and is "a change-detector, not a coverage
claim".

**I am not overruling it, and the waves implement it as written** - the test
notes own the instruments, the constant is genuinely used at `:69` in its own
file, and section 3 requirement 4 states the export as a requirement. The reason
to record it is that it is the one export in this plan whose cross-module
consumer is an assertion rather than a caller, and a checker should see that I
noticed rather than discover it. **If a checker rules the export out, exactly one
requirement falls (O-1) and the wave still has W-2's outer arm and O-2's
discriminating pair** - so either answer terminates without reopening anything
else.

**F4 - the test notes' gate command names no structural sweep, and four of them
can turn a correct change red.** `use-server-exports.test.ts` (an exported
constant), `recording-split.structure.test.ts` (a file over 1000 lines in that
directory, test files included), `no-emojis.test.ts` and
`source-bytes.structure.test.ts` (a non-ASCII byte, a BOM, a materialised
escape). This is an addition to the gate, in section 4, not a change to any
instrument - the test-notes seat owns what is measured behaviourally; the wave
gate owns what the tree enforces.

**F5 - this document is itself inside a landed enforcer's walk**, which is worth
saying because it is the same class as F4 pointed at `docs/`.
`gate-commands.structure.test.ts:94` walks `docs/**/*.md` except
`docs/BACKLOG.md`, and `:256-279` asserts the raw multi-path hit set matches a
frozen list exactly both ways. Baselined green before writing
(`passed=28`), and every command in this document uses the wrapper form for that
reason.

**F6 - RULING 77's oracle is correct, verified against the real constants rather
than transcribed.** The four constants were read out of
`src/app/api/class-trends-insight/route.ts` by the probe in section 10 (values
50,000 / 8,000 / 24,000 / 2,000 at lines 47 / 48 / 49 / 51), the formula was read
at `:143-144`, and `min(MAX, max(MIN, TOTAL - e - RESERVE))` was recomputed for
all six of the test notes' rows including the two it dropped as redundant. **All
six agree with the frozen literals.** So wave G5-1's pass condition rests on an
oracle that has been independently recomputed from the tree, not on a table
copied between documents.

---

## 10. Method - what was executed, and what it proves

**Every quantity in this document names the command that produced it.** Line
counts come from `wc -l` and `@(Get-Content <file>).Count`; `Measure-Object
-Line` was not used anywhere. Exit codes were read directly from the command,
never through a pipe, because `find` exits 0 when it matches nothing and `tail`
would report its own status.

**Import-only probe against REAL repository modules, under
`node --experimental-strip-types`, from this session's scratchpad OUTSIDE the
repository.** It imports `src/lib/bounded-race.ts` and `src/lib/count-lines.ts`
by file URL (neither uses the `@` alias, so bare Node resolves them), fingerprints
five real files by size, mtime and sha256 before and after, and reports the diff.

Node `v22.14.0`. Results:

```
raceWithTimeout arity                -> 2      (the wait IS the second positional parameter)
bounded_race exports                 -> ["raceWithTimeout"]
count_lines exports                  -> ["countLines"]
raceWithTimeout(Promise.resolve(7),50)          -> { kind: "settled", value: 7 }
raceWithTimeout(new Promise(()=>{}),10)         -> { kind: "timedout" }
raceWithTimeout(Promise.reject(Error),50)       -> { kind: "failed", error }
RULING 77 constants, read from route.ts  -> TOTAL 50000 (:47), MIN 8000 (:48), MAX 24000 (:49), RESERVE 2000 (:51)
RULING 77 remaining, read from route.ts  -> :143  const remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now();
RULING 77 formula,   read from route.ts  -> :144  const waitMs = Math.min(MODEL_WAIT_MAX_MS, Math.max(MODEL_WAIT_MIN_MS, remainingMs - MODEL_WAIT_RESERVE_MS));
oracle recomputation, all six rows        -> agree: true for every row
countLines(announcement-image.ts)         -> 68
countLines(announcementImagePipeline.ts)  -> 126
import-only diff                          -> clean: no byte, sha256 or mtime change on any of the five files
```

The three outcome kinds matter to the plan and not only to the test notes: W-2's
inner arm asserts the second argument is a bare identifier, I-1 reads
`mock.calls[0][1]`, and wave G5-2's branching has to handle all three variants -
all three of which the probe reached.

**The import-only diff is the evidence that reading did not become writing.** All
five real files - `bounded-race.ts`, `count-lines.ts`,
`class-trends-insight/route.ts`, `announcement-image.ts`,
`announcementImagePipeline.ts` - came back byte-identical, sha-identical and
mtime-identical.

**One trap reproduced rather than recalled.** My first probe was written through
a Bash heredoc with a quoted delimiter, and the heredoc still halved the
backslashes: the file on disk held `const\s+` where the source said `const\\s+`,
so the JS template literal collapsed to `consts+` and the constant lookup threw
`constant not found in route.ts: TOTAL_BUDGET_MS`. Verified by `cat -A` on the
written line. The probe was rewritten with the `Write` tool and with **no
backslash escapes at all** - every parse is `indexOf`/`split` based. This is why
no quantity in this document came from a heredoc-authored regex.

**Every absence claim above is paired with a control exercising the same pattern
AND the same filter**, because six absence claims failed on the instrument rather
than the pattern in one day here:

| absence claimed | filter | control | control result |
|---|---|---|---|
| no second call site for either identifier | `grep -rn ... --include=*.ts --include=*.tsx \| grep -v "\.test\."` | the same filter on `generateGeminiImageZZZ` | empty, exit 1 |
| no aliased import of either identifier | `grep -rn -E "import...as..."` | the same regex on a synthesized aliasing line outside the repo | matched, exit 0 |
| the brief's copy-clause conditional is not in G5's artifacts | `grep -n -i -E "refusal\|copy clause\|folder"` | the same filter for `raceWithTimeout` (present), and the same terms against `docs/a44-test-notes.md` | 26 and 23 hits; 160 hits |
| no test file names either production path | `grep -rn -E ... --include=*.test.ts --include=*.test.tsx` | the same filter on a path that cannot exist | empty, exit 1 - **so this one is reported with its limit, section 5** |
| the two write sets do not intersect | `cat w1 w2 \| sort \| uniq -d` | the same command with a deliberately overlapping pair | all three paths printed |
| no CR bytes in either production file | `tr -dc '\r' < f \| wc -c` | a CRLF copy made outside the repo | 68; and `grep -c $'\r'` on the same file reported 0 with exit 1 |
| no scratch file or directory inside the repo | `find . -maxdepth 3 -name ... -not -path "./node_modules/*" -print` | the same filter on `vitest-paths`, which exists | `./src/tools/vitest-paths` printed |

**What cannot be verified here at all, labelled rather than implied:**

- **No real timeout is observable.** The network is blocked and there are no API
  keys; `vitest.setup.ts:34-53` throws on any unmocked `fetch`. Every millisecond
  figure in this plan - 24,000, 30,000, the oracle rows - is a computed or
  simulated quantity, never an observed latency.
- **No component is rendered by any test here.** Anything about what the
  instructor sees on screen is a reading claim. That includes the whole question
  of whether the three failure states are distinguishable, which stays a
  residual.
- **`npx tsc --noEmit` was NOT run by this seat.** Exactly one caller may, and it
  is the wave gate.

---

## 11. Residual register

Every row names the object, an owner, an instrument, the direction of failure and
the step that will measure it. A row missing any of those would be a deletion and
I would say so. Two candidate rows were rejected on exactly that ground and are
recorded below the table as deletions rather than filed as residuals.

| # | object not proven here | owner | instrument | direction of failure | step |
|---|---|---|---|---|---|
| W-R1 | The exact line delta wave G5-1 introduces above `announcement-image.ts:42`, and wave G5-2 above `announcementImagePipeline.ts:41` | The implementer of each wave, then the orchestrator | `wc -l` and `@(Get-Content <file>).Count` on the file before and after, plus the reported new line numbers of the declaration, the `requireOwner()` call and the wrapped call site | Fails if `docs/BACKLOG.md:96`'s `announcement-image.ts:52` citation is left resolving to a line that is no longer the call site | The wave gate reports the delta; the orchestrator re-pins `docs/BACKLOG.md:96` at the push (section 5) |
| W-R2 | Whether either wave's gate ran while a sibling was writing a non-test file under `src/`, which would make W-1's whole-tree partition and W-3's floor untrustworthy | The dispatcher of each wave | `git status --short` at the gate, compared against the wave's three-path write set and the named sibling entries | Fails if `other` is non-empty naming a file outside the write set and the gate reports it as this wave's defect rather than a sibling finding | The wave gate, section 3.3's disambiguation rule. **This condition was live during this pass and was measured**, not hypothesised - section 3.3 |
| W-R3 | Whether 24,000 ms (inner) and 30,000 ms (outer) are generous enough for a real Gemini IMAGE call. **No real timeout is observable here** | Repo owner, live key required | One timed image generation against production Gemini, elapsed read as `llm.ts:555-557` already instruments `callGemini` | Fails if the image call times out under either bound at a rate the owner finds unacceptable | An owner-run timed check after wave G5-2 ships. Same object as `docs/g5-scope.md` R2 and `docs/g5-test-notes.md` R-D - filed once, here, so the push records one row and not three |
| W-R4 | Whether `CLIENT_PATIENCE_MS`'s 6,000 ms margin over the inner clamp absorbs the real browser-to-Server-Action round trip | Repo owner | Production timing observation, or lightweight logging added in a later wave | Fails if the outer bound fires before the inner worded timeout can return, so the instructor sees the generic outer wording on a call that was about to succeed | An owner-run or logged observation after deploy. Does not block either wave. Same object as `docs/g5-scope.md` R6 |
| W-R5 | Whether an instructor can distinguish the three failure states on screen - model failure, inner timeout, outer timeout - all landing in `imageState === "failed"` rendering `{imageError}` (`TakeAnnouncementPanel.tsx:564-567`) | Repo owner, or a UX pass on the as-built diff | Real browser observation. **No component is rendered by any test here**, so this cannot be an instrument in either wave | Fails if the three states are technically distinct but read as identical or illegible | A follow-up UX pass against the as-built diff, after wave G5-2. Same object as `docs/g5-scope.md` R5 and `docs/g5-test-notes.md` R-A |
| W-R6 | OC5 - the platform's unconfigured Server Action ceiling | Repo owner | The Vercel project settings page (`docs/a29-architecture.md:285`) | N/A - a measurement residual | Whenever OC5 is answered for any row. RULING 94 makes this item's correctness independent of it, so neither wave blocks on it. Same object as `docs/g5-scope.md` R1 and `docs/g5-test-notes.md` R-E |
| W-R7 | Whether a re-export barrel that RENAMES either export could hide an unbounded caller from W-1. The alias assertion closes `import { X as y }`; it does not close `export { X as y } from "..."` followed by a call to `y` | The next agent extending W-1 | A walk over `export {` blocks with a rename, over the same 1,593-file list, with a synthesized-renaming control | Fails if a renaming re-export exists and is called unbounded | Measured absent for both identifiers today by the same walk that found zero aliased imports; re-measure whenever either module gains a barrel. Same object as `docs/g5-test-notes.md` R-B |
| W-R8 | `stripComments`'s two documented limitations (`modalAdoptionSourceScan.ts:151-155`) - `regexAllowedHere`'s `)`/`}` ambiguity, and an unterminated regex scanned only to end of line | Whoever owns RULING 79's tokenizer | That module's own test coverage | Fails if either shape appears in a file W-1 walks and flips a bucket | Neither shape occurs in the two files these waves write (both read in full this pass). Re-check at the next wave adding a regex literal near either call site. Same object as `docs/g5-test-notes.md` R-C |

**Two things I am calling deletions rather than filing as residuals**, because
neither has an instrument that could exist:

- **"Whether the estimated post-wave line counts in section 6 are right."** There
  is no instrument for an estimate; there is only the measurement after the fact,
  which is already W-R1's and the ceiling gate's. Filing it would be a residual
  whose instrument is its own remedy. Deleted.
- **"Whether a future wave threading a real `AbortSignal` into `fetch` would
  change either bound."** `docs/BACKLOG.md:95` rules that a different item, and
  there is no instrument in this item that could measure a signal that no code
  here creates (`docs/g5-test-notes.md` E12: `raceWithTimeout` creates and passes
  none; `grep -n "signal" src/lib/llm.ts` returns only `:406` and `:751`, both
  prose). Nothing is owed and nothing is enforced, so this is a deletion and not
  a deferral.

---

## 12. Nothing here is unsettled

There is no fork in this plan that a later answer would change, so there is
nothing to state last. The two questions a reader might expect to find open are
both closed above rather than deferred: the one-wave-or-two question is decided
with its proof and with the cost of the other branch priced (section 1.4), and
the export question is decided as the test notes require with the single
requirement that would fall named (finding F3). Whichever way a checker rules on
either, the activity terminates without reopening anything else.

---

## 13. Tree state at the end of this pass

```
git status --short
```

Run after this document was written, not copied from earlier in the pass:

```
 M docs/css-orphans.md
 M src/app/components/grading-results/gradingResultsHelpers.test.ts
 M src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
 M src/app/components/grading-results/ungradedDisclosure.test.ts
 M src/lib/grade/utils.test.ts
 M src/lib/grade/utils.ts
?? docs/g5-waves.md
?? src/lib/grade/identityInvariants.test.ts
```

`?? docs/g5-waves.md` is **this pass's only entry.** Every other line is
sibling-owned, and the set is not the one this pass opened with - it changed
while this document was being written, which is worth recording rather than
smoothing over:

- ` M docs/css-orphans.md` is sibling-owned and pre-existing, present in this
  session's opening snapshot before this pass began. Neither opened nor touched
  here.
- **` M docs/a44-test-notes.md` was in the opening snapshot and is GONE from this
  one** - its author committed it during this pass, at `1819db7`
  (`git log --oneline -1 -- docs/a44-test-notes.md`). That file was touched by
  exactly one command here, a `grep -c` over it as the control for finding F1,
  which reads and does not write. Its write set did not intersect this
  document's.
- **The six `src/` entries are NEW since this pass began** - a live sibling
  implementer under `src/lib/grade/` and
  `src/app/components/grading-results/`. **None of them was opened, modified or
  referenced for its content here**; the only command that touched them was the
  identifier grep in section 3.3, which reads and does not write, and which
  measured them as containing neither of this item's identifiers. Their paths do
  not intersect either wave's write set.

**No path in the tree was written by this pass except `docs/g5-waves.md`.**

**No `git stash`, no `git add -A`, and no `git checkout --` was run on any path,
sibling or otherwise.** **`docs/backlog.yml` was not read or touched** - every
backlog citation went through `grep -a -n "G5" docs/BACKLOG.md`.

**No file under `src/` was written or mutated.** The probe and every canary live
in this session's scratchpad, outside the repository; the repository commands that
executed anything were `npm run test:paths` runs over existing tests and one
`npm run lint`, all read-only. Verified with a control, because `find` exits 0
when it matches nothing:

```
find . -maxdepth 3 -name "g5plan" -not -path "./node_modules/*" -print
-> empty, exit 0

find . -maxdepth 3 \( -name "probe2.ts" -o -name "crlf-canary.txt" -o -name "w1.txt" -o -name "w2.txt" \) -not -path "./node_modules/*" -print
-> empty, exit 0

find . -maxdepth 3 -name "vitest-paths" -not -path "./node_modules/*" -print
-> ./src/tools/vitest-paths        (the control: the same filter finds what exists)
```

The empty output is the evidence, and the control is what makes it evidence.
