# Repo grader W5: persist graded results across reload - security ruling (R-W5-8, informs fork F3)

Seat: security (`docs/loop/seats.md`, "Security"). Backlog item: A7, wave W5, fork
F3, residual R-W5-8 of `docs/repo-grader-w5-persist-data-seat.md` (the "data-seat
doc", committed 14dfc505). Authored 2026-10-04. HEAD moved three times during
this pass (an auto-commit process; `git rev-parse --short HEAD` read `a5e1b003`
in the data-seat doc, `8eae8324` and `c51fbb1d` mid-pass, `3fd692b9` at the last
read), so no claim below depends on HEAD; every claim cites a file I opened.

Status: ANALYSIS AND RULING ONLY. No production or test code was written. This
document has not been checked yet (a fresh `loop-checker` pass is its next step).
Nothing here is an owner ruling; the one owner-shaped element is isolated in
section 8.

Every quantity names its instrument. Instruments used:

- Reading, with `file:line` inline. Every cited file was opened, not grepped
  alone. Line numbers are as seen by the Read tool (1-based).
- `node` over the data-seat doc's Appendix A fixture, re-run by me (section 3.3).
- `npm run test:paths src/lib/client-state-sweep.test.ts`, run 2026-10-04:
  wrapper line `COVERED src/lib/client-state-sweep.test.ts files=1 passed=10`.
- `Grep` probes, each with the pattern named, because `docs/loop/traps-search.md`
  says an unpaired grep proves nothing. Where a probe returned NOTHING I say
  "probe returned nothing", which is weaker than "does not exist".
- `node_modules/@supabase/auth-js/src/GoTrueClient.ts` (installed
  `@supabase/auth-js` 2.106.2, `grep -m1 '"version"' package.json`) for session
  events, read as external-facts research per `seats.md`.

Nothing was run in a browser. This checkout has no `.env`, renders no component
and has no live Supabase (`docs/loop/this-repo.md` section 6). Every behavioural
statement about sign-out, expiry and tabs is a READING claim, not an observation.

---

## 0. The ruling, up front

**RULING: YES, with a safety contract.** Persisting the 12-field lean graded-cell
shape to `localStorage` under `ta-repo-grades-cells` is acceptable for this app
provided the MUST items in section 6 ship with it. Reasons, each established
below:

1. **Privacy delta: more of an EXISTING class, not a new one (section 3).** At
   HEAD four other `localStorage` stores already hold student-linked grades or
   feedback prose at rest, two of them with MORE identifying data than W5's
   keep-list (a Canvas numeric user id in `ta-github-grading-run`; the student's
   Canvas sortable name as the key of `ta-grading-results-edits:<url>`). W5's
   persisted blob carries no student name field and no Canvas id; its only
   identifier is the repo full name used as a key.
2. **The retention control is the existing sweep, and it already covers the new
   key by default (section 4).** The keep-list is exactly `ta-theme`
   (`src/lib/client-state-sweep.ts:45`) plus the sweep's own marker (`:152`).
   `ta-repo-grades-cells` would be erased on every owner change, on sign-out and
   on a hard session expiry with a page open. That resolves data-seat residual
   R-W5-3 (section 4.3).
3. **The sweep has gaps (section 4.2), all pre-existing and shared with the
   other stores.** The contract closes two cheaply (an explicit pin test and a
   user-reachable Discard) and recommends a third (an owner stamp). It does not
   pretend a browser store can be made safe on a profile whose session is alive:
   on such a profile the attacker already has the instructor.

Cost of this being wrong, and of the opposite call, is in section 7. Whether the
OWNER specifically is needed: section 8 (short answer: only through F3 itself,
and no separate gate).

---

## 1. What I opened

Data-seat doc in full (`docs/repo-grader-w5-persist-data-seat.md`, 728 lines by
the Read tool). Code: `src/lib/client-state-sweep.ts` (whole),
`src/lib/client-state-sweep.test.ts:20-134`,
`src/lib/workflows/run-form-options-cache.ts:60-239`,
`src/context/SupabaseProvider.tsx` (whole), `src/app/components/TopBar.tsx:495-535`,
`node_modules/@supabase/auth-js/src/GoTrueClient.ts:3780-3829, 4570-4806`,
`node_modules/@supabase/ssr/dist/main/utils/constants.js`,
`src/lib/supabase/client.ts` (head), `src/proxy.ts`, `src/lib/access.ts:1-60`,
`src/app/components/repo-grades/repoGradesCellEdits.ts:50-160`,
`repoGradesUiState.ts:255-404`, `repoGradesLog.ts:20-130`,
`repoGradesPosting.ts:395-465`, `useRepoGradesGradingActions.ts:75-110, 290-410`,
`index.tsx:170-199, 545-600`, `RepoGradesLogPanel.tsx` (clear control),
`src/lib/github-grading-run-store.ts:1-130, 370-420`,
`src/lib/workflows/grading-review-rows.ts:40-97`,
`src/app/components/grading-results/gradingResultsHelpers.ts:555-690`,
`src/app/components/assessment-shared/assessment-row.ts:84-110`,
`useAssessmentRowStore.ts:1-110`, `src/lib/grade/types.ts` (whole),
`src/lib/grade/engine.ts:36-170`, `src/lib/grade/prompts.ts:200-213`,
`src/lib/grade/parsing.ts:275-293`, `src/lib/canvas/submissions.ts:105-120`,
`src/lib/canvas/grades.ts:150-185`, `src/app/actions/grading.ts:60-90`,
`next.config.ts`, `vercel.json`.

---

## 2. What the 12 persisted fields contain

The data-seat doc's keep-list (section 2.1, `PersistedRepoGradeCell`) is 11
fields copied from `RepoGradeCellEdit` plus one new field, `at`. I enumerated the
source type (`repoGradesCellEdits.ts:55-154`): 15 members. 11 kept + 4 dropped
(`grading`, `gradeError`, `submittedFiles`, `codeExecution`) = 15, so the data
seat's partition is exhaustive over the type as it stands.

| Field | Content | Student-identifying by itself? | Evidence |
|---|---|---|---|
| `at` | ISO timestamp | No | data-seat 2.1 |
| `score` | "18/20" or hand-typed text | No (a grade, linked only through the key) | `repoGradesCellEdits.ts:57` |
| `comment`, `strengths`, `improvements`, `generatedComment` | Model prose, then instructor edits of it. This is the text that is POSTED TO THE STUDENT in Canvas. | Not by construction: the prompt forbids the student's name (`prompts.ts:208`), but that is an instruction to the model only. Probe `scrub\|redact\|stripStudentName\|containsStudentName\|anonymi[sz]e\|pseudonym` over `src/lib/grade` (non-test) returned only the class-trends anonymiser (`class-trends-insight.ts:26-59`), which is a different path; I found no output filter on grading prose. The model is shown `Student: <label>` (`engine.ts:82`) and on this view the label is the repo full name (`github-repos.ts:619`), so an echo of the repo name is possible. Instructor hand-edits are unconstrained free text. | `repoGradesCellEdits.ts:66-78`; `prompts.ts:208`; `engine.ts:82` |
| `resubmitNotice` | Fixed 87-char string or empty | No | `types.ts:15-16` |
| `rubricAreas` | Per-criterion `{area, score, comment}`; area names are the instructor's rubric criteria, comments are model prose | Same as the prose row | `types.ts:39-43` |
| `generatedScore` | Score as generated | No | `repoGradesCellEdits.ts:110` |
| `postStatus` | 4-member enum | No | data-seat 2.1 |
| `postMessage` | A skip reason or error string. Sources: fixed strings in `canvas/grades.ts:149, 172-176` ("No submission found for this student in Canvas (HTTP 404).", "Canvas rejected the grade (HTTP n).", and an auth-failure string that names an env var, `<code>_CANVAS_API_TOKEN`, not its value), or a whole-request `result.error` from the server action (`repoGradesPosting.ts:447-448`). The set of `result.error` strings was NOT enumerated. | No by the fixed strings; unproven for `result.error` | `repoGradesPosting.ts:443-463` |
| `submissionTruncated` | boolean | No | `types.ts:261` |

Absent from `RepoGradeCellEdit` entirely (so cannot leak by the keep-list): any
student name, Canvas user id, email, GitHub username field, `gradedRepo` or
`gradedRef`. The Canvas id the post path needs is read live from
`row.binding.canvasUserId` at post time (data-seat 2.2, citing
`repoGradesPosting.ts:294`), never from the cell.

The one identifier that IS in the blob is the KEY: the repo full name, then the
folder name (data-seat 2.1, shape `courseId -> repo -> folder -> cell`). Whether
the repo full name identifies a person depends on how the owner's orgs name
repos. Code evidence that it often does: the binding suggester treats the repo
slug as an inferred student handle (`repoGradesRows.ts:228-237`, "repoSlug-derived
handle ... rule b of suggestRepoStudentBindings"). I could not see the owner's
real repo names. Treat the key as a pseudonymous student identifier (a GitHub
handle), not a legal name, unless the owner's repos embed legal names.

Classification for the owner, in one line: the persisted cell is "a grade plus
student-facing feedback, keyed by a probable GitHub handle", which is the same
sensitivity as a posted Canvas comment plus a roster hint.

---

## 3. The privacy delta: new class, or more of an existing one

### 3.1 The existing at-rest inventory (all `localStorage`, all swept by default)

Found by `Grep` for `"ta[-:_][a-z0-9:_-]*(grad|roster|student|feedback|repo|draft|submission)[a-z0-9:_-]*"`
over `src` (non-test), then opened. Only stores that hold student-linked grades or
feedback are listed; pure UI-control keys are omitted.

| Key | Holds | Student identifier at rest | Evidence |
|---|---|---|---|
| `ta-github-grading-run` | The last whole graded run: `student`, `userId` (Canvas id), `gradedRepo`, `gradedRef`, `strengths`, `improvements`, `feedback`, `overallComment`, `rubricAreas` with comments, `totalScore`. Strips `submittedFiles` and `codeExecution`. One run, not per course. | YES: repo label as `student`, and the Canvas numeric `userId` | `github-grading-run-store.ts:25, 91-124`; `grading-review-rows.ts:47-86` (`:86` keeps `userId`) |
| `ta-grading-results-edits:<canvasUrl>[::surface]` | Per-student instructor-edited `total`, `strengths`, `improvements`, `resubmitNotice`, `areas` scores | YES: the object key is `result.student`, which on the Canvas path is the student's `sortable_name` (`submissions.ts:112-115`) | `gradingResultsHelpers.ts:565-572, 609-623, 675-679` |
| `ta-repo-grades-log` | Per course, up to 500 entries (`repoGradesLog.ts:108`): `repo`, `folder`, `score`, `courseName`, and `detail`. For a successful grade `detail` includes `Feedback: <first.feedback>` whenever `feedback !== overallComment`. `feedback` is built by `formatFeedback` (`engine.ts:150`) as `Total Score: ...`, one line per area score, then `Overall: <overallComment>` (`parsing.ts:275-293`), so it ALWAYS differs from `overallComment` and the full strengths-plus-improvements prose is therefore logged on every graded cell. | YES: repo full name | `useRepoGradesGradingActions.ts:347-354`; `repoGradesLog.ts:85-102`; `repoGradesUiState.ts:94, 387-396` |
| `ta-rec-grade-table` (recording grading rows) | Rows with `studentName` plus `AssessmentFeedback` fields | YES: display name | `assessment-row.ts:84-96`; `useAssessmentRowStore.ts:104-110`. Contents of `AssessmentFeedback` read from the type name only; not opened further. |
| `ta-repo-grades-selected`, `ta-github-grading-queue` | Identifier-only: selected repo full names, queued repo refs and labels | YES, no grade | `repoGradesUiState.ts:267-288`; `GithubGradingPanel.tsx:51-53` |

### 3.2 What W5 adds over that inventory

Item by item, against the closest sibling:

- **Score, strengths, improvements, resubmit notice, rubric area scores, per
  repo per folder.** Already at rest: the log carries the composed prose and area
  scores per graded event (row above). `ta-github-grading-run` carries all of it
  for the last run. NOT new in kind.
- **Per-criterion comment prose (`rubricAreas[].comment`) and `generatedComment`.**
  The log's `Feedback:` note carries area SCORES, not area comments
  (`parsing.ts:286-289`). `ta-github-grading-run` does carry area comments for
  its single run. Marginally more in the repo-grader surface, not new in kind.
- **Instructor-edited text of the three boxes.** The log records the model's text
  at grade time and never the instructor's later edit (`useRepoGradesGradingActions.ts:347-354`
  is built before any edit). So on THIS view, instructor-authored free text at
  rest is new. It is NOT new to the app: `ta-grading-results-edits` persists
  exactly that, per student, today (`gradingResultsHelpers.ts:609-623`). This is
  the single true novelty and it is the item a privacy-minded reader should
  weigh: an instructor can type anything into a box before deciding what to post.
- **The posted marker.** The log already records `post-succeeded` and friends
  (`repoGradesLog.ts:36-38`). Not new.
- **Student identifier.** Strictly LESS than `ta-github-grading-run` (no Canvas
  id, no `student` field) and no more than the log (same repo full name).

Verdict: **no new class of at-rest data; more of an existing class, with one
extension (instructor-edited prose in the repo-grader surface) that already has a
precedent in `ta-grading-results-edits`.**

### 3.3 Volume, re-measured

I extracted the data-seat doc's Appendix A fixture to the scratchpad and ran it:
`awk` extraction then `node appendix.js` (2026-10-04). Output reproduced the doc's
numbers: typical lean cell 2,938 chars; worst-under-cap 8,028; 30 x 4 typical
lean 354,541; 30 x 12 typical lean 1,062,151; log 500 entries short detail
266,500, 3,000-char generated rubric 1,617,500. These are CHARACTER counts of a
synthetic fixture under the data-seat doc's stated assumptions (text lengths
guessed; no real graded output exists in this checkout). They show W5's volume is
the same order of magnitude as the activity log's, not a new scale. They say
nothing about real sizes (data-seat R-W5-1 stays open).

---

## 4. How the sweep treats `ta-repo-grades-cells`

### 4.1 Keep-list confirmation

Confirmed by reading: `DEVICE_PREFERENCE_KEYS = ["ta-theme"]`
(`client-state-sweep.ts:45`); one additional exemption, the sweep's own owner
marker `ta-sweep-owner` (`:70, :152`); matching is exact string equality, not a
prefix test (`:146-154`). Everything else, including every unprefixed key, is
erased by `sweepLocalStorage` (`:167-188`). So a new key is swept unless someone
adds it to the keep-list on purpose.

What guards that today, and the hole in the guard (checked by running the test's
own smell list against the new key name):

- `client-state-sweep.test.ts:42-56` pins a list of keys that must be erased and
  already includes `ta-github-grading-run` and `ta-grading-results-edits:...`. It
  does NOT include any repo-grades key.
- `client-state-sweep.test.ts:111-125` bounds the keep-list at 6 entries and bans
  keep-list entries whose name contains `instructor`, `course`, `grading`,
  `workflow`, `institution`, `prompt`. I evaluated `"ta-repo-grades-cells"` against
  that list with `node -e`: all six `includes` results are `false`. So if someone
  added `ta-repo-grades-cells` to `DEVICE_PREFERENCE_KEYS`, this smell test would
  PASS. The only thing that would stop it is a direct pin (contract item M1).

### 4.2 When it is and is not erased (reading claims, none exercised)

`setCacheOwner` (`run-form-options-cache.ts:182-212`) is the single chokepoint,
called from `SupabaseProvider.tsx:60` (first mount) and `:76` (every auth event).
It sweeps when the declared owner differs from the in-memory owner (`:195-206`)
and writes the owner marker after (`:211`). A first call whose marker equals the
stored marker short-circuits without sweeping (`:185-193`).

| # | Situation | Erased? | Evidence |
|---|---|---|---|
| a | Reload, same user, session alive | No (this is the feature) | `:185-193` |
| b | User clicks Sign out and the revoke call succeeds | YES: `signOut` removes the session and notifies `SIGNED_OUT` (`GoTrueClient.ts:3816-3817, 4792-4806`), the listener calls `setCacheOwner(null)`, the owner changes, sweep runs and the marker is cleared (`SupabaseProvider.tsx:76`; `run-form-options-cache.ts:195-211`). Cells are erased, so graded results do NOT survive sign-out and sign-in. | as cited |
| c | A different person signs in on this browser | YES, whether or not (b) happened: null-to-owner and A-to-B both sweep unless the marker matches (`:185-206`) | as cited |
| d | Session hard-expires or the refresh token is rejected while the page is open | YES: a non-retryable refresh error calls `_removeSession` (`GoTrueClient.ts:4692-4697`; the startup path at `:4606-4618`), which emits `SIGNED_OUT` (`:4805`), which sweeps via the same listener. **This answers data-seat R-W5-3: a token-refresh failure DOES sweep**, for non-retryable errors. | as cited |
| e | Refresh fails on a network error (retryable) | No event, no sweep (`:4695`, `:4611`); the session survives | as cited |
| f | **Session expires while the browser is closed**, then the page is opened with nobody signed in | **NO.** The first `setCacheOwner(null)` finds `ownerMarkerFor(null)` is null, so the short-circuit is skipped, then `userId === currentOwner` (null equals null) returns before the sweep (`:185-195`). The old owner's marker and every `ta-` key stay in place until someone signs in. A different person signing in then sweeps (case c); the same person returning keeps them (intended). The UI cannot show the cells meanwhile (see 5, T1), but DevTools and any script on the origin can read them, including on the public `/login` path (`access.ts:321`, `isPublicPath`). | as cited |
| g | Sweep removal of a key throws | Swallowed per key (`client-state-sweep.ts:175-182`) and the whole sweep never throws (`:183-187`), and the new owner's marker is then written (`run-form-options-cache.ts:211`). A key that failed to delete is now indistinguishable from the new owner's own data. Exotic storage backends only. | as cited |
| h | A second tab still open as the previous user | The tab keeps its in-memory `cellEdits`; `setCacheOwner` clears module caches and storage, not React state (`:195-211`), and TopBar's full reload runs only in the tab where Sign out was clicked (`TopBar.tsx:513-516`). `@supabase/auth-js` does broadcast auth events across tabs (`GoTrueClient.ts:443`), so the other tab sweeps too, but its already-rendered cells remain and a later cell change would re-persist them under the NEW session, because the persist effect writes whatever the tab's state holds (the pattern of `index.tsx:593-596`). Whether that tab is redirected away on `SIGNED_OUT` was NOT determined. | as cited |
| i | **Sign out clicked while the revoke call fails** (not 401/403/404) | NOT erased and the session is NOT removed: `_signOut` returns the error before `_removeSession` (`GoTrueClient.ts:3800-3813`), and `TopBar.handleSignOut` ignores the returned value and navigates to `/login` anyway (`TopBar.tsx:513-516`). The user believes they signed out; cookie session and every `ta-` key remain. Pre-existing, independent of W5. | as cited |

Cases f, g, h and i are pre-existing and equally true of `ta-repo-grades-log`,
`ta-github-grading-run` and `ta-grading-results-edits:`. W5 inherits them; it does
not create them.

### 4.3 What the sweep implies for the feature's value (a fact the owner should have)

Because case (b) erases on sign-out, F3=YES delivers "graded results survive a
reload and a browser restart while you stay signed in", NOT "survive signing out
and back in". If the owner expects results to outlive a sign-out, Option A does
not do that; that would be a different retention decision (and Option B, which
the data-seat doc did not recommend).

---

## 5. Threat model for persisting at rest in `localStorage`

Today's posture for THIS view: graded cells live only in React state
(`index.tsx:178-181`, "never persisted"), while the log, selection and the
sibling stores persist. W5 changes the cell state from memory-only to
at-rest-until-swept.

| Id | Threat | Who and how | Existing control | W5 delta | Rank |
|---|---|---|---|---|---|
| T1 | Shared browser profile, another person with physical or remote-desktop access | Opens DevTools, Application, Local Storage; or opens the site. | If the instructor signed out: cases b, c erase. If not: the session cookie is alive (`@supabase/ssr` default `httpOnly: false`, `maxAge` 400 days, `constants.js:4-11`; `src/lib/supabase/client.ts` sets no cookie options, probe `cookie` returned nothing) and the next person simply IS the instructor in the app, with server actions that post grades (`grading.ts:65, 87`, `requireUser`). The gate redirects anonymous visitors to `/login` (`src/proxy.ts:16-25`; `access.ts:296, 321`; reading, not exercised). | Marginal where the session is alive (the attacker already has more than the cells). Real only in the orphan windows f and i, and for a person using DevTools on a profile with no session (T1b). | Medium likelihood on shared lab machines, low incremental harm |
| T1b | Orphan data on a profile with no signed-in user (cases f, g, i) | DevTools read of `localStorage`, or any script on the origin, including the public `/login` page | Next sign-in by a different person sweeps (case c) | W5 adds more bytes to the same orphan set; no new mechanism | Low to medium |
| T2 | XSS on the origin | A script reads `localStorage` and `document.cookie` | Markdown renderer was hardened per memory (094ef65, not re-verified here). There is no CSP: probes `Content-Security-Policy\|script-src\|frame-ancestors\|X-Frame-Options` over `next.config.ts` (19 lines), `vercel.json` (8), `src/proxy.ts` (25) and a repo-wide `Content-Security-Policy\|http-equiv` over `src` all returned nothing. Deployed headers could still be set in the Vercel dashboard, which I cannot see. 10 JSX `dangerouslySetInnerHTML` sites exist (`layout.tsx:155`, `AssignmentPreviewModal.tsx:95`, `CourseIntelHistory.tsx:296`, `CourseIntelAnswer.tsx:174`, `ClassTrendsDraftPanel.tsx:93`, `PageBody.tsx:44`, `KnowledgeOverviewPanel.tsx:213, 303`, `KnowledgeOverviewHistory.tsx:168`, `AnnouncementDraftSlot.tsx:230`); I did not audit their sanitisation. | An XSS attacker also gets the session cookie (not httpOnly), which dominates the cells. W5 adds data to the same exfil, not a new exfil. | Pre-existing, high impact, W5 increment small. Routed as residual R-S1, not blocked on. |
| T3 | Browser extension with access to the origin | Reads `localStorage` and cookies | Out of the app's control | Same as T2 | Accepted |
| T4 | Cross-origin read | Another site reads this origin's storage | `localStorage` is per-origin; no cross-origin read path exists | None | Not a threat |
| T5 | In-app bulk export of local data | An app path that enumerates `localStorage` and sends or downloads it | Probe `localStorage\.key\(\|Object\.(keys\|entries)\(\s*(window\.)?localStorage\|\{\s*\.\.\.localStorage` over non-test `src` returned only the sweep itself (`client-state-sweep.ts:159, 172`). The log has a user-initiated CSV/JSON export (`repoGradesLog.ts:59-63`); cells would have none. | None provided nothing new reads the key (contract S4). Third-party scripts: no analytics, error-tracking or tag-manager dependency by a name probe over `package.json` (`@vercel/analytics`, `posthog`, `sentry`, `mixpanel`, `segment`, case-insensitive, nothing) and no external script in `layout.tsx` (probe for `https://`, `Analytics`, `googletagmanager`, `<Script` returned nothing). The probe is a name list, not exhaustive. | Not a threat today |
| T6 | Tampered blob (a script or the user edits a score or a posted flag) | Edits storage, then the instructor presses Post | Posting still passes `checkRowPostability` and the confirm (data-seat 4), and the server action authenticates the caller (`grading.ts:87`) but does NOT validate the grade payload against any server record, so integrity rests on the instructor's click | Equals the instructor typing the value. A restored `posted` or `error` cell is a one-click re-post (data-seat 3, last paragraph), the same state as mid-session | Accepted, parity with in-session |
| T7 | Data leaves the device through a path W5 adds | Restored text is sent somewhere new | The only sends are the existing explicit Post to Canvas and an explicit Grade (a model call) | None: restore does not call anything | Not a threat |
| T8 | Secrets in the blob | A token or key at rest | The project's own precedent keeps secrets out of `localStorage` (`LmsCredentialSection.tsx:19-23`: the token field is "never written to localStorage"). The keep-list holds no token, key, Canvas id or email (section 2). | None | Not a threat |

Net: W5's incremental confidentiality risk is dominated by risks the app already
carries (live non-httpOnly session cookie on the same origin, no CSP, orphan
windows, ten sibling-store key families). The honest summary is that W5 enlarges
the amount of student-linked data at rest by roughly the size of one more log
(section 3.3), without adding a mechanism, and that every control the app has
(sweep, sign-out) applies to it automatically.

---

## 6. The safety contract (if F3 = YES)

MUST items are conditions of the W5 build brief. SHOULD items are recommended,
and omitting one is recorded as a residual, not a defect. Each pass condition
names the object compared, the instrument, and the direction of failure. No
component renders under vitest, so every instrument is a node-env test or a
source-structure test unless marked OWNER WALK.

### MUST

**M1. The key stays erasable, by an explicit pin.**
Add `"ta-repo-grades-cells"` to the erase list at `client-state-sweep.test.ts:43-53`.
- Object: `shouldKeepLocalStorageKey("ta-repo-grades-cells")`.
- Instrument: `npm run test:paths src/lib/client-state-sweep.test.ts` (baseline
  today `passed=10`; after the edit the same wrapper line must show the new count).
- Fails when: the call returns `true`, which would happen if the key were added
  to `DEVICE_PREFERENCE_KEYS` or the matcher became prefix-based. The existing
  smell test (`:117-125`) does not catch this (section 4.1), which is why this
  pin is needed.

**M2. Persist only the enumerated fields, and say which fields are forbidden.**
The data-seat doc's P1 and P2 (`persist-data-seat.md` section 6) already require
enumerated field-by-field writes and a frozen 12-element key set. Add the
security-specific forbidden set to P1: the persisted cell and the blob must
contain no property named `student`, `userId`, `canvasUserId`, `gradedRepo`,
`gradedRef`, `gradeError`, `submittedFiles`, `codeExecution`, `rubricText`, and no
unique marker string placed in `submittedFiles[].previewContent`, in
`codeExecution.stdout`, or in `gradeError`. `gradeError` is on the list on privacy
grounds as well as function: error strings are unbounded free text.
- Object: `Object.keys(toPersisted(edit))` and `JSON.stringify(blob)` for a fully
  populated `RepoGradeCellEdit` with marker strings in every dropped field.
- Instrument: node-env unit test (P1, P2); mutant that spreads `...edit` must make
  it fail (data-seat sabotage requirement).
- Fails when: the key set differs from the frozen literal in either direction, or
  any marker appears in the serialized text.
- Also: the visible `persistError` text must be a fixed string that embeds no cell
  content (reading check by the verifier; a one-line assertion if the string is
  built in a pure leaf).

**M3. A user-reachable "Discard saved results for this course", with confirm.**
The data-seat doc makes this "a UX-seat call" (2.5). On security grounds it is
upgraded to a requirement: it is the only retention control a user holds that
works without signing out (cases f, i and the shared-lab case need it). Precedent
and shape to copy: the log's Clear with `window.confirm` (`RepoGradesLogPanel.tsx:127-136`,
wired at `index.tsx:954`). It must remove the course slice from storage AND from
state.
- Object: persisted storage slice for the course, and in-memory `cellEdits`, after
  the discard handler runs.
- Instrument: node-env test of the pure clear function against a fake storage
  (slice absent, other courses untouched); source-structure check that the handler
  is passed to the control (the repo's wiring-test idiom); the control actually
  rendering and working is an OWNER WALK, because no component renders here.
- Fails when: the course slice is still present in storage, or other courses lost
  their cells, or no non-test source passes the handler to a control.

**M4. The sign-out and owner-change erase must stay the retention mechanism; no
second copy and no exemption.** Concretely: the leaf must not duplicate cells into
any other key, IndexedDB database or cookie, and nothing may route around
`setCacheOwner`. Instrument: M1 plus the data-seat key canary
(`repoGradesStorageKeys.structure.test.ts`, 18 to 19 keys) which already forces
any new key in `repoGradesUiState.ts` to be a visible decision. Fails when a new
`ta-` key appears holding cell content without the canary count changing (the
canary's own direction).

### SHOULD

**S1. Owner stamp (closes cases g and h, and narrows f).** Persist the blob as an
envelope `{ o: <ownerMarker>, c: <courseId -> repo -> folder -> cell> }`, where
`ownerMarker = ownerMarkerFor(user.id)` (exported at `client-state-sweep.ts:86`).
Restore returns empty and the next write replaces the blob if the stored marker
differs from the current owner's. Two traps the implementer must avoid:
1. Stamp with the owner captured when the tab HYDRATED, not by reading
   `ta-sweep-owner` at write time. In case h the sweep has already rewritten
   `ta-sweep-owner` to the new owner, so a write-time read would stamp the OLD
   tab's data with the NEW owner's marker and defeat the control.
2. Do not restore or persist while the owner is unknown. `SupabaseProvider`
   starts with `user = null` and `loading = true` (`SupabaseProvider.tsx:45-46,
   85-91`), and the data-seat doc places restore in a render-phase branch at
   `index.tsx:553-574`, which can run before auth resolves. Gating on a known
   owner moves restore to after auth and touches the data-seat doc's 2.2
   placement and its first-commit-hazard guard. That is the cost of S1; it is why
   S1 is SHOULD. The architect, not this seat, decides whether it is worth it.
- Object: `parse(serialize(blob, "A"), "B")` versus `parse(serialize(blob, "A"), "A")`,
  and the persist function called with owner `null`.
- Instrument: node-env test with injected markers (the parser is pure, matching
  `parseLogByCourse` precedent, `repoGradesUiState.ts:359-372`).
- Fails when: cells are returned to a different owner, cells are NOT returned to
  the same owner, or anything is written while the owner is `null`.
- If omitted: W5 sits at exact parity with the log and results-edits, neither of
  which has an owner stamp (`repoGradesUiState.ts:387-396`;
  `gradingResultsHelpers.ts:675-679`). Record it as residual R-S2.

**S2. Retention: no TTL required, and no short TTL.** Agreeing with the data-seat
doc (2.4, "No TTL in v1"), for a security reason it did not state. A client-side
TTL runs only when the app is opened, so it cannot delete anything on a device
where the app is never reopened (cases f and i); it bounds how stale a restored
cell can look, not how long data sits on a disk. A SHORT TTL also removes the
`posted` marker, which is the double-post guard F3 exists to restore
(`RepoGradesGrid.tsx:25-27`: a re-post is "neither reversible nor idempotent").
If the owner wants a TTL anyway, 90 days measured from `at` is my arbitrary
proposal, to be enforced in the parser and written out on the next persist.

**S3. Disclosure in the restored-results banner.** The data-seat doc's banner
(2.5) should also say the results are "saved in this browser until you sign out
or discard them". Wording is not pinned; the fact is that a restored grade tells
the instructor where it came from and how to remove it. A pure function in the
leaf, wording pinned by a node-env test, like `describeRestoredGithubGradingRun`
(`github-grading-run-store.ts:418`).

**S4. Confine the key.** No non-test source other than the persister may reference
`ta-repo-grades-cells`, so no export, share or diagnostic path can quietly start
reading it (threat T5). Instrument: `Grep` over `src` excluding `*.test.ts` for
the literal; fails when a file other than the persister, its leaf, and the sweep
test matches. State the fact, not a spelling (memory: source-text tests
over-specify).

**S5. Reversal path.** If F3=YES is later reversed, removing the writer leaves
orphan cells on every device until that device's next owner change. The reversal
change must include a one-time `localStorage.removeItem("ta-repo-grades-cells")`
on load. Recorded now so the reversal is not a surprise; nothing to build for W5.

---

## 7. The ruling and the cost of being wrong

**YES with the contract (M1 to M4 required; S1 to S5 recommended).**

If YES is wrong (the owner or the owner's institution later decides student-linked
grade data must not sit in instructor browsers):
- Nothing is lost server-side: Option A is device-local, so there is no database
  to purge (an advantage over the data-seat doc's Option B).
- The exposure window in the meantime is bounded by the sweep and is the same
  window the four sibling stores already have, so YES does not move the app from
  compliant to non-compliant in kind; it adds volume (section 3.3).
- Remediation is one change: delete the writer and ship S5's cleanup. Devices
  that never sign out keep the orphan key until their next owner change.
- If the sibling stores are what the policy forbids, W5 is not the thing to
  decide on; they would all need the same change, and the contract here is the
  template for it.

If NO is wrong (the privacy concern was overweighted):
- Quantities are the data-seat doc's, which I re-opened where cheap:
  `gemini.ts:55-60` puts input cost at about $0.025 per worst-case submission
  (a source comment, input tokens only, not a billed figure), so a 30-repo column
  is at most about $0.75 to re-grade (30 x 0.025, arithmetic on that comment).
- The larger loss is not money: every reload discards hand-edited scores and
  feedback boxes, which cannot be bought back, and discards the `posted` marker,
  so a posted column offers "Post" again where a repeat post duplicates a
  student-visible comment (`RepoGradesGrid.tsx:25-27`).
- The privacy gain from NO is small because the log, run store and results-edits
  already persist the same prose and identifiers (section 3.1). NO would remove
  only the instructor-edited text and the per-criterion comments on this one view.

Which way is cheaper to be wrong: YES. It is reversible by one change and
server-side-free; NO's loss is paid on every reload by every grading session.

---

## 8. Does this need the owner specifically

Split by what only the owner can settle, and what the seat can:

- **Seat-decidable engineering contract: sections 6 and 7.** Every item is
  testable in a node-env test or a source-structure test, and none depends on a
  product or policy view.
- **Owner-only, and already folded into F3 (no separate gate):** by answering F3
  YES the owner accepts (1) student-linked grade data sits at rest in the browser
  for the length of a signed-in session, which the app already does elsewhere;
  (2) the orphan windows in section 4.2 cases f and i, which the contract does not
  close; (3) that results do not survive sign-out (section 4.3). The data-seat
  doc's F3 question (5.4) is therefore sufficient; this document needs no second
  question.
- **Owner-only, NOT resolvable from code, and not a blocker:** whether the
  owner's institution has a policy (US education-records rules or an
  institutional equivalent) on student grade data on instructor devices. I did
  not determine and do not assert applicability; the app already stores
  comparable data, so this is a standing question, not one W5 creates (residual R-S5).

The shape for the owner, terminating on every answer, to be appended to the F3
question rather than asked separately: "F3 YES also means: graded results and
student feedback prose are kept in this browser until you sign out or press
Discard; they do not survive a sign-out; the app already keeps comparable data
this way." Either answer ends the activity; everything below is a residual with
an owner.

---

## 9. Disposition of data-seat requirements this document touches

This document restructures nothing of its own. It amends or resolves these
data-seat items (`docs/repo-grader-w5-persist-data-seat.md`):

| Data-seat item | Disposition |
|---|---|
| F-9 / R-W5-3: does a refresh failure sweep? | RESOLVED: non-retryable refresh failure sweeps; retryable does not (4.2 d, e). Source: auth-js 2.106.2 reading. Owner walk no longer required for correctness; still useful to confirm (R-S4). |
| Section 4: "No new trust boundary is crossed" | KEPT, with two additions: no CSP exists (T2) and the server action does not validate the grade payload (T6). Neither is new. |
| 2.5 Discard control "is a UX-seat call" | CHANGED to MUST on security grounds (M3). The UX seat still owns placement and wording. |
| 2.4 "No TTL in v1" | KEPT, with a security reason added (S2). |
| 2.1 outer type `PersistedRepoGradeCellsByCourse` | AMENDED only if S1 is adopted: the top level becomes an envelope with an owner stamp. The inner shape (course, repo, folder, cell) is unchanged. If S1 is omitted nothing changes. |
| 2.2 restore placement in the course-change render branch | HANDED to the architect if S1 is adopted: restore must wait for a known owner (S1 trap 2). |
| P1, P2 (data-layer pass conditions) | KEPT and EXTENDED with the forbidden set (M2). |
| 5.3 recommendation (F3 YES, three conditions) | KEPT; condition (1), "the security seat's ruling", is discharged by this document once it passes its check. |
| R-W5-8 | DISCHARGED by this document, subject to its check. Replaced by R-S1 to R-S6 below. |

---

## 10. Residual register

Each names an owner, an instrument, and the step that measures it.

| Id | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-S1 | No CSP anywhere in the repo, and 10 `dangerouslySetInnerHTML` sites were not audited. Deployed headers (Vercel dashboard) are invisible from here. Pre-existing; W5 does not depend on it but T2 ranks it highest. | owner (deployment) and orchestrator to route a backlog row | `curl -sI https://teaching-assistant-pi.vercel.app/` read for `content-security-policy`; and a sanitiser audit of each of the 10 sites | owner command now; a separate security backlog row; not a W5 gate |
| R-S2 | No owner stamp in any persisted store, so a stale second tab or a silent sweep failure can leave one owner's data readable by another (cases g, h). Applies to the log, `ta-github-grading-run`, `ta-grading-results-edits` already. | architect (W5 decides S1); orchestrator to route the older stores | S1's node-env test for W5; for the older stores, the same parse-with-marker test per store | W5 architect pass; a follow-up row for the older stores |
| R-S3 | Orphan window after session expiry while the browser is closed (case f), and after a failed revoke (case i). Unbounded in time; not closed by any W5 item. | owner (accepts by answering F3) | OWNER WALK: sign in, grade one cell, expire or revoke the session server-side, close the browser, reopen, inspect `localStorage` on `/login` | owner walk before W5 is described as "cleared on sign-out" |
| R-S4 | Case d (refresh failure sweeps) is a reading of auth-js 2.106.2, not an observation; Supabase's real JWT and refresh-token lifetimes are dashboard settings I cannot see | owner | OWNER WALK: let a session expire with the grader open, confirm cells vanish after the redirect | with R-S3 |
| R-S5 | Institutional or legal policy on student grade data on instructor devices | owner | the owner's institution policy; no code instrument exists | owner, at F3 |
| R-S6 | Whether the owner's repo names embed legal names (this decides whether the key is a handle or a name) | owner | read the owner's actual repo names in the org | owner, before W5 ships; if legal names, the key class is stronger than the log's (same key, so it is the log's problem too) |
| R-S7 | `postMessage` may carry an unenumerated `result.error` string from the server action | W5 implementer | enumerate the error returns of `postCanvasGradesAction` (`grading.ts:65-137`, not read past `:90` by me) and confirm none embeds student content; or persist a fixed string instead | W5 build; verifier re-reads |
| R-S8 | Sign-out ignores the revoke call's returned error (case i): `TopBar.tsx:513-516` | orchestrator to route; owner of the fix is the next chunk touching `TopBar.tsx` | node-env test is not possible (component); source check that the handler branches on the result, plus OWNER WALK with the network blocked | backlog row; not a W5 gate |

---

## 11. What I could not determine

- Anything behavioural about sign-out, expiry or multiple tabs in a real browser
  (no browser, no `.env`, no live Supabase). Sections 4.2 and 5 are readings.
- Whether `@supabase/ssr` is passed cookie options anywhere I did not open
  (`src/lib/supabase/client.ts` was read from its head and a `cookie` probe over
  it returned nothing; `proxy.ts` and server clients were not read for cookie
  options). The `httpOnly: false` default is the library constant
  (`constants.js:7`).
- The deployed response headers, the Supabase session lifetimes, and whether
  Chrome profile sync copies `localStorage` (not checked).
- The real repo naming in the owner's orgs, the real size of any blob, and the
  real browser quota (data-seat R-W5-1).
- Whether a second tab is redirected away on `SIGNED_OUT` (case h).
- Whether `markdownToHtml` and `renderOverviewMarkdown` are safe: not audited here.
- The full set of `postCanvasGradesAction` error strings (R-S7).
- Legal applicability of any student-records rule (R-S5). I am not a lawyer and
  the repo contains no policy text on it.

---

## 12. Commands that produced this document's measured facts

- `git rev-parse --short HEAD` at several points: `a5e1b003` (data-seat doc),
  `8eae8324`, `c51fbb1d`, `3fd692b9`.
- `grep -m1 '"version"' node_modules/@supabase/auth-js/package.json
  node_modules/@supabase/supabase-js/package.json` -> both `2.106.2`.
- `awk` extract of the fixture from the data-seat doc to the scratchpad, then
  `node appendix.js` -> the figures in 3.3 (matching the data-seat doc).
- `node -e` over the six smell words against `"ta-repo-grades-cells"` -> all
  `false` (4.1).
- `npm run test:paths src/lib/client-state-sweep.test.ts` ->
  `COVERED src/lib/client-state-sweep.test.ts files=1 passed=10` (baseline).
- `Grep` probes named in the sections that use them (sweep call sites;
  `dangerouslySetInnerHTML`; CSP; `localStorage.key(` and enumeration; analytics
  dependencies; `scrub|redact|...` over `src/lib/grade`; the `ta-` key inventory
  pattern in 3.1).
- Docs gate for this commit (this document is the only changed file; the wrapper
  takes the three paths one per argument, `package.json` `docs:gate`):
  `npm run test:paths src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts`.
  The per-argument `COVERED` lines are recorded in the commit message of the
  commit that adds this file. They prove only that the document has no emoji or
  stray bytes; nothing in the suite reads its claims.
