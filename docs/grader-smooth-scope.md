# GRADING-CHAT grader: smoother / fewer clicks / shorter scroll and cursor path - RECON + SCOPE

Status: scope, UNCHECKED. Authored by the loop-seat (Sonnet) as a read-only recon; it has not yet had its adversarial check. Not buildable until the check returns clean and the owner answers the forks in section 7.

Owner request, verbatim: "the llm-like grader ... need[s] to be far more smoother and easier and less clicks to use." A second, co-equal dimension was added mid-task by the owner: minimize SCROLL DISTANCE and CURSOR TRAVEL to set up a run, not just click count.

Surface: the GRADING-CHAT Chat sub-tab under Tools > Grading, ONLY. Walkthrough and repo-grader code are out of scope.

No production code was written. No tests were run (read-only recon), so no `npm run test:paths <p1> <p2> ...` per-argument lines exist to quote. No component was rendered; every layout number below is CSS arithmetic or a reading claim and is labelled as such.

Tree state when measured: HEAD 27a323b8. `git status --short src/app/components/grading-chat src/app/components/GradingResults.tsx` returned empty (clean). Last grading-chat commit: `git log --oneline -3 -- src/app/components/grading-chat` = 5756233d (W2 panel wiring). Line counts via `wc -l` (Bash; `docs/loop/this-repo.md` section 3 records `wc -l` agreeing with `@(Get-Content).Count` on 13 files; the PowerShell form was not re-run here): GradingChatPanel.tsx 198, ChatComposer.tsx 174, useContinuousGradingRun.ts 378, chatSubmissionIntake.ts 70, GradingResults.tsx 918, page.tsx 832, page.module.css 7034, manual-rail.ts 415. Nothing is near 1000 except GradingResults.tsx (82 headroom), which no wave below touches.

Decisions record checked first (`docs/loop/traps-spec.md` rule): `docs/owner-decisions-2026-09-23.md:69-92` (DECISION 3) bears directly. Its text: persist a rubric but never as ONE GLOBAL VALUE (it cites the Repo Grades `ta-repo-grades-rubric` slot as "a warning, not a template"), and "a stored rubric that costs more interactions to retrieve than to re-paste is worse than not storing it". The shipped chat does exactly the warned-against thing: `GradingChatPanel.tsx:28-29,63-64` persist instructions and rubric in two global slots, even though `docs/grading-chat-architecture.md:803` cites the scoped A39 rubric-memory as "the pattern". This is a finding, it drives fork F2, and it is not reasoning from inferred precedent.

---

## 0. What "Start" means here (so nothing is assumed)

There is no Start/Run button on this surface. Grading begins on the first submit: Send (`ChatComposer.tsx:147`), Enter in the text field (`:80-85`), Add (`:165`), Enter in the URL field (`:162`), or picking a file (`:87-91`, which dispatches immediately). The first submit lazily begins the session (`GradingChatPanel.tsx:98-107` `ensureSession` -> `useContinuousGradingRun.ts:212-231` `beginSession` -> `grading-chat-intake.ts:47-67` -> `resolveRunHeader`, which REFUSES blank instructions: `src/lib/grade/run-header.ts`, "Please provide assignment instructions."). Provider is not a control: it is hardcoded as `useContinuousGradingRun({ provider: "gemini", commentSplit: true })` at `GradingChatPanel.tsx:67`.

## 1. CURRENT FLOW, control by control (file:line)

Reach: Tools top tab -> Grading rail chip -> inner "Chat" (`manual-rail.ts:158`, rendered by `<ManualRail>` at `page.tsx:538`). Panel mount: an always-rendered, display-toggled div at `page.tsx:748-757` (it does NOT receive an `active` prop, unlike the two sibling grading panels at `:721-723` and `:734-736`). Navigation state persists: `ta-active-tab` (`useAppNavigation.ts:540`), `ta-manual-view` (`:544`), `ta-grading-view` (`:556`), `ta-tools-section` (`:568`). So a returning user who last left on Chat lands on Chat: 0 nav clicks.

DOM order inside one `.form` column (`page.module.css:99-103`: flex column, gap `--space-5` = 20px, `globals.css:92`), `GradingChatPanel.tsx`:

1. Instructions TextField `:130-142` (multiline, `minRows={3}`, disabled when the session is ready, `:140`).
2. Rubric TextField `:144-156` (same; the label reads "Rubric" with no hint that it is optional - a blank rubric is synthesized, `grading-chat-intake.ts:64-66`).
3. Row: not-saved disclosure `:159`, "locked" note `:160-162`, New session button `:163-165` (confirm at `:89-91`).
4. submitError alert `:168-172`.
5. `hasRows ?` RubricProvenance + GeneratedRubricCard + GradingResults `:174-188`, `:` otherwise a one-line hint `:190`.
6. `<ChatComposer>` `:193` - LAST in DOM. Inside `ChatComposer.tsx`: mode toggle `:102-112` (persisted as `ta-grading-chat-input-mode`, `:28-50`), file "+" `:113-120` (hidden `<input type=file>` at `:115`, no `accept`, no `multiple`, no drop handler: `grep -n "onDrop\|dragover" src/app/components/grading-chat/` returned nothing), text field + label field + Send `:125-149`, URL field + Add `:155-168`.

Results and Post (shared `GradingResults.tsx`): bulk "Post N grade(s) to Canvas" `:557-561`, its confirm `:324-329`; per-row "Post to Canvas" `:664-675` -> `handlePostOne` `:437-474`, which has NO confirm (existing behaviour, shared by 3 other mounts, out of scope; see R-4). Post controls render only for rows carrying a numeric `userId` (`:312-318`, `:641`); in chat only Canvas-URL submissions produce them (`grading-chat-intake.ts:176-183`; text, file and GitHub entries carry none). `speedGraderUrl: null` at `useContinuousGradingRun.ts:161`, so there is no SpeedGrader link in chat.

What persists (ta- keys, `grep -rn "ta-grading-chat" src`): `ta-grading-chat-instructions` and `ta-grading-chat-rubric` (`GradingChatPanel.tsx:28-29`), `ta-grading-chat-input-mode` (`ChatComposer.tsx:28`); per-row EDITS under `ta-grading-results-edits::grading-chat-<sessionId>` via `editsSurface={driver.runKey}` (`:182`). Graded rows themselves persist nowhere (disclosure `:35-36`).

## 2. MEASURED click counts

Convention (matches `docs/grading-chat-ux.md:93-95`): a click is a mouse click, an OS-dialog pick, or a confirm-dialog click. Paste and keypresses are not counted; Enter-to-send is shown as the second number. Counts were derived by walking the controls above; nothing was run.

| Path | Walk | Clicks (Send/Add ; Enter) |
|---|---|---|
| P1 first-time, text, Tools tab already open | Grading chip, Chat, Instructions, Rubric, composer field, Send | 6 ; 5 (UX doc `:84-93` also says 6). +1 from another top tab. Rubric skipped: 5 ; 4 |
| P1b first-time, file or zip | chip, Chat, Instr, Rubric, File toggle, "+", OS pick | 7 (UX doc `:172-178` agrees) |
| P1c first-time, Canvas URL, then post | chip, Chat, Instr (pasted from Canvas; the trip to Canvas is not counted), Rubric, URL toggle, URL field, Add, Post button, confirm | 9 ; 8 |
| P2 returning, SAME assignment, after reload | 0 nav (persisted), fields prefilled `:63-64`, composer field, Send | 2 ; 1 |
| P2b returning, DIFFERENT assignment, Canvas, no live session | Instr, Rubric, URL field, Add, Post, confirm (mode persisted) | 6 ; 5 |
| P2c any new assignment while a session is live | New session + confirm (`:87-96`), then P2b | +2 |
| P3 one more text submission, session ready | focus retained after send, `ChatComposer.tsx:77` | 0-1 |
| P3b K single-file submissions | "+" and pick, per file (no `multiple`, `:115`) | 2K |
| P3c repeat URL | field click each time (`handleSendUrl` `:93-97` does not refocus), Add or Enter | 1 ; 1 |
| P4 post all | button + `window.confirm` | 2 |

### Required-for-safety versus incidental

REQUIRED (must survive every wave): the New session confirm (`GradingChatPanel.tsx:89-91`, guards discarding every row; pinned by `GradingChatPanel.structure.test.ts:111-118`); the bulk Post confirm (`GradingResults.tsx:324-329`, guards the irreversible gradebook write). The A13 unreviewed-row refusal (`:331-346`) is a guard and is untouched.

INCIDENTAL:
- Re-pasting instructions and rubric that Canvas already holds (P1c, P2b).
- Two persisted global text slots that are never keyed to an assignment (the stale-instructions hazard, DECISION 3).
- Clicking into the composer field after navigating in (the panel never learns it became visible).
- The Add click when Enter exists.
- "+" then the OS dialog per file, with no multi-select and no drop.
- The first-submission focus loss. Reading claim: `ChatComposer.tsx:77` refocuses, but `disabled={busy}` flips true during `resolving` (`GradingChatPanel.tsx:125,193`, `ChatComposer.tsx:135`) and a disabled field cannot keep focus, so the first submit costs the NEXT submit one extra click. Not browser-verified.
- The URL field is not refocused after send.

## 3. MEASURED scroll and cursor cost (ESTIMATES from CSS, unrendered; OWNER walk required)

Facts with citations:

- `.field textarea { min-height: 220px }` (`page.module.css:229-231`) applies to the two setup fields because they sit in `styles.field` (`GradingChatPanel.tsx:130,144`) and MUI multiline renders a `<textarea>`. This overrides the intent of `minRows={3}` (`:135,148`). Each setup field is therefore at least 220px, plus a label (11px font `globals.css:71` x 1.55 line `globals.css:83` = about 17px) plus an 8px gap (`globals.css:89`) = at least about 245px.
- Pre-first-row, estimated stack above the composer: 245 + 20 + 245 + 20 (gap) + about 30 (small button row, more if the disclosure wraps) + 20 + about 20 (hint, 13px x 1.55) + 20 = at least about 620px BELOW THE PANEL TOP, excluding page padding (`page.module.css:6`, `--space-10`), the TopBar, the tab rail and the ManualRail, which were not measured. On a 768px-high viewport the composer, which is the Start control, is at or below the fold on first use. "Not reachable without scrolling" is the likely state; it could not be measured.
- After the first row lands, the one-line hint is replaced by the provenance blocks plus the whole results section: heading row, hint paragraph, ClassTrendsPanel `defaultExpanded` (`GradingResults.tsx:619`, shown whenever a graded row has rubric areas, `classTrendsEntry.ts:52-54`) and the matrix capped at `max-height: 65vh` (`page.module.css:1988-1992`; 65vh of 768 is about 499px). The composer top then sits roughly 620 plus up to about 600px, at least 1.5 viewports below the panel top once rows accumulate. Every further submission needs a scroll down to the composer and a scroll up to read the new row.
- No scroll management exists anywhere in the panel: `grep -n "scrollIntoView\|scrollTo" src/app/components/grading-chat/*.tsx src/app/components/grading-results/*.tsx` returned nothing (GradingTab has one, `GradingTab.tsx:237-245`; the chat does not).
- submitError renders at `GradingChatPanel.tsx:168-172`, ABOVE the results table, but is caused by a composer action at the bottom. A refused file, an over-limit session or an empty-instructions refusal appears off-screen from the cursor. Reading claim.
- Cursor path, first use: Instructions -> Rubric (adjacent, at least about 245px) -> composer (below the status row and, later, the whole table) -> Send (same row as the text field, adjacent: fine). Send itself is not the problem; the controls it depends on are scattered: setup and Start are separated by at least about 620px, and New session (top) and Post (results header) sit at opposite ends from the composer. The intake controls (toggle, "+", field, Send/Add) ARE grouped on two adjacent rows (`ChatComposer.tsx:101-169`).
- Two locked 220px-plus textareas stay on screen for the whole session (`:140,154` disable them after `ready`): at least about 510px of vertical space occupied by controls that cannot be used.

## 4. WHERE THE CLICKS AND PIXELS GO, and the reducing mechanism

Leverage note, per `docs/loop/leverage.md:66`: click cost is a STRUCK class, not a categorical advantage over a chat; this scope claims it only as click-cost. The one earned claim is R1: INTEGRATION - reading the assignment instructions and rubric from Canvas, which a chat window cannot do. The removal test is AC-R1 below.

| # | Cost | Mechanism | Confirm kept? |
|---|---|---|---|
| R1 | Canvas path re-pastes instructions and rubric (P1c, P2b: 2 clicks plus a trip to Canvas) | On a Canvas-URL submit with BOTH fields blank, call the existing `fetchCanvasMetaAction(url)` (`src/app/actions/grading.ts:52-62`, `requireUser`, returns `{description, rubricText}`; the pattern GradingTab already uses at `GradingTab.tsx:146-178`), fill the fields, persist, show an origin note ("read from Canvas"), THEN `beginSession` with the fetched values passed explicitly (the `ensureSession` closure reads stale `instructions` state: a pitfall to name). Never overwrites a non-blank typed field. A fetch failure falls back to the existing refusal text. | n/a |
| R2 | Global persisted slots: stale instructions grade the wrong assignment silently; also blocks R1 (non-blank stale text suppresses the fill) | Scope the persisted text by the one identity the chat knows (the Canvas URL) using the existing `saveRubricMemory` / `loadRubricMemory` (`src/lib/grade/rubric-memory.ts:97,113`, tested in `rubric-memory.test.ts`) under one NEW ta- key; read the two legacy keys once for non-Canvas sessions; show the origin via `describeRubricOrigin` (`:132`). Conforms to DECISION 3. Fork F2. | n/a |
| R3 | Two locked 220px-plus textareas hog about 510px after ready | Once `headerState === "ready"`, render a one-line summary strip (first about 60 characters of the instructions, rubric criteria count or "generated", New session button) in place of the two TextFields; the fields return on New session. The fields are already locked at `:140,154`, so no function is lost. | New session confirm unchanged |
| R4 | Setup fields at least 220px each before the session | A chat-specific class in a NEW `grading-chat.module.css` (precedent: `repo-grades.module.css`, `SnapshotGrading.module.css`, `GradingTable.module.css`) overriding the min-height to about 3 rows with a `maxRows` cap; optionally Instructions and Rubric side by side at desktop width (halves the stack). Avoids the 7034-line `page.module.css` and its orphan-class guard (`src/app/components/courses/page-module-css-orphan-classes.test.ts`). | n/a |
| R5 | The composer drifts below an ever-taller table | Per fork F1: pin the composer to the viewport bottom (sticky) so Start is always reachable with 0 scroll, and render submitError immediately above the composer, not above the table | n/a |
| R6 | 2K clicks for K files; no drop | `multiple` on the file input plus an `onDrop` target on the composer; a pure `submitFilesSequentially(files, submit)` leaf aggregates per-file outcomes (named refusals, partial) and the panel awaits them in order. No `accept` list (avoids the third hand-synced extension copy, RES-GC-UX-5 in the backlog row). | n/a |
| R7 | First-submission focus loss; URL field not refocused | Keep the text and URL fields enabled during `resolving` (disable only Send/Add and the toggle), and refocus the URL field after send | n/a |
| R8 | A composer click on arrival | Pass an `active` prop (as `page.tsx:721-723` does for its siblings) and focus the first needed field on activation: Instructions if blank, else the composer. Needs `page.tsx:748-757` (a shared file). | n/a |
| R9 | The rubric looks required | Label copy: optional, generated from the instructions if blank | n/a |
| R10 | Needs a Canvas link at all | OPTIONAL W4 (fork F3): a "Pick from needs-grading" select in URL mode fed by the existing `listGradingQueueAction` (`src/app/actions/grading-inbox.ts:13`; `CanvasQueueItem` already carries `canvasUrl`, `description` and `rubricText`, `src/lib/canvas/grading-queue.ts:45-62`). Cuts P2b to about 2-3 clicks. Cannot be verified here (needs Canvas credentials). | n/a |

NOT changed, deliberately: the bulk Post confirm; the New session confirm; the per-row Post asymmetry (R-4); text, file and GitHub rows having no Post path; the post-all button label.

## 5. ACCEPTANCE CRITERIA

The targets are proposals the owner ratifies in F5; baselines are section 2.

### Click targets (OWNER: felt count)

The walk is the instrument; nothing counts clicks under vitest. Direction of failure for all of them: measured clicks ABOVE the target, or a confirm absent.

- AC-C1: P1c first-time Canvas + post: 9 ; 8 -> at most 7 ; 6.
- AC-C2: P2b returning, different assignment, Canvas + post: 6 ; 5 -> at most 4 ; 3 (3 ; 2 with R8 or R10).
- AC-C3: P2 returning, same assignment: 2 ; 1 -> at most 1 ; 0 (needs R8, so it is conditional on the `page.tsx` collision item).
- AC-C4: P3b K files: 2K -> at most 2 (multi-select) or one drag; P3c repeat URL: 1 -> 0 refocus; a second text submission after a first submit never costs a field click.
- AC-C5: P1 first-time text: 6 ; 5 unchanged, EXCEPT 5 ; 4 with R8 or with the rubric skipped. Stated so it is not claimed as a cut by R1.

### Scroll and cursor (OWNER, co-equal with clicks; reference viewport proposed at 1366x768, F5)

- AC-S1: Before the first submit, Instructions, Rubric, the composer field and Send/Add are all visible without scrolling. Baseline: composer at least about 620px below the panel top plus chrome (estimate). Fails if any of the four needs a scroll.
- AC-S2: After N = 1, 10 and 40 rows, the composer is reachable with 0 px of scroll; the setup state is visible as a summary; the table scrolls inside its own region only. Baseline: at least 1.5 viewports below. Fails if sending submission 2..N requires page scroll.
- AC-S3: Cursor: the pre-session path Instructions -> Rubric -> composer -> Send spans at most about 400px vertical (a proposed number, unvalidated, F5; baseline at least about 620px). Fails above that.
- AC-S4: An intake refusal (file type, ceiling, empty instructions) appears in the same viewport as the composer that caused it.

### MACHINE criteria (each names object, instrument and direction of failure)

- AC-R1 (removal test; the leverage claim). Object: the Canvas-URL submit path in `GradingChatPanel.tsx`. Instrument: a pure `resolveSetupFill({typed, canvasMeta})` leaf test (new `chatSetupFill.test.ts`) PLUS a source-order wiring test that the Canvas-URL branch awaits `fetchCanvasMetaAction` BEFORE `beginSession`. RED if (a) a non-blank typed field is replaced (the worst failure), (b) blank instructions with an empty Canvas description still start a session, or (c) the call is removed.
- AC-R2. Object: persisted setup memory. Instrument: a leaf test over `rubric-memory.ts` usage with a frozen literal oracle (scope key from a Canvas URL; legacy keys read once, never written). RED if one assignment's text restores under another's scope without an origin string, or a legacy key is rewritten.
- AC-R3. Object: `submitFilesSequentially`. Instrument: a unit test with a mocked `submit` (no real fetch; `vitest.setup.ts` throws on fetch). RED if outcome order differs from input order, a refusal is dropped, or K files produce fewer than K submit calls.
- AC-R4. Confirms preserved. Instrument: a source-order test that `window.confirm(` precedes the first `postCanvasGradesAction(` in `handlePostGrades` (no test pins this today: `grep -rln "writes to the live gradebook" src --include=*.test.ts` returned only `repoGrades.wiring.test.ts`), plus the existing `GradingChatPanel.structure.test.ts:111-118` for New session. RED if either confirm is removed or moved after its write or discard.
- AC-R5. Wiring and reachability. Instrument: every new leaf export has its caller in a file of the same wave (see the waves); `ChatComposer` accepts and uses the new props; `GradingChatPanel.structure.test.ts:62-68` and `:140-190` stay green. That file pins `styles.field` / `styles.form` at `:63-67`, so changing the setup class requires editing that test in the same wave, and it should pin the fact, not the spelling. RED if an export has no caller or a pinned test fails.
- AC-R6. A new ta- key is registered consistently: if F2(a), the key appears in one place and the panel's keys total 4 (below DECISION 9's sixth-key canary trigger, `owner-decisions-2026-09-23.md:240-245`). RED if a fifth or sixth key lands without the directory canary.

## 6. WAVE PROPOSAL (sequential unless noted; the plan seat owns the final cut)

W1 - pure leaves, all NEW files, with no callers needed beyond their own tests (type/leaf modules, which emit no behaviour of their own): `grading-chat/chatSetupFill.ts` (+ test), `grading-chat/chatFileBatch.ts` (+ test), and if F2(a) `grading-chat/chatSetupMemory.ts` (+ test). Pure TypeScript, no server imports (client-bundle guard). Disjoint from every active item.

W2 - wiring: `GradingChatPanel.tsx` (Canvas prefill in the submit path, scoped persistence, error placement, summary state), `ChatComposer.tsx` (multiple, drop, URL refocus, fields enabled during resolving), `GradingChatPanel.structure.test.ts` (update) plus one new `GradingChatPanel.wiring.test.ts` for AC-R1 and AC-R4. Calls every W1 export.

W3 - surface and layout: NEW `grading-chat.module.css`, `GradingChatPanel.tsx`, `ChatComposer.tsx` (sticky composer, collapse strip, compact fields). Same two files as W2, so W3 lands AFTER W2, never concurrently. Optional W3b: `page.tsx:748-757` `active` prop plus focus-on-activation (R8). Shared file, see section 8.

W4 (optional, F3): the needs-grading picker in `ChatComposer.tsx` / the panel, importing `listGradingQueueAction`; owner-verified only.

Triage (trigger fired): UX (W3), Data (F2 key), Security (W2: a new egress from the chat to an existing action; a new network path is a trigger), Reliability (multi-file sequential intake with partial failure), Accessibility (markup, focus, collapse; reading claims only), Visual (layout).

Wave-gate note: the pre-push gate runs no vitest (`docs/loop/this-repo.md` section 1). The wave plan must enumerate `GradingChatPanel.structure.test.ts`, the new wiring test, `rubric-memory.test.ts`, `topLevelTabs.wiring.test.ts` (it pins the always-mounted mount, `:575-576`), `manual-rail.test.ts` and `file-size-ceiling.structure.test.ts` through `npm run test:paths`. The new tests must not `vi.mock("@/lib/supabase/auth")` wholesale (`wholesale-auth-mock-population.structure.test.ts` enumerates that population).

## 7. OPEN FORKS (each answer terminates the activity; the scope ships with the answer applied)

- F1 Composer position. (a) keep it last in the DOM but pin it to the viewport bottom and collapse setup after ready; (b) move the composer above the results (Setup -> Composer -> Results); (c) keep the order, only collapse and compact. RECOMMEND (a); the build leans toward it in W3. Cost of (b) or (c) after the fact: a one-wave change in the same two files; (b) reverses the explicit UX ruling at `grading-chat-ux.md:187-197`.
- F2 Persisted setup. (a) scope by Canvas URL via rubric-memory with a one-time legacy read; (b) keep the global slots, accept the stale hazard, and let R1 fill only blank fields; (c) a global slot plus a visible "last used" label and a one-click Clear. RECOMMEND (a), per DECISION 3. Cost if wrong: it changes a persisted shape, so it is not trivially revertible; (b) leaves a silent wrong-grades-look-right path.
- F3 Needs-grading picker (R10): include it as W4, or leave it out and file it as its own backlog row. RECOMMEND include it as W4, dispatched last; it is unverifiable here, owner walk only.
- F4 Auto-detect a pasted URL in the text box to skip the mode toggle (saves 1 click on first Canvas use). RECOMMEND NO: a student submission that is only a URL would silently change meaning from text to a repo or Canvas fetch.
- F5 Ratify the measurement rig and numbers: reference viewport 1366x768, AC-S1 and AC-S2 as "0 px scroll", AC-S3 "at most about 400px" (my proposal, not derived from anything). Whatever the owner sets becomes the AC; with no answer, the criteria ship with the numbers above flagged "proposed".

## 8. COLLISIONS

Live tree at measurement (`git status --short`): A29 W3 is editing `src/app/components/CanvasTab.tsx`, `src/app/actions/bulk-course-message.ts` (+ `.test.ts`) and `src/app/components/bulk-course-message/**`, plus docs. NONE of the waves above touch those: disjoint by exact path.

Files these waves touch that others might:
- `src/app/page.tsx`: W3b only (the `active` prop). It is also the file the repo-grader and walkthrough scopes are most likely to touch; their write sets are not known to this seat, so the orchestrator should intersect with `sort | uniq -d`.
- `src/app/page.module.css`: NOT touched by design (a new module file is used instead).
- `src/app/components/GradingResults.tsx`: NOT touched; it is shared by 4 mounts.
- `src/app/actions/grading.ts`: imported only, unchanged.
- `src/lib/grade/rubric-memory.ts`: imported only.

Exclusively owned by this scope: everything under `src/app/components/grading-chat/`.

Sequence rule: W3b waits for any sibling that holds `page.tsx`; W1-W3 have no shared path with the two sibling scopes as far as can be told (unverified against their write sets).

## 9. RESIDUAL REGISTER (owner / instrument / step)

- R-1: Rendered fold, scroll distance and cursor travel in px (all of section 3 is CSS arithmetic). Owner: instructor/owner. Instrument: a browser walk at 1366x768 recording scroll px and the pointer path. Step: after W3 (AC-S1..S4).
- R-2: Focus loss on first submit; sticky-composer feasibility (depends on ancestor overflow); `display:none` activation focus. Owner: owner. Instrument: browser walk. Step: after W2 and W3.
- R-3: Chrome above the panel (TopBar, rails, page padding) is unmeasured. Owner: owner. Instrument: the same walk. Step: W3 verify.
- R-4: Per-row "Post to Canvas" has no confirm while bulk does (`GradingResults.tsx:437-474` against `:324-329`). This scope does NOT add or remove one: it is a shared component and the owner said not to drop confirms. Owner: orchestrator to file a row or rule. Instrument: `grep -n "window.confirm" src/app/components/GradingResults.tsx`. Step: before any change to GradingResults.
- R-5: Text, file and GitHub chat rows can never be posted (no `userId`). Out of scope; an owner decision. Instrument: `grep -n userId src/app/actions/grading-chat-intake.ts`. Step: a separate row.
- R-6: A page reload resets `sessionId` (backlog W2-R2), which interacts with R2/F2 scoping. Owner: architect. Instrument: a lifecycle test of key derivation across a simulated reload. Step: W2 plan.
- R-7: The chat always synthesizes a blank rubric (`resolveChatRunHeaderAction`, `grading-chat-intake.ts:64-66`) while the Canvas surface says none will be synthesized (`GradingTab.tsx:170-172`; the `run-header.ts` comment says that asymmetry must be preserved). R1 inherits the chat behaviour, and the origin note must say so. Owner: owner confirms. Step: W2 copy.

## 10. Command ledger

Reads: Read of `docs/DEV_LOOP.md`, `docs/loop/seats.md` (1-210), `docs/loop/traps-spec.md`, `docs/loop/this-repo.md`, `docs/loop/leverage.md` (29-69), the seven files under `src/app/components/grading-chat/`, `GradingResults.tsx` (1-918), `grading-chat-intake.ts`, `run-header.ts`, `rubric-memory.ts`, `GradingTab.tsx` (100-440), `page.tsx` (470-600, 690-790), `docs/grading-chat-ux.md` (30-210).

Greps and commands: `grep -n "min-height: 220px" src/app/page.module.css` (line 230), `grep -rn "onDrop\|dragover" src/app/components/grading-chat/` (none), the scroll grep in section 3 (none), `grep -rn "ta-grading-chat" src`, `grep -n "^export async function" src/app/actions/grading-inbox.ts`, `wc -l` on the files listed, `git status --short`, `git log --oneline -3 -- src/app/components/grading-chat`.

Not run: tsc, lint, vitest, build, any browser render.

Not determined (cannot be, here): actual rendered heights and the fold; whether a disabled field blurs and stays blurred in the target browser; the two sibling scopes' write sets; whether the owner will accept the proposed numeric targets.
