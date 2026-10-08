# L16 scope: stop guard cannot tell "idle" from "being built"

Status: scope/recon only, to be checked. Author: loop-seat (Sonnet). Read-only
recon at HEAD `06bafec4` (`git log -1 --format=%H`). No source, test or backlog
file was edited by this pass; `docs/l16-scope.md` is the only file written.

## 1. Recommendation (one line)

**WONT-DO the 5th `building` state, and do not add a refinement.** The premise
the row was filed on (2026-09-20, a293613c) no longer describes the guard
stack, and the one thing the row wanted - an in-flight row that does not trip
the queue check - is already expressible, and already in routine use, with zero
code (section 4). A 5th state would cost about 8 source/doc files and 8 test
files and would not even silence the guard that actually fires on a mid-flight
turn (section 5).

## 2. How the stop guard decides today (cited, opened)

Three checks run in sequence inside `dispatch()`'s `stop-guard` command,
`src/tools/backlog/cli.ts:125-190`. Escapes (`--override`, `--stop-hook-active`)
are honoured by each. `--dry-run` skips the stop-marker touch (`cli.ts:159`).

| Order | Check | Keys on | Where |
|---|---|---|---|
| 1 | DISPATCH guard | marker file mtime: `BACKLOG_LAST_DISPATCH` >= `BACKLOG_LAST_STOP` allows; older or never written blocks | `dispatch-guard.ts:84-145` (compare at `:134-145`); wired `cli.ts:148-162`; files under `.git/`, `dispatch-markers.ts:31-32`; dispatch marker is written by `npm run backlog:touch-dispatch`, `cli.ts:111-114` |
| 2 | SHIPPED-BUT-UNCITED | git log vs backlog citations | `cli.ts:173-179` |
| 3 | QUEUE check (`decideStopGuard`) | backlog state only: blocks iff `selectNext(items).type === "actionable"` | `stop-guard.ts:63-75`; `selectNext` returns "actionable" only for a row that is `state === "actionable"` AND `isScoped` (non-empty `owns` and `verify`) AND has no unresolved `blocked_by`, `next.ts:26-32`; `isScoped` at `types.ts:99-101` |

So the answer to "marker timing, state, or both" is: **both, in two separate
layers**. Layer 1 (marker) is the stall detector and keys only on timing. Layer
3 (state) is the older queue-local check and keys only on state. The L16 row
describes only layer 3 and was filed 2026-09-20; the marker layer arrived in
e6b05ea9 on 2026-09-23 (`git log -S"decideDispatchGuard" -- src/tools/backlog/cli.ts`),
after the row.

### Where each layer can be wrong

- Layer 3 false stall (the row's complaint): fires on a scoped, unblocked
  actionable row even while its implementer is running. Limited to one block per
  turn by escape 2 (`stop-guard.ts:22-26`, `:54-61`).
- Layer 1 false stall: an agent dispatched in an EARLIER turn and still running,
  with no new `touch-dispatch` this turn, blocks (`dispatch-guard.ts:141-144`).
  This is by design: AGENTS.md's mechanical test asks about work started "because
  of something I did THIS TURN". The recovery is one `npm run backlog:touch-dispatch`
  (named in the block reason, `dispatch-guard.ts:67-76`) or the single-block
  escape. A 5th state does not touch this path: layer 1 never reads item state.
- Layer 1 missed stall: the marker is self-reported (`touch-dispatch` is a
  command the orchestrator runs), so touching without dispatching passes. A
  `building` state is equally self-reported (hand-edited YAML) and enforces
  nothing either.

## 3. Measurements (each names its command)

| # | Quantity | Value | Command |
|---|---|---|---|
| M1 | rows in backlog at HEAD | 115 | `grep -c "^- id:" docs/backlog.yml` |
| M2 | state split at HEAD | owner 19, unscoped 18, verification 78, actionable 0 | `grep -E "^  state:" docs/backlog.yml \| sort \| uniq -c` |
| M3 | backlog.yml revisions since 2026-09-23 | 185 (183 parsed, 2 failed to parse, not counted) | `git log --since=2026-09-23 --format=%h -- docs/backlog.yml`, each revision parsed with the real `parseBacklogYaml` and run through the real `selectNext` (scratch script, below) |
| M4 | of those, revisions where the queue check WOULD have blocked (`selectNext` returned "actionable") | **0 of 183** | same script |
| M5 | revisions containing at least one `state: actionable` row | 122 of 183; 454 actionable row-instances; max 11 at once | second scratch script, same loop |
| M6 | of those 454 actionable row-instances, how many satisfy `isScoped` | **0** | same script |
| M7 | canary for M4/M6 (the instrument can fail) | `selectNext([{state:"actionable", owns:["f"], verify:"v", blocked_by:[], ...}])` returned `actionable` | same script, run first |

Scratch scripts (session scratchpad, not committed; reproduce by the pattern):
for each revision `r`, `parseBacklogYaml(git show r:docs/backlog.yml)`, then
`selectNext(items).type` and `items.filter(i => i.state==="actionable").filter(isScoped).length`,
run with `node --experimental-strip-types --experimental-default-type=module
--experimental-loader ./src/tools/backlog/resolve-ts-hook.ts <script>` and
`file:///` import URLs (a bare `C:/` import fails on Windows, which I hit once).

**What M4 and M6 say.** Since the dispatch guard landed, the queue check has not
blocked at any backlog revision in the log. Rows that are actually being built
are kept `state: 'actionable'` with `owns: []` and `verify: null` "on purpose:
write sets are per wave", so they fall in `selectNext`'s unscoped branch
(`next.ts:34-39`) and `decideStopGuard` ALLOWS (`stop-guard.ts:77-84`). Example in
the tree: the A7 row note, `docs/backlog.yml:317`, "state moved unscoped to
actionable, IN BUILD ... owns and verify stay empty on purpose". That is the
`building` state the row asked for, expressed through existing fields.

Limit on M4: it measures what the QUEUE check would have decided at each
committed revision. It does not measure live hook firings (those are not logged),
and the working-tree yaml between commits is not sampled. And `cli.ts:119-124`
records that no real hook invocation consuming the exit code has been observed
by the repo, so the live blocking behaviour is UNVERIFIED here; I only verified
the decision logic. I ran `npm run --silent backlog:stop-guard -- --dry-run`
once: it exited 2 with the dispatch-guard reason ("dispatch marker is older than
the previous stop marker"), which is layer 1 reading this subagent session's
markers, not a queue-check result, and `--dry-run` wrote nothing.

## 4. Reading (b): ACCEPT-AS-FLOOR, assessed

The current two-layer model already separates "being built" from "idle" on the
axes that matter:

- "A dispatch this turn" is exactly what layer 1 asks (`dispatch-guard.ts:134`).
  That IS the building-vs-idle question as AGENTS.md defines it for a turn.
- "A row is in flight but unscoped" is already how the orchestrator marks
  building rows (M6 = 0 scoped actionable rows in 454 instances), so layer 3 is
  silenced for them with no schema change.

The row's own risk argument ("a signal that is routinely correct to ignore trains
you to ignore it", note field) was true on 2026-09-20 when scoped actionable rows
existed. It is empirically not true now: layer 3 never fired in the measured window,
so there is no routinely-ignored signal to protect.

The honest cost of WONT-DO, stated rather than hidden: because scoped actionable
rows are never present, layer 3 is also BLIND to a real idle backlog item. The
sole stall detector in practice is the self-reported marker, and neither layer
catches "dispatched a trivial agent, left the recommended item unstarted"
(AGENTS.md SHAPE 5). That is a separate defect from L16 and a 5th state would not
fix it either (see residual R1).

## 5. Reading (a): 5th `building` state, assessed and costed

Touch list, each opened or grepped:

Source (compile- or behaviour-forced):
1. `src/tools/backlog/types.ts:19` union, `:87-92` `BACKLOG_STATES` array, header
   comment `:6-10` ("four values").
2. `src/tools/backlog/render.ts:40-45` `STATE_LEGEND: Record<BacklogState, string>`
   - tsc FAILS until a `building` entry is added, so this one is compile-forced.
3. `src/tools/backlog/next.ts:26`, `:35`, `:51-52` - decide `building` semantics
   (ordering but not blocking) and add it to the "no actionable remain" counts;
   otherwise building rows silently vanish from the empty-reason text, the exact
   Blocker B2 failure `next.ts:4-9` warns about.
4. `src/tools/backlog/wave.ts:28` `readyPool` - decide whether `building` rows are
   waveable (they should not be; needs an explicit decision and a test).
5. `src/tools/backlog/stop-guard.ts` - no code change if `selectNext` excludes
   `building`; header `:1-27` needs a sentence.
6. `src/tools/backlog/yaml-codec.ts:174` - auto-covered by `isBacklogState`, no edit
   (still needs a round-trip test).
7. `docs/BACKLOG.md` - generated; re-render (`npm run backlog:render`) and
   `npm run backlog:check-generated` must pass. Legend text comes from item 2.
8. Process docs: the "four states" prose. `grep -rln "actionable.*owner.*verification.*unscoped"`
   found docs/BACKLOG.md plus several scope/AC docs; no live process doc beyond
   BACKLOG.md was confirmed to enumerate the state set, so the doc cost is small
   but unmeasured beyond that grep.

Tests that reference state literals (`grep -c` of the state names per file):
`next.test.ts` 16, `stop-guard.test.ts` 9, `yaml-codec.test.ts` 11,
`cli.test.ts` 8, `render.test.ts` legend assertions at `:107-109` and fixtures,
`wave.test.ts` 2, `ids.test.ts` 1, `shipped-uncited.test.ts` 1. That is 8 test
files to review; most would not need edits, but each new `building` branch needs
new cases (next, wave, codec round trip, render legend, stop-guard allow).

Canaries: `grep -rn "BACKLOG_STATES" src --include=*.test.ts` returns nothing, so
there is NO frozen EXPECTED state-set pin to bump. The set is guarded only by the
`Record<BacklogState, ...>` type in render.ts. (Brief-from-the-tree: the row's
guess of "EXPECTED/enum pins" does not exist at HEAD.)

Why it does not even fix the complaint:
- Layer 1 runs first (`cli.ts:153-162`) and never reads item state, so a `building`
  row cannot suppress a mid-flight-turn block from the marker (section 2).
- Layer 3 would still block on any OTHER scoped actionable row, which is correct
  behaviour and not the complaint.
- The lifecycle ("set at dispatch, cleared at push") is hand-maintained YAML with
  no enforcer; a forgotten clear leaves a row permanently excluded from `next`,
  `wave` and the guard - a new silent-drop failure mode in the instrument.
- It duplicates the existing empty-owns convention with a second spelling.

## 6. Cheaper third option

None warranted. Considered and rejected:
- Make layer 3 skip when layer 1 saw a fresh dispatch: would remove the only
  state-derived signal that names an unstarted item, in exchange for removing a
  check that fired 0 times in M3. Real quality loss, no measured gain.
- A one-line doc note: unnecessary beyond the closure text below; the idiom is
  already recorded in the A7 row (`docs/backlog.yml:317`).

## 7. If the owner accepts WONT-DO: the exact edits and gate

1. Delete row L16 from `docs/backlog.yml` (lines 427-438 at HEAD; closing DELETES
   a row per the file's own rule, `docs/DEV_LOOP.md` "Closing an item DELETES it").
2. `npm run backlog:render` then `npm run backlog:check-generated`.
3. Commit message names the disposition and cites this scope (history lives in git).
4. Gate: docs-only, so `npm run backlog:check-generated` plus `git status --short`
   against `docs/backlog.yml` and `docs/BACKLOG.md` only. I did not run steps 1-3.

Closing text to record in the commit body (not in the backlog): L16 closed WONT-DO.
Measured 0 of 183 backlog.yml revisions since 2026-09-23 would trip the queue check;
in-build rows are already expressed as actionable with empty owns/verify
(docs/backlog.yml:317); the dispatch marker (dispatch-guard.ts:134) is the
building-vs-idle discriminator. Family note: L14 and L15 are independent rows and
are not decided by this disposition.

## 8. Residual register

| ID | What is not proven | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | Layer 3 is dormant in practice (M4/M6), so an unstarted but scoped item would not be caught by it, and layer 1 is self-reported; "trivial dispatch to satisfy the marker" (AGENTS.md SHAPE 5) is uncovered by either layer | orchestrator | re-run the M3/M6 loop (`parseBacklogYaml` + `selectNext` per `git log` revision of docs/backlog.yml) and check whether any scoped actionable row has appeared | next loop-maintenance review, or the first time a row is filed `actionable` with non-empty `owns`/`verify` |
| R2 | Live hook behaviour is unobserved; only decision logic was read (`cli.ts:119-124`) | owner | observe a real stop in the Claude Code session that a block is taken, with a `.git/BACKLOG_LAST_STOP` mtime read before and after | owner-run, any real session end |
| R3 | How often the layer-1 "agent still running from an earlier turn" false stall occurs is unmeasured; hook firings are not logged | orchestrator | add a counter only if R2 shows it matters; no instrument exists today | decide after R2; not owed now |
| R4 | 2 of 185 revisions failed to parse in the measurement and are excluded; the 0-of-183 figure is over parsed revisions only | seat that checks this scope | `git show <rev>:docs/backlog.yml` per failing revision (the script swallowed the exception; re-run with logging) | check round on this scope |

## 9. What I could not determine

- Whether any real hook has ever blocked a turn in this repo (no hook log).
- Whether the three-turn A11 block of 2026-09-20 was layer 3 specifically: that
  predates the dispatch guard (e6b05ea9, 2026-09-23), so it must have been layer
  3, but I did not open the 2026-09-20 session record, only the row's claim and
  the commit dates above.
- Doc enumerations of the state set beyond the one grep in section 5 item 8.
