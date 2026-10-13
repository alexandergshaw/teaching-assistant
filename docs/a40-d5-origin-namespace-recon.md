# A40-D5 origin namespace reconnaissance

Status: round-2 scoped recommendation for independent delta check; no production change.
Read `DEV_LOOP.md`, `loop/traps-tests.md` and `loop/traps-spec.md`. No separate
subject-trap filename was found by `rg --files | rg -i 'subject.*trap|trap.*subject'`;
the relevant subject rule is in traps-tests: source assertions over code behavior
must strip comments, while file-content subjects remain raw. No emojis added.

## Actual tree and risk

`docs/backlog.yml:1074` records A40-D5 as unscoped, with empty owns and no verify.
Its assertion that a preventative instrument cannot fail is too strong.
The harmful production reader is still absent in the inspected tree.
Command: `rg -n 'rubricOriginScope' src --glob '!*.test.ts'`, followed by
`rg -n 'A40-D5|rubric_origin_scope|loadRubricMemory' docs/backlog.yml src docs/loop`.
These are spelling-based reconnaissance, not exhaustive semantic dataflow proof.

The column writer is `src/lib/cartridge-drops.ts:75`; the DB reader maps it into
the domain object at `:162`; the domain field and upload metadata remain nullable
strings at `:28` and `:44`. `CartridgeDropPanel.tsx:282` computes origin, `:297`
passes metadata, and `:605` renders disclosure via `describeDropRubricOrigin`.
`src/lib/grade/rubric-origin.ts:60` creates `upload:<archiveName>` for sniffed text;
`:56` preserves restored scope. The humanizer at `:94` intentionally reads origin
as a display value, without loading storage.

GradingTab uses storage key `ta-grading-rubric-memory` at `GradingTab.tsx:52`,
loads `upload:<name>` at `:254`, and saves that namespace at `:347`.
CartridgeDropPanel uses distinct key `ta-cartridge-rubric` at `:39` and loads a
course/assignment-derived scope at `:142`. Namespace overlap alone does not
access GradingTab storage: a future harmful call must also choose its storage key.
`rubric-memory.ts:113` accepts any string; `:116` exact-matches, while `:120`
onward selects the newest entry on an exact miss. Thus misuse could restore a
wrong rubric even without the exact colliding filename. No runtime bug is asserted.

## Fail-capable preventative boundary

A safe buildable recommendation exists: make persisted origin a branded string
and forbid that branded value at the memory-loader input, while keeping ordinary
string storage scopes accepted. This changes no stored values or display wording.
Sketch, not accepted implementation:

```ts
type Origin = string & { readonly rubricOriginScope: true };
type StorageScope = string & { readonly rubricOriginScope?: never };
declare function loadRubricMemory(key: string, scope: StorageScope): void;
declare const origin: Origin;
loadRubricMemory("key", "upload:a.zip"); // valid existing scope
loadRubricMemory("key", origin); // known-bad direct provenance reuse
```

Actual control command: `node -e` loading installed TypeScript, constructing the
sketch with `createProgram`, `strict:true`, `noLib:true`, `noEmit:true` and a virtual
compiler host, then printing `getSemanticDiagnostics()` for safe and bad calls.
The safe fixture returned `[]`; the bad fixture returned TS2345 (origin property
incompatible with optional-never storage property). This is a real compiler
control, with no production mutation. Initial sandbox invocation failed EPERM;
approved read-only invocation succeeded. It is not production conformance yet.

The new origin constructor is an identity branding boundary, not a namespace
validator. Brand values at `resolveRubricOriginScope`'s existing return branches
and `mapCartridgeDrop`'s DB-to-domain mapping. Type the domain
`CartridgeDrop.rubricOriginScope` and `saveCartridgeDrop` metadata as branded origin
or null. Keep the generated Supabase column type faithful to SQL. Preserve every
existing stored string and null byte-for-byte: do not trim, normalize, reject a
namespace, parse a filename differently, migrate data, or change display wording.
The existing origin resolver's choice of restored/current/sniffed scope stays
unchanged. The display helper continues accepting string.

The prevention claim is deliberately narrow: accidental direct reuse of a
still-branded typed-domain origin as the scope argument of `loadRubricMemory` or
`loadChatSetupMemory` is rejected by TypeScript. The chat wrapper is part of the
boundary: its current `scope: string` parameter erases an origin brand at entry,
so it must accept the same excluded-origin storage-scope type as the shared
loader. Existing ordinary string scope callers remain legal. `deriveChatScope`
continues producing its existing strings; save APIs and display APIs retain their
existing contracts in this wave.

Ordinary TypeScript annotation widening is a bypass even without a cast:
`const widened: string = drop.rubricOriginScope` after a null guard drops the brand
and remains accepted as a storage scope. Raw generated Supabase row strings are
also accepted and carry no domain provenance before mapping. Explicit casts,
interpolation, JSON re-decoding and untyped JavaScript can likewise erase it.
The compiler instrument should demonstrate the widening/raw-row limitations,
not claim they are forbidden. Course/name producers that accept ordinary label
strings are not universal provenance guards. No runtime namespace separation or
hostile-dataflow prevention is claimed; that stronger redesign is outside scope.

## Proposed scope and next receiver

Proposed owns:

- `src/lib/grade/rubric-origin-scope.ts` (new shared identity constructor and types).
- `src/lib/grade/rubric-origin.ts` (brand existing resolver output).
- `src/lib/grade/rubric-memory.ts` (exclude branded domain origins at loader input).
- `src/lib/cartridge-drops.ts` (brand nullable domain field, upload metadata and DB mapping).
- `src/lib/cartridge-drops.origin.test.ts` (use the real constructor in `baseMeta`
  and literal metadata overrides; keep raw echoed DB rows raw strings and the
  existing literal round-trip/null/disclosure assertions).
- `src/app/components/grading-chat/chatSetupMemory.ts` (retain the exclusion at
  the direct scope-reader wrapper's input).
- `src/app/components/grading-chat/chatSetupMemory.test.ts` (ordinary scope and
  restore/storage-key behavior regression; no changed namespace behavior).
- `src/lib/grade/rubric-origin-namespace.test.ts` (new actual-import compiler instrument).

New leaf must have real origin/DB/loader/wrapper callers. Do not repair metadata
fixtures by `as Origin` casts or broad `any`: import the actual identity origin
constructor. Do not alter the generated SQL-facing Supabase field or migrations.

Affected callers/tests classification from this revision's actual tree reads:

| Classification | Exact paths and reason |
|---|---|
| Owned | All paths above; cartridge metadata fixtures currently widen to `string \| null`, and chat lookup currently accepts `string`. |
| Adopted regression instruments | `src/lib/grade/rubric-memory.test.ts`, `src/lib/grade/rubric-origin.test.ts`, `src/lib/grade/rubricProvenance.test.ts`; ordinary scopes, frozen resolver/disclosure oracles, and run-versus-storage provenance. |
| Checked-safe direct callers | `src/app/components/CartridgeDropPanel.tsx` (uses computed memory scopes and inferred resolver origin separately), `src/app/components/GradingTab.tsx` (upload-name scope), `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` (ordinary constant scope), `src/app/components/grading-recording/grading-rubric-memory.ts` (computes assessment/course scopes from labels), `src/app/components/grading-chat/GradingChatPanel.tsx` (uses `deriveChatScope`). No signature broadening or production edit expected at these callers. |
| Adopted caller/wiring regressions | `src/app/components/grading-recording/grading-rubric-memory.test.ts`, `src/app/components/grading-recording/grading-rows.test.ts`, `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`, `src/app/components/grading-chat/GradingChatPanel.structure.test.ts`, `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts`, `src/app/components/grading-results/rubricProvenanceLeaf.test.ts`, `src/app/components/grading/zipUploadPreflight.wiring.test.ts`, `src/app/components/grading/oneUploadWiring.wiring.test.ts`; protect existing persistence keys and scope/load wiring, not new type discrimination. |

Discovery instrument: `rg -l 'rubricOriginScope|resolveRubricOriginScope|loadRubricMemory|saveRubricMemory|loadChatSetupMemory|saveChatSetupMemory|deriveChatScope' src --glob '*.ts' --glob '*.tsx'`, then direct reads of definitions,
fixture helpers and callsites. Read source-reading tests as their declared subject
requires: strip comments for code-behavior assertions, preserve raw file-content
subjects. The table is a floor; the receiver repeats discovery and classifies
newly found affected callers/tests before assigning implementation.

## Actual-import compiler instrument and isolated mutation

`src/lib/grade/rubric-origin-namespace.test.ts` must load the real `tsconfig.json`
with installed TypeScript's config reader/parser and call `createProgram` using
its strict project options and alias/module resolution (`@/*` is configured).
Override `incremental: false` and `noEmit: true`; use an isolated compiler host
for fixtures and mutations. Import the actual production loader, chat wrapper,
origin constructor/resolver and `CartridgeDrop` domain type. The fixture must not
declare a duplicate loader signature or a local substitute origin type.

Pass/failure oracle:

- Good ordinary scopes, including blank, upload, cartridge and chat-derived
  strings, produce no relevant compiler diagnostics through the actual APIs.
- A null-guarded actual `CartridgeDrop.rubricOriginScope`, an actual constructor
  result and a non-null actual resolver result each produce the expected
  argument-compatibility diagnostic at direct shared-loader and chat-wrapper
  calls. Inspect diagnostic source location and incompatible parameter/type;
  unrelated missing-import or syntax errors are failures of the instrument.
- Ordinary annotation widening and raw generated DB strings continue compiling;
  these positive limitation controls prevent overstating the guarantee.
- Constructor/domain mapping runtime cases assert identity preservation of existing
  namespace strings, whitespace/unknown strings, empty strings and null where the
  DB field admits them. Existing frozen origin/null behavior remains the oracle.

Mutation is of real production source through compiler-host interception only.
Locate the actual exported `loadRubricMemory` declaration with the TypeScript AST
and replace its scope parameter type in the host's version of
`src/lib/grade/rubric-memory.ts` with `string`. Do not modify its fixture or any
file in the working tree. Rebuild the program with a fresh host/program for each
case, so a cached source file cannot hide the change. The shared-loader direct
origin diagnostic must disappear; therefore the instrument's normal rejection
assertion must fail. Separately widen the actual chat wrapper parameter to
`string` in its intercepted source: its direct-origin rejection must fail without
requiring a shared-loader mutation. These are parameter-boundary mutations, not
regex checks over source spelling.

Required controls: baseline correct-source instrument passes; a harmless source
comment change still passes; each intended production-boundary mutant makes the
same instrument fail for the named missing diagnostic; restoring original host
source bytes makes it pass again. Hash the actual production loader/wrapper files
before/after and assert unchanged. No shared-tree mutation is authorized by this
scope. Record good/control/mutant/restored results and exact command when executed;
this reconnaissance revision has not executed production conformance.

Proposed compiler gate: `npm run test:paths src/lib/grade/rubric-origin-namespace.test.ts`.
Integration receiver also runs the owned/adopted test paths through
`npm run test:paths <exact paths>`, scoped ESLint and
`npx tsc --noEmit --incremental false`. The new-file path is proposed and does not
exist yet; do not claim a passed test or run it as current evidence. No component
rendering, browser behavior or runtime namespace isolation follows from these gates.

Next receiver: independent scope checker, then planner/implementer and test seat.
There is no true owner/input blocker: safe prevention is feasible, reversible and
has a demonstrated known-bad control. The pending decision is scope acceptance,
not whether the row must wait for a harmful callsite to exist.
