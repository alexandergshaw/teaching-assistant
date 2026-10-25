# Institution directory diagnostics correction criteria

This bounded correction closes the diagnostics residual found in the second
independent review of `COURSES-INSTITUTION-DIRECTORY`. It does not reopen the
directory's data model, storage, UI, or password-manager integration.

## Required behavior

1. A rejected or otherwise invalid profile whose `emailClient` is `other` and
   whose `emailClientOtherName` is empty must produce a failure diagnostic with
   `reason: "validation"`. The same applies when `lmsType` is `other` and
   `lmsOtherName` is empty. Neither case may be reported as storage failure.
2. Every rejected server-action promise is observable as a failure in the
   Diagnostics surface, with `reason: "unavailable"` and a finite,
   non-negative `durationMs`. This applies to the `list`, `create-profile`,
   `update-profile`, `remove-profile`, `create-column`, `rename-column`,
   `remove-column`, `save-value`, and `clear-value` operations.
3. Rejection handling must preserve the existing fixed operation and target
   categories. Diagnostics must not contain exception messages, institution or
   column names, entered values, destination URLs, or credential-like data.
   The UI must settle its busy state and show its existing closed failure
   message after a rejected promise.
4. Existing fulfilled-action behavior remains intact: success and returned
   failure results retain their current outcome/reason classifications and
   duration metrics. A follow-up directory refresh is a separate `list`
   operation; its own fulfilled or rejected result is recorded independently.

## Executable proof

- In `src/lib/institution-directory-diagnostics.test.ts`, literal cases prove
  `missing-email-client-name` and `missing-lms-name` classify as
  `validation`.
- In an instrumented UI-handler test, make each of the nine listed server
  actions reject its promise. For every case, assert exactly one corresponding
  failure entry with the expected fixed operation/target, `reason:
  "unavailable"`, and finite non-negative duration; assert the closed UI error
  is visible and busy state settles. Exercise profile `create` and `update`
  separately, and value `save` and `clear` separately, for the nine total
  cases.
- The same tests assert serialized diagnostics omit the rejected exception's
  sentinel text and submitted profile/value/URL data.
- Existing diagnostics, server-action and directory test files remain green.
  Run the repository's measured focused test command for those paths and report
  its exact command and result. Source inspection alone does not satisfy this
  proof.

## Limits

The repository test setup does not render components. The instrumented test may
exercise extracted async operation handlers without claiming browser-rendered
or keyboard evidence. An authenticated browser walk remains the instrument for
confirming that the real Diagnostics page displays these entries end to end.
