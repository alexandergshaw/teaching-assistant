# Discussion clicks Wave W-B (fab arrival) - TDD test notes + oracles

Status: TEST NOTES, authored by `loop-test-author` (Opus) on 2026-10-04. Checked
before the W-B build. Authoritative artifact - the checker and implementer read
THIS file, not a handback.

Authority: `docs/discussion-recording-setup-clicks-scope.md` (W-B, AC-1..AC-3,
C1, INFO-2). I read the real tree, not the scope's claims, and re-measured
everything cited below. Oracles PROVEN satisfiable and sabotage-discriminating
by an isolated reference run (25/25, Part A pure + Part B source-text vs the real
files). One defect in my OWN instrument was caught and fixed during that run (see
section 6 - it is the most load-bearing line in these notes for the implementer).

ORCHESTRATOR RULING (2026-10-04, recorded here as binding): TAKE the page.tsx
routing extraction. Extract `resolveRecordingLaunchRoute(view)` into
`recording-launch.ts` so AC-2 is a genuine PURE construction, with `page.tsx` as
the same-push caller. The W-B write set therefore INCLUDES `page.tsx` and the new
pure route function plus its test. The source-text-only AC-2 fallback is
SUPERSEDED - it is retained in section 5 only as the rejected weaker alternative.

---

## 0. The design I am pinning, and the trap that forces it

INFO-2 is real and load-bearing. `parseRecordingLaunch` REJECTS a view-less raw:

    recording-launch.ts:272  if (!isValidView(raw.view)) return null;

and `navigateToRecordingTool` ALSO rejects an invalid view:

    recording-launch.ts:333  if (!isValidView(view)) return;

So a naive "omit the view" change makes the fab dispatch NOTHING - the instructor
clicks "Recording tools" and no tab opens. The fix MUST make the view-less intent
a RECOGNIZED value.

RECOMMENDED MECHANISM (what the oracles are written against): a SENTINEL view,
frozen as the literal `"remembered"`, added to BOTH the `RecordingLaunchView`
union AND the `RECORDING_LAUNCH_VIEWS` runtime array. Resolution to the actual
persisted sub-view happens in the CONSUMER (RecordingTab owns `recView`), not in
the pure leaf - `parseRecordingLaunch` cannot read localStorage. This matches
AC-1's own split ("pure test over parseRecordingLaunch ... source-text wiring
assertion that RecordingTab's listener does not call setRecView for a view-less
detail").

Why a sentinel and not a new function: it preserves recording-launch.ts's
invariant ("a missing/unrecognized view invalidates the WHOLE launch"); it costs
+2 lines; and - the elegant part - it is enforced BY CONSTRUCTION in RecordingTab
via tsc (see W-B-4). The sentinel literal `"remembered"` is FROZEN across all
oracles; if the architect picks a different literal (`"last"`), every oracle
literal changes together - it is one token.

---

## 1. Write set (exact, disjoint) + ceiling check

Measured with `wc -l` (note: the repo's 1000-line gate uses PowerShell
`@(Get-Content).Count`, which can differ by 1 on a trailing newline; all figures
here are far from 1000 either way):

| File | Lines now | W-B delta |
|---|---|---|
| `src/lib/recording-launch.ts` | 349 | +2 (union + array) and the new `resolveRecordingLaunchRoute` export (~ +8) |
| `src/lib/recording-launch.test.ts` | 616 | + new cases (W-B-1, W-B-2, W-B-5 pure route) |
| `src/app/components/AiChatFab.tsx` | 924 | +0 net (one token on existing :442) [76 from ceiling] |
| `src/app/components/RecordingTab.tsx` | 909 | +0 net (one clause on existing :108) [91 from ceiling] |
| `src/app/page.tsx` | 842 | calls `resolveRecordingLaunchRoute`; likely ~ -10 net (switch -> call) |
| NEW wiring test file (section 4) | - | W-B-3, W-B-4 source-text oracles |

NO W-B file approaches the 1000 ceiling. AiChatFab and RecordingTab each gain
ZERO net lines (both edits extend an existing line). The route function lands in
`recording-launch.ts` (349), far from the ceiling.

Disjointness vs in-flight work: `git status --short` at authoring time shows ONLY
docs modified - no source file in flight. The scope's section-7 REAL-RISK flag
was RecordingTab.tsx colliding with take-announcement draft work; the git log
confirms W1a/W1b (65da662c, 347d532c) shipped and did NOT touch RecordingTab.tsx.
ORCHESTRATOR MUST RE-CONFIRM `git status --short` and intersect write sets at
dispatch - this is a dispatch-time gate, not the test seat's to close. `page.tsx`
is now in the write set; the scope rated its collision risk LOW (not named by
in-flight work) - re-confirm at dispatch.

---

## 2. Reference implementation (proven green in isolation; the exact edits)

These are the edits the oracles were proven against. Hand them to the implementer
as the target, not as licence to skip the red-first step.

(a) `src/lib/recording-launch.ts` - union (after line 69 `| "snapgrade";`):

      | "snapgrade"
      | "remembered";

and the array (after line 83 `"snapgrade",`):

      "snapgrade",
      "remembered",
    ];

(b) `src/app/components/AiChatFab.tsx:442`

      navigateToRecordingTool("record");   ->   navigateToRecordingTool("remembered");

(c) `src/app/components/RecordingTab.tsx:108`

      if (detail.view === "grading" || detail.view === "snapgrade") return;
    ->
      if (detail.view === "grading" || detail.view === "snapgrade" || detail.view === "remembered") return;

This leaves `recView` UNTOUCHED on the sentinel. Because `recView` is seeded from
`ta-rec-view` (:62-76) and persisted by the effect at :78-80, "leave it alone" ==
"land on the remembered sub-view" AND "do not overwrite ta-rec-view" - both halves
of C1 in one clause.

(d) `src/app/page.tsx` - RULING: extract the routing decision. Add a pure
`resolveRecordingLaunchRoute(view: RecordingLaunchView)` to `recording-launch.ts`
(see section 5) and replace the inline switch at :158-172 with a call to it,
applying the returned setters. `page.tsx` is the same-push caller of the new
export.

---

## 3. Numbered requirements (object / instrument / direction / sabotage)

Every sabotage below was RUN. "discriminates" means RED on the mutation and GREEN
after restore. Where a sabotage is red in BOTH directions or green in both, it is
said so.

### W-B-1 (AC-1 pure half): the sentinel launch resolves, is NOT null, is NOT forced "record"

- Object: `parseRecordingLaunch` / `navigateToRecordingTool` output for the sentinel.
- Instrument: pure unit test in `src/lib/recording-launch.test.ts`:
  - `expect(parseRecordingLaunch({ view: "remembered" })).toEqual({ view: "remembered" });`
  - inside the existing window-stubbed describe block (reuse its
    `beforeEach`/`afterEach` EventTarget stub - do NOT import it from elsewhere):
    `navigateToRecordingTool("remembered")` dispatches `RECORDING_LAUNCH_EVENT`
    with detail `{ view: "remembered" }`.
- Direction of failure: RED if parse returns null (fab opens nothing) OR returns
  `{ view: "record" }` (still forced).
- Sabotage SAB-1 (drop `"remembered"` from `RECORDING_LAUNCH_VIEWS`, keep it in
  AiChatFab): parse returns null and navigate no-ops. PROVEN RED. Restore -> GREEN.
  DISCRIMINATES. This is the "opens nothing" red the scope demands.

### W-B-2 (AC-3): existing views unchanged; valid-view count rises by EXACTLY the sentinel

- Object: the `RECORDING_LAUNCH_VIEWS` runtime array AND the `RecordingLaunchView`
  union in `recording-launch.ts` source.
- Instrument (CONSTRUCTION, not enumeration): in `recording-launch.test.ts`,
  extract the array block (anchor `const RECORDING_LAUNCH_VIEWS` ... first `];`
  after it), pull quoted members, and assert the SET equals the frozen 13:
  `["record","announcement","discussions","speed","captions","slides","avatar","grading","moduledeck","walkannounce","messages","snapgrade","remembered"]`.
  Also extract the union block (anchor `export type RecordingLaunchView =` ...
  first `;`) and assert its quoted members === the same 13 (array/union
  consistency). PLUS the behavioral half: every one of the 12 pre-existing views
  still `parseRecordingLaunch({view:v}).view===v` (the existing suite already
  covers most; keep it).
- Direction: RED if any member is added beyond the sentinel, removed, or if union
  and array disagree.
- Sabotage SAB-2a (add a 14th view): RED. SAB-2b (remove `"snapgrade"`): RED.
  Both DISCRIMINATE. This is a NEW exact-set canary - there is currently NONE on
  this array (grep confirmed; only per-view presence tests exist in
  snapshot-grading / walkthrough-announcement structure tests, which stay green
  because they are substring checks).
- Checker note: do NOT weaken this to "sentinel is present" (a presence check lets
  a future stray view slip in silently - the exact failure class this seat exists
  to prevent).

### W-B-3 (AC-1 wiring half, AiChatFab): the fab handler no longer FORCES "record"

- Object: the `handleOpenRecordingTools` handler body in `AiChatFab.tsx`.
- Instrument: source-text over a COMMENT-STRIPPED slice of that handler (anchors:
  start `const handleOpenRecordingTools`, end first `}, []);` after it - BOTH
  asserted to resolve, per the slice rule):
  - `expect(slice).not.toMatch(/navigateToRecordingTool\("record"\)/);`
  - `expect(slice).toMatch(/navigateToRecordingTool\("remembered"\)/);`
- Direction: RED if the handler still passes `"record"` (or any literal other than
  the sentinel).
- Sabotage SAB-3 (revert :442 to `"record"`): the `not.toMatch` goes RED. PROVEN
  RED on the real un-edited file. Restore -> GREEN. DISCRIMINATES.
- COMMENT-STRIP IS MANDATORY: the handler is preceded by a comment block
  mentioning the word "record"; without stripping, a reworded comment could flip
  the result. Use `.split(/\r?\n/).map(l=>l.replace(/\/\/.*$/,"")).join("\n")`
  (unanchored - the anchored `/^[ \t]*\/\/.*$/gm` form is trailing-comment-blind
  and has an executed defeat on record in this repo).

### W-B-4 (AC-1 wiring half, RecordingTab): the handler does NOT overwrite recView for the sentinel

- Object: the launch handler in `RecordingTab.tsx` (:97-113).
- Instrument: source-text over a COMMENT-STRIPPED slice (anchors: start
  `const handler = (e: Event) => {`, end
  `window.addEventListener(RECORDING_LAUNCH_EVENT, handler);` - both asserted to
  resolve). Assert:
  1. the sentinel appears in an early-return guard that PRECEDES the setRecView
     call: `indexOf('detail.view === "remembered"') !== -1` AND
     `< indexOf('setRecView(detail.view)')`;
  2. setRecView still uses `detail.view` and is NOT forced to a literal: match
     `setRecView(detail.view)` AND not.match `setRecView("record")`.
- Direction: RED if the sentinel is not guarded before setRecView, OR if setRecView
  is forced to a literal on the sentinel path.
- Sabotage SAB-4a (remove the `|| detail.view === "remembered"` clause):
  guard-before-set goes RED. DISCRIMINATES. SAB-4b (replace the guard with
  `if (detail.view === "remembered") { setRecView("record"); return; }`): the
  "no forced literal" half goes RED. PROVEN RED. DISCRIMINATES.
- tsc BACKSTOP (a CONSTRUCTION, state it to the checker): recView's union EXCLUDES
  `"remembered"`. After the guards, `setRecView(detail.view)` only type-checks if
  the guard narrows `detail.view` to the recView union - i.e. the guard MUST
  exclude grading, snapgrade AND remembered. So SAB-4a is also a tsc failure
  (TS2345). vitest (esbuild) does not type-check, so the source-text assertion is
  the LIVE discriminator in a vitest sabotage run; tsc is a second, independent
  gate. Both fire. This is why the sentinel is launch-only and NOT added to
  recView's union - which also keeps the strip/restore-guard canaries in
  recording-split / module-deck-capture / message-replies / walkthrough-announcement
  / snapshot-grading structure tests GREEN (they anchor on
  `"record" | "discussions" | "speed"` and
  `return v === "discussions"[\s\S]*?: "record";`; W-B touches neither the recView
  union nor the restore guard).

### W-B-5 (AC-2): the fab entry still opens Tools > Recording - PURE CONSTRUCTION (ruling-taken)

- Object: the routing decision a launch produces, now a pure function.
- Instrument: extract `resolveRecordingLaunchRoute(view: RecordingLaunchView):
  { manualView: "grading" | "recording"; gradingView?: "recording" | "snapshots";
  toolsSection: "manual"; activeTab: "manual" }` into `recording-launch.ts`;
  `page.tsx`'s handler calls it and applies the setters. Pure unit test in
  `recording-launch.test.ts`:
  - `resolveRecordingLaunchRoute("remembered").manualView === "recording"` and no
    `gradingView`;
  - `resolveRecordingLaunchRoute("grading").gradingView === "recording"`;
  - `resolveRecordingLaunchRoute("snapgrade").gradingView === "snapshots"`.
- Direction: RED if the sentinel is routed anywhere other than Tools > Recording,
  or if the grading/snapgrade routes change.
- Sabotage SAB-5 (route the sentinel to `manualView: "grading"`): the
  `=== "recording"` assertion goes RED. DISCRIMINATES.
- Belt-and-braces: W-B-1/SAB-1 ALSO guards AC-2's worst failure (fab opens
  nothing) - if parse(sentinel) is non-null, page.tsx's handler reaches the route
  for the sentinel at all. W-B-5 additionally pins WHERE it lands.
- Caller-in-the-wave: the new export's caller (`page.tsx`) ships in the same push -
  satisfies the "wave includes the caller" rule.

---

## 4. Where the tests live (write set for the test code)

- W-B-1, W-B-2, and W-B-5 pure route tests: APPEND to
  `src/lib/recording-launch.test.ts` (already in the write set; reuse its existing
  window-stub describe block for the dispatch cases - do NOT add a cross-file
  import).
- W-B-3 and W-B-4: ONE new file, e.g.
  `src/app/components/wb-remembered-fab-launch.wiring.test.ts`, reading
  `AiChatFab.tsx` / `RecordingTab.tsx` via fs. DUPLICATE the stripComments helper
  into it (NEVER import from another `*.test.ts` - that re-runs its describe
  blocks).
- A new `*.test.ts` is invisible to `componentStorageKeys.structure.test.ts` (it
  filters `!f.endsWith(".test.ts")`), so placing it under `src/app/components/` is
  safe.
- Run any 2+ file set with `npm run test:paths <p1> <p2> ...` - never a raw
  multi-path vitest (it silently drops unmatched args and exits 0).

---

## 5. page.tsx routing extraction - RULING: TAKEN

TAKEN by orchestrator ruling. Extract the switch at `page.tsx:158-172` into a pure
`resolveRecordingLaunchRoute(view)` in `recording-launch.ts`; `page.tsx`'s handler
calls it and applies the setters. This makes AC-2 a genuine machine-caught
CONSTRUCTION (a sabotage that routes the sentinel away from Recording goes RED in a
pure test) instead of the weak source-text check the scope flagged as silent-green.
Cost: touches `page.tsx` (shared, 842 lines, collision risk LOW - not named by
in-flight work) and adds an export whose CALLER (`page.tsx`) ships in the same push.
It likely REDUCES `page.tsx` by ~10 lines.

SUPERSEDED (rejected weaker alternative, kept for the record only): a
comment-stripped source-text slice of `page.tsx`'s handler asserting the sentinel
is not named in any branch before the else. The scope itself called a
source-text-only AC-2 "silent-green"; it is not built.

---

## 6. The defect I caught in my own instrument (read this, implementer)

My first W-B-4 oracle searched the RAW handler slice for `setRecView(detail.view)`
to locate the "set" point. It matched a COMMENT inside the handler -
`// ... tsc rejects setRecView(detail.view) otherwise ...` (RecordingTab.tsx:106) -
at an index BEFORE the real code, inverting guard-before-set and FALSELY failing
the correct implementation. This is the comment-blindness / anchor-not-unique trap
this seat exists to catch. Fix: strip comments before slicing/searching (done;
re-run went 25/25). The implementer MUST comment-strip in W-B-3 and W-B-4, and the
checker MUST verify the strip is the unanchored form.

---

## 7. Executable here vs argued (labelled honestly)

EXECUTABLE (machine, proven):

- W-B-1 pure parse + dispatch (`recording-launch.test.ts`).
- W-B-2 exact-set construction over union+array source.
- W-B-3 AiChatFab source-text (comment-stripped slice).
- W-B-4 RecordingTab source-text (comment-stripped slice) + tsc narrowing backstop.
- W-B-5 pure route test (ruling-taken extraction).

ARGUED ONLY (not asserted as verified):

- That "leave recView alone" renders as "the instructor SEES their last sub-view" -
  NOTHING renders under vitest; this is a reading claim from recView's seed/persist
  wiring (:62-80). Tagged OWNER.
- That the arrival click count actually drops 4 -> 3 in a browser - no instrument
  here produces a click count.

---

## 8. Owner residual register (AC-9, AC-10)

| ID | Not proven here | Owner | Instrument | Step |
|---|---|---|---|---|
| R-WB-1 | Felt count: fab->armed is 3 (was 4); fab lands on the last sub-view, not "record" | repo owner | count clicks in Chrome, fresh profile + a returning profile whose last Recording view was Discussion replies | Verify step after W-B ships |
| R-WB-2 | No picker claim (AC-10) - W-B asserts nothing about the browser share picker | repo owner | n/a (not a gate) | - |
| R-WB-3 | First-ever fab use (ta-rec-view never written): recView seeds to "record", so the sentinel lands on "record" - correct, but only an owner sees it | repo owner | fresh profile, click fab before ever opening Recording | Verify step |

Missing any of owner/instrument/step would make these deletions; all three are
present.

---

## 9. Constraints the build must honor (checker: verify each)

- NO new `ta-` literal in `AiChatFab.tsx` or `RecordingTab.tsx`
  (`componentStorageKeys.structure.test.ts` scans ALL top-level `components/*.tsx`
  incl. comments via `/(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g`). The sentinel
  `"remembered"` is not a ta- literal; `RECORDING_LAUNCH_EVENT` is an imported
  symbol, not a literal. W-B adds none. CONFIRMED safe.
- NO new `ta-rec-*` key (`recording-split.structure.test.ts:352` exact-set). W-B
  adds none.
- Do NOT touch recView's union line or the restore guard in `RecordingTab.tsx` -
  five structure tests anchor on them and are OUTSIDE the write set.
- Sentinel is launch-only: in `RecordingLaunchView` + `RECORDING_LAUNCH_VIEWS`, NOT
  in recView's union.
- Comment-strip every source-text slice (unanchored form). Assert BOTH slice
  anchors resolve.
- No cross-`*.test.ts` imports; duplicate `stripComments`.
- No `/s` dotAll regex (passes vitest, fails tsc TS1501).
- Red-first: watch each new assertion fail on the un-edited tree before applying
  the reference edits.

---

## 10. Self-proof artifact

Reference run (scratchpad `wb-proof.mjs`) - 25/25 (Part A pure logic incl.
SAB-1/SAB-2 red; Part B source-text oracles proven to pass on the edited files AND
go red on the real un-edited files, i.e. the sabotage direction, for W-B-3 and
W-B-4). No mutant was rebuilt or banked; all sabotages discriminate cleanly.

Nothing here required a network call, a render, or a live key. Files to open to
re-walk: `src/lib/recording-launch.ts` (:57-84, :269-336),
`src/app/components/AiChatFab.tsx:430-443`,
`src/app/components/RecordingTab.tsx:60-113`, `src/app/page.tsx:154-176`,
`src/lib/recording-launch.test.ts` (whole),
`src/app/components/componentStorageKeys.structure.test.ts`,
`src/app/components/recording/recording-split.structure.test.ts`
(:117-194, :352), `src/app/components/FabQuickActionsMenu.wiring.test.ts`.
