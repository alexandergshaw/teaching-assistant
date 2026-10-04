# W1a TDD test notes + frozen oracles: oversize-segment sub-chunking (ARC-T1, ARC-T2)

Status: NOTES ONLY, delivered for check before build. I wrote NO test code into the repo and no report file; `git status --short` shows only siblings' doc edits, none mine. Reference/probe artifacts live only in the session scratchpad. This is W1a ONLY and is disjoint from W1b (I did not read, touch, or design `take-announcement-draft.ts` / `useTakeAnnouncement.ts` draft path).

## 1. Seam and where the leaf lives

- New pure leaf `planSegmentSubchunks(sampleCount: number, sampleRate: number)` in `src/lib/take-transcript.ts`, beside the existing `planTranscriptChunks` / `sliceMonoSamples` / `joinTranscriptChunks`. That file is already pure, Node-safe, no I/O, and is already directly unit-tested by `src/lib/take-transcript.test.ts` - so the oracle imports the leaf directly, which IS the production path for this arithmetic (no gate blocks it; nothing here reaches past a seam).
- Tests APPEND describe blocks to the EXISTING `src/lib/take-transcript.test.ts`. Do NOT create a new test file that imports a helper from another `*.test.ts` (re-runs its describe blocks - recorded failure).
- Recommended return shape: `Array<{ startSample: number; endSample: number }>`, ordered, half-open `[startSample, endSample)`, sample indices into the decoded mono buffer. Field spelling is the architect's to finalize; the oracle pins the boundary SEMANTICS (contiguous ranges covering `[0, sampleCount)`), and if fields are renamed the test's references update mechanically. For a value-returning pure function the field contract is legitimately pinnable (this is not source-text over-specification - the FACT is the sample ranges).
- Caller (W1a write set, per scope): `getChunkMono` / `runTranscriptionLoop` in `src/app/components/recording/takeAnnouncementTranscription.ts`. The segments path (`takeAnnouncementTranscription.ts:199-203`) today decodes `segments[i]` whole and encodes it whole (`:245-247`); the fix decodes the segment, calls `planSegmentSubchunks(mono.length, LIVE_SAMPLE_RATE)`, and sends one wire request per sub-chunk slice (reuse `mono.slice(start,end)` - `sliceMonoSamples` is sec-based, so either generalize it or slice by sample index inline). That restructures `total`/indexing in the loop; that restructure is the architect's/implementer's, NOT mine. My oracle proves the arithmetic leaf and that an over-budget segment is split into within-budget pieces; the loop wiring is a separate source-text/reading concern the plan seat owns.

## 2. Measured facts (every quantity names its command)

All measured in this checkout by driving the REAL production encoders (`encodeWav`, `base64FromArrayBuffer` from `@/lib/live-class/wav`) against `UPLOAD_WIRE_BUDGET_BYTES`, via a scratchpad vitest config (node env, `resolve.alias["@"]` -> repo `src`). btoa is a node global; the encoders run under node-env vitest with no DOM.

- `UPLOAD_WIRE_BUDGET_BYTES` = `3.5 * 1024 * 1024` = **3,670,016** (`src/lib/upload-budget.ts:41`; `checkWireBudget` accepts `wireBytes <= maxWireBytes`, `:87`).
- WAV byte length for n mono samples = `44 + 2n` (`wav.ts:84-118`; 44-byte header, 16-bit mono). base64 length = `4*ceil((44+2n)/3)` (`base64FromArrayBuffer`, `wav.ts:140-148`), and that string's `.length` IS the wire unit `checkWireBudget` compares.
- **MAX samples per sub-chunk = 1,376,234.** Derivation: `quarter = floor(budget/4) = 917,504`; `MAX = floor((3*quarter - 44)/2) = 1,376,234`. MEASURED with the real encoder: `wireLen(1,376,234) = 3,670,016` (== budget, fits); `wireLen(1,376,235) = 3,670,020` (> budget, fails). MAX in seconds at 16 kHz = **86.014625 s**.
- Measured full-encode wire bytes for the second-axis cases (command: real `encodeWav`+`base64FromArrayBuffer` on `new Float32Array(s*16000)`):

  | seconds | samples | wire bytes (measured) | fits 3,670,016? |
  |---|---|---|---|
  | 0 | 0 | 0 | n/a |
  | 1 | 16,000 | 42,728 | yes |
  | 60 | 960,000 | 2,560,060 | yes |
  | 86 | 1,376,000 | 3,669,392 | yes |
  | 87 | 1,392,000 | 3,712,060 | **no** |
  | 120 | 1,920,000 | 5,120,060 | **no** |
  | 600 | 9,600,000 | 25,600,060 | **no** |

  This corrects the scope's two stated figures: the scope's ARC-T1 axis used `{..86,87,119,600}` and "82 s / 86.016 s" prose; the real boundary is **86.0146 s / 1,376,234 samples** (the scope ignored the 44-byte header and the base64 ceiling). 86 s FITS; 87 s is the smallest whole-second segment that does not. I use 120 s (the caller's requested case) and the two exact sample-boundary cases, which are the real teeth.

## 3. ARC-T1 - the core oracle (MACHINE, executable here)

OBJECT: the sub-chunk plan returned by `planSegmentSubchunks(sampleCount, 16000)`.
INSTRUMENT: for each returned sub-chunk, the REAL wire length `base64FromArrayBuffer(encodeWav(new Float32Array(end-start), 16000)).length` compared with `UPLOAD_WIRE_BUDGET_BYTES`; plus coverage arithmetic over the returned ranges.
DIRECTION OF FAILURE - the plan is WRONG (test RED) when ANY of:
  (a) any sub-chunk's real wire length > budget (an oversize piece still ships);
  (b) the ranges do not cover `[0, sampleCount)` exactly - `start[0] != 0`, or `start[i] != end[i-1]` (gap/overlap), or `sum(end-start) != sampleCount`, or `end[last] != sampleCount` (dropped tail);
  (c) a segment whose own full encode fits is split into more than one chunk (needless split);
  (d) a 0 / negative / non-finite `sampleCount` returns any chunk.

### Generator (deterministic - wire length is a pure function of sample count; values are irrelevant because `encodeWav` writes 2 bytes/sample regardless of value)
`makeMono(n) => new Float32Array(n)`. The leaf takes the COUNT; the test builds a real slice of `(end-start)` samples per sub-chunk and encodes it - mirroring production, which decodes the segment to a real mono buffer and slices it.

### Axes - from a DIFFERENT source than the generator (independent hand-written literals), three independent families:

FAMILY A - seconds, rounded to samples `n = s*16000` (frozen expected is hand-derived, NOT computed by the generator or the leaf):

| label | n | expected |
|---|---|---|
| 0s | 0 | `[]` |
| 1s | 16,000 | exactly 1 chunk `[0,16000)` |
| 60s | 960,000 | exactly 1 chunk `[0,960000)` |
| 86s | 1,376,000 | exactly 1 chunk `[0,1376000)` |
| 87s | 1,392,000 | >= 2 chunks; lower bound `ceil(1,392,000/MAX)=2` |
| 120s | 1,920,000 | >= 2 chunks; lower bound `ceil(1,920,000/MAX)=2` |
| 600s | 9,600,000 | >= 7 chunks; lower bound `ceil(9,600,000/MAX)=7` |

FAMILY B - exact byte-boundary sample counts (the discriminators a seconds axis cannot hit):

| label | n | expected |
|---|---|---|
| exact-MAX | 1,376,234 | exactly 1 chunk (wire == budget, accepted by `<=`) |
| exact-MAX+1 | 1,376,235 | >= 2 chunks (first chunk must be <= MAX) |

FAMILY C - guard inputs, mirror `planTranscriptChunks`'s contract (no encode needed):

| input | expected |
|---|---|
| 0, -1, NaN, Infinity | `[]` |

### Assertions the implementer writes (per non-empty case)
1. `chunks[0].startSample === 0`; `chunks[last].endSample === n`.
2. For each i>0: `chunks[i].startSample === chunks[i-1].endSample` (contiguity: no gap, no overlap).
3. For each chunk: `endSample > startSample`.
4. `sum(end-start) === n` (coverage).
5. For each chunk: `wireLen(end-start) <= UPLOAD_WIRE_BUDGET_BYTES` using the REAL encoders (this is the fixtures-must-match-emitted-shape instrument - never a hand-typed byte count).
6. `expectOne` cases: `chunks.length === 1`.
7. `lowerBound` cases: `chunks.length >= lowerBound`.
8. Empty/guard cases: `chunks` deep-equals `[]`.

### Deriving MAX in-test WITHOUT a tautology
The test computes its OWN `MAX = floor((3*floor(budget/4) - 44)/2)` from the PUBLIC `UPLOAD_WIRE_BUDGET_BYTES` and then VALIDATES that derivation against the REAL encoder in a self-check assertion: `wireLen(MAX) <= budget` AND `wireLen(MAX+1) > budget`. The test MUST NOT import any internal MAX/chunk-size constant the leaf defines. `MAX` is used only for the `ceil(n/MAX)` lower bound - a floor any correct planner must meet regardless of its internal chunk size - and the within-budget assertion (point 5) uses the real encoder on the leaf's actual output, not the test's MAX. So neither the pass condition nor the count reads a value the implementation also reads.

### Why a LOWER bound on count, not an exact count (stated so the checker holds me to it)
The scope's ARC-T1 asked for a frozen exact count `ceil(samples/(maxSeconds*rate))`. I deliberately did NOT pin an exact count. The budget is the only hard constraint; the planner's internal chunk size (exact 86.0146 s maximal fill, or a round 60 s like `TRANSCRIBE_CHUNK_SECONDS`, or anything <= MAX) is the implementer's free choice, and a 60 s planner and an 86 s planner give DIFFERENT counts while both being correct. An exact count would reject a valid implementation - the source-text/over-specification trap this seat exists to avoid. The lower bound `ceil(n/MAX)` is implementation-independent: no correct planner can use fewer chunks, because any chunk > MAX samples exceeds budget. Combined with per-chunk within-budget (point 5) and coverage (point 4), under-splitting and tail-dropping are both caught without pinning a spelling.

NOT pinned, flagged as a real but out-of-scope risk (argued, not asserted): a degenerate planner that over-splits into tiny chunks (e.g. 1 sample each) satisfies budget + coverage but makes thousands of requests. An upper bound on count is implementation-dependent, so I do not assert one. Recommended, as an OWNER/architect decision not a test criterion: require each non-final chunk to fill at least, say, half the budget. I leave this as residual R-OS below rather than inventing a magic threshold in a test.

## 4. ARC-T2 - a paused/resumed take transcribes (OWNER + one pinned pure fact)

- PINNED, MACHINE (the pure half): an over-budget segment is split deterministically into within-budget pieces covering it fully. This is EXACTLY ARC-T1's 120s / exact-MAX+1 cases; no separate test is needed, and ARC-T2 adds no machine assertion of its own beyond ARC-T1. Pin it as: `planSegmentSubchunks(120*16000, 16000)` returns >= 2 chunks, each within budget, covering `[0, 1,920,000)` - same assertions as above.
- OWNER/UNDETERMINED (tag explicitly, do NOT assert): whether a real browser's paused-then-resumed sidecar segment actually exceeds 86 s. From `audio-sidecar.ts:110-123`, `pause()` stops the ticker and pauses the open recorder; `resume()` resumes it and starts a FRESH full-period ticker (`:122`), so the open segment accumulates `p + 60` s of real audio. That `p+60 > 86.0146` claim is ARITHMETIC from source (the scope's G3), NOT observed - the recorder cannot run here, and MediaRecorder's own paused-interval exclusion means the real captured duration is `[UNDETERMINED]` in the browser. Owner instrument: run one paused take through "Draft announcement", download the run log (`RunLogRow`, `TakeAnnouncementPanel.tsx:243-248`), confirm `transcriptionPath = "segments"` and `chunkRetries` empty with no "too large" chunk failure. This is residual R1/O4 in the scope; it is the load-bearing owner-verify for the whole fix because the machine side only proves the splitter is correct, not that the splitter is reached on a real paused take.

## 5. Sabotages - each discriminates (RED on mutant, GREEN on restore); none is red-both or green-both

All five were EXECUTED against the oracle in the scratchpad. S1 and S2 were confirmed green-on-control / red-on-mutant in a full vitest run; S4 is proven by the measured encoder boundary; S3 and S5 are structural and were confirmed by targeted runs.

| # | Mutation (in the leaf) | Discriminating frozen case | Assertion that goes RED | Expected-GREEN case (proves one-directional) | Discriminates? |
|---|---|---|---|---|---|
| S1 | Tail-drop: `while (start + MAX <= n)` so the final partial chunk is never pushed | 87s (1,392,000) | coverage: `sum(end-start)=1,376,234 != 1,392,000`, and `end[last] != n` | 2*MAX (exact multiple) stays fully covered -> GREEN | YES (confirmed) |
| S2 | No-split: `return [{start:0,end:n}]` for n>0 | 87s | within-budget: `wireLen(1,392,000)=3,712,060 > 3,670,016`; also `length>=2` fails | 86s (fits) -> single chunk is correct -> GREEN | YES (confirmed) |
| S3 | Overlap: advance `start = end - 1` | 87s (multi-chunk) | contiguity: `chunks[1].start != chunks[0].end` | any single-chunk case (86s) -> no pair to compare -> GREEN | YES (confirmed, structural) |
| S4 | MAX too high (header-forgetting): `MAX = floor(3*quarter/2) = 1,376,256` | exact-MAX+1 (1,376,235) AND 87s | within-budget: the leaf ships a chunk of `> 1,376,234` samples -> `wireLen > budget` (MEASURED: wireLen(1,376,235)=3,670,020) | 86s (fits under either MAX) -> GREEN | YES (proven by measured boundary) |
| S5 | Drop the `sampleCount<=0` guard (e.g. `do...while`) so 0 yields a chunk | 0s | empty: `chunks` is not `[]` | 86s -> GREEN | YES (confirmed, structural) |

Note on S4 and the exact-boundary case earning its place: any over-budget case (87s) catches a MAX-TOO-HIGH mutant because the first chunk is always MAX-sized and `wireLen(wrongMAX) > budget`. The exact-MAX case (expectOne at n=1,376,234) independently catches a MAX-TOO-LOW mutant (off by -1 would split a fitting segment). Both boundary directions are covered. The REAL-encoder instrument (point 5) is what makes S4 fire at all - a hand-typed byte count for the chunk size would pass the mutant.

No mutant was REBUILT or banked incorrectly; all five discriminate as designed, each in exactly one direction, GREEN after restore.

## 6. Satisfiability proof (OBLIGATION 1)

A throwaway reference `planSegmentSubchunks` (maximal greedy fill, MAX derived from the budget) was built in the scratchpad and scored **13/13 green** against the full ARC-T1 oracle (all three axis families) plus the measured-facts self-check. The red tests are satisfiable by an implementation I can write. The reference is NOT production code and was not added to the repo.

## 7. Executable here vs. argued/owner

- EXECUTABLE (MACHINE, node-drivable, transcription/model mocked, no real fetch): ARC-T1 in full (coverage, per-chunk within-budget via real encoders, fit-stays-one, empty/guard, lower-bound count); the pinned pure half of ARC-T2; the MAX self-validation.
- ARGUED ONLY (arithmetic from source, labelled as such, NOT asserted): that a real paused take produces a `p+60 > 86.0146 s` segment (`audio-sidecar.ts:122` restarts the period). This is the premise that makes the fix NECESSARY; it is not provable here.
- OWNER ONLY: ARC-T2 end-to-end on a real browser + key (run log shows `segments` path, no "too large" failure); whether Gemini accepts the WAV the splitter produces (R2/O3).

## 8. Implementation constraints the implementer MUST honor

- MEMORY: I hit a vitest worker heap OOM (`Reached heap limit`) running the full oracle because repeated multi-megabyte encodes accumulate in one worker. Guidance: (a) apply the per-chunk within-budget REAL-encode assertion to `{1s, 60s, 86s, 87s, 120s, exact-MAX, exact-MAX+1}` only; (b) for the 600s (very-long) case assert coverage + `length >= 7` ONLY - do NOT encode its chunks (they are the same MAX size already exercised by 87s/120s, so encoding adds no discrimination and OOMs the worker); (c) allocate `new Float32Array(end-start)` per chunk and let it fall out of scope between assertions - never hold the whole 600s buffer. Largest live allocation stays ~1.4M samples (~2.8 MB). This keeps the suite green in this environment.
- Import encoders/budget from the leaf-safe modules: `encodeWav`, `base64FromArrayBuffer`, `LIVE_SAMPLE_RATE` from `@/lib/live-class/wav`; `UPLOAD_WIRE_BUDGET_BYTES` from `@/lib/upload-budget`. All pure, node-safe (btoa is a node global).
- No `/s` or `/gs` dotAll regex anywhere (passes vitest, FAILS tsc TS1501).
- No emojis anywhere in code, comments, or strings.
- Do NOT import any helper from another `*.test.ts`; append to the existing `src/lib/take-transcript.test.ts`.
- Mock `canvasFetch` (not `fetch`) on any Canvas path - not applicable to this pure leaf, but holds if the loop-wiring test touches the action.
- Multi-file runs: `npm run test:paths <p1> <p2> ...`, never a raw multi-path `vitest`/`npm test`.
- 1000-line ceiling: `takeAnnouncementTranscription.ts` measured 432 (`@(Get-Content).Count`), `take-transcript.ts` is ~86 lines - ample headroom; `recording-split.structure.test.ts` scans `recording/` non-recursively (the leaf is under `src/lib`, not `recording/`, so it is not in that scan, but the loop edit to `takeAnnouncementTranscription.ts` is).

## 9. Residual register (owner / instrument / measuring step - none missing any of the three)

| Id | Residual | Owner | Instrument | Measuring step |
|---|---|---|---|---|
| R1/O4 | Paused real take actually exceeds 86.0146 s and is split (ARC-T2 end to end) | repo owner | run-log JSON after a paused take: `transcriptionPath="segments"`, `chunkRetries` empty, no "too large" | W1a owner-verify in a real browser |
| R2/O3 | Gemini accepts the WAV the splitter emits for each sub-chunk | repo owner | one real transcription with a key | W1a/W4 owner-verify |
| R-OS | Over-split (degenerate tiny-chunk) planner satisfies budget+coverage but makes excessive requests | architect/owner | a "each non-final chunk fills >= half budget" assertion IF the owner wants efficiency guaranteed; not pinned here | architect decision before build; add to ARC-T1 only if adopted |
| R-LOOP | The segments-path loop restructure (one segment -> N wire requests) is reached and `total`/indexing stay correct | plan/architect seat | source-text/reading of `runTranscriptionLoop` + `getChunkMono` after the edit; no render here | W1a verify pass (reading claim) |

## 10. For the checker

- The one place I changed the scope's stated oracle: the exact chunk COUNT became a LOWER BOUND, and the boundary moved from the scope's 86/87 s + "82/86.016 s" prose to the MEASURED 86.0146 s / 1,376,234 samples. Both changes are justified above (over-specification avoidance; measured vs. recalled). The scope's `119` case is replaced by `120` (the caller's requested case) plus the two exact sample-boundary cases, which strictly dominate it.
- Attack to try: does the within-budget assertion read a hand-typed byte count anywhere? It must not - it must encode the leaf's actual output slice with the real encoders. If a future edit replaces `wireLen(end-start)` with a constant, the S4 (MAX-too-high) kill is lost.
- Confirm the test derives MAX from the public budget and self-validates it, and does not import a chunk-size constant from `take-transcript.ts`.

Scratchpad artifacts (not in repo, for your own re-run if wanted): `ref-plan.ts`, `plan.probe.test.ts`, `sabotage.probe.test.ts`, `probe.config.mjs`. Run with `npx vitest run --config <probe.config.mjs>` from the repo root; use `NODE_OPTIONS=--max-old-space-size=4096` and split out the 600s encode to avoid the OOM described above.
