# AC16 - AMENDMENTS to AC-tasks-tab.md, after the adversarial audit

An independent audit attacked the acceptance criteria and both TDD test files before any
implementer saw them. It found genuine defects, several of them in the tests themselves.

**READ THIS FILE SECOND, AFTER `AC-tasks-tab.md`. Where the two conflict, THIS FILE WINS.**
Every item here is a correction, not an addition. The tests in `src/lib/course-tasks.test.ts` and
`src/lib/course-tasks-view.test.ts` have already been updated to match this file, and they are the
final authority on anything ambiguous.

## Corrections that change behavior

116. **Sorting is total only with a course-id tie-break.** AC7 item 36's claim that a course-name
     tie-break yields a total order is false, and the workbook proves it: "Course 1" appears three
     times (SCC, SHNU, Mid Plains), as do "Course 2" and "Course 3". The order is: the chosen
     field, then course name, then **course id**. Tie-breaks are always ASCENDING regardless of the
     sort direction (matching `courses-table-helpers.ts`). A blank or null institution/term sorts
     LAST in both directions.
117. **Sort-by-progress is a RATIO** (`done / applicable`), not a raw done count, and a row with
     `applicable === 0` must not produce `NaN` - NaN compares false against everything and makes
     the result depend on input order. Give it a fixed sentinel that sorts consistently.
118. **The persisted column set is `{v, columns, known}`.** AC7 item 39's versioned union handles
     built-ins added by an app upgrade; it CANNOT handle user-created custom tasks, because "custom
     task created since this set was written" and "custom task the user hid" are indistinguishable
     from a bare list of custom ids - so the naive design re-adds a hidden custom column on every
     parse, forever, making AC7 item 37 unachievable for exactly the columns AC9 introduces.
     `known` is the set of task ids that existed at write time; an id in `allIds` but not in `known`
     is unioned in once, and thereafter respects the user's choice.
     `serializeTaskColumnSet(columns, knownIds)` takes both. A persisted value with no `known` list
     (legacy) is treated as having seen only the ids it lists, so nothing is hidden by surprise.
     The version rule is `addedVersion <= storedVersion -> skip`, NOT
     `addedVersion !== storedVersion -> union`.
119. **`N/N` maps to `na`, not `blocked`** - recorded as a judgement call, not a fact. AC4 item 24
     called `N` "the sheet's N", but the workbook contains ZERO plain `N` values (tally over D:AQ:
     `Y` 260, `N/A` 122, `n/a` 6, `N/N` 1, plus free text). The lone `N/N` sits in column F beside
     122 `N/A`s and is far more plausibly a mistyped `N/A`. `N`/`No` still map to `blocked` for data
     typed in future.
120. **The unknown-id filter must NEVER be applied on the read-render-save path.** AC4 item 22's id
     filtering plus AC9 item 46's "a retired task's statuses are not deleted" are silently
     destructive in combination: if a read passes the RESOLVED catalog's ids (which exclude retired
     tasks), a retired task's history is dropped on read and written back without it on the next
     save - the exact data loss AC46 forbids. `coerceTaskCellMap`'s id filter is for import/paste
     validation ONLY. Renders and saves coerce without it.
121. **`position` is an index within the task's resolved GROUP; `null` means append to the end of
     that group.** This governs custom tasks and cross-group moves alike. A task moved to another
     group with no position appends there - it does not land at its old built-in index.
122. **Ties on equal `position` break by built-in catalog order, then by id.**
123. **`parseSheetCellValue` is for the Term Setup / import path only.** It stamps `doneAt: null` on
     every `done` result, and AC14 item 74 reads a null `doneAt` as never-expiring - so importing
     sheet values into a daily or weekly task would produce ticks that never reset. Either reject a
     non-`once` cadence at the call site or pass `nowMs`. Do not leave it ambiguous.

## Corrections that resolve contradictions

124. **AC5 item 25 IS superseded by AC15 item 98.** Clicking a cell does NOT open an editor. Click
     cycles the status. The editor/menu is reached by right-click, the context-menu key, or `F2`.
     AC15's "Interaction" header claimed to supersede item 26 while item 97 said item 26 stands -
     item 26 (Enter/Space cycles) STANDS; it is item 25 that goes.
125. **`Enter` is bound to cycling only.** AC15 item 98's "Enter on the cell's menu affordance" is
     withdrawn - it double-bound the key. Per the ARIA APG grid pattern, `F2` enters cell edit mode
     (making the cell's inner controls tabbable) and `Escape` leaves it, restoring the grid's
     single-tab-stop contract. Add F2/Escape to AC15 item 95's required key list.
126. **Single-key shortcuts are `d` = done, `n` = blocked, `a` = n/a, `o` = open.** AC15 item 97 had
     `n` = n/a and `b` = blocked, backwards from the vocabulary already in the instructor's head,
     where the sheet's `N` means no. Still scoped to a focused gridcell only (WCAG 2.2 SC 2.1.4,
     "Active only on focus").
127. **Deleted from AC15 item 90:** the claim that the hollow ring "distinguishes outstanding from
     never touched". AC4 item 21 makes absence and `open` the same thing, so the model cannot make
     that distinction and the glyph must not pretend to. The ring is justified simply as an open,
     round silhouette distinct from the other three.
128. **One dash, one ratio format.** `formatTaskProgress` returns `"12/38"` (no spaces) and `"-"`
     (ASCII hyphen-minus, U+002D) when nothing is applicable. AC8 item 40's "em dash", AC15 item
     90's "en dash" for the `na` GLYPH, and AC15 items 85/101's spaced `12 / 40` were three
     different things for two concepts. The `na` cell glyph stays an en-dash SHAPE (drawn as SVG,
     see 129); every ratio is unspaced. **AC15 item 101 does NOT supersede AC8 item 40's denominator
     rule** - the denominator always excludes `na`.
129. **AC13 item 67 beats AC15 item 90's check mark.** `src/lib/no-emojis.test.ts` flags Dingbats
     (U+2700-U+27BF) and Miscellaneous Symbols (U+2600-U+26FF) as emoji, and every check-mark code
     point (U+2713, U+2714, U+2705, U+2611) lives in one of them; the single authorized U+2705
     exception is scoped to one unrelated file. **Draw all four status glyphs as inline SVG paths**,
     not characters. Geometric Shapes and the en dash would have been permitted, but one rule for
     all four is simpler and carries no emoji-test risk.
130. **`blocked` stays persistent across periods - here is why, since AC14 item 74 only declared
     it.** A block is a statement about the world ("the dean has not sent the template"), not about
     today's effort, and it does not stop being true at midnight. Auto-clearing it would silently
     discard the one signal the instructor deliberately raised. It counts as outstanding, which is
     correct - a blocked task is not done.

     **WITHDRAWN clause (my error, caught by the accessibility audit):** this item originally also
     promised that "the cell's accessible name and tooltip state when it was marked, so a stale
     block is visible rather than invisible." That is unimplementable as designed - `doneAt` is null
     for a `blocked` cell (AC4 item 19 forces the pairing), so the timestamp does not exist to
     report. A `blockedAt` field would be the honest way to deliver it and is deliberately NOT being
     added now; the justification above stands on its own without it. If stale blocks turn out to be
     a real problem in use, that is the change to make.
131. **AC15 item 99's deferral is legitimate and must be worded as such.** The APG grid pattern
     lists cell-range selection under "If the grid supports selection of cells" - conditional, not
     required - so deferring Shift+Arrow ranges does not violate item 95's "full contract".
132. **`outstandingOnly` is scoped to the VISIBLE task columns**, and when every column in the view
     is hidden the toggle is disabled rather than silently emptying the table.
133. **Search matches notes on VISIBLE tasks only.** A hit on a hidden, retired or other-view column
     reads as a bug, and all three share one status map (AC14 item 71).

## Corrections to concurrency and accessibility

134. **AC5 item 29's remedy is incomplete as stated.** A server-side read-merge-write is still two
     round trips: two concurrent requests can both read, both merge, and the second wins. The
     shipped mitigation is a per-course promise chain in the data hook, so at most one request per
     course is in flight while different courses still write concurrently. The residual (two browser
     tabs, same course, same instant) is documented in code rather than papered over; closing it
     fully needs a single atomic `jsonb` merge statement.
135. **Add WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum) to AC12.** This grid has four sticky
     panes - header rows on top, the identity and progress columns on the left, the footer at the
     bottom - and a cell reached by arrow keys can land fully hidden behind any of them. Arrow
     navigation must scroll the focused cell clear of every sticky pane, not merely into the scroll
     box.
136. **Extend AC15 item 84's z-index scheme to all four panes**, and note that `position: sticky` on
     `<tfoot>` is not reliable - apply it to each footer `<td>` with `bottom: 0`. Every sticky cell,
     footer and progress column included, needs its own opaque background.
137. **AC15 item 115's `title`/1.4.13 citation is loose.** The Understanding document for SC 1.4.13
     carves out user-agent-rendered content, so a native `title` tooltip arguably falls outside it.
     The practical objection (invisible on touch, unreliable for keyboard, not selectable) stands on
     its own - keep the rule, drop the normative claim. Likewise AC15 item 89: SC 1.4.10's text
     exempts "parts of the content which require two-dimensional layout"; it is the Understanding
     document, not the criterion itself, that names data tables.
138. **AC15 item 112 (no zebra striping) diverges from `CoursesTable.module.css`, which does use
     `:nth-child(even)` banding.** Carry the same explanatory comment item 108 requires for the
     header casing, so the divergence reads as a decision rather than an oversight.

## Factual corrections

139. `src/lib/weekly-checklist.ts` is **444 lines**, not 418 (AC14 item 75). The earlier figure came
     from `Get-Content | Measure-Object -Line`, which silently skips blank lines - use
     `@(Get-Content <file>).Count` for the AC13 item 66 cap check. The rest of item 75 is accurate:
     `isSameLocalDay` and `isSameLocalMonth` are module-private at lines 223 and 229.
140. Assumption A1's citation is wrong in detail; the conclusion is unaffected and in fact
     strengthened. From the real sheet: `Talk with dean`, `Talk with dept chair`, `Talk with lead`
     and `Talk with dean/Farrah` are all in column **M**; `Email dean` is in **R**;
     `Department Chair` is in **S**; `Dean?` is in **Q** and **R**.
141. The sheet has **26** populated course rows (3-28), so AC15 item 91's cell count is 40 x 26 =
     1040, not 1200. The argument is unchanged.
142. AC11 items 53/55 never named the payload column. The SHIPPED schema (already applied, see
     `supabase/migrations/20260924000000_course_tasks.sql`) is
     `course_tasks(id, user_id, course_id, statuses jsonb not null default '{}', created_at,
     updated_at)` with a unique index on `(user_id, course_id)`, and
     `course_task_defs(id, user_id, task_id, view_id, group_id, label, cadence, sort_position,
     retired, custom, created_at, updated_at)` with a unique index on `(user_id, task_id)`.
     `view_id`/`group_id`/`sort_position` avoid the reserved words `view`/`group`/`position`.

## New pure helpers the tests now require

143. `normalizeTaskLabel(raw: unknown): string` - trims, collapses internal whitespace runs, caps at
     200, returns `""` for blank or non-string. This is AC9 item 49's validator, which previously
     existed only as prose.
144. `taskCellAccessibleName(courseName, task, cell, nowMs): string` - `"<Course>, <Task>: <Status>"`
     plus `", note: <note>"`. Status words are `Done` / `Not done` / `Blocked` / `Not applicable`,
     and it reports the EFFECTIVE (period-scoped) status. AC12 item 60 is the most citation-heavy
     accessibility requirement in the document and had no testable home.
145. `TASK_COLUMNS_ADDED_IN` is exported so a test can assert no entry names a version above
     `CURRENT_TASK_COLUMNS_VERSION` - the drift bug `courses-table-helpers.ts` warns about. It ships
     empty at v1.

## Audit findings I checked and REJECTED

146. The audit reported that `src/app/url-state.test.ts` lacks `buildUrlSearch` coverage for the
     Tasks tab. **This is wrong** - I read the file directly. It covers the bare-tab URL, the
     non-default sub-view, non-leakage across `courses`/`manual`/`workflows`, and the round trip
     (lines ~367-380 and ~508-515). The audit read a stale diff while another agent was landing
     that file. No action needed.

## Post-ship UI changes

147. **AC15 item 92's corner mark is superseded - it is now a wedge, not a dog-ear.** The mark is
     a density-scaled WEDGE (28px x 14px default, 24 x 12 compact, 32 x 16 comfortable) in
     `var(--accent-ink)`, not a 7px x 7px 45-degree dog-ear in `var(--accent)` - roughly 8x the
     area, because a note was too easy to miss while scanning a wide grid. Same corner, same
     CSS-drawn-triangle technique, and the four-corner scheme is unchanged. See
     `docs/REGRESSION.md` entry 252 for the full contract.
