# Three follow-ups: rubric sources, the module column, and lifting the visualizer cap

One chunk, three independent pieces of work. They share nothing but the push.

1. **The rubric picker looked broken and was not.** Bulk rubric association
   already existed; two defects made it read as missing.
2. **The Assignments and Quizzes tabs now name each item's module.**
3. **Visualizer page creation moves behind a Route Handler**, lifting the
   2-page-per-run cap that a Server Action's 60s ceiling forced.

---

## 1. Rubric sources

### The finding

The instructor asked for "a bulk action for associating a rubric". It already
existed and was fully wired: select items on the Modules screen and the bulk
bar has a rubric dropdown, an Associate button, plus Edit and New rubric
(`BulkItemsSection.tsx:335-372`, `useRubrics.ts`, `useBulkItemActions.ts`).
So the work was finding out why it looked absent. Two defects each produce
exactly that symptom:

- **Account-level rubrics were never fetched.** `listRubrics` hit
  `/courses/:id/rubrics` only. Canvas rubrics are very commonly defined at the
  ACCOUNT level and shared across courses. With none at course level the
  dropdown renders "No rubrics" and is disabled - indistinguishable from a
  missing feature.
- **A failed fetch was indistinguishable from an empty one.** The call used
  `safeFetchAll`, which swallows errors and returns `[]`, and `useRubrics`
  dropped the error arm. A permissions problem, an expired token or a bad
  course URL all rendered as "No rubrics", silently.

### Acceptance criteria

**R1.** Rubrics offered to a course include ACCOUNT-level rubrics as well as
course-level ones. The endpoint and the way the account id is resolved must be
established from Canvas's own documentation, not assumed.

**R2.** A rubric is identifiable as course-level or account-level wherever
that distinction matters to the instructor - in particular, an account rubric
this app cannot edit must not offer an Edit control that will fail.

**R3.** A FAILED rubric fetch surfaces a real error. "This course has no
rubrics" and "we could not load your rubrics" must be distinguishable, through
the existing note channel, never a second one.

**R4.** One source failing never discards the other's results. A partial load
shows what loaded and says what is missing.

**R5.** A 401/403 from the account endpoint is NOT an error - that is the
ordinary case for a non-admin instructor, and treating it as a failure would
put a scary note in front of most users.

**R6.** No behaviour change for a course whose rubrics are all course-level
and load cleanly.

**R7.** Everything already working keeps working: Associate, the rubric
builder's New and Edit paths, and the refresh after building a new rubric.

---

## 2. The module column

### The data problem

A `BulkItem` carries no module information - the flat list comes from
`/assignments` or `/quizzes`, which know nothing about modules. The
association lives only in the module tree, so the join is
(module item type + contentId) -> module name.

The subtlety, and the thing a naive implementation gets wrong: the module
item's type is NOT the tab's kind.

| Object | Module item type | contentId is |
| --- | --- | --- |
| Ordinary assignment | `Assignment` | the assignment id |
| Classic quiz | `Quiz` | the QUIZ id |
| New Quiz | `Assignment` | the ASSIGNMENT id |

`effectiveKindOf` (`courseItems-routing.ts`) already encodes exactly this
distinction for the write paths, and its output IS the module-item type string
to look up - so it is reused, never re-derived.

### Acceptance criteria

**M1.** Each row in the Assignments tab names the module it belongs to. The
Quizzes tab does the same - it is one view and the same question.

**M2.** An item in NO module says so explicitly (an unassociated assignment is
usually a mistake worth seeing), and is visually distinguishable from "not
loaded yet".

**M3.** An item in SEVERAL modules names all of them. Canvas permits this and
showing only the first would be a lie.

**M4.** The module tree is fetched ONCE alongside the items list, never per
row. If that fetch fails, the items list still renders in full and the column
degrades, with the failure surfaced through the note channel. Losing the tab
because a secondary fetch failed is not acceptable.

**M5.** The mapping is a PURE function in its own leaf with unit tests. This
repo's vitest never renders a component, so logic inside the `.tsx` cannot be
exercised at all.

**M6.** A reload after a bulk write refreshes the associations too, so a
move-to-module performed elsewhere cannot leave this stale.

**M7.** Ids do not cross-match between kinds: an assignment id equal to some
quiz id must not associate the wrong row. The lookup key is
type-discriminated.

---

## 3. Lifting the visualizer create cap

### Why

`createVisualizerPagesForGapsAction` LLM-authors a component and commits three
files per concept to a separate GitHub repo - roughly two LLM calls and five
GitHub operations per page, about 17-22 seconds. It ran as a Server Action,
and this app's Server Actions have no `maxDuration` (`src/app/page.tsx` is a
client component and sets none), so they are capped by Vercel Hobby's hard 60s
ceiling. That forced a cap of 2 pages per run, which makes clearing several
gaps tediously slow. REGRESSION entry 323's Limits records this as the queued
fix; `src/app/api/lms-generation/deck/route.ts` is the established precedent -
deck generation was moved off a Server Action for exactly this reason.

### Acceptance criteria

**V1.** A Route Handler owns the page-creating work, with an explicit
`maxDuration` and `runtime`, set the way the deck route sets them.

**V2.** The cap rises to a number the implementation's own arithmetic supports
inside the new ceiling, with that arithmetic written down in the constant's
comment. `notAttempted` is still reported, so a capped run is never mistaken
for a finished one.

**V3.** The client handles a non-JSON response (a platform timeout page, an
auth redirect) as a clean error rather than letting `JSON.parse` throw -
`useSelectionDownload`'s `readErrorMessage` is the precedent.

**V4.** EVERY safety property of the Server Action survives the move and is
still enforced ON THE SERVER: owner-scoping; a `topic-not-creatable` gap can
never reach creation even from a hand-crafted payload; the visualizer index is
re-read at creation time so a concept that gained a page since the scan is
skipped; per-concept failure is isolated; and nothing writes to Canvas.

**V5.** A platform kill mid-run still cannot be intercepted from inside the
handler. The cap remains the actual defence, and a comment says so, so nobody
mistakes the route for a guarantee.

**V6.** The two-click arming, the label swap and `ARM_COMMIT_MIN_MS` are
untouched and still pinned by their existing tests.

**V7.** The capability is not reachable by two paths at once - either the old
Server Action goes, or there is a stated reason for keeping it.

---

## Out of scope

- `ModulesHeaderBar`'s separate top-toolbar rubric picker has the same
  account-rubric Edit gap; flagged, not fixed here.
- A Discussions tab (graded discussion shadow assignments are currently in
  neither new tab - see REGRESSION entry 325).
- Re-checking link reachability after generation time.
