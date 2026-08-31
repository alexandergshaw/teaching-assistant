# Sorting by first or last name, and filtering the reply table

Extends the shipped Discussion replies table
(`docs/discussion-reply-capture-acceptance-criteria.md`, REGRESSION entry 367).

The owner's words:

> i also need the ability to sort the table by student's last names or first
> names, in addition to filtering the table by name/keyword

---

## 0. The two decisions that govern everything

**F0-1. A name that cannot be split confidently is reported as UNKNOWN, never
guessed.** This repo has already written an acceptance-criteria document whose
title is "name columns that do not invent names"
(`docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md`, REGRESSION
entry 361). Its rules are adopted here verbatim, because the input in THIS
feature is strictly worse: the author is whatever text a vision model read off a
screen, so it can be truncated, carry a stray timestamp, or be a display handle
rather than a name.

**F0-2. A filter changes what is VISIBLE and nothing else.** Eleven sites read
`rows.length` today. Three are capture-progress strings and **two are the
arming signatures for destructive actions**. If a filter narrows the array those
sites read, then a returning user with a stale persisted filter sees a truncated
table, a wrong "N posts found", and a `Delete table` whose confirmation names a
count that does not match what it deletes. That is REGRESSION entry 258's class
of defect - the confirmation must match the thing that would be deleted - and it
is the single biggest risk in this group.

---

## 1. Reuse survey

| Need | Reuse | Where |
| --- | --- | --- |
| The rules for splitting a display name | `docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md` N1, N5 item 16 - the RULES, adopted verbatim | that document |
| The shipped splitter | `deriveRepoGradeStudentName` - **read, not imported** | `src/app/components/repo-grades/repoGradeStudentName.ts:114` |
| The unknown-surname marker | `UNKNOWN_LAST_NAME_MARK = "-"` (em dash) | `repoGradeStudentName.ts:54` |
| Sort-header markup | already followed by this panel | `RepoGradesGrid.tsx:129-140`, mirrored at `DiscussionRepliesPanel.tsx:545-556` |
| Filter as a pure function over the row array | `filterTaskRows`'s per-row haystack shape | `src/lib/course-tasks-view.ts:474-507` |
| Filter-text persistence convention | `ta-<area>-search` / `-filter` (`ta-files-search`, `ta-drafts-search`, `ta-vc-bulk-filter`) | across `src/` |
| Text normalisation for matching | `normalizeForMatch` | `discussion-capture.ts` |
| "N of M" + Clear affordance | | `CourseItemsView.tsx:638-641` |

**`deriveRepoGradeStudentName` is a NEAR-MISS and must not be imported.** Its
second parameter is Canvas's `sortableName`, which a vision-read author string
can never have, and it lives in another feature's component folder. The rules
transfer; the function does not.

---

## 2. Where the new code lives - and why it is a new file

**F1.** The table-view logic goes in a **new leaf**,
`src/app/components/recording/discussion-table-view.ts`, plus its test - **but
the name derivation does NOT live there. It gets its own leaf.**

**F1a. `deriveReplyAuthorName` lives in `src/lib/person-name.ts`, a
dependency-free leaf that imports nothing from this feature.** This is a
correction: an earlier draft of this document put it in
`discussion-table-view.ts`, which would have created a module cycle the moment
the drafting prompt needed it.

The chain is real and was traced: the address-students-by-name control (a
separate, later group) needs the derived given name inside
`buildReplyDraftingPrompt`, which lives in `src/lib/discussion-reply-prompt.ts`.
`discussion-capture.ts` already re-exports constants **from** that prompt module.
So a prompt module importing a recording-folder module that imports
`discussion-capture.ts` closes a cycle - and this repo has recorded that a cycle
here **silently yields `undefined` and `tsc` does not catch it**.

A dependency-free leaf breaks it: `discussion-table-view.ts` imports
`person-name.ts` for sorting, `discussion-reply-prompt.ts` imports it for the
address line, and neither imports the other. Same "split constants into the
leaf" rule that already governs `resource-kind.ts` and
`discussion-reply-prompt.ts` itself.

`person-name.ts` is also the honest home for it on its own merits - deriving a
given and family name from a display string is not specific to a reply table,
and a second consumer already exists before the first has shipped.

This is not tidiness. `discussion-capture.ts`, `useReplyRows.ts`,
`useDiscussionReplies.ts` and both panel components are **all owned by groups
currently in flight** (`docs/discussion-reply-resources-acceptance-criteria.md`
assigns them to R-B, R-D and R-E). Adding this group's logic to any of them is an
ownership collision, not merely a line-count problem. The new leaf imports from
`discussion-capture.ts` one-directionally and requires no edit to a file another
set owns.

Measured, 2026-08-31: `discussion-capture.ts` 600, `useReplyRows.ts` 503,
`useDiscussionReplies.ts` **892**, `DiscussionRepliesPanel.tsx` 596,
`DiscussionReplyRow.tsx` 272, against a 1000-line ceiling enforced
non-recursively over that directory.

---

## 3. Name derivation

**F2.**

```ts
export type NameSource = "explicit" | "derived" | "single" | "none";

export interface ReplyAuthorName {
  firstName: string;
  lastName: string;          // "" when unknown - see F3
  source: NameSource;
  correctionHint?: string;
}

export function deriveReplyAuthorName(author: string): ReplyAuthorName;
```

Rule order, adopted from entry 361 and applied to the raw author string:

1. **A comma is the correction channel.** `"Smith, John"` -> `lastName: "Smith"`,
   `firstName: "John"`, `source: "explicit"`, no marker. An instructor who
   dislikes a derived split can fix it by typing a comma - and because the author
   cell is read-only in this feature, F6 provides the edit affordance.
2. **Two or more tokens, no comma** -> last token is the surname, the rest the
   given name, `source: "derived"`. Rendered **with a visible derived marker and
   a correction hint**, never silently.
3. **One token** -> `firstName` is that token, **`lastName: ""`, `source:
   "single"`**. A one-word name is not a first name with an empty surname; the
   surname is UNKNOWN.
4. **Empty after trim** -> `source: "none"`, both fields `""`.

**F3. The cell and the sort key read ONE derivation, and they differ
deliberately.** Entry 361 N5 item 16: cell text and sort key must come from the
same derivation "or the table sorts by something other than what it displays."
So both use `deriveReplyAuthorName` - but:

- the **cell** for an unknown surname renders the em dash `-`;
- the **sort key** for that row is `""`.

An em dash is a display convention, not a name; sorting by it would file every
mononym under a punctuation mark. `""` sorts blank-last in **both** directions
(F5). This split is exactly what entry 361 pinned with a source guard, and it
gets a test here too.

**F4. Nothing about this derivation is written back to the row.** `ReplyRow.author`
keeps the text the model read. The derivation is computed for display and
sorting only, so a later improvement to the rules re-derives everything rather
than migrating stored data.

---

## 4. Sorting

**F5. `ReplySort` gains four members and LOSES NONE.**

```ts
export type ReplySort =
  | "captured-asc" | "captured-desc"
  | "name-asc" | "name-desc"        // existing whole-string sort - KEPT
  | "first-asc" | "first-desc"
  | "last-asc" | "last-desc"
  | "custom";
```

**Removing or renaming `name-asc`/`name-desc` would make `isReplySort` reject
every stored value**, silently reverting a returning user's saved sort to the
default with no error. The existing whole-string sort stays as the "Name" header;
first and last are additional.

**F5a. The same hazard runs in the OTHER direction, and it is the one that
actually bit.** Widening the *type* in `discussion-capture.ts` does not widen the
*runtime validator*: `VALID_SORTS` / `isReplySort` live in `useReplyRows.ts`, in a
different file and a different agent's file set. A type carrying nine members
against a validator listing five means a persisted `"first-asc"` is rejected on
load and silently reverted to the default - the user picks a sort, reloads, and
finds it gone, with `tsc` perfectly happy because the type is not the check.

So the type and its validator move in the **same commit**, and whichever set owns
the validator adds the new members even when the type lives elsewhere. This is
the "coercion changes set membership" lesson in a new shape: the type is a
compile-time set, `VALID_SORTS` is a runtime set, and nothing forces them to
agree.

Comparison uses `localeCompare(b, undefined, { sensitivity: "base" })`, matching
the existing name sort. **Blank keys sort LAST in both directions** - a row whose
surname is unknown must not lead the table in descending order. Ties break on
`firstSeenAt` ascending so the order is deterministic and a re-render never
reshuffles equal rows.

**F6. Two headers, not one four-state header.** The `Name` column becomes two
sortable headers, `First` and `Last`, each cycling asc/desc. A single header
cycling four states costs up to three clicks to reach the mode you want and
cannot be labelled honestly. Click cost is a first-class factor here.

`aria-sort` remains on the active `<th>` only; every other sortable `<th>`
carries `"none"`, and non-sortable columns carry no `aria-sort` at all.

**F7. A `derived` surname shows its marker in the Last cell** with the
correction hint available (title/`aria-describedby`), and a `single` surname
shows the em dash. Neither is silent.

---

## 5. Filtering

**F8. The filter is GENERIC over the row shape, because a second table is
already coming that needs it.**

```ts
export function filterRowsByQuery<T>(
  rows: ReadonlyArray<T>,
  query: string,
  haystack: (row: T) => ReadonlyArray<string>
): T[];
```

Pure, in the new leaf, following `filterTaskRows`'s shape. The query is
lowercased and normalised **once**; each row is matched against the strings its
`haystack` function returns. An empty or whitespace query returns the input array
**by reference**, so the no-filter path allocates nothing.

The reply table supplies `row => [row.author, row.post, row.reply]`.

**F8a. Why generic, and why now.** The repo owner has asked that the
grading-by-recording table - a separate feature, surveyed but not yet specified -
be filterable on the column holding the name of the person whose work is being
graded. That is the same operation over a different row type.

Writing `filterReplyRows(rows: ReplyRow[])` here guarantees a second, nearly
identical implementation appears for the grading table. This repo has now
recorded **four** instances in two features of one rule implemented twice, where
the tested copy turned out not to be the one production called. A type parameter
and a `haystack` accessor cost nothing here and remove the occasion.

The same applies to the sort comparators and to `deriveReplyAuthorName` (F1a,
which is already going into `src/lib/person-name.ts` for exactly this reason).
**Do not** generalise further than these three on speculation - a shared "table
view" abstraction over two tables that do not exist yet is the refactor this
repo's own lesson warns against.

**F8b. A note for the grading table, recorded here because this AC owns the
helper.** Its name column does not hold a verified student identity - that
feature explicitly cannot bind a score to a student record. It holds a **label**
read off the screen, falling back to an ordinal like `Submission 3`. Filtering
that column is still useful and still correct; it just filters labels, and no UI
string there may imply the name was confirmed against a roster.

**F9. Memoise on `[rows, query]` and preserve row object identity.** At the
500-row ceiling with ~4000-char posts, a naive `toLowerCase().includes` per
keystroke allocates roughly two million characters. More importantly,
`DiscussionReplyRow` is wrapped in `React.memo` and every row updater in
`useReplyRows` already goes to some trouble to return the identical object for
untouched rows - a filter that rebuilds row objects destroys that, and the memo
stops biting. `filterReplyRows` returns the same object references.

**F10. Persistence: `ta-rec-disc-filter`**, a whole string literal, added to
`expectedKeys` in `recording-split.structure.test.ts` **in the same commit**. It
sorts between `ta-rec-disc-course` and `ta-rec-disc-save-video`, taking the count
from 48 to 49.

The filter persists, per the standing rule that every new control survives a
reload - but F0-2 and F11 are what make that safe.

---

## 6. What the filter must NOT change

**F11. Every count, every progress string and every arming signature reads the
UNFILTERED array.** Specifically: AC7's `N posts found`, the throttled live
sentence, AC7b's post-stop summary, all four AC59 empty states, the table and
bulk-bar render gates, and - most importantly - the `deleteSignature` and
`redraftSignature` used by `isConfirmArmed`.

If the arming signature read a filtered count, typing in the search box while
`Delete table` is armed would **silently re-arm it against a different number**,
and the confirmation would name a count that does not match what it deletes.
That is the exact defect `confirmArming.ts` exists to prevent.

**F12. Bulk actions act on the whole table, always.** `Draft the missing
replies`, `Redraft every reply` and `Delete table` are unchanged by the filter.
This repo's filter-plus-bulk idiom is a *selection* idiom - a filter narrows what
you can select, never what a selection means - and this table has no selection.
`Delete table`'s confirmation already names all N rows and continues to.

**F13. A fifth empty state, currently missing.** `total > 0 && filtered === 0`:

> `No replies match "<query>".`

with the Clear control beside it. Without this the user sees the "no posts were
found, check that you shared the right window" copy - which would be a lie, and
it is the string AC59 calls the most important in the feature.

**F14. A `shown of total` line and a Clear control** render whenever a filter is
active, so a filtered table can never be mistaken for a short one:

> `Showing 4 of 37 replies.  [Clear]`

---

## 7. Reordering under a filter

**F15. `moveRow` operates on the VISIBLE rows, and the filtered case breaks it
three separate ways today.**

`useReplyRows.ts:323` sorts the full array and `moveRowPure` swaps `index ± 1`
within it, so with a filter active:

1. a swap targets an **invisible neighbour** and nothing appears to happen;
2. `isFirst`/`isLast` are computed by the panel from the **filtered** array, so
   the boundary buttons lie in both directions - a row that looks first is not,
   and a genuinely-first row is reorderable;
3. AC53's `order` rewrite still fires and flips the sort to `"custom"` for a move
   the user cannot see.

The fix: `moveRow` takes **the visible id list** and swaps against adjacency in
that list, rewriting `order` across the full array so the result is stable when
the filter is cleared. The announcement (`Custom order.`) and the AC53
displayed-index rewrite are unchanged.

**F15a. What happens to a hidden row that sits physically between the two being
swapped - stated because it will otherwise be reported as a bug.** It keeps its
own `order` value and its object identity, untouched. So when the filter is
cleared, that row resurfaces sitting *between* the two rows that swapped, rather
than being dragged along with either.

That is the correct behaviour and the only defensible one: the instructor moved a
row relative to what they could see, and a row they could not see was not part of
that instruction. The alternative - renumbering hidden rows to keep them adjacent
to a visible neighbour - silently reorders content the user never looked at,
which is a worse surprise than the one above and impossible to undo by eye.

Implementation note, since the split is easy to get wrong: the helper takes the
full sorted array (for AC53's `order` rewrite) **and** the visible id list (for
adjacency) as separate arguments. Collapsing them into one loses whichever
property the other carried.

---

## 8. Tests

**F16.** The new leaf is pure and fully unit-tested in its own file,
`discussion-table-view.test.ts`. It imports no helper from any sibling
`*.test.ts` - that re-runs the sibling's `describe` blocks, a failure this repo
has already had - and duplicates any fixture it needs.

The name derivation is pinned by a **frozen literal oracle**: a hand-written
table of author strings and expected `{ firstName, lastName, source }`, covering
at minimum `"John Smith"`, `"Smith, John"`, `"Maria de la Cruz"`,
`"Rajesh Kumar Patel"`, `"Kim Jong-un"`, a mononym, an empty string, a name with
a trailing timestamp artifact, and a name with a middle initial. Expectations are
literals, never re-derived from the implementation.

Sort tests pin blank-last in **both** directions and the `firstSeenAt`
tie-break. Filter tests pin the by-reference identity of the no-query path and
that matching is case-insensitive across all three fields.

---

## 9. Limits this group's REGRESSION entry must state

- No component is rendered by any test. The two new headers, the search box, the
  `shown of total` line, the fifth empty state and the em-dash cell are verified
  by reading only.
- **The name rules were never run against a real roster.** They are adopted from
  a shipped feature's rules, applied to a strictly noisier input, and the frozen
  oracle is a set of hand-written cases - not evidence about what a vision model
  actually reads off any particular LMS.
- Nothing measures the filter's cost at the 500-row ceiling; the memo and the
  by-reference no-filter path are reasoned, not profiled.
