# Telling the app what each reply must contain

The owner's words, across three asks:

> i need to be able to tell the app what i need from each reply (compliments on
> what the original post did well, a question that goes deeper, insight,
> resources, etc) / same for announcements / and i need the replies broken up
> into paras

> also include an option for addressing students by name. default to on

> also include a slider for how formal replies should be

Extends the Discussion replies surface (REGRESSION entries 366-369, 372).

---

## 0. Scope, and the one thing that splits the group

Four controls, all feeding `buildReplyDraftingPrompt`:

| Control | Shape | Persisted | Default |
| --- | --- | --- | --- |
| Ingredients | multi-select, 5 fixed options | `ta-rec-disc-ingredients` | compliment + deeper question |
| Address by name | toggle | `ta-rec-disc-address-name` | **ON** (owner's explicit default) |
| Formality | 3-position slider | `ta-rec-disc-formality` | middle |
| Paragraphs | **not a control** - see C3 | none | always on |

**C0-1. "Same for announcements" is a SECOND group, not a second file in this
one.** The announcement surface (`useTakeAnnouncement.ts`, `take-announcement.ts`,
`draftAnnouncementAction`) shares **zero** code with the discussion-reply prompt
path - verified in the reuse survey, not assumed. And `useTakeAnnouncement.ts` is
at 915 lines against a hard 1000-line ceiling, so the announcement half needs an
extraction *before* it can grow at all. Doing both in one group would put a
required extraction, a new prompt vocabulary and two surfaces in a single wave -
the exact shape that produced entry 372's dead-on-arrival wiring.

So: **C-1 (this doc) is discussion replies. C-2 is announcements, dispatched
immediately after, reusing C-1's vocabulary verbatim.** The owner asked for both;
both get built. Only the order is being decided here.

**C0-2. Paragraphs are a requirement, not a fourth toggle.** The owner stated it
as a need ("i need the replies broken up into paras"), not as an option. A toggle
would add a click to every session to reach a state they have already said they
want. Minimizing clicks is a first-class constraint on this project.

---

## 1. The conflict that must be resolved, not patched around

**C1. `discussion-reply-prompt.ts:233` currently says:**

> "- No greeting line and no sign-off. Do not open with the person's name. The
> reply is pasted into a box that already shows who is speaking and who is being
> answered."

The address-by-name toggle **directly reverses the middle sentence.** This is not
an additive change: appending "address the student by name" while that line
stands would put two contradictory instructions in one prompt, and which one wins
would be decided by the model, per draft, invisibly.

**C1a.** That line becomes **conditional on the toggle**, with all three clauses
handled separately - the no-greeting/no-sign-off rule stays unconditional in both
branches, because it was never about names:

- toggle **ON**: open with the student's **first name** and nothing else - no
  "Hi", no "Hello", no comma-greeting line of its own. `Maria, your point about
  ...` not `Hi Maria,` on its own line.
- toggle **OFF**: today's line, byte-identical.

**C1b. The first name comes from the captured `author` string via the existing
`person-name.ts` leaf** (built for the sort group's first/last ordering), never
from the model. The model is told the name to use; it is never asked to derive
one. A model-derived first name is a guess about a real person's preferred name,
which is the same class of error T1/T3a already refuses for `replyingToAuthor`.

**C1c. A single-token author is used whole.** `person-name.ts` must not invent a
split. If the board printed only `mchen`, the reply addresses `mchen` or, if that
reads as a handle rather than a name, the toggle degrades to OFF **for that row
only** - state which in the implementation and test it. Do not let a username
leak into a greeting.

**C1d.** The grading-feedback prompts prohibit naming the student. That is a
different surface with a different reason, and **this change must not touch
it.** The reuse survey flagged the risk of one convention bleeding into the
other; the AC records it so the implementer does not "harmonize" them.

---

## 2. Ingredients

**C2.** A fixed enum, defined **once** in a leaf both the client and the prompt
builder import. Entry 372 shipped the same three-member set written out in four
modules with nothing pinning them equal; that is not repeated here.

```ts
type ReplyIngredient =
  | "compliment"      // name something the post did well, specifically
  | "deeper-question" // one question that pushes past what was said
  | "insight"         // add something the post did not cover
  | "resources"       // 2-3 relevant links (the existing resources feature)
  | "correction";     // gently correct a factual error, only if one is present
```

**C2a. `"correction"` is conditional by construction.** Its prompt clause must
say to include it *only when the post actually contains an error*, and to say
nothing otherwise. An unconditional "correct them" instruction against a correct
post invites an invented error - the hallucination class the guard at `:240`
exists for.

**C2b. Selecting `"resources"` does NOT re-implement resources.** It gates the
existing resource block (entry 368's state machine). If the box is unchecked, no
resource search is dispatched for that row - which is also a real token saving,
so the wiring must be verified in both directions.

**C2c. Zero selected is legal** and means "a plain, well-judged reply" - the
prompt emits the ingredients block only when at least one is selected, so an
empty selection leaves the prompt byte-identical to today's. Do not force a
minimum selection; the owner may want exactly that.

**C2d.** Ingredients are a **per-table** setting, not per-row. The owner's later
ask for a per-row resource search is a different control in a different group;
nothing here forecloses it.

---

## 3. Paragraphs

**C3.** The existing prompt asks for a paragraph break only "if you need one".
That becomes a requirement: **a reply longer than roughly 60 words is broken into
at least two paragraphs, separated by a blank line.**

**C3a. Nothing post-processes the model's text into paragraphs.** No
"insert a break every N sentences" pass. A mechanical split produces breaks
mid-argument, and the repo has no way to detect that - vitest renders nothing.
The requirement lives in the prompt; the test pins that the instruction is
present and that newlines survive the pipeline.

**C3b. Newline survival is already true and must be PINNED, not built.** The
survey confirmed `\n\n` survives the textarea, `serializeReplyTable` /
`deserializeReplyTable`, `replyClipboardText` and `tableClipboardText`. Add a
frozen-literal round-trip test asserting a two-paragraph reply arrives intact at
the clipboard helper - so a future "tidy the whitespace" change fails loudly
instead of silently flattening every reply.

---

## 4. Formality

**C4. A slider, because the owner asked for a slider** - MUI `Slider` with
`step={1}`, `min={0}`, `max={2}`, `marks`, and a visible label per stop. The repo
has `Slider` only as a continuous angle control, so there is no discrete-marks
precedent to copy; this is genuinely new and must be built to the project's
existing visual language rather than dropped in with defaults.

**C4a. Three stops, not five**, and this is a deliberate limit: each stop must
produce a register the model can actually distinguish. Five stops would put two
pairs of adjacent positions within noise of each other, so the control would
appear to do nothing for two of its five values - worse than a coarser control
that always visibly works. Stops: **Casual / Neutral / Formal.**

**C4b. Formality attaches near `AUDIENCE_STANCE`, and the two must not fight.**
The existing peers/students registers already carry tone. Read the live
`AUDIENCE_STANCE` text before writing the formality clauses and make each stop
*modulate* that stance rather than restate or contradict it. The middle stop must
leave the audience register's own tone intact - so the default is a no-op against
today's prompt, and the whole group stays inert until the owner moves something.

---

## 5. Persistence, and the canary trap

**C5.** Three new keys, using the exact `readLocalStorage` / `writeLocalStorage`
idiom and the `useState`-initializer + wrapped-setter pattern already used for
audience, course and save-video:

`ta-rec-disc-ingredients`, `ta-rec-disc-address-name`, `ta-rec-disc-formality`.

**C5a.** Every stored value is coerced on read. An unrecognised formality index,
a non-array ingredients blob, or an ingredient string outside the enum falls back
to the default rather than reaching the prompt. Coercion lives in a **plain
exported function**, because vitest here renders no hook - an inline coercion
inside a `useState` initializer is untestable in this repo.

**C5b. The key-inventory canary goes 49 -> 52** and its expected array must be
updated in the same commit. It is exact-set equality, so a missed key fails the
whole suite.

**C5c. The trap the survey found, which this AC closes.** Unlike
`ta-rec-avatar-*`, there is **no read/write wiring check** for `ta-rec-disc-*`, so
a key that is only ever written (or only ever read) passes the canary and ships
silently broken - the control appears to work and then forgets on reload. Add a
wiring assertion for all six `ta-rec-disc-*` keys: each must appear in at least
one read AND at least one write. This is the `verify-reachability` class caught
one layer earlier, and it retro-covers the three existing keys.

---

## 6. Arming

**C6. All three controls join `draftingArmSignature`.** That signature already
regressed once over a missing `courseId`, per its own source comments: a control
outside it means changing the setting leaves queued and in-flight rows drafting
against the OLD setting, with nothing on screen indicating it.

**C6a.** Test the signature CHANGES for each of the three controls
independently - three assertions, not one combined one. A single combined test
passes when only one of the three is wired.

---

## 7. What this group must NOT do

- No per-row overrides of any of the four (a later group).
- No change to the `1..N` output contract, `THE POSTS` block, or entry 372's
  `CONTEXT ONLY` parent block.
- No touching the grading prompts (C1d).
- No new register on the audience control (entry 372's T7 rejected that, and the
  formality slider is the better-shaped answer to the same need).

---

## 8. Limits this group's REGRESSION entry must state

- **No component is rendered by any test.** vitest is node-env and collects only
  `src/**/*.test.ts`. The slider, the multi-select, the toggle, their labels and
  their keyboard behaviour are all verified **by reading**. A green suite proves
  the prompt strings and the coercion, nothing about the controls.
- **Whether the model actually honours any of this is unmeasured.** Every
  assertion is that an instruction is PRESENT in the prompt. No frame from this
  pipeline has ever reached a model under test, and the formality stops in
  particular are an untested claim about model behaviour.
- **The address-by-name first-name split can be wrong** for mononyms, handles,
  names where the display order is family-name-first, and anyone whose preferred
  name is not their first token. C1c degrades rather than guesses, but a wrong
  degrade is still visible to a student.
- **`"correction"` is the highest-risk ingredient** - it asks the model to judge
  correctness and is one prompt-clause away from inventing an error to satisfy
  the instruction.
- This surface **still owes a downloadable log** (three entries running).
