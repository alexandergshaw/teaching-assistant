# A43 scope, REVISION 2: a slide deck from an uploaded source, against an uploaded template

Seat: scoping pass for backlog row A43 (`docs/backlog.yml:637`, state `unscoped`).
Owner's request, verbatim, as the row records it (`docs/backlog.yml:647`, the
`from:` field):

> "A way to make a slide deck given an uploaded content source (repo, ch obj's,
> homework, etc). The flexibility of an llm with the structure of a deterministic
> method. I need to be able to smoothly upload and ask for things while still
> ensuring the output is going to use a predefined template that i upload".

**This is revision 2 and it is TERMINAL.** It is written under
`docs/a43-rulings.md` (commit `263dc88`), which disposes of `docs/a43-check.md`'s
4 blockers, 6 majors, 8 minors and 2 orchestration findings. There is no round 3.
Everything this revision cannot settle is in section 13 as a residual with an
owner, an instrument, an object, a direction of failure and a step - or, for the
one thing no agent can settle, in section 0 as a fork whose every answer ends the
activity.

**Every quantity below names the command that produced it, re-run in the Bash
tool from the repo root on 2026-09-27 at HEAD `263dc88`, output read before the
quantity was written.** Concurrent work moved HEAD to `7e2b9bd` while this pass
was writing. `git diff --name-only 263dc88 -- <every path cited below>` returns
exactly one path, `docs/backlog.yml`, and `git diff --stat 263dc88 -- docs/backlog.yml`
shows one changed line at `:602` - a different row, no line-count shift - so the
A43 field map below was re-verified at `7e2b9bd` and is unchanged. **No other
file cited in this document differs between the two commits.** That last clause is the corrective rule from RULING 53:
revision 1 carried five wrong `file:line` cites, one of them cited three times,
in a document whose preamble claimed every cite had been opened. Every absence
claim below names a canary proving both that the command fires and that the
pattern form matches something real, and no absence claim is piped through `cat`
or `head`, which report the pipe's exit status instead of grep's.

**Citation drift warning, measured rather than assumed.** The check's corrections
to the `docs/backlog.yml` cites were measured at commit `de4b7a2` and are now off
by one, because `7271c3a` added a `question:` field to the A43 row.
`git show de4b7a2:docs/backlog.yml | awk 'NR>=637 && NR<=647'` puts `title:` at
`:641` and `from:` at `:646`; `awk 'NR>=637 && NR<=648' docs/backlog.yml` at HEAD
puts them at `:642` and `:647`. **This document cites HEAD**, re-verified at `7e2b9bd`. A
later reader who finds these off by one should suspect another field was added,
not that the cite was approximated.

**One gate this document is actually covered by, stated because most docs are
not.** `src/lib/no-emojis.test.ts:254` scans roots `["src", "docs"]` with
`SCAN_EXTENSIONS = /\.(ts|tsx|css|md)$/` (`:237`), and
`src/source-bytes.structure.test.ts` collects from `process.cwd()` (`:48`, `:69`)
over `TEXT_EXTENSIONS` including `.md` (`:50`), with `docs` absent from
`SKIP_DIRS` (`:49`). So both of those gates read THIS FILE. Verified green with
this revision on disk:
`npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`
-> `COVERED` on both arguments, `Tests 21 passed (21)`, exit code 0. Separately,
`LC_ALL=C tr -d '\000-\177' < docs/a43-scope.md | wc -c` -> **0** non-ASCII
bytes, against a canary of 147 for the same command over
`src/lib/office-edit.ts`, which carries em dashes.

---

## 0. THE OWNER FORK, and what is NOT DISPATCHABLE until it lands

**This section gates part of section 11. Read it before dispatching anything.**

### 0.1 The measured fact behind the fork

`materials` reaches the model through `buildDeckPrompt`, at
`src/lib/decks/generate.ts:114` - the `${ctx.materials ? "SOURCE MATERIALS:..."}`
interpolation inside the prompt template. `buildDeckPrompt` is called at
`generate.ts:392`. `expandTemplate(template, loopItemsResolved)` - the call that
fixes the slide list - is at `generate.ts:385`.

```
sed -n '110,118p' src/lib/decks/generate.ts   -> materials interpolation on :114
sed -n '358,395p' src/lib/decks/generate.ts   -> expandTemplate on :385,
                                                 buildDeckPrompt on :392
```

**385 is before 392.** So an uploaded source can change the WORDS on slides whose
count, order and per-concept topics were fixed before the source was ever shown
to the model. Nothing derives a topic list from the file.

Two further measurements make that structural rather than incidental:

- The breadth pre-pass that could enumerate concepts is gated at
  `generate.ts:365`: `if (loopGroup.breadth !== "standard" && items.length > 0)`.
- **Every loop group in every shipped preset is `breadth: "standard"`.**
  `grep -n "breadth" src/lib/decks/presets.ts` returns exactly three lines - `:27`
  (`preset-coding-lecture-concepts`), `:36` (`preset-classic-lecture-concepts`)
  and `:135` (`preset-review-session-topics`) - and all three are `"standard"`.
  The other two presets declare `loops: []` (`presets.ts:111`, `:348`). So
  `enumerateBreadthFull` cannot run on this surface at all.
  (The check said "both loop presets"; there are THREE loop groups, which makes
  the finding stronger, not weaker.)
- With no loop items, `expandTemplate` emits each loop block once -
  `src/lib/decks/types.ts:472`,
  `const itemsToUse = items.length > 0 ? items : [undefined];`
  (`grep -n "itemsToUse" src/lib/decks/types.ts` -> `472`, `474`).

**`4080c2e` shipped exactly the wiring above and is NOT reverted** (RULING 49 -
the orchestrator's, not this seat's). `git show --stat --format="" 4080c2e` lists
six files: `src/app/actions/deck-source.ts` (+71),
`src/app/components/ppt-design/GeneratePanel.tsx` (+83),
`src/app/components/ppt-design/hooks.ts` (+16),
`src/app/components/ppt-design/index.tsx` (+88),
`src/lib/decks/deck-source.test.ts` (+154), `src/lib/decks/deck-source.ts` (+86).
The landed `ctx` literal is at `index.tsx:418-423` and carries
`materials: sourceMaterials || undefined` on `:421`
(`grep -n "const ctx = {" src/app/components/ppt-design/index.tsx` -> `418`).
Its reachability test asserts the binding is real and discriminates it from an
empty one and from an absent one
(`grep -n "canary" src/lib/decks/deck-source.test.ts` -> `:134`, `:140`, `:144`).
**That test is correct and it is not enough**, which is the whole point of the
fork: it proves `materials` reaches the prompt, and the owner's sentence is about
what determines the slides.

### 0.2 The question, shaped so every answer ends the activity

> **A deck from an uploaded source: do you want the app to DERIVE the deck's
> topic list from the file you upload, or do you want to keep typing the concepts
> yourself and have the uploaded file only improve the WORDING of the slides?**

### 0.3 What changes per branch

| | Branch DERIVE | Branch KEEP TYPING |
|---|---|---|
| `4080c2e` | Kept verbatim; it becomes the second half of the path (wording grounding), not the whole of it | Kept verbatim and is complete |
| New work in A43-S | **Wave S2** (section 11): a pre-pass that turns the normalised source into loop items BEFORE `expandTemplate`, i.e. writing `ctx.loopItems` from the source rather than writing `ctx.materials` | None |
| **C3, the one-control constraint** | **REWRITTEN.** C3 as written forbids a second input the user must set; a derived-concepts list the instructor can review and edit IS a second control. C3 becomes C3-D in section 12.2 - one control to SUPPLY a source, plus at most one REVIEW surface prefilled from it, which must be editable and must never be required to be touched | **HELD** as C3 in section 12.1 |
| Row title (`backlog.yml:642`) | Stands: "generate a SLIDE DECK from an uploaded content source" | **Must narrow.** The honest description is "your deck's WORDING is grounded in your file", not "a deck from your file" |
| A43-S's leverage sentence (section 8.4) | A derived topic list is a real mechanism and gets its own claim argued at build time | A43-S carries **no** leverage claim of its own; it is a click-cost saving on top of A43-T's GUARANTEED claim, and section 8.4 says so |

**Recommendation, with the cost of being wrong.** DERIVE. The owner's own words
are "make a slide deck GIVEN an uploaded content source", and KEEP TYPING does
not do that. Cost of being wrong about DERIVE: wave S2 is built and the owner
finds a derived list worse than typing three words, so S2's pre-pass is deleted
and `4080c2e` is what remains - one wave of waste, no seam. Cost of being wrong
about KEEP TYPING: the row closes claiming something it does not do, which is the
failure class this whole loop exists to catch.

### 0.4 What is NOT DISPATCHABLE until the answer lands

- **Wave S2** (section 11.2). Its existence is the fork.
- **C3 versus C3-D** (section 12). An implementer must be handed exactly one.
- **The row title and the A43-S leverage sentence.**

**Everything else in this document is dispatchable now**, because it is
downstream of the template guarantee rather than of the topic list: waves T1, T2,
T3, F1 and C1-C3 in section 11, and every constraint in section 12 except C3.

---

## 1. The headline: this is a PORT plus one genuinely new capability

**Corrected from revision 1, per RULING 50.** Revision 1 called A43-T a new
build. It is a port.

| Piece of the owner's sentence | Status | Proof |
|---|---|---|
| "make a slide deck" from a template + an LLM | SHIPS, reached, four surfaces | section 2 |
| "the structure of a deterministic method" | SHIPS as shape (a) | `src/lib/decks/generate.ts:37-40` returns `{presentationTitle, slides: PptxSlide[]}`; `src/lib/pptx.ts:215` is the only place a presentation is constructed (`grep -rn "new PptxGenJS" --include=*.ts --include=*.tsx src/` -> one hit, `pptx.ts:215`) |
| "given an uploaded content source" | **SHIPS as wording grounding, as of `4080c2e`.** Whether that is the feature is section 0 | `index.tsx:421`; `generate.ts:114` |
| "a predefined template that i upload" | **SHIPS FOR `.docx`, NOT FOR `.pptx`.** The mechanism exists end to end; A43-T ports it | section 3 |
| "smoothly upload and ask" | **DOES NOT EXIST.** No tool calling anywhere | section 9, canaried |

### 1.1 The three pieces

- **A43-S (SOURCE).** Wiring landed at `4080c2e`. Remaining work is the fork in
  section 0.
- **A43-T (TEMPLATE AS A FILE).** The owner's own `.pptx`, obeyed. **This is a
  PORT of `generateCourseSyllabusAction` generalised over `OfficeKind`**, plus
  the one thing `.pptx` adds that `.docx` does not have: slide identity and slide
  count. That second half is genuinely new.
- **A43-C (CONVERSATIONAL ASK).** **IN SCOPE**, per
  `docs/owner-decisions-2026-09-27.md` DECISION 15, which overrode revision 1's
  recommendation to route it out. Designed in section 9.

### 1.2 What revision 1 got wrong here, stated plainly

Revision 1's section 1 said a file-backed template "DOES NOT EXIST". For
`.pptx` that is true. For the MECHANISM it is false, and the mechanism is what a
wave plan is built from. The corrective rule, from RULING 53: enumerate a
mechanism's call sites with one command over all of `src/` and read every hit
before writing the count. Revision 1 wrote "exactly TWO places" and then printed
three line cites in the same sentence.

---

## 2. What exists, traced end to end (control -> action -> model -> output)

```
git ls-files | grep -icE "slide|pptx|deck"      -> 75
git ls-files | grep -icE "template"             -> 37
```

Four deck paths reach a real `.pptx`. All four use the same core.

### 2.1 The shared core (the deterministic writer)

- `src/lib/decks/generate.ts` (474 lines, `git show HEAD:<path> | wc -l`) -
  `buildDeckPrompt` asks the model for JSON only; `generateDeckFromTemplate` maps
  it to `PptxSlide[]`.
- `src/lib/pptx.ts` (680) - `buildSlidesPptx`, the only presentation constructor.
  `:215` `const prs = new PptxGenJS();`.
- `src/lib/decks/types.ts` (521) - `DeckSlide` at `:334`, `DeckTemplate` at
  `:346`, **`expandTemplate` DEFINED at `:444`**
  (`grep -n "export function expandTemplate" src/lib/decks/types.ts` -> `444`;
  revision 1 cited `:445` twice).
- **Production callers of `buildSlidesPptx`: 12.**
  `grep -rn "buildSlidesPptx({" --include=*.ts --include=*.tsx src/ | grep -v "\.test\." | wc -l`
  -> 13, of which one is the definition in `pptx.ts`. Revision 1 printed 75,
  which is the LINE count of `grep -rn "buildSlidesPptx"` including comments and
  imports - and which coincidentally equals the unrelated
  `git ls-files | grep -icE "slide|pptx|deck"` count printed three lines above
  it in revision 1. That is what a copy looks like.

**This is already shape (a).** The model never sees or emits a file.

### 2.2 Path P - PowerPoint Design tab (the surface A43 extends)

Reached: Tools tab -> "PowerPoint Design" chip
(`src/app/components/manual/manual-rail.ts:76`, `:115`) ->
`src/app/components/PowerPointDesignTab.tsx:1` re-exports `./ppt-design` ->
rendered at `src/app/page.tsx:566`.

Both ends, at HEAD (i.e. after `4080c2e`):

- Controls, `src/app/components/ppt-design/GeneratePanel.tsx`: source TextField
  `:101-106` (label `"Source (optional)"`), file input `:113`, attach button
  `:126`, Subject `:158-159`, Audience `:166-167`, per-loop-group inputs `:207`
  and `:225`, Generate `:259-260`.
- Action: `index.tsx:425`
  `generateDeckFromTemplateAction(selected, ctx, getStoredProvider())`.
- Output: `handleDownloadPptx` calls `buildSlidesPptx`.

**The `ctx` literal, at HEAD, `index.tsx:418-423`:**

```
      const ctx = {
        subject: subject || derivedSubject || selected.name,
        audience: audience || selected.audience,
        materials: sourceMaterials || undefined,
        loopItems: resolvedLoopItems,
      };
```

**Generate requires nothing.** `GeneratePanel.tsx:260` is
`disabled={generateBusy}` - no subject condition. So C2 (section 12) is satisfied
at HEAD, measured rather than reported.

**The persisted keys, re-measured at HEAD** (`grep -n '"ta-' src/app/components/ppt-design/hooks.ts`
plus the interpolated key):

| Key | Line |
|---|---|
| `ta-ppt-selected-id` | `hooks.ts:72` |
| `ta-ppt-settings-open` | `hooks.ts:80` |
| `ta-ppt-source-receipt` | `hooks.ts:117` (new in `4080c2e`) |
| `ta-ppt-source-materials` | `hooks.ts:121` (new in `4080c2e`) |
| `ta-ppt-gen-subject` | `hooks.ts:126` |
| `ta-ppt-gen-audience` | `hooks.ts:127` |
| `ta-ppt-gen-loop-<groupId>` | `hooks.ts:140`, read at `index.tsx:101` |

Revision 1 cited these at `hooks.ts:71,79,110,111,124`. Those were right before
`4080c2e`; they are wrong now. Re-measure this table rather than quoting it.

### 2.3 "This surface requires no course" - the claim, NARROWED

**What is true, and it is narrower than revision 1 said.** The file that builds
the context and calls the action reads no course:

```
grep -niE "course" src/app/components/ppt-design/index.tsx   -> exit 1
canary: grep -c "selected" src/app/components/ppt-design/index.tsx -> 83
```

**What is also true, and revision 1 missed it because it measured a SURFACE claim
on one FILE:** two sibling panels in the same directory ship copy promising a
course the surface never asks for.

```
grep -niE "course" src/app/components/ppt-design/SlidesPanel.tsx
  105: <MenuItem value="courseTopics">Course topics</MenuItem>
  154: {group?.source === "courseTopics" && (
  156: You will pick a course when you generate.
grep -niE "course" src/app/components/ppt-design/GeneratePanel.tsx
  99:  new required step, no course prerequisite.   (a comment, added by 4080c2e)
  220: {group.source === "courseTopics" && (
  223: Course topics not wired yet - type them here
```

`git show 4080c2e^:src/app/components/ppt-design/SlidesPanel.tsx | grep -niE "course"`
returns the same three lines at the same numbers, and the same command over
`GeneratePanel.tsx` returns `:139` and `:142`, so **all four of the behavioural
lines are pre-existing** and only the `:99` comment is new.

Behaviourally the claim survives: any non-`literal` loop source becomes a runtime
textarea (`index.tsx:398-409`, with the `.split("\n")` chain at `:404-407`), and
`generateDeckFromTemplateAction` calls `requireUser()` only. But **the copy at
`SlidesPanel.tsx:156` is a lie the surface tells the user**, and C1's instrument
as revision 1 wrote it passes while that string ships. C1 is re-instrumented in
section 12, and the copy defect is RES-A43-11.

### 2.4 Paths W, M, L - unchanged from revision 1, re-spot-checked

- **W**, `src/lib/workflows/registry/steps.media.presentation-from-template.ts` -
  has a source, gated on a course tile: the repo gatherer at
  `src/lib/workflows/registry-helpers.sources.ts:688` reads
  `tile.repos?.[0]?.repo?.trim()` and refuses at `:689-691`.
- **M**, `src/app/components/module-deck-capture/ModuleDeckCapturePanel.tsx` -
  screen capture -> `deck-from-capture/route.ts:124`
  `buildDeckGenContext(tplRes.template, moduleLabel, materialsText)`.
- **L**, `src/app/api/lms-generation/deck/route.ts:171` - same, with a course row.

**Zero of these four paths applies a user-supplied FILE as the template.** That
is the denominator the leverage claim is earned on, and only that one
(section 8).

### 2.5 `slide-graphics-repair.ts` is not shape (b), and is the pattern section 9 copies

`src/app/actions/slide-graphics-repair.ts` is a one-shot content backfill, not a
template validator with a repair loop; its own header at `:8` names "the closed
vocabulary (matrix2x2/process/table) the main deck prompt uses" and `:17-22` says
a malformed repair "degrade[s] to no graphic exactly as it would during normal
generation". The coercion it names is
`coerceSlideGraphic` at `src/lib/slide-graphics.ts:208-221`:

```
export function coerceSlideGraphic(raw: unknown): SlideGraphic | undefined {
  const obj = asRecord(raw);
  if (!obj) return undefined;
  switch (obj.kind) {
    case "matrix2x2": ... case "process": ... case "table": ...
    default:
      return undefined;
  }
}
```

**Section 9 copies the closed switch and NOT the `default: return undefined`.**
Silent degradation is right for a decorative graphic and is the T1/T3 defect for
an operation the instructor asked for out loud.

---

## 3. Q1 - the template format, and the pipeline that already answers it

### 3.1 WITHDRAWN: "the format question is genuinely open"

Revision 1 section 3.1 asserted this. **It is withdrawn per RULING 50: the tree
answered it, for `.docx`, in shipped code.** What revision 1 presented as a
recommendation in its 3.4 was a description of a pipeline it had not traced.

### 3.2 The shipped pipeline, every link opened

**`generateCourseSyllabusAction` (`src/app/actions/syllabus-templates.ts:119`) IS
this feature for `.docx`.** `head -2 src/app/actions/syllabus-templates.ts`
confirms `"use server"`; the file is 459 lines
(`git show HEAD:src/app/actions/syllabus-templates.ts | wc -l`).

1. **The owner uploads their own file.** Two UI surfaces plus one action path:
   `src/app/components/courses/SyllabusTemplateCell.tsx:110`,
   `src/app/components/SyllabusTemplateLibrary.tsx:86`, and
   `src/app/actions/lms-syllabus-buttons.ts:572` - all calling
   `createSyllabusTemplateAction` (`syllabus-templates.ts:51`).
2. **Stored base64 in a `text` column, owner-scoped.**
   `supabase/migrations/20260709000000_create_syllabus_templates.sql`, whose
   header reads (`head -4`): "Each row is a saved Word .docx (base64-encoded in
   `content`) plus a name, owner-scoped."
3. **Parsed to paragraphs.** `syllabus-templates.ts:144`
   `parseOfficeParagraphs("docx", buffer)`.
4. **The model returns CONTENT ONLY, keyed to the file's own paragraph ids** -
   JSON `[{id, text}]`, mapped at `:240-242` into `replacementById`.
5. **A deterministic writer puts it back.** `:250-265` builds one section per
   paragraph; `:267` `applyOfficeSections("docx", buffer, sections)`.
6. **Reached from the UI and from three workflow steps.**
   `src/app/components/courses/SyllabusCell.tsx:116`,
   `src/lib/workflows/registry/steps.syllabus.ts:283`,
   `src/lib/workflows/registry/steps.course-setup.materials.ts:241`, and
   `src/app/actions/lms-syllabus-buttons.ts:593`.

The full census that revision 1 got wrong -
`grep -rn "applyOfficeSections" --include=*.ts --include=*.tsx src/`, canary
`grep -rn "parseOfficeParagraphs" ... | wc -l` -> 36 - gives **five production
call sites in four files**:

| Site | What the file is |
|---|---|
| `src/lib/canvas-modules/office.ts:143` | Canvas file edited in place |
| `src/lib/canvas-modules/office.ts:192` | Canvas file, docx only |
| `src/lib/canvas-modules/office-accessibility.ts:235` | Canvas file, a11y fixes |
| `src/app/actions/syllabus-adapt.ts:480` | an owner-uploaded `.docx` |
| `src/app/actions/syllabus-templates.ts:267` | **an owner-uploaded template a generator fills** |

### 3.3 A43-T IS THAT ACTION, generalised over `OfficeKind` - the port, and its cost

**RULED (RULING 50): wave T1 does NOT create `src/lib/decks/pptx-template.ts` as
a parallel module. It extracts the content contract and the section-building step
out of `syllabus-templates.ts:204-267` into a pure module parameterised by
`OfficeKind`, and A43-T's own action calls it.**

`src/lib/office-edit.ts:17` already declares
`export type OfficeKind = "docx" | "pptx";` and both `parseOfficeParagraphs`
(`:348`) and `applyOfficeSections` (`:393`) already take it as their first
argument. So the generalisation is not in the writer. It is in the caller, and it
costs exactly four things:

| What generalising costs | Why |
|---|---|
| Two hardcoded `"docx"` literals become a parameter | `syllabus-templates.ts:144` and `:267` |
| The bold-prefix preservation at `:255-263` must be declared kind-neutral or dropped | It reads `p.runs` and re-emits a bold leading span. `parseOfficeParagraphs` returns `runs: RunSpan[]` for both kinds (`office-edit.ts:41-45`), so it is harmless on pptx - but it is untested there, so it is a wave-T1 test obligation, not an assumption |
| A slide dimension enters the contract | `OfficeParagraph` carries `slide?: number` (`office-edit.ts:41-45`) and `sortedSlides` (`:341-345`) is pptx-only. The `.docx` caller has no notion of "which slide this paragraph is on"; A43-T's prompt and its fit report both need it |
| The caller's I/O stays behind | `syllabus-templates.ts` is coupled to the `syllabus_templates` table and to a `facts` object. The extraction is the PURE middle (paragraphs -> model contract -> sections), not the action |

**What the port does NOT get for free, and it is the real remaining work:**
`.docx` has no slide count, so `generateCourseSyllabusAction` never has to answer
"the deck needs more slides than your file has". That question is A43-T's whole
new surface: the refusal in section 7.3 and the cloning in wave T3.

### 3.4 THE DELETION SEMANTICS - the likeliest wave-T1 bug, per RULING 51

**`applyOfficeSections` DELETES a known paragraph that has no section.** This is
stated twice in the tree:

- Its own contract comment, `src/lib/office-edit.ts:383-392`: "A known paragraph
  with no section is deleted."
- The shipped caller's comment, `src/app/actions/syllabus-templates.ts:245-247`,
  read directly this pass with `sed -n '240,270p'`:

```
    // Rebuild through the same helper the adapt flow uses. Every paragraph gets
    // a section (applyOfficeSections deletes known paragraphs with no section);
    // unchanged paragraphs pass their original runs so they stay byte-for-byte.
```

Revision 1 never mentioned this - not in its design, not in a wave, not in a
residual. **So the most natural wave-T1 implementation - "emit a section for each
paragraph I filled with generated content" - silently deletes every other
paragraph of the owner's template.** Headers, footers, standing notes, the
copyright line: everything the owner put there and did not want rewritten. It is
the exact opposite of the feature, and every gate would be green.

**HARD CONSTRAINT H1, and it is why the shipped caller maps over ALL paragraphs
rather than over its replacements:**

> **The `sections` array handed to `applyOfficeSections` must contain one entry
> for EVERY paragraph `parseOfficeParagraphs` returned, in every call, without
> exception. A paragraph the generator did not touch is emitted with its own
> original `runs`, exactly as `syllabus-templates.ts:252-253` does. There is no
> legitimate reason for `sections.length` to be less than `paragraphs.length`.**

### 3.5 THE INSTRUMENT FOR H1 - replaced, per RULING 51

**Revision 1's instrument cannot fail on this defect, and the check measured
that.** Revision 1 proposed: load both zips with `jszip` and assert every entry
whose name is NOT `ppt/slides/slideN.xml` is byte-identical. Slides are excluded,
so an in-slide deletion is invisible. The check built a four-entry pptx-shaped
zip under `node`, wiped `ppt/slides/slide1.xml` to an empty `p:sld`, and the
assertion still passed. A test that is buildable exactly as specified and cannot
fail on the defect it is named for is worse than one that does not build, because
it ships a green signal.

**The instrument that does work already exists in this tree, and it landed at
`8301129`: `src/lib/office-edit.test.ts:93-106`.** Read this pass with
`sed -n '85,115p' src/lib/office-edit.test.ts`:

```
    const PPTX_PARA = /<a:p\b[^>]*(?<!\/)>[\s\S]*?<\/a:p>/g;
    const originalParas = [...originalSlideXml.matchAll(PPTX_PARA)].map((m) => m[0]);
    const newParas = [...(newSlideXml as string).matchAll(PPTX_PARA)].map((m) => m[0]);
    expect(originalParas).toHaveLength(2);
    expect(newParas).toHaveLength(2);
    expect(newParas[0]).toBe(originalParas[0]);
    const reconstructed = originalSlideXml.replace(originalParas[1], newParas[1]);
    expect(reconstructed).toBe(newSlideXml);
```

It reconstructs the produced slide XML from the original by substituting only the
edited paragraph's substring, and asserts byte equality. **An omitted section
removes a paragraph from the produced XML, so `originalParas` and `newParas` have
different lengths and the reconstruction cannot match.** That is a test that goes
red on the H1 defect.

`src/lib/office-edit.test.ts` is 177 lines
(`git show HEAD:src/lib/office-edit.test.ts | wc -l`) and its fixture ordering is
load-bearing: `docs/backlog.yml:648` records that the first sabotage of this
assertion stayed GREEN because the fixture's untouched paragraph carried its
attributes in the order the rebuild path emits, so a full rebuild was
indistinguishable from leaving it alone. **Anyone editing that test must keep the
non-canonical attribute order or it stops measuring anything.** This is
RES-A43-12.

---

## 4. Q2 - where the guarantee lives

### 4.1 The ruling stands: shape (a), with (c) as its content contract

Unchanged from revision 1 and reaffirmed by DECISION 15's "the guarantee stays
structural". Corrected cites only:

- The guarantee is a byte property of a zip: `applyOfficeSections` re-serialises
  the same `JSZip` object and calls `zip.file(name, xml)` only for slides it
  touched - **`src/lib/office-edit.ts:452`**, not `:454`.
  `grep -n "if (touched) zip.file" src/lib/office-edit.ts` returns `452` and
  `654`; canary `grep -c "zip.file" src/lib/office-edit.ts` -> 23. Revision 1
  cited `:454` three times (in its 3.3, 4.1 and 8.1) as the location of the
  guarantee the whole design rests on. `:654` is the second in-place pptx writer,
  `setOfficeImageAlt` (defined at `office-edit.ts:622`, its own touched-only
  write at `:654`), which revision 1 did not mention at all.
- (c)'s in-tree ancestor is `SlideRoleDef` at `src/lib/decks/types.ts:152-160`,
  whose `promptContract` field is `:156`, and `SLIDE_ROLES` at `:162`.
  `SlideRole` itself is the string union at `:145-150`. Revision 1 cited
  `:145-159` for the interface.
- (b) is rejected for the template guarantee on the three grounds revision 1
  gave, all of which re-verify. The model emits JSON, not OOXML
  (`generate.ts:118` "Return ONLY valid JSON"); the one repair loop that exists
  is a content backfill (section 2.5); and a checked guarantee is falsifiable
  only where the checker looks - `docs/loop/leverage.md`'s
  `FORBIDDEN_PATH_PREFIXES` instance.

### 4.2 What the owner loses - CORRECTED, per RULING 52

Revision 1 wrote: conversational requests that change CONTENT - "more detail on
recursion", **"drop the case study"**, "aim this at first-years" - are
answerable. **"Drop the case study" is not a content change under this mechanism**
unless the rule below is enforced, because the natural expression of "drop it" is
an omitted section, and an omitted section deletes the owner's paragraph, which
changes the template, which DECISION 15 forbids.

**THE RULE, and it goes in verbatim because RULING 52 requires it:**

> **A dropped item is emitted as an EMPTY section, never an omitted one, and no
> operation may remove a `sourceId` from the section list.**

With that rule the guarantee is structural again: the section list's `sourceId`
set is an invariant of the pipeline, fixed by `parseOfficeParagraphs` and never
narrowed by anything the model says. Without it, the guarantee is checked - and
checked by nobody, because no test in revision 1 looked.

**This is the enforcement point DECISION 15 names.** It is not prose in section
9; it is constraint H2 in section 12 with its own instrument.

---

## 5. Q3 - what "smoothly upload and ask" costs, measured against A39

Counting unit is A39's, from `docs/a39-census.md:29-35`: one interaction is a
click, one field fill (focus + paste counts as ONE), one file-dialog round trip,
one list/dropdown selection, or one page/view transition. COLD is a first-ever
visit; WARM is a return, free wherever a `ta-` key persists the choice
(`:69-72`).

### 5.1 A declared departure from the unit, which revision 1 did not declare

By the letter of A39's unit, today's warm on path P is **2**, not 3, because
`ta-ppt-gen-subject` persists (`hooks.ts:126`). Revision 1 charged 1 for
re-typing a subject that differs per deck. **That judgement is right and it is a
departure from the borrowed unit, so it is declared here rather than left to be
discovered**: a persisted field whose VALUE must change for the act to be
different is charged, a persisted field whose value is reused is free. Under that
rule this section's numbers are not directly comparable to A39's table, and a
checker should not treat them as such.

### 5.2 Today's counts, at HEAD

| Path | Cold | Warm | Source supported? |
|---|---|---|---|
| **P PowerPoint Design** | 2 nav + 1 template pick + 1 subject + 1 loop items + 1 Generate + 1 Download = **7** without a source; **+1 file dialog, -1 subject** (subject derives, `index.tsx:414-416`) = **7** with one | subject-or-source + Generate + Download = **3** | **yes, since `4080c2e`** - wording only, section 0 |
| **M module deck capture** | **6** (the OS share picker counted as one file-dialog equivalent) | **4** | screen capture only; resolves a course |
| **W workflow step** | not costed - bounded below by "select or build a workflow", the same ground on which A39 declines to cost its path I (`docs/a39-census.md:617-619`) | - | 7 source kinds, needs a course tile |

### 5.3 The honest statement about click cost, per RULING 53

**Revision 1's target was 3 warm. Today's warm is 3. The design does not improve
the warm count, and revision 1 never said so.** It traded typing a subject for
picking a file.

Revision 1's only numeric argument tabled "this design (warm) = 3" against
"chat = 2 + S" and derived a crossover at S = 2. **Substitute today's surface and
the table is identical**, because today's warm is also 3. So that table benchmarks
the new design against a chat rather than against the surface it replaces, and
against the surface it replaces the delta is zero.

**Benchmarked against the surface being replaced**, which is what the row's
question actually needs:

| Quantity | Path P today | A43 as designed | Delta |
|---|---|---|---|
| Warm interactions per deck | 3 | 3 | **0** |
| Cold, first deck of a term | 7 | 7 + 1 (upload the template once) = **8** | **+1, once** |
| Template re-specification per later deck | n/a (the app's own preset) | 0 (`ta-ppt-template-file-id` persists) | 0 |
| Deck obeys the owner's own file | **no, at any cost** | **yes** | the whole point |

**So click cost is NOT what this design buys, and section 8 must not sell it as
such.** What it buys is the last row, which no number of clicks reaches. Revision
1's 8.4 already conceded click cost is not a categorical advantage; the defect
was that 5.3 was its only quantitative argument.

### 5.4 The design's own target, and what holds it there

Target: **warm interactions do not exceed TODAY's measured warm; cold rises by at
most one, once per term; ZERO prerequisites.** Stated that way rather than as
"warm is 3", which is already true and therefore unfalsifiable.

| # | Interaction | Warm cost | Why it is not more |
|---|---|---|---|
| 1 | Supply the source (file or pasted repo ref) | 1 | one control, already landed at `GeneratePanel.tsx:101-135`; `extractTextFromBuffer` (`src/lib/office-extract.ts:179`) dispatches on extension across 50 extensions (section 6) |
| 2 | Generate | 1 | - |
| 3 | Download | 1 | - |
| cold only | 2 nav clicks | 0 warm | `ta-active-tab` (`useAppNavigation.ts:392`), `ta-manual-view` (`:46`) |
| cold only | Upload the template once | 0 warm | new `ta-ppt-template-file-id`; a template is a term-long choice |
| Subject | 0 | derived - `deriveSubjectFromSource` at `index.tsx:414-416`, falling back to `selected.name` at `:419` | |
| Course | 0 | section 2.3 | |
| Format | 0 | one dialog, extension-dispatched | |

---

## 6. Q4 - where the source comes from, and whether the intake is reusable

### 6.1 The reusable intake exists, is the right one, and is now used

`src/lib/office-extract.ts:179` `extractTextFromBuffer(name, buffer)`:

- `TEXT_EXTENSIONS` - **39** entries.
  `sed -n '13,54p' src/lib/office-extract.ts | grep -cE '^\s*"[a-z0-9]+",?$'` -> 39.
- `DOCUMENT_EXTENSIONS` - **11** entries. Same form over `'55,68p'` -> 11.

**50 extensions**, covering the three the owner named by implication: a homework
`.docx`, chapter objectives in `.pdf`/`.docx`, and source files from a repo.
`office-extract.ts:9` restricts it to server code, so the browser posts base64 to
a server action - which `4080c2e` did:
`grep -n "export async function" src/app/actions/deck-source.ts` returns
`extractDeckSourceFileAction` at `:28` and `extractDeckSourceRepoAction` at
`:57`, in a 71-line `"use server"` file.

### 6.2 The repo case, and the second-spelling risk

`ingestRepoAction` (`src/app/actions/github.ts:258`) takes a bare `owner/name` or
a github.com URL and requires no course tile. `4080c2e` reused it rather than
writing a second repo intake, and paired it with the file input in one control
region - the shape `syllabus-adapt` already uses (a repo ref OR a zip, one
disabling the other).

Spelling count for "give me a source", re-measured at HEAD:
`grep -rln 'type="file"' --include=*.tsx src/ | wc -l` -> **34** (was 33 before
`4080c2e`; the new one is `GeneratePanel.tsx:113`), and
`grep -rn 'accept=' --include=*.tsx src/ | grep -i "pptx"` returns exactly one
line, `src/app/components/slide-studio/DeckModeSection.tsx:76`. **A43-T adds the
second `.pptx` accept in the app.** That is deliberate - `DeckModeSection`'s
upload feeds narration/video, a different feature - and it is the point at which
a third spelling would become the defect the row warns about.

### 6.3 What this design must NOT reuse

`gatherModuleMaterials` (`src/lib/workflows/registry-helpers.sources.ts:144`) -
its first parameter is a course tile, so reusing it imports the course
prerequisite this design exists to avoid. The right reuse is one level down:
`extractTextFromBuffer` for files, `ingestRepoAction` for repo refs. Both landed.

---

## 7. Q5 - what happens when the content does not fit the template

### 7.1 Today, FOUR silent truncations exist on the deck path, not three

Revision 1 named three and got T2's census one call site short. Re-measured:
`grep -rn "enforceTitleLength" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."`

| # | What is dropped | Citation | What the instructor sees |
|---|---|---|---|
| T1 | Bullets past the slide's cap | `src/lib/decks/generate.ts:250`, `:319` | **nothing.** No count, no log |
| T2a | Title text past 60 chars, LLM path | `enforceTitleLength` (`src/lib/slide-prompt.ts:515`), `SLIDE_TITLE_MAX_CHARS = 60` (`:38`); called at `generate.ts:463`, count logged at `generate.ts:465` | a console line only (`grep -n "console.error" src/lib/decks/generate.ts` -> `415`, `436`, `465`) |
| **T2b** | **Title text past 60 chars, SCAFFOLD path - the count is DISCARDED** | **`generate.ts:336`**, `slides: enforceTitleLength(propagateExampleCode(slides)).slides` - inside `scaffoldDeck`, the `provider === "embedded"` branch reached at `generate.ts:387-388`. Its own comment at `:332-335` says the scaffold "can exceed the cap with no model involved at all - the guard runs on this path for the same reason it runs on the LLM one" | **nothing at all.** Not even a console line: `.slides` is destructured and `shortened` is thrown away |
| T3 | Text longer than the shape it is drawn into | `src/lib/pptx.ts` has no overflow handling: `grep -niE "truncat\|overflow\|shrink\|autofit\|clip" src/lib/pptx.ts` exits 1, canary `grep -c "addText" src/lib/pptx.ts` -> 23. `grep -c 'valign' src/lib/pptx.ts` -> **15** (revision 1 said 10); `grep -c 'shrinkText'`, `'autoFit'`, `'fit:'` -> 0, 0, 0 | **nothing until PowerPoint opens it** |

The other two `enforceTitleLength` sites -
`src/app/actions/shared.ts:364` and
`src/app/actions/course-planning-grounding.ts:907` - are other surfaces and are
relocated debt, not this scope.

**T2a is the design precedent to copy; T1, T2b and T3 are the bugs not to
repeat.** `enforceTitleLength` counts, relocates rather than discards, and never
changes a title it cannot improve. What it lacks is a route to the screen - and
at `generate.ts:336` it does not even have a route to the console.

### 7.2 What an uploaded template adds

- **Text longer than a shape.** A `.pptx` shape has a fixed box. The writer
  replaces text runs; it does not measure. **There is no way to measure rendered
  text length in this environment** (`docs/loop/this-repo.md` section 6: nothing
  renders, no font metrics). So the instrument is a CHARACTER BUDGET derived from
  the template's OWN original text - the paragraph the owner wrote in that shape
  is a worked example of what fits. Budget = `k * len(original)` for a declared
  `k`. **This is a PROXY and every artifact must call it one** (RES-A43-3).
- **More sections than the template has slides.** Countable exactly:
  `parseOfficeParagraphs` gives the slide count, `expandTemplate` gives the
  required count.
- **A graphic with no home.** The `graphic` field renders via pptxgenjs shapes
  (`src/lib/pptx.ts:252-265`). A file-backed template declares no graphic area,
  so a graphic must be DROPPED - and dropping it silently is T1 again.

### 7.3 The requirement: a FIT REPORT

**Rendered next to the Download button, listing every adjustment by slide, before
the download, and counting zero as "nothing was cut".** Not a console line, not a
toast.

| Class | Reported as |
|---|---|
| Slide-count mismatch | after wave T3: "Your template has 12 slides; this deck needs 40. 28 slides were created by copying slide N." Before wave T3: a **REFUSAL** - "Your template has 12 slides and this deck needs 40. Pick a shorter shape or a longer template." |
| Text over a shape's character budget | "Slide 7, body: 340 characters placed into a shape whose original text was 120. It may overflow." - with the overflow also written to that slide's speaker notes, so nothing is lost |
| Bullets dropped (T1) | "Slide 3: 6 bullets generated, 4 placed, 2 moved to speaker notes" |
| Title shortened (T2a and T2b) | "Slide 5: title shortened from 78 to 60 characters; the rest moved to the first bullet" |
| Graphic dropped | "Slide 5: a table graphic was generated and this template declares no graphic area, so it was omitted" |
| A conversational operation refused (section 9) | "I cannot add a slide to an uploaded template yet - the writer can rewrite, clone or empty an existing slide's paragraphs but cannot create one." |

**DIRECTION OF FAILURE for the whole section: any adjustment that reaches the
downloaded file without a corresponding line in the fit report is a defect, and a
zero-adjustment deck must say so explicitly, because a blank report is
indistinguishable from a missing report.**

### 7.4 The slide-count constraint - the 79-82 figure is STRUCK, per RULING 53

Revision 1 argued the hard constraint against "the app's own worst case is 79-82
slides (`src/lib/slide-token-budget.ts`)". **That figure is withdrawn on two
grounds, and the real constraint is stronger.**

1. **It was inherited from a comment, not measured.**
   `grep -n "82 slides\|79 slides" src/lib/slide-token-budget.ts` -> `:30` and
   `:69`, both inside a header comment deriving a token budget.
2. **It belongs to a different pipeline.** Those lines derive
   `SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS` (`slide-token-budget.ts:86`), and
   `grep -rn "SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."`
   returns one consuming file: `src/app/actions/course-planning-grounding.ts:37`
   (import) and `:778` (use). That is the course-planning/schedule path.
   `sed -n '1,12p' src/lib/decks/generate.ts` shows the deck core imports
   `SLIDE_DECK_JSON_SHAPE`, `SLIDE_TITLE_MAX_CHARS` and `enforceTitleLength` from
   `slide-prompt.ts`, and **nothing at all** from `slide-token-budget.ts`.

**The real constraint, re-measured: the required slide count is UNBOUNDED by
construction on the path being built.** Loop items come from a newline-split
textarea (`index.tsx:404-407`) and nothing caps them:

```
grep -nE "slice\(0,|MAX_|limit" src/app/components/ppt-design/hooks.ts        -> exit 1
grep -nE "slice\(0,|MAX_|limit" src/app/components/ppt-design/GeneratePanel.tsx -> exit 1
grep -nE "slice\(0,|MAX_|limit" src/app/components/ppt-design/index.tsx        -> exit 1
canary: grep -c "const" on the three                                          -> 25 / 6 / 96
```

So a template with N slides plus a loop the instructor pasted 200 lines into is a
refusal-or-clone question with no ceiling to hide behind. **The conclusion
survives - wave T3 is not optional - and the evidence for it is now the right
evidence.**

`applyOfficeSections` can rewrite, clone in place, or delete a paragraph and
**cannot add a slide** (`office-edit.ts:383-392`; the only append helper is
`appendDocxParagraph` at `:464`, docx-only). This is not an inference:
`src/lib/office-edit.test.ts:126-154` hands it an append-shaped section with
`sourceId: "s99_p99"` - an id that exists nowhere - and asserts the output slide
count is unchanged at 1 and the reparsed text is unchanged. **It does not throw.
Today's answer to "add a slide" is measured silence.**

---

## 8. Q6 - the leverage claim, argued against the mechanism

Per `docs/loop/leverage.md`: a claim names a mechanism, and a class is EARNED only
if the feature had to build something to get it - tested by counting how many
comparable modules already carry the mechanism (failure mode B).

### 8.1 GUARANTEED - EARNED, on a NARROWER denominator than revision 1 claimed

**RULING 50 requires this restated honestly, and here it is.**

**Claim.** A chat can draft slide text and can be handed a template to imitate.
It cannot make the OUTPUT FILE be the owner's file. A43-T makes the output file
the owner's uploaded `.pptx` by construction: the model's response never touches
the zip, and every part of the presentation other than the text runs the writer
rewrote is carried through byte-for-byte (`office-edit.ts:383-392`, `:452`).

**WHAT REVISION 1 CLAIMED AND WHY IT WAS FALSE.** Revision 1's failure-mode-B
count was "exactly TWO places" call `applyOfficeSections` for a user-supplied
file, "and in both the source is a Canvas-hosted document being edited in place -
never a template a generator fills". The census is five, in four files
(section 3.2), and one of the five - `syllabus-templates.ts:267` - **is precisely
a template a generator fills**. The sentence was wrong twice and the conclusion
built on it ("so the class is not free here") did not follow.

**THE HONEST DENOMINATOR: zero of the FOUR DECK PATHS do this.** Paths P, W, M
and L (section 2) all construct a presentation with `buildSlidesPptx`
(`pptx.ts:215`, the app's only presentation constructor) and none of them applies
a user-supplied file as the template. That is 0 of 4, which is nowhere near "all
of them", so **GUARANTEED is still EARNED** - as a port into a family that lacks
it, not as an invention.

**What is NOT claimed, and revision 1 implied it:** that nothing in this app
places model output into an owner-uploaded Office file. It does, for `.docx`,
shipped and reached from four call sites (section 3.2). A43-T's earned claim is
scoped to decks.

**Removal test, with the deletion named, using the instrument from section 3.5.**
Delete the `applyOfficeSections` call in the new deck writer and hand the model's
slides to `buildSlidesPptx` instead. The assertion whose observed value changes:
the XML-substring reconstruction of `office-edit.test.ts:93-106`, applied
per-slide to a synthetic template - it cannot even be attempted, because
`buildSlidesPptx` produces a zip with an entirely different part list and no
original slide XML to reconstruct from. **Buildable in THIS checkout**: the
guarantee is a byte property of a zip, `jszip` runs under node, vitest is
node-env. Nothing needs to render. That is the single most important thing this
design has going for it, and it is now instrumented with a test that can fail on
the defect it names.

### 8.2 CORPUS - EARNED, thin

**Claim.** The template is uploaded once and read back on every later deck for the
whole term; a chat must be re-handed the file in every new conversation.

**Mechanism.** A `deck_template_files` row plus `ta-ppt-template-file-id`; the
read-back is the later generate. Modelled on `syllabus_templates`
(`supabase/migrations/20260709000000_create_syllabus_templates.sql`).

**Honest limit.** Per `leverage.md`'s struck "Persistence (generic)" row - 262
files import a Supabase client - merely writing a row is free here. This earns
CORPUS only because of the READ-BACK on a later act, and its removal test is the
weaker kind. Second claim, not the headline.

### 8.3 SCALE - CONCEDED, it is CORPUS again

`leverage.md`'s SCALE exemplar (`src/lib/grade/engine.ts:113-134`) pins one
rubric/criteria pair and loops it over a batch as ONE unit. Nothing in this design
batches; each deck is one act. **Conceded.** It becomes SCALE only if a later row
runs one template over N modules in one act, which
`generate-presentation-from-template` is the natural home for and which is not in
this scope.

### 8.4 What is CONVENIENCE and must be conceded

- **A43-S has no leverage claim of its own under branch KEEP TYPING.** It is a
  click-cost saving layered on A43-T's GUARANTEED claim. Under branch DERIVE it
  gets one, argued at build time against the pre-pass that produces the topic
  list. **Stated here so that whichever branch lands, nobody credits A43-S with
  a mechanism it does not have** - `leverage.md`'s one illegal answer is silence.
- **Provenance** (which template version produced this deck). Real, worth
  building as one `template_file_id` + `template_sha256` on the saved deck row,
  worth one sentence and not a leverage claim: per `leverage.md`'s struck
  "Persistence (generic)" row a stamped column is free here. The row suggests it
  (`docs/backlog.yml:648`, the `note:` field). A3 is being redesigned around the
  provenance class; this must not duplicate its argument. RES-A43-9.
- **Click cost.** Zero delta on warm (section 5.3). Name it as click cost or not
  at all - and here the honest answer is "not at all".
- **Everything about how the deck LOOKS.** Nothing renders here. No claim.

### 8.5 What must NOT be claimed

Memory beyond the one read-back in 8.2 (a research pass falsified a broader
memory claim). LMS write-back - not in scope and falsified as a claim.

---

## 9. A43-C: the conversational ask. IN SCOPE, and the fork is DECIDED

DECISION 15 keeps A43-C in the row and leaves the scope to settle whether the
conversational layer is a general tool-calling mechanism or a deck-specific
operation set.

### 9.1 RULED: a deck-specific operation set. Not general tool calling

**Adopted per RULING 54.** Grounds, measured rather than preferred:

1. **There is nothing partial to extend.** Zero function-calling constructs
   repo-wide:
   ```
   grep -rniE "functionDeclarations|function_declarations|functionCall|function_call|toolConfig|tool_config" \
     --include=*.ts --include=*.tsx src/          -> exit 1
   canary: grep -rniE "google_search" --include=*.ts --include=*.tsx src/ | wc -l  -> 1
   ```
   `grep -n "tools:" src/lib/llm.ts` returns exactly one line, `:519`
   `? { tools: [{ google_search: {} }] }` - Google search grounding, not app
   tools.
2. **A general dispatcher would own provider differences at a shared seam.**
   `grep -rn "callLlm(" --include=*.ts --include=*.tsx src/ | grep -v "\.test\." | wc -l`
   -> **127 lines**. A seam every later wave is built against is what
   `docs/DEV_LOOP.md` routes to `loop-top`, not to a deck row.
3. **DECISION 15's own test makes the deck set closed by construction.** "If an
   operation cannot be expressed as content, it is not an operation." A general
   mechanism's value is that it is OPEN, which is the opposite property - so the
   general one would need a second, deck-specific allowlist inside it anyway.
4. **Continuity with a shipped pattern.** A closed model-facing vocabulary with
   defensive coercion at the boundary exists twice already:
   `coerceSlideGraphic` (`src/lib/slide-graphics.ts:208-221`) and
   `SlideRoleDef.promptContract` (`src/lib/decks/types.ts:156`).
5. **The cost of being wrong is bounded and already accepted** by DECISION 15:
   one re-implementation the next time this need appears.

### 9.2 The operation set, closed and enumerated

Each row passes DECISION 15's test: it changes CONTENT only, and it is expressible
as a transformation of the `sections` array WITHOUT changing the set of
`sourceId`s in it. **An operation that cannot be expressed that way is not in the
set and must be refused with a reason.**

| Operation | What it does to the deck | How it is expressed in `sections` |
|---|---|---|
| `expand` | more detail on one slide's topic | replaces the `spans` of the paragraphs belonging to that slide |
| `condense` | less detail on one slide | same, shorter text |
| `retarget` | re-aim the whole deck at an audience | re-generates `spans` for every content paragraph; `sourceId` set unchanged |
| `retitle` | change one slide's title | replaces the title paragraph's `spans` |
| `drop` | remove an item's content | **emits an EMPTY section for every paragraph of that slide - never an omitted one** (H2, section 4.2) |
| `reorder` | change the sequence of loop-item content | permutes which generated content lands on which `sourceId`; the `sourceId` list itself is untouched |
| `setCode` / `clearCode` | add or remove a code block's text | replaces `spans` on the code paragraph |

### 9.3 The three operations that must REFUSE, with their reasons

| Asked for | Why it refuses | The reason the user is shown |
|---|---|---|
| **"add a slide about X"** | The writer cannot add a slide. **Proven, not assumed**: `src/lib/office-edit.test.ts:126-154` shows an append-shaped section is INERT - no throw, slide count unchanged, reparsed text unchanged. Today's answer is measured silence, which is the worst outcome section 7 names | "I cannot add a slide to an uploaded template yet. Your template has N slides and that is what this deck has. Pick a longer template, or a shape with fewer slides." Blocked on wave T3 and must say so |
| **"put this on two columns" / "use the dark variant of slide 3"** | Layout, not content. DECISION 15: a request may not reach the writer, the template or the layout | "That changes the layout of your template, and this feature is built so the model can never do that. Change it in PowerPoint and re-upload." |
| **"delete slide 4"** | Deleting a slide means removing its `sourceId`s, which H2 forbids | "I can empty a slide's content, but I cannot remove a slide from your template." - and `drop` is offered as the thing it can do |

### 9.4 The dispatcher, and what it must NOT copy

A validating dispatcher over the closed set above. **It copies the SHAPE of
`coerceSlideGraphic` - a switch over a closed vocabulary - and explicitly NOT its
`default: return undefined`.** A malformed decorative graphic degrading to no
graphic is correct; an operation the instructor asked for out loud degrading to
nothing is the T1/T3 silent-truncation defect this row has now documented four
times.

**Constraint H3 (section 12): an unrecognised operation, or a recognised one whose
schema does not validate, produces a REFUSAL WITH A REASON in the fit report. It
never returns silently and it never falls through to a no-op.**

Schema per operation, validated at the boundary, with the `sourceId` set of the
input compared to the `sourceId` set of the output on every dispatch - that
comparison IS H2's instrument.

### 9.5 The sequencing DECISION 15 mandates

**The template half ships FIRST and completely.** Waves T1-T3 and F1 before waves
C1-C3 (section 11). Building them in the other order means a conversational editor
with nothing trustworthy to edit. This is sequencing, not scope: A43 cannot close
until A43-C ships.

---

## 10. What can and cannot be verified in this environment

Per `docs/loop/this-repo.md` section 6.

### 10.1 CAN be verified here

- **The byte guarantee** (8.1). `jszip` runs under node; vitest is
  `environment: "node"`. Two zips, diffed by entry, plus the per-slide
  XML-substring reconstruction of section 3.5. No network, no key, no render.
- **H1 and H2 as set comparisons.** `sections.length` against
  `paragraphs.length`, and the `sourceId` set before and after every operation.
  Pure.
- **The fit report's arithmetic.** Counts and character budgets are pure.
- **Reachability**, by source-text test. Re-measured at HEAD:
  `find src -name "*.wiring.test.ts" | wc -l` -> **77**;
  `find src -name "*.structure.test.ts" | wc -l` -> **22**. (`this-repo.md` says
  68 and 17 and tells the reader to re-measure; these are this pass's numbers.)
- **Fixture construction.** No `.pptx` is tracked
  (`git ls-files | grep -icE "\.(pptx|potx|docx|thmx)$"` -> 0, canary
  `\.sql$` -> 109), so every test BUILDS one with `jszip` in the test body, the
  way `office-edit.test.ts` already does. That is a real obligation:
  RES-A43-2.

### 10.2 CANNOT be verified here

- **Whether the produced file opens in PowerPoint.** Owner verification.
- **Whether text overflows a shape.** No font metrics, no layout engine, nothing
  renders. The character budget is a PROXY (RES-A43-3).
- **Whether the owner's actual template parses.** The MECHANISM is now known -
  `office-edit.test.ts:156-176` proves a pptx-shaped file with zero
  `ppt/slides/` entries parses to `[]` rather than throwing, i.e. reachable and
  SILENT - but whether the owner's file has that shape is owner-only
  (RES-A43-4).
- **Any model output.** No API key; `vitest.setup.ts` throws on real `fetch`.
- **Any claim about the new controls' appearance, focus order or keyboard
  behaviour.** Reading claims only. No component is rendered by any test.
- **RLS on the new table.** No live database, no local migration apply.

---

## 11. Wave plan

Waves are renamed from revision 1's 1-5 because the set changed: wave 1 has
landed, wave 2's module is now an extraction, and wave 5 is in scope and
designed. Every wave's list contains the file that CALLS or RENDERS the new
capability.

**Line budgets, which revision 1 omitted entirely (check finding m6).**
`grep -n "LIMIT = 1000" src/file-size-ceiling.structure.test.ts` -> `:41`, and
`grep -n "ppt-design\|GeneratePanel" src/file-size-ceiling.structure.test.ts`
exits 1 (canary: `grep -c "maxLines"` -> 8 `ALLOWED_OVERAGE` entries), so neither
ppt-design file is ratcheted and both may grow to the ceiling. Headroom at HEAD,
`git show HEAD:<path> | wc -l`:

| File | Now | Headroom to 1000 | Waves that write it | Budget per wave |
|---|---|---|---|---|
| `ppt-design/index.tsx` | **681** | 319 | T1, F1, C2 | **+90 each.** A wave that needs more extracts first |
| `ppt-design/GeneratePanel.tsx` | **481** | 519 | T3, F1, C2 | **+150 each** |
| `ppt-design/TemplateSelector.tsx` | 154 | 846 | T1 | +250 |
| `ppt-design/hooks.ts` | 172 | 828 | T1, C2 | +150 each |

`wc -l` is the Bash instrument; the mandated PowerShell instrument is
`@(Get-Content <file>).Count`, and the two disagree by 15 to 138 on the files
where they disagree at all (`docs/loop/this-repo.md` section 3). **An implementer
re-measures with `@(Get-Content).Count` before trusting any headroom number
above.**

### 11.1 Wave S1 - LANDED at `4080c2e`

A43-S's wiring. Not re-scoped. See section 0 for why it may not be the whole of
A43-S.

### 11.2 Wave S2 - NOT DISPATCHABLE (section 0)

Exists only under branch DERIVE. A pre-pass that turns the normalised source into
loop items BEFORE `expandTemplate` - i.e. writing `ctx.loopItems` rather than
`ctx.materials`. Its write set would be a new pure module plus
`ppt-design/index.tsx` as the caller, plus whatever surface reviews the derived
list under C3-D. **Do not brief this wave until the fork in section 0 is
answered.**

### 11.3 Wave T1 - port the shipped `.docx` pipeline to `.pptx`, fixed length

| File | Role |
|---|---|
| `supabase/migrations/<ts>_create_deck_template_files.sql` | NEW table on the `syllabus_templates` shape (`20260709000000`), idempotent, owner-scoped RLS, lexically checked by `src/supabase-migrations.structure.test.ts` |
| `src/lib/decks/office-template-fill.ts` | NEW, and it is an **EXTRACTION, not an invention.** The pure middle of `syllabus-templates.ts:204-267`, generalised over `OfficeKind`: paragraphs in, a model content contract, one section per paragraph out. **Enforces H1 by construction** - it maps over `paragraphs`, never over replacements |
| `src/lib/decks/office-template-fill.test.ts` | NEW. Builds synthetic `.docx` AND `.pptx` fixtures with `jszip`. **The H1 sabotage lives here**: omit one section and watch the section-3.5 reconstruction go red |
| `src/app/actions/deck-template-files.ts` | NEW `"use server"`: upload / list / delete plus the fill call. Only async exports (`src/lib/use-server-exports.test.ts`). **Calls `requireUser()`, never `requireOwner()`** - `docs/backlog.yml:648` records that `4080c2e`'s first cut used the deprecated alias and row R2 exists to retire it |
| `src/lib/supabase/types.ts` | The new table's Row type. Map rows through an explicitly typed mapper - a typed select collapses to `never` here |
| `src/app/components/ppt-design/TemplateSelector.tsx` | **RENDERS** the template upload control and the uploaded-template list |
| `src/app/components/ppt-design/index.tsx` | **CALLER.** Routes a file-backed template to the new writer instead of `buildSlidesPptx` |
| `src/app/components/ppt-design/hooks.ts` | `ta-ppt-template-file-id` |

**Explicitly NOT in this wave's write set:** `src/lib/office-edit.ts` and
`src/app/actions/syllabus-templates.ts`. The extraction is a NEW module that
`syllabus-templates.ts` may adopt in a LATER chunk; making the shipped `.docx`
path call it in the same wave would put four production callers and three
workflow steps at risk for a feature none of them needs. That adoption is
RES-A43-13.

Gate: H1 and H2 (section 12), plus the byte-identity removal test of 8.1 watched
FAILING when the writer is swapped for `buildSlidesPptx`.

### 11.4 Wave T2 - the refusal path, before cloning exists

| File | Role |
|---|---|
| `src/lib/decks/fit-report.ts` + `.test.ts` | NEW. Pure. The counted classes of 7.3 plus the zero case. The slide-count class REFUSES here and reports a clone there |
| `src/lib/decks/office-template-fill.ts` | **CALLER** - emits the report alongside the buffer |
| `src/app/components/ppt-design/GeneratePanel.tsx` | **RENDERS** the refusal beside Generate |

A zero-slide template (the `.potx` shape) must REFUSE with a stated reason, never
accept silently - the mechanism is known (`office-edit.test.ts:156-176`) and the
refusal is this wave's.

### 11.5 Wave T3 - slide cloning

**Not optional** (section 7.4: the required slide count is unbounded).

| File | Role |
|---|---|
| `src/lib/decks/pptx-clone.ts` | NEW. Duplicate a slide part |
| `src/lib/decks/pptx-clone.test.ts` | NEW |
| `src/lib/decks/office-template-fill.ts` | **CALLER** |
| `src/app/components/ppt-design/GeneratePanel.tsx` | **RENDERS** the slide-count line of the fit report |

**CORRECTED per RULING 53: four of the five OOXML edits have a working in-tree
precedent, inside the one file no wave may touch. Only `sldIdLst` is new.**
Revision 1 asserted "Nothing in the tree does any of this (canaried)", and its
needle `_rels/slide` could not match the spelling this repo uses.

```
grep -rn "_rels" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."
  office-edit.ts:594, 614, 677, 711, 714
grep -rn "Content_Types" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."
  office-edit.ts:677, 704, 707
grep -rniE "sldIdLst|appendPptx|addSlideXml|cloneSlide" --include=*.ts --include=*.tsx src/
  -> exit 1
canary: grep -rn "sortedSlides" --include=*.ts src/ | wc -l -> 9
grep -rn "presentation\.xml" --include=*.ts --include=*.tsx src/ -> exit 1
canary: grep -rn "ppt/slides" --include=*.ts --include=*.tsx src/ | wc -l -> 12
```

| Edit | Precedent | Nature |
|---|---|---|
| a new `ppt/slides/slideN.xml` part | `setDocxTitle` (`office-edit.ts:679-724`) creates a new zip part; `applyOfficeSections` writes slide parts at `:452` | WRITE. Real precedent |
| `ppt/slides/_rels/slideN.xml.rels` | `office-edit.ts:614` builds that exact path from a slide name (`slide.name.replace(/slides\/(slide\d+)\.xml$/, "slides/_rels/$1.xml.rels")`) and reads it at `:615`; `embedTarget` + `resolveZipPath` resolve a relationship target out of it at `:617` | READ. The path construction and the rels grammar are proven; writing one is new |
| a new `<Relationship>` in `ppt/_rels/presentation.xml.rels` | `:711-714` appends a `<Relationship .../>` to `_rels/.rels` by string-replacing `</Relationships>` | WRITE, on a different rels file. Real precedent |
| an `<Override>` in `[Content_Types].xml` | `:704-707` registers `<Override PartName="/docProps/core.xml" ContentType="..."/>`, guarded by an `includes` check so it is idempotent | WRITE. Real precedent |
| a `<p:sldId>` in `ppt/presentation.xml`'s `sldIdLst` | **none** | **GENUINELY NEW** |

**Consequence for the wave: the cost estimate is lower than revision 1's and the
reuse survey is different.** Section 10's rule that no wave may touch
`office-edit.ts` still stands, so wave T3 REIMPLEMENTS four idioms it may not
import. That duplication is deliberate and it is RES-A43-14 - the alternative is
a change inside `office-edit.ts`, which ripples into three Canvas features
(`canvas-modules/office.ts`, `office-accessibility.ts`, `media.ts`) and two
syllabus actions.

### 11.6 Wave F1 - the fit report reaches the screen, and T2b stops being silent

| File | Role |
|---|---|
| `src/lib/decks/fit-report.ts` | extended with the bullet, title and graphic classes |
| `src/app/components/ppt-design/GeneratePanel.tsx` | **RENDERS** it beside Download |
| `src/app/components/ppt-design/index.tsx` | **CALLER** - threads it through |
| `src/lib/decks/generate.ts` | Route `enforceTitleLength`'s `shortened` count into the returned value on BOTH paths: `:463-468` (today a `console.error` at `:465`) **and `:336`, where the count is discarded with no console line at all** |

### 11.7 Waves C1-C3 - A43-C, the conversational layer

Sequenced after the template half, per 9.5.

- **C1**: `src/lib/decks/deck-operations.ts` + `.test.ts`. NEW, pure. The closed
  operation set (9.2), a schema per operation, the validating dispatcher (9.4),
  and the refusal reasons (9.3). **H2's `sourceId`-set comparison is asserted
  here, and sabotaged by an operation that drops one.**
- **C2**: the surface. `ppt-design/index.tsx` (**CALLER**),
  `GeneratePanel.tsx` (**RENDERS** the ask box and the refusals),
  `hooks.ts` (persist the last ask). **Must add no required step, no mode switch
  and no prerequisite** (DECISION 15).
- **C3**: the model boundary. Whatever `callLlm` wrapper turns an instructor's
  sentence into a validated operation. **This wave does NOT add tool calling to
  `src/lib/llm.ts`** - the operation is parsed out of a JSON response against the
  C1 schemas, the same shape `coerceSlideGraphic` already uses. Touching
  `llm.ts`'s single `tools:` site at `:519` is out of scope for this row.

### 11.8 Structural notes

- `src/app/components/slide-studio/DeckModeSection.tsx` (261 lines) owns the only
  other `.pptx` input (`:76`). NOT in any wave's write set: its upload feeds
  narration/video.
- **No wave touches `src/lib/office-edit.ts`.** Wave T1 adds a second test file
  beside `office-edit.test.ts`; a behaviour change in the module itself ripples
  into five production callers in four files (section 3.2).
- Concurrency: `npx tsc --noEmit` is not concurrency-safe
  (`docs/loop/this-repo.md` section 2); exactly one caller runs it and it is the
  wave gate.
- Multi-file test runs use `npm run test:paths -- <p1> <p2> ...`, never a raw
  multi-path `vitest run`, which silently drops unmatched arguments and exits 0.

---

## 12. Acceptance constraints

Each names the **object** under comparison, the **instrument** producing each
quantity in it, and the **direction of failure**.

### 12.1 Constraints that hold under BOTH owner answers

| id | Constraint | Object | Instrument | FAILS if |
|---|---|---|---|---|
| **H1** | The `sections` array has one entry per parsed paragraph, always (section 3.4) | `sections.length` from the fill module against `paragraphs.length` from `parseOfficeParagraphs`, on the same synthetic fixture | A unit test in `office-template-fill.test.ts`, run as `npm run test:paths -- src/lib/decks/office-template-fill.test.ts src/lib/office-edit.test.ts` | the two lengths differ for any input, **or** the test passes when one section is deliberately omitted. The second half is the sabotage and it is mandatory |
| **H2** | A dropped item is emitted as an EMPTY section, never an omitted one, and no operation may remove a `sourceId` from the section list (section 4.2, verbatim per RULING 52) | the `sourceId` SET of the input section list against the `sourceId` SET of the output, per operation | a unit test in `deck-operations.test.ts` asserting set equality across every operation in 9.2, run as `npm run test:paths -- src/lib/decks/deck-operations.test.ts src/lib/decks/office-template-fill.test.ts` | the output set is not equal to the input set for any operation, **or** the assertion still passes when `drop` is changed to omit instead of empty |
| **H3** | An unrecognised or schema-invalid operation refuses with a reason; it never no-ops (section 9.4) | the dispatcher's return value for an unknown operation name against the set of refusal reasons | a unit test in `deck-operations.test.ts` | the dispatcher returns `undefined`, an unchanged deck, or any value that does not carry a reason string |
| **H4** | An append-shaped request refuses with a reason naming wave T3 (section 9.3) | the dispatcher's refusal reason for "add a slide" against the required text | a unit test in `deck-operations.test.ts`, plus the existing pin at `src/lib/office-edit.test.ts:126-154` | the request is accepted, **or** it is rejected with no reason, **or** it reaches `applyOfficeSections` at all (where it is inert, i.e. silent) |
| **C1** | A deck generates with **no course selected** | the set of course-shaped identifiers (`hubCourse`, `courseId`, `canvasUrl`, `resolveLmsCourseRow`) across **every file in the wave's write set**, not one file | `grep -rniE "hubCourse\|courseId\|canvasUrl\|resolveLmsCourseRow" <each file in the write set>`, exit 1 required on each, with a canary per file proving the command fires | any new code path reads a course identifier. **Re-instrumented from revision 1**, whose version was satisfied while `SlidesPanel.tsx:156` shipped the string "You will pick a course when you generate." - an absence claim about a SURFACE measured on one FILE |
| **C2** | Generate succeeds with **no subject typed** | the Generate button's `disabled` expression against the set of state variables it reads | read `GeneratePanel.tsx`'s Generate `disabled` prop; at HEAD it is `:260` `disabled={generateBusy}` | the expression references subject, source, or template state |
| **C4** | The template choice persists | the interaction count for a SECOND deck in the same term against the count for the first | owner verification in a real browser, since nothing renders under vitest; plus a source-text assertion that `ta-ppt-template-file-id` is read at mount | a second deck costs a template interaction |
| **C5** | Warm interactions do not exceed **today's measured warm**, and cold rises by at most one, once per term | the observed act count on the built surface against section 5.2's table for path P | owner verification, walking path P cold and warm (RES-A43-10) | warm exceeds today's measured warm. **Re-stated from revision 1's "warm is 3", which is already true and so cannot fail** |
| **C6** | Every adjustment that reaches the file has a fit-report line, and zero adjustments says so (section 7.3) | the count of adjustments the fill module made against the count of lines in the report | a unit test over `fit-report.ts` with a deck that triggers each of the six classes, and one that triggers none | any adjustment has no line, **or** the zero case renders an empty region rather than an explicit "nothing was cut" |

### 12.2 The constraint that depends on the owner answer

**Exactly ONE of these is handed to an implementer. Do not brief both.**

| id | Branch | Constraint | Object | Instrument | FAILS if |
|---|---|---|---|---|---|
| **C3** | KEEP TYPING | The source control is **one** interaction, not a kind selector plus an input | the count of inputs on the new panel whose value the user must set before Generate | reading `GeneratePanel.tsx`; no test can see this, since nothing renders | the panel renders more than one input the user must set. **Known weakness, recorded rather than hidden: this is satisfied by a surface with ZERO required inputs and also by one with a concepts textarea, so it does not discriminate the thing section 0 is about.** It is a real constraint on the SOURCE control and nothing more |
| **C3-D** | DERIVE | One control to SUPPLY a source, plus at most one REVIEW surface prefilled from it | the count of REQUIRED inputs (must be 0 before Generate) and the count of REVIEW surfaces (must be at most 1) | reading `GeneratePanel.tsx` plus a source-text assertion that the derived list is seeded from the source and is editable | any input is required before Generate, **or** more than one review surface appears, **or** the derived list is read-only (the instructor cannot correct a wrong derivation), **or** the instructor must touch it for Generate to work |

---

## 13. Disposition of revision 1

Every requirement revision 1 stated, mapped to **kept** (with its id here),
**handed over** (naming the receiver and the obligation), or **withdrawn** (with
the reason and any enforcer it protected). Nothing in revision 1 is left
unaccounted for.

| Revision 1 item | Disposition | Detail |
|---|---|---|
| C1 - no course | **KEPT, re-instrumented** as C1 (12.1) | Old instrument scanned one file; new one scans the whole write set with a per-file canary |
| C2 - no subject | **KEPT** as C2 (12.1) | Satisfied at HEAD, measured at `GeneratePanel.tsx:260` |
| C3 - one interaction | **SPLIT and NOT DISPATCHABLE** as C3 / C3-D (12.2) | Which one lands is the owner fork. Its known weakness is now recorded on the constraint itself |
| C4 - template persists | **KEPT** as C4 (12.1) | Unchanged |
| Q1 recommendation: `.pptx` read with jszip + the `office-edit.ts` idiom | **KEPT as a FINDING, withdrawn as a recommendation** (3.1) | It was a description of a shipped pipeline, not a choice. No enforcer lost |
| Q1: "the format question is genuinely open" | **WITHDRAWN** (3.1, RULING 50) | The tree answered it for `.docx` in shipped code. Protected no enforcer |
| Q2 ruling: shape (a) with (c) | **KEPT** (4.1) | Reaffirmed by DECISION 15. Cites corrected (`:452` not `:454`; `types.ts:152-160`) |
| Q2's worked example "drop the case study" as a safe CONTENT request | **WITHDRAWN and REPLACED by H2** (4.2, RULING 52) | It mutated the thing the guarantee protects. H2 is the enforcer it needed and did not have |
| Section 3.5's 79-82 slide figure | **WITHDRAWN** (7.4, RULING 53) | Inherited from a comment on the course-planning pipeline. Replaced by a stronger measured constraint: loop items are uncapped. The conclusion (wave T3 is not optional) is kept |
| Section 5.3's chat-crossover table | **WITHDRAWN as the design's argument** (5.3) | It benchmarks against a chat, not against path P, and against path P the warm delta is zero. Replaced by the table in 5.3 |
| Section 5.4's "3 warm" target | **REDUCED to C5** (12.1) | "Warm does not exceed today's measured warm", which can fail |
| Section 8.1's failure-mode-B count of TWO | **WITHDRAWN** (8.1, RULING 50) | The census is five in four files and one is the exact mechanism. GUARANTEED is kept on the denominator "zero of the four deck paths" |
| Section 8.1's byte-identity removal test (non-slide entries) | **WITHDRAWN as the instrument, KEPT as the claim** (3.5, 8.1, RULING 51) | Measured blind to the defect it is named for. Replaced by the XML-substring reconstruction of `office-edit.test.ts:93-106` |
| Section 8.2 CORPUS, 8.3 SCALE conceded, 8.4 CONVENIENCE, 8.5 not-claimed | **KEPT** (8.2-8.5) | 8.4 gains the A43-S sentence per branch |
| Wave 1 (A43-S wiring) | **LANDED** at `4080c2e` (11.1) | Not re-scoped, per RULING 49 |
| Wave 2's `src/lib/decks/pptx-template.ts` as a NEW module | **WITHDRAWN** (11.3, RULING 50) | Replaced by `src/lib/decks/office-template-fill.ts`, an EXTRACTION of `syllabus-templates.ts:204-267` generalised over `OfficeKind` |
| Wave 2's `src/lib/office-edit.pptx.test.ts` | **WITHDRAWN as scoped, DISCHARGED better** | `8301129` landed `src/lib/office-edit.test.ts` (177 lines, 5 assertions) using the STRONGER instrument. Wave T1's test file covers the new module instead |
| Wave 3's "nothing in the tree does any of this" | **WITHDRAWN** (11.5, RULING 53) | Four of five edits have precedent; only `sldIdLst` is new. The wave is kept |
| Wave 4 (fit report) | **KEPT and SPLIT** as T2 (the refusal) and F1 (the full report) | The refusal must exist before cloning does |
| Wave 5 (A43-C recommended OUT) | **WITHDRAWN, overridden by DECISION 15** | Replaced by section 9 and waves C1-C3 |
| Section 10's "no wave touches `office-edit.ts`" | **KEPT** (11.8), with the undercount fixed | Revision 1 said three Canvas features; it is five production callers in four files, and `setOfficeImageAlt` (`:622`, touched-only write at `:654`) is a second in-place pptx writer revision 1 never mentioned |
| RES-A43-1 (`office-edit.ts` untested) | **CLOSED** by `8301129` | `git ls-files \| grep -c "office-edit.*test"` -> 1 |
| RES-A43-2 (no fixture) | **KEPT** |
| RES-A43-3 (overflow is a proxy) | **KEPT** |
| RES-A43-4 (`.potx` zero slides) | **NARROWED.** Its "unverifiable here" clause is **WITHDRAWN** | `office-edit.test.ts:156-176` proved the mechanism: reachable and SILENT. Only the owner's own file remains owner-only |
| RES-A43-5 (cloning does not exist) | **KEPT**, with its 79-82 justification replaced by 7.4's |
| RES-A43-6 (T1 bullets) | **KEPT** |
| RES-A43-7 (T2 count reaches only the console) | **KEPT, instrument REPLACED** | Revision 1's instrument was `grep -n "console.error" generate.ts`, which reports clean on `:336` where there IS no console line - satisfied vacuously by the worst instance |
| RES-A43-8 (A43-C deferred, needs an owner answer) | **SUPERSEDED by DECISION 15** | No longer a residual. It is the row's closing condition, and what needs recording is section 9's design, now in the document |
| RES-A43-9 (provenance) | **KEPT**, with a re-check step added for A3's in-flight provenance work |
| RES-A43-10 (interaction counts are reading claims) | **KEPT**, with its direction of failure corrected to "exceeds TODAY's measured warm" |

---

## 14. Residual register

Each entry names an OWNER, an INSTRUMENT, the OBJECT under comparison, the
DIRECTION OF FAILURE, and the STEP. Per `docs/DEV_LOOP.md` step 0, **a residual
that is not in `docs/BACKLOG.md` does not exist**, so each of these is owed a
backlog entry by whoever lands the first A43-T chunk. **This pass did not write
them there: `docs/backlog.yml` and `docs/BACKLOG.md` are outside its write set.**

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-A43-2 | **No `.pptx` fixture is tracked** (`git ls-files \| grep -icE "\.(pptx\|potx\|docx\|thmx)$"` -> 0, canary `\.sql$` -> 109), so every test builds its own with `jszip`. A synthetic fixture that does not match PowerPoint's real part layout makes a green suite meaningless. | The wave-T1 implementer, then the repo owner. | The fixture builder in `office-template-fill.test.ts`, plus the owner opening one produced file in PowerPoint. | Object: the synthetic fixture's part list against a real PowerPoint export's. **FAILS if PowerPoint refuses the produced file while every test is green.** | Wave T1 authors the builder; owner verification confirms one real round trip. |
| RES-A43-3 | **Text-overflow detection is a character-count PROXY, not a measurement.** Nothing renders here and there are no font metrics; `src/lib/pptx.ts` sets no `fit`/`shrinkText`/`autoFit` (`grep -niE "truncat\|overflow\|shrink\|autofit\|clip" src/lib/pptx.ts` exits 1, canary `grep -c "addText"` -> 23). | The repo owner. | Generate one deck whose body text is 3x the template's own paragraph length and open it in PowerPoint. | Object: the fit report's "may overflow" lines against what PowerPoint actually shows. **FAILS if text overflows a shape with no report line, or a report line fires on text that fits comfortably.** | Owner verification, after wave F1. |
| RES-A43-4 | **A `.potx` may contain zero `ppt/slides/` entries**, and the read path is reachable and SILENT rather than throwing - proven by `src/lib/office-edit.test.ts:156-176`, which builds a slide-less pptx and asserts `parseOfficeParagraphs` returns `[]`. What remains owner-only is whether the owner's real file has that shape. | The repo owner. | Upload the owner's real template and read the reported slide count. | Object: the reported slide count against the count PowerPoint shows. **FAILS on a reported count of 0, and DOUBLE-FAILS if the UI accepts the upload without saying so.** | Before wave T2 is considered done. Wave T2 owns the refusal. |
| RES-A43-5 | **Slide cloning does not exist** (`grep -rniE "sldIdLst\|appendPptx\|addSlideXml\|cloneSlide" --include=*.ts --include=*.tsx src/` exits 1, canary `sortedSlides` -> 9), so before wave T3 a deck is capped at the template's slide count while the required count is **unbounded** - no cap exists on loop items anywhere on this surface (7.4, three greps at exit 1 with `const` canaries 25/6/96). | The wave-T3 implementer. | A unit test asserting the produced deck's slide count equals `expandTemplate`'s count, not the template's. | Object: produced slide count against required slide count. **FAILS whenever they differ AND the fit report does not say a refusal happened.** | Wave T3. Until then wave T2 must REFUSE a mismatch loudly. |
| RES-A43-6 | **T1: bullets past `maxBullets` are dropped with no count and no log** (`src/lib/decks/generate.ts:250`, `:319`). Pre-existing on every deck path, not created by A43. | The wave-F1 implementer. | A unit test over `toDeckSlide` with 6 bullets and `maxBullets` 4. | Object: the returned bullet count and the returned adjustment count. **RED on today's code, which returns 4 bullets and no count at all** - so it must be watched failing first. | Wave F1. |
| RES-A43-7 | **T2's `shortened` count reaches only the console on one of the two deck-path call sites, and is DISCARDED on the other.** `src/lib/decks/generate.ts:463-468` logs it at `:465`; **`generate.ts:336` destructures `.slides` and throws the count away with no console line at all.** | The wave-F1 implementer, for the ppt-design path only; `shared.ts:364` and `course-planning-grounding.ts:907` are other surfaces and are relocated debt. | An assertion that the value returned by BOTH `scaffoldDeck` (`generate.ts:288`) and the LLM path carries the shortened count, run as `npm run test:paths -- src/lib/decks/generate.test.ts src/lib/decks/fit-report.test.ts`. **NOT `grep -n "console.error" generate.ts`, which reports clean on `:336` precisely because there is no console line there** - revision 1's instrument was satisfied vacuously by the worst instance. | Object: the shortened count in the returned value against the count the guard computed, **on each of the two call sites separately**. **FAILS if either call site's count is absent from the returned value.** | Wave F1 for both deck-path sites. The other two: a backlog entry for whichever chunk next writes those files. |
| RES-A43-9 | **Provenance is scoped IN as one stamped column, not as a leverage claim** (8.4). It overlaps A3's provenance redesign, and A3-adjacent provenance work is in flight (`8a977b1`, plus `src/lib/grade/rubricProvenance.ts` and `src/lib/research/rubric-fingerprint.ts`). | The wave-T1 implementer, coordinating with whoever owns A3. | The saved deck row's `template_file_id` + `template_sha256`. **Plus a re-check step revision 1 lacked: before wave T1's migration is written, `git ls-files \| grep -iE "provenance\|fingerprint"` is re-run to see whether A3 has since shipped a shared provenance shape to adopt instead.** | Object: a saved deck row against the template file bytes it was built from. **FAILS if two different template files can produce rows indistinguishable in provenance, or if this row invents a second provenance shape beside A3's.** | Wave T1, same migration, after the re-check. |
| RES-A43-10 | **Every interaction count in section 5 is a reading claim**, traced from control to handler. Nothing renders under vitest. | The repo owner, in a real browser. | Walk path P cold and warm and count the acts against sections 5.2 and 5.4. | Object: the observed act count against the tabled count. **FAILS if warm for a second deck in the same term exceeds TODAY's measured warm** (3 at HEAD) - not "exceeds 3", which revision 1 wrote and which is already satisfied. | Owner verification, after wave T1. |
| RES-A43-11 | **The ppt-design surface ships copy promising a course it never asks for.** `SlidesPanel.tsx:156` renders "You will pick a course when you generate." and `:105` offers a "Course topics" menu item; `GeneratePanel.tsx:223` renders "Course topics not wired yet - type them here". All are pre-existing (`git show 4080c2e^:...` returns the same lines). C1 as revision 1 wrote it passed while these shipped. | Whichever A43 wave next writes `SlidesPanel.tsx` - **no current wave does**, so this is relocated debt, not A43-T's. | `grep -niE "you will pick a course" src/app/components/ppt-design/` -> must exit 1, canary `grep -c "MenuItem"` on the file. | Object: what the surface TELLS the user against what the surface DOES (it calls `requireUser()` only). **FAILS while the string ships on a surface that requires no course.** | A backlog entry now; fixed by the first wave that writes `SlidesPanel.tsx`, or by a one-line copy chunk, whichever comes first. |
| RES-A43-12 | **`src/lib/office-edit.test.ts`'s byte-identity fixture depends on a NON-CANONICAL attribute order and stops measuring anything without it.** `docs/backlog.yml:648` records that the first sabotage of that assertion stayed GREEN because the untouched paragraph carried attributes in the order the rebuild path emits, so a full rebuild was indistinguishable from leaving it alone. | Any implementer editing that file, and wave T1 which copies its idiom. | Re-run the sabotage: remove the guard that leaves an untouched paragraph alone and confirm the reconstruction assertion goes RED, via `npx vitest run src/lib/office-edit.test.ts`. | Object: the assertion's pass/fail state with the guard present against with it removed. **FAILS if both states are green** - which means the fixture has been canonicalised and the test proves an accident. | Wave T1, as the first step, before writing `office-template-fill.test.ts`'s own version of the assertion. |
| RES-A43-13 | **Wave T1 extracts the `.docx` fill pipeline into a new module and does NOT make `syllabus-templates.ts` adopt it**, so two implementations of the same contract exist until someone does. Deliberate: adopting it in the same wave puts four production callers and three workflow steps at risk for a feature none of them needs. | The chunk that next writes `src/app/actions/syllabus-templates.ts`. | A frozen oracle of `generateCourseSyllabusAction`'s produced bytes on a fixed synthetic `.docx` and a fixed replacement set, captured BEFORE the adoption and diffed against after. `docs/loop/traps-tests.md`'s rule applies: consolidating two implementations makes a test that compares them a tautology, so the oracle must be a frozen literal, not a cross-comparison. | Object: the produced `.docx` bytes before adoption against after. **FAILS on any byte difference that is not deliberately reviewed.** | Whichever chunk next writes that file. Not A43's, and it must not be folded into A43-T silently. |
| RES-A43-14 | **Wave T3 reimplements four OOXML idioms that already exist in `src/lib/office-edit.ts`** (a new zip part, a slide `_rels` path, a `<Relationship>` append, a `[Content_Types].xml` `<Override>` - section 11.5), because no wave may touch that file. | The wave-T3 implementer records it; the architect pass that next looks at `office-edit.ts` decides whether to share. | `grep -c "Content_Types" src/lib/decks/pptx-clone.ts src/lib/office-edit.ts` - two independent implementations is the expected state, and the residual is the RECORD of that, not a failure. | Object: the number of independent implementations of the `[Content_Types].xml` `<Override>` idiom. **FAILS if a third appears**, or if wave T3 edits `office-edit.ts` to avoid the duplication and thereby changes five production callers in four files. | Recorded at wave T3. Resolved by a deliberate extraction pass, never as a side effect. |
| RES-A43-15 | **The per-preset fixed/loop slide counts were never executed.** `expandTemplate`'s real output per preset requires running TypeScript, and this pass's write set was one doc file. What IS measured: three loop groups exist, all `breadth: "standard"` (`grep -n "breadth" src/lib/decks/presets.ts` -> `:27`, `:36`, `:135`), two presets declare `loops: []` (`:111`, `:348`), and `types.ts:472` emits each block once when items are empty. | The wave-T2 implementer, who needs the required slide count to build the refusal. | A real unit test calling `expandTemplate` over each entry of `DECK_PRESETS` with an empty and a three-item loop map, asserting the emitted slide count. | Object: the executed per-preset slide count against any count this document or the check's table asserts. **FAILS if wave T2's refusal threshold is computed from a static parse rather than from `expandTemplate`'s return value.** | Wave T2, before the refusal message is written. |
| RES-A43-16 | **The bold-prefix preservation at `syllabus-templates.ts:255-263` is untested on `.pptx`.** It reads `p.runs` and re-emits a bold leading span. `parseOfficeParagraphs` returns `runs: RunSpan[]` for both kinds (`office-edit.ts:41-45`), so it should be kind-neutral - that is an inference, not a measurement. | The wave-T1 implementer. | A unit test in `office-template-fill.test.ts` over a synthetic `.pptx` whose first run is bold, asserting the produced XML keeps the bold run and that the section-3.5 reconstruction still holds. | Object: the produced slide XML's run properties against the original's, for a paragraph whose replacement starts with the original bold prefix. **FAILS if the bold prefix is lost, duplicated, or applied to the wrong span** - and it must be watched RED with the prefix logic removed. | Wave T1, in the same commit as the extraction. |

---

## 15. Instruments used in this pass

Reproducible from the repo root in the Bash tool at HEAD `263dc88`, 2026-09-27.
Every absence claim was run WITHOUT a pipe, so `$?` is grep's, and each carries a
canary proving both that the file was read and that the pattern form matches
something real.

```
git rev-parse --short HEAD                                          -> 263dc88
git show --stat --format="" 4080c2e                                 -> 6 files, +496 -2
awk 'NR>=637 && NR<=648 {print NR": "$0}' docs/backlog.yml          -> HEAD field map
git show de4b7a2:docs/backlog.yml | awk 'NR>=637 && NR<=647'        -> the +1 drift
grep -rn "applyOfficeSections" --include=*.ts --include=*.tsx src/  -> 5 prod sites, 4 files
     canary: grep -rn "parseOfficeParagraphs" ... | wc -l           -> 36
grep -n "if (touched) zip.file" src/lib/office-edit.ts              -> 452, 654  (NOT 454)
     canary: grep -c "zip.file" src/lib/office-edit.ts              -> 23
sed -n '240,270p' src/app/actions/syllabus-templates.ts             -> the :245-247 comment,
                                                                       the :250-265 map, :267
grep -n "export async function" src/app/actions/syllabus-templates.ts -> :51, :119, ...
grep -n "export function expandTemplate" src/lib/decks/types.ts     -> 444  (NOT 445)
grep -n "itemsToUse" src/lib/decks/types.ts                         -> 472, 474
sed -n '110,118p' src/lib/decks/generate.ts                         -> materials on :114
sed -n '358,395p' src/lib/decks/generate.ts                         -> :365 gate, :385
                                                                       expandTemplate, :392 prompt
grep -n "breadth" src/lib/decks/presets.ts                          -> :27, :36, :135, all "standard"
grep -rn "enforceTitleLength" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."
                                                                    -> 4 sites incl. generate.ts:336
grep -n "console.error" src/lib/decks/generate.ts                   -> 415, 436, 465 (none at 336)
grep -rn "new PptxGenJS" --include=*.ts --include=*.tsx src/        -> pptx.ts:215 only
grep -rn "buildSlidesPptx({" ... | grep -v "\.test\." | wc -l       -> 13 (12 callers + def)
grep -c 'valign' src/lib/pptx.ts                                    -> 15  (rev 1 said 10)
grep -niE "truncat|overflow|shrink|autofit|clip" src/lib/pptx.ts    -> exit 1
     canary: grep -c "addText" src/lib/pptx.ts                      -> 23
grep -niE "course" src/app/components/ppt-design/index.tsx          -> exit 1
     canary: grep -c "selected"                                     -> 83
grep -niE "course" src/app/components/ppt-design/SlidesPanel.tsx    -> :105, :154, :156
git show 4080c2e^:src/app/components/ppt-design/SlidesPanel.tsx | grep -niE "course"
                                                                    -> same 3, pre-existing
grep -nE "slice\(0,|MAX_|limit" on ppt-design hooks/GeneratePanel/index
                                                                    -> exit 1 on all three
     canary: grep -c "const" on the three                           -> 25 / 6 / 96
grep -rn "_rels" --include=*.ts --include=*.tsx src/ | grep -v "\.test\."
                                                 -> office-edit.ts:594,614,677,711,714
grep -rn "Content_Types" ... | grep -v "\.test\."   -> office-edit.ts:677,704,707
grep -rniE "sldIdLst|appendPptx|addSlideXml|cloneSlide" ... src/    -> exit 1
     canary: grep -rn "sortedSlides" --include=*.ts src/ | wc -l    -> 9
grep -rn "presentation\.xml" --include=*.ts --include=*.tsx src/    -> exit 1
     canary: grep -rn "ppt/slides" ... | wc -l                      -> 12
grep -rniE "functionDeclarations|function_declarations|functionCall|function_call|toolConfig|tool_config" \
  --include=*.ts --include=*.tsx src/                               -> exit 1
     canary: grep -rniE "google_search" ... | wc -l                 -> 1
grep -n "tools:" src/lib/llm.ts                                     -> 519 only
grep -rn "callLlm(" ... | grep -v "\.test\." | wc -l                -> 127
grep -n "SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS" -r ... | grep -v test   -> one consumer file
grep -n "82 slides\|79 slides" src/lib/slide-token-budget.ts        -> :30, :69 (comments)
sed -n '85,115p' src/lib/office-edit.test.ts                        -> the :93-106 instrument
sed -n '120,180p' src/lib/office-edit.test.ts                       -> :126-154, :156-176
sed -n '13,54p' src/lib/office-extract.ts | grep -cE '^\s*"[a-z0-9]+",?$'   -> 39
sed -n '55,68p' src/lib/office-extract.ts | grep -cE '^\s*"[a-z0-9]+",?$'   -> 11
grep -rln 'type="file"' --include=*.tsx src/ | wc -l                -> 34 (was 33)
grep -rn 'accept=' --include=*.tsx src/ | grep -i "pptx"            -> DeckModeSection.tsx:76
git ls-files | grep -icE "\.(pptx|potx|docx|thmx)$"                 -> 0 (canary \.sql$ -> 109)
git ls-files | grep -c "office-edit.*test"                          -> 1 (RES-A43-1 CLOSED)
find src -name "*.wiring.test.ts" | wc -l                           -> 77
find src -name "*.structure.test.ts" | wc -l                        -> 22
grep -n "LIMIT = 1000" src/file-size-ceiling.structure.test.ts      -> 41
grep -n "ppt-design\|GeneratePanel" src/file-size-ceiling.structure.test.ts -> exit 1
     canary: grep -c "maxLines"                                     -> 8
git show HEAD:<path> | wc -l  -> office-edit.ts 755, pptx.ts 680, generate.ts 474,
  types.ts 521, presets.ts 391, syllabus-templates.ts 459, slide-graphics.ts 482,
  ppt-design/index.tsx 681, GeneratePanel.tsx 481, TemplateSelector.tsx 154,
  hooks.ts 172, api/ai-chat/route.ts 717, office-edit.test.ts 177,
  decks/deck-source.ts 86, decks/deck-source.test.ts 154, actions/deck-source.ts 71
```

**Instrument note carried forward from revision 1, because the rule requires it.**
Revision 1 recorded piping an absence check through `| cat`, which makes `$?`
report `cat`'s status (0) rather than grep's (1) - it would have read as "matches
found" with no output. The check recorded the same defect with `| head`. **Nine
instrument defects of that family have been found in this repo recently, so no
absence claim in this document is piped through anything.**

**Two quantities this pass deliberately did not assert.** The per-preset slide
counts (RES-A43-15), because they need executing TypeScript and this pass's write
set was one doc file. And `@(Get-Content).Count` for any file above, because this
pass ran in the Bash tool - every line count here is `wc -l` and an implementer
must re-measure with the mandated PowerShell instrument before trusting headroom,
since the two disagree by 15 to 138 where they disagree at all.
