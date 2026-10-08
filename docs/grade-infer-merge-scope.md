# GRADE-INFER-MERGE scope: a graded submission must never be attributed to a student the model did not name for it

Author seat: loop-seat (Sonnet), data/security eye (grade integrity). Consumer: the
checker, then the test-notes seat and the implementer. Measured at HEAD `f9bb2271`
(`git rev-parse --short HEAD`), which includes the RES-FILL-3 W2 consolidation
(`53689856`). Recon plus a fix-shape recommendation. No production code and no test
code is in this change; the only file written is this one. Every edit proposed
below is confined to `src/lib/grade/`. No recording, repo-grades,
walkthrough-announcement or `src/tools` file was opened for edit.

"PROBED" means produced by running the real production function `groupSubmissionsByStudent`
from a scratch script OUTSIDE the repo tree (session scratchpad, not committed, so the
implementer cannot open it; section 12 gives the command and the fixture tables are
carried in full in section 5). `git status --short src` was empty after the probes.

---

## 0. Verdict, in the owner's terms

1. **F15 is real, current, and fixable deterministically. Fix it by deleting the
   `byBase` rung.** At HEAD a file the model never named inherits the name the model
   gave to a DIFFERENT file with the same leaf name. PROBED:
   `AlvarezMaria/essay.txt` (named "Maria Alvarez") plus `BrownTom/essay.txt` (not named)
   gives ONE row "Maria Alvarez" holding both files; with the rung removed it gives
   two rows, "BrownTom/essay" and "Maria Alvarez" (section 4).
2. **The `byBase` rung has no legitimate use.** It is provably reachable ONLY as
   cross-path extrapolation (section 3.1: derived from `rubric.ts:171-194` and
   `utils.ts:313-357`). Narrowing it is therefore equivalent to deleting it, so the
   honest construction is deletion, which makes the bad state unrepresentable.
3. **F10 as authored in the oracle CANNOT be flipped by any deterministic fix, and the
   brief's premise that it can is wrong.** F10 and the legitimate multi-file case F2
   differ only in one filename token the model saw and the code cannot weigh
   (`AdaL` vs `AdaM`, section 6.1). There is no ground-truth signal (no folder, no
   convention name, no zip crossing) separating the two distinct submitters. The only
   rules that would split F10 also split F2 and F13 (false splits of one student's
   files), or refuse them. This scope therefore does NOT flip F10's literals; it
   relabels F10 from a defect to the accepted model-trust boundary and records the
   residual (section 6, R-1). The ONE sanctioned oracle literal edit is F15 only.
   That is a deliberate deviation from the brief and is put to the owner as a single
   terminating question in section 6.3.
4. **Recommended fork reading (acted on in this scope, mine, not an owner ruling):**
   KEEP SEPARATE by original folder identity, no refusal, no new warning channel. The
   separate row's own display ("BrownTom/essay", a folder-and-stem label) is the visible
   signal, exactly the already-accepted behaviour of F3. Alternative (refuse) is one
   line in section 2.
5. **One wave.** Fix plus F15 oracle edit plus one new invariant test, six files
   (section 8).

---

## 1. Where the mechanism lives at HEAD (opened, cited)

| What | file:line | Observation |
|---|---|---|
| ingestion chain (post-W2) | `src/lib/grade/extraction.ts:170-197` | `ingestZipEntries`: extract, refuse (`:188-191`), infer only if `options.inferFileNamesWith` (`:192-194`), then ONE `groupSubmissionsByStudent(submissions, inferredLookup, rawData, zipParents)` (`:195`) |
| callers of the chain | `extraction.ts:158` (`extractStudentEntries`, opt-in inference) and `engine.ts:399,408` (`gradeSubmissions`, always passes its provider) | one composition, two callers; attribution logic still lives in `utils.ts`, as the oracle expects |
| the six-step ladder | `utils.ts:289-400` (`parseSubmissionFileName`) | 1 byRaw `:311-322`, 2 leaf convention `:324-333`, 3 crossing chain `:335-352`, 4 byBase `:354-366`, 5 innermost-crossing stem `:368-384`, 6 leaf stem `:386-399` |
| pass-through | `utils.ts:409-419` (`inferStudentPrefix`) | calls `parseSubmissionFileName` and renames two fields; no logic of its own |
| grouping | `utils.ts:452-551` | groups by `inferred.key` (`:465-478`); terminal unique-label pass in key order (`:504-513`); sort by `localeCompare` (`:520`) |
| lookup builder | `rubric.ts:131-201` (`parseInferredFileNameLookup`) | per accepted item `byRaw.set(rawFileName, inferred)` (`:180`); `byBaseCandidates` keyed on the item's leaf name (`:182-186`); `byBase` keeps a base name only when exactly ONE inferred item has it (`:188-195`) |
| lookup type | `types.ts:454-457` | `InferredFileNameLookup { byRaw; byBase }` |
| refusal blindness | `collisionRefusal.ts:38-48` | `parseSubmissionFileName(filePath, undefined, zipChain)`; the doc comment at `:30-37` states this is by design ("defined purely by ground-truth paths") |
| the second refusal call site | `src/app/actions/grading.ts:932` | `describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents), zipParents)` runs BEFORE any inference, in a file this item must not touch |

### 1.1 F15 mechanism (step 4, byBase inheritance)

Input: `AlvarezMaria/essay.txt` has a byRaw hit; `BrownTom/essay.txt` has none. The model
named only the first, so `byBaseCandidates.get("essay.txt")` holds ONE entry
(`rubric.ts:182-186`) and `byBase.set("essay.txt", ...)` fires (`rubric.ts:188-195`).
For `BrownTom/essay.txt`: step 1 misses (`utils.ts:313`); step 2 misses, `essay.txt` has
fewer than four underscore parts (`utils.ts:95-97`); step 3 has no chain; step 4 hits
`inferredLookup?.byBase.get("essay.txt")` (`utils.ts:357-358`) and returns Maria's
display and key (`:359-365`). Both files share key `a44Encode(["maria alvarez"])`
and group into one row (`utils.ts:465-478`). The refusal never sees it because it parses
with `undefined` (`collisionRefusal.ts:47`).

### 1.2 F10 mechanism (step 1, byRaw duplicate)

Input: `essay1-AdaL.txt` and `code1-AdaM.txt`, the model names BOTH "Ada Lovelace". Both
are byRaw hits (`utils.ts:313-322`) and both return key `a44Encode(["ada lovelace"])`
(`:316`). They group into one row. This is the model's explicit per-file verdict being
honoured, which is the documented top priority of the ladder (`utils.ts:257-262`) and the
behaviour F2 and F13 depend on. Section 6.1 shows why code cannot tell it from F2.

### 1.3 Does the ladder in step 4 ever match anything else? (the F12 question)

F12 (`oracle:404-415`) is a byRaw hit for a single file, resolved at step 1, never at
step 4. Removing step 4 cannot touch it (section 4, probe table).

---

## 2. The product fork, settled

Question: when the model names only one of two folder-distinct submitters (F15), or gives
two files one name (F10), what should the system do?

| Reading | Verdict | Why |
|---|---|---|
| (a) REFUSE: extend the collision refusal to see inference | REJECTED | (1) The refusal must run BEFORE inference so a colliding zip never pays a model call, a property pinned by executing tests (`collisionRefusal.wiring.test.ts:83-94`, asserts `mockCallLlm` not called). A refusal that sees inference must run after the spend. (2) It runs from a second site, `grading.ts:932`, that precedes inference by construction and is outside this item's write set. (3) One model omission would then block the whole class from being graded, when the omitted file can be graded correctly under its own folder. (4) It cannot be written for F10 at all without also refusing F2 and F13 (section 6.1). |
| (b) WARN + keep separate | PARTIAL | "Keep separate" is the recommended reading. The WARN half needs a field on the result type and a rendered surface; no component renders under vitest here, so a warning channel could not be verified, and the result types live outside this item's stay-in-lib/grade constraint in their consumers. Recorded as residual R-2 with an owner. |
| (c) keep separate silently | RECOMMENDED, with the display as the signal | The un-named file is attributed by ground truth (its own folder-folded stem: `utils.ts:392-399`, key and display `BrownTom/essay`). That row is visibly a folder-and-stem label, not a person's name, the same shape the instructor already sees for any un-inferred file (F3 frozen at `oracle:246-250`). The failure direction flips from INVISIBLE (a merged row looks like one student) to VISIBLE (a split row looks unmatched). That is the fail-safe direction for grade integrity. |

Owner-confirmable, one line: "I kept F15's second submitter as its own row labelled by
folder and stem rather than refusing the run; say if you would rather a refusal." Per the
two-rounds rule this does not gate the work: the reading is acted on and the
answer applies by transcription.

Precedent check (traps-spec.md, "check the decisions record FIRST"): I grepped
`docs/owner-decisions-2026-09-23.md` and `docs/owner-decisions-2026-09-27.md` for
"infer", "merge", "wrong student" and "R-4"; the only hits are unrelated
(`owner-decisions-2026-09-23.md:297`, `owner-decisions-2026-09-27.md:124`). No owner
decision bears on this fork. The backlog row's "recommended reading (a)/(b)"
(`docs/backlog.yml:943-955` row text) is the orchestrator's recommendation, not a ruling.

---

## 3. Why deletion, not narrowing (the fix shape)

### 3.1 byBase is reachable only as cross-path extrapolation (derived, then probed)

Let S be the set of requested raw names (the keys of `submissions`; passed to the model at
`extraction.ts:193`). For a file f in S to reach step 4:

1. step 1 missed, so `byRaw` has no entry for f: the model produced no accepted item
   for f (`rubric.ts:171-180` only sets `byRaw` for accepted items);
2. `byBase.get(base(f))` hit. `byBase` keys are `base(r)` for accepted items r
   (`rubric.ts:182-195`). Since f has no accepted item, the r that produced that key is a
   DIFFERENT path with `base(r) == base(f)`.

So every firing of step 4 attributes f to the verdict the model gave a different path.
There is no firing in which f is the file the model judged. Tightening the uniqueness
test to count over S instead of over accepted items (`rubric.ts:188-195`) makes `byBase`
empty for every f in S by the same argument (f itself is in S, so its base is no longer
unique). So "narrow it" produces a map that can never hit, i.e. dead code carrying a
misleading name. Deletion is the real fix.

Why the rung was written, for the record: it arrived with the first inference code
(`e95c63cd`, 2026-05-23) as a base-name fallback when the model's raw names might not match
extraction paths. That case is already discarded by the `requestedSet.has(rawFileName)`
filter (`rubric.ts:171-173`): an item whose raw name does not exactly match a requested
path never enters either map. I did not find an intended case it still serves, and the
one executing test that mentions it (`utils.test.ts:142-161`) tests only that ground truth
OUTRANKS it, not that it ever applies.

### 3.2 Where the fix does and does not live

| Location | Verdict |
|---|---|
| `utils.ts` step 4 (`:354-366`) | YES: delete the block. This is the line the backlog row names. |
| `rubric.ts` (`:160`, `:182-195`, `:197`, empty fallbacks `:135-138`, `:213-216`) | YES: drop `byBaseCandidates`, `byBase`, and the `byBase` field in the empty fallbacks. After removal `getBaseFileName` (`rubric.ts:203-207`) is used nowhere in that file (`grep -n getBaseFileName src/lib/grade/rubric.ts` shows only `:182` and the definition `:203`), so delete it too or eslint flags it. |
| `types.ts:454-457` | YES: `InferredFileNameLookup` becomes `{ byRaw }`. Required, not optional: `utils.test.ts:149-152` builds a typed literal with `byBase`, which would fail `tsc` as an excess property, forcing the test edit in section 8. |
| `inferStudentPrefix` (`utils.ts:409-419`) | NO: a pass-through with no attribution logic. |
| `collisionRefusal.ts` | NO: see section 2 row (a). Its blindness is by design and stays. |

Do NOT renumber the ladder. References to "step 5" and "step 6" live in comments and in
the `reachedStemFallback` doc (`utils.ts:299-303`), and the A44 fold is described in
those terms throughout the file. Keep the numbers, replace the step 4 block with a short
comment stating that the rung was removed and why, and update the header list
(`utils.ts:279-280`) and the `(1, 4)` in `utils.ts:301` to `(1)`.

### 3.3 What the fix cannot protect (stated, not hidden)

After deletion the only ways two submitters can share a row are:
(i) the model explicitly names EVERY merged file with the same name (the F10 class,
section 6); (ii) their ground-truth keys are equal, which the pre-inference refusal
already polices (`collisionRefusal.ts:38-90`); (iii) an un-named file's fallback key equals
a model-chosen name's key (for example the model names a file "essay" while another file
falls back to stem "essay"). (iii) is the same model-trust boundary as (i) and is
pre-existing; not closed here.

---

## 4. Measured: what the fix changes and what it does not (PROBED)

Method: the real `groupSubmissionsByStudent` (`utils.ts:452`), fed a lookup built exactly as
`rubric.ts:131-197` builds it, once with the `byBase` map populated (HEAD behaviour, ON) and
once with it empty (the fixed behaviour, OFF; deleting step 4 is observationally the same as an
empty `byBase`). Command in section 12.

| Fixture (oracle id) | HEAD (ON) | Fixed (OFF) | Same? |
|---|---|---|---|
| F2 name-vs-username | Ada Lovelace [code1,essay1], Grace Hopper [code2,essay2] | identical | YES |
| F3 blank/absent name | Ada Lovelace [essay1], code1, essay2 | identical | YES |
| F10 duplicate model name | Ada Lovelace [code1,essay1] | identical | YES (not fixable, section 6) |
| F12 byRaw outranks convention | Someone Else [e.txt] | identical | YES (intended) |
| F13 case-fold inferred names | one row `Ada Lovelace` [c,e] | identical | YES |
| F15 byBase inheritance | `Maria Alvarez` [essay.txt, essay.txt] | `BrownTom/essay` [essay.txt] and `Maria Alvarez` [essay.txt] | NO: the one intended flip |
| F1, F4-F9, F11, F14 | no inference reply (`reply: null` or lookup unused) | not run: the lookup is empty so step 4 cannot fire | by construction |
| extra: nested-zip variant of F15 (`bulk.zip/main.py` named "Ada Lovelace", `bulk2.zip/main.py` not named) | `Ada Lovelace` [main.py, main.py] | `Ada Lovelace` [main.py] and `bulk2` [main.py] | NO: a second instance of the same class, not in the oracle; closed by the same fix |
| extra: F15 shape with BOTH files named the same ("Maria Alvarez") | one row, two files | identical | YES (model-trust boundary, section 6) |

The F15 fixed output is PROBED at the grouping function. The end-to-end rows (P1
`gradeSubmissions`, P3 `extractStudentEntries`) are PREDICTED from it plus the
`localeCompare` sort at `utils.ts:520` and the probe's output order; the
implementer's first in-repo run is the confirmation, and a disagreement means STOP and
report, never edit the literal to fit (the oracle's own header rule, `oracle:11-13`).

---

## 5. The oracle edit: exactly which literals change, exactly which stay frozen

File: `src/lib/grade/ingestion-attribution.oracle.test.ts` (584 lines, `wc -l`). This
inverts guard-before-migration: the oracle froze the before-state and F15 is the
sanctioned deliberate change.

### 5.1 F15 (block at `oracle:446-461`): edited

| Field | Frozen at HEAD | New literal |
|---|---|---|
| `L` | `[{ student: "Maria Alvarez", files: ["essay.txt", "essay.txt"] }]` (`:458`) | `[{ student: "BrownTom/essay", files: ["essay.txt"] }, { student: "Maria Alvarez", files: ["essay.txt"] }]` |
| `sentinels` | `{ "Maria Alvarez": ["S_ALV", "S_BRO"] }` (`:459`) | `{ "BrownTom/essay": ["S_BRO"], "Maria Alvarez": ["S_ALV"] }` |
| `N` | `["AlvarezMaria/essay", "BrownTom/essay"]` (`:460`) | UNCHANGED (the no-option path never infers; P4 stays green both sides) |
| `files`, `reply` | `:454-457` | UNCHANGED (the fixture is the same; only the expected output changes) |
| `label` | `"KNOWN-DEFECT (R-4) byBase inheritance merges two submitters"` (`:452`) | a non-defect label, for example `"folder-distinct submitter the model did not name stays its own row (R-4 closed)"` |
| comment `:446-450` | "KNOWN-DEFECT ... only the owner-ruled R-4 fix may flip it" | rewrite to say it is flipped by GRADE-INFER-MERGE and name the rung removed |

### 5.2 F10 (block at `oracle:363-382`): LABEL AND COMMENT ONLY, literals frozen

`L` (`:379`), `sentinels` (`:380`), `N` (`:381`), `files` (`:371-374`) and `reply` (`:375-378`)
stay byte-identical. Only the `label` string (`:370`) and the comment (`:364-368`) change,
from "KNOWN-DEFECT (R-4)" to a statement that this is the accepted model-trust boundary
(section 6), cross-referenced to residual R-1. Leaving the old label would assert a
defect this fix does not and cannot close. If the owner instead wants F10 flipped, section
6.3 says what that costs.

### 5.3 Everything else stays frozen

F1-F9, F11-F14 and Z1-Z3 stay byte-identical. F12 (`:404-415`, tagged intended) must not
move. Pass condition: `git diff -U0 src/lib/grade/ingestion-attribution.oracle.test.ts`
shows hunks ONLY inside lines `363-368`, `370`, and `446-461` (line numbers at HEAD; use
the block ids F10 and F15 if earlier lines shift). A hunk anywhere else, or any change to
an `L`/`sentinels`/`N` of F10, is a defect. The same-commit requirement from the brief
holds: the F15 edit lands in the SAME commit as the production fix, otherwise the oracle
is red between commits.

---

## 6. F10: why it is a boundary, not a bug code can close

### 6.1 The evidence

The two fixtures, side by side (opened at the cited lines):

| | files | model reply (name, citation) |
|---|---|---|
| F2 (`oracle:213-231`), legitimate multi-file student | `essay1-AdaL.txt`, `code1-AdaL.txt` | Ada Lovelace/essay1.txt, Ada Lovelace/code1.txt |
| F10 (`oracle:363-382`), "two distinct submitters" | `essay1-AdaL.txt`, `code1-AdaM.txt` | Ada Lovelace/essay1.txt, Ada Lovelace/code1.txt |

The inputs the code has are identical in shape: root-level files, no folder, no
convention match (fewer than four underscore parts), no zip crossing, the same model
verdict. The only difference is one suffix character, which the model saw and judged
irrelevant. A rule that splits F10 must either read that suffix or refuse a merged group.

Candidate rules considered and rejected, each with the reason:

- **Refuse any group formed from two or more byRaw files.** Kills F2, F13 and the entire
  purpose of inference. Rejected.
- **Compare the filename residue after removing the model's assignment name** (`AdaL` vs
  `AdaM`). F13 gives citation `e.txt` for raw `essay1-AdaL.txt`, so the residue is
  undefined there; and for convention names the residue contains timestamps that differ
  within one student's own files (`F1`, `oracle:176-177`: `_120000_` vs `_120500_`). It would
  falsely split a real student. Rejected.
- **Veto a byRaw merge of files with different convention identities** (step 2/3 names
  differ). It would undo the legitimate normalisation of one student spelled two ways
  (`ada_...` and `adalovelace_...`). Rejected.
- **Veto a byRaw merge across different folders.** Cannot tell a per-student folder
  (`AlvarezMaria/essay.txt`) from a per-assignment folder (`week1/AdaL.txt`); the A44 run
  gate (`collisionRefusal.ts:77-80`) is a heuristic for the former and a veto would
  undo inference's value on the latter. The model is the only arbiter of which it is.
  PROBED: the foldered both-named case merges at HEAD and after the fix (section 4, last
  row). Left as the model-trust boundary.

### 6.2 What would actually close F10 (out of scope here)

Provenance, not prevention: mark a row whose multi-file grouping rests ONLY on the model's
say-so (no ground-truth corroboration) so the instructor reviews it before posting. That
is a result-type field plus a rendered marker. It cannot be verified under vitest (no
component renders) and sits in consumers outside `src/lib/grade/`. Residual R-2.
A prompt change asking the model for evidence per item is also possible, but the inference
call is mocked everywhere in this environment and no API key exists, so its effect is
unmeasurable here (R-3). Neither is a reason to leave the F15 fix waiting.

### 6.3 The terminating owner question (every answer ends this activity)

"This item fixes F15 fully and cannot fix F10 deterministically. Which do you want for
F10: (1) KEEP the F10 literals frozen and relabel the row as the accepted model-trust
boundary [recommended, acted on in this scope]; or (2) ALSO commission a provenance marker
for model-only groupings as a separate backlog row?" Answer (1): the scope ships as
written. Answer (2): ship as written and file the row (R-2). Neither reopens this scope.
What answering the other way would cost in rework: zero for (2), since R-2 is already a
residual; flipping F10 itself is not offered because no deterministic rule exists
(section 6.1).

---

## 7. Data/security seat view (grade integrity)

Claims here are traced to code unless marked.

- **The integrity breach is real and silent.** A merged row shows one student's name over
  two submitters' text. `gradeSubmissions` composes `Student: <name>` itself from the entry
  (`engine.ts:82` per the RES-FILL-3 trace, `docs/res-fill-3-scope.md:99-103`), so the model
  grades the pooled text under one name. The backlog row says this flows on to CSV
  and Canvas comment posting; I did NOT trace the posting path in this scope, so that
  downstream reach is the row's claim, not mine.
- **There is an adversarial reading, not just a model-error one.** `byBase` is keyed on
  the LEAF NAME only (`rubric.ts:182`). A submitter who puts a file in their own folder
  with the same leaf name as another submitter's file (`essay.txt` is the commonest name)
  and whose file the model omits has their content graded under the other student's name.
  Plausible whenever the reply is partial. Trigger frequency is unmeasured: the inference
  call caps output at 1200 tokens (`rubric.ts:228`), and a truncated JSON reply parses to
  empty (`rubric.ts:141-143, 198-200`) rather than partial, so partial replies mainly come
  from model omission. I did not measure how many filenames fit in 1200 tokens.
- **The fix is fail-safe by direction.** A split row is visibly mis-named; a merged row is
  invisibly wrong. After the fix an un-named file is attributed by its own ground truth.
- **No new egress, no new persisted key, no new prompt text.** The change removes a
  branch and a map; nothing is added to a prompt, storage key or network call. The
  persisted-edits key is the display string (`docs/res-fill-3-scope.md` 1.3): F15's second
  submitter moves from the merged display "Maria Alvarez" to "BrownTom/essay". That only
  matters for an instructor who edited a merged row in a run whose inference replies
  differ across reruns; any stored edit for the merged display stays keyed to Maria, which
  is correct, and the new row starts with no edit. No migration needed. (Reading claim;
  no component renders here.)
- **Prompt injection:** not engaged, no prompt builder is changed or reached by new text.
  `buildFileNameConventionPrompt` (`prompts.ts:286`) was read; it is unchanged.

---

## 8. Wave plan (one wave) and write set

Single wave: the fix, the F15 oracle edit and the new test are one atomic unit (the oracle
is red if the fix lands without its literal edit). Triage record, with the trigger that
fired: Acceptance criteria runs (this is a bug fix with no leverage claim: fired trigger
"bug fix, no capability a user reaches"; recorded per `seats.md:70-75`); Test seat runs
after build; UX/visual/a11y triaged OUT (no markup, no copy, no focus change; the split
row's label is an existing display shape); Security and Data seats ran in this document.

Write set (exact paths, none an announcement, walkthrough, repo-grades or `src/tools` file):

| File | Change | Lines now (`wc -l`) |
|---|---|---|
| `src/lib/grade/utils.ts` | delete step 4 block; header list `:279-280`; `(1, 4)` at `:301`; leave a removal comment | 594 |
| `src/lib/grade/rubric.ts` | drop `byBaseCandidates`/`byBase`, the empty-fallback `byBase` fields, and the now-unused `getBaseFileName` | 443 |
| `src/lib/grade/types.ts` | `InferredFileNameLookup` becomes `{ byRaw }` | 463 |
| `src/lib/grade/utils.test.ts` | retarget `:142-161` (the M2 precedence test) to the new invariant; drop the `byBase` literal | 393 |
| `src/lib/grade/ingestion-attribution.oracle.test.ts` | F15 literals, F15/F10 labels and comments only (section 5) | 584 |
| `src/lib/grade/inference-no-extrapolation.test.ts` | NEW: the invariant test (section 9, AC-3). Name is mine, free (`ls src/lib/grade/*.test.ts` lists 32 files, `ls src/lib/grade | grep -c inference-no-extrapolation` returns 0) | 0 |

All far under the 1000-line ceiling. The new test is a leaf: it adds no export, a legal
"no caller" exception stated so the wave gate does not read it as an escape. The fix
removes an export-level field; its only readers are `utils.ts` and `rubric.ts` (grep
`byBase` over `src` finds exactly: `types.ts`, `rubric.ts`, `utils.ts`, `utils.test.ts`, the
oracle, and a comment in `src/tools/backlog/backlog-file.structure.test.ts:87` which needs no
change).

---

## 9. Acceptance criteria (each names object, instrument, direction of failure)

- **AC-1 (F15 flips).** Object: the oracle's F15 outputs P1, P2, P3. Instrument: the real
  `gradeSubmissions` and `extractStudentEntries` driven by the oracle harness, compared
  to the new literals of section 5.1. Red if any run puts `S_ALV` and `S_BRO` under one
  student, or if row count, order or file sets differ from the literal. P4 for F15 stays
  green on the UNCHANGED `N`.
- **AC-2 (only the sanctioned literals moved).** Object: the diff of the oracle file.
  Instrument: `git diff -U0 src/lib/grade/ingestion-attribution.oracle.test.ts`. Red if any
  hunk falls outside the F10 label/comment lines and the F15 block, or if any F10
  `L`/`sentinels`/`N` changed, or any F12 line changed.
- **AC-3 (the invariant, new test).** Object: attribution of any file the model did not name.
  Instrument: two assertions, both over a corpus of shapes that includes `F15`
  (two folders, same leaf), the nested-zip variant of section 4, `F6` (three folders, same
  leaf), flat convention names and flat stems, with byRaw subsets drawn from the
  powerset of the corpus (so every "named some, omitted others" case is a construction,
  not a hand-picked list):
  (a) at `parseSubmissionFileName` level: for every file f with no byRaw hit,
  `parseSubmissionFileName(f, lookup, chain)` deep-equals `parseSubmissionFileName(f, undefined, chain)`;
  (b) at `groupSubmissionsByStudent` level: for every returned row whose files span two or
  more distinct container-relative directories (`a44ContainerRelativeDir`, exported at
  `utils.ts:202`), EVERY file in that row has a byRaw hit. Red if (a) any un-named file's
  identity changes with the lookup, or (b) a row spans folders by anything other than the
  model naming each of its files. Both are red on HEAD code (the F15 and nested-zip shapes
  exercise step 4); the implementer must show that red-before on HEAD, not assert it.
- **AC-4 (intended behaviours untouched).** Object: oracle F2, F3, F12, F13, F10 literal.
  Instrument: oracle P1-P4 unmodified. Red on any change. Direction: any difference.
- **AC-5 (the removed rung has no remaining reader).** Instrument: `grep -rn "byBase" src
  --include=*.ts --include=*.tsx` returns only the backlog-test comment and any removal
  comments; `npx tsc --noEmit` empty (one caller); `npm run lint` exit 0 with no new
  warning against the same command before the change. Red if a reader remains (tsc
  excess-property or lint unused-variable is the mechanical signal).
- **AC-6 (the retired M2 test is handed over, not deleted).** Object:
  `utils.test.ts:142-161`. Its claim "ground truth outranks a base-name guess" no longer
  has a guess to outrank; it is retargeted to "a file with a crossing-chain identity keeps it
  even when the lookup holds a different path with the same leaf name". Red if the retargeted
  test passes on HEAD code (it must be red or vacuous-checked there; if it is green on
  HEAD, say so and rely on AC-3 for the kill).

Sabotage design for the test seat (proposed, to be measured, not claimed): MA reintroduce a
base-name scan over `byRaw` keys inside `parseSubmissionFileName` step 4; MB restore the
original `byBase` map in `rubric.ts` plus step 4 (the HEAD behaviour); MC apply the lookup to a
file only when it has a ZERO-length chain (a partial reintroduction). AC-3 must go red on MA and
MB. If MC survives, report whether it is a bad mutant (the corpus lacks a chained shape) before
adding assertions.

No leverage claim: this is a bug fix, no capability a user reaches changes.

---

## 10. Gate (one path per argument; every argument must print COVERED)

Baseline measured at HEAD `f9bb2271` before any change, via the wrapper:
`Test Files  18 passed (18)`, `Tests  522 passed (522)`:

```
COVERED src/lib/grade/ingestion-attribution.oracle.test.ts files=1 passed=53
COVERED src/lib/grade/utils.test.ts files=1 passed=28
COVERED src/lib/grade/identityInvariants.test.ts files=1 passed=107
COVERED src/lib/grade/collisionRefusal.test.ts files=1 passed=37
COVERED src/lib/grade/collisionRefusal.wiring.test.ts files=1 passed=6
COVERED src/lib/grade/extraction.inference.test.ts files=1 passed=3
COVERED src/lib/grade/extraction.test.ts files=1 passed=21
COVERED src/lib/grade/single-file-entry.test.ts files=1 passed=15
COVERED src/lib/grade/grouping-zip-parents.wiring.test.ts files=1 passed=7
COVERED src/lib/grade/rubric-stamp.wiring.test.ts files=1 passed=10
COVERED src/lib/grade/engine.test.ts files=1 passed=15
COVERED src/lib/grade/rubric-provenance-producers.structure.test.ts files=1 passed=2
COVERED src/lib/module-graph/runtime-import-graph.test.ts files=1 passed=177
COVERED src/app/actions/grading-incremental.test.ts files=1 passed=13
COVERED src/app/actions/grading.collisionRefusal.test.ts files=1 passed=4
COVERED src/file-size-ceiling.structure.test.ts files=1 passed=3
COVERED src/source-bytes.structure.test.ts files=1 passed=3
COVERED src/lib/no-emojis.test.ts files=1 passed=18
```

The post-change gate is that list plus `src/lib/grade/inference-no-extrapolation.test.ts`
and `src/lib/grade/rubric.test.ts` (rubric.ts is edited; I did not baseline
`rubric.test.ts`), run as
`npm run test:paths src/lib/grade/ingestion-attribution.oracle.test.ts src/lib/grade/inference-no-extrapolation.test.ts src/lib/grade/utils.test.ts ...`
with every path as its own argument. Expected movement from baseline: oracle stays 53
(F15 still has P1-P4; same count), `utils.test.ts` stays 28 only if the retarget keeps one
`it` (otherwise state the new count), every other file unchanged, the new file adds its
own count. No raw multi-path `vitest` or `npm test` command is used anywhere in this
change. Plus `npx tsc --noEmit` (one caller, no concurrent run) and `npm run lint`.

---

## 11. Canaries the fix could trip (checked by reading, with the result)

| Canary | Reading | Verdict |
|---|---|---|
| `collisionRefusal.test.ts` / `.wiring.test.ts` | refusal code is untouched; `grep -n "byRaw\|byBase\|inferFileNameConvention"` over `collisionRefusal.test.ts`, `rubric.test.ts` and `extraction.inference.test.ts` shows none constructs a lookup | green expected |
| `identityInvariants.test.ts` | `grep -n "byRaw\|inferredLookup\|Lookup"` finds no lookup use; its header mentions "steps 1-4 raw" only as history (`:12`) | green expected |
| `runtime-import-graph.test.ts` (177) | the change adds no import to any file; it deletes a function from `rubric.ts` | green expected; MEASURE at the gate |
| `rubric-provenance-producers.structure.test.ts` | matches `): Promise<GradingRun> {`; nothing here returns `GradingRun` | green expected |
| `src/tools/backlog/backlog-file.structure.test.ts` | row-count canary only; this change adds no row (the orchestrator's later backlog edit is its own concern) | untouched |
| `src/lib/no-emojis.test.ts`, `source-bytes.structure.test.ts`, `gate-commands.structure.test.ts` | scan `docs/` | this doc is checked in section 12 |
| the `grouping-zip-parents.wiring.test.ts` engine pin (`ingestZipEntries`, no `groupSubmissionsByStudent(`) | engine untouched | green expected |
| frozen basename canary for `src/lib/grade/` | adding a NEW non-test root file in a directory trips its frozen-roots canary (memory: gate-must-include-directory-canary); the new file is a `.test.ts`, which that rule exempts, but the implementer must run `grep -rn "frozen" src/*.structure.test.ts` style discovery and name any canary covering `src/lib/grade/` | UNVERIFIED by me, implementer to measure |

---

## 12. Commands that produced the quantities, and what was not determined

- Reads: `docs/DEV_LOOP.md`, `docs/loop/seats.md`, `docs/loop/traps-spec.md`,
  `src/lib/grade/{utils,collisionRefusal,rubric,extraction,types}.ts`,
  `src/lib/grade/ingestion-attribution.oracle.test.ts`, `docs/res-fill-3-scope.md`,
  `docs/res-fill-3-w1-test-notes.md` (grep only, the F10/F15 sections), `docs/backlog.yml`
  (the GRADE-INFER-MERGE row).
- HEAD: `git rev-parse --short HEAD` -> `f9bb2271`.
- Line counts: `wc -l` on the five files in section 8.
- Callers: `grep -rn "groupSubmissionsByStudent(\|inferFileNameConvention(\|inferStudentPrefix(\|parseSubmissionFileName(" src --include=*.ts --include=*.tsx`
  (non-test) found `collisionRefusal.ts:47`, `extraction.ts:193,195`, and the `utils.ts` internals.
- byBase readers: `grep -rn "byBase" src --include=*.ts --include=*.tsx -l`.
- Probes (scratchpad, not committed): `node --experimental-strip-types --experimental-default-type=module --experimental-loader ./src/tools/backlog/resolve-ts-hook.ts <scratchpad>/probe.ts`
  and `probe2.ts`, importing `src/lib/grade/utils.ts` by file URL. `git status --short src` empty afterwards.
- Baseline gate: the `npm run test:paths` line of section 10, run 2026-10-04 at `f9bb2271`.
- Docs gate for this file: `npm run docs:gate` (result recorded in the report that
  delivered this file).

Not determined here, stated rather than filled in:

- The end-to-end F15 rows through `gradeSubmissions` and `extractStudentEntries` after the
  fix: predicted from the grouping probe, not run (running them needs the fix applied in
  the tree, and siblings run concurrently, so in-place mutation was not done).
- How often the model omits files in real runs, and how many filenames fit under
  `maxOutputTokens: 1200` (`rubric.ts:228`). No API key exists in this environment.
- The Canvas-post and CSV reach of a mis-attributed row (taken from the backlog row, not traced).
- Whether any UI renders a split label differently from a merged one: no component renders
  under vitest.
- Whether a frozen-roots or directory canary covers `src/lib/grade/` for a new test file.

---

## 13. Disposition (what the removal drops)

| Prior requirement or behaviour | Disposition |
|---|---|
| `utils.ts` step 4: byBase guess, consulted after crossing-chain ground truth (A14 ruling M2, `utils.ts:354-366`, `utils.test.ts:142-161`) | WITHDRAWN. Reason: the rung is reachable only as cross-path extrapolation (section 3.1). The invariant M2 protected, "ground truth outranks a model guess", is HANDED to AC-3(a) and AC-6 (receiver: the test seat and implementer; obligation: the retargeted `utils.test.ts` test plus the new invariant test). Enforcer it protected: `utils.test.ts:142` only. |
| `rubric.ts:188-195` "keep a base name only when exactly one inferred item has it" | WITHDRAWN with the map it served. No executing test pinned it (`grep` shows `byBase` only in the five files of section 8). |
| Oracle F15 `KNOWN-DEFECT (R-4)` frozen merge (`oracle:446-461`) | KEPT as an oracle row, literal FLIPPED (section 5.1). |
| Oracle F10 `KNOWN-DEFECT (R-4)` frozen merge (`oracle:363-382`) | KEPT, literals byte-identical, label and comment changed to the accepted boundary (section 5.2). The brief asked to flip it; withdrawn as unachievable with the reason in section 6. |
| Oracle F12 intended-behaviour row | KEPT byte-identical. |
| `docs/res-fill-3-scope.md` R-4 ("owner decision: refuse, warn, or require full inference coverage") | KEPT as the parent residual; this scope settles the F15 half (separate) and relocates the F10 half to R-1/R-2 below. |
| Stale prose after the fix (`docs/a39-inference-instrument-notes.md` mentions of `byBase`, lines 178-238 and 330) | Left stale; historical design notes, no gate reads them. Owner: the next chunk touching A39 notes. |

---

## 14. Residual register (each: owner, instrument, step)

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | F10-class: the model names two folder- or token-distinct submitters the same name; no ground-truth signal separates them (section 6.1). F10 frozen as the accepted model-trust boundary | Repo owner (product): accept, or fund R-2 | oracle F10 rows P1-P4 stay green with the relabelled row; a future provenance marker would flip it deliberately | owner answer to section 6.3 |
| R-2 | No visible marker that a row's multi-file grouping rests only on the model's say-so | Repo owner to commission; UX seat to design | a result-type field plus a rendered marker; verifiable only by reading (no component renders) | a new backlog row after the owner answers 6.3(2) |
| R-3 | Inference prompt gives the model no way to flag uncertainty; effect of any prompt change unmeasurable here (no key, mocked everywhere) | Repo owner (live-key work) | a real run against a seeded zip of near-name submitters | owner-run, when a key is available |
| R-4 | Class (iii) of section 3.3: a model-chosen name colliding with an un-named file's fallback stem | the chunk next owning `utils.ts` | an AC-3(b)-style generated corpus with a model name equal to another file's stem | next change to `groupSubmissionsByStudent` |
| R-5 | `grading.ts:932` runs a second, pre-spend refusal; any future change to refusal semantics must edit both call sites | the chunk next owning `src/app/actions/grading.ts` | `grading.collisionRefusal.test.ts` (4 passed in section 10) | next edit to `grading.ts` |
| R-6 | The directory-canary question for a new file in `src/lib/grade/` (section 11) | the implementer of this wave | run the structure tests in section 10 and name any canary that counts files in `src/lib/grade/` | this wave's gate |
