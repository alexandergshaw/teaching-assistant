# ONE-OFF-TASKS W3 - TDD test notes and oracles (the UI wave)

Seat: `loop-test-author` (Opus). Consumer: a fresh `loop-checker`, then
`loop-implementer`. Built from the SHIP-checked scope `docs/one-off-tasks-scope.md`
(W3 wave section `:542-555`, AC3-AC6 `:149-160`) and the W2 notes
`docs/one-off-tasks-w2-test-notes.md` (residual register `:319-328`), both read in
full. Fork 1 = reading A (new top-level tab, shipped W1 at 3b20328e); Fork 2 = (b)
Supabase (shipped W2 at 9f8276c5). This file decides WHAT is measured and HOW it
fails. It is not test code and not production code.

**W3 builds the UI**: it wires `useOneOffTasks` into `OneOffTasksTab`, renders the
task list + a composer (title + college + notes + due date) + CRUD controls
(toggle done, edit, delete) + per-college grouping + college/status filters, and
closes the W2 LOW residual (the notes cap).

## THE HARD CONSTRAINT THAT SHAPES THIS WHOLE FILE

`docs/loop/this-repo.md` section 2 and 6, re-confirmed against the tree:
**no component is rendered by any test in this repo.** vitest is `environment:
"node"`, collects only `src/**/*.test.ts`, has no jsdom/testing-library/render,
and the network is blocked (`vitest.setup.ts` throws on real fetch). So the
machine-checkable surface for a UI wave is THIN and that is correct. **No
`render()`, no `renderHook`, no fake "it paints" test appears below** - inventing
one would be a false green, which is the exact class this seat exists to prevent.
Everything about LOOK, felt interaction, keyboard, copy voice, and
actually-survives-reload is routed to the owner/browser residual register
(section 7) with owner + instrument + step.

What remains machine-checkable for W3 is exactly three things, and nothing was
padded beyond them:

1. the **notes cap** as a pure model function (section 3.1) - genuinely testable;
2. **reachability wiring** by source-text (section 3.2) - the hook is actually
   called and the CRUD/registry/state symbols are referenced, so the tab cannot
   ship dead behind a static shell with every gate green;
3. the **persisted-control keys** by source-text/structure (section 3.3) - the
   two shipped filter keys are read AND written, plus a frozen-set ratchet.

Items 2 and 3 are SOURCE-TEXT claims: they prove a symbol/literal is present and
wired in the source, NEVER that a control is bound to the right handler or that
state survives a real reload. Each row below states its claim at exactly that
precision. The repo's own history (verify-reachability-not-just-correctness; a
capability shipping dead with every gate green) is why these thin pins earn their
place anyway.

---

## 0. Satisfiability (seat obligation 1), stated honestly

- **The only NEW pure function is `validateNotes`** (section 3.1). Its spec is a
  byte-for-byte mirror of the SHIPPED, currently-GREEN `validateTaskTitle`
  (`src/app/components/one-off-tasks/one-off-task-model.ts:35-40`, opened) with a different cap
  constant (`NOTES_MAX = 2000`, `:6`, opened) and "empty is allowed". Because the
  sibling it copies is already satisfiable and passing in the tree, so is this; I
  did not spin a throwaway tree for a one-line copy, and I say so rather than
  claiming a reference run I did not do.
- **The source-text pins (sections 3.2, 3.3) scan files W3 has not written yet.**
  Their satisfiability is therefore ARGUED, not run: a component that calls
  `useOneOffTasks()`, references the CRUD methods / `useInstitutions` /
  `groupTasksByCollege` / `loading` / `error`, and wires the two shipped `ta-`
  keys with both `getItem` and `setItem`, passes every one of them. That shape is
  precisely what the scope's W3 wave (`:548-554`) specifies, so the spec is
  constructible by the implementation the plan already calls for. Nothing here is
  contradictory or impossible; the one thing I cannot do before the files exist is
  execute the scan, and that is a property of a source-text pin on an unbuilt
  file, not a gap in the spec.

---

## 1. Grounded anchors (opened/measured against the tree this session)

| What | file:line | Measured/opened |
|---|---|---|
| `NOTES_MAX = 2000` exported, **enforced NOWHERE** | `src/app/components/one-off-tasks/one-off-task-model.ts:6` (declaration); `grep -n "NOTES_MAX\|validateNotes"` repo-wide returns ONLY this declaration + two backlog mentions - no usage, no `validateNotes` exists | measured (`Grep NOTES_MAX\|validateNotes`) |
| `validateTaskTitle` (the mirror for `validateNotes`) | `one-off-task-model.ts:35-40` | opened |
| The action calls `validateTaskTitle` but NEVER validates notes | `src/app/actions/one-off-tasks.ts:38-39` (add), `:59-63` (update) - `input.notes`/`patch.notes` passed straight through uncapped (`:43`, `:68`) | opened |
| Two persisted filter keys already shipped in the hook | `src/app/components/one-off-tasks/useOneOffTasks.ts:17-18` (`ta-one-off-college-filter`, `ta-one-off-status-filter`), read via `readKey`/`getItem` `:24-30,55-57`, written via `writeKey`/`setItem` `:32-38,156,161` | opened + measured (`Grep ta-one-off`) |
| The hook's CRUD surface W3 must wire | `useOneOffTasks.ts:179-191` returns `{ tasks, visibleTasks, loading, error, filter, add, update, toggleDone, remove, setCollegeFilter, setStatusFilter }` | opened |
| Institution registry to REUSE (do not invent a parallel list) | `src/lib/institutions.ts:92` (`export function useInstitutions(): string[]`), `:111` (`export function useInstitutionSelection`) | measured (`Grep`) |
| Grouping/filtering pure fns (W2-tested, DO NOT re-test) | `one-off-task-model.ts:52-73` (`groupTasksByCollege`), `:82-89` (`filterTasks`); tests `one-off-task-model.test.ts:43-106` | opened |
| EXISTING client/DB boundary gate scans the whole component dir | `one-off-tasks-client-boundary.structure.test.ts:8` (`DIR`), `:13-18` (`readdirSync`, `.tsx?`, excludes `.test.`), `:30-37` (non-empty + dead-scan canary) | opened |
| `OneOffTasksTab.tsx` today = 18 lines (W1 shell) | `src/app/components/one-off-tasks/OneOffTasksTab.tsx` | opened |
| file-size ceiling (unconditional), scans all of `src/` | `src/file-size-ceiling.structure.test.ts` (LIMIT 1000, `:41`) | per this-repo.md:42-49 |
| no-emojis scans `src/` AND `docs/` (so this notes file too) | `src/lib/no-emojis.test.ts` | per this-repo.md:177 |
| source-bytes (new files must stay text) | `src/source-bytes.structure.test.ts` | per this-repo.md:175 |

---

## 2. Files W3 creates or edits (purpose + the sabotage that must redden it)

NO cross-test-file imports (`no-cross-test-file-imports` memory): each test file
duplicates any fixture it needs; importing from another `*.test.ts` re-runs its
`describe` blocks. Do NOT name any comment-strip helper with the literal banned by
`strip-comments-agreement.structure.test.ts`; W3's tests need no comment
stripping, so this should not arise.

Production files the implementer writes/edits (listed for the test-to-source map):
`.../one-off-task-model.ts` (ADD `validateNotes` + its result type),
`src/app/actions/one-off-tasks.ts` (CALL `validateNotes` in add + update),
`.../OneOffTasksTab.tsx` (full UI; may be split - section 6), and any extracted
control leaves under the same dir.

| Test file | New/edit | Purpose (one line) | Headline sabotage that MUST turn it red |
|---|---|---|---|
| `.../one-off-task-model.test.ts` | EDIT (append `describe("validateNotes")`) | pin the notes cap: accept `<= NOTES_MAX`, reject `NOTES_MAX+1`, empty allowed | drop the cap check in `validateNotes` (always `ok:true`) |
| `.../OneOffTasksTab.wiring.test.ts` | NEW | reachability: the tab calls the hook and references CRUD / `useInstitutions` / grouping / `loading` / `error` | delete the `useOneOffTasks()` call (tab reverts to a static shell) |
| `.../one-off-tasks-persist-keys.structure.test.ts` | NEW | the two shipped filter keys are read AND written in the component dir; frozen-set ratchet + dead-scan canary | remove the `writeKey(COLLEGE_FILTER_KEY, ...)` call |

Existing repo-wide instruments W3 must RUN (no new code; they react to the new/
edited files): `one-off-tasks-client-boundary.structure.test.ts` (already scans
the dir - see section 4), `src/lib/use-server-exports.test.ts` (W3 edits the
`"use server"` action file), `src/source-bytes.structure.test.ts`,
`src/file-size-ceiling.structure.test.ts` (unconditional), `src/lib/no-emojis.test.ts`,
and `src/app/components/tabs/topLevelTabs.wiring.test.ts` (confirm the W1 render
branch stays green now that the tab renders real content).

---

## 3. The verify table (object under comparison / instrument / direction)

"Frozen literal" = an expected value written out in the test, never derived from
the thing under test.

### 3.1 Notes cap - pure model function (EXECUTABLE here)

**Recommendation, stated as the brief requires: put the cap in the MODEL as a pure
`validateNotes`, not only in the action.** The pure function is machine-covered
here; a cap living only inside the `"use server"` action is NOT unit-testable in
this checkout (the action calls `requireUser()` + `createServiceClient()`, which
need auth/env/DB that do not exist here - `this-repo.md` section 6). So the model
function is the testable enforcement point, and the action then calls it exactly
as it already calls `validateTaskTitle` (`actions/one-off-tasks.ts:38,59`). The
action-side call is itself owner/review-verified (section 7, RW3-NOTES-ACT),
because its runtime behaviour is not reachable here.

Proposed signature (mirror of `validateTaskTitle`; empty notes allowed):
`validateNotes(raw: string | undefined): { ok: true; notes: string } | { ok: false; reason: "too-long" }`.

| # | Object | Instrument | Direction (RED when) |
|---|---|---|---|
| R-NOTES-1 | `validateNotes("x".repeat(2001))` | `.toEqual({ ok: false, reason: "too-long" })` (frozen literal) | over-cap accepted, or wrong reason |
| R-NOTES-2 | `validateNotes("x".repeat(2000)).ok` | `.toBe(true)` (boundary) | cap is off-by-one (rejects exactly-cap) |
| R-NOTES-3 | `validateNotes("")` and `validateNotes(undefined)` | `.toEqual({ ok: true, notes: "" })` (frozen - empty/absent notes are valid and normalise to `""`) | empty/undefined rejected, or normalised to `null`/`undefined` |
| R-NOTES-4 | `validateNotes("  keep me  ")` | `.notes` `.toBe("  keep me  ")` OR `.toBe("keep me")` - **pin whichever the implementation chooses, but pin it** | the trim policy is silently inconsistent with the title policy |

Construction of the oracle O-NOTES: by hand from the rule - `undefined`/empty ->
`{ok:true, notes:""}`; `len > 2000` -> `{ok:false, reason:"too-long"}`; else
`{ok:true, notes:<raw or raw.trim()>}`. The cap `2000` is `NOTES_MAX`
(`one-off-task-model.ts:6`); **pin the constant via the boundary pair R-NOTES-1/2,
not via the literal `2000` in source** (source-text over-pin is a documented
defect here - `source-text-tests-overspecify` memory). R-NOTES-4 names the one
open sub-decision (does notes trim like title, or preserve whitespace?) and
requires the implementer to pin whichever they pick so the behaviour is frozen
either way; I do not force a choice because nothing in the scope settles it.

### 3.2 Reachability wiring - `OneOffTasksTab.wiring.test.ts` (SOURCE-TEXT)

Reads `OneOffTasksTab.tsx` (and, if the UI is split, every non-test `.tsx` under
`src/app/components/one-off-tasks/` - the test must concatenate the dir so a split
does not blind it, exactly as the boundary test scans the dir). **Every row here
proves a symbol is PRESENT and wired in source, never that it is bound to the
correct control** - that half is RW3-* owner-walk. These exist because
`topLevelTabs.wiring.test.ts:179` only pins that `page.tsx` has the
`{activeTab === "one-off-tasks" && <OneOffTasksTab/>}` branch; it does NOT see
inside the tab, so without R-WIRE-1 the tab could keep rendering the W1 "coming
soon" shell forever with every gate green (the ships-dead class).

| # | Object | Instrument | Direction (RED when) |
|---|---|---|---|
| R-WIRE-1 | component-dir source | matches `/useOneOffTasks\s*\(/` (the hook is actually CALLED, not merely imported) | the tab does not call the hook (static shell) |
| R-WIRE-2 | component-dir source | references each required CRUD binding - frozen list `["add", "toggleDone", "remove"]` each present as a word-bounded token | any CRUD method is never referenced (that action unreachable) |
| R-WIRE-3 | component-dir source | matches `/useInstitutions\b/` OR `/useInstitutionSelection\b/` (college list REUSED, per AC4 + the backlog "do NOT invent a parallel college list") | the component hardcodes a college array instead of reading the registry |
| R-WIRE-4 | component-dir source | matches `/groupTasksByCollege\b/` (AC4 grouping is reachable from the UI) | the grouping fn is never called (per-college grouping ships dead) |
| R-WIRE-5 | component-dir source | references BOTH `loading` and `error` (the two non-happy states from the hook are handled, not dropped - AC6) | either state var is unreferenced (that state branch ships dead) |
| R-WIRE-6 (canary) | the scan itself | `expect(concatenatedSource.length).toBeGreaterThan(0)` AND each matcher fires on an in-test fixture string (e.g. the `useOneOffTasks(` matcher hits `"const x = useOneOffTasks();"`) | the scan passes by reading nothing / a dead matcher (the emoji-false-clean class) |

R-WIRE-6 is MANDATORY. A source-text scan with no dead-scan canary is this repo's
single most-repeated false green; without it a typo in the glob or a `-1` slice
reports clean having checked nothing.

**Over-pinning guard (my brief's rule).** R-WIRE-2's list is the FACT (these three
actions must be reachable), pinned as token presence, NOT as JSX spelling - the
implementer may name the handler, lay out the row, or route the checkbox however
they like and still pass. Do not extend R-WIRE-2 into asserting the surrounding
markup; that is the over-specification that forced contorted implementations
twice here.

### 3.3 Persisted control keys - `one-off-tasks-persist-keys.structure.test.ts` (SOURCE-TEXT/STRUCTURE)

Scans every non-test `.ts`/`.tsx` under the component dir (the hook + any new
control leaf), concatenated. The persist-ui-control-state rule requires every new
textbox/select/checkbox to persist across reloads via a `ta-` key.

| # | Object | Instrument | Direction (RED when) |
|---|---|---|---|
| R-PERSIST-1 | the key `"ta-one-off-college-filter"` | appears in source with BOTH a read (`getItem`/`readKey`) AND a write (`setItem`/`writeKey`) reachable to that key constant | the filter stops persisting (write removed) - the caller's named sabotage |
| R-PERSIST-2 | the key `"ta-one-off-status-filter"` | same read-AND-write pin | the status filter stops persisting |
| R-PERSIST-3 (ratchet) | the SET of distinct `/ta-one-off-[a-z-]+/` literals in the dir | `.toEqual(new Set([...FROZEN...]))` - frozen expected set | a key is renamed/removed, or a new key lands without the same-commit bump |
| R-PERSIST-4 (canary) | the scan itself | `expect(keys.size).toBeGreaterThan(0)` AND the key-extractor regex fires on an in-test fixture line | the scan passes by reading nothing / a dead matcher |

**O-PERSIST construction (grounded, NOT a tautology).** The floor of the frozen
set is CONSTRUCTIBLE from the shipped tree right now, measured this session:
`{ "ta-one-off-college-filter", "ta-one-off-status-filter" }`
(`useOneOffTasks.ts:17-18`). R-PERSIST-1/2 are grounded in those two measured
literals and each demands read AND write, so they MEAN something on the first W3
write - they are not the implementer comparing their output to itself. R-PERSIST-3
is the drift ratchet (the documented repo pattern - the grading-chat "4-key
canary", the `ta-rec-*` ordinal canary): its expected set is extended by the
implementer in the SAME COMMIT as any new control key, per
`gate-must-include-directory-canary` memory.

**W3 adds controls beyond the two filters - here is how each extends O-PERSIST:**

- **Group-by-college toggle.** Scope section 8 (`:459-460`) says W3 adds "a
  group-on/off toggle ... both persist (ta- keys)". If it ships, its key is
  `ta-one-off-group-by-college`, pinned read+write like R-PERSIST-1 and added to
  the R-PERSIST-3 set. If the plan/AC drops the toggle (filter-only), drop that
  key - the instrument is ready either way. This is a dependency on a design
  decision I do not own; I name it rather than silently forcing it.
- **Composer draft.** The composer's title/notes/college/due-date are transient
  create-inputs, but the persist-ui-control-state rule is stated absolutely and
  this app already persists composer drafts elsewhere (`ta-ppt-ask-draft`,
  `ta-grading-chat*`). **I RECOMMEND persisting the composer draft under ONE key,
  `ta-one-off-draft`** (a JSON blob of the in-progress fields), read+write pinned
  and added to the R-PERSIST-3 set. Whether the draft persists at all is a design
  fork routed to AC/architect/owner (RW3-DRAFT, section 7) because the rule's
  intent on a create-composer is the one genuinely arguable case; the instrument
  is specified so either ruling lands with a pin.

**The honest limit of R-PERSIST, stated plainly (my brief forbids a denylist
standing in for an unbounded set).** A source scan CANNOT catch "a new control was
added with NO `ta-` key", because an unpersisted control is the ABSENCE of a key
literal - invisible to the scan, so R-PERSIST-3 stays green. R-PERSIST therefore
enforces (a) the KNOWN keys persist and (b) no key DRIFTS silently; it does NOT
prove COMPLETENESS of control coverage. Completeness is routed to RW3-PERSIST-ALL
(section 7: code review against the rule + a browser reload walk enumerating every
control). Pretending the canary proves completeness would be the exact false
coverage this seat exists to prevent.

---

## 4. Client/DB boundary - NO new test needed (confirm the existing one covers W3)

The existing `one-off-tasks-client-boundary.structure.test.ts` (opened:
`:8,13-18,30-46`) reads the component dir with `readdirSync`, filters `\.tsx?$`
and excludes `.test.`, and already carries BOTH required canaries (`:30-37`:
non-empty scan + the matcher fires on a known-bad fixture). W3's new
`OneOffTasksTab.tsx` (full) and any extracted control leaves land in that same
dir, so the existing scan covers them with **no new boundary test**. W3's only
obligation is to RUN it in the gate and keep the tab reaching the DB only through
the hook -> repository -> action (never importing `@/lib/supabase/*` from the
component dir).

- **Direction / sabotage (uses the existing test, no new code):** add
  `import { mapOneOffTask } from "@/lib/supabase/one-off-tasks";` to any
  component-dir file -> the existing `BAD_IMPORT` matcher reddens `:39-46`. GREEN
  on restore. Discriminates the DB-via-action-only boundary.
- The dead-scan canary (`:34-37`) already defends against the false-clean class,
  so the boundary gate is not a false green on an empty dir read.

---

## 5. Executable HERE vs ARGUED-only (stated plainly)

**Executable under vitest (node-env, network-blocked) in W3:**

- Section 3.1 (the pure `validateNotes`), fully.
- Sections 3.2 and 3.3 **as SOURCE-TEXT scans** - they execute and will go
  red/green on their named sabotages, but their CLAIM is "symbol/literal present
  and wired in source", not "behaves correctly at runtime".
- Section 4 (existing boundary gate) and the section 6 repo-wide gates.

**Argued only - NOT asserted as verified here (routed to residuals, section 7):**

- **That the tab actually PAINTS** - list, composer, CRUD controls, grouping,
  filters visibly render and are usable. No component renders here. Owner walk.
- **That each control is bound to the RIGHT handler** - R-WIRE proves `toggleDone`
  is referenced, not that the row checkbox invokes it. Owner walk.
- **Click-minimisation** (AC3: add = 1 interaction, complete = 1 click). A count
  in a real browser; no render here. Owner walk.
- **Keyboard** (Enter-to-submit on the title; any MUI key handler routed through
  `slotProps.input`, never `htmlInput` - `mui-slotprops-input-vs-htmlinput`
  memory). Unobservable without a render. Owner walk.
- **Copy quality/voice** for empty/loading/error (AC6). Emoji-free IS machine
  (no-emojis). The WORDS being right and in the app's voice is a reading/owner
  call; I deliberately do NOT freeze the exact copy strings as literals, to avoid
  the over-pin that makes every future reword a test edit (the scope's copy at
  `:470-473` is guidance, not a frozen oracle). R-WIRE-5 only proves the `loading`
  and `error` states are HANDLED, not worded.
- **Actually survives a reload / sign-out / second device** (AC5 behaviour). The
  key-set pins prove the key literals are read+written in source; survival in a
  real browser is owner (RW3-PERSIST-WALK), and durable cross-device survival
  remains the W2 R5-DUR owner residual.
- **The action-side notes cap enforcement** (the `validateNotes` call inside the
  `"use server"` action). The CALL is source-visible, but its runtime effect needs
  auth/DB absent here. Owner/review (RW3-NOTES-ACT).
- **The hook's optimistic state** (add/toggle/delete rollback, loading/error) -
  carried W2 residual R-HOOK; W3 is where it becomes observable, still only by
  owner walk.

---

## 6. Structure / repo-wide gates W3 must run + the file-size-split recommendation

Run via `npm run test:paths <p1> <p2> ...` (never a raw multi-path `vitest`, which
silently drops unmatched args - `test-paths-wrapper` memory). Full W3 gate:

```
npm run test:paths \
  src/app/components/one-off-tasks/one-off-task-model.test.ts \
  src/app/components/one-off-tasks/OneOffTasksTab.wiring.test.ts \
  src/app/components/one-off-tasks/one-off-tasks-persist-keys.structure.test.ts \
  src/app/components/one-off-tasks/one-off-tasks-client-boundary.structure.test.ts \
  src/app/components/tabs/topLevelTabs.wiring.test.ts \
  src/lib/use-server-exports.test.ts \
  src/source-bytes.structure.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/lib/no-emojis.test.ts
```

then `npx tsc --noEmit`, `npm run lint`, build compile-line check (grep for
`Compiled successfully`, do NOT `&&` the build - it exits 1 in the prerender tail
by design, `this-repo.md` section 1).

| Gate | file | What it catches in W3 | Sabotage | Discriminates? |
|---|---|---|---|---|
| use-server async-only | `src/lib/use-server-exports.test.ts` | a non-async export sneaking into the edited action file | add `export const X = 1;` to `actions/one-off-tasks.ts` | YES |
| source-bytes text | `src/source-bytes.structure.test.ts` | a materialised `\uXXXX`/NUL in any new/edited file | write a literal control char into a new file | YES |
| file-size ceiling | `src/file-size-ceiling.structure.test.ts` | `OneOffTasksTab.tsx` growing past 1000 lines | n/a - see split note below | argued (no W3 file is near the ceiling this wave) |
| no-emojis | `src/lib/no-emojis.test.ts` | an emoji in any new src/ or docs/ file (incl. this notes doc) | add an emoji to a new file | YES |
| topLevelTabs wiring | `src/app/components/tabs/topLevelTabs.wiring.test.ts` | the `page.tsx` render branch regressing while the tab fills out | confirm green, unedited (W1 already shipped it) | n/a - regression guard |
| boundary (section 4) | `one-off-tasks-client-boundary.structure.test.ts` | the filled tab reaching supabase directly | section 4 sabotage | YES |

Also grep the W3 diff for the dotAll `/s` or `/gs` regex flag before the type gate
- it passes vitest and FAILS tsc with TS1501 (`regex-s-flag-fails-tsc` memory).
None of the W3 logic needs it.

### File-size-split recommendation for `OneOffTasksTab.tsx`

- **Measured now:** `OneOffTasksTab.tsx` = 18 lines (W1 shell, opened). The scope
  estimates the full tab at ~180 lines (`:329`). **The 1000-line ceiling is NOT at
  risk this wave** - I will not dress a clarity recommendation as a ceiling
  necessity.
- **Recommend splitting anyway, for two concrete machine-surface reasons, not for
  the ceiling:** (1) a container that mounts the hook plus small leaves
  (`TaskComposer.tsx`, `TaskRow.tsx`, `TaskFilterBar.tsx`) keeps each file small
  and keeps the dir-scanning gates (boundary, source-bytes, and my R-WIRE/
  R-PERSIST scans) cheaply covering ALL of them - the wiring/persist scans MUST
  concatenate the whole dir precisely so a split does not blind them; (2) the
  container stays the one place the hook is called, so R-WIRE-1 has a stable
  target. All new leaves live under `src/app/components/one-off-tasks/`, so they
  inherit the boundary gate automatically (section 4) and intersect no sibling
  build.
- **This is an architect/plan call, not mine to force.** The machine instrument
  (`file-size-ceiling`) catches a breach regardless of the decision; I flag the
  low-risk-but-accreting container and leave the cut to the plan.

---

## 7. Residual register (owner / instrument / step - missing any one is a deletion)

| # | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RW3-PAINT | The tab actually PAINTS: list + composer + CRUD controls + per-college groups + filters render and are usable (AC3/AC4/AC6 felt) | repo owner | browser walk | open `?tab=one-off-tasks`; add, complete, edit, delete a task; confirm each control renders and responds |
| RW3-BIND | Each control is bound to the RIGHT handler (R-WIRE proves reference, not binding) | repo owner | browser walk | click the row checkbox -> task toggles; click delete -> task removed; edit -> field saved |
| RW3-CLICKS | Click-minimisation (AC3): add = 1 interaction beyond typing (college pre-filled from `useInstitutionSelection`), complete = 1 click | repo owner | browser walk + interaction count | count interactions for first add, repeat add, and complete |
| RW3-KBD | Enter-to-submit on title; any MUI key handler via `slotProps.input` not `htmlInput` | repo owner | browser keyboard walk | type a title, press Enter, confirm add; confirm no global `r`/`p`/`m` recorder shortcut is shadowed |
| RW3-COPY | Empty/loading/error copy is in the app voice and reads correctly (AC6); emoji-free is machine (no-emojis) | repo owner | browser walk | trigger empty (no tasks), loading, and an error (e.g. offline) state; read the copy |
| RW3-PERSIST-WALK | Controls actually SURVIVE a reload (AC5 behaviour; the key-set pins prove only the source literals) | repo owner | browser reload | set college filter + status filter (+ group toggle / draft if shipped), reload, confirm restored |
| RW3-PERSIST-ALL | COMPLETENESS of persist-ui-control-state: every select/checkbox/textbox W3 ships has a `ta-` key (a source scan cannot catch an unpersisted control - section 3.3 limit) | repo owner / reviewer | code review vs persist-ui-control-state + reload walk | enumerate every control in the shipped UI; confirm each has a `ta-` key and survives reload |
| RW3-DRAFT | DECISION: does the composer draft persist? (rule is absolute; precedent persists drafts) - recommend YES under `ta-one-off-draft` | repo owner / AC / architect | product + design decision | decide; if yes, the R-PERSIST pins + frozen set extend by `ta-one-off-draft` in the same commit |
| RW3-GROUP-TOGGLE | DECISION: does W3 ship a group-on/off toggle (scope `:459`)? If yes, key `ta-one-off-group-by-college`, pinned | repo owner / AC / plan | design decision | decide; the R-PERSIST instrument is ready either way |
| RW3-NOTES-ACT | The `validateNotes` call inside the `"use server"` action enforces the cap at runtime (only the CALL is source-visible here; the effect needs auth/DB) | repo owner / reviewer | code review + owner submit of an over-cap note on Vercel | after push, owner pastes a >2000-char note; confirm it is refused server-side |
| R-HOOK (W2, carried) | `useOneOffTasks` optimistic state (add/toggle/delete rollback, loading/error) is argued, not vitest-tested (no render) | repo owner | browser walk | W3; add/toggle/delete while forcing a failure to see rollback |
| R3 / R4 / R5-DUR (W2+scope, carried) | RLS enforcement + live query + migration application; durable cross-device CORPUS survival - all UNVERIFIABLE here | repo owner | real DB on Vercel + GH Action + 2 devices | after push, confirm the Action applied the migration, RLS scopes rows, and tasks survive sign-out and a second device |

All of the above must be written into `docs/BACKLOG.md` by the orchestrator at
disposal, or they do not exist (`DEV_LOOP.md` step 0). RW3-* are the W3-specific
additions; R-HOOK/R3/R4/R5-DUR already exist from W2 (`one-off-tasks-w2-test-notes.md:319-328`)
and are repeated only so W3's disposal does not drop them.

---

## 8. AC mapping (machine AC = pure-function / source-text / structure pins only)

| AC (scope `:149-160`) | W3 machine-checkable pin | Residual (owner + instrument + step) |
|---|---|---|
| AC3 - CRUD, click-minimized | R-WIRE-1/2 (hook called; `add`/`toggleDone`/`remove` referenced = reachable) | RW3-PAINT, RW3-BIND, RW3-CLICKS (the clicks + correct binding are owner-walk) |
| AC4 - group/filter by college | R-WIRE-3 (`useInstitutions` reused), R-WIRE-4 (`groupTasksByCollege` called); the pure fns are W2-tested | RW3-PAINT (the groups/filters actually regroup rows in the UI) |
| AC5 - persistence | R-PERSIST-1/2 (two filter keys read+write), R-PERSIST-3 (frozen-set ratchet) | RW3-PERSIST-WALK (survives reload), RW3-PERSIST-ALL (completeness), RW3-DRAFT, RW3-GROUP-TOGGLE, R5-DUR |
| AC6 - empty/loading/error, emoji-free | R-WIRE-5 (`loading`+`error` handled), `no-emojis` (machine, src+docs) | RW3-COPY (voice/wording), RW3-PAINT (states render) |
| (W2 LOW residual) notes cap | R-NOTES-1..4 (pure `validateNotes`) | RW3-NOTES-ACT (action-side runtime enforcement) |

AC1 (tab reachable) was W1. AC2 (task shape) was W2.

---

## 9. What I could not determine from the tree

- **Whether W3 ships a group-on/off toggle and whether the composer draft
  persists.** Both are design decisions the scope gestures at but does not settle
  (RW3-GROUP-TOGGLE, RW3-DRAFT). The R-PERSIST instrument is specified so either
  ruling lands with a grounded pin; I decline to force the design from the test
  seat.
- **The notes trim policy** (R-NOTES-4): the scope caps length but does not say
  whether notes trim like titles. The pin requires the implementer to freeze
  whichever they choose, rather than my inventing a rule the scope does not state.
- **Exact final line counts / file cut of the W3 UI** - the files are not written
  yet; the ~180-line estimate is the scope's (`:329`), well under the ceiling.
