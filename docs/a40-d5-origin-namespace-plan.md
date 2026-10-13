# A40-D5 build plan and test notes

Status: implementation brief for independent plan check. Consumes accepted
`docs/a40-d5-origin-namespace-recon.md` round-2 scope; scope is finished.
This activity does not change runtime namespaces, stored values, restoration,
disclosure wording, SQL types or save-memory API contracts.

## One bounded implementation wave

Implement together so the new shared type leaf has its real callers immediately:

| Owned path | Change |
|---|---|
| `src/lib/grade/rubric-origin-scope.ts` | Export branded origin, excluded-origin storage-scope type and identity constructor. The constructor's sole cast establishes the brand; it does not transform the string or attach runtime properties. |
| `src/lib/grade/rubric-origin.ts` | Return branded-or-null from the existing resolver branches, retaining their order and their exact selected values. Display APIs continue accepting ordinary strings. |
| `src/lib/grade/rubric-memory.ts` | Apply excluded-origin storage-scope type to `loadRubricMemory`'s scope parameter only. Preserve body, return type, empty-scope guard, exact-match and newest-entry fallback. |
| `src/lib/cartridge-drops.ts` | Brand nullable domain origin and upload metadata. Brand the raw string at DB-to-domain mapping, preserving null and every string exactly. Keep SQL-facing generated types unchanged. |
| `src/lib/cartridge-drops.origin.test.ts` | Construct typed metadata with the real identity constructor, including literal overrides. Keep raw echoed DB rows, expected persisted strings, null cases and disclosure oracles unchanged. |
| `src/app/components/grading-chat/chatSetupMemory.ts` | Apply the same excluded-origin storage-scope type to `loadChatSetupMemory`'s input; keep forwarding and other API contracts unchanged. |
| `src/app/components/grading-chat/chatSetupMemory.test.ts` | Adopt existing ordinary-string/restoration/key regressions and add only runtime preservation cases missing from their current oracle. |
| `src/lib/grade/rubric-origin-namespace.test.ts` | Add actual-import compiler instruments, production-source host mutations and identity-preservation controls. |

No other production write is assigned. If an additional caller actually needs an
edit, report its exact incompatible call and stop that edit for a bounded ownership
decision; do not widen the guard or cast the caller to suppress the diagnostic.

## Caller adoption and unchanged behavior

Compile these checked-safe callers through the actual project configuration:
`CartridgeDropPanel.tsx`, `GradingTab.tsx`,
`snapshot-grading/SnapshotGradingPanel.tsx`,
`grading-recording/grading-rubric-memory.ts`, and
`grading-chat/GradingChatPanel.tsx`, all beneath `src/app/components/`.
They already separate computed storage scopes from persisted origin or accept
ordinary scope strings. The shared leaf must not require branding those strings.

Use existing literal oracles in `src/lib/grade/rubric-origin.test.ts`,
`src/lib/grade/rubric-memory.test.ts`, `src/lib/cartridge-drops.origin.test.ts`,
and `src/lib/grade/rubricProvenance.test.ts`. Preserve restored-source precedence,
sniffed upload attribution, current-scope fallback, no-rubric guard, unknown origin,
storage-key isolation and fallback labeling. Exercise identity preservation for
upload/cartridge strings, unknown namespaces, whitespace, empty string, and nullable
DB mapping. Empty restored-origin strings must remain empty where the old resolver
returned them; do not silently convert them to null.

## Actual compiler instrument

Load `tsconfig.json` using installed TypeScript config APIs, with project-root
resolution, `strict` retained, `incremental:false` and `noEmit:true`. A virtual
fixture is supplied by a custom compiler host; normal module resolution reads
actual production imports and declarations. Use a fresh host and program for every
control so neither source-file nor diagnostic caches mask a mutation.

Import the real shared loader, chat wrapper, origin constructor/resolver,
`CartridgeDrop` and generated database row type. Do not declare duplicate API or
brand types in the fixture. Locate fixture call expressions with the TypeScript
AST and attribute diagnostics to their source positions.

Good fixtures must compile without relevant or unrelated diagnostics:

- Ordinary blank/upload/cartridge scopes at the shared loader.
- A real `deriveChatScope` result at the chat wrapper.
- Actual constructor/resolver results through upload metadata/domain contracts.
- A null-guarded domain origin deliberately widened to `string`, and raw generated
  DB origin strings after a null guard. These are positive limitation controls.

Bad fixtures directly pass each actual branded constructor result, non-null
resolver result and null-guarded `CartridgeDrop.rubricOriginScope` to both reader
APIs. Require the argument-compatibility diagnostic at each intended call; in the
installed compiler sketch this was TS2345. Missing imports, syntax errors or
unrelated project failures fail the instrument rather than satisfying rejection.
Run good and bad fixtures independently so incidental errors cannot hide a lost
boundary. Vitest transpilation alone is not this compiler instrument.

## Red, green and isolated mutation controls

Before changing production signatures, demonstrate the new rejection instrument
failing against their current ordinary-string inputs for the intended missing
diagnostic. If the new constructor/domain type does not exist yet, stage the new
leaf and consumer type wiring first; a missing import is never valid red evidence.
Then apply both reader parameter types and require the same instrument to pass.

For the mutation proof, intercept the actual production source in the compiler host:

- Locate exported `loadRubricMemory` and its `scope` parameter type using the AST;
  replace that type range with `string` in the host only. The shared-reader
  branded-input diagnostic must disappear, failing its normal rejection assertion.
- Separately replace `loadChatSetupMemory`'s scope parameter type with `string`
  in its host source. The wrapper's own direct-origin rejection must disappear;
  the shared loader remains protected, demonstrating why the wrapper belongs in
  the boundary.

Baseline and a harmless appended source comment must pass. Each mutant must fail
because its intended diagnostic is absent, not because of syntax, resolution or
setup errors. Restore original host bytes and require the same baseline to pass.
Compare actual loader/wrapper disk hashes before and after; they must be unchanged.
Never mutate the shared working tree, add `@ts-expect-error` to mask the oracle,
or repair metadata fixtures through brand casts or new broad `any` assertions.

## Gates and report

Run the new compiler instrument and owned/adopted behavior tests with:

```powershell
npm run test:paths src/lib/grade/rubric-origin-namespace.test.ts src/lib/grade/rubric-origin.test.ts src/lib/grade/rubric-memory.test.ts src/lib/cartridge-drops.origin.test.ts src/lib/grade/rubricProvenance.test.ts src/app/components/grading-chat/chatSetupMemory.test.ts
```

Run adopted wiring/regression paths through `npm run test:paths`:

- `src/app/components/grading-recording/grading-rubric-memory.test.ts`
- `src/app/components/grading-recording/grading-rows.test.ts`
- `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts`
- `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts`
- `src/app/components/grading-results/rubricProvenanceLeaf.test.ts`
- `src/app/components/grading/zipUploadPreflight.wiring.test.ts`
- `src/app/components/grading/oneUploadWiring.wiring.test.ts`

Include `src/file-size-ceiling.structure.test.ts`,
`src/source-bytes.structure.test.ts` and `src/lib/no-emojis.test.ts` in a measured
structural gate. Run scoped ESLint over the assigned source files. The coordinator
owns `npx tsc --noEmit --incremental false`; do not launch a shared incremental
typecheck or infer type protection from passing Vitest alone.

Report actual commands and good/control/mutant/restored outcomes, exact caller
classification, production-byte preservation and unverified limits. This plan has
executed no production instrument and claims no passing measurements. No test here
renders components, proves browser behavior, prevents ordinary string widening or
enforces runtime namespace separation.
