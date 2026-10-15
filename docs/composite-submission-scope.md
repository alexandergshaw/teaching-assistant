# COMPOSITE submission (add text to another submission type) - scope

Owner request (grading chat view, direct chat, 2026-10-12), verbatim:
"make it so I can add a TEXT submission to any of the OTHER submission types -
a COMPOSITE submission."

Architect seat (loop-architect), 2026-10-12. READ-ONLY: no production edits.
A fresh loop-checker reads this before any build consumes it.

---

## 0. HEADLINE: this capability is ALREADY SHIPPED and reachable. Do not build a second copy.

The dispatch brief's premise - "a submission is currently ONE kind (text, file,
url, record, zip, video, LMS)" and "the owner wants to ADD a text component" as
if it does not exist - is DISPROVEN BY THE TREE. A COMPOSITE submission that
blends a text part with a file/url (and record) part into ONE student's one
graded row shipped on 2026-10-06..08 and is wired end to end today.

I am refusing the brief's framing because I can disprove it (architect
non-negotiable: "if a brief hands you a fact and the tree disagrees, measure,
report the conflict, do not adopt either value silently"). Evidence, each
citation opened:

| Claim | Evidence (command / file:line) |
|---|---|
| Composite shipped W1 (seam) | `git show --stat fda763f0` -> `feat(COMPOSITE-SUBMISSION): W1 seam - one student's submission from multiple parts` (touches `chatSubmissionIntake.ts`, `grading-chat-intake.ts`, `useContinuousGradingRun.ts` + tests) |
| Composite shipped W2 (tray UI) | `git show --stat 79ec4e44` -> `feat(COMPOSITE-SUBMISSION): W2 composer parts tray` (touches `ChatComposer.tsx`, `GradingChatPanel.tsx`, `GradingChatPanel.structure.test.ts`) |
| Tracked + checked SHIP | `docs/BACKLOG.md:298` row `COMPOSITE-SUBMISSION` ("checked SHIP round 2, a139daef ... W1 SHIPPED fda763f0 ... W2 SHIPPED 79ec4e44") |
| Prior scope exists | `docs/grading-chat-composite-scope.md` (owner request 2026-10-06: "i also need to be able to have a composite submission for one student ... a file, a url, and/or more") |
| Type contract live | `chatSubmissionIntake.ts:31` `{kind:"composite"; student; parts: CompositePartInput[]}`; `:47-50` `CompositePartInput = text | file | url` |
| Merge is live | `chatSubmissionIntake.ts:120-138` `mergeCompositeEntries`; `:146-159` `extractSingleEntry` (one entry per part) |
| Server resolver live | `grading-chat-intake.ts:336` `export async function prepareCompositeSubmissionAction`; `:172` module-private `resolveOnePart` |
| Driver dispatch live | `useContinuousGradingRun.ts:451-471` composite branch; `:488-490` calls `prepareCompositeSubmissionAction`; merged single entry flows the unchanged admit/dispatch loop -> ONE row |
| Panel wiring live | `GradingChatPanel.tsx:406-411` `handleSubmitComposite` -> `driver.submit({kind:"composite",student,parts})`; `:592` `onSubmitComposite={handleSubmitComposite}` |
| Composer tray live | `ChatComposer.tsx:89-92` tray state; `:307-309` "+ Add part"; `:326-353` tray list + "Student name" + "Grade submission (N)"; `:233-238` `handleGrade` -> `onSubmitComposite` |
| Wiring is PINNED (reachability test) | `GradingChatPanel.structure.test.ts:485-525` (panel hands `onSubmitComposite`, three single-part props preserved, "+ Add part" / "Grade submission (${parts.length})" present) and `:713-720` (record frames become composite file parts) |

The owner also re-requested two adjacent composite extensions AFTER 2026-10-06,
and BOTH shipped: SUBMISSION-LABELS (`BACKLOG.md:318`, `f6d89ddb` - label on any
mode) and RECORD-SCREEN-SUBMISSION (`BACKLOG.md:314`, `42da16d3` - screen frames
become composite file parts). The 2026-10-12 request is a near-verbatim
restatement of the shipped COMPOSITE-SUBMISSION row, down to the word
"composite." The most probable truth is that the feature exists and the owner
either has not found the "+ Add part" affordance or wants a different-shaped
affordance. The real job is NOT a build; it is the fork in section 5.

**Leverage (one line, owner's AGENTS.md rule):** the shipped mechanism is
ATTRIBUTION + SCALE (`docs/grading-chat-composite-scope.md:185-204`,
`docs/loop/leverage.md:43`) - "these N artifacts are ONE named student's single
effort, graded once" is a typed fact the code holds (`mergeCompositeEntries`
produces exactly one entry whose `student` is set by construction); a chat
window cannot bind a file + typed notes to one subject and grade them as one.
This claim is already authored and shipped; THIS scope earns no new leverage
(it proposes no new mechanism), so per `leverage.md` there is no new claim to
make - record that as the fired trigger.

---

## 1. STEP 0 - the current submission model, traced (brief's required trace)

### 1.1 The composer kinds (ChatComposer.tsx)

`InputMode` (`ChatComposer.tsx:37`) = `"text" | "file" | "url" | "record" |
"lms"` - FIVE modes, selected by one `SegmentedToggle` (`:278-290`), persisted
under `ta-grading-chat-input-mode` (`:35`, `loadInputMode`/`persistInputMode`
`:39-57`). (The brief's list "text/file/url/record/zip/video/LMS" is wrong:
there is no `zip` or `video` MODE - a zip rides the `file` mode's picker and is
disambiguated server-side; video rides `record`/storage. The composer surface
is the five above.)

Each mode's primary control, WHEN THE TRAY IS EMPTY, submits immediately through
one of three panel callbacks:
- text: `handleSendText` (`:139-149`) -> `onSubmitText(content,label)`.
- file: `handlePickFile` (`:172-183`) -> `onSubmitFiles(files,label)`.
- url: `handleSendUrl` (`:185-194`) -> `onSubmitUrl(url,label)`.
- record: frames captured by `useChatScreenFrameCapture` (`:98-100`) are pushed
  into the tray as `file` parts (NOT an immediate submit).
- lms: `handleSendLms` (`:205-218`) resolves the picked ids to a Canvas URL and
  then calls `onSubmitUrl` - i.e. LMS is a URL submission underneath.

### 1.2 How a submission becomes a grading request (intake)

- Non-composite single submit -> `prepareChatSubmissionAction(formData)`
  (`grading-chat-intake.ts`, reads `kind`, delegates to `resolveOnePart` `:172`)
  -> `IntakeOutcome` (`chatSubmissionIntake.ts:60-73`): `{kind:"entries";
  entries: StudentSubmissionEntry[]; pointsPossible; classification?}` or
  `{kind:"refused"; reason; videoFailure?}`.
- Composite submit -> `prepareCompositeSubmissionAction(formData)`
  (`grading-chat-intake.ts:336`): decodes `partCount` + each `part.<i>.kind` and
  payload, resolves EACH part through the SAME `resolveOnePart`, runs
  `extractSingleEntry` per part (exactly-one-entry gate), then
  `mergeCompositeEntries` the resolved parts into ONE entry.

### 1.3 How one entry's content reaches the LLM (the entry model)

`StudentSubmissionEntry` (`src/lib/grade/types.ts:424-444`): `student`,
`content: string`, `mergedFileCount`, `submittedFiles: SubmittedFileInfo[]`,
plus optional single-source provenance. A single entry ALREADY carries BOTH a
text body (`content`) and artifact bytes (`submittedFiles[].rawBase64` /
`mimeType`), and the engine's prompt assembly already combines a file's inline
bytes with text (`src/lib/grade/inline-visuals.ts`, `engine.ts` - the
file+text precedent the brief points at). So "carry an artifact AND extra text
on one entry" needs NO new seam: `mergeCompositeEntries` (`:120-138`) folds N
parts' `content` (join `"\n\n---\n\n"` with a `Part i - <label>:` header) and
unions their `submittedFiles` (de-duped via `assignUnclaimedLabel`) into one
`StudentSubmissionEntry`. `mergedFileCount` is the SUM of each part's own count
(text 0, single file 1, repo fileCount).

### 1.4 Dispatch - one composite = one row

`useContinuousGradingRun.ts` `submit` composite branch (`:451-471`) builds the
flat FormData; `:488-490` calls `prepareCompositeSubmissionAction`; the returned
single merged entry flows the UNCHANGED admit/dispatch loop (`:514-549`), so one
composite -> one `sourceIndex` -> one row. The request body already allows a
file and text on the same entry, which is exactly why composite was "mostly a UI
affordance" (the brief's own hypothesis, confirmed).

---

## 2. Coverage of the owner's words against what is built

"add a TEXT submission to any of the OTHER submission types":

| Other type | Attach text today? | How / why |
|---|---|---|
| file | YES | file part + text part in the tray -> one row. `ChatComposer.tsx:172-183,157-163` |
| url (Canvas single / GitHub repo / Drive file) | YES, IFF the URL resolves to exactly one entry | `extractSingleEntry` (`:146-159`) admits a 1-entry source as a part |
| record (screen) | YES | frames become `file` parts (`:98-100`), add a text part, grade. `RECORD-SCREEN-SUBMISSION` 42da16d3 |
| url (whole-class Canvas) / zip | NO - by design | resolves to >1 entry; `extractSingleEntry` refuses it by name (`chatSubmissionIntake.ts:152-157`). Attaching text to a WHOLE CLASS is incoherent (which student?), so this exclusion is correct, not a gap |
| lms (picker) | NO - same reason | LMS resolves to a whole-class Canvas assignment URL (`handleSendLms` `:205-218`), i.e. >1 entry - refused as a part for the same reason |

So every single-artifact "other type" the request can coherently mean is
already covered. The only excluded cases (whole-class zip / Canvas / LMS) are
excluded BY CONSTRUCTION because a composite is ONE student and those are many.

---

## 3. Reachability walk (the capability is reachable, proven from source)

Click path to grade "a file PLUS typed notes" as one composite row today
(`ChatComposer.tsx`, no render available so this is a source reading, not a
run):
1. File mode -> "+ Add part" (`:307`, `handleAddPart` `:222-229` opens the file
   picker with `addIntentRef`) -> pick a file -> `handlePickFile` adds it as a
   `file` part (`:178`, `asParts` true). Tray now active (`trayActive` `:92`).
2. Switch to Text mode -> type -> "Send" routes to `handleAddTextPart` while the
   tray is active (`handleSendText:141-144`), or press "+ Add part" -> text part
   added (`:157-163`).
3. (optional) type "Student name" (`:339-347`) -> "Grade submission (2)"
   (`:348-350`) -> `handleGrade` -> `onSubmitComposite` -> one row.

Approx 4-5 primary actions; the single-submission path pays ZERO extra clicks
(the tray is empty by default). This is the compose-time composite, and it is
LIVE. It is not unreachable; the open question is whether it is DISCOVERABLE,
which no test in this repo can answer (section 7).

---

## 4. The entry model, persistence, kinds, leverage (brief's "THE DESIGN" items, each already resolved in-tree)

1. **Entry model (brief item 2):** one entry carries artifact + text via
   `mergeCompositeEntries` (section 1.3); both reach the LLM in ONE grade call
   because the merged entry flows the existing single dispatch loop (section
   1.4). No second grade call. Identity/distinctness preserved: `student` set by
   construction + `assignUnclaimedLabel` de-dup in the driver
   (`useContinuousGradingRun.ts:541-549`). This is BUILT; nothing to design.
2. **Which kinds take attached text (brief item 3):** single-artifact parts
   (text, single file, single-entry url: GitHub repo / Drive file / single
   Canvas submission). NOT multi-student zip or whole-class Canvas/LMS. The rule
   is on CARDINALITY (exactly one resolved entry), not a kind denylist
   (`extractSingleEntry`, `chatSubmissionIntake.ts:146-159`), which is the
   correct generalisation and matches the owner's intent. BUILT.
3. **Persistence (brief item 4):** the composite text is TRANSIENT per-submission
   content, not a durable setting - correctly NOT persisted. Confirmed: the
   exact-set `ta-` canary (`grading-chat-storage-keys.structure.test.ts:14-21`)
   lists 8 keys and NONE is composite-part content; W1/W2 added no `ta-` key
   (`BACKLOG.md:298` "No new CSS class, no new ta- key"). This is the same
   treatment the per-submission text label gets. CORRECT as built; a scope that
   persisted draft parts would REDDEN that exact-set canary.
4. **Leverage (brief item 5):** see section 0 (ATTRIBUTION + SCALE, already
   authored and shipped; no new claim owed by this scope).

---

## 5. THE FORK (owner decision - every answer terminates this activity)

The 2026-10-12 request has two readings and the tree settles which are built:

- **Reading (a) COMPOSE-TIME composite** - attach text while composing a
  file/url/record submission and grade them as one row.
  Status: **SHIPPED and reachable** (sections 0, 3). Nothing to build. The only
  conceivable NEW work under (a) is DISCOVERABILITY of the existing "+ Add part"
  tray - see section 6 - which this environment cannot measure (section 7).
- **Reading (b) ADD-TO-EXISTING-ROW** - attach text to an ALREADY-GRADED row and
  regrade incorporating it.
  Status: **NOT built.** `regrade(student)` (`useContinuousGradingRun.ts:608-623`)
  re-dispatches the SAME retained body (`:610,617,620`) with no way to add
  content. This is a genuinely new capability (a per-row "add notes and regrade"
  surface) and a product decision.

**RECOMMENDED READING: (a).** The owner used the word "composite" - the exact
name of the shipped feature - and phrased it as "add a text submission to the
OTHER types," which is the compose-time tray verbatim. Reading (b) would be
phrased against a graded row ("after I grade, let me add..."), which the words
do not say.

**The terminating question to put to the owner (it is not a build blocker - see
section 6 for what to build meanwhile):**

> The compose-time composite you are describing already ships - in the grading
> chat composer, "+ Add part" assembles a file (or URL, or screen recording)
> together with typed text into one student's single graded row. Which do you
> want: (a) it is there, walk it and confirm - optionally I make the affordance
> more obvious (section 6); or (b) something different - attach text to a row you
> have ALREADY graded and regrade it (not built today)?

Every answer ends this activity: (a-confirm) -> close as already-shipped;
(a-discoverability) -> ship section 6's bounded composer change; (b) -> open a
NEW backlog row for add-to-graded-row regrade (its own two-round scope), which
this document does NOT design.

---

## 6. The ONLY actionable build under the recommended reading: a bounded discoverability affordance (owner-gated)

This is OPTIONAL and gated on the owner choosing (a-discoverability). It does NOT
add a capability; it makes the existing one easier to find. It is the smallest
truthful change and it is composer-only.

**What it is (candidate, UX seat owns the final copy/shape):** in `file`, `url`
and `record` modes, surface that typed notes can accompany the artifact - e.g.
reword the generic "+ Add part" in these modes to name the gradable-text intent,
or add an inline "Add notes" affordance that drops a text part into the tray.
This is a copy/affordance change, NOT a new data path: it routes to the existing
`handleAddTextPart` / tray (`ChatComposer.tsx:157-163`). NOTE a real code-level
distinction the owner may be conflating: file/url modes already have a "Label
(optional)" field (`:297-304,383-390`), but a LABEL only names the row and is
NOT graded content; gradable text alongside a file is only reachable through the
tray. Naming that difference is likely the whole of the discoverability fix.

**Wave 1 (single wave; no new capability, so no new seam):**
Write-set (exact paths):
- `src/app/components/grading-chat/ChatComposer.tsx` (553 lines by `wc -l`,
  ceiling 1000 - ample headroom; a copy/affordance change adds < ~30 lines).
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` - update
  the source-text canaries if the control's literal text changes (the test pins
  "+ Add part" at `:521` and "Grade submission (${parts.length})" at `:524`; any
  reword must update the pinned literal SAME-COMMIT or the test goes red).

No new `ta-` key (transient input stays transient - section 4.3). No CSS class
unless a new control element is added, in which case it is referenced
same-commit (`grading-chat.module.css`, and the repo-wide orphan ratchet
`page-module-css-orphan-classes.test.ts` scans every `*.module.css`).

**FULL canary gate for Wave 1 (run ALL; this session has shipped reds from
scoped gates that omitted a canary):**
- `npx tsc --noEmit` (exactly one caller; it races on `tsconfig.tsbuildinfo`).
- `npm run lint` (pass = exit 0 and NO NEW warning in `ChatComposer.tsx` vs the
  same command before the change; do not pin the absolute count).
- `npm run test:paths src/app/components/grading-chat/GradingChatPanel.structure.test.ts src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts src/app/components/grading-chat/recording-split.structure.test.ts`
  - the multi-path wrapper (a raw multi-path `vitest`/`npm test` silently drops
    unmatched args). GradingChatPanel.structure pins the composite + record
    wiring and the control literals; grading-chat-storage-keys is the EXACT-set
    `ta-` canary (reddens if any key is added or any new `ta-` spelling appears);
    recording-split is included because `ChatComposer.tsx` is read by the
    recording-area structure canary set and the Record mode lives there.
- `npx vitest run src/app/components/grading-chat/ChatComposer` is not a file -
    the composer has no own `.test.ts`; its behaviour is pinned by the structure
    tests above (NO component renders - section 7), so there is no unit file to
    add. If the UX seat extracts any pure logic into a `.ts` leaf, add its
    `.test.ts` and name it in this gate.
- `npx vitest run src/file-size-ceiling.structure.test.ts` (UNCONDITIONAL - walks
  all of `src/`; `ChatComposer.tsx` at 553 is far under 1000 but the canary is
  always carried).
- `npx vitest run src/source-bytes.structure.test.ts` and
  `npx vitest run src/lib/no-emojis.test.ts` (ASCII/no-emoji/no-BOM on the edited
  TSX; copy changes are the exact place an emoji or smart-quote slips in).
- `npx vitest run src/tools/strip-comments-agreement.structure.test.ts` ONLY if a
  test file in the diff mentions a comment-strip helper literal (none expected).
- **A FULL `npm test` sweep before the wave is called done** (the pre-push gate
  runs NO vitest, so the exact-set/structure canaries are not caught at push; a
  full sweep is the backstop).

**Engine / entry-model tests:** NOT on this wave's gate, because this wave does
NOT touch the entry model or the engine (`mergeCompositeEntries`, the dispatch
loop, `grade/engine.ts` are all unchanged). If the owner instead chooses reading
(b), that NEW item's scope must gate the driver (`useContinuousGradingRun`
lifecycle tests) and the intake/entry tests, because it changes the regrade
dispatch path - but that is out of scope here.

---

## 7. What CANNOT be verified in this environment (stated, not worked around)

- **Discoverability / "does the owner find the affordance".** No component is
  rendered by any test in this repo (`this-repo.md` section 6; vitest is
  node-env, no jsdom). I cannot measure whether "+ Add part" reads as "attach
  text to this file." The discoverability claim in sections 5-6 is therefore an
  OWNER-WALK judgment, NOT a measured defect, and I do not propose any
  requirement whose only enforcer would be a render. Do not build section 6 on
  the strength of a render I cannot run.
- **One-visible-row live grading of a composite.** The merge is unit-pinned
  (`chatSubmissionIntake.test.ts`), but the live surface producing exactly one
  row with the merged content visible is an owner/browser walk (network blocked,
  no render).
- **Whether the model grades the blended artifact+text coherently.** Every LLM
  path is mocked here; real model output is unverifiable locally
  (`this-repo.md` section 6).

---

## 8. Disposition of the brief's "THE DESIGN" asks (each maps to built code or a fork)

| Brief ask | Disposition |
|---|---|
| UX fork (a) compose-time vs (b) add-to-existing-row; recommend one | (a) is SHIPPED, (b) is NOT built. Recommend (a). Section 5. The fork survives, but as an owner decision about whether anything new is wanted, not as a build choice |
| Entry model: one entry carries artifact + extra text, one grade call | BUILT: `mergeCompositeEntries` (`chatSubmissionIntake.ts:120-138`), single dispatch loop (section 1.3-1.4). No design owed |
| Which kinds take attached text (not zip/LMS) | BUILT + justified on cardinality (section 2, 4.2). Matches the recommendation in the brief |
| Persistence: transient, do NOT persist | CORRECT as built - no `ta-` key; enforced negatively by the exact-set canary (section 4.3) |
| Leverage one-liner | ATTRIBUTION + SCALE, already authored/shipped; no new claim owed (section 0, 4.4) |
| Waves + write sets + full canary gate | Only the optional, owner-gated discoverability wave has a write set; it is fully gated (section 6). No capability wave exists because the capability exists |

---

## 9. Residual register (owner / instrument / step - all three present, or it is a deletion)

| id | residual | owner | instrument | step |
|---|---|---|---|---|
| RES-CMP2-FORK | which reading the owner means (a-confirm / a-discoverability / b) | repo owner | the terminating question, section 5 | owner answer; then close, or build section 6, or open a (b) row |
| RES-CMP2-DISCOVER | whether the shipped "+ Add part" tray is discoverable enough | repo owner | browser walk of the Grading chat composer (no render here) | owner walk of the live composer |
| RES-CMP2-AFFORD | IF (a-discoverability): the affordance/copy change in file/url/record modes | loop-implementer from a UX-seat note | the section 6 write-set + FULL canary gate (GradingChatPanel.structure literal pins updated same-commit) | a UX pass authors copy, then one build wave |
| RES-CMP2-ADDROW | IF (b): attach-text-and-regrade on a graded row is unbuilt | new backlog row (own two-round scope) | a driver regrade-with-added-content path + its lifecycle tests (NOT designed here) | separate scope if the owner chooses (b) |

Per DEV_LOOP step 0, each residual must be copied into `docs/BACKLOG.md` at
disposal time by the orchestrator; a residual that lives only here does not
exist. Note the existing `COMPOSITE-SUBMISSION` backlog row (`:298`) is in the
`verification` state with its owner-walk residual OPEN - that walk is the same
act RES-CMP2-DISCOVER names, so these should reconcile against that row rather
than open a duplicate feature row.

---

## 10. Measured line counts (command: `wc -l < <file>` via the Bash tool, which this-repo.md section 3 confirms agrees with `@(Get-Content).Count`), run 2026-10-12

| File | Lines | Ceiling (1000) headroom |
|---|---|---|
| `src/app/components/grading-chat/ChatComposer.tsx` | 553 | 447 - the only file section 6 edits |
| `src/app/components/grading-chat/GradingChatPanel.tsx` | 599 | 401 |
| `src/app/components/grading-chat/useContinuousGradingRun.ts` | 690 | 310 |
| `src/app/components/grading-chat/chatSubmissionIntake.ts` | 159 | 841 |
| `src/app/actions/grading-chat-intake.ts` | 392 | 608 |
| `src/app/components/GradingResults.tsx` | 997 | 3 - AT THE WALL; section 6 does NOT touch it (the brief's "GradingResults.tsx 998" is at `src/app/components/`, not `src/app/components/grading/`, and is 997 by `wc -l`) |

GradingResults.tsx is 3 lines under the ceiling: any future composite-render
work (reading b, or a richer composite row) must NOT add to it without an
extraction - flag for whoever picks up RES-CMP2-ADDROW.

---

## 11. Bottom line for the orchestrator

Do not dispatch a build of a composite submission - it exists (sections 0-4) and
is pinned (`GradingChatPanel.structure.test.ts:485-525`). Put the section 5
terminating question to the owner. If (a-confirm): reconcile against the open
owner-walk on `BACKLOG.md:298` and close. If (a-discoverability): dispatch a UX
note then the single composer wave in section 6 under its full gate. If (b):
open a new backlog row for add-text-and-regrade, which is a separate feature
this scope does not design. Nothing here is owner-BLOCKED: the recommended
action (put the question + reconcile against the existing verification row) is
startable now.
