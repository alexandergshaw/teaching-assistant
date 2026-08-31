# Telling an original post apart from the thread that branches off it

The owner's words:

> the app and table should also distinguish between an original post and the
> thread that branches off of it

Extends the Discussion replies feature (REGRESSION entries 367, 368, 369).
Today the extraction prompt **deliberately flattens threads**: it says to include
nested replies, return each as its own entry with its own author, and not to
merge a reply into its parent. So every post - top-level or nested - becomes an
indistinguishable row. This reverses that decision.

---

## 0. The two constraints that shape everything

**T0-1. The extraction loop is STATELESS per batch.** It sends up to 6 frames per
request and the model never sees the previous batch. A parent captured in batch 1
and its reply captured in batch 3 **cannot be linked by the model** - it has no
memory of the parent. Any design that depends on the model seeing both is not
implementable.

**T0-2. The client cannot stitch relationships either, and this is the finding
that settles the design.** "Order plus depth" breaks twice over:

- **At batch boundaries.** One batch ends mid-subthread and the next opens
  mid-subthread, so "the nearest preceding depth-1 row" is a row from a different
  conversation.
- **On upward scroll**, which reverses capture order against page order - and
  scrolling back up is normal behaviour, not an edge case.

So: **local, self-contained structure only, with no cross-row inference
anywhere.** The model reports what it can see about a post in isolation; nothing
downstream tries to reconstruct a tree.

---

## 1. What is actually readable off a screen, ranked honestly

Threading is conveyed visually, and this pipeline reads frames a vision model
already has to work at (measured: a 14.5px glyph arrives at 4.8px from a 4K
source before the half-scale floor rescues it).

| Cue | Reliability | Why |
| --- | --- | --- |
| An LMS-printed `Replied to X` line | **HIGH** | It is TEXT, and self-contained - it needs no other post in frame |
| Flush-left versus inset | **MODERATE** | Geometric and scale-dependent; fails predictably whenever no un-indented reference is visible, which is the normal state mid-subthread and guaranteed at the top of a scroll |
| A numeric nesting depth | **LOW - do not ask for it** | LMS views cap visual nesting, so depth 3 and depth 4 are pixel-identical. The number is not in the image. |

**T1. A wrongly-attributed thread is worse than a flat list**, because it
silently changes who the instructor thinks is being answered. So the governing
rule is the one the prompt already applies to authorship: **report `"unknown"`
rather than guess.**

**T1a. `"unknown"` renders as NOTHING - never as "top-level".** Otherwise every
uncertainty silently becomes a claim, which is the failure this whole section
exists to avoid.

---

## 2. Data shape

**T2.** `ReplyRow` gains two optional, **non-referential** fields:

```ts
threadPosition?: "root" | "reply" | "unknown";
replyingToAuthor?: string;   // only when the LMS printed a name
```

**T2a. There is deliberately NO `parentId`.** Parents are frequently captured
*after* their children (the instructor scrolls up), and referential state would
have to survive `removeRow`, `clearTable` and both serialization functions -
the exact functions REGRESSION 367 defect 4 records as having shipped twice with
the tested copy not being the live one. A dangling parent reference is a bug
class this feature does not need.

**T2b. `DISCUSSION_TABLE_VERSION` stays at `1`.** Absence and `"unknown"` render
identically, so an older stored table degrades correctly with no migration.
`deserializeReplyTable` coerces anything outside the three-member set to
`undefined`, and `replyingToAuthor` survives only as a non-empty string.

---

## 3. Extraction

**T3.** `extractDiscussionPostsAction` returns
`{ author, text, postedAt?, threadPosition?, replyingToAuthor? }`.

**T3a.** `buildPostExtractionPrompt` gains a THREAD POSITION block. It must say,
in substance:

- Report whether each post is a top-level post or a reply to another post, using
  only what is visible in these images.
- If the board prints a line naming who the post replies to, report that name in
  `replyingToAuthor`, exactly as shown.
- If you cannot tell from what is visible, return `"unknown"`. **Do not infer a
  position from a post's placement relative to posts in other images**, and do
  not guess a nesting level from how far a post is indented when no un-indented
  post is visible for comparison.
- Never report a `replyingToAuthor` you cannot read - a name inferred from
  context is a guess about a real person.

The existing rule that a post whose author is not visible is **skipped** stays
exactly as it is.

---

## 4. Dedupe

**T4. Thread position does NOT enter `isSamePost`.** The same post read from two
frames can legitimately differ on it - one frame shows the "Replied to" line,
another is scrolled past it. Adding it to identity would re-open the measured
10-of-16 false-split class.

**T4a. A live trap in the merge, and this one would silently lose data.**
`mergeCapturedPosts` currently touches a matched row **only inside the
longer-text branch**. `threadPosition` is the first field whose merge rule is not
"longer text wins": a `"reply"` reading arriving in a SHORTER re-read would be
discarded, and the row would keep `"unknown"` forever.

So reconciliation runs on **every** match, not only on the longer-text branch:

- `"unknown"` loses to a definite value, in either direction.
- A `"root"` versus `"reply"` contradiction **downgrades to `"unknown"`** rather
  than letting capture order decide. Two readings disagreeing is exactly the
  case where a guess is least defensible.
- `replyingToAuthor` fills when absent; a conflict clears it.

---

## 5. The table - a per-row attribute, NOT a tree

**T5.** No hierarchy, no indentation of rows, no collapsing. Each row carries:

- a `Reply` badge beside the existing state badge, when `threadPosition === "reply"`;
- a `Replying to X` line, **only** when the LMS printed the name.

**T5a. Why not a tree**, recorded so it is not reopened. A tree would have to be
flattened by **eight of the nine** sort modes, and its move semantics and F15's
visible-row `moveRow` rule would be **mutually undefined** - neither group
specifiable without the other. Both chosen cues also survive the 1000px stacking
breakpoint, because neither is geometric.

**T5b. `replyingToAuthor` must NOT enter the filter haystack** (F8's
`REPLY_ROW_HAYSTACK`). Searching a name would otherwise return posts BY that
person and posts AT that person, interleaved, with no way to tell which is which.

---

## 6. Drafting - the most valuable part of this group

**T6. When the parent is known, it goes into the drafting prompt as context.**
Today a reply to a nested comment is drafted with no sight of what it answers, so
the model responds to a fragment in isolation.

Gated on **all three**: `threadPosition === "reply"`, an LMS-printed
`replyingToAuthor`, and **exactly one** row matching that author under the
existing `authorsMatch`. Ambiguity means no parent context, not a best guess.

**T6a. The parent is labelled `CONTEXT ONLY - DO NOT REPLY TO THIS` and carries
NO post number**, so it is structurally unaddressable by the `1..N` output
contract. Budget is not the constraint - worst case is 5 x 600 characters, about
3.5% input growth - **conflation is**.

**T6b. The hallucination guard widens EXPLICITLY.** The existing rule forbids
stating a course fact not in "the post you are answering". With a parent in the
prompt that phrasing silently narrows; it becomes "the posts shown to you here".
Change it deliberately rather than letting it loosen by accident.

**T6c.** Parent resolution is a **pure exported function** in
`discussion-capture.ts` (`resolveDraftParent`). It is the only way the
three-condition gate gets a unit test at all, since vitest here renders no hook.

---

## 7. No per-depth audience variant

**T7.** Rejected. Replying to a top-level post and replying to a back-and-forth
are different acts, but the difference is *what the reply should do*, which the
parent context (T6) serves far better than a fourth register would. A new
register would touch persisted-value coercion, `draftingArmSignature` and the
control itself for a distinction the prompt already has the material to make.

---

## 8. Limits this group's REGRESSION entry must state

- **The biggest risk is a confident wrong `"root"`/`"reply"` at the top of a
  scroll**, where the gated parent context then makes the drafting model answer
  the wrong person - fluently, in the instructor's voice, with nothing in the UI
  or any gate to catch it.
- **The gate has never been tested against a real board.** Entry 367 records
  that extraction accuracy was never measured against any LMS, and no frame from
  this pipeline has ever reached the model under test.
- No component is rendered by any test, so the badge, the `Replying to` line and
  their absence when `"unknown"` are verified by reading.
- Indentation is never used as a signal, so a board that conveys threading
  *only* by indentation yields `"unknown"` everywhere - correct, and invisible.
