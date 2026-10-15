# Historical work adoption, 2026-10-15

This index adopts the frozen inventory as historical evidence. It does not freshly
accept old designs, reset their rounds, authorize future features, or certify live
behavior. Current rows in [backlog.yml](backlog.yml) retain unfinished obligations.
The coordinator explicitly delegated this bookkeeping ledger to the adoption author.

The inventory is the 67 original untracked documents measured by
`git ls-files --others --exclude-standard docs` in
`.agnostic-loop/uncommitted-review-20261015/docs-review/inventory.json`.
Its SHA256 values bind the original reviewed bytes; the LMS file now intentionally
differs by the ruling transcription. This index itself was not in that inventory.
Each entry below records original SHA256, a sampled source reference with the
inventory hash, current row IDs (including related links added here), and dated
disposition. Full source-reference hashes and historical excerpts remain in that
frozen inventory. Hash collection is provenance, not semantic review of every line.

Round attribution is exact only where explicitly established below. Otherwise it
is **unknown**: shared-row excerpts can describe a sibling artifact and cannot
be assigned mechanically. Original accepted/defective rounds and residual owners
are preserved. A dated draft saying DRAFT or awaiting check does not undo a later
recorded disposition. Filename, document presence, or no current row never proves
shipping. Verification not explicitly established is **unknown**. No component is
rendered by this repository's tests; runtime, browser, model-quality and live-send
claims remain with their existing instruments and owners.

Shipping lineage below is limited to review.json commitEvidence rechecked with
`git merge-base --is-ancestor <sha> HEAD`, plus the named supersession commits
4197557f, 57c49b24, aedfa278, 0c849326 and 5986d90f checked by that same command.
It shows ancestry, not complete criterion discharge or a fresh passing gate.

The native repair evidence remains historical: broad verification and all-source
regression exited 124 at 1,200,000ms (docs/agnostic-loop-delay-rca.md:33-40;
review.md and priority-review.json). No bundle existence or this adoption turns
those failures into success. Later isolated repair bundles do not establish
canonical completion; AUTO-DISPATCH, DELAY-CONTROLS and CONTINUOUS stay open.

The three Tier-3 tab rows preserve section 10 R3 of the existing tab scope, with
coordinator ownership and per-wave instruments. This filing and its proposed
param names preserve the existing recommendation; they are not new feature work.

## [a37-not-attempted-action-scope.md](a37-not-attempted-action-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `9626f41bce3626cc7096fd95c4a63a65a248a43df4874253434465e372cf7ec5`.
- Current links: [A37](backlog.yml) (verification).
- Historical rounds: Recorded scope round 2 SHIP (row cites 17a122c3).
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/github.ts](../src/app/actions/github.ts) SHA256 `72edbe0bb3b1a7ff460ca886ea99892f4b8d896a5ceb22429b9d627ce0e7c2ce` (original inventory sample; verification beyond recorded review unknown).

## [a45-external-identity-corroboration-scope.md](a45-external-identity-corroboration-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `656ffd96d86970094c7833775dc969e969b2f5ae0e66b883f541fe3b992b4d88`.
- Current links: [A45](backlog.yml) (verification).
- Historical rounds: Recorded architecture round-2 CLEAN; distinct from earlier a45-scope activity.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading.ts](../src/app/actions/grading.ts) SHA256 `f8d50791bc00504792d1b8ddea60a1255741922442b7e68e5fc1145281a65e3a` (original inventory sample; verification beyond recorded review unknown).

## [agnostic-dispatch-repair-test-design.md](agnostic-dispatch-repair-test-design.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-13.
Historical failed-gate repair test-design contract. Prior native objective records independent acceptance; exact Markdown review round is unknown. Existing AUTO-DISPATCH remains unfinished; default-disabled activation ruling remains binding.

- Original SHA256: `fb9260e5cd6c9f5f3cf167c1a843c2550393eedd711ccf82c9ed3269afd5aacf`.
- Current links: [LLM-AGNOSTIC-AUTO-DISPATCH](backlog.yml) (actionable).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/tools/agnostic-loop/supervisor-repair-fixtures.ts](../src/tools/agnostic-loop/supervisor-repair-fixtures.ts) SHA256 `306e0f31a3519d1c4743d69cbfa2ce365b7cc704d5f8e0e17dba9472e9d3acd1` (original inventory sample; verification beyond recorded review unknown).

## [agnostic-loop-delay-rca.md](agnostic-loop-delay-rca.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-13.
Historical canonical-tree diagnosis. Its present-tense unbuilt/readiness wording describes drafting time, not later isolated implementation or current delivery. DELAY-CONTROLS and CONTINUOUS remain open; no old failed gate is cleared.

- Original SHA256: `bdce2b19479db0cdb9eee19e0ce09d8fc5a25866fff0f9d301feedbfff81c8c2`.
- Current links: [LLM-AGNOSTIC-DELAY-CONTROLS](backlog.yml) (actionable).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/tools/agnostic-loop/next-actions.ts](../src/tools/agnostic-loop/next-actions.ts) SHA256 `6014475805600596a4017ce35f4716dced9f710f29b6325755befd90e0445e27` (original inventory sample; verification beyond recorded review unknown).

## [agnostic-loop-gate-composition-brief.md](agnostic-loop-gate-composition-brief.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
Historical gate-composition brief; readiness proceeds independently was its drafting context. Later isolated bundles do not prove canonical completion or passing candidate-bound evidence.

- Original SHA256: `97207e95d066a9dc07f673babf13fe3ab585b3521502497ea953e9f5ef5ccac3`.
- Current links: [LLM-AGNOSTIC-DELAY-CONTROLS](backlog.yml) (actionable).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/tools/vitest-paths/cli.ts](../src/tools/vitest-paths/cli.ts) SHA256 `3041bfa80c0bcea201e1950f321f96c661b7a27dbe18cdf0dba7836a4fbc8aa8` (original inventory sample; verification beyond recorded review unknown).

## [bulk-zip-finish-scope.md](bulk-zip-finish-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Successor to bulk-zip-grading-scope.md for BW3/BW4; does not replace the separate oversize/visual-content scope or its residuals.

- Original SHA256: `f2cc9aef83e1a745a4158e8d952541cec1534e6d901b67cdfcc09ad7de0fdd59`.
- Current links: [BULK-ZIP](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-chat-intake.ts](../src/app/actions/grading-chat-intake.ts) SHA256 `fdf2b1b3fde833006a248ecaa1008bcecf14f2abbb56128468c4791cc1bb8df8` (original inventory sample; verification beyond recorded review unknown).

## [bulk-zip-grading-scope.md](bulk-zip-grading-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Predecessor broad bulk plan. bulk-zip-finish-scope.md consumes its remaining BW3/BW4, while bulk-zip-oversize-fit-scope.md reframes visual-content/budget work. Preserve remaining BULK-ZIP and PDF-DOCX obligations.

- Original SHA256: `7b5f12f002f9d1332efd6706f330f27faab56194c0d092ee772e8256ad9bebb7`.
- Current links: [ZIP-UPLOAD-LAG](backlog.yml) (verification); [BULK-ZIP](backlog.yml) (verification); [GITHUB-URL-TRAVERSAL](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-chat-intake.ts](../src/app/actions/grading-chat-intake.ts) SHA256 `fdf2b1b3fde833006a248ecaa1008bcecf14f2abbb56128468c4791cc1bb8df8` (original inventory sample; verification beyond recorded review unknown).

## [bulk-zip-oversize-fit-scope.md](bulk-zip-oversize-fit-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Preserve the explicit supersession of its earlier strip-base64 premise; the corrected visual-content requirement remains authoritative within this historic activity.

- Original SHA256: `a4cc01ec1970af1420ed490a59f5edd794a00fd090c208453c6d2764d0b6afaf`.
- Current links: [BULK-ZIP](backlog.yml) (verification); [PDF-DOCX-VISUALS-TO-GRADER](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-chat-intake.ts](../src/app/actions/grading-chat-intake.ts) SHA256 `fdf2b1b3fde833006a248ecaa1008bcecf14f2abbb56128468c4791cc1bb8df8` (original inventory sample; verification beyond recorded review unknown).

## [chat-grading-detailed-diagnostics-scope.md](chat-grading-detailed-diagnostics-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `280cd58875419fad629b701e4ca63f135fff33a42704cfc3fc0f8c6833cd20bd`.
- Current links: [GRADING-CHAT](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/account/diagnostics/SessionLogSection.tsx](../src/app/account/diagnostics/SessionLogSection.tsx) SHA256 `f4f1ae388219d313d3969d580edf06425f39e39d583a67be6f1c6e254ddc2e9a` (original inventory sample; verification beyond recorded review unknown).

## [composite-submission-scope.md](composite-submission-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `0d4b8063c6e4d6e7285fded766978b9af484683a9a6885a54860b238a503fec3`.
- Current links: [COMPOSITE-SUBMISSION](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `fda763f0`, `79ec4e44`, `f30c81f5` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/actions/grading-chat-intake.ts](../src/app/actions/grading-chat-intake.ts) SHA256 `fdf2b1b3fde833006a248ecaa1008bcecf14f2abbb56128468c4791cc1bb8df8` (original inventory sample; verification beyond recorded review unknown).

## [course-table-email-column-scope.md](course-table-email-column-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `e79d3a8e15174e9024b72abe3a66b073d6cdd9bfb5cb4a95ec6c23661028adae`.
- Current links: [COURSE-TABLE-EMAIL-COPY](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/syllabus-upload.preserves-columns.test.ts](../src/app/actions/syllabus-upload.preserves-columns.test.ts) SHA256 `5365934600248fdd314a213306d15e8fce16daeba378eae148833d5fd83a559d` (original inventory sample; verification beyond recorded review unknown).

## [decompress-cap-hardening-scope.md](decompress-cap-hardening-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `4d4626a7856405d86c6b1a710fb116255ad884c6ee6b27d08db65926cc2c69cc`.
- Current links: [MATERIALS-EXTRACT-DECOMPRESS-HOLE](backlog.yml) (verification); [NESTED-ZIP-SILENT-SKIP](backlog.yml) (verification); [UNCAPPED-PDF-RTF-PARSING](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/action-guard-coverage-github-cohort.test.ts](../src/app/actions/action-guard-coverage-github-cohort.test.ts) SHA256 `3be4b463b623342d78c0bcaddbb2f39f532020ab853d348907a8c2a75db50baf` (original inventory sample; verification beyond recorded review unknown).

## [fab-open-animation-scope.md](fab-open-animation-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `fd589f2130f8e0c2610bbaa8c27d93dc757e20d25dfbbf4147e1de750c683025`.
- Current links: no current row established; archival evidence only, completion unknown.
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `ea48ce67` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/components/AccessibilityCenter.tsx](../src/app/components/AccessibilityCenter.tsx) SHA256 `db12ec7f0f71b2c441632684df3c5d737790bce2caed5c08488e8aa3b886a817` (original inventory sample; verification beyond recorded review unknown).

## [g4-s2-reachability.md](g4-s2-reachability.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `c641ad8a5147e6ac945e497d182aa9b6ab6888ca58b173759ea72fdcd4406cbe`.
- Current links: [G4](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/discussion-replies.ts](../src/app/actions/discussion-replies.ts) SHA256 `7449da968e41a3a33e777dde6e66261f92c3a7cde4956a921af23de32d964814` (original inventory sample; verification beyond recorded review unknown).

## [grading-chat-consolidation-scope.md](grading-chat-consolidation-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `7e0839c5c135610c7e82d3027284f9466942a713fb90086d99f51d123659073c`.
- Current links: [CHAT-SUBMISSION-CONSOLIDATE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-submission-grade.test.ts](../src/app/actions/grading-submission-grade.test.ts) SHA256 `cfe2477352181f44f5fae8baf925e49a5c5116db5a12b8e9df41edf066706914` (original inventory sample; verification beyond recorded review unknown).

## [grading-chat-copyable-fields-brief.md](grading-chat-copyable-fields-brief.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `cd124a84cd972934faa15030717d3900c0f9773fa4d703fb4348c288ec93e714`.
- Current links: [GRADING-CHAT](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `630533d0` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/components/GithubSyncPanel.tsx](../src/app/components/GithubSyncPanel.tsx) SHA256 `ec7066de753d6f817fabe6e420a542062b8400dad9f4a951d5cb5290937057b6` (original inventory sample; verification beyond recorded review unknown).

## [grading-chat-deduction-controls-scope.md](grading-chat-deduction-controls-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `f9716f1261fe87842d809c0303f88ade81b6f00e3665e546abca29731484b8e6`.
- Current links: [GRADING-CHAT](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/api/grade-run-item/route.test.ts](../src/app/api/grade-run-item/route.test.ts) SHA256 `c3e7f33c2667371c3455efc0c3b4fc9265d4bace1e89d86fd924ed105da278f4` (original inventory sample; verification beyond recorded review unknown).

## [grading-diagnostics-coverage-scope.md](grading-diagnostics-coverage-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `2da3a1b0d4a23d635ee8211a2479864df5cc68ba813bb5eca6d79adef756249f`.
- Current links: [GRADING-DIAGNOSTICS-COVERAGE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/account/diagnostics/page.tsx](../src/app/account/diagnostics/page.tsx) SHA256 `84342ba6be8cb03f2b8151f560a054d8b7b433f311ea98fe0c30d6dc1d8bd7ce` (original inventory sample; verification beyond recorded review unknown).

## [infer-and-flag-submission-name-scope.md](infer-and-flag-submission-name-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `b1be83734747f4895d1de549b71768f1c7a7a1ab429a2783bfbcd258e76921e5`.
- Current links: [INFER-FLAG](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-chat-intake.ts](../src/app/actions/grading-chat-intake.ts) SHA256 `fdf2b1b3fde833006a248ecaa1008bcecf14f2abbb56128468c4791cc1bb8df8` (original inventory sample; verification beyond recorded review unknown).

## [large-single-file-upload-scope.md](large-single-file-upload-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `8320c8eac46a2cd74207cefbb82db91e8e0bb0ae8092c4ff8c3259e84863193d`.
- Current links: [GRADING-CHAT](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-chat-intake.ts](../src/app/actions/grading-chat-intake.ts) SHA256 `fdf2b1b3fde833006a248ecaa1008bcecf14f2abbb56128468c4791cc1bb8df8` (original inventory sample; verification beyond recorded review unknown).

## [live-lms-student-messaging-ledger.md](live-lms-student-messaging-ledger.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
D2 was resolved DURABLE by owner ruling 4197557f; W4 enabled send commit 57c49b24 supersedes conditional blocked-build wording. Preserve the ledger round-two acceptance and owned live walk/migration residuals.

- Original SHA256: `4f683187b3976f3c850556d8dce7f4e899c0275845a947699219e34040dbd54d`.
- Current links: [LIVE-LMS-STUDENT-MESSAGING](backlog.yml) (verification).
- Historical rounds: Ledger round 1 defective, delta round 2 SHIP (a54f60fd); do not reopen confirmed F-L1.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/api/cron/run-schedules/route.ts](../src/app/api/cron/run-schedules/route.ts) SHA256 `46ceafb10f87bc18cfbabc099e0a52f1a36e16e6623b207e08f926fbe723ca7c` (original inventory sample; verification beyond recorded review unknown).

## [live-lms-student-messaging-ops.md](live-lms-student-messaging-ops.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
Historical ops design; D2 durable ruling 4197557f and enabled W4 57c49b24 supersede conditional-send prerequisites. Ledger is its storage companion, not a replacement ops review.

- Original SHA256: `f04c08e64258ca8d3e864fa1f0e1690c14d117cccb13effd0f462ec0a0598241`.
- Current links: [LIVE-LMS-STUDENT-MESSAGING](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/action-guard-coverage.test.ts](../src/app/actions/action-guard-coverage.test.ts) SHA256 `184783a8a632cbc194747892c04eda934b4de3132f513a6d6a73b7a7ddc36ff5` (original inventory sample; verification beyond recorded review unknown).

## [live-lms-student-messaging-scope.md](live-lms-student-messaging-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Historical architecture; owner durable ruling 4197557f and enabled W4 57c49b24 supersede unresolved-build language. Current verification row retains live obligations.

- Original SHA256: `30bb6ac73d96cc5b6edfb655cbd43bc7e2a1d71ad6f4ab94e21dcbe38c969654`.
- Current links: [LIVE-LMS-STUDENT-MESSAGING](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/canvas-inbox.ts](../src/app/actions/canvas-inbox.ts) SHA256 `d8d1e10ba023129a25efb29a566f0ff051c1b3e0104f84f3986243101d7f82da` (original inventory sample; verification beyond recorded review unknown).

## [lms-connectivity-diagnostics-deep-scope.md](lms-connectivity-diagnostics-deep-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Later increment after robust-lms-diagnostics-scope.md; W1/W2 lineage does not certify all future probe waves or live Canvas reachability.

- Original SHA256: `6e54b7da3886cc58695f8ce5d25acf3609d9312ad7dc95dc78dc74e2e650749f`.
- Current links: [GRADING-CHAT](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `8a5ec9e6`, `8aac8c88`, `c9646acd` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/account/diagnostics/connectivity-actions.test.ts](../src/app/account/diagnostics/connectivity-actions.test.ts) SHA256 `618a5f8462188a017f060ba32d26c6e90d761db5f6eddf1cb5223a302a1d886f` (original inventory sample; verification beyond recorded review unknown).

## [lms-meta-override-offer-scope.md](lms-meta-override-offer-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `38b95f2b538a33ce0a795c116389d1eb3140897ca5700e4184595252dbd9fe54`.
- Current links: [LMS-META-OVERRIDE-OFFER](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading.ts](../src/app/actions/grading.ts) SHA256 `f8d50791bc00504792d1b8ddea60a1255741922442b7e68e5fc1145281a65e3a` (original inventory sample; verification beyond recorded review unknown).

## [lms-modules-loading-indicator-scope.md](lms-modules-loading-indicator-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `7cd016606af20c0e26e07e132aad898a55d61679540cf8de3e0c8485866362b0`.
- Current links: [GRADING-CHAT](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `6977493c` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/actions/github-repos.ts](../src/app/actions/github-repos.ts) SHA256 `c55eaf1b564ea7647e74ace7839e6a5709f07b09879b6ca7f8e23f5a46e4d973` (original inventory sample; verification beyond recorded review unknown).

## [lms-picker-dropdown-indication-scope.md](lms-picker-dropdown-indication-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-15.
Known original round-two DEFECTIVE credential-origin claim is superseded by the prominent 2026-10-15 transcription banner; 5986d90f implemented the already recorded three-source ruling. No third design round.

- Original SHA256: `357b490e5373694aace367ca20311ce339726a624036841f82acc1b3d22a77bf`.
- Current links: [LMS-PICKER-DROPDOWN-INDICATION](backlog.yml) (verification).
- Historical rounds: Recorded original round 2 DEFECTIVE; accepted transcription remedy, not another check round.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading.ts](../src/app/actions/grading.ts) SHA256 `f8d50791bc00504792d1b8ddea60a1255741922442b7e68e5fc1145281a65e3a` (original inventory sample; verification beyond recorded review unknown).

## [lms-submissions-zip-intake-scope.md](lms-submissions-zip-intake-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `c131e0679469801a8c270d385589a583ad94087596f56e132474112ec020535e`.
- Current links: [LMS-SUBMISSIONS-ZIP-INTAKE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/canvas-inbox.ts](../src/app/actions/canvas-inbox.ts) SHA256 `d8d1e10ba023129a25efb29a566f0ff051c1b3e0104f84f3986243101d7f82da` (original inventory sample; verification beyond recorded review unknown).

## [n15-one-upload-per-student-scope.md](n15-one-upload-per-student-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `46f9cb883e30b2527537c82fcb3f9350ffea839127a5f5b87a7ea00b73e93c6a`.
- Current links: [N15a](backlog.yml) (verification).
- Historical rounds: Recorded round-2 CLEAN.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/action-guard-coverage-github-cohort.test.ts](../src/app/actions/action-guard-coverage-github-cohort.test.ts) SHA256 `3be4b463b623342d78c0bcaddbb2f39f532020ab853d348907a8c2a75db50baf` (original inventory sample; verification beyond recorded review unknown).

## [parsereporef-traversal-scope.md](parsereporef-traversal-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `4271e1333b58ca6eb4980c0146d08a54a12fe810c36a22af94e326c46b25d6db`.
- Current links: [PARSEREPOREF-TRAVERSAL](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/github-content.ts](../src/app/actions/github-content.ts) SHA256 `4cdde1466ef3e41eda9a182922db64d4c865c73e928a3d6ce91b83d057140411` (original inventory sample; verification beyond recorded review unknown).

## [ppt-design-into-presentations-scope.md](ppt-design-into-presentations-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `d35ec7f3bf0047a07fd93969d1dbd0c36fec40fe16e1b620bb84f3ebe81d08d4`.
- Current links: [PPT-TEMPLATE-UPLOAD-PLACE](backlog.yml) (verification); [PPT-DESIGN-INTO-PRESENTATIONS](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/components/home/useAppNavigation.test.ts](../src/app/components/home/useAppNavigation.test.ts) SHA256 `d5c18b16708091d99f27479bf3f48de40f42d828ef67c0dadba8fa30f08c30c0` (original inventory sample; verification beyond recorded review unknown).

## [ppt-template-upload-place-scope.md](ppt-template-upload-place-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `b7bedc8621cac17e945263879f7eab267732e0d82c8c6cd5e9f3e2e76281e909`.
- Current links: [PPT-TEMPLATE-UPLOAD-PLACE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/deck-template-files.test.ts](../src/app/actions/deck-template-files.test.ts) SHA256 `38592d56a718252da2d7e2973fea108e6e3055c2d0931da88d587ae0f672eda4` (original inventory sample; verification beyond recorded review unknown).

## [ppt-template-upload-security.md](ppt-template-upload-security.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `07399e6147dfa737b8ae0441b6eeed4f54a646aef2b532260957f88929bae1eb`.
- Current links: [PPT-TEMPLATE-UPLOAD-PLACE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/deck-template-files.test.ts](../src/app/actions/deck-template-files.test.ts) SHA256 `38592d56a718252da2d7e2973fea108e6e3055c2d0931da88d587ae0f672eda4` (original inventory sample; verification beyond recorded review unknown).

## [presentations-pipeline-regen-subview-scope.md](presentations-pipeline-regen-subview-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `62dfcb3777a06ac70b80f071cc7da87ce7608040fbfffa27af7ace13c36b9a5b`.
- Current links: [PPT-TEMPLATE-UPLOAD-PLACE](backlog.yml) (verification); [PRESENTATIONS-PIPELINE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/api/presentations/pipeline/route.test.ts](../src/app/api/presentations/pipeline/route.test.ts) SHA256 `e9302f6e55f88f3cf317acbe700d213da241eca76c5b63e0aa266195be544e3c` (original inventory sample; verification beyond recorded review unknown).

## [presentations-pipeline-scope.md](presentations-pipeline-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `02139545a637be11a565493a6c19875db0eff897190752c362054717b5b3261f`.
- Current links: [PPT-TEMPLATE-UPLOAD-PLACE](backlog.yml) (verification); [PRESENTATIONS-PIPELINE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/api/presentations/pipeline/route.test.ts](../src/app/api/presentations/pipeline/route.test.ts) SHA256 `e9302f6e55f88f3cf317acbe700d213da241eca76c5b63e0aa266195be544e3c` (original inventory sample; verification beyond recorded review unknown).

## [presentations-template-dropzone-scope.md](presentations-template-dropzone-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Predecessor Reading B. presentations-template-ooxml-scope.md Reading A explicitly supersedes it; do not build Reading B merely because this older file remains.

- Original SHA256: `fe7a46405447ba9bdd74fcd73e8cc5093a73b5211dd7f8e9a16ed78d5b0af592`.
- Current links: [PPT-TEMPLATE-UPLOAD-PLACE](backlog.yml) (verification); [PRESENTATIONS-TEMPLATE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/api/presentations/generate/route.ts](../src/app/api/presentations/generate/route.ts) SHA256 `a4e88e0efd8f6ab42eba037271b8a095de36477115532e39e5cd8ae05e909432` (original inventory sample; verification beyond recorded review unknown).

## [presentations-template-ooxml-scope.md](presentations-template-ooxml-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Successor Reading A supersedes dropzone Reading B. Keep both as lineage, with PRESENTATIONS-TEMPLATE residuals still owned.

- Original SHA256: `d0e7d2c1f32d0a24abd6497e0ef85be12f8f061117bf47f4be4c6cfbddfea4c2`.
- Current links: [PPT-TEMPLATE-UPLOAD-PLACE](backlog.yml) (verification); [PRESENTATIONS-TEMPLATE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/deck-template-files.test.ts](../src/app/actions/deck-template-files.test.ts) SHA256 `38592d56a718252da2d7e2973fea108e6e3055c2d0931da88d587ae0f672eda4` (original inventory sample; verification beyond recorded review unknown).

## [recording-one-vs-many-scope.md](recording-one-vs-many-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Historical default-off/build prerequisite statements are superseded by enabled commit 0c849326. RECORDING_SPLIT_ENABLED is true in current constants.ts; subsequent analyzing-indicator scope fixes status precedence.

- Original SHA256: `c944187b984780e3297373136827c9c1d865389eba0c97d7ebcdc4032d357070`.
- Current links: [GRADING-CHAT](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-chat-intake.ts](../src/app/actions/grading-chat-intake.ts) SHA256 `fdf2b1b3fde833006a248ecaa1008bcecf14f2abbb56128468c4791cc1bb8df8` (original inventory sample; verification beyond recorded review unknown).

## [recording-split-analyzing-indicator-scope.md](recording-split-analyzing-indicator-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Historical default-off premise is stale: 0c849326 enabled recording split. 7aa0f13b shipped classify/analyze status precedence (runStatus.ts). Keep GRADING-CHAT residuals; do not flip flags from this draft.

- Original SHA256: `f928abe80c11acad41a8a1eba306a7bb215321faac0211789a403a3ae0522cfd`.
- Current links: [GRADING-CHAT](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `7aa0f13b`, `0c849326` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/components/grading-chat/GradingChatPanel.structure.test.ts](../src/app/components/grading-chat/GradingChatPanel.structure.test.ts) SHA256 `996cde48fca7faf23283e9aa977252c02cfc6374a76041ae516bad4bfbb57ef8` (original inventory sample; verification beyond recorded review unknown).

## [ref-dotsegment-sweep-scope.md](ref-dotsegment-sweep-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `dde9c3d8443dfdf41d6e157bb9af2d5072955157f14de98d46e015a6dda8c833`.
- Current links: [REF-DOTSEGMENT-SWEEP](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/github-content.ts](../src/app/actions/github-content.ts) SHA256 `4cdde1466ef3e41eda9a182922db64d4c865c73e928a3d6ce91b83d057140411` (original inventory sample; verification beyond recorded review unknown).

## [repo-grades-branch-merge-check-scope.md](repo-grades-branch-merge-check-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Original empty-only merge-detection baseline. Later merge-detection-diagnosis, merge-detection-fix, and no-submission-graded artifacts refine/supersede that baseline; do not restore the original limitation.

- Original SHA256: `74615b4adf74fec1fd43693b03eb2e1cc0aaf2728ebf3e5ed914602beb073109`.
- Current links: [REPO-GRADES-BRANCH-MERGE-CHECK](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/github-repos.branch-merge-check.test.ts](../src/app/actions/github-repos.branch-merge-check.test.ts) SHA256 `6747766ae1e9a3530c121c0e941cd26f3b58b2872e7796b1a520e46e5662bd94` (original inventory sample; verification beyond recorded review unknown).

## [repo-grades-header-controls-inline-scope.md](repo-grades-header-controls-inline-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `60aa174747591e907cf179ce44e8d5c984573428979fc33252d86c87a0fb9b5a`.
- Current links: no current row established; archival evidence only, completion unknown.
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `bdd4228d` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/components/courses/page-module-css-orphan-classes.test.ts](../src/app/components/courses/page-module-css-orphan-classes.test.ts) SHA256 `d6629ab81b3d0bc624b0746fd78ce99adb15e6da8853fa6654809b78646eaf74` (original inventory sample; verification beyond recorded review unknown).

## [repo-grades-header-setup-visual-pass-scope.md](repo-grades-header-setup-visual-pass-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `4ad4c48c2ec268d07dafb7bd3cd094b5ab6c53fb920419e9244418ed2547dfc3`.
- Current links: [REPO-GRADER-TABLE-HEADER-COMPACT](backlog.yml) (verification); [RUBRIC-GRADER-REDUNDANT-PORTION](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/components/repo-grades/index.tsx](../src/app/components/repo-grades/index.tsx) SHA256 `135b1e5c8375172bb4103fc5e4db09b8bc549dce634dd2f91fc7ca631f097c17` (original inventory sample; verification beyond recorded review unknown).

## [repo-grades-merge-detection-diagnosis.md](repo-grades-merge-detection-diagnosis.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
Historical investigation explaining the original empty-only baseline; subsequent merge-detection-fix and no-submission-graded scopes are the successors.

- Original SHA256: `3f204f72c94123876e12075e7f42e11713f9b14cd789e93476dfab74123dc4b0`.
- Current links: no current row established; archival evidence only, completion unknown.
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `4022f857`, `f1a8aaee` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/actions/github-repos.ts](../src/app/actions/github-repos.ts) SHA256 `c55eaf1b564ea7647e74ace7839e6a5709f07b09879b6ca7f8e23f5a46e4d973` (original inventory sample; verification beyond recorded review unknown).

## [repo-grades-merge-detection-fix-scope.md](repo-grades-merge-detection-fix-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Successor to original branch-merge-check and its diagnosis. no-submission-graded-scope.md then adds comment/graded-zero outcome semantics.

- Original SHA256: `237a2965dd4bda4adb2fb51d0593c0cf8cdfeba3c6468a90ec5e064a6fa1c012`.
- Current links: no current row established; archival evidence only, completion unknown.
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `4022f857`, `f1a8aaee` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/actions/github-repos.branch-merge-check.test.ts](../src/app/actions/github-repos.branch-merge-check.test.ts) SHA256 `6747766ae1e9a3530c121c0e941cd26f3b58b2872e7796b1a520e46e5662bd94` (original inventory sample; verification beyond recorded review unknown).

## [repo-grades-module-picker-header-scope.md](repo-grades-module-picker-header-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `16efb773aa225467ae0f325388fd57a8bd6feea174cae93a874df90f4545711c`.
- Current links: [REPO-GRADES-MODULE-PICKER-HEADER](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/components/repo-grades/index.tsx](../src/app/components/repo-grades/index.tsx) SHA256 `135b1e5c8375172bb4103fc5e4db09b8bc549dce634dd2f91fc7ca631f097c17` (original inventory sample; verification beyond recorded review unknown).

## [repo-grades-no-submission-graded-scope.md](repo-grades-no-submission-graded-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Later successor for branch-merge comment and genuine-absence grading outcomes; retain original branch-detection artifacts as historical baselines.

- Original SHA256: `0cdf2ea49d500bf59df35b0ab8cc665bfc20a6f1de13fa8fbcc9ae57ba00945b`.
- Current links: no current row established; archival evidence only, completion unknown.
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `3a0efe08` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/actions/github-repos.branch-merge-check.test.ts](../src/app/actions/github-repos.branch-merge-check.test.ts) SHA256 `6747766ae1e9a3530c121c0e941cd26f3b58b2872e7796b1a520e46e5662bd94` (original inventory sample; verification beyond recorded review unknown).

## [repo-grades-status-prominence-scope.md](repo-grades-status-prominence-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `41b235a5c25da699897fd65856b773b86d62ebb9ab03197863c1071676bd3a7c`.
- Current links: [REPO-GRADES-STATUS-PROMINENCE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/components/repo-grades/index.tsx](../src/app/components/repo-grades/index.tsx) SHA256 `135b1e5c8375172bb4103fc5e4db09b8bc549dce634dd2f91fc7ca631f097c17` (original inventory sample; verification beyond recorded review unknown).

## [repo-grades-table-header-cleanup-scope.md](repo-grades-table-header-cleanup-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `d1402e8ec06bdb365a5076ecf112548c2a6f48527ceeea6d7a7dc6685cd70f1c`.
- Current links: no current row established; archival evidence only, completion unknown.
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `3b2aa7a4` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/api/classify-recording/route.test.ts](../src/app/api/classify-recording/route.test.ts) SHA256 `70c796970fdd162b5c8819e23afa8e4dce48b4a6ec554b433d1a00e65251d2f5` (original inventory sample; verification beyond recorded review unknown).

## [repo-grades-target-branch-default-main-scope.md](repo-grades-target-branch-default-main-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `5bfad6750ba0dcc28bdd021f732d83f214370a26fddcb9dc815a19e8e98e8b23`.
- Current links: no current row established; archival evidence only, completion unknown.
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `eb870577`, `0183cf74` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/components/repo-grades/index.tsx](../src/app/components/repo-grades/index.tsx) SHA256 `135b1e5c8375172bb4103fc5e4db09b8bc549dce634dd2f91fc7ca631f097c17` (original inventory sample; verification beyond recorded review unknown).

## [repo-grading-remove-activity-log-scope.md](repo-grading-remove-activity-log-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `7c3d8c35acb570a14f5abb3ba23029eccadfe316e68bcb32775ba040baf2d5f2`.
- Current links: [REPO-GRADING-REMOVE-ACTIVITY-LOG](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/components/repo-grades/index.tsx](../src/app/components/repo-grades/index.tsx) SHA256 `135b1e5c8375172bb4103fc5e4db09b8bc549dce634dd2f91fc7ca631f097c17` (original inventory sample; verification beyond recorded review unknown).

## [res-fill-11-edit-persistence-scope.md](res-fill-11-edit-persistence-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `d32f2375995dcb20598cd2cb3c0e022c11bc2a4cad82a1a9eed2c1f1c82b64e4`.
- Current links: [RES-FILL-11](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `8158554e` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/components/grading-results/gradingResultsHelpersEditState.test.ts](../src/app/components/grading-results/gradingResultsHelpersEditState.test.ts) SHA256 `7145a176c83d76bb39576011ac5a71a00eed988db0a9d59d1a9fa9254d3096c5` (original inventory sample; verification beyond recorded review unknown).

## [res-fill-4-class-trends-scope.md](res-fill-4-class-trends-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
Historical measured non-defect recommendation, not a new fix. Current RES-FILL-4 row remains the disposition authority; adoption does not silently delete it.

- Original SHA256: `b73e5e120b71e815caf0cfdaa86c95ee05ce661aaa053d7e671cfe6ed79833f7`.
- Current links: [RES-FILL-4](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/components/grading-recording/classTrendsRunCohort.test.ts](../src/app/components/grading-recording/classTrendsRunCohort.test.ts) SHA256 `115d1e0762d4ba8929cacb80573f63515197e1334b423075094dad8f32bd1f8f` (original inventory sample; verification beyond recorded review unknown).

## [resume-generator-fix-scope.md](resume-generator-fix-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Out-of-repository diagnosis disproving an owning resume feature in this tree. No backlog feature row and no shipping commit claimed; no resume feature is authorized.

- Original SHA256: `7f4ed130adcd87c93fdc8e74e3d1ab46ea11395cdc66f56c89b107c31b524398`.
- Current links: no current row established; archival evidence only, completion unknown.
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/shared.ts](../src/app/actions/shared.ts) SHA256 `5f9b7b1537ed79557739da299f7d3cdcd90bd18dbe40ecf72137859221f4626d` (original inventory sample; verification beyond recorded review unknown).

## [robust-lms-diagnostics-scope.md](robust-lms-diagnostics-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Predecessor diagnostic increment; lms-connectivity-diagnostics-deep-scope.md adds later detail. Improved failure diagnostics do not establish that external hosts answer.

- Original SHA256: `328534b1b6f3a88953cf3bab8d2e2bb79de622a518a108a4bbda21a16ad65584`.
- Current links: [GRADING-CHAT](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions.ts](../src/app/actions.ts) SHA256 `7767d166440c7724a354f4053756f8fa37dc74d025291ca38e181c79f98fc18f` (original inventory sample; verification beyond recorded review unknown).

## [same-stem-collision-amnesty-scope.md](same-stem-collision-amnesty-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-12.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `96f715e061752176bcd38093ea0e671d69bea5af4e89ba321eb38fba5b4f9601`.
- Current links: [A45](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `8c3b1d30` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/actions/grading.ts](../src/app/actions/grading.ts) SHA256 `f8d50791bc00504792d1b8ddea60a1255741922442b7e68e5fc1145281a65e3a` (original inventory sample; verification beyond recorded review unknown).

## [submission-labels-scope.md](submission-labels-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `e9d619da1a4f3fbf5bef983095ac892efd4a6d9a8ece97c1cb516966b1473624`.
- Current links: [SUBMISSION-LABELS](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/action-guard-coverage-github-cohort.test.ts](../src/app/actions/action-guard-coverage-github-cohort.test.ts) SHA256 `3be4b463b623342d78c0bcaddbb2f39f532020ab853d348907a8c2a75db50baf` (original inventory sample; verification beyond recorded review unknown).

## [tabs-ctrl-click-new-browser-tab-scope.md](tabs-ctrl-click-new-browser-tab-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
a8a98bd3 shipped primary Wave 1 only. Section 10 R3 inner-strip waves 2/3/4 are now separately filed; this adoption implements none. Native new-tab/focus/keyboard behavior still needs owner browser walk.

- Original SHA256: `1a17a9c25f522107b94bebdea22d0d6989eabbc303430a93f434f2303fe82a23`.
- Current links: [TABS-CTRL-RECORDING](backlog.yml) (actionable); [TABS-CTRL-VERSION-CONTROL](backlog.yml) (actionable); [TABS-CTRL-FILES](backlog.yml) (actionable).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: `a8a98bd3` (ancestor check above); current verification remains with linked rows.
- Source provenance: [src/app/actions/action-guard-coverage.test.ts](../src/app/actions/action-guard-coverage.test.ts) SHA256 `184783a8a632cbc194747892c04eda934b4de3132f513a6d6a73b7a7ddc36ff5` (original inventory sample; verification beyond recorded review unknown).

## [tools-ia-reorg-scope.md](tools-ia-reorg-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `c304427156c55e462697d007e26d8227fe730eeeedec5b4582332fd4ce2d3acc`.
- Current links: [TOOLS-IA-REORG](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/components/home/useAppNavigation.ts](../src/app/components/home/useAppNavigation.ts) SHA256 `8fdb169ea50b93c28ff850c1cd793d16809050f1face5ff56e541621e08c5b63` (original inventory sample; verification beyond recorded review unknown).

## [video-grading-chat-intake-ops.md](video-grading-chat-intake-ops.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: draft date unknown.
Historical dark-build/activation wording superseded by W4 enabled commit aedfa278. Upload-limit and live provider/browser evidence remain separate owner obligations.

- Original SHA256: `d405d899c3f913255967b7c283d21a148af304a432ff76ad51175b80f6566d03`.
- Current links: [VIDEO-GRADING-CHAT-INTAKE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-chat-intake.ts](../src/app/actions/grading-chat-intake.ts) SHA256 `fdf2b1b3fde833006a248ecaa1008bcecf14f2abbb56128468c4791cc1bb8df8` (original inventory sample; verification beyond recorded review unknown).

## [video-grading-chat-intake-scope.md](video-grading-chat-intake-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Historical architecture consumed by ops companion and enabled W4 aedfa278; do not reopen resolved owner activation choice or infer live runtime evidence.

- Original SHA256: `21102a8ff72ad05c5ab408358d6e5716b1ef5bdcaf0ea698f49bf82c7772f8d9`.
- Current links: [VIDEO-GRADING-CHAT-INTAKE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/github-repos.ts](../src/app/actions/github-repos.ts) SHA256 `c55eaf1b564ea7647e74ace7839e6a5709f07b09879b6ca7f8e23f5a46e4d973` (original inventory sample; verification beyond recorded review unknown).

## [walkthrough-mimic-chat-scope.md](walkthrough-mimic-chat-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `04dff0915c97ddc57f09b5860a7e4b5e143b4527159c69c3ea977f24caceae67`.
- Current links: [WALKTHROUGH-MIMIC-CHAT](backlog.yml) (verification).
- Historical rounds: Recorded scope round 2 SHIP and verify PASS (5dce4d38).
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/components/courses/page-module-css-classes.test.ts](../src/app/components/courses/page-module-css-classes.test.ts) SHA256 `ae5866c23b5561a8dd38ebb650318a010982c82926c71c59d29422b04da3a931` (original inventory sample; verification beyond recorded review unknown).

## [workflowref-dotsegment-scope.md](workflowref-dotsegment-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `20d220e66ab2ab20423e1d5b9aa7924cb871764026940c9103220db453fc6c4d`.
- Current links: [WORKFLOWREF-DOTSEGMENT](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/github-repos.ts](../src/app/actions/github-repos.ts) SHA256 `c55eaf1b564ea7647e74ace7839e6a5709f07b09879b6ca7f8e23f5a46e4d973` (original inventory sample; verification beyond recorded review unknown).

## [workflows-collapse-ia-scope.md](workflows-collapse-ia-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `560d810ef04c07bc201840bf3c22ec291608d6c271a171eb8f5e7a2ea2af2349`.
- Current links: [WORKFLOWS-COLLAPSE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/action-guard-coverage.test.ts](../src/app/actions/action-guard-coverage.test.ts) SHA256 `184783a8a632cbc194747892c04eda934b4de3132f513a6d6a73b7a7ddc36ff5` (original inventory sample; verification beyond recorded review unknown).

## [zip-bomb-caps-scope.md](zip-bomb-caps-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `204eae12715fe22d4d068cd7345d0d568093027277e581060cc4aad2aa70868e`.
- Current links: [ZIP-BOMB-CAPS](backlog.yml) (verification); [GUARD-TESTGEMINI-ACTION](backlog.yml) (verification); [MATERIALS-EXTRACT-DECOMPRESS-HOLE](backlog.yml) (verification); [NESTED-ZIP-SILENT-SKIP](backlog.yml) (verification); [UNCAPPED-PDF-RTF-PARSING](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-incremental.zip-caps.test.ts](../src/app/actions/grading-incremental.zip-caps.test.ts) SHA256 `a99e13d242fff2c649f49b98b561ab5cd8fb2def5b2e5e5e6c9ac4c6896804ed` (original inventory sample; verification beyond recorded review unknown).

## [zip-class-vs-single-scope.md](zip-class-vs-single-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-11.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `7453a8cfa89c35aeb9f2757d9df69a5686d4fed39f35e4f2f90802aa809ef37b`.
- Current links: [ZIP-CLASS-OR-SINGLE](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-chat-intake.ts](../src/app/actions/grading-chat-intake.ts) SHA256 `fdf2b1b3fde833006a248ecaa1008bcecf14f2abbb56128468c4791cc1bb8df8` (original inventory sample; verification beyond recorded review unknown).

## [zip-upload-lag-scope.md](zip-upload-lag-scope.md)

Historical disposition recorded 2026-10-15; first date mentioned in draft: 2026-10-08.
Retain as historical scope/investigation evidence. Current row dispositions and their residuals govern further work; this adoption does not certify every planned wave.

- Original SHA256: `551b1409f4d75f06be835cd6e70423ee8cf1751d2039f97c5df03e521cb61134`.
- Current links: [ZIP-UPLOAD-LAG](backlog.yml) (verification).
- Historical rounds: exact artifact-specific round unknown; preserve inventory excerpts without assigning sibling rounds.
- Shipping lineage: not established per-document by this adoption; unknown, not inferred from title or filename.
- Source provenance: [src/app/actions/grading-chat-intake.ts](../src/app/actions/grading-chat-intake.ts) SHA256 `fdf2b1b3fde833006a248ecaa1008bcecf14f2abbb56128468c4791cc1bb8df8` (original inventory sample; verification beyond recorded review unknown).

