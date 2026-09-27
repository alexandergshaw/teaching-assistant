# A43 scope check, round 1 of at most two

Adversarial check of `docs/a43-scope.md` at commit `de4b7a2`. I did not author it.
Every quantity below names the command that produced it, run from the repo root
in the Bash tool on 2026-09-27. Every absence claim names its canary. Nothing
under `src/` was written by this pass; the write set was `docs/a43-check.md`
only.

Mid-check the coordinator delivered OWNER DECISION 15
(`docs/owner-decisions-2026-09-27.md`): the conversational ask STAYS IN A43 and
the scope's recommendation to route A43-C out is overridden. That is applied
below. It does not retract the scope's measurement, which I re-verified
independently and which is correct.

**No disposition table is owed.** `git log --oneline -- docs/a43-scope.md`
returns one commit; `git ls-files | grep -i a43` returns one path. There is no
prior version to map requirements from.

---

## Verdict

**NOT BUILDABLE AS WRITTEN.**

| Severity | Count |
|---|---|
| BLOCKER | 4 |
| MAJOR | 6 |
| MINOR | 8 |
| Orchestration findings | 2 |
| Residual entries stale or defective | 4 of 10 |

The scope is a genuinely strong document in the places most scopes are weak: its
reachability tracing is correct end to end, its `wc -l` table is exact on every
one of the eight files I spot-checked, its three truncation findings are real,
its `pptxgenjs`-cannot-read finding is right, and its self-recorded instrument
defect (the pipe through `cat`) is the behaviour this loop exists to produce. It
fails on four things, and each of the four is load-bearing for the build that is
about to happen.

---

## BLOCKER 1 - The mechanism the scope calls new is already shipped, reached and tested, for `.docx`

Scope section 8.1, the whole justification of the headline leverage claim:

> Today `applyOfficeSections` is called for a user-supplied file from exactly
> TWO places (`src/lib/canvas-modules/office.ts:143,192` and
> `src/lib/canvas-modules/office-accessibility.ts:235`), and in both the source
> is a Canvas-hosted document being edited in place - never a template a
> generator fills.

Re-run the census.

```
grep -rn "applyOfficeSections" --include=*.ts --include=*.tsx src/
```

Production (non-test) call sites, five in four files:

| Site | What the file is |
|---|---|
| `src/lib/canvas-modules/office.ts:143` | Canvas file edited in place |
| `src/lib/canvas-modules/office.ts:192` | Canvas file, docx only |
| `src/lib/canvas-modules/office-accessibility.ts:235` | Canvas file, a11y fixes |
| `src/app/actions/syllabus-adapt.ts:480` | **an owner-uploaded `.docx`** |
| `src/app/actions/syllabus-templates.ts:267` | **an owner-uploaded template a generator fills** |

Canary that the command form fires and the needle is valid: the same command
over `parseOfficeParagraphs` returns 36 lines.

So the sentence is wrong twice: the count is five, not two, and the claim
"never a template a generator fills" is false. It is also internally
inconsistent on its own terms - it says "exactly TWO places" and then prints
three line cites.

**What the missed site actually is.** `src/app/actions/syllabus-templates.ts` is
shape (a), end to end, on an owner-uploaded Office file, shipped and reached:

1. The owner uploads their own `.docx` through a real file input. Two surfaces
   reach it: `src/app/components/courses/SyllabusTemplateCell.tsx:110` and
   `src/app/components/SyllabusTemplateLibrary.tsx:86`, both calling
   `createSyllabusTemplateAction`.
2. It is stored base64 in a `text` column, owner-scoped -
   `supabase/migrations/20260709000000_create_syllabus_templates.sql`, whose
   header the scope already quotes in its own section 3.4 as a STORAGE
   precedent.
3. `generateCourseSyllabusAction` (`syllabus-templates.ts:119`) calls
   `parseOfficeParagraphs`, then asks the model for **content only** as JSON
   `[{id, text}]` keyed to the file's own paragraph ids, then maps it to
   sections and calls `applyOfficeSections("docx", buffer, sections)` at `:267`.
4. Its own comment at `:245-247` states the guarantee: "Every paragraph gets a
   section (applyOfficeSections deletes known paragraphs with no section);
   unchanged paragraphs pass their original runs so they stay byte-for-byte."
5. Reached from the UI at `src/app/components/courses/SyllabusCell.tsx:116`,
   plus three workflow steps (`steps.syllabus.ts:283`,
   `steps.course-setup.materials.ts:241`, and via
   `lms-syllabus-buttons.ts:593`).

**Why this is a blocker and not a citation nit.** Three separate parts of the
scope rest on the false version:

- **The leverage claim.** Per `docs/loop/leverage.md`, a class is EARNED only if
  the feature had to build something to get it, and the test is failure mode B -
  count how many comparable modules already carry the mechanism. The scope
  counted two and concluded "the class is not free here". The honest count is
  five, and one of the five is the exact mechanism. GUARANTEED is still earnable,
  but only in the narrower form **"zero of the four deck paths do this"** - which
  I verified and which is true - not in the form the scope wrote. That is a much
  thinner claim and it changes the design's self-description from invention to
  port.
- **Q1.** Section 3.1 says the template-format question is "genuinely open" and
  3.4 recommends `.pptx` read with jszip plus the `office-edit.ts` idiom. That
  recommendation is correct, but it is not a recommendation - it is a
  description of a shipped pipeline, including the model's content contract
  (paragraph-id-keyed replacements), the section-building idiom, the
  bold-prefix-preservation detail, and the wire-budget check. The scope opened
  the migration and did not trace the action that consumes it, which is this
  repo's own recorded "brief from the tree, not the doc" failure.
- **The wave plan.** Wave 2 invents `src/lib/decks/pptx-template.ts` from
  scratch. The reuse survey owed here is an extraction of what
  `syllabus-templates.ts:245-267` already does, generalised over
  `OfficeKind`, not a new module beside it. Section 10's "Structural notes"
  say no wave should touch `office-edit.ts`; nothing says anything about the
  two callers that already do this job.

---

## BLOCKER 2 - The scope's headline removal test cannot fail on the most likely wave-2 bug, and I measured that

`applyOfficeSections`'s own contract (`src/lib/office-edit.ts:383-392`, which
the scope quotes) includes: **"A known paragraph with no section is deleted."**

The scope never mentions this. Not in 3.3, not in the hard constraint at 3.5,
not in 4.1's structural-guarantee argument, not in wave 2's file table, not in
any of the ten residuals. The shipped precedent found in BLOCKER 1 knows about
it and comments it explicitly, because it is the trap.

So the most likely wave-2 implementation is "emit a section for each paragraph I
filled with generated content". That silently DELETES every other paragraph of
the owner's template - headers, footers, standing notes, everything the owner
put there and did not want rewritten. It is the exact opposite of the feature.

Now the instrument. Scope section 8.1, called "the single most important thing
this design has going for it":

> a test that loads the uploaded template with `jszip`, loads the produced file
> with `jszip`, and asserts every zip entry whose name is NOT
> `ppt/slides/slideN.xml` is byte-identical between the two.

Slides are excluded, so an in-slide deletion is invisible to it.

**Measured**, with this checkout's own jszip, via a scratchpad script run under
`node` (exit 0). Build a four-entry pptx-shaped zip (`[Content_Types].xml`,
`ppt/presentation.xml`, `ppt/slides/slide1.xml`, `ppt/media/image1.png`),
reload it, replace `ppt/slides/slide1.xml` with an empty `p:sld` (every
paragraph gone), regenerate, then apply the 8.1 assertion:

```
section-8.1-style test (non-slide entries byte-identical) PASSES
  on a slide whose content was wiped: true
```

To the scope's credit, the same run establishes the half it claimed and I
doubted: JSZip really does carry untouched entries through byte-for-byte, both
decompressed and as the stored compressed payload:

```
DECOMPRESSED identical: true  | [Content_Types].xml
DECOMPRESSED identical: true  | ppt/presentation.xml
DECOMPRESSED identical: false | ppt/slides/slide1.xml
DECOMPRESSED identical: true  | ppt/media/image1.png
STORED payload: identical  | [Content_Types].xml
STORED payload: identical  | ppt/presentation.xml
STORED payload: DIFFERENT  | ppt/slides/slide1.xml
STORED payload: identical  | ppt/media/image1.png
```

So the test is buildable exactly as specified. It is buildable AND blind to the
defect it is named after, which is worse than unbuildable, because it ships a
green signal.

**The instrument that does work already exists in this tree**, and the test that
landed after the scope used it rather than the scope's:
`src/lib/office-edit.test.ts:93-106` rebuilds the original slide XML by
substituting only the edited paragraph's substring and asserts the result equals
the produced XML byte for byte. That catches an omitted-section deletion. A
revision must specify that form, per-slide, and must sabotage it by omitting one
section and watching it go red.

---

## BLOCKER 3 - Wave 1 wires `materials` into a slot that cannot affect the deck's structure, so "a deck from an uploaded source" does not ship and every gate is green

This is the silent-green failure the brief asks for, and it is specific.

Traced in `src/lib/decks/generate.ts`:

| Line | What happens |
|---|---|
| `:359-383` | loop items are resolved from `ctx.loopItems` (breadth expansion, then a sequencing LLM call) |
| `:385` | `expandTemplate(template, loopItemsResolved)` - the slide list is now FIXED |
| `:392` | `buildDeckPrompt(template, resolved, promptCtx)` |
| `:114` | `materials` is interpolated into the prompt, inside `buildDeckPrompt` |

`materials` enters AFTER slide expansion. It can change the WORDS on slides
whose count, order and per-concept topics the user typed by hand. There is no
path by which an uploaded source determines the concept list:
`enumerateBreadthFull` is gated on `items.length > 0` (`generate.ts:365`), and
both loop presets are `breadth: "standard"`
(`src/lib/decks/presets.ts:21-37`), so no enumeration runs at all on path P.

Now the scope's own numbers. Section 5.2 charges today's cold count 1 for "loop
items". Section 5.4's target table drops that row entirely and names nothing
that fills it - it names a derivation for `subject` ("derived from the source's
own filename/first heading") and nothing for concepts.

Measured preset shapes, by static parse of `src/lib/decks/presets.ts`
(`presetSlide(...)` calls, grouped by the template id at four-space indent;
`preset-sdlc-lecture` uses a different constructor and was counted by
`grep -c "role:"` at 18):

| Preset | Fixed slides | Loop-block slides |
|---|---|---|
| `preset-classic-lecture` | 4 | 3 |
| `preset-coding-lecture` | 5 | 5 |
| `preset-lecture-quiz` | 8 | 0 |
| `preset-review-session` | 3 | 3 |
| `preset-sdlc-lecture` | 18 | 0 |

With no loop items, `expandTemplate` emits each block ONCE -
`src/lib/decks/types.ts:472`, `const itemsToUse = items.length > 0 ? items : [undefined]`.
So the two flagship lecture shapes become a 7-slide and a 10-slide deck about
one unnamed concept.

And **C3 as written forbids re-adding the field**: "The source control must be
one interaction, not a kind selector plus an input. FAILS if the new panel
renders more than one input whose value the user must set before Generate."
An implementer obeying C3 literally ships the degenerate deck.

**The silent-green path, named explicitly.** tsc clean, lint at its four-warning
baseline, `npm run build` printing its Compiled-successfully line, and a
source-text wiring test asserting `materials` appears in the `ctx` at
`index.tsx` - plus C1, C2 and C3 all satisfied - while the owner's sentence
("make a slide deck GIVEN an uploaded content source") is not implemented.
Nothing renders under vitest, so no test can observe that the concepts field is
still there or still required.

This is the finding that most needs an answer before code, and code is already
in flight. See O1.

---

## BLOCKER 4 - Shape (a) does not survive contact with conversational editing as the scope classifies it

Created by DECISION 15. The scope could not have known; a revision must.

DECISION 15 holds the guarantee structural: a conversational request may change
CONTENT and "may NOT be allowed to reach the writer, the template, or the
layout", and "the operation set is the enforcement point".

Scope section 4.2 classifies the answerable conversational requests as
"conversational requests that change CONTENT ('more detail on recursion',
**'drop the case study'**, 'aim this at first-years')".

**"Drop the case study" is not a content change under this mechanism.** For a
file-backed template, dropping an item is expressed to `applyOfficeSections` as
an OMITTED section, and an omitted section deletes the paragraph
(`office-edit.ts:383-392`). Deleting a paragraph of the owner's file changes the
template, which is exactly what DECISION 15 forbids. So the scope's own worked
example of a safe conversational request mutates the thing the guarantee
protects, and the enforcement point DECISION 15 names does not yet exist.

The missing rule, which the revision owes verbatim: **a dropped item is emitted
as an EMPTY section, never as an omitted one, and no operation in the set may
remove a `sourceId` from the section list.** With that rule the guarantee is
structural again. Without it, it is checked.

**Second half - "add a slide about X" must refuse, and today it would silently
do nothing.** Measured by the test that landed after the scope:
`src/lib/office-edit.test.ts:126-154` hands `applyOfficeSections` an
append-shaped section (`sourceId: "s99_p99"`, a paragraph id that exists
nowhere) and asserts it is INERT - no throw, output slide count unchanged at 1,
reparsed text unchanged. So the machinery's established response to "add a
slide" is silence, which is the failure mode the scope's own section 7 calls
"the worst outcome and the most likely one".

The scope has a refusal line for a generate-time slide-count mismatch (7.3,
"Your template has 12 slides and this deck needs 40. Pick a shorter shape or a
longer template."). It has nothing for a conversational add, because A43-C was
routed out. Under DECISION 15 that refusal is in scope and unwritten.

---

## MAJOR 1 - Five wrong `file:line` citations, in a document whose preamble says every one was opened

| Cited as | Actually |
|---|---|
| `office-edit.ts:454` - cited THREE times (3.3, 4.1, 8.1) as the line that writes only touched slides | **`:452`**. `grep -n "if (touched) zip.file" src/lib/office-edit.ts` returns `452` and `654`. `sed -n '454p' src/lib/office-edit.ts \| cat -A` returns `  }$` - a closing brace. Canary that the file was read: `grep -c "zip.file"` -> 23 |
| `docs/backlog.yml:644` - the owner's verbatim request | **`:646`** (`from:`). At the scope's own commit, `git show de4b7a2:docs/backlog.yml` line 644 is `blocked_by: []` |
| `docs/backlog.yml:645` - cited twice, for "not a template the app ships ... obeyed" (section 1) and for the provenance suggestion (8.4) | `:645` is `instrument:`. The first phrase is in `title:` at **`:641`**; the second is in `note:` at **`:647`** |
| `docs/a39-census.md:568-572` - the rubric re-paste "ranked the single highest-count defect" | `:569-572` is the credential-gating point. The ranking is the table row at **`:579`** |
| `docs/a39-census.md:620-622` - A39 declining to cost path I | `:620-622` is blank, `---`, blank. The declination is at **`:617-619`** |

Also verified because the pattern is not general sloppiness: the A39 counting
unit at `:29-35` is right; the COLD/WARM paraphrase matches `:69-71`; the whole
path-P reachability chain is exact (`manual-rail.ts:76` and `:115`,
`PowerPointDesignTab.tsx:1` re-exporting `./ppt-design`, `page.tsx:566` under
`manualView === "ppt-design"`); the `syllabus_templates` migration header is
quoted verbatim; the five `ta-ppt-*` keys are at `hooks.ts:71,79,110,111,124`
exactly (checked at HEAD, since that file is in flight);
`useAppNavigation.ts:46` and `:392` are right; `office-edit.ts:17`, `:341-345`,
`:348`, `:383-392`, `:393`, `:464` are all right; `generate.ts:24`, `:114`,
`:250`, `:319` are all right; `pptx.ts:213` is right for the dynamic import;
`slide-prompt.ts:38` is right; `LIMIT = 1000` is at
`src/file-size-ceiling.structure.test.ts:41` as claimed; and every line count in
section 12 that I checked at HEAD is exact:

```
git show HEAD:<path> | wc -l
595 ppt-design/index.tsx   400 GeneratePanel.tsx   154 TemplateSelector.tsx
156 hooks.ts               261 slide-studio/DeckModeSection.tsx
474 decks/generate.ts      521 decks/types.ts      717 api/ai-chat/route.ts
```

So the mechanism is narrow: five cites written from approximation rather than
re-read, and the worst of them is the one cited three times as the location of
the guarantee the whole design rests on.

---

## MAJOR 2 - The hard constraint's slide-count figure comes from a different pipeline than the one the scope scopes

Section 3.5 argues the constraint against "the app's own worst case is 79-82
slides (`src/lib/slide-token-budget.ts`, the CODING and APPLIED arithmetic in its
header comment)".

The figures are real: `slide-token-budget.ts:30` ("N=7 (MAX_CONCEPTS_PER_LECTURE)
-> 82 slides") and `:69` ("N=7 ... -> 79 slides"). They are **inherited from a
source comment, not measured**, which the brief asked me to say.

Worse, they belong to another pipeline. They are the derivation of
`SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS`, and
`grep -rn "SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS" --include=*.ts --include=*.tsx src/`
(minus tests) shows exactly one consumer:
`src/app/actions/course-planning-grounding.ts:37` and `:778`. That is the
course-planning/schedule path. `src/lib/decks/generate.ts:8` imports only
`SLIDE_DECK_JSON_SHAPE`, `SLIDE_TITLE_MAX_CHARS` and `enforceTitleLength` from
`slide-prompt.ts`, and nothing at all from `slide-token-budget.ts`.

Every wave the scope plans (1, 2, 4) writes `ppt-design`, whose deck length is
`expandTemplate` over `DECK_PRESETS`: 3 to 18 fixed slides plus a 3-to-5-slide
block per loop item, with **no cap on loop items anywhere on that surface**.
Measured:

```
grep -nE "slice\(0,|MAX_|limit" src/app/components/ppt-design/hooks.ts        -> exit 1
grep -nE "slice\(0,|MAX_|limit" src/app/components/ppt-design/GeneratePanel.tsx -> exit 1
grep -nE "slice\(0,|MAX_" src/app/components/ppt-design/index.tsx              -> exit 1
canary: grep -c "const" on the three files -> 25 / 6 / 79
```

Items come from a newline-split textarea at `index.tsx:332-337`.

So the honest constraint is STRONGER than the scope's: the required slide count
is unbounded by construction on the path being built, not 79-82. The conclusion
(wave 3 is not optional) survives; the evidence for it does not.

---

## MAJOR 3 - The design's warm interaction count does not improve, and 5.3's only quantitative argument is built on it

Section 5.2 measures today's path P at **3 warm** (subject + Generate +
Download). Section 5.4 targets **3 warm** (source + Generate + Download). The
same number. The design trades typing a subject for picking a file, and the
document never says so.

Section 5.3 then tables "This design (warm) = 3" against "chat = 2 + S" and
derives a crossover at S = 2. Substitute today's surface and the table is
identical, because today's warm is also 3. So click cost is not something this
design buys. Section 8.4 already concedes click cost is not a categorical
advantage; the problem is that 5.3 is the document's only numeric argument and
it benchmarks the new design against a chat rather than against the surface it
replaces.

Separately, 5.2's "3 warm" is not derived under A39's own unit. A39 defines WARM
as free "wherever a `ta-` key persists the choice"
(`docs/a39-census.md:69-71`), and `ta-ppt-gen-subject` does persist
(`hooks.ts:110`, verified at HEAD). By the letter of the borrowed unit today's
warm is 2. Charging 1 for re-typing a subject that differs per deck is the right
judgement, but it is a declared-nowhere departure from the unit, so the scope's
table is not comparable to A39's.

Consequence for the criteria seat: the acceptance constraint must be "warm does
not exceed TODAY's warm", which is measurable, rather than "warm is 3", which is
already true.

---

## MAJOR 4 - "This surface requires no course" is instrumented on one file while a sibling in the same directory tells the user otherwise

The scope calls this "the single most useful fact for section 5" and builds C1
on it. Its command re-runs clean:

```
grep -niE "course" src/app/components/ppt-design/index.tsx   -> exit 1
canary: grep -c "selected" on the same file                  -> 83
```

Directory-wide it does not:

```
grep -rniE "course" src/app/components/ppt-design/
  GeneratePanel.tsx:101   (in-flight code, not pre-existing - see O1)
  GeneratePanel.tsx:220   group.source === "courseTopics"
  GeneratePanel.tsx:223   "Course topics not wired yet - type them here"
  SlidesPanel.tsx:105     <MenuItem value="courseTopics">Course topics</MenuItem>
  SlidesPanel.tsx:154     group?.source === "courseTopics"
  SlidesPanel.tsx:156     "You will pick a course when you generate."
```

`SlidesPanel.tsx` is unmodified in this tree, so those three are pre-existing.

Behaviourally the claim survives - `index.tsx:332-337` treats any non-`literal`
loop source as a runtime textarea, and `generateDeckFromTemplateAction`
(`src/app/actions/media.ts:567-575`) calls `requireUser()` only, no course. But
the surface's own copy promises a course the surface never asks for, and C1's
instrument as written ("a source-text test asserting no
`hubCourse`/`courseId`/`canvasUrl` identifier appears in the new ppt-design
files") passes while that string ships. An absence claim about a SURFACE was
measured on one FILE.

---

## MAJOR 5 - T2's census is one call site short, the missing one is the worst, and RES-A43-7's instrument cannot see it

Section 7.1 names three `enforceTitleLength` callers, all routing the count to
`console.error`. Measured:

```
grep -rn "enforceTitleLength" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."
```

Four production call sites: `course-planning-grounding.ts:907`,
`shared.ts:364`, `generate.ts:463`, and **`generate.ts:336`**.

`generate.ts:336` sits inside `scaffoldDeck` (the `provider === "embedded"`
path, `generate.ts:288`) and reads
`enforceTitleLength(propagateExampleCode(slides)).slides` - the `shortened`
count is **discarded entirely**, not even logged. Its own comment at `:332-335`
says the scaffold "can exceed the cap with no model involved at all - the guard
runs on this path for the same reason it runs on the LLM one."

RES-A43-7's instrument is `grep -n "console.error" src/lib/decks/generate.ts`
plus an assertion that the returned object carries the count, and its direction
of failure is "FAILS if the only record of a shortened title is a console line."
At `:336` there is no console line, so the instrument reports clean on the site
where there is no record at all, and the stated failure direction is satisfied
vacuously by the worst instance.

So there are FOUR silent truncations live on the ppt-design deck path, not
three, and the fourth has no instrument. For the brief's question about which
are live on the deck path specifically: T1 (`generate.ts:250` for the LLM path,
`:319` for the scaffold) is live on it; T2 is live on it via both `:463` and the
uncounted `:336`; T3 (`src/lib/pptx.ts`, no overflow handling at all) is live on
every download because `buildSlidesPptx` is the writer. The
`course-planning-grounding.ts` and `shared.ts` T2 sites are other surfaces, as
the scope correctly says.

---

## MAJOR 6 - "Nothing in the tree does any of this" is false for three of wave 3's five OOXML edits, and the absence needle could not have matched the code that exists

Wave 3 lists five edits for `pptx-clone.ts` and asserts "Nothing in the tree does
any of this (canaried, 3.2)". 3.2's needle set is
`sldIdLst|presentation\.xml|appendPptx|addSlideXml|cloneSlide|_rels/slide`.

`_rels/slide` cannot match the spelling this repo uses. With the right needle:

```
grep -rn "_rels" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."
  office-edit.ts:594, 614, 677, 711, 714
grep -rn "Content_Types" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."
  office-edit.ts:677, 704, 707
```

- `office-edit.ts:614` builds `ppt/slides/_rels/slideN.xml.rels` from a slide
  name and reads it; `embedTarget` plus `resolveZipPath` already resolve a
  relationship target out of it.
- `setDocxTitle` (`office-edit.ts:679-722`) already creates a new zip part,
  registers an `<Override PartName=... ContentType=.../>` in
  `[Content_Types].xml` (`:704-707`), and appends a
  `<Relationship Id=... Type=... Target=.../>` to a `_rels` file (`:711-714`).
  Its own doc comment at `:677` says so.

Three of wave 3's five edits therefore have a working in-tree precedent, inside
the one file section 10 tells every wave not to touch. Only
`ppt/presentation.xml`'s `sldIdLst` is genuinely new. The conclusion (wave 3 is
needed) stands; the cost estimate and the reuse survey behind it do not.

The 3.2 absence claim as a whole is weaker than it reads for the same reason:
`presentation\.xml` matches nothing because nothing spells that path, while
`office-edit.ts` demonstrably manipulates package-level parts.

---

## MINOR findings

| # | Finding |
|---|---|
| m1 | **"Callers of `buildSlidesPptx`: 75 hits"** (2.1). The command returns 75, but it counts grep LINES, mostly comments and imports. `grep -rn "buildSlidesPptx({" --include=*.ts --include=*.tsx src/ \| grep -v "\.test\."` returns 13, one of which is the definition at `pptx.ts:199`, so **12** production call sites. 75 also happens to equal the unrelated `git ls-files \| grep -icE "slide\|pptx\|deck"` count printed three lines above, which is what a copy looks like. Load-bearing nowhere, same mechanism as BLOCKER 1. |
| m2 | **"10 `valign` lines"** (7.1). `grep -c 'valign' src/lib/pptx.ts` -> **15**. `git log --oneline -1 -- src/lib/pptx.ts` is `ca19752` and the file is unmodified, so it was 15 when the scope was written. The load-bearing half is right: `grep -c 'shrinkText'` -> 0, `grep -c 'autoFit'` -> 0, `grep -c 'fit:'` -> 0, and `grep -niE "truncat\|overflow\|shrink\|autofit\|clip" src/lib/pptx.ts` exits 1 with canary `grep -c "addText"` -> 23. |
| m3 | **`new PptxGenJS()` is at `pptx.ts:215`, not `:213`.** `:213` is the dynamic import, quoted correctly; section 1's table then calls `:213` "the only place a presentation is constructed". `grep -rn "new PptxGenJS"` returns one hit, `pptx.ts:215`. |
| m4 | The quoted `ctx` block is `index.tsx:341-345` (it includes the closing `};`), cited as `:341-344`. |
| m4b | `expandTemplate` is at `src/lib/decks/types.ts:444`, cited as `:445` in both 2.1 and 4.1. Pinned with `grep -n "export function expandTemplate" src/lib/decks/types.ts`. |
| m5 | `setOfficeImageAlt` (`office-edit.ts:622-654`) is a SECOND in-place pptx writer with the same touched-only discipline (`if (touched) zip.file(file.name, xml)` at `:654`), unmentioned. Relevant only to section 10's "a behaviour change there would ripple into three Canvas features", which undercounts. |
| m6 | **No per-wave line budget.** `LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`, and neither `ppt-design/index.tsx` (595 at HEAD, written in waves 1, 2 and 4) nor `GeneratePanel.tsx` (400, written in waves 1, 3 and 4) is in `ALLOWED_OVERAGE`, so both may grow. 405 and 600 lines of headroom split across three waves each with no stated budget is how a wave discovers the ceiling at its own gate. |
| m7 | The **"no tool calling anywhere"** claim was instrumented on one file plus one `llm.ts` line, for a repo-wide assertion. I re-ran it repo-wide: `grep -rniE "functionDeclarations\|function_declarations\|functionCall\|function_call\|toolConfig\|tool_config" --include=*.ts --include=*.tsx src/` -> exit 1, canary `grep -rniE "google_search" --include=*.ts --include=*.tsx src/ \| wc -l` -> 1. **The claim is TRUE.** `llm.ts:519` is `tools: [{ google_search: {} }]` inside a `req.webSearch` branch - search grounding, exactly as the scope says. `ai-chat/route.ts:517` is a comment naming `src/app/actions/llm-tools.ts`, exactly as the scope says. Recorded so a revision need not re-derive it. |

---

## Residual register audit

Ten claimed, ten present, each carrying an owner, an instrument, an object, a
direction of failure and a step. The FORM is good - this is the best-formed
residual register I have checked in this repo. Four of the ten have drifted.

| id | Status |
|---|---|
| RES-A43-1 | **CLOSED** by `8301129`. `git ls-files \| grep -c "office-edit.*test"` -> 1 (was 0). Five assertions in `src/lib/office-edit.test.ts`. Note the residual's stated direction of failure is the WEAK form from BLOCKER 2; the test that landed used the stronger XML-reconstruction form instead, so it was discharged by something better than it asked for. |
| RES-A43-2 | Live and sound. `git ls-files \| grep -icE "\.(pptx\|potx\|docx\|thmx)$"` -> 0, canary `\.sql$` -> 109. |
| RES-A43-3 | Live and sound, apart from m2's sub-count. |
| RES-A43-4 | **Narrowed, and its justification is now false.** The scope says "Unverifiable here (RES-A43-2)". It was verifiable here: `src/lib/office-edit.test.ts:156-176` builds a slide-less pptx and proves `parseOfficeParagraphs` returns `[]` - reachable and SILENT, not a throw. What remains is only "does the owner's real file have zero `ppt/slides/` entries", which is genuinely owner-only. Strike the "unverifiable here" clause; keep the owner, the instrument and the wave-2 acceptance criterion (a zero-slide template must REFUSE with a stated reason), which is now the whole residual. |
| RES-A43-5 | Live, and now proven rather than argued: `office-edit.test.ts:126-154`. My own re-run of its grep confirms it (exit 1, canary `sortedSlides` -> 9 - the scope's 6 was right at its commit; the new test file added three). |
| RES-A43-6 | Live and sound. The RED-first instruction is the right shape. |
| RES-A43-7 | **Instrument defective.** See MAJOR 5. |
| RES-A43-8 | **SUPERSEDED** by DECISION 15. The conversational ask stays in, so this is no longer a residual awaiting an owner answer - it is the row's closing condition, and what needs recording instead is the operation set, the schemas, the dispatcher, the refusal path and BLOCKER 4's no-omitted-section rule. |
| RES-A43-9 | Live, with a moving counterparty. It assigns provenance work to "the wave-2 implementer, coordinating with whoever owns A3", and A3-adjacent provenance landed during this check (`8a977b1 feat(a39): rubric memory and version provenance`, plus untracked `src/lib/grade/rubricProvenance.ts` and `src/lib/research/rubric-fingerprint.ts`). The residual has no re-check step for that. |
| RES-A43-10 | Live and sound, and now the most important of the ten given MAJOR 3. Its direction of failure should be "FAILS if warm exceeds TODAY's measured warm", not "FAILS if warm exceeds 3", which is already satisfied. |

---

## The feature-already-exists case, in its strongest form

**For `.docx` this feature exists in full and is reached.** Upload your own
file; an LLM returns content-only JSON keyed to that file's own paragraph ids; a
deterministic writer places it back and leaves every unedited paragraph
byte-for-byte; the output is your file with generated content in it. The chain,
every link opened:

```
SyllabusTemplateCell.tsx:110 / SyllabusTemplateLibrary.tsx:86
  -> createSyllabusTemplateAction            (syllabus-templates.ts:51)
  -> syllabus_templates                      (migration 20260709000000)
SyllabusCell.tsx:116
  -> generateCourseSyllabusAction            (syllabus-templates.ts:119)
  -> parseOfficeParagraphs                   (office-edit.ts:348)
  -> callLlm, JSON [{id, text}]              (syllabus-templates.ts:204-232)
  -> applyOfficeSections("docx", ...)        (syllabus-templates.ts:267)
```

A43-T is that feature with `kind: "pptx"` and a slide-count problem.

**This does not shrink A43.** The clone path, the fit report, the pptx-specific
character-budget proxy and the whole conversational layer are all still real and
all still unbuilt. What it changes is the shape of the work and the honesty of
the claim: "extract the shipped pipeline and solve what pptx adds" instead of
"design a new one", and GUARANTEED earned on the denominator "zero of the four
deck paths", not "nothing in the app". It also hands wave 2 a tested content
contract and a worked example of the omitted-section trap that BLOCKER 2 says
the scope walked past.

---

## The weakest requirement

**C3.** "The source control must be one interaction, not a kind picker plus an
input. FAILS if the new panel renders more than one input whose value the user
must set before Generate."

Implemented exactly as written it produces a surface that cannot ask for
concepts, and the flagship presets then emit a 6-to-10-slide deck about one
unnamed concept (BLOCKER 3). It is the single clause most likely to be honoured
precisely and to make the feature worse. C1 is a close second for the reason in
MAJOR 4: it is satisfiable while the surface still tells the user to pick a
course.

---

## What a revision owes for A43-C, now that it stays in

DECISION 15 leaves the design to the scope. Section 10's wave 5 is nine lines
and recommends the work out, so there is no design to check. A revision owes, at
minimum:

1. **The operation set**, closed and enumerated, with the test DECISION 15
   states: if an operation cannot be expressed as content, it is not an
   operation.
2. **A schema per operation**, and the coercion at the boundary. The in-tree
   pattern is `coerceSlideGraphic` over the closed `matrix2x2/process/table`
   vocabulary (`src/app/actions/slide-graphics-repair.ts:17-19`) and
   `SlideRole.promptContract` (`src/lib/decks/types.ts:145-159`).
3. **A validating dispatcher** that refuses an unknown operation rather than
   ignoring it, because ignoring it is the T1/T3 failure mode this row already
   documented three times.
4. **A refusal path with a reason**, and specifically the BLOCKER 4 refusal:
   "add a slide" is blocked on wave 3 and must say so, since the machinery's
   own answer today is measured silence.
5. **The no-omitted-section rule** from BLOCKER 4, stated as a hard constraint
   on the operation set, not as prose.

---

## The fork the revision must argue, and my recommendation

DECISION 15 explicitly leaves open whether the conversational layer is a general
tool-calling mechanism or a deck-specific operation set. My view, since the
coordinator asked for one: **deck-specific operation set.** Grounds, measured
rather than preferred:

1. **There is no partial platform to extend.** Zero function-calling constructs
   repo-wide (m7). A general mechanism is greenfield platform work inside a
   feature row that already carries an unshipped OOXML writer and an unshipped
   clone path.
2. **`llm.ts` has exactly one `tools` site and it is search grounding**
   (`:518-519`). A general dispatcher would have to own provider differences
   across a `callLlm` that `docs/loop/leverage.md` records as reaching roughly
   78 call sites. That is a seam every later wave is built against, which
   `docs/DEV_LOOP.md` routes to `loop-top`, not to a deck row.
3. **DECISION 15's own constraint makes the deck set small and closed by
   construction.** "If an operation cannot be expressed as content, it is not an
   operation" IS the enforcement point. A general mechanism's value is that it is
   open, which is the opposite property, so the general one would need a second,
   deck-specific allowlist inside it anyway - the deck set, with a platform
   underneath it.
4. **Continuity with a shipped pattern.** A closed model-facing vocabulary with
   defensive coercion at the boundary already exists twice in this tree (point
   2 above under "what a revision owes").
5. **The cost of being wrong is bounded and already accepted.** DECISION 15
   names it: one re-implementation the next time this need appears. The cost of
   the general one being wrong is a seam, which is not re-implementable cheaply.

---

## Orchestration findings

**O1. Wave 1 is being implemented from this unchecked scope, right now.**
`git status --short` at the start of this check listed no `ppt-design` files. By
the end it listed:

```
 M src/app/components/ppt-design/GeneratePanel.tsx
 M src/app/components/ppt-design/hooks.ts
 M src/app/components/ppt-design/index.tsx
?? src/app/actions/deck-source.ts
?? src/lib/decks/deck-source.ts
?? src/lib/decks/deck-source.test.ts
```

That is exactly wave 1's write set from section 10, created at 07:46-07:48 per
`ls -la src/lib/decks/`. By the time this check closed it had LANDED as
`4080c2e feat(a43): fill the materials slot the manual deck surface never filled`,
with a backlog row behind it at `7271c3a backlog(a43): record A43-S, and a
cross-row hazard any later wave inherits`. `docs/DEV_LOOP.md` "Checks" requires every
model-authored artifact to be checked "before its consumer reads it", and the
checker gates its consumer. BLOCKER 3 says wave 1 as scoped does not deliver the
owner's request; that code is already written. This is not a defect in the
artifact - it is a defect in the routing of it, it belongs to the orchestrator,
and my brief puts the orchestrator's rulings inside the cap.

It also cost this check accuracy: `GeneratePanel.tsx:101`'s "no course
prerequisite" comment is in-flight code, not tree state, and I had to re-measure
`hooks.ts` and the file counts against HEAD to get a stable reading. A checker
racing its own implementer cannot cite the tree.

**O2. The overruled disposition leaves the largest part of the row with nine
lines of design.** DECISION 15 is the right call and the scope's measurement was
right; but the scope's only treatment of A43-C is a recommendation to remove it.
The five items above are what a consumer needs and does not have.

---

## Stopping point

**Rulings.**

Not measurement: I re-ran every absence claim with a canary, measured the jszip
byte-identity property directly under `node`, re-counted every census the scope
asserts, and checked every line count at HEAD. What is measurable here has been
measured.

Not design-by-the-seat either, for two of the four blockers. BLOCKER 1 turns on
whether A43-T is a port of the shipped `.docx` pipeline or a parallel build -
that is a chunking and reuse ruling, not something the seat can settle by
reading more of the tree, because both readings are internally consistent.
BLOCKER 3 turns on whether the concepts input survives C3, and that is the
owner's question below. BLOCKER 2 and BLOCKER 4 ARE seat-fixable in a revision:
they need a specified instrument and a specified rule, both of which I have
written out above.

---

## Blocker classification

| # | Class | NEW / REPEAT |
|---|---|---|
| B1 | **A failure-mode-B census measured on a subset, so an inherited class is credited as earned.** Corrective rule: enumerate the mechanism's call sites with one command over all of `src/` and read every hit before writing the count. | **NEW** |
| B2 | **A check whose assertion cannot fail on the defect it is named after.** This is `docs/loop/iteration-caps.md`'s own named class, cited rather than relabelled. Corrective rule: sabotage the instrument against the specific failure it protects and watch it go red. | **NEW** |
| B3 | **A requirement bound to an object that does not control it** - `materials` grounds prose while the requirement is about structure. Corrective rule: trace the value from the control to the output property the requirement names, and check the ORDER of operations, not just the presence of the slot. | **NEW** |
| B4 | **A guarantee asserted as structural whose enforcement point is not expressible in the chosen mechanism's own vocabulary.** Corrective rule: state the enforcement as a rule over the mechanism's actual inputs (here: the `sections` array), not as a category of user request. | **NEW** |

M1, M5, m1 and m2 are **REPEAT-OF-B1** at the mechanism level: one corrective
rule ("re-run the command and read its output before writing the quantity or the
cite") fixes all four, so I am not counting them as separate classes. Per the
anti-gaming rule, I am not relabelling them to buy anything - they are recorded
at MAJOR and MINOR because that is their severity, and as repeats because that
is their mechanism.

---

## The TERMINATING question for the owner

One question, shaped so every answer ends the activity.

> **A deck from an uploaded source: do you want the app to DERIVE the deck's
> topic list from the file you upload, or do you want to keep typing the
> concepts yourself and have the uploaded file only improve the wording of the
> slides?**

- **"Derive it."** Then wave 1 as scoped - and as already coded in this tree -
  does not do it. `materials` reaches the prompt only after the slide list is
  fixed (`generate.ts:385` before `:392`), so a new pre-pass is needed that
  turns the uploaded source into loop items BEFORE `expandTemplate`, and C3 must
  be rewritten to allow one reviewable derived-concepts list. A43-S becomes a
  real design item rather than a one-line `ctx` change.
- **"Keep typing."** Then wave 1 as coded is correct, C3 stands as written, and
  the honest description of A43-S is "the wording of your deck is grounded in
  your file" - not "a deck from your file", which is what the row's title
  currently says. The row's title changes and the leverage paragraph narrows
  accordingly.

Either answer terminates the activity. It has to go to the owner because it is
what the owner's own sentence means, and nothing in the tree can settle it.

A second fork rides alongside and does **not** block, because I have a
recommendation with measured grounds: **A43-T should be a port of the shipped
`.docx` template pipeline (`syllabus-templates.ts:245-267` generalised over
`OfficeKind`), not a parallel pptx build.** Cost of being wrong: one shared
module that has to carry two placement models, which is recoverable. Cost of
not asking: wave 2 re-derives a tested contract and walks into the
omitted-section deletion the existing code has a comment about.

---

## Instruments used in this pass

Reproducible from the repo root in the Bash tool, 2026-09-27.

```
git log --oneline -- docs/a43-scope.md                            -> 1 commit (de4b7a2)
git ls-files | grep -i a43                                        -> docs/a43-scope.md
git show de4b7a2:docs/backlog.yml | sed -n '637,647p'             -> field-by-field, for MAJOR 1
grep -rn "applyOfficeSections" --include=*.ts --include=*.tsx src/
                                    -> 5 production sites in 4 files (BLOCKER 1)
       canary: same form over parseOfficeParagraphs               -> 36 lines
grep -rn "generateCourseSyllabusAction" --include=*.ts --include=*.tsx src/
                                    -> UI caller SyllabusCell.tsx:116 + 3 workflow steps
grep -rn "createSyllabusTemplateAction" --include=*.ts --include=*.tsx src/
                                    -> upload surfaces at SyllabusTemplateCell.tsx:110,
                                       SyllabusTemplateLibrary.tsx:86
grep -n "if (touched) zip.file" src/lib/office-edit.ts             -> 452, 654 (NOT 454)
       canary: grep -c "zip.file" src/lib/office-edit.ts           -> 23
sed -n '454p' src/lib/office-edit.ts | cat -A                      -> "  }$"
grep -rn "_rels" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."
                                    -> office-edit.ts:594,614,677,711,714 (MAJOR 6)
grep -rn "Content_Types" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."
                                    -> office-edit.ts:677,704,707
grep -rniE "sldIdLst|presentation\.xml|appendPptx|addSlideXml|cloneSlide|_rels/slide" \
  --include=*.ts --include=*.tsx src/                              -> exit 1
       canary: sortedSlides                                        -> 9 lines
git ls-files | grep -icE "\.(pptx|potx|docx|thmx)$"                -> 0 (canary \.sql$ -> 109)
git ls-files | grep -c "office-edit.*test"                         -> 1 (RES-A43-1 closed)
grep -rniE "functionDeclarations|function_declarations|functionCall|function_call|toolConfig|tool_config" \
  --include=*.ts --include=*.tsx src/                              -> exit 1
       canary: google_search                                       -> 1
grep -rn "buildSlidesPptx" --include=*.ts --include=*.tsx src/ | wc -l         -> 75 lines
grep -rn "buildSlidesPptx({" --include=*.ts --include=*.tsx src/ | grep -v "\.test\." | wc -l
                                                                   -> 13 (12 callers + def)
grep -rn "new PptxGenJS" --include=*.ts --include=*.tsx src/       -> pptx.ts:215 only
grep -rn "enforceTitleLength" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."
                                                                   -> 4 sites (MAJOR 5)
grep -c 'valign' src/lib/pptx.ts                                   -> 15 (scope said 10)
grep -c 'shrinkText' / 'autoFit' / 'fit:' src/lib/pptx.ts          -> 0 / 0 / 0
grep -niE "truncat|overflow|shrink|autofit|clip" src/lib/pptx.ts   -> exit 1
       canary: grep -c "addText"                                    -> 23
grep -niE "course" src/app/components/ppt-design/index.tsx          -> exit 1
       canary: grep -c "selected"                                   -> 83
grep -rniE "course" src/app/components/ppt-design/                  -> 6 lines (MAJOR 4)
grep -nE "slice\(0,|MAX_|limit" on ppt-design hooks.ts/GeneratePanel.tsx/index.tsx
                                                                   -> exit 1 on all three
       canary: grep -c "const" on the three                         -> 25 / 6 / 79
grep -rn "SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS" --include=*.ts --include=*.tsx src/
                                    -> one consumer, course-planning-grounding.ts (MAJOR 2)
sed -n '13,54p' src/lib/office-extract.ts | grep -cE '^\s*"[a-z0-9]+",?$'   -> 39
sed -n '55,68p' src/lib/office-extract.ts | grep -cE '^\s*"[a-z0-9]+",?$'   -> 11
grep -rn "extractPptxSlidesAction" ... | grep -v "\.test\."         -> 6 call sites, exactly
                                       as the scope lists them
git show HEAD:<path> | wc -l   -> 595 / 400 / 154 / 156 / 261 / 474 / 521 / 717
grep -n "LIMIT = 1000" src/file-size-ceiling.structure.test.ts      -> 41
node <scratchpad>/zipident2.js                                      -> exit 0, BLOCKER 2
```

**Why I did not pipe an absence check through `head` or `cat`.** One of my own
first spellings was
`grep -nE "slice\(0,|MAX_|limit" ... | head` followed by `echo "exit=$?"`, which
reported `head`'s status (0) while grep had matched nothing - the same mechanism
the scope records catching in itself with `cat`. Every absence claim above was
re-run without a pipe, so `$?` is grep's, and each carries a canary proving both
that the file was read and that the pattern form matches something real.

**What I could not measure here.** `expandTemplate`'s real output for each preset
required executing TypeScript, and my write set was one doc file, so I could not
add a test. The preset shape table in BLOCKER 3 is therefore a static parse of
`src/lib/decks/presets.ts` plus a read of `types.ts:444-521`, not an executed
count. The direction of the finding does not depend on the exact numbers - it
depends on `expandTemplate` running before the prompt, which is a read of
`generate.ts:385` against `:392`. An implementer should confirm the per-preset
counts with a real test before relying on the table.
