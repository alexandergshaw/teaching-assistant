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
| "Each reply should include" | multi-select, 5 fixed options | `ta-rec-disc-ingredients` | compliment + deeper question |
| Address by name | toggle | `ta-rec-disc-address-name` | **ON** (owner's explicit default) |
| Formality | 3-stop slider | `ta-rec-disc-formality` | middle |
| Paragraphs | **not a control** - see C3 | none | always on |

**C0-0. Placement is load-bearing, not cosmetic: the whole cluster goes ABOVE
`Start capture`, inline, with no disclosure.** Verified at
`useDiscussionReplies.ts:426` - `enqueueDrafts(addedIds, draftDispatchForce("auto"))`
fires as posts merge *during* capture, so drafting begins before the instructor
touches anything else. A control discovered below `Start capture`, or behind a
disclosure, is discovered *after* the first replies have already been drafted
under defaults. Insert after the audience row and before the capture button.

A disclosure is also wrong for a second reason: it would hide a toggle that is
ON by default, so the one control that silently changes output would be the one
control nobody sees.

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

**C1b. The greeting name comes from the captured `author` string, never from the
model.** The model is told the name to use; it is never asked to derive one. A
model-derived first name is a guess about a real person's preferred name, which
is the same class of error T1/T3a already refuses for `replyingToAuthor`.

**C1b-i. It must NOT be `deriveReplyAuthorName(...).firstName`, and an earlier
draft of this AC was wrong to say so.** That field is a SORT KEY, not a greeting.
`src/lib/person-name.ts:74` is `tokens.slice(0, -1).join(" ")` - everything
except the last token - which is correct for ordering a table and wrong for
addressing a person:

| author | `.firstName` | greeting it would produce |
| --- | --- | --- |
| `Maria de la Cruz` | `Maria de la` | "Maria de la, your point ..." |
| `Rajesh Kumar Patel` | `Rajesh Kumar` | "Rajesh Kumar, ..." |
| `John Q. Public` | `John Q.` | "John Q., ..." |

That behaviour is frozen and tested, so it must not be changed - the sort column
depends on it. Add a **new** export to the same leaf, e.g.
`greetingNameFromAuthor(author)`, returning the FIRST token (and, for a
comma-form `Last, First`, the first token after the comma). Test it against every
row of the table above, plus a mononym, a trailing-comma string, and an empty
string.

**C1b-ii. Derive the greeting name in `discussion-draft-loop.ts` and thread it
per-post**, exactly as entry 372 threads `parent` - do NOT have
`discussion-reply-prompt.ts` import `person-name.ts`. Threading it per-post
structurally prevents the greeting being applied to the `CONTEXT ONLY` parent
block, which has no reply of its own and must never be addressed.

**C1c. A single-token author is used whole.** `person-name.ts` must not invent a
split. If the board printed only `mchen`, the reply addresses `mchen` or, if that
reads as a handle rather than a name, the toggle degrades to OFF **for that row
only** - state which in the implementation and test it. Do not let a username
leak into a greeting.

**C1c-i. A degrade must be VISIBLE, not silent.** The row already computes a
`(derived)` marker for a related case; reuse that idiom so a row whose greeting
was skipped says so. A silent degrade is indistinguishable from the toggle being
broken, and the instructor would only notice by reading every reply.

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

**C2c-i. But zero-selected must not LOOK broken.** An empty MUI multiple select
renders visually identically to one that failed to load. It needs a
`renderValue` returning a real phrase - "Nothing in particular" - pinned as a
test fact, not left to the component's default. `renderValue` is required in
the non-empty case too: MUI's default prints the raw enum values.

**C2c-ii. Copy the existing multi-select idiom MINUS its last-item guard.** The
established usage prevents deselecting the final option; that directly
contradicts C2c, which requires the empty state to be reachable.

**C2e. The label is "Each reply should include", not "Ingredients".** The owner
never used a recipe metaphor, and stem-completing option labels ("a compliment
on what the post did well", "a question that goes deeper") make C2a's
conditionality legible in the UI itself rather than only in the prompt.

**C2d.** Ingredients are a **per-table** setting, not per-row. The owner's later
ask for a per-row resource search is a different control in a different group;
nothing here forecloses it.

**C2f. The default selection contradicts the `peers` register, and the register
wins.** `discussion-reply-prompt.ts:186` says, for peers: *"Do not open with
praise and do not explain the underlying concepts back to them."* The default
set includes `compliment`. This is C1's own defect class - two contradictory
instructions in one prompt, resolved by the model, per draft, invisibly - which
this AC caught for names and then reproduced in its own defaults.

Resolution: **the compliment clause is audience-aware.** The peers ban is on
*opening* with praise, not on acknowledging substance, so for peers the clause
must not produce an opening praise line; it may engage with what the post gets
right inside the reply. For students no conflict exists - that register
(`:178`) already mandates opening by naming something the student actually said.
Test both registers separately; a single combined test would pass on either one
alone.

**C2g. Ordering, for students, when the name toggle is ON.** The students
register already prescribes the opening move ("Open by naming something the
student actually said"). The greeting precedes that move rather than replacing
it - `Maria, your point about the second reading ...`, not a greeting line
followed by a restart. Say so explicitly in the prompt, or the two instructions
compete for the same sentence.

---

## 3. Paragraphs

**C3.** The existing prompt asks for a paragraph break only "if you need one".
That becomes a requirement: **a reply longer than roughly 60 words is broken into
at least two paragraphs, separated by a blank line.**

**C3-i. The existing prompt line must CHANGE, not be supplemented.**
`discussion-reply-prompt.ts:265` currently asks for a single `\n` "if you need
one". C3 requires a blank line (`\n\n`) between paragraphs. Leaving the old line
in place would mean C3b's round-trip test pins a shape the prompt never actually
requests - a test that passes while the model is being told something else. Edit
the line; do not add a second instruction beside it.

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
that always visibly works. Stops: **Casual / Balanced / Formal.**

"Balanced", not "Neutral": C4b makes the middle stop a no-op that preserves the
students register's own explicit warmth (`discussion-reply-prompt.ts:178`), and
"Neutral" misdescribes that - it reads as "no tone", which is not what the
middle stop does.

**C4c. The slider's mechanics, each a real trap:**

- **Persist on `onChangeCommitted`, never `onChange`.** MUI's `Slider.onChange`
  fires continuously through a drag, so persisting there writes to localStorage
  on every pixel and can re-arm drafting mid-gesture.
- The track needs an explicit width and horizontal padding (~`width: 220`,
  `paddingInline: 24`). Without it the outer mark labels are centred at 0% and
  100% and overhang the track by roughly 23px, so "Casual" and "Formal" clip at
  narrow widths. All three labels stay visible at all widths - hiding the
  inactive ones costs a discovery drag and buys nothing once the padding is
  there.
- **`getAriaValueText` is required.** Without it a screen reader announces
  "1 of 0 to 2", which conveys nothing. It must speak the stop's name. Pair it
  with `aria-labelledby` pointing at the visible label; `valueLabelDisplay` off.
- **The focus ring needs an explicit `outline`.** `theme.ts` only corrects focus
  rings on `MuiButtonBase`, and the Slider thumb is not one, so it falls back to
  MUI's box-shadow ring - which `theme.ts`'s own comment records as invisible in
  Windows High Contrast mode.

**C4b. Formality attaches near `AUDIENCE_STANCE`, and the two must not fight.**
The existing peers/students registers already carry tone. Read the live
`AUDIENCE_STANCE` text before writing the formality clauses and make each stop
*modulate* that stance rather than restate or contradict it. The middle stop
leaves the audience register's own tone intact.

**C4b-i. The DEFAULT CONFIGURATION IS NOT INERT, and this must be deliberate.**
An earlier draft of this AC implied the group ships inert until the owner moves
something. That is false in three of four dimensions: ingredients default to two
selected, the name toggle defaults ON, and paragraphs are unconditional. Only the
formality middle stop is genuinely a no-op.

The owner explicitly asked for name-addressing ON by default, so that one is
intended. The other two are hereby made intentional rather than accidental: the
default reply gains a compliment, a deeper question, a first-name greeting and
paragraph breaks **on the very first capture after this ships**, with no action
taken. **The REGRESSION entry must state that plainly** - the previous group's
review found a change to output shipping with nobody having decided it should.

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
updated in the same commit. It is **ordered array equality** (stronger than set
equality), and the order is ORDINAL - `ta-rec-card-title` precedes
`ta-rec-cards`, which a culture-aware sort reverses. Insert each new key at its
ordinal position, do not append.

**C5c. Add a read/write wiring check for the `ta-rec-disc-*` keys** - the canary
proves a key EXISTS in the source, not that it is both written and read back, so
a key with only one half passes it and ships silently broken: the control appears
to work and forgets on reload. This is `verify-reachability` one layer earlier.

**C5c-i. The existing avatar wiring check is NOT copy-pasteable, and an earlier
draft of this AC assumed it was.** Two mismatches, either of which yields a
screenful of red tests over correct code:

- it matches `readPersisted` / `localStorage.getItem` with a **literal**
  argument, but this surface uses the `readLocalStorage` / `writeLocalStorage`
  helpers;
- three of the existing disc keys are referenced through `const STORAGE_KEY_*`
  constants, not as literals at the call site, so a literal-argument regex cannot
  see them at all.

Write the check against how THIS surface actually stores things, and prove it by
sabotage: delete one key's write, confirm the check goes red.

**C5c-ii. There are already SIX `ta-rec-disc-*` keys, not three** (`audience`,
`course`, `filter`, `save-video`, `sort`, `table`). With the three new ones the
check covers **nine**. An earlier draft of this AC said three.

---

## 6. Arming

**C6. All three controls join `draftingArmSignature`.** That signature already
regressed once over a missing `courseId`, per its own source comments: a control
outside it means changing the setting leaves queued and in-flight rows drafting
against the OLD setting, with nothing on screen indicating it.

**C6a.** Test the signature CHANGES for each of the three controls
independently - three assertions, not one combined one. A single combined test
passes when only one of the three is wired.

**C6b. "Arming" does NOT mean "re-draft".** Stated because C6 is misreadable as
"changing a control re-runs drafting", which would be alarming and is not what
happens. Changing a control enqueues nothing and rewrites nothing; the existing
`isDispatchableDraftItem` / `draftDispatchForce` machinery already refuses to
overwrite a reply the instructor has edited, and the signature change only
disarms a pending redraft confirmation. Already-drafted rows keep their text
until the instructor explicitly redrafts. Reuse the existing armed-confirm
consequence line as the escape hatch - do not invent a new notice.

**C6c. Do not route any of this through the `notices` channel.** It is a capped,
dismissible FAILURE channel rendered with the error style and piped to a live
region; a settings change is neither an error nor an interruption. Discoverability
comes from the inline placement (C0-0) plus a label that states the effect -
"Open each reply with the student's first name" - plus one hint sentence.

---

## 6b. Two existing defects this group must not propagate

**C6d. The audience segmented toggle has no `aria-pressed`.** Verified: the
attribute appears exactly once in the whole `recording/` directory, in an
unrelated panel. It is the control this AC otherwise cites as the segmented
precedent, so copying it would propagate the defect to a second control. Since
the formality control is a slider rather than a segmented group, the fix is
small and belongs here: add `aria-pressed` to the audience toggle in the same
group. In-scope, one line, and this panel is already open.

**C6e. C3's paragraph requirement collides with a deliberate height match.** The
reply textarea's `minRows` and the post block's fixed height are tuned to line
up. Replies that are now reliably multi-paragraph will change the typical filled
height. Check the pairing at the 1000px stacking breakpoint and adjust the match
rather than letting the two columns drift apart.

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
