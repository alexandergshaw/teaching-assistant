# Wave-plan check: grading-chat (persisted from the checker's hand-back)

The fresh loop-checker ran against `docs/grading-chat-waves.md` and returned its
findings via hand-back; the harness prohibited it from writing this file itself, so
this artifact is persisted here to complete the record. The wave plan WAS
independently checked.

## Verdict

DISPATCHABLE AS ONE WAVE after ONE narrow one-line fix. Counts: 1 BLOCKER, 0
additional residual defects, 2 informational notes. The plan is unusually sound:
every cited `file:line` resolved, all line counts matched, the caller chain closes
within the one wave, every folded requirement has a home and a failing test, gate
hygiene is correct, and the R2/R3 owner forks stay isolated/additive.

## BLOCKER-1 (NEW) - a contingency output omitted from the write set its own gate rejects on

Section 6's split trigger prescribes extracting
`src/app/components/grading-chat/ChatResultsTable.tsx` in-wave if
`GradingChatPanel.tsx` exceeds 550 lines, but that file is not in the section-4.1
write set and the section-8 gate reads "git status --short vs the list | any other
path appears RED". So if the split fires, the wave gate rejects the plan's own
prescribed output. Fix: enumerate `ChatResultsTable.tsx` as a CONDITIONAL write-set
member (as N4b already is) and carve it out of the write-set gate. One line; the
common path (N4a estimate 220-320 vs the 550 trigger) never fires it. This fix is
folded into the build brief.

## Attacks run and empty (verified against the tree)

- ONE-WAVE / CALLER CLOSURE: chain closes in-wave P2 -> N4a -> N4b+N3 -> N2 -> N1;
  the layer split was correctly rejected as the endpoint-without-surface trap.
- N1 must NOT re-export `classifyGradingUpload`: CONFIRMED - `single-file-entry.ts:23`
  imports `extractTextFromBuffer` and uses `Buffer` (server-only office-extract), so
  re-exporting from a client-safe leaf drags it into the client bundle. The
  correction removes a real reachability defect and loses no capability.
- RES-GC-8 clip moved action -> driver: CONFIRMED - the per-event action is
  stateless; only the driver tracks session count.
- `tab-rails.test.ts` added to the gate: CONFIRMED it imports from `manual-rail`.
- The 7 folded requirements each have a home and a test that can fail:
  BLOCKER-1 pointsPossible (slot exists at `incrementalRunPlan.ts:64`; T3b/T4 assert
  the dispatched Canvas body carries it), RES-GC-8 partial-grade (41-in/40-max -> 40
  rows + 1 partial, never zero), RES-GC-9 repeated-failure-does-not-wedge (a
  rejecting mock is the wedge mechanism - not a mock that cannot wedge), RES-GC-11
  disclosure floor, F4 bounds (degrade not fail-closed, precedent `boundedItemTitle`),
  UX (slotProps.input, Send-focus, append-vs-reset), F1 consume-not-re-edit.
- DISJOINTNESS: write set does not intersect any concurrent path;
  `GradingResults.tsx`/`GradingTab.tsx` reuse-only, gate RED-flags either if edited.
- BUILD GATE: N2 is a genuine "use server" file, all exports async, no type
  re-export; pass = the `Compiled successfully` line, not exit 0. Multi-path runs use
  `npm run test:paths`.
- FEATURE-ALREADY-EXISTS: rejected - no grading-chat symbols in src; the continuous
  driver does not exist; the incremental route is gated off. First live wiring.
- R2/R3: isolated and additive; not resolved by the checker.

## Weakest placed requirement

RES-GC-11 (disclosure floor): T5 asserts only that the disclosure string constant is
present in source; visibility is owner-walk (nothing renders here). Runner-up: the
append-vs-reset leverage's user-facing half is owner-walk. Both are correctly
DISCLOSED as owner-walk ceilings, not new defects - the inherent no-render limit.

## Informational

- The plan's in-flight snapshot is stale (F1 and L13 have since committed).
- A concurrent full-suite gate run against an uncommitted/red probe file could redden
  the wave gate for an unrelated reason - a dispatch-time concurrency concern the
  orchestrator manages (the L13 probe has since landed green at 986b0447).

## Stopping point

DESIGN - the one-line write-set/gate correction, folded into the build brief. No
rulings in dispute; no measurement remains.
