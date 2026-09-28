# RULING 118 - the collision refusal must not re-enter the spending path

## The end-to-end spend path, as it was

`prepareGradingRunAction` (`src/app/actions/grading-incremental.ts`) caught
every thrown error - including A44's collision refusal, thrown by
`decideCollisionRefusal`/`describeCollisionRefusal` from inside
`extractStudentEntries` (`src/lib/grade/extraction.ts:145-148`) - and mapped
ALL of them to `mode: "whole-run"`.

The only consumer of that mode, `useIncrementalGradingRun.ts`'s `startReview`,
answered `mode: "whole-run"` by calling the injected `submitWholeRun`, which
dispatches the existing whole-run `gradeAction`. That action extracts the
SAME zip again, hits the SAME collision refusal, and throws again - but by
then `generateRubric`, `synthesizeFullCreditChecklist` and
`generateSampleAnswer` have already been dispatched in the same `Promise.all`
as the throwing `gradeSubmissions` call, and a rejection elsewhere in that
`Promise.all` does not cancel calls already in flight.

So the refusal fired before a ticket was ever built (true, and W-A46-1
verifies it), but the run it refused was retried anyway through the whole-run
path, and that retry paid for three model calls before failing a second time.
A46's headline claim - a collision refusal costs nothing - was true of
`prepareGradingRunAction` in isolation and false end to end.

## What changed

`PrepareGradingRunResult` gained a third variant:

```ts
export type PrepareGradingRunResult =
  | { readonly mode: "whole-run"; readonly reason: string }
  | { readonly mode: "refused"; readonly reason: string }
  | { readonly mode: "incremental"; readonly plan: IncrementalRunPlan };
```

`prepareGradingRunAction`'s catch block now distinguishes a refusal from an
ordinary error by checking whether the caught message starts with
`"Refused: "` - the exact, only prefix `collisionRefusal.ts`'s
`buildRefusalMessage` ever emits. This is a textual check rather than an
`instanceof` check on a dedicated error class because `extraction.ts` and
`collisionRefusal.ts` are outside this ticket's write set and were not
changed: the refusal there still throws a plain `Error`. A refusal maps to
`mode: "refused"`; every other caught error (a Canvas fetch failure, a
malformed single-file upload, ...) still maps to `mode: "whole-run"` exactly
as before - that fallback is not what this ruling changes.

`useIncrementalGradingRun.ts`'s `startReview` now branches on the new mode
BEFORE it can reach `submitWholeRun`:

```ts
if (prepared.mode === "whole-run") {
  setIncrementalRunning(false);
  submitWholeRun(fd);
  return;
}
if (prepared.mode === "refused") {
  setIncrementalRunning(false);
  setIncrementalError(prepared.reason);
  return;
}
const { plan } = prepared; // narrowed to `mode: "incremental"` by tsc
```

`mode: "refused"` is a dead end: it never calls `submitWholeRun`, so the
whole-run `gradeAction` - and its three model calls - are never dispatched.
The reason is surfaced through `setIncrementalError`, the same
`incrementalError` state `GradingTab.tsx` already renders as an error banner
(`src/app/components/GradingTab.tsx:282-284`), so the instructor sees the
refusal's own message rather than a generic failure. `GradingTab.tsx` was not
touched by this ticket; this is a reading claim about an existing render path,
not something exercised by a test (nothing renders under this repo's vitest -
`docs/loop/this-repo.md`).

## Where the claim now lives

`grading-incremental.test.ts`'s own "`mockCallLlm` not called" assertions are
labelled NECESSARY AND NOT SUFFICIENT in that file: the module they test has
no model-call site at all, so the assertion is true by construction. The real
claim - that a refusal never reaches the whole-run gradeAction's paying seam -
is proven in `useIncrementalGradingRun.lifecycle.test.ts`, in the describe
block "RULING 118: a refusal never reaches the paying whole-run seam". That
test drives the hook with a `submitWholeRun` mock (the seam), asserts a
`mode: "refused"` result never calls it, and is backed by a positive control
in the same file (the pre-existing "RULING 40" describe block) proving the
same mock IS reachable from the same hook for an ordinary `mode: "whole-run"`
result.

## Sabotage proof (RED then restore)

`src/app/components/grading/useIncrementalGradingRun.ts` was backed up with
`cp` to `/tmp/ruling118-backup/useIncrementalGradingRun.ts.bak` (outside the
repo). The fix was then reverted in place, merging the refusal back into the
whole-run branch - the exact shape of the pre-fix defect:

```ts
if (prepared.mode === "whole-run" || prepared.mode === "refused") {
  setIncrementalRunning(false);
  submitWholeRun(fd);
  return;
}
```

Running `npx vitest run src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts`
against that sabotaged file produced:

```
 FAIL  src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts > useIncrementalGradingRun - RULING 118: a refusal never reaches the paying whole-run seam > mode:'refused' surfaces the reason via incrementalError and NEVER calls submitWholeRun or fetch
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      FormData {
        Symbol(state): Array [
          Object {
            "name": "canvasUrl",
            "value": "https://x.instructure.com/courses/1/assignments/2",
          },
          Object {
            "name": "provider",
            "value": "gemini",
          },
        ],
      },
    ]


Number of calls: 1

at src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts:296:36
    294|     await render1.startReview(fd);
    295|
    296|     expect(submitWholeRunMock).not.toHaveBeenCalled();
       |                                    ^

 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
```

The file was then restored from the outside-repo backup
(`cp /tmp/ruling118-backup/useIncrementalGradingRun.ts.bak
src/app/components/grading/useIncrementalGradingRun.ts`), and the full suite
re-run GREEN (11 passed, 11 total).

## Residuals

- The instructor-visible surface for `mode: "refused"` is the existing
  `incrementalError` banner in `GradingTab.tsx`. This is a reading claim, not
  a rendered/tested one - nothing renders under this repo's vitest. If the
  owner wants a visually distinct refusal treatment (as opposed to reusing the
  generic error banner), that is a UI decision this ticket did not make.
- The incremental route itself is still gated off by default
  (`INCREMENTAL_ROUTE_ENABLED = false`, RULING 116), so this path is
  unreachable in production today. This ruling does not flip that gate; it
  makes the refusal correct before that flag ever does.
