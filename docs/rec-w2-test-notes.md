# W2 (drafts-loop / defect G6) - TDD test notes + oracles

Status: TEST NOTES, authored by `loop-test-author` (Opus) on 2026-10-04. To be
checked by a fresh `loop-checker` before the W2 build. Fork F-W2 RESOLVED by
orchestrator ruling (2026-10-04), applied below.

Authority: `docs/announcement-from-recording-scope.md` section 1.4/G6 and
ARC-S1..S4. Every claim below was read from the REAL tree, not the scope doc.
W1a and W1b are shipped; W2 is sequential after W1b (shares
`useTakeAnnouncement.ts`).

## 0. Measured facts (command named for each)

- `@(Get-Content ...).Count`: `useTakeAnnouncement.ts` = 931,
  `TakeAnnouncementPanel.tsx` = 656, `messaging.ts` = 522,
  `take-announcement-draft.ts` = 39.
- The scope's `:818-824` cite for the discarded id is PRE-W1b. In the current
  931-line file, `saveDraft()` is lines 813-842; the returned `{id}` is
  discarded at `:840` (`setDraftSaved(true)`, no id retained). `commitPost()` is
  `:759-811`; its success branch is `:798-810` (no draft cleanup). The plain
  `<span>Saved to drafts.</span>` is `TakeAnnouncementPanel.tsx:644`.
- Actions available on `message_drafts` (grep `src/app/actions`):
  `saveMessageDraftAction(summary,payload)->{id}` (messaging.ts:218, wraps
  `createMessageDraft`), `updateMessageDraftPayloadAction(id,payload)->{ok:true}`
  (messaging.ts:237, wraps `updateMessageDraft`), `postMessageDraftAction(id)`
  (messaging.ts:272, POSTS then markReviewed - must NOT be reused for cleanup,
  it double-posts). There is no standalone delete or mark-reviewed ACTION today.
- `MessageDraftsTab.tsx:132` deletes via the client-side lib
  `deleteMessageDraft(supabase, user.id, id)` using `useSupabase()`. The
  take-route hook has no Supabase client - it is pure server-actions.
- `markMessageDraftReviewed` (lib, `message-drafts.ts:163`) sets status
  "reviewed"; `listPendingMessageDrafts` (`:106`) returns only status "pending".
  So marking a row reviewed removes it from the Drafts Send surface
  (MessageDraftsTab reads `listPendingMessageDrafts`) while preserving the row.
- `openMessageDrafts` (`src/lib/drafts-nav.ts:43`) dispatches
  `MESSAGE_DRAFTS_NAV_EVENT`; the page.tsx listener that handles it already
  exists and SURVIVES W-B's in-flight page.tsx edit (`src/app/page.tsx:211`,
  verified against the working tree this pass). So ARC-S3 needs NO page.tsx edit.
- Badge hook: `useDraftedGradesInbox()` returns `{ refresh }`
  (`DraftedGradesInbox.tsx:14,54`), with a no-op fallback outside the provider
  (safe to call anywhere).
- Actions barrel is `src/app/actions.ts` with `export * from "./actions/messaging"`
  - a new messaging action is auto-exported; no barrel edit.
- Sibling guard: `postMessageDraftAction` uses `requireOwner()`
  (`messaging.ts:276`). The new cleanup action matches this guard exactly (F-W2
  ruling), by reading and reusing the sibling's guard - not by asserting a guard
  a priori.

## 1. Write set (exact, disjoint, SEQUENTIAL after W1b)

1. NEW `src/lib/take-draft-lifecycle.ts` - the extracted dep-injected
   orchestration leaf + pure plan/apply + copy (MACHINE instrument).
2. NEW `src/lib/take-draft-lifecycle.test.ts` - the leaf oracle.
3. `src/app/components/recording/useTakeAnnouncement.ts` - minimal wiring (hold
   savedDraftId; call the leaf; badge refresh).
4. `src/app/components/recording/TakeAnnouncementPanel.tsx` - the
   Saved-to-drafts link + course-less notice.
5. `src/app/actions/messaging.ts` - ADD ONE cleanup action
   `markMessageDraftReviewedAction(id)` per the F-W2 ruling (resolved = (a)).
6. NEW `src/app/components/recording/useTakeAnnouncement.drafts-loop.wiring.test.ts`
   - hook reachability (source-text).
7. NEW `src/app/components/recording/TakeAnnouncementPanel.drafts-link.wiring.test.ts`
   - panel reachability (source-text).

Do NOT touch: `MessageDraftsTab.tsx` (A29 W3 host),
`take-announcement-draft.ts`/`take-announcement.ts` (W1b),
`takeAnnouncementTranscription.ts`/`take-transcript.ts` (W1a),
`recording-split.structure.test.ts`, `page.tsx`, any grader/discussion file.

Disjointness, computed against the LIVE tree (`git status --short` this pass):
grader W2 touches only `grading-chat/`, `grading-results/`, `grading/`; disc
W-B touches only `recording-launch.ts(+test)`, `AiChatFab.tsx`,
`RecordingTab.tsx`, `page.tsx`, `wb-remembered-fab-launch.wiring.test.ts`.
Intersection with my set = empty. Shared-resource notes: (a) disc W-B
READs/anchors `recording-split.structure.test.ts`; my leaf lives in `src/lib/`
(NOT `recording/`), so it never enters that test's `combinedRecordingSource`
scan, and W2 adds no tab and no `ta-rec-*` key, so the strip/key canaries
(:117-194, :352-427) stay green. My two new `recording/*.test.ts` files are
excluded from the scan (`!f.endsWith(".test.ts")`). (b) ARC-S3 depends on the
pre-existing `page.tsx:211` listener that W-B must not remove - verified present
in the working copy; re-confirm at the wave gate.

## 2. Extraction + reachability (the capital sin)

The leaf is `src/lib/take-draft-lifecycle.ts` (mirrors the W1b precedent
`src/lib/take-announcement-draft.ts`; pure/node-testable; dep-injected like
`takeAnnouncementTranscription.ts`'s `TranscriptionPipelineDeps`). The hook holds
`savedDraftId` (ref or state, hook's choice) as the SINGLE source of truth and
threads it through the leaf. A green leaf proves nothing unless the hook calls
it; the two wiring tests (section 5) are the reachability instrument, tagged
READ. After build, MEASURE `useTakeAnnouncement.ts` - it must stay <= 1000
(projected ~951); if it would exceed, move more orchestration into the leaf, do
not raise the ceiling.

## 3. The leaf's seam (the oracle binds here; architect may rename, then rewrite the oracle against the names - the FACT is frozen, not the spelling)

```
state: { savedDraftId: string | null }         INITIAL = { savedDraftId: null }
planTakeDraftSave(state, {summary,payload}) -> {op:"create",summary,payload} | {op:"update",id,payload}
applyTakeDraftSaveResult(state, plan, {ok,id?}) -> next state
    create+ok(nonempty id) -> {savedDraftId:id};  update+ok -> unchanged;  !ok or ok-without-id -> unchanged
planTakeDraftPostCleanup(state) -> {op:"none"} | {op:"cleanup",id}
applyTakeDraftPostCleanup(state) -> {savedDraftId:null}
runTakeDraftSave(deps,{summary,payload})  deps={save,update,getSavedId,setSavedId}  // dispatches, actions mocked in test
runTakeDraftPostCleanup(deps)  deps={cleanup,getSavedId,setSavedId}
takeDraftSavedNotice(hasCourse) -> frozen copy
```

The `cleanup` dep is bound by the F-W2 ruling to `markMessageDraftReviewedAction`
in production, but the oracle mocks `cleanup`, so the instrument is unchanged by
the ruling.

## 4. Requirements - object / instrument / direction, with sabotage

ARC-S1 - double "Save to drafts" yields ONE row, updated in place. OBJECT: the
create/update plan + the persistence-call sequence across two saves. INSTRUMENT:
(a) MACHINE pure `planTakeDraftSave`/`applyTakeDraftSaveResult` over the frozen
sequence below; (b) MACHINE `runTakeDraftSave` driven twice with MOCKED
`save`/`update` and a shared `savedId` holder - assert `save` called once with
`(SUMMARY,P1)`, `update` called once with `(ID1,P2)`, `save` NOT called twice,
holder===ID1. DIRECTION: FAILS when the op sequence is `["create","create"]`, or
`update` is never called, or `save` is called twice.
- SABOTAGE S1a (no-id-retention: create-apply returns state unchanged) -
  `savedDraftId` stays null -> second plan is `create` -> MACHINE assertion
  `["create","update"]` and `update called once` go RED; GREEN after restore.
  DISCRIMINATES (the scope's named "no-id-retention -> duplicate-row red").
- SABOTAGE S1b (plan always `create`) - second plan `create` -> RED.
  DISCRIMINATES, and is a different KIND from S1a (breaks the plan, not the
  retention), so it satisfies the "second attempt changes kind" cap if S1a
  recurs.

ARC-S2 - post-then-Drafts cannot double-post. OBJECT: the cleanup plan/call on a
successful in-app post. INSTRUMENT: (a) MACHINE `planTakeDraftPostCleanup` -
`{op:"cleanup",id}` iff a draft was saved, else `{op:"none"}`; (b) MACHINE
`runTakeDraftPostCleanup` with MOCKED `cleanup` - called exactly once with ID1
when savedId=ID1 (and savedId cleared to null), called ZERO times when
savedId=null. DIRECTION: FAILS when a saved id yields no cleanup call, or cleanup
fires with no saved draft, or the savedId is not cleared.
- SABOTAGE S2a (cleanup-plan always `none`) - saved-then-posted case expects
  `cleanup(ID1)`, gets `none` -> RED; GREEN after restore. DISCRIMINATES (the
  scope's named "no-clear-on-post -> double-post red").
- SABOTAGE S2b (`applyTakeDraftPostCleanup` returns state unchanged) - savedId
  stays ID1 -> "cleared to null" assertion RED. DISCRIMINATES a weaker property,
  honestly noted: it protects the next-save-after-post path, not the double-post
  itself; S2a is the load-bearing one.
- Cleanup-FAILURE property (MACHINE): `runTakeDraftPostCleanup` with `cleanup`
  returning `{error}` returns `{error}` and does NOT clear savedId -> a later
  save still `update`s (not create). Prevents a save-side duplicate when cleanup
  fails. (The user-visible "posted but could not clear" message is READ/OWNER -
  residual R-W2-3.)

ARC-S3 - "Saved to drafts" links to Drafts + badge refreshes. OBJECT:
`TakeAnnouncementPanel.tsx` + hook source. INSTRUMENT: source-text (READ) -
panel imports `openMessageDrafts` from `@/lib/drafts-nav` and binds it to an
`onClick` on the success surface (a button, mirroring `MessageThreadRow.tsx:238`,
replacing the plain `<span>` at :644); hook calls `useDraftedGradesInbox().refresh`
on save-success AND on post-cleanup-success. DIRECTION: FAILS when the
import/onClick is absent or the refresh call is absent. Actual navigation +
actual badge NUMBER are OWNER.
- SABOTAGE: replace `onClick={openMessageDrafts}` with a no-op / delete the
  refresh call -> the source-text assertion goes RED. DISCRIMINATES (as a wiring
  claim only - tagged READ).

ARC-S4 - a course-less draft says so at save time. OBJECT: the post-save notice
for `selectedCourse===null` vs non-null. INSTRUMENT: MACHINE pure
`takeDraftSavedNotice(hasCourse)` frozen literal; the no-course copy must differ
from the with-course copy and name the course limitation (the spelling IS the
fact). Panel wiring (READ): the panel renders
`takeDraftSavedNotice(<course-present-at-save>)`. DIRECTION: FAILS when both
branches return the same string. Synergy to state: because ARC-S1 updates in
place, the no-course copy can honestly say "add a course here and save again" -
the re-save UPDATES the same row to carry the course.
- SABOTAGE S4 (collapse both branches to the same string) - "differ" assertion
  RED. DISCRIMINATES.

## 5. Frozen oracle (CONSTRUCTION - proven satisfiable)

Frozen literals: `SUMMARY="Announcement from Take 1"`, `ID1="draft-aaa-111"`,
`P1={kind:"announcement",title:"Week 3 recap",body:"Hi all, here is the recap.",courseUrl:"https://canvas.example.edu/courses/5",hubCourseId:"c5",institution:"inst-a"}`,
`P2={...P1,body:"...EDITED..."}`.

```
S1:  s0=INITIAL; p1=plan(s0,{SUMMARY,P1})={op:create,summary:SUMMARY,payload:P1}
     s1=apply(s0,p1,{ok:true,id:ID1})={savedDraftId:ID1}
     p2=plan(s1,{SUMMARY,P2})={op:update,id:ID1,payload:P2}
     s2=apply(s1,p2,{ok:true})={savedDraftId:ID1}; [p1.op,p2.op]==["create","update"]
     failed create: apply(INITIAL,createPlan,{ok:false})=={savedDraftId:null}
     create ok w/o id: apply(INITIAL,createPlan,{ok:true})=={savedDraftId:null}
S1-orch: save mock->{id:ID1}; run twice; save x1 (SUMMARY,P1), update x1 (ID1,P2), holder==ID1
S2:  planCleanup({savedDraftId:ID1})={op:cleanup,id:ID1}; applyCleanup=>{savedDraftId:null}
     planCleanup(INITIAL)={op:none}
S2-orch: savedId=ID1 -> cleanup x1 (ID1), savedId->null;  savedId=null -> cleanup x0
     cleanup fails -> run returns {error}, savedId stays ID1
S4:  notice(true)=="Saved to drafts."; notice(false)!=notice(true); notice(false) contains "no course"
```

Satisfiability PROVEN (test-seat obligation 1): I built a reference
implementation of the whole leaf and the oracle in an isolated tree (session
scratchpad), run `npx vitest run --config <scratchpad>/probe.config.mjs`
(plain-object config, node env) -> Test Files 1 passed, Tests 14 passed. The 5
sabotage-discrimination checks each confirm the mutant diverges from a named
frozen assertion. No mutant was rebuilt or banked (obligation 2: none
surviving). No test imports from another `*.test.ts`; actions are mocked via
`vi.fn`, never real fetch. The copy literal is ASCII only (spaced hyphens,
matching the app voice at `TakeAnnouncementPanel.tsx:597`) - no emoji, no
em-dash.

## 6. Executable here vs ARGUED vs OWNER (tagged honestly)

- MACHINE (executed/executable here): ARC-S1 plan/apply + orchestration (actions
  mocked); ARC-S2 plan/apply + orchestration + cleanup-failure property; ARC-S4
  copy leaf. Proven satisfiable this pass.
- READ (source-text wiring - ARGUED, not a runtime proof): the hook calls
  `runTakeDraftSave` in `saveDraft` (dispatching to
  `saveMessageDraftAction`/`updateMessageDraftPayloadAction`) and
  `runTakeDraftPostCleanup` in `commitPost`'s success branch; the badge refresh
  on both; the panel's `openMessageDrafts` onClick and `takeDraftSavedNotice`
  render. Source text cannot prove branch reachability - do NOT state these as
  verified behaviour.
- OWNER only: that two saves produce exactly ONE `message_drafts` row; that an
  in-app post leaves no re-postable pending row; that the link navigates and the
  badge number moves; the user-visible "posted but cleanup failed" message. All
  need a real browser + Supabase; none renders under vitest.

## 7. Fork F-W2 - RESOLVED = (a) (orchestrator ruling, 2026-10-04)

The cleanup mechanism is a NEW server action `markMessageDraftReviewedAction(id)`
in `messaging.ts`, auto-exported via the barrel. It marks the saved row reviewed
(preserving the record) so it leaves `listPendingMessageDrafts` - the Drafts Send
surface MessageDraftsTab reads - which is the outcome constraint. GUARD: match
the sibling draft action `postMessageDraftAction` exactly (it uses
`requireOwner()` at `messaging.ts:276`), by reading and reusing that guard, NOT
by asserting a guard a priori; so the take route's cleanup carries the same
authorization as its post. Do NOT touch any of R2's existing `requireOwner`
lines - the new action adds its own call site only. `postMessageDraftAction` is
NOT reused for cleanup because it would POST to Canvas (a second copy). The
oracle mocks the `cleanup` dep, so this ruling does not change the instrument;
it only fixes the production wiring and adds the one action to the write set
(item 5 above).

## 8. Residual register (owner / instrument / step - none is a deletion)

- R-W2-1 two-saves-one-row and no-double-post proven only by leaf+wiring, not at
  the DB - OWNER / a real browser+Supabase (save twice; post; confirm one row,
  no re-post) / W2 owner-verify.
- R-W2-2 navigation lands on Drafts and the badge number moves - OWNER / real
  browser / W2 owner-verify (ARC-S3's non-source halves).
- R-W2-3 user-visible "posted but could not clear the saved draft" message on
  cleanup failure - accessibility/UX seat (READ the markup) + OWNER / no render
  exists / W2 follow-up UX pass.
- R-W2-4 (G6d, deferred - scope R7) assign a course to a course-less draft INSIDE
  the Drafts editor - A29 W3 plan owner / `sort|uniq -d` of write sets vs the A29
  host decision / after A29 Q-1. NOT pulled into W2 because it requires editing
  `MessageDraftsTab.tsx`. ARC-S4 only discloses the limitation + offers the "save
  again with a course" in-place-update path; it does not add Drafts-editor course
  assignment.
- R-W2-5 (coordination) ARC-S3 depends on `page.tsx:211` `MESSAGE_DRAFTS_NAV_EVENT`
  listener surviving disc W-B's concurrent page.tsx edit - orchestrator /
  `git status --short` + grep at the wave gate / re-confirm before the W2 push
  (verified present this pass).

## 9. Canaries honored

`recording-split.structure.test.ts`: no new tab (strip :141-158 unaffected), no
new `ta-rec-*` key (inventory :352-427 - exactly the 3 `ta-rec-ann-*` plus others
- unchanged; my leaf is in `src/lib/`, outside `combinedRecordingSource`).
1000-line ceilings: `useTakeAnnouncement.ts` stays <= 1000 (measure after build;
extract more if needed), `TakeAnnouncementPanel.tsx` ~661, `messaging.ts` ~534
after the one added action. `src/file-size-ceiling.structure.test.ts` LIMIT=1000
- all fine.
