# Knowledge base: AI summary + Ask AI

A portable description of a feature built and shipped in another app, written
so it can be rebuilt somewhere else. It is stack-agnostic where it can be, and
specific where the specifics are the whole point.

## What it is, in one paragraph

A knowledge base holds a tree of pages belonging to an organisation. On top of
any node of that tree sit two AI capabilities that share one retrieval
pipeline: a **scope summary** (a generated overview of everything beneath the
current node) and **Ask AI** (a grounded question-answering box over the same
scope, with citations back to the pages that supported the answer, and a
persisted history of prior questions). Both are scoped: at the root they cover
the whole knowledge base; on a page they cover that page and its descendants.

## The two capabilities

### 1. The scope summary

- One stored summary per `(user, organisation, scope)`. Regenerating replaces
  it rather than appending.
- It **generates itself on first view** when none exists, and offers an
  explicit refresh afterwards. Users do not have to know a button exists to
  get value from the panel.
- It records which pages actually fed the generation, and it **says plainly
  which pages were left out**. That honesty is load-bearing: a summary that
  silently omits half the scope while presenting itself as complete is worse
  than no summary.
- It shows staleness - added, removed, or edited pages since it was generated.

### 2. Ask AI

- A question box over the same scope, placed **above** the summary. The
  ordering was deliberate: the question is what people come for; the summary
  is what they read while deciding what to ask.
- Answers are **grounded** - the model is told to answer only from the
  supplied pages and to say so when it cannot.
- Answers carry **citations** back to specific pages, rendered as links.
- Prior questions and answers persist as a per-scope history, individually
  deletable and clearable in bulk.

## Scope model

Scope is either the whole organisation or a single page and its subtree. Two
practical notes:

- The scope's identity must be storable as a database key. A nullable
  `scope_page_id` (null meaning "whole organisation") cannot be an upsert
  arbiter on its own - a nullable column in a uniqueness key does not behave
  the way you want, and the upsert fails.
- **The fix is a stored generated column** that coalesces the nullable page id
  to a fixed sentinel UUID, and a unique index over
  `(user_id, organisation, scope_key)`. Two partial indexes do NOT work as an
  upsert arbiter; this was learned the hard way (Postgres error 42P10).

## Data model

Two tables, both row-level-security scoped to the owning user.

**Summaries** - one row per scope:

| Column | Purpose |
| --- | --- |
| `user_id`, `organisation`, `scope_page_id` | ownership and scope |
| `scope_key` | **stored generated column**, `coalesce(scope_page_id, sentinel)`, the upsert arbiter |
| `summary` | the generated Markdown |
| `source_pages` | JSONB: every page in scope at generation time, each flagged with whether it was actually included |
| `model` | free text, no CHECK constraint - a new model id must never fail a save |
| `generated_at` | drives the staleness comparison |

**Questions** - one row per asked question, same scope columns, plus the
question, the answer, its citations, and a `grounded` boolean.

Two decisions worth copying:

- `source_pages` stores **every page in scope**, not just the included ones,
  each with an `included` flag and its `updated_at`. That single shape serves
  both the staleness check and the "here is what was omitted" notice. The
  caller does not need to know *why* a page was excluded - a per-page cap, a
  retrieval tier, or a character budget all read as `included: false`.
- `model` is free text deliberately. A CHECK constraint on model ids means a
  provider's new model breaks writes.

## Retrieval and context assembly

Both capabilities share one context builder:

1. Collect every page in scope.
2. Cap the number of page ids considered (a hard cap, ~100-400 depending on
   your budget). **Pages dropped by this cap never reach the builder at all**,
   so they carry no per-page record - surface them separately or they vanish
   silently while the summary claims full coverage.
3. For Ask AI, rank pages against the question before spending budget on them.
   The summary path has no question, so it takes pages in tree order.
4. Concatenate page bodies into a context block under a **character budget**
   (~10,000 chars is a reasonable starting point). Stop when the budget is
   spent; mark the rest excluded.
5. Attachments on pages are fetched and appended where readable, with a
   per-file size cap and a per-request count cap. **Count the ones you
   skipped and report the number** - a silently dropped attachment is a
   silently wrong answer.

Every page that makes it into the block is given a **numbered marker**
(`[1]`, `[2]`, ...). That numbering is the citation mechanism.

## Prompts

Two prompt builders over the same context block.

**Summary prompt.** Asks for an overview of the supplied pages, told to cover
what is actually there rather than what a knowledge base usually contains, and
to note gaps. Generation config worth stealing:

- Low temperature (~0.2), but be aware some model families reject a
  temperature below 1 and you may need to omit it rather than send it.
- **Set `maxOutputTokens` generously - 4096, not 700.** On models that do
  internal reasoning, thinking tokens share the output budget, and a small
  budget returns an *empty string* rather than a short answer. This was a real
  bug.

**Answer prompt.** Asks for a JSON envelope, not prose:

```json
{
  "answer": "markdown text",
  "citedPageMarkers": ["1", "4"],
  "answeredFromPages": true
}
```

- `citedPageMarkers` resolve **by index against the pages actually fed to the
  model** - never by title. A marker outside the range, or pointing at a page
  the budget excluded, is **dropped rather than guessed**. Title matching
  looks friendlier and is wrong: two pages can share a title, and the model
  will confidently cite a title that was never in the context.
- `answeredFromPages` is the model's own claim about grounding and is stored
  **as-is**. Do not re-derive it by string-matching the answer for phrases
  like "I don't know" - that heuristic misfires both ways.
- Parse defensively: extract the first JSON object from the response, and keep
  a fallback path for when the model returns prose instead of an envelope. In
  the fallback you have no citation signal, so record that citations were
  unavailable rather than recording zero citations, which reads as "grounded
  in nothing".

## Staleness

Computed **client-side, at render**, by comparing the stored `source_pages`
against the page tree the UI already holds - not computed on the server at
fetch time.

The reason: a server-computed staleness value freezes the instant it is
fetched and goes stale itself the moment a page changes without a reload. The
client already has the live tree; comparing there costs nothing and is always
current.

Compare on: page ids present then and now (added/removed), and each page's
`updated_at` (edited).

## Rendering

Model output is Markdown and must be rendered as HTML.

- **Use one hardened renderer for every piece of model-authored text**, and
  route both the summary and every answer through the same wrapper so a
  security fix lands in one place.
- If your codebase has more than one Markdown renderer, know which is which. A
  lightweight one may not support bold, italics, code spans or ordered lists,
  and swapping them silently degrades output.
- **This is an XSS boundary.** Model output can contain a `javascript:` URL,
  raw HTML, or an `onerror` attribute. Escape or strip; do not trust the model
  because you wrote the prompt.

## UI notes worth repeating

- **Ask AI above the summary.** The question box is the primary action.
- **Generate on first view.** An empty panel with a button is a panel most
  people never use.
- Persist the panel's open/closed state, the history's open/closed state, and
  the in-progress question text, keyed per scope, so switching scopes and
  reloading does not lose a half-typed question.
- Name the omitted pages explicitly, and the count of skipped attachments.
- A citation that points at a page which no longer exists should render as
  plain text, not a broken link - check existence before linking.

## Things that went wrong the first time

Listed because each cost real debugging:

1. **Nullable scope key + upsert.** Needs a stored generated column, not two
   partial indexes.
2. **`maxOutputTokens` too small.** Returned empty strings on reasoning
   models, not short answers.
3. **Citations resolved by title.** Must be by index against the exact page
   list sent to the model.
4. **Staleness computed server-side.** Froze at fetch time.
5. **Markdown rendered by an unhardened path.** Needed an XSS fix.
6. **Pages dropped by the hard id cap carried no record**, so they were absent
   from the "omitted pages" notice - the one place a user could have noticed.
7. **Grounding re-derived by string matching** instead of taken from the
   model's own structured claim.

## What this deliberately does not do

- No streaming - answers arrive whole.
- No vector store or embeddings; retrieval is scope collection plus a
  character budget, with question-relevance ranking for the Ask path. This is
  adequate up to a few hundred pages and is a lot less machinery.
- No cross-organisation search. Scope is always one organisation.
- No automatic regeneration on page edit; staleness is surfaced and the user
  decides.
