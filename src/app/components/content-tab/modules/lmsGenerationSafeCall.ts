// Job 2 of the intro-video-script bug report fix (docs/REGRESSION.md): a
// single, tiny, DI-testable wrapper for "a generation call that may REJECT
// rather than only ever resolving to its own {error} shape" - extracted so
// useLmsGeneration.ts's generate() (a file already near this repo's 1000-line
// ceiling) needs only wrap its two `await` calls in this, rather than
// growing a hand-written try/catch block around each async IIFE.
//
// THE DEFECT THIS CLOSES: several of useLmsGeneration.ts's async IIFEs
// awaited their Server Action call with no try/catch at all - originally
// found in generate()'s generic branch (calling generateFromSelectionAction),
// then (step-10c review, D1) found to also cover refine()
// (refineGeneratedArtifactAction), saveEdit() (saveEditedGeneratedArtifactAction)
// and post() (postGeneratedArtifactAction) - see each of those functions' own
// call site for its wrapped call. generate()'s OWN "decks" branch
// (generateDeckApi) is the one exception: that call already has its own
// internal try/catch and never rejects (see that branch's own comment). Every
// action these wrap catches its OWN internal errors and returns
// `{error: string}` - but the CLIENT-SIDE call that invokes a Server Action
// over the network can still reject on its own (an offline browser, a
// dropped connection, a Next.js RPC-layer failure) before the server's own
// try/catch ever runs. A rejection there propagated out of the IIFE as an
// unhandled promise rejection: no `setNote` call ever ran (no error banner,
// anywhere), and each function's own busy-resetting call never ran either -
// for generate()/refine()/saveEdit() that left `busy` (and the per-action
// flag: `refining`/`savingEdit`) stuck reading "Generating..." until a full
// page reload; for post() it also left the tab-wide `setBusy(true)` never
// undone, locking the ENTIRE Content tab, not only this hook's own state.
// This is the exact symptom originally reported ("the intro video script is
// never actually coming up as a modal").
// `rejected: true` on the synthesized error (never present on a resolved
// {error} the wrapped call returned itself) is what lets a caller building a
// diagnostic record (lmsGenerationDiagRecord.ts's own `timing.outcome`) tell
// "the server said no" apart from "the call never reached the server at
// all" - the exact distinction the coordinator's brief asked the downloadable
// log to carry ("timings including whether the promise RETURNED or
// REJECTED").
export async function runGenerationCall<T>(
  call: () => Promise<T>
): Promise<T | { error: string; rejected: true }> {
  try {
    return await call();
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Could not generate content: ${err.message}`
          : "Could not generate content - the request failed unexpectedly.",
      rejected: true,
    };
  }
}
