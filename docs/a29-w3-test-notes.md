# A29 Wave W3 - TDD test notes and oracles: the bulk-course-message confirm surface

Seat: `loop-test-author` (Opus). This document is the thing that DOES the
checking for W3. It decides what is measured, by which instrument, and in which
direction each requirement fails. The implementer writes the test CODE from
these notes; a fresh `loop-checker` reads this first. No production code and no
test code is written here.

Spec consumed: `docs/a29-w3-surface-ac.md` (AC-W3-1..13), ruled-in readings D-1
(preview action + ONE shared resolver), D-2 (no barrel line; direct import),
D-3 (`role="group"`+`aria-label`, not `alertdialog`), D-4 (four-word AST copy
scan). Tree read this pass, not recalled: `src/app/actions/bulk-course-message.ts`
(78 lines), `src/app/actions/bulk-course-message.test.ts` (256 lines, 17 tests),
`src/lib/bulk-course-message/{refusal,plain-text}.ts`, `src/lib/canvas/inbox.ts:444-488`,
`src/lib/canvas/listings.ts:359`, `src/lib/courses-table-helpers.ts:603`,
`src/app/components/content-tab/modules/confirmArming.ts`,
`src/tools/symbol-count/count.ts`, `src/app/actions/action-guard-coverage.test.ts`,
`src/app/components/ui/modalAdoptionScan.ts`,
`src/app/components/componentStorageKeys.structure.test.ts`,
`src/tools/strip-comments-agreement.structure.test.ts`,
`src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts` (the AST
wiring precedent), `src/app/components/CanvasTab.tsx` (13 lines).

---

## 0. Satisfiability proof (OBLIGATION 1): the red tests pass against a reference

A set of failing tests is not a specification until something passes it. I built
a throwaway reference implementation of the shared resolver + both action exports
and the full pure leaf model, and ran the AC leaf tables and the preview/send
parity table against it. **42 assertions, ALL GREEN**
(`scratchpad/a29-w3-satisfiability.mjs`, run with `node`). It proves, before any
implementer touches the tree:

- The shared-resolver send/preview twin (D-1) is constructible and makes a
  permit/refuse divergence between display and send impossible: preview refuses
  **iff** send refuses, with the same `kind`, and preview is `ready` **iff** send
  would POST, across counts {0,1,2,50,100,101} and all refusal paths.
- Preview POSTs **zero** times, and reads the count **zero** times on the
  `canLms`-fail and null-course paths.
- The refactored send still produces every W2 outcome the existing 17 tests pin.
- The pure leaf model (`confirmFromPreview`, `confirmSignature`,
  `eligibleLiveCourses`, `resolveSelectedCourse`, `reduceCompose`,
  `outcomeNotice`, `createSendLock`) satisfies every AC leaf table below.

What the proof CANNOT establish (unchanged by it, routed to OWNER/argued below):
nothing renders, so mount/confirm/absence/focus/theme are OWNER; the real
`@/`-aliased type-checked compile is the implementer's `tsc` gate, not this
node-JS proof; real Canvas behaviour (R-7) is unverifiable here.

**Finding that the proof forced (a real design-seam defect, OBLIGATION 2 shape).**
Spec 5.2 says `confirmSignature(c)` is built "via `selectionSignature` over
`[courseId, count, subject, body]`". `selectionSignature`
(`confirmArming.ts:20`) **sorts** its inputs - it is deliberately
order-INDEPENDENT ("`{A,B}` and `{B,A}` must produce the same signature",
that file's own comment). Applied to the 4-tuple, a subject/body **swap**
(subject `"A"` body `"B"` -> subject `"B"` body `"A"`) sorts to the same multiset
and yields an IDENTICAL signature - so editing-after-Review in a way that swaps
the two fields would NOT disarm the banner, and text the instructor never
confirmed could go out. That is exactly the AC-W3-4 failure the signature exists
to prevent. **The instrument must be an order-PRESERVING delimiter join**
(join the four stringified fields with a `\x00` separator, no sort), NOT
`selectionSignature`. This is routed to the architect as finding **W3-F-SIG**
(section 6) and the AC-W3-4 leaf table below carries a mandatory SWAP row that
goes RED against the sorted construction and GREEN against the ordered one. The
`\x00` delimiter is still required (a delimiter-free join lets `courseId="1"`,
`count=2` collide with `courseId="12"`).

---

## 1. Instruments available here, and the ones that are forbidden

- **AST counting**: `countSymbolOccurrences(source, fileName, symbol)` from
  `src/tools/symbol-count/count.ts`, CALL bucket (`report.callCount`) for call
  sites, never `grep -c`. It is blind to string-built identifiers and (in `.tsx`)
  to JSX-text occurrences for the comment/string split - the CODE buckets stay
  trustworthy in `.tsx` (its own header, lines 64-92). Use `.ts` fixtures where a
  count must be exact.
- **AST structural pins**: the TypeScript compiler API, exactly as
  `repoGradesClassTrends.wiring.test.ts` uses it (`ts.createSourceFile`,
  `findFunctionBody`, `directStmts`, `countCallsTo`, `countIdentRefs`,
  JSX walks). DUPLICATE those helpers into the new wiring file; NEVER import them
  from that `*.test.ts` (re-runs its describe blocks - `no-cross-test-file-imports`).
- **Guard regex reality**: `action-guard-coverage.test.ts` collects only
  `/^export async function (\w+)/` and reads each body up to a column-0 `}`,
  testing `GUARD_CALL = /\brequire(Owner|User|AppOwner)\s*\(/` against that body.
  So `previewBulkCourseMessageAction` MUST be `export async function` and MUST
  contain a literal `requireUser(` inside its own body. A guard hidden only in
  the shared resolver reads as unguarded.
- **Network is blocked** (`vitest.setup.ts` throws on real `fetch`). On the
  action path, mock `@/lib/canvas/inbox` (`createCourseConversation`),
  `@/lib/canvas/listings` (`countActiveCourseStudents`), `@/lib/supabase/auth`
  (`requireUser`), `@/lib/supabase/courses` (`getCourse`) - NEVER `fetch`. A live
  401 once made a sabotage pass.
- **Multi-path runs**: `npm run test:paths <p1> <p2> ...` (confirmed in
  `package.json:21`), NEVER a raw multi-path `vitest`/`npm test`.
- **Forbidden spellings**: no `/s` dotAll flag (passes vitest, FAILS tsc TS1501).
  No emojis. A comment-strip helper must NOT be named `stripComments` and no new
  `*.test.ts` may MENTION that literal (the governance gate
  `strip-comments-agreement.structure.test.ts` enumerates every `*.test.ts` that
  mentions it and reddens the gate repo-wide until classified). W3 needs NO
  comment-strip helper at all - the copy scan uses the TS AST, where comments are
  not nodes. If one is ever needed, name it `withoutLineComments` with
  `.split(/\r?\n/)` + unanchored `/\/\/.*$/` (the anchored `^`-per-line form is
  trailing-comment-blind, defeat on record).

---

## 2. Test file map (the write set the implementer fills)

| Test file | Requirements it carries |
|---|---|
| `src/app/actions/bulk-course-message.test.ts` (EDIT, append only) | AC-W3-10 (preview twin, parity, guard, non-regression). The 17 existing tests stay byte-green. |
| `src/app/components/bulk-course-message/bulk-message-model.test.ts` (NEW) | AC-W3-2 leaf (`confirmFromPreview`), AC-W3-3a (banner text), AC-W3-4 leaf (`confirmSignature`), AC-W3-5 leaf (`reduceCompose`), AC-W3-6 leaf (`createSendLock`), AC-W3-7 leaf (`eligibleLiveCourses`/`resolveSelectedCourse`), AC-W3-8 leaf (`outcomeNotice`) |
| `src/app/components/bulk-course-message/bulk-message-storage.test.ts` (NEW) | AC-W3-11 (keys, explicit fields, throw-safe, round trip, clear-on-accept) |
| `src/app/components/bulk-course-message/bulk-course-message.wiring.test.ts` (NEW) | AC-W3-1 (reach + mount), AC-W3-2 AST (ConfirmedMessage single constructor + send-param type), AC-W3-3b/c (action allowlist + import wall), AC-W3-5 AST (single strip call site), AC-W3-6 AST (claim-before-await, release-in-finally), AC-W3-9 (copy scan, 3 scopes), AC-W3-11 (directory ta- key canary), AC-W3-12 (zero-prop, no host reach-through), AC-W3-13 AST (no DOM-HTML sink) |

Gate the wave: `npm run test:paths -- src/app/components/bulk-course-message/bulk-message-model.test.ts src/app/components/bulk-course-message/bulk-message-storage.test.ts src/app/components/bulk-course-message/bulk-course-message.wiring.test.ts src/app/actions/bulk-course-message.test.ts`, then the AC-W3-13 neighbour gates (section 5).

---

## 3. Requirements: object, instrument, direction, frozen oracle, sabotage

Each requirement names the OBJECT under comparison, the INSTRUMENT, the
DIRECTION of failure, the frozen oracle as a CONSTRUCTION, and a named SABOTAGE
with its expected RED and restore-GREEN, and whether it DISCRIMINATES.

### R1 - AC-W3-10: the preview action is a read-only twin, send unchanged [MACHINE]
- Object: `previewBulkCourseMessageAction(courseId)` outputs and side effects vs
  `sendBulkCourseMessageAction` on the same fixtures.
- Instrument: the W2 file's mock seams (mock the four `@/lib/...` modules; a
  `h.order` recorder and a POST-call counter on `createCourseConversation`).
  Drive BOTH exports per count fixture.
- Frozen oracle (CONSTRUCTION, not recomputation): the parity table is built by
  running send and preview over the SAME count fixture and asserting the relation
  `preview.refused <=> send.refused (same kind)` and `preview.ready <=> send POSTs`.
  Proven satisfiable in section 0.
  - counts {2,50,100} -> preview `{status:"ready", courseName: course.name, count}`,
    key set a subset of `{status,courseName,count}`; send POSTs exactly once.
  - count 1 -> both refuse `one-student` (reason contains "1"); count 0 -> both
    refuse `one-student`; count 101 -> both refuse `over-max` (reason contains "101").
  - `canLms`-fail (blank url) and null `getCourse` -> both refuse with ZERO
    `countActiveCourseStudents` calls; blank institution -> `needs-institution`.
  - count read throws `CANVAS_CREDENTIAL_REQUIRED_MESSAGE` -> `no-credential`;
    any other throw -> `canvas-unreachable`.
  - `requireUser` is the FIRST recorded call in BOTH exports.
  - `createCourseConversation` is called ZERO times by preview in EVERY case.
- Non-regression: the 17 existing titles run UNEDITED (`npx vitest run
  src/app/actions/bulk-course-message.test.ts` -> `17 passed`, measured at HEAD
  this pass). If any of the 17 needs editing to pass, that is a FINDING, not a fix.
- Direction of failure: FAIL if preview POSTs; FAIL if preview and send disagree on
  any fixture in either direction; FAIL if `requireUser` is not first; FAIL if the
  ready arm carries a roster/per-student field; FAIL if a W2 title needs editing.
- SABOTAGE S1a: in the shared resolver, drop the `classifyRecipientCount` refusal
  (treat every count as a permit). RED: parity table (count 1/101 send refuses,
  preview readies). Restore -> GREEN. **Discriminates.**
- SABOTAGE S1b: make preview call `createCourseConversation` (copy the send tail
  into preview). RED: "preview NEVER POSTs" (POST counter = 1). Restore -> GREEN.
  **Discriminates.** (This is the whole point of D-1 - two exports, one resolver,
  only send POSTs.)
- SABOTAGE S1c: delete the literal `requireUser(` from `previewBulkCourseMessageAction`'s
  own body, leaving it in the resolver. RED: `action-guard-coverage.test.ts`
  ratchet (unguarded action appears) AND the "requireUser first" parity row.
  Restore -> GREEN. **Discriminates.**

### R2 - AC-W3-2: nothing sends without a SERVER-issued ready preview [MACHINE/AST]
- Object: the single constructor of `ConfirmedMessage`, and the type of the
  function enclosing the send call.
- Instrument: (i) `npx tsc --noEmit` (no output); (ii) AST over the panel dir:
  the only `confirmFromPreview` is where `ConfirmedMessage`-shaped objects are
  created - enforce by requiring the enclosing-function of the send call to take a
  parameter annotated `ConfirmedMessage`, and that the panel source contains
  exactly ONE object literal/return assembling the `ConfirmedMessage` fields, inside
  `confirmFromPreview`; (iii) leaf table over `confirmFromPreview`.
- Frozen oracle (CONSTRUCTION): refusal rows are DERIVED from the closed
  `RefusalKind` union `["not-linked","needs-institution","no-credential",
  "canvas-unreachable","one-student","over-max","canvas-refused"]` (iterate the
  type's members, do not hand-list in the assertion body) - each `{status:"refused",
  kind}` preview yields `null`; a `{status:"ready", courseName, count}` preview
  yields `{courseId, courseName, count, subject:trim, body:trim}` whose `count` and
  `courseName` equal the preview's. Proven in section 0 (7 refusal rows + ready).
- NOTE it is AST-enforced, NOT TS-type-enforced (the W3 check's I-1): TypeScript
  cannot forbid a second `ConfirmedMessage` literal elsewhere, so the AST single-
  constructor pin is load-bearing, not decorative.
- Direction: FAIL if any refused preview yields a `ConfirmedMessage`; FAIL if the
  send call's enclosing function lacks the `ConfirmedMessage` parameter; FAIL if a
  second construction site exists. This is W3's removal test (leverage).
- SABOTAGE S2a: change `confirmFromPreview` to `if (preview.status !== "ready")
  return { ...placeholder }` instead of `null`. RED: the derived refusal table
  (a refused kind yields non-null). Restore -> GREEN. **Discriminates.**
- SABOTAGE S2b: add a second `ConfirmedMessage` literal in the panel (e.g. a
  "resend" path building one from live state). RED: the AST single-constructor
  count (2, not 1). Restore -> GREEN. **Discriminates** - this is the attack the
  requirement exists to catch (a send path bypassing the server preview).
- SABOTAGE S2c (negative control): change the send handler's parameter type from
  `ConfirmedMessage` to `{courseId; subject; body}`. RED: the AST "enclosing
  function takes a `ConfirmedMessage` param" pin AND tsc if the call site passes a
  `ConfirmedMessage`. Restore -> GREEN. **Discriminates.**

### R3 - AC-W3-3: confirm shows course name, count, message; all server-driven [MACHINE + OWNER]
- Object: (a) the leaf that builds banner content from a `ConfirmedMessage`;
  (b) the set of server-action identifiers the panel directory imports;
  (c) value imports from Canvas/supabase modules.
- Instrument (a) leaf table: `bannerText(confirmed)` CONTAINS `courseName`, the
  DECIMAL count, the trimmed subject and the trimmed body. Table over counts
  {2,50,100} and a course name carrying `&`, `<`, `"` (prove no HTML-escaping
  corrupts the match; the panel renders as React text, so the oracle asserts the
  raw substring is present).
- Instrument (b) AST ALLOWLIST (not a denylist - `seats.md:115-122`, the denylist
  version of this boundary was lengthened 1->3->6->9 and stayed open): the set of
  identifiers imported from any `@/app/actions/*` specifier in the panel directory
  is EXACTLY `{sendBulkCourseMessageAction, previewBulkCourseMessageAction,
  listCourseHubAction, draftAnnouncementAction}`; type-only imports excluded. Build
  the set by walking import declarations with the TS AST and collecting value
  import names whose resolved specifier contains `/actions/`.
- Instrument (c) import wall: the panel directory has NO value import whose
  specifier starts `@/lib/canvas`, `@/lib/canvas-modules`, or `@/lib/supabase`
  (the first two are already walled for `"use client"` by
  `canvas-client-boundary.test.ts`; this pins `supabase/*`).
- Direction: FAIL if banner omits any of the three; FAIL if the panel imports any
  server action outside the allowlist; FAIL if a Canvas/supabase value import
  appears; (OWNER OV-2a) FAIL if the rendered banner lacks any of the three; FAIL
  if the displayed count is not the preview's number.
- SABOTAGE S3a: make `bannerText` omit the count. RED: the leaf table (count
  substring absent). Restore -> GREEN. **Discriminates.**
- SABOTAGE S3b: add `import { listCourseRoster } from "@/app/actions/..."` (or a
  value import from `@/lib/canvas/listings`) to the panel. RED: the allowlist set
  (now 5) / the import wall. Restore -> GREEN. **Discriminates** - this is the
  "a roster action supplies the number" attack.
- Note the OWNER half (OV-2a) is what the machine CANNOT show: the DOM contents.
  Tagged OWNER, not asserted machine-verified.

### R4 - AC-W3-4: confirmed==sent; editing disarms; reload never reopens [MACHINE + OWNER]
- Object: `confirmSignature` over the current inputs; the persisted state; the
  send call's argument expressions.
- Instrument (leaf table): `confirmSignature` DIFFERS when any of courseId, count,
  subject, body differs; is EQUAL when only leading/trailing whitespace differs
  (builder trims). **Mandatory SWAP row (W3-F-SIG)**: subject `"A"`/body `"B"` vs
  subject `"B"`/body `"A"` must produce DIFFERENT signatures.
- Instrument (AST): the three `sendBulkCourseMessageAction` arguments are member
  accesses on the one `ConfirmedMessage` parameter (`confirmed.courseId`,
  `confirmed.subject`, `confirmed.body`), never component-state identifiers read at
  click time.
- Instrument (storage leaf): after writing full state, no stored value contains the
  armed signature, the preview, or the `ConfirmedMessage` (assert the stored JSON
  keys are exactly `{subject,body,prompt}` per course, see R11).
- Direction: FAIL if editing subject/body after Review leaves the banner armed;
  FAIL if send args come from live state; FAIL if any arming state is persisted.
- SABOTAGE S4a (THE finding's canary): implement `confirmSignature` with
  `selectionSignature([courseId,count,subject,body])` (the spec's literal, sorted).
  RED: the SWAP row (swap yields identical signature). Restore to the ordered join
  -> GREEN. **Discriminates** - and this sabotage IS the defect the proof found;
  without the SWAP row the sorted construction passes and ships the bug.
- SABOTAGE S4b: change one send argument to read live component state
  (`subjectState` instead of `confirmed.subject`). RED: the AST member-access pin.
  Restore -> GREEN. **Discriminates.**
- SABOTAGE S4c: drop the `count` field from the signature. RED: the "differs when
  count differs" row. Restore -> GREEN. **Discriminates.**

### R5 - AC-W3-5: strip at draft-accept only, never a typed body [MACHINE]
- Object: `subject`/`body` produced by `reduceCompose` for `drafted` vs `typed`;
  the single call site of `canvasInboxPlainText` in the panel directory.
- Instrument (leaf table): a `drafted` result whose `message` carries a heading
  marker, bold markers, a list bullet and an HTML tag yields a `body` with NONE of
  them and the words kept; the same text through a `typed` action is stored
  byte-identical; `cleared-after-accept` empties subject+body (keeps prompt); a
  drafter-`{error}` action dispatches nothing. The strip is the shipped W1 leaf
  (its own oracle `plain-text.test.ts` exists), so this pins the FACT of
  invocation, not its spelling (`source-text-tests-overspecify`).
- Instrument (AST): `canvasInboxPlainText` has EXACTLY ONE call (CALL bucket of
  `countSymbolOccurrences`) in the panel directory, located inside `reduceCompose`'s
  `drafted` branch; the body field's change handler dispatches `typed` only; the
  send handler references `canvasInboxPlainText` ZERO times.
- Direction: FAIL if a drafted body keeps markup; FAIL if a typed body is altered;
  FAIL if the strip runs at send time; FAIL if the drafter-error path commits.
- SABOTAGE S5a: apply the strip in the `typed` branch too. RED: "typed body
  byte-identical" (`**x**` altered) AND the AST single-call-site count (2). Restore
  -> GREEN. **Discriminates.**
- SABOTAGE S5b: move the strip to the send handler. RED: the "send references
  canvasInboxPlainText zero times" AST pin. Restore -> GREEN. **Discriminates.**

### R6 - AC-W3-6: one send per confirm; synchronous ref lock, released in finally [MACHINE + OWNER]
- Object: `createSendLock`; the confirm handler's statement order.
- Instrument (leaf): first `tryClaim()` true, immediate second false, third after
  `release()` true (proven section 0).
- Instrument (AST, on the confirm handler body): a `tryClaim()` call precedes the
  FIRST `await`; a `release()` call appears inside a `finally` block. Precedent:
  the A26 `useRef` claim-before-await pins in `repoGradesClassTrends.wiring.test.ts`
  A-2(a) and the `useRepoGradesBulkGrade.ts:216/228/244` idiom (declare ref, claim
  before await, release in finally).
- Direction: FAIL if two back-to-back claims both succeed; FAIL if the claim comes
  AFTER an `await` (the A26 stale window, F-5); FAIL if `release()` is not in a
  `finally`; a `useState` flag alone is NOT a pass.
- SABOTAGE S6a: make `tryClaim` always return true. RED: the leaf one-shot row.
  Restore -> GREEN. **Discriminates.**
- SABOTAGE S6b: move the `tryClaim()` call to after the first `await` in the
  handler. RED: the AST claim-before-await pin. Restore -> GREEN. **Discriminates.**
- SABOTAGE S6c: move `release()` out of `finally` into the try body. RED: the
  AST release-in-finally pin. Restore -> GREEN. **Discriminates** (A27 stuck-surface shape).
- OWNER OV-2c (double-click = one request, button disabled) is what the machine
  cannot show.

### R7 - AC-W3-7: absent on a non-live-LMS course [MACHINE + READING + OWNER]
- Object: `eligibleLiveCourses` over the url x institution cross product;
  `resolveSelectedCourse`; the panel's predicate usage.
- Instrument (leaf table, axes from a DIFFERENT source than the generator): the
  axes are `canvasUrl in {empty, whitespace, set}` x `institution in {empty,
  whitespace, set}` (9 rows), derived from `canLms`'s definition
  (`courses-table-helpers.ts:603-605`: `Boolean(trim(url) && trim(inst))`); the
  expected table is written independently as "exactly the (set,set) row is
  eligible". Proven section 0 (1 of 9). `resolveSelectedCourse`: a stored id absent
  from eligible -> `null`; exactly one eligible -> itself.
- Instrument (AST): the panel directory reads NO `canvasUrl` or `institution`
  property (it delegates to `canLms`, not a second predicate) - assert
  `countSymbolOccurrences` CALL/REFERENCE of those property names is zero in panel
  source, and that `canLms` is imported and referenced.
- Direction: FAIL if a blank-url or blank-institution row is eligible; FAIL if the
  surface defines its own predicate; FAIL if a stale stored id yields compose controls.
- SABOTAGE S7a: change `eligibleLiveCourses` to `courses.filter(c => c.canvasUrl)`
  (truthy, no trim, no institution). RED: the whitespace-url row and every
  blank-institution row. Restore to `.filter(canLms)` -> GREEN. **Discriminates** -
  this is the `coercion-changes-set-membership` class.
- SABOTAGE S7b: make `resolveSelectedCourse` return `storedId` unconditionally.
  RED: the "stale stored id -> null" row. Restore -> GREEN. **Discriminates.**
- READING: compose controls render only when resolved id is non-null (reading
  claim, tagged, not machine-verified). OWNER OV-2b.

### R8 - AC-W3-8: outcome rendering never claims delivery [MACHINE + OWNER]
- Object: `outcomeNotice(outcome, courseName)` over the closed outcome union.
- Instrument (leaf table): `accepted` -> tone `success`, text contains
  `Canvas accepted` and the course name; `unknown` -> tone `warning`, text contains
  `did not confirm`, does NOT contain `Canvas accepted`; every `refused` kind (one
  row per `RefusalKind`, DERIVED from the type) -> tone `error`, text CONTAINS the
  outcome's `reason` verbatim. The three tones are pairwise distinct. Then: after
  `accepted`, `reduceCompose` `cleared-after-accept` empties subject+body; after
  `refused`/`unknown` the fields are unchanged (retry without retyping).
- Direction: FAIL if `unknown` maps to success tone or accepted copy; FAIL if a
  refusal drops its `reason`; FAIL if `accepted` copy asserts a student received
  anything (covered by R9's copy scan too); FAIL if a non-accepted outcome clears
  the draft.
- SABOTAGE S8a: map `unknown` to tone `success`. RED: "unknown tone === warning"
  AND "three tones pairwise distinct". Restore -> GREEN. **Discriminates** (Ruling
  26: an ambiguous 5xx must never read as success).
- SABOTAGE S8b: clear the draft on `unknown`. RED: the "fields unchanged after
  unknown" row. Restore -> GREEN. **Discriminates** (worst-case: invites a
  duplicate whole-class send - section 5.9 item 2 of the spec).

### R9 - AC-W3-9: no delivery word in user-facing copy, AST literal scan [MACHINE]
- Object: every string-bearing node (string literal, no-substitution template,
  template head/middle/tail text, JSX text, JSX attribute string) in three scopes:
  (1) every non-test `.ts`/`.tsx` in `src/app/components/bulk-course-message/`;
  (2) `src/app/actions/bulk-course-message.ts`; (3) the body of the function
  `createCourseConversation` in `src/lib/canvas/inbox.ts` (lines 444-488).
- Instrument: a source-text test using the TS AST (NOT grep, NOT a comment-strip
  helper - comments are not AST nodes, so the JSDoc "...was not delivered" at
  `inbox.ts:439` is invisible, which is the point of F-7), matching
  `/\b(delivered|received|emailed|sent)\b/i` against each node's text. Over-
  inclusive on purpose: every string-bearing node, because "what counts as copy"
  cannot be argued.
- Frozen expectation (CONSTRUCTION + measured): scope 2 has no match (measured:
  `grep -nwiE "delivered|received|emailed|sent" src/app/actions/bulk-course-message.ts`
  -> no hit); scope 3's only forbidden-stem line is the JSDoc comment at `:439`,
  which the AST ignores - the function's string literals
  (`"...delivery is unconfirmed."` at `:484,486`, `"A message needs a body."`,
  `"Could not read a course from that URL."`, `"Not a course context."`,
  `"Canvas refused the message (HTTP ${code})."`) contain NONE of the four whole
  words (`delivery` is a stem, not on the list - D-4). I verified this by reading
  all string nodes in `createCourseConversation`. Scope 1 is new copy, authored
  clean (the spec's 5.7 copy table self-scans clean).
- REQUIRED CANARIES (a vacuous scan is a pass that measures nothing): (a) a fixture
  `.tsx` containing `<p>Sent</p>` IS flagged (proves the JSX-text channel is
  scanned); (b) a fixture with a forbidden word ONLY in a comment is NOT flagged;
  (c) each of the three scopes visits at least one string node (non-vacuity count > 0).
- Direction: FAIL if any scanned node matches; FAIL if a scope yields zero nodes
  or the JSX canary is not flagged.
- Instrument limits (STATE them, per F-7/D-4): runtime-assembled strings
  (`"se"+"nt"`), a dynamic `reason` from outside the three scopes, and the Canvas
  notification email itself are invisible. `delivery`/`deliver*`/`email*` stems are
  NOT on the list (D-4; adding them would redden the two shipped W1 literals and a
  W1 file, widening W3).
- SABOTAGE S9a: add `<p>Message sent.</p>` to the panel. RED: scope-1 scan.
  Restore -> GREEN. **Discriminates.**
- SABOTAGE S9b (instrument self-attack, REQUIRED per the seat brief): write the
  passing-but-wrong scanner - a line-based grep over raw source instead of AST
  nodes - and run it against scope 3. It FLAGS the `:439` JSDoc comment (false
  positive) and would force an edit to a correct file. Keep the AST form; this
  sabotage proves the grep form is the wrong instrument. Also attack the opposite:
  an AST scan that forgot the JSX-text channel - canary (a) `<p>Sent</p>` then is
  NOT flagged, so canary (a) is what keeps that hole closed. **Both discriminate.**

### R10 - AC-W3-1: the control reaches the actions with the right args, and is mounted [MACHINE + READING]
- Object: the call expressions in `BulkCourseMessagePanel.tsx`; the set of non-test
  files outside the panel directory that render `<BulkCourseMessagePanel>`.
- Instrument (AST, the `repoGradesClassTrends.wiring.test.ts` precedent):
  (i) exactly ONE call whose callee is `sendBulkCourseMessageAction`, with exactly
  THREE arguments; (ii) exactly ONE `previewBulkCourseMessageAction` call with ONE
  argument; (iii) both identifiers import from a specifier ending
  `/actions/bulk-course-message` OR from the actions barrel (accepts either - D-2
  does not bind the test); (iv) exactly ONE non-test file outside
  `src/app/components/bulk-course-message/` contains the JSX element
  `BulkCourseMessagePanel`, and it is the chosen host (`CanvasTab.tsx` under
  reading (b)). Use `countAnyJsxByTag` (both self-closing and open/close forms, per
  the precedent's F-16).
- Canary: the same scan over a fixture with a SECOND send call reports 2; a fixture
  with zero host mounts reports 0.
- Direction: FAIL when send-call count is 0 (dead surface, the standing
  reachability trap) or >= 2 (a second send path); FAIL on arity != 3 or != 1;
  FAIL when no host mounts the panel, or two do.
- SABOTAGE S10a: delete the `<BulkCourseMessagePanel>` mount from the host. RED:
  "exactly one host mount" (0). Restore -> GREEN. **Discriminates** - the
  ships-dead-with-green-gates trap (`assignment-must-include-wiring-file`).
- SABOTAGE S10b: add a second `sendBulkCourseMessageAction(a,b,c)` call. RED: the
  send-call-count pin (2). Restore -> GREEN. **Discriminates.**
- SABOTAGE S10c (negative control, must be a REAL kill): call
  `sendBulkCourseMessageAction` with 2 args. RED: the arity pin. Restore -> GREEN.
  **Discriminates.**

### R11 - AC-W3-11: persistence - right keys, explicit fields, nothing authorising a send [MACHINE + READING]
- Object: the localStorage keys the panel directory writes, and the values written.
- Instrument (storage leaf): read of an ABSENT, a MALFORMED (non-JSON), and a
  THROWING-thunk storage returns defaults and NEVER throws; write of an object
  carrying EXTRA fields stores ONLY `{subject, body, prompt}` per course id (the
  write path enumerates the three fields explicitly - it does NOT spread, so a
  future field cannot leak; `data/storage` checker, `seats.md:217-226`); round trip
  is the identity for those three; `cleared-after-accept` removes that course's entry.
- Instrument (directory key canary, the `componentStorageKeys.structure.test.ts`
  idiom): the pattern `/(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g` over the
  NON-TEST source of the panel directory matches EXACTLY
  `{ta-bulk-msg-course, ta-bulk-msg-drafts}`. This canary lives in the wiring test
  (it scans the panel dir, not `src/app/components/` itself - the keys are in a
  SUBDIRECTORY precisely so they do not redden the parent's non-recursive exact-set
  canary, which is frozen at 81 keys; AC-W3-13 F).
- Direction: FAIL if a third key appears or either is missing; FAIL if an extra
  field is persisted; FAIL if armed/confirmed/preview state is persisted; FAIL if a
  storage throw escapes the leaf.
- SABOTAGE S11a: change the drafts write to spread `{...fields}` instead of
  `{subject, body, prompt}`. RED: the "stores only the three fields" row (an extra
  field appears). Restore -> GREEN. **Discriminates** (`fixtures-must-match-emitted-shape`
  sibling - a future field leaks).
- SABOTAGE S11b: add `localStorage.setItem("ta-bulk-msg-armed", sig)`. RED: the
  directory key canary (3 keys, not 2). Restore -> GREEN. **Discriminates** - a
  reload would offer a one-click irreversible send (R-4).
- SABOTAGE S11c: make the read use `JSON.parse` with no try/catch. RED: the
  malformed/throwing-thunk rows. Restore -> GREEN. **Discriminates.**
- READING: text fields seed from a lazy initializer; no module-scope `*Cache` is
  declared (`client-state-sweep.registry.test.ts` would require registration).
  Reading claim, tagged.

### R12 - AC-W3-12: zero-prop panel, one mount, no host reach-through [MACHINE + READING]
- Object: the panel's props and imports.
- Instrument (AST): the default export takes no parameters or only optional ones;
  no file in the panel directory imports a path under `canvas-tab/`,
  `MessageDraftsTab`, `CanvasTab`, or any host module; mount count per R10(iv).
- Direction: FAIL if the panel reads a host prop or context, or imports host code;
  FAIL if more than one host mounts it.
- SABOTAGE S12a: add a required prop `courseId: string` to the default export. RED:
  the "no required params" AST pin. Restore -> GREEN. **Discriminates** - this is
  what would turn the owner's (a1) answer from a one-file change into several.
- SABOTAGE S12b: add `import ... from "../MessageDraftsTab"` to the panel. RED: the
  host-import pin. Restore -> GREEN. **Discriminates.**

### R13 - AC-W3-13: neighbour gates stay green; model/server text reaches the DOM only as text [MACHINE]
- Object: the new files against the existing structural gates; the panel's DOM sinks.
- Instrument: run as a set with `npm run test:paths -- <paths>` -
  `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts`,
  `src/file-size-ceiling.structure.test.ts`,
  `src/app/components/ui/modalAdoption.wiring.test.ts` (F-4: `role="group"`, no
  `alertdialog` marker, so no new dialog site and no `PERMANENT_EXCLUSIONS` edit),
  `src/app/components/componentStorageKeys.structure.test.ts` (keys in a
  subdirectory, parent exact-set stays 81),
  `src/lib/canvas-client-boundary.test.ts`, `src/lib/use-server-exports.test.ts`,
  `src/app/actions/action-guard-coverage.test.ts`,
  `src/lib/bulk-course-message/unattended-callers.structure.test.ts`,
  `src/tools/strip-comments-agreement.structure.test.ts` (no new test MENTIONS
  `stripComments`, so this stays green with no new classification). Plus an AST pin:
  the panel directory contains ZERO `dangerouslySetInnerHTML` and ZERO `innerHTML`
  assignments (drafter text and server `reason` are model/network-derived; they
  reach the DOM as React text only).
- Direction: any named gate red; any DOM-HTML sink in the panel directory.
- SABOTAGE S13a: render a `reason` via `dangerouslySetInnerHTML={{__html: reason}}`.
  RED: the AST no-DOM-HTML-sink pin. Restore -> GREEN. **Discriminates** (XSS on
  model/network text).
- SABOTAGE S13b: add `role="alertdialog"` to the confirm banner. RED:
  `modalAdoption.wiring.test.ts` (a new unregistered dialog site). Restore to
  `role="group"` -> GREEN. **Discriminates** (F-4).
- The gate list is a FLOOR; the implementer derives the full walker set
  (`grep -rl "readdirSync" src --include=*.test.ts`) and runs the full suite
  before push.

---

## 4. The AC-1/2/3/4/6 disposition (W3 check's I-2): W1/W2-shipped, no surface half

These A29 criteria are discharged by W1/W2 and are NOT re-tested as new W3 leaves;
each is cross-referenced so none is silently dropped:

| A29 AC | Where satisfied | W3 cross-reference |
|---|---|---|
| AC-1 (count/classify leaf) | W1 `classifyRecipientCount` + its own tests | consumed by R1/R2 oracles; not re-pinned |
| AC-2 (plain-text strip leaf) | W1 `canvasInboxPlainText` + `plain-text.test.ts` | R5 pins INVOCATION only, not the strip's own spelling |
| AC-3 (active-count read) | W1 `countActiveCourseStudents` | mocked in R1; its own W1 tests stand |
| AC-4 (the send action, order/refusal/POST) | W2 `sendBulkCourseMessageAction`, 17 tests | R1 non-regression keeps all 17 byte-green |
| AC-6 (no unattended caller) | W2 `unattended-callers.structure.test.ts` | R13 keeps it green; preview is a read, the identifier test names only the send |

---

## 5. Executable HERE vs only ARGUED (no argued item asserted as verified)

| Item | Status |
|---|---|
| R1 parity, guard, non-regression | EXECUTABLE (node-env action test; satisfiability proven section 0) |
| R2 leaf `confirmFromPreview` table + AST single-constructor | EXECUTABLE |
| R2 "Confirm button rendered only in armed branch" | ARGUED (READING) - no render under vitest; OWNER OV-2a |
| R3a banner-text leaf; R3b/c AST allowlist + import wall | EXECUTABLE |
| R3 "the DOM shows all three" | ARGUED (OWNER OV-2a) |
| R4 signature leaf (incl. SWAP row); AST send-arg member access; storage leaf | EXECUTABLE |
| R4 "edit disarms / reload never reopens" as rendered facts | ARGUED (OWNER OV-2e) |
| R5 reduceCompose table; AST single strip call site | EXECUTABLE |
| R6 `createSendLock` leaf; AST claim-before-await + finally | EXECUTABLE |
| R6 real double-click timing, button disabled | ARGUED (OWNER OV-2c) |
| R7 `eligibleLiveCourses`/`resolveSelectedCourse` tables; AST no-own-predicate | EXECUTABLE |
| R7 "no control on screen" | ARGUED (READING + OWNER OV-2b) |
| R8 `outcomeNotice` table | EXECUTABLE |
| R8 notice appearance in light/dark | ARGUED (OWNER OV-2f; visual seat W3-R5) |
| R9 AST copy scan, 3 scopes, canaries | EXECUTABLE |
| R9 dynamic strings, the notification email | ARGUED (stated instrument limit; OWNER OV-3) |
| R10 AST reach + mount count | EXECUTABLE |
| R10 "a click lands" | ARGUED (OWNER OV-1 sandbox) |
| R11 storage leaf + directory key canary | EXECUTABLE |
| R11 hydration in a real browser | ARGUED (OWNER OV-2e) |
| R12 AST props + imports | EXECUTABLE |
| R12 visual fit in the host | ARGUED (OWNER OV-2h) |
| R13 named gates + AST no-DOM-HTML-sink | EXECUTABLE |

No criterion's pass condition is a RENDERED fact. Every mount/confirm/absence/
focus/theme claim is OWNER, named as such, never asserted machine-verified.

---

## 6. Findings routed out (each terminates where named)

- **W3-F-SIG (to the architect, before build).** Spec 5.2's `confirmSignature`
  construction (`selectionSignature` over the 4-tuple) is WRONG: `selectionSignature`
  sorts, so a subject/body swap collides and the banner would not disarm. The
  instrument and the implementation must use an order-PRESERVING `\x00`-delimited
  join. The AC-W3-4 leaf table's SWAP row (R4 / S4a) enforces this. Discovered by
  the section-0 satisfiability proof, not by reading. The architect either adopts
  the ordered join or states why a sorted signature is acceptable; either answer
  ends it. Not a blocker for the other 12 requirements.
- **Q-1 (owner fork, rides alongside).** Host-fork (a) fold into `MessageDraftsTab`
  vs (b) dedicated surface binds ONLY the single mount file `CanvasTab.tsx`
  (R10/R12 keep the panel zero-prop and host-independent, so an (a1) answer costs
  one file). W3 does NOT block on it. (a2) - a seeded "message the whole class"
  button - would add an optional prop to the panel; R12/S12a would then need its
  "optional params allowed" clause exercised. Flagged, not resolved.
- **W2 commit says 35 tests, file runs 17** (M-2). Unreconciled measurement
  conflict; I adopt the MEASURED 17 for the non-regression pin and report the
  conflict rather than either number silently.

---

## 7. Residual register (owner / instrument / step - missing any one is a deletion)

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| W3-R1 | Preview + shared-resolver edit land in W2's file; the 17 existing tests are the ONLY instrument that the send is unchanged | Test seat | `npx vitest run src/app/actions/bulk-course-message.test.ts` before and after, original titles unedited | W3 verify |
| W3-F-SIG | `confirmSignature` must be an ordered join, not `selectionSignature` | Architect, then implementer | R4 leaf SWAP row (S4a) | Before/at build |
| R-7 / DECISION-1 | Whether one POST to `course_<id>` fans out to N private conversations and an email arrives | Repo owner | A live authenticated Canvas-sandbox send of known size, then a test student's Inbox + mailbox (OV-1, OV-3) | Verify, before push |
| A-R2 | Review-time active count may differ from Canvas's expansion; copy says "lists", not "will reach" | Repo owner | Same sandbox send; compare messaged set to displayed count | Verify, with R-7 |
| R-5 | Whether `draftAnnouncementAction`'s voice suits a private class message | Repo owner | Read a real drafted message (OV-2g) | Post-deploy owner verification |
| W3-R4 | Panel heading level depends on the host | Accessibility seat | Read the chosen host's heading structure | W3 accessibility pass (reading claim; nothing renders) |
| W3-R5 | Contrast of success/warning/error notice tokens in both themes | Visual seat, then owner | Open BOTH theme definitions of each token, state the ratio; then OV-2f | W3 visual pass, then Verify |
| W3-R6 | Size/caps of the persisted per-course drafts map | Data/storage seat | Byte length of a realistic stored map | W3 data pass |

These need rows in `docs/BACKLOG.md` (the orchestrator owns that file under
concurrency); until filed they are not yet real (`DEV_LOOP.md` step 0).

---

## 8. What I could not determine

- Anything Canvas actually does (expansion, notification email): network blocked,
  no key. R-7 / A-R2.
- Anything rendered: confirm, absence, disabled button, notice tones, focus,
  heading levels - every such claim is a READING routed to an OV item.
- Whether a barrel export would widen server-action id exposure under this Next
  version (W3-R2 in the design) - D-2 omits the barrel, so moot unless (B) chosen.
- Why the W2 commit says 35 where the file runs 17 (section 6).
