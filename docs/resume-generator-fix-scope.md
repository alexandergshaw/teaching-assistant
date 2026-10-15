# Scope: "Resume generator" two-bug fix - DISPROVEN AGAINST THE TREE

**Author:** loop-architect (SCOPE only; no production code).
**Date:** 2026-10-08. **Branch:** main.
**Verdict:** The premise does not hold against the current tree. **There is no
resume / CV generator anywhere in this repository.** The two bugs described
(stray tabs splitting words in a "competencies" section; a team-size headcount
inflated from 5 to "7+") therefore have **no owning file or function here**, and
cannot be given the minimal write set, frozen oracle, or sabotage the brief
asks for - because the artifact they describe is not produced by any code path
in this repo. Fabricating those would be the exact "ship a surface with no layer
behind it" failure the seat exists to prevent, so this scope reports the
disproof instead, with every negative backed by a re-runnable command, and hands
the owner a terminating fork.

The brief instructed me to confirm the prior-session diagnosis against the tree
and "trust the code not this summary." I did. The code contradicts the summary.

---

## 1. What I was asked to find, and what the tree says

| Claimed object (from brief) | Searched for | Command | Result |
|---|---|---|---|
| A resume generator feature | resume/CV feature terms | `grep -rniE "\bresume generator\b\|\bresumeGenerat\|resume-materials\|resumeMaterials\|\bcover letter\b\|curriculum vitae\|\bapplicant\b\|work history\|employment history" src` | **0 matches** |
| The DeVry instructor resume | the institution name | `grep -rni "devry" . --include=*.ts --include=*.tsx --include=*.md --include=*.json \| grep -v node_modules` | **0 matches** |
| A competencies / skills formatter | `competenc` in source | `grep -rniE "competenc" src --include=*.ts --include=*.tsx \| grep -v "\.test\."` | **4 matches, all educational** (see 2.2) |
| Headcount / team-size derivation | team-size terms | `grep -rniE "competenc\|headcount\|team size\|engineers" src` (initial sweep) and a dedicated `headcount\|team size\|engineers` pass | **0 matches for headcount/team size/engineers** in `src` |
| Anything named `Resume` (CV sense) | the token `Resume` | `grep -rnoE "\bResume\b" src --include=*.ts --include=*.tsx` | **12 matches, all pause/resume UI** (see 2.1) |

Every command above is re-runnable from the repo root. The checker should run
at least the first three and confirm the counts.

---

## 2. Positive proof of what each near-miss actually is

### 2.1 Every `Resume` token is recording/auto-scroll pause control, not a CV
`grep -rnE "\bResume\b" src --include=*.ts --include=*.tsx` returns 12 lines; the
representative set:
- `src/app/components/courses/StudentRepoRoster.tsx:543` - `"Resume auto-refresh"`
- `src/app/components/content-tab/modules/TeleprompterPanel.tsx:297` - `Resume auto-scroll`
- `src/app/components/LiveFeedPanel.tsx:407` - `"Resume watching course"`
- `src/app/components/recording/StagePanel.tsx:755`, `WalkthroughPanel.tsx:226`,
  `LectureScriptPanel.tsx:121` - the recorder's Pause/**Resume**/Stop control.

None is a document. All are the verb "resume (an activity)."

### 2.2 Every `competenc` hit is course-rigor prose, not a resume section
`grep -rniE "competenc" src --include=*.ts --include=*.tsx | grep -v "\.test\."`:
- `src/app/actions/shared.ts:502` - a comment about a fixed **course** competency.
- `src/lib/course-project.ts:308,506` - prompt text: "the competency demonstrated
  is not [negotiable]" - about student deliverables.
- `src/lib/resource-links/field-resources.ts:115` - a link description mentioning
  "practitioner competence standards."

There is no routine that lays out a list of personal competencies/skills, and
nothing that would column-align or justify such a list (the mechanism the brief
hypothesised for the stray tabs).

### 2.3 The app's ONLY content generator is the LMS-kind registry - 10 fixed kinds, none a resume
`src/lib/lms-generation/kinds.ts:211-222` (`GENERATION_KIND_IDS`), confirmed with
`grep -nE '^\s*"(qa|currentEvents|decks|objectives|assignments|knowledgeChecks|announcements|scripts|resources|introDiscussion)",' src/lib/lms-generation/kinds.ts`:

```
qa, currentEvents, decks, objectives, assignments,
knowledgeChecks, announcements, scripts, resources, introDiscussion
```

These are course content kinds (anticipated Q&A, current-events assignment,
slide deck, module objectives, assignment, knowledge check, announcement, lecture/
intro-video script, learning-resources page, intro discussion). The union is
closed by construction - `GenerationKindId` is `Extract<OutputFamily, ...> |
NON_FAMILY_KIND_IDS` (`kinds.ts:204-209`), so a kind cannot exist without a
registry entry. **A resume is not and cannot silently be one of these.**

### 2.4 The markdown/docx export path does NOT inject tabs mid-word
The one place in this repo a real "tab splits a word" bug could live is the
text -> markdown -> docx rendering path. It handles tabs correctly and never
injects them into a token:
- `src/lib/markdown.ts:112` collapses trailing whitespace: `.replace(/[ \t]+\n/g, "\n")`.
- `src/lib/markdown.ts:174` strips tabs from URLs: `/[\t\n\r]/g`.
- `src/lib/docx-blocks.ts:37` *measures* a tab as width 4 for column math; it does
  not write tabs into words.
- `src/lib/docx.fenced-code-indentation.test.ts:126,131` deliberately **preserves**
  a leading tab inside a fenced code block - the opposite of corrupting words.

There is no split-join, justify, or column-pad routine that reassembles a word
around a tab. The observed `"Jour\tney"` / `"Pr\t\toject"` corruption is not
producible by any transform in `src/`.

### 2.5 The in-app chat is course Q&A, not a document generator
`ls src/lib/chat/` -> attachments, entity-grounding, knowledge-context,
open-chat, selection-context, system-instruction. This is a grounded
question-answering surface over course data; it has no resume/document output
path, no competencies renderer, and no numeric-fact templating.

---

## 3. Why the two bugs cannot be scoped as code fixes here

**Bug 1 (stray tabs in competencies).** No competencies/skills formatter exists
(2.2), and no code path injects tabs mid-word (2.4). There is no owning function,
so there is no minimal write set and no live defect for an oracle to freeze or a
sabotage to re-introduce. An oracle written here would freeze a known-good
transform that is *already* correct - it would pass forever and prove nothing
about the owner's resume, which was produced somewhere else.

**Bug 2 (headcount 5 -> "7+").** No code derives, restates, or templates a
team-size / headcount figure (0 hits for `headcount|team size|engineers` in
`src`). If a number was inflated, it was inflated by a model writing prose, and
this repo has **no prompt that produces a resume** in which to add a
"carry source figures verbatim, never invent or inflate" grounding constraint.
Per the brief's own guard and `docs/loop/this-repo.md` section 6, an
LLM-hallucinated number is in any case **not unit-testable here** (vitest renders
nothing and `vitest.setup.ts` throws on real fetch), so even in a repo that *did*
generate resumes, bug 2's only honest instrument would be a prompt constraint
plus an owner live-check residual - never a passing unit test standing in for a
hallucination.

---

## 4. Most likely true origin (stated as a reading, not an owner ruling)

The resume was almost certainly generated by **Claude directly in a chat/CLI
session**, not by this app. `AGENTS.md` records exactly this class of event as a
named failure mode (SHAPE 1, "THE OFF-BACKLOG INTERRUPT"): *"The owner asked for
help with an unrelated file (a resume document)."* That is an off-backlog Claude
task, not an app feature. The "resume materials" the source was uploaded to is
not a feature in this tree either (0 hits, 1.); it reads as a folder/attachment
the owner gave to a chat, not a route in the app.

If that reading is right, "Fix the app generator" has no code target. The fix
belongs to **how the next resume is generated in chat** - a grounding instruction
to carry source figures verbatim and not reflow text into tab-aligned columns -
which is a prompting change the owner applies at generation time, not a diff in
this repo.

---

## 5. The terminating fork for the owner

The brief says the owner already "chose Fix the app generator." The tree shows
there is no app generator to fix. Rather than run a second round against
imaginary code, this scope asks ONE question whose every answer ends the
activity:

- **(A) The resume was chat-generated (my recommended reading, section 4).**
  Then there is nothing to fix in this repo. The corrective action is a reusable
  prompt/grounding instruction for the next generation ("reproduce every source
  figure verbatim; never invent or inflate a number; emit plain prose, no tab/
  column alignment"), owned by the owner at chat time. **Cost of being wrong:**
  near zero - no code was changed, and the instruction is harmless if the real
  bug turns out to be elsewhere.
- **(B) The owner actually wants the app to GENERATE resumes.** Then this is a
  **net-new feature** (a resume/CV generation kind or a new document surface
  grounded on uploaded materials), not a two-bug fix. It needs the full loop -
  acceptance criteria, leverage claim, architect, data, security, test seat -
  and a fresh backlog row, not this scope. **Cost of being wrong:** if (A) was
  true, the whole feature is wasted build.
- **(C) The owner has a different generator in mind than this repo** (e.g. a
  separate project, or a document produced by another tool). Then the fix is out
  of scope for teaching-assistant entirely and this row should be closed here and
  reopened against the right repo. **Cost of being wrong:** none to this repo.

**My recommendation: (A).** The evidence (sections 1-2) is dispositive that no
generator exists here, and `AGENTS.md`'s own record of a chat-generated resume
makes (A) the parsimonious explanation. I did not start build work because every
reading of this fork except (B) produces zero code in this repo, and (B) is a
feature the owner has not asked to build.

---

## 6. Residual register

Each entry names owner, instrument, and the step that measures it. These belong
in `docs/BACKLOG.md`; a residual that lives only here is a deletion.

| # | Residual | Owner | Instrument | Measuring step |
|---|---|---|---|---|
| R1 | Confirm the resume was chat-generated, not app-generated (settle the fork in 5). | Repo owner | Owner recollection of how the resume was produced + this scope's disproof (section 1 commands). | Owner answers A/B/C; orchestrator records the answer and closes or re-files the row. Not agent-measurable. |
| R2 | If (A): capture the reusable "carry source figures verbatim; no tab/column reflow" grounding instruction so the next resume does not repeat it. | Repo owner | None in this repo (no resume prompt exists to add it to). Applied at chat generation time. | Owner applies it on the next generation and eyeballs the output. **Owner live-check only** - no vitest instrument exists or could exist (section 3, bug 2). |
| R3 | If (B): file a net-new "resume generation" feature row and run the full loop; do NOT treat it as a bug fix. | Repo owner (scope decision) | New backlog row + acceptance criteria. | New activity with its own two rounds; out of scope for this file. |

---

## 7. What this scope deliberately does NOT contain, and why

- **No "exact files/functions owning each bug"** - none exist (sections 1-3).
- **No minimal write set** - there is nothing to write against; a write set here
  would touch correct code (e.g. `markdown.ts`) and introduce risk to fix a bug
  that is not there.
- **No frozen oracle and no sabotage** - an oracle needs a live defect to catch.
  The transforms that could plausibly match (markdown/docx tab handling, 2.4) are
  already correct, so an oracle over them would be a tautology that passes
  forever (`MEMORY.md`: "Refactors disarm tests"; a green oracle over
  already-correct code proves nothing). Bug 2's defect, if real, is model prose,
  which `docs/loop/this-repo.md` section 6 states cannot be caught by any test in
  this environment. Producing an oracle/sabotage pair here would be fabrication
  dressed as rigor - the precise failure this seat is Opus to avoid.

If the checker can produce a `file:line` in this repo that generates a resume, a
competencies list, or a team-size figure, this verdict is wrong and I want it
caught - name the symbol and the command that finds it. I could not, with the
searches in section 1.
