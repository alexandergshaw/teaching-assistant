# Agnostic loop local verification

This record covers local CLI integration. Independent adversarial verification
and repository-wide gates are coordinator responsibilities; this record does
not substitute the implementer's observations for those reviews.

## Executed integration instruments

`npm run test:paths src/tools/agnostic-loop/conformance.test.ts` exited zero:
the tool reported 11 passing tests and duration 297.14 seconds. The complete
public CLI demonstration passed in that command, including accepted criteria,
design, plan, test design, implementation, actual Node gates, independent
criterion-bound verification, accepted final reports and local delivery. Its
separate owner example completed two defective substantive rounds, exact
owner-approved byte application and independent mechanical acceptance.
The command also passed actual two-process CAS, persisted replay, malformed
snapshot, identity/source integrity, missing criterion mapping, configuration
and environment changes, pause/budget, and controlled cancellation cases.
The later explicit third-review rejection assertion is checked by the final
coordinator regression run; this command predates that assertion's addition.

`npm run test:paths src/tools/agnostic-loop/mutation.test.ts` exited zero:
the tool reported one passing test and duration 92.54 seconds. The test executes
real subprocesses against an isolated runtime copy. It observes passing
self-review and stale-evidence baselines, a harmless comment control, failures
caused specifically by accepted self-review and stale evidence after disabling
those checks, restoration and final passing instruments. Its production-source
hash comparison passed. No deliberate mutation was applied to shared code.

`npx eslint src/tools/agnostic-loop/demo.ts
src/tools/agnostic-loop/conformance.test.ts
src/tools/agnostic-loop/mutation.test.ts` exited zero with no output.

The public CLI primary demo was separately executed with
`node --experimental-strip-types --experimental-default-type=module
--experimental-loader ./src/tools/backlog/resolve-ts-hook.ts
src/tools/agnostic-loop/cli.ts demo <isolated-directory>` and reported local
`shipped`, revision 93 and four captured gate evidence IDs. This execution
preceded addition of the owner-disposition demonstration and is not evidence
for that later branch; the final conformance command measures the complete demo.

## Coordinator execution record

`npm run test:paths src/tools/agnostic-loop` exited zero, reporting eight passing
files and 41 passing tests. This aggregate included the public CLI conformance
and isolated mutation instruments on a frozen runtime snapshot.

The later mechanical reserved-key completion changed only state dictionary
normalization and candidate/environment key admission. Its focused final runs
were `npm run test:paths src/tools/agnostic-loop/engine.test.ts` (19 passing tests)
and `npm run test:paths src/tools/agnostic-loop/candidate.test.ts` (four passing
tests), both exiting zero. They prove absent reserved references cannot mutate
inherited properties, reserved root filenames fail closed, and absent inherited
environment entries are ignored. The aggregate predates these defensive deltas.

`npm.cmd run loop -- demo <new-isolated-temporary-directory>` exited zero through
the installed package entry point. It reported local `shipped`, revision 114,
four real gate evidence records, rejected self-review and third substantive
review, and owner-disposed acceptance after two substantive rounds.

Pure and IO implementers independently reviewed each other's modules. A separate
integrated checker found operation overlap and acknowledged-result replay defects;
their targeted corrections passed its round-two delta review. Provider identity
and semantic judgment remain operator attestations.

Final `npx tsc --noEmit --incremental false` and
`npx eslint src/tools/agnostic-loop` both exited zero after the defensive completion.

`npm run test:paths src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts src/tools/backlog`
exited zero, reporting 22 passing files and 288 passing assertions, with every
requested path credited. `npm run backlog:check-generated` also exited zero.
The implementation backlog row was closed after its aggregate closure gate passed.
Verification covered the local engine and structural/backlog regressions; it did
not run the entire application test suite or a production deployment.

## Runtime boundaries

Local observations establish protocol behavior for honest operator-controlled
fixtures and tracked operations. They do not establish model quality, provider
identity, malicious-worker isolation or reliable descendant termination.
The cancellation fixture deliberately leaves a controlled delayed descendant;
it measures fencing and retained uncertainty rather than claiming cancellation
makes side effects safe. No component is rendered by these tests.
