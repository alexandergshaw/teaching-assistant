# Repo Grades: name-matching fix (W) - scope and acceptance criteria

Seat: architecture + scope/AC (`loop-architect`). Authored docs only; no
production or test code written. Measured at HEAD `e43dbedd` plus the working
tree's uncommitted Wave-A edits (the sticky-header leaf and `index.tsx`); none
of the files this scope EDITS is among the uncommitted set
(`git status --short`: the modified repo-grades files are `index.tsx`,
`repo-grades.module.css`, `repoGradesFeedbackAndFiles.wiring.test.ts` and the
untracked `RepoGradesStickyHeader.tsx` / `repoGradesWaveASticky.structure.test.ts`
- Wave A's, not W's).

Owner decision (2026-10-04): reading **W**. FIX THE BINDER MATCHING so the
First/Last name columns populate with the owner's REAL roster/stored names
(accurate, no guessing). Reading **Z** (parse a possibly-wrong name from the
repo slug) is REJECTED for now. This document is the W scope. It consumes the
RCA `docs/repo-grades-name-columns-rca.md` (`edd4487b`) and verifies every
claim it relies on against the real code at HEAD.

Every quantity below names the command that produced it. Anything not run is
labelled "read" (from the cited line) or "not determined".

---

## 0. What W is, in one paragraph

Today a repo's First/Last name cells are a pure function of
`row.binding.student` / `row.binding.studentSortable`
(`repoGradeStudentName.ts:114-127`, consumed at `RepoGradesGrid.tsx:543` and
`repoGradesRows.ts:447,451`). Those fields are set only when the binder
MATCHES the repo to a roster or stored student
(`repo-student-bindings.ts:261-275`). The binder's name comparisons are
order-sensitive and, for stored rows, never look at the student's NAME at all -
so a repo whose slug spells a real roster student's name in a different token
order renders blank. **W widens exactly the binder's NAME comparisons to be
order-insensitive (token-multiset equality), and nothing else.** It changes
WHICH rows become `suggested`/`ambiguous`; it does not touch the display
derivation (`deriveRepoGradeStudentName` is reused verbatim), the posting path,
or the `confirmed` classification. A newly-matched name populates the columns
automatically because the Grid already reads `binding.student`.

---

## 1. The three gaps, each confirmed against HEAD

### Gap 1 - a stored row's NAME is never compared (only its username)

CONFIRMED. `tierStoredUsername` (`repo-student-bindings.ts:159-175`) iterates
`stored` and matches only `(row.username ?? "").trim().toLowerCase() === handle`
at `:167`. `row.student` is read only to LABEL the candidate (`:172`
`name: row.student`), never to match. So a stored row carrying a real name but
a username that does not equal the repo handle never binds.

This is the dominant real case because of the roster overlay. The Courses-tab
Roster tile saves only `course.roster` text; `overlayRosterUsernames`
(`rosterUsernameOverlay.ts:86-157`) folds each "Name | username" line into a
`studentRepos` row carrying BOTH the real `student` name and the `username`,
with `repo: ""` (`:150`). Those overlaid rows reach the binder as `stored`
(`useRepoGradesData.ts:443-444`, `index.tsx:194`). A repo named from the
student's NAME (e.g. `cs101-hw1-ruiz-ana`) has handle `ruiz-ana`, which the
overlay row's `username` (e.g. `aruiz99`) does not equal - so tier 1 misses,
and the row's real stored name is wasted.

### Gap 2 - tiers 2/3 read the live Canvas roster, which is `[]` behind a gate

CONFIRMED, and it is a DATA/SETUP gap, not a W code fix. `roster` is `[]`
unless `rosterKey` is non-null, which requires a non-blank `institution` AND
`parseCanvasCourseId(canvasUrl)` to return a value
(`useRepoGradesData.ts:321-324`); with no key the roster stays `[]` with no
error (`:356-357`). This is the SAME gate the repo already records as the cause
of the earlier "assignments dropdown doesn't populate" report
(`:393-432`, `canvasGateBlockedReason`). **W cannot invent a roster.** But W is
not confined to the Canvas roster: the hand-typed Roster tile text is an
independent name source (Gap 1's overlay), so W helps a course that has typed
roster text even with no Canvas connection at all. Where there is NEITHER a
connected Canvas roster NOR typed roster text, there is no name to match and W
cannot help - residual RW-3.

### Gap 3 - the roster-name match is order-sensitive (the high-value fixable gap)

CONFIRMED. `tierRosterNameSlug` (`repo-student-bindings.ts:192-199`) matches
only `repoSlug(r.name) === handle` at `:197`. `repoSlug`
(`student-repo-names.ts:17-19`) lowercases, collapses non-alphanumerics to
single hyphens, and trims - it is ORDER-PRESERVING. So a roster display name
"Ana Ruiz" slugs to `ana-ruiz`, which never equals a repo handle `ruiz-ana`
produced from the Roster-tile placeholder spelling "Ruiz, Ana"
(`repoSlug("Ruiz, Ana") === "ruiz-ana"`). Different token order, no match,
blank cell.

---

## 2. The widened-match rule (precise) and why it cannot mis-bind

### 2.1 The rule

Introduce ONE pure predicate in `repo-student-bindings.ts`, exported so the
oracle can pin it directly:

```
// tokens(s) runs the SAME slugger both sides go through, so tokenization can
// never diverge between the handle and the name.
function nameTokens(s: string): string[] {
  return repoSlug(s).split("-").filter(Boolean);   // repoSlug already imported
}

export function handleMatchesName(handle: string, name: string): boolean {
  const h = nameTokens(handle);
  const n = nameTokens(name);
  if (h.length === 0 || n.length === 0) return false;
  if (h.length !== n.length) return false;
  const hs = [...h].sort();
  const ns = [...n].sort();
  return hs.every((t, i) => t === ns[i]);   // MULTISET equality
}
```

It is **token-multiset equality**: the handle matches a name iff, after
slugging both and splitting on `-`, they hold the same multiset of tokens. This
subsumes "try both first-last and last-first orders" (for a 2-token name the
two are identical) and generalises cleanly to 3+ tokens without enumerating
orderings.

### 2.2 Where it plugs in (exactly which comparisons change)

- **Tier 1 (`tierStoredUsername`, `:159-175`)**: a stored row matches if its
  `username` equals `handle` (EXACT, unchanged at `:167`) **OR**
  `handleMatchesName(handle, row.student)`. Dedup by the existing
  `(canvasUserId, student)` key (`:169`) so one row matching by both channels,
  or a repeated row, never inflates the candidate count. (This is the Gap 1
  fix; it promotes the tier conceptually from "stored username" to "stored
  row", but keeps the username branch byte-identical.)
- **Tier 3 (`tierRosterNameSlug`, `:192-199`)**: replace
  `repoSlug(r.name) === handle` at `:197` with
  `handleMatchesName(handle, r.name)`. (Gap 3 fix.)
- **Tier 2 (`tierRosterLoginId`, `:177-185`)**: UNCHANGED. A loginId is an
  opaque SSO/login identifier, not a name; order-insensitivity is meaningless
  for it.
- **Rule a (`:207-247`, stored full-repo-name match) and the whole
  `confirmed` path**: UNCHANGED.

The output SHAPE of `RepoBindingSuggestion` is unchanged (same fields, same
candidate shape). Only WHICH rows carry a non-empty `candidates`/`student`
changes.

### 2.3 Why it cannot mis-bind (the posting-safety core)

W must never silently bind the WRONG student into a post target. Four
independent facts make that structurally impossible:

1. **Multiset equality is neither substring nor subset.** A different-length
   token set is rejected (`h.length !== n.length`), so "Ana Ruiz" never matches
   handle `ana-maria-ruiz` and vice versa. No partial/fuzzy matching exists in
   the rule.
2. **A genuine token collision produces AMBIGUOUS, never a single wrong bind.**
   The binder already reports ALL matches at the winning tier and classifies
   2+ as `ambiguous` with `student: null` and `candidates: []`-feeding none
   (`:252-259,267`; pinned by the collision test at
   `repo-student-bindings.test.ts:232-252`). Two students whose name tokens are
   a permutation of each other both match and the row stays unbound-of-record,
   exactly like today's `repoSlug` collision.
3. **W never produces `confirmed`.** `confirmed` is set only on rule a's
   numeric-id path (`:215-236`), which W does not touch. The suggestion tiers
   (b/c/d) only ever return `suggested`/`ambiguous`/`unbound`
   (`:258-259,267`).
4. **A grade posts only against a `confirmed` binding with a numeric id.**
   `repoGradePostability` refuses any row whose `bindingState !== "confirmed"`
   (`repo-grade-postability.ts:52-57`) and any non-digit `canvasUserId`
   (`:60-62`). Because W changes nothing in the `confirmed` path, the set of
   postable rows is a pure function of inputs W does not alter - **the post
   target for every already-confirmed binding is byte-identical before and
   after W.**

### 2.4 Suggest, not auto-confirm - and it is enforced by construction

DECISION: W **suggests, never auto-confirms** - and this is not merely a policy
choice, it is structural. W plugs into tiers b/c/d, which cannot emit
`confirmed`. A widened match therefore surfaces as a `suggested` (or
`ambiguous`) row that the instructor must explicitly accept before it can post.
The accept path is unchanged:

- A `suggested` row offers per-row "Confirm binding" (`RepoBindingControl.tsx:70-76`)
  and feeds the batch "Confirm all N suggested bindings" set
  (`index.tsx:211-224`), which partitions through
  `confirmableBindingSummary` / `partitionConfirmableBindings`
  (`repoGradesBindingConfirm.ts:89-151`).
- That partition already BLOCKS any candidate with a non-numeric
  `canvasUserId` (`:100-102`, reason "no Canvas user id"). A Gap-1 overlay-row
  match carries `canvasUserId: ""` (`rosterUsernameOverlay.ts:150`), so it
  surfaces as a helpful `suggested` name in the column but **cannot be
  confirmed or posted** - the name populates, the grade target does not move.

So W plugs into the SUGGEST layer only; the confirm and post layers are
untouched and continue to gate exactly as today.

---

## 3. Does W help the owner's likely setup?

| Case (RCA H-table) | Name source present? | W helps? |
|---|---|---|
| H1 - no Canvas roster AND no typed roster text | none | **No.** Nothing to match against. Connect a roster or type "Name \| username" lines; Z is rejected. (RW-3) |
| H2 - Canvas roster loaded, repo spelled/ordered differently | Canvas roster name | **Yes** - tier 3 order-insensitive (Gap 3). Carries `sortableName`, so display is the authoritative "canvas" split. |
| H3 - typed Roster text, repos named by name-slug, matcher never compared names | overlaid stored name | **Yes** - tier 1 now matches the stored NAME order-insensitively (Gap 1). This is the case W uniquely unlocks. |
| H4 - repos named purely by GitHub username, no roster link | username only | **No** - a username is not a name; W matches names. Tier 1's username branch already handles a stored username match; W adds nothing here. |

Which case the owner's course is in is **not determined** here (no live
database - `docs/loop/this-repo.md` section 6). The one-look discriminator is
unchanged from the RCA: open Repo Grades, read the Binding column of a blank
row and the roster-picker text ("No roster loaded",
`RepoBindingControl.tsx`), and check whether `course.roster` text exists. W is
worth shipping whenever EITHER a Canvas roster is connected OR typed roster text
exists (H2/H3), which is the common instructor setup.

---

## 4. Leverage claim

NONE. W is a correctness/bug fix (the owner reported populated-looking columns
rendering blank), not a new user-reachable capability. Per `DEV_LOOP.md` "The
loop / Criteria", a bug fix records the fired trigger and makes no claim:
**fired trigger = bug fix.** W incidentally strengthens the existing
ATTRIBUTION mechanism (a name reaches the right subject regardless of token
order), but that mechanism is inherited from the already-shipped binding path,
not earned by W, so it is not dressed up as a claim (`docs/loop/leverage.md`,
"Earned versus inherited").

---

## 5. Acceptance criteria - each names object, instrument, direction

### 5.1 The frozen-literal oracle for `handleMatchesName`

Expected values are hand-written from the rule in 2.1, never computed by
running the function. `true`/`false` only.

| handle | name | expected | why |
|---|---|---|---|
| `ruiz-ana` | `Ruiz, Ana` | true | same tokens {ana,ruiz}; comma collapses to a hyphen in repoSlug |
| `ruiz-ana` | `Ana Ruiz` | true | ORDER-SWAP - the H2/H3 case |
| `ana-ruiz` | `Ruiz, Ana` | true | reverse direction |
| `dave-diaz` | `Dave Diaz` | true | pre-existing exact case still matches (regression guard for the tier-3 fixture at test:201-214) |
| `ana-ruiz` | `ANA RUIZ` | true | case-insensitive (repoSlug lowercases) |
| `cchen` | `Cchen` | true | single-token exact - accurate, not a guess |
| `ana-ruiz` | `Ana Maria Ruiz` | false | SUPERSET (2 vs 3) - no partial match |
| `ana-maria-ruiz` | `Ana Ruiz` | false | SUBSET |
| `ruiz-ana` | `Bob Brown` | false | disjoint |
| `cchen` | `Carol Chen` | false | {cchen} != {carol,chen} - a username-shaped handle never becomes a two-token name |
| `aanderson-gh` | `Alice Anderson` | false | {aanderson,gh} != {alice,anderson} - a handle suffix token blocks the match |
| `` (empty) | `Ana Ruiz` | false | empty handle |
| `ruiz-ana` | `` (empty) | false | empty name |

- **AC-W1.** Object: `handleMatchesName` over the table above. Instrument: the
  frozen-literal table in `src/lib/repo-student-bindings.test.ts` run through
  the gate in 7.3. Direction: RED on any row whose boolean differs.

### 5.2 Integration oracle for `suggestRepoStudentBindings` (posting-safety cases)

Frozen expectations, hand-written. These are the behaviours a checker reads W
against; they ride in `repo-student-bindings.test.ts` beside the existing
frozen fixtures (which must ALL stay green - see 6).

| # | repo (prefix) | roster / stored | expected | why |
|---|---|---|---|---|
| G1 | `org/cs101-ruiz-ana` (`cs101`) | stored=[{student:"Ruiz, Ana", canvasUserId:null, repo:"", username:"aruiz99"}] | `suggested`, candidates `[{canvasUserId:"", name:"Ruiz, Ana"}]`, student "Ruiz, Ana", derivedHandle "ruiz-ana" | Gap-1 tier-1 NAME match order-insensitive; blank id -> blocked from confirm/post |
| G2 | `org/cs101-ruiz-ana` (`cs101`) | roster=[{id:"701", name:"Ana Ruiz", loginId:"sso1", sortableName:"Ruiz, Ana"}] | `suggested`, candidates `[{canvasUserId:"701", name:"Ana Ruiz", sortableName:"Ruiz, Ana"}]`, studentSortable "Ruiz, Ana" | Gap-3 tier-3 order-insensitive; sortableName carried -> display is "canvas" split |
| G3 | `org/cs101-ana-ruiz` (`cs101`) | roster=[{id:"1",name:"Ana Ruiz",loginId:"a"},{id:"2",name:"Ruiz Ana",loginId:"b"}] | `ambiguous`, both candidates, student null, studentSortable absent | CANNOT MIS-BIND: token-equal names -> ambiguous, never a single silent bind |
| G4 | `org/cs101-ana-ruiz` (`cs101`) | roster=[{id:"1",name:"Ana Maria Ruiz",loginId:"a"}] | `unbound`, candidates `[]`, student null | superset name is not a match - accurate, no guess |
| G5 | `org/alice-repo` | stored=[{student:"Alice Anderson",canvasUserId:"101",repo:"org/alice-repo",username:"x"}] | `confirmed`, canvasUserId "101" (byte-identical to the frozen fixture at test:19-28) | rule a untouched by W |
| G6 | `org/module-jdoe` (`module`) | roster=[{id:"501",name:"Jane Doe",loginId:"jdoe"}] | `suggested`, candidates `[{canvasUserId:"501",name:"Jane Doe"}]`, derivedHandle "jdoe" | tier-2 loginId still wins first; existing integration fixture (repoGradesRows.test.ts:118-129) preserved |

- **AC-W2.** Object: `suggestRepoStudentBindings` over G1-G6. Instrument: frozen
  fixtures in `repo-student-bindings.test.ts`. Direction: RED if any case's
  state/candidates/student/studentSortable differs.
- **AC-W3 (= 2.3 fact 4).** Object: the five already-confirmed/postable
  behaviours. Instrument: `repoGradesPosting.test.ts` and
  `repoGradesBindingConfirm.test.ts` run unchanged in the gate. Direction: RED
  if any assertion there changes - W must leave them untouched.
- **AC-W4 (OWNER, not machine - RW-4).** Open Repo Grades on the course that
  showed blank columns (with a roster connected OR typed roster text present):
  rows whose slug spells a roster/stored student name in any token order now
  show that student's real name; rows with no name source stay blank; no name
  is fabricated. Not observable here - no component renders under vitest
  (`docs/loop/this-repo.md` section 6).

---

## 6. The existing frozen fixtures W must NOT break (verified case-by-case)

Every fixture in `repo-student-bindings.test.ts` was traced against the widened
rule; none flips. Spot-checks a checker should re-run:

- `:138-154` (tier-1 username) - handle `aanderson-gh`; stored student "Alice
  Anderson" slugs to {alice,anderson} != {aanderson,gh}, so the NAME branch
  adds nothing; username still matches -> 1 candidate. UNCHANGED.
- `:156-172` (tier-1 suppresses 2/3) - same; the stored NAME does not match the
  handle, so no extra candidate. UNCHANGED.
- `:201-214` (tier 3) - handle `dave-diaz`; `repoSlug("Dave Diaz")` tokens
  {dave,diaz} == handle tokens -> still 1 candidate. UNCHANGED.
- `:232-252` (collision) - both "Jo Smith" and "jo-smith" -> {jo,smith} ==
  handle {jo,smith} -> ambiguous, both candidates. UNCHANGED.
- `:321-339` (maps independently) - for `org/prefix-ddiaz`, stored "Alice
  Anderson" NAME does not match handle `ddiaz`; tier 2 loginId `ddiaz` matches.
  states `[confirmed, suggested, unbound]`. UNCHANGED.
- `repoGradesRows.test.ts:114-144` (integration) - both cases preserved (G6
  and G5).

The integration test `repoGradesRows.test.ts` and the binder test
`repo-student-bindings.test.ts` are therefore EXTENDED (new oracle rows), never
rewritten; the existing `toEqual` literals stay exactly as they are.

---

## 7. Wave shape, write set, canaries, gate

### 7.1 Write set (`owns`) - derived, not asserted

`src` files that reference `repo-student-bindings` (command and pasted output):

```
$ rg -l "repo-student-bindings" src    # (Grep, files_with_matches)
```
returns 25 files. Classified against what W actually edits:

- **EDITED by W (2 files):**
  - `src/lib/repo-student-bindings.ts` - the rule (new `handleMatchesName`,
    tier-1 NAME branch, tier-3 call swap). 289 lines now
    (`@(Get-Content).Count`), +~30 -> well under the 1000 ceiling.
  - `src/lib/repo-student-bindings.test.ts` - AC-W1/AC-W2 oracle rows added;
    existing frozen fixtures untouched. 366 lines now.
- **EDITED only if new integration cases are added (1 file):**
  - `src/app/components/repo-grades/repoGradesRows.test.ts` - optional G-case
    coverage through `buildRepoGradeGridModel`. Existing fixtures preserved.
- **ADOPTED - read W's output as code, must stay green, NOT edited:**
  `repoGradesRows.ts` (`:210` the sole runtime caller),
  `repo-grade-postability.ts` (imports the `RepoBindingState` type only),
  `RepoGradesGrid.tsx`, `RepoBindingControl.tsx`, `index.tsx`,
  `repoGradesBindingConfirm.ts`, `rosterUsernameOverlay.ts`. Their tests
  (`repoGradesPosting.test.ts`, `repoGradesBindingConfirm.test.ts`) are run as
  AC-W3.
- The remaining hits are comment mentions.

**No `.tsx` file and no file under `src/app/components/repo-grades/` is edited
by W.** The widened match reaches the UI through the UNCHANGED call chain
`buildRepoGradeGridModel` (`index.tsx:194`) -> `binding.student` ->
`RepoGradesGrid.tsx:543` / `repoGradesRows.ts:447,451`. Reachability is
therefore already wired - no new caller, no dead-code risk. The new
`handleMatchesName` export is called internally by `suggestOne`, so it needs no
caller file either (it is not a new UI-reachable export).

### 7.2 Canary and ceiling obligations (measured)

| Canary | Current | W moves it? | Instrument |
|---|---|---|---|
| R-2 frozen roots (non-test `.ts`/`.tsx` in `repo-grades/`) | 36 in the working tree (Wave A's sticky leaf is in flight) | **No** - W adds NO file to `repo-grades/`; it edits `src/lib/`. Read the committed literal at `repoGradesFeedbackAndFiles.wiring.test.ts:348` at wave time, never this number. | `Get-ChildItem repo-grades/*.ts,*.tsx \| ? Name -notmatch test \| measure` returned 36 |
| 1000-line ceiling (`src/file-size-ceiling.structure.test.ts:41`) | `repo-student-bindings.ts` 289 | **No** - +~30 -> ~320 | `@(Get-Content src/lib/repo-student-bindings.ts).Count` = 289 |
| css-orphan ratchet | 118 (`docs/css-orphans.md`) | **No** - W makes no CSS change; display already works via `binding.student` | read |
| storage-key canary (`repoGradesStorageKeys.structure.test.ts`) | - | **No** - no new persisted key | read |
| browser-safe | `repo-student-bindings.ts` imports only `repoSlug` (pure) + a type | **Must hold** - W adds only pure logic reusing `repoSlug`; it must not import any server-only module (the file is bundled client-side via `repoGradesRows` -> Grid) | read of the import block (`:42-43`) |

### 7.3 Verification gate (form quoted - no code exists yet)

```
npm run test:paths src/lib/repo-student-bindings.test.ts src/app/components/repo-grades/repoGradesRows.test.ts src/app/components/repo-grades/repoGradesBindingConfirm.test.ts src/app/components/repo-grades/repoGradesPosting.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

The `test:paths` wrapper's per-argument `COVERED`/`NOT COVERED` lines must be
quoted in the verify report; a raw multi-path `vitest` run silently drops
unmatched arguments and is not acceptable evidence
(`docs/loop/this-repo.md`, "Running a named set of test files"). Plus
`npx tsc --noEmit` (exactly one caller - it races on `tsconfig.tsbuildinfo`)
and the lint gate (exit 0, no NEW warning in the two edited files, measured
against the same command run before the change).

### 7.4 Collision and sequencing

`repo-student-bindings.ts` is shared with RG-SEARCH-STICKY waves, A7 and
RG-PERSIST-RESULTS; BUILD must serialise W disjoint-in-time from any wave that
edits that file (`docs/loop/parallel-disjointness.md`). **W does NOT edit
`repoGradesRows.ts`, `RepoGradesGrid.tsx` or `index.tsx`, so it does not
collide with Wave A (sticky shell, which edits Grid/index/css) and may run
alongside it.** Recommended order relative to RG-SEARCH-STICKY feature 1 (name
search): land W first, so that feature's oracle knows order-insensitive name
matches now populate more rows (carries RCA S5/R-7 - the grading set keys on
`row.repo`, never on a name).

---

## 8. Forks - recommended reading acted on (recommend and proceed)

None is a blocking fork; each is recorded as my decision with the cost of being
wrong, per `AGENTS.md`.

- **FW-1 - match placement.** DECISION: fold the stored-NAME match into tier 1
  (alongside username), not a new tier. Stored rows are the instructor's own
  data (hand-typed roster or provisioned), and this preserves all existing
  frozen fixtures and the 3-tier structure. Cost if wrong: only the cross-source
  precedence of which candidate wins a collision changes, and a genuine
  two-student collision is `ambiguous` either way - no posting-safety impact.
- **FW-2 - multiset equality vs strict two-order.** DECISION: token-multiset
  equality. For 2-token names it IS the two-order test; for 3+ tokens it allows
  all permutations, which only ever flags MORE ambiguity (safe direction) and
  matches more legitimate reorderings. Cost if wrong: two token-level anagrams
  across different students become `ambiguous` rather than one binding - safe.
- **FW-3 - suggest vs auto-confirm.** DECISION: suggest only, and it is
  structurally enforced (section 2.4); no new mechanism. Not really a fork - W
  cannot reach the `confirmed` classification.

---

## 9. Disposition of the RCA's W sketch (`docs/repo-grades-name-columns-rca.md`)

The RCA is the nearest prior artifact describing W (its R-6, F1-W, and the
H-table). This scope is authored fresh; the mapping:

| RCA item | Disposition |
|---|---|
| F1-W "widen the binder so a repo whose handle equals `repoSlug(name)` or the slug of its inversion becomes suggested with the TRUE roster name" (`:216-223`) | KEPT and made precise: token-multiset equality (subsumes the inversion), applied to tiers 1 (stored name) and 3 (roster name). |
| R-6 "changes 'suggested' classification and the batch-confirm set; posting-safety review needed" (`:507`) | ADDRESSED in full: section 2.3 (cannot mis-bind) + 2.4 (suggest-not-confirm, enforced) + AC-W3 (the confirm/post tests stay green). |
| RCA H-table: W fixes H2/H3, not H1/H4 (`:198-201`) | KEPT, verified, and sharpened in section 3 (typed roster text is a name source even with no Canvas). |
| RCA S5 / R-7 (RG-SEARCH-STICKY keys the grading set on `row.repo`) | CARRIED as RW-6. |
| Z (parse from slug) and all its safety contract S1-S6, the new `source:"guess"`, the marker, the Z oracle | WITHDRAWN - Z is the rejected reading; W needs none of it. W changes no display derivation and fabricates no name, so N3's "never a guessed name" rule is NOT reversed (the reversal was Z's; W honours it). |

---

## 10. Residual register

Each has an owner, an instrument and a step. None is filed in `docs/BACKLOG.md`
by me (this seat's commit is restricted to this one file, and `BACKLOG.md` is a
shared file other agents may be writing); the orchestrator owns filing them.

| id | residual | owner | instrument | step |
|---|---|---|---|---|
| RW-1 | The oracle's satisfiability is unproven: no reference implementation was built in this seat. | test-author seat for the wave | a throwaway reference impl scoring the Section-5 tables green in an isolated tree | the wave's test-notes round, before the implementer starts |
| RW-2 | The oracle rows G1-G4 use constructed names, not real org data (only fixtures exist here). | owner | owner supplies 3-5 real repo names + a sample roster line | owner reply folded into the oracle at the test-notes round |
| RW-3 | W cannot help a course with NO name source (no Canvas roster connected AND no typed Roster text, or repos named purely by GitHub username). | owner | the Binding column of a blank row, the roster-picker text ("No roster loaded"), and whether `course.roster` text exists | one look now; if no name source exists, connect a roster or type "Name \| username" lines (Z stays rejected) |
| RW-4 | Whether the columns actually populate on screen cannot be observed here - no component renders under vitest. | owner | the browser on the course that showed blank columns | AC-W4, after the wave ships |
| RW-5 | FW-1 (tier placement) and FW-2 (multiset vs two-order) are my design decisions acted on, not owner rulings. | orchestrator / owner | the oracle's ambiguity (G3) and cross-source cases | revisited only if the owner objects |
| RW-6 | RG-SEARCH-STICKY feature 3 must key the grading set on `row.repo`, never on a name (RCA S5). | RG-SEARCH-STICKY AC seat | that item's AC document | its AC round |

---

## 11. What I could not determine

- The owner's actual course configuration (institution, Canvas URL validity,
  whether `course.roster` text exists). No live database
  (`docs/loop/this-repo.md` section 6). Section 3's "which case" rests on that;
  the one-look discriminator decides it against the owner's data.
- Whether any real org names repos in a way the multiset rule mis-reads (RW-2).
- How the columns look on screen once populated (RW-4).
