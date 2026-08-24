# The bulk-bar command box: instruct, propose, then apply

Chunk G. Split out of the bulk-bar reorganization's AC12h-AC12m at the
coordinator's recommendation, because it grew across three requests in one
session from "a context textbox" into the highest-consequence action the bar
would contain.

**The asks, verbatim (2026-08-23), in the order they arrived:**
1. "for all actions taken on the bulk action bar that involve an llm, give me a
   textbox i can use to provide additional context/commands"
2. "also make it so that this textbox is available even if i just select a
   module or an item, and make it so that i can submit the textbox as a
   command to an llm to modify the selected module or item"
3. "and make it so that the llm that gets called through this textbox can also
   generate entirely new modules"

**Ask 1 is chunk E's AC12a-g and is NOT in this chunk** - it is a context field
for an existing generation, small and additive. This document owns asks 2 and
3: the same box submitted as a COMMAND.

---

## 0. Why this is separate, and what makes it different from everything shipped so far

Every LLM feature in this app so far produces a NEW artifact the instructor
reviews before it goes anywhere: a discussion draft, an assignment draft, a
report, a script. This one **rewrites content that already exists in a live
course**, and can create modules. There is no undo in Canvas.

That single difference drives every criterion below.

---

## 1. The rule that governs the whole chunk

**AC1. Draft, review, commit. Never fire-and-forget.**

This project has a standing classifying rule: an action with side effects gets
a supervised variant that drafts and a review step before it commits. That
rule was written for actions far smaller than this one.

So: submitting a command produces a **PROPOSAL**. The proposal reaches Canvas
only when the instructor applies it. There is no path from typing to a Canvas
write without an explicit approval of the specific changes.

**AC1b.** The command control is `destructive` tier in the bar's consequence
model, so its group can never collapse and it carries an always-visible
consequence tag. Both follow automatically from declaring the tier correctly -
see REGRESSION entry 329.

---

## 2. Availability

**AC2.** The box renders whenever ANYTHING is selected - a module alone, an
item alone, or any mix. It is NOT gated on the Generate row being offerable.

This exposes an existing asymmetry the bar already has: the Generate row is
offered for a module-only selection, but the thirteen item-level bulk actions
are not. The box must work for both, so it belongs to the bar itself, in its
own declared group, not inside either bulk section.

---

## 3. What a command may change

**AC3.** Only fields this app can already both READ and WRITE, because a
proposal must show the current value to be reviewable:

- an item's title, and the description/body of an assignment, quiz, discussion
  or page (`getGradable` / `getPage` to read; `updateGradable` / `updatePage`
  to write)
- a module's name (read from the loaded tree; `updateModule` to write)

**AC3b. Explicitly OUT of scope, and the UI says so rather than silently
skipping:** points, due dates, submission type, rubric association, and
publish state. Every one of those has a dedicated control in this same bar,
and a free-text command that silently changed a due date would be
indistinguishable from the dedicated control having been used. A command that
asks for one of them is reported as UNSUPPORTED in the proposal - named, not
dropped.

**AC3c (new modules).** A command may also create modules. Reuse
`planBulkModuleCreation` (`src/lib/bulk-module-plan.ts:151`) - it already
returns a per-module CREATE / ALREADY-PRESENT decision by
case/trim-insensitive name, and its own header records why: Canvas offers no
idempotency key for module creation, so a name pre-check is the only dedupe.
**An LLM-driven creator that skips it duplicates every module on a second
run.** Titles go through `composeModuleTitle`, which is idempotent for a fixed
week and exists because a generated title fed back in once produced
"Module 08: Module 08: Module 08".

**AC3d.** Creating a module and populating it is NOT in scope. The bar already
has "Add to each", and chunk D covers carrying a module's pattern forward. A
command that asks for populated modules creates the modules and says plainly
that their contents were not created.

---

## 4. The proposal

**AC4.** Per affected object: what it is now, what it would become, and which
of the three outcomes applies - MODIFY, CREATE, or UNSUPPORTED. Nothing is
written before the instructor applies.

**AC5.** Per-object failure is per-object, in both the proposal and the apply
step, reusing `ModuleContentResult` / `describeOrphans` rather than a new
vocabulary. "The model returned nothing for item 3" and "Canvas rejected the
write for item 3" stay distinguishable - collapsing distinct failures into one
state is the defect this repo's loop catches most often.

**AC6.** Applying is idempotent in the weak sense that matters: re-applying an
unchanged proposal must not create duplicate modules (AC3c's pre-check) and
must not re-issue writes whose target already matches the proposed value.

---

## 5. The control

**AC7. One box, two buttons, no mode switch.** The group holds the textarea
plus one action that uses the text as CONTEXT for the next generation (chunk
E's AC12a-g, if that has landed) and one that submits it as a COMMAND. A mode
toggle would be one more thing to get wrong and would make the two behaviours
indistinguishable at a glance - the confusion the bar's consequence model
exists to prevent. The two sit at different tiers and are styled accordingly.

**AC8.** The box persists across reloads under a `ta-`-prefixed per-course key
(repo invariant), read through a tolerant resolver.

**AC9. The box is never parsed.** It is free text handed to a model. No
pattern-matching, no special tokens, and nothing downstream branches on its
contents. If structured control is ever wanted, that is a separate designed
input, not this box growing a syntax.

---

## 6. Non-goals

- No writes without an applied proposal (AC1).
- No touching the five dedicated-control fields (AC3b).
- No populating created modules (AC3d).
- No cross-course commands.

## 7. Testing reality

vitest here is node-env and renders NO component. The proposal model, the
outcome vocabulary, the module-creation plan and the unsupported-request
classifier must all be pure and extracted, because they are the only parts
that can be tested at all. Nothing will prove the proposal renders, that the
apply button is reachable, or that a screen reader announces the change count.

## 8. Gates

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build      # compile line only
```

No emojis; ASCII only in comments. 1000-line ceiling via
`@(Get-Content path).Count`. **`ModulesView.tsx` is at 998 - it MUST be split
before this chunk touches it.** Measure the test baseline at dispatch; a
carried-forward number has caused two corrections already.
