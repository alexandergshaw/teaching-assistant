# A40-D5 independent verification and regression report

Status: independent source verification complete; measured execution evidence is
identified by its executing seat below. No implementation blocker found within
the accepted bounded scope. This report makes no commit or push claim.

## Scope and criteria

Consumes the accepted round-2 `a40-d5-origin-namespace-recon.md` and checked
`a40-d5-origin-namespace-plan.md`. The verifier did not author the implementation.
Direct inspection of the actual diff found five changed tracked files and two new
source/test leaves, matching the assigned seven-file implementation:

- `src/lib/grade/rubric-origin-scope.ts`
- `src/lib/grade/rubric-origin.ts`
- `src/lib/grade/rubric-memory.ts`
- `src/lib/cartridge-drops.ts`
- `src/lib/cartridge-drops.origin.test.ts`
- `src/app/components/grading-chat/chatSetupMemory.ts`
- `src/lib/grade/rubric-origin-namespace.test.ts`

The plan's `chatSetupMemory.test.ts` is adopted unchanged. No additional caller
edit is needed: ordinary computed storage scopes retain their existing contract.

| Accepted criterion | Independent inspection and instrument |
|---|---|
| Reject accidental direct typed-domain provenance reuse at both reader inputs | Both actual reader parameters use `RubricStorageScope`. The compiler fixture imports real constructor, resolver, domain, shared loader and chat wrapper; six branded calls require TS2345 at their argument spans. Unrelated diagnostics fail the instrument. |
| Keep ordinary storage scopes legal | The separate good fixture compiles blank, upload, cartridge and derived chat scopes through real imports and project resolution. Full-project nonincremental typecheck covers unchanged callers. |
| Preserve strings and null exactly | The constructor returns its input. DB mapping preserves null and brands every other value without transformation. Runtime cases cover empty, whitespace, unknown, upload and cartridge attribution; writer/listing cases cover null and exact echoed strings. |
| Preserve origin selection and existing restoration | Resolver branch order remains no-rubric, matching restored rubric, matching sniffed rubric, current scope. Restored empty strings remain empty; empty current scope remains null. Existing origin, memory and chat tests retain their literal oracles. |
| Preserve keys, save APIs and disclosure | Shared-loader and chat-wrapper bodies are unchanged; storage keys, save APIs and display helper are unchanged. Adopted memory/wiring tests cover isolation, exact restore, newest fallback and naming the actual restored scope. |
| Prove the boundary instrument can fail | Fresh `createProgram` instances load actual tsconfig options and actual imports. AST-located production parameter types are widened to `string` in isolated compiler hosts. Each mutant must lose its named rejection; baseline, harmless comment and restoration pass. Actual loader/wrapper disk hashes must remain unchanged. |

The compiler instrument is more than Vitest transpilation or a spelling check:
it uses installed TypeScript, strict project options, alias/module resolution,
`noEmit:true` and `incremental:false`. Its good fixture explicitly permits both
annotation-widened domain strings and raw generated database strings.

## Regression interpretation

`REGRESSION.md` section 449 identifies `chatSetupMemory.test.ts` as a pure setup
memory oracle, `GradingChatPanel.structure.test.ts` as panel wiring, and
`grading-chat-storage-keys.structure.test.ts` as the frozen key set. Section 440
also distinguishes source structure from rendered interaction. These entries
support adoption of the existing instruments, not a browser claim.

The unchanged memory oracle protects the blank-scope guard, exact restoration,
newest-entry fallback, fallback labeling and separation of storage keys. The
unchanged resolver oracle protects restored-source precedence, sniffed upload
attribution, current-scope fallback and missing-rubric behavior. Cartridge fixture
changes use the real constructor rather than casts that suppress the boundary;
literal persistence/null/disclosure assertions remain intact.

## Executed evidence

The coordinator reports `npx.cmd tsc --noEmit --incremental false` exited 0 after
the implementation froze. This report did not rerun that shared gate.

Fresh independent checker `/root/a40_d5_implementation_review` executed:

```powershell
npm.cmd run test:paths src/lib/grade/rubric-origin-namespace.test.ts src/lib/cartridge-drops.origin.test.ts src/app/components/grading-chat/chatSetupMemory.test.ts
```

Result: 3 files, 28 tests passed; round-1 review clean. This execution includes the
good/bad actual-import fixtures, both isolated reader mutations, harmless/restored
controls, unchanged disk hashes, identity and nullable persistence cases, and
existing chat memory behavior.

The coordinator also relayed an implementer regression run, but its original
exact command was not recovered when requested from the executing seat. That
run's quantity is not adopted as verification evidence here. The plan's wider
adopted path set remains identified above without a fabricated execution claim.
The verifier independently read the actual diff and compiler instrument without
rerunning broad gates.

## Limits and disposition

Coordinator pre-commit regression command on 2026-10-13:
`npm.cmd run test:paths src/lib/grade/rubric-origin.test.ts src/lib/grade/rubric-memory.test.ts src/lib/cartridge-drops.origin.test.ts src/lib/grade/rubricProvenance.test.ts src/app/components/grading-chat/chatSetupMemory.test.ts`.
It exited zero with five files and 74 passing tests. This recovered execution
record supplements the independent compiler-boundary proof above; it does not
reconstruct the implementer's earlier unrecovered command.

This protects only direct substitution of a still-branded typed-domain origin at
the two reader boundaries. Ordinary `string` annotation widening, raw generated
Supabase row strings, explicit casts, interpolation, JSON re-decoding and untyped
JavaScript can bypass it. The positive compiler controls deliberately retain
those limits. There is no runtime namespace validation or normalization, no SQL
change and no data migration. Existing arbitrary strings and null remain intact.

No test here renders a component. The evidence does not prove browser layout,
focus, keyboard interaction, real localStorage behavior in a browser, or a live
Supabase round trip. Mocked leaf persistence and source wiring are the measured
subjects. No harmful production reader is asserted to have existed or been fixed.

The implementation is ready for coordinator evidence/ledger reconciliation within
this bounded preventative scope; runtime namespace separation would be a separate
design activity.
