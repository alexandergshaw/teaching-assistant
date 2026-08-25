# The weekly announcement's post time, specifiable in the UI

The owner's report (2026-08-25): *"the time for the announcement scheduler
should be something i can specify via the ui"*.

## What is actually there today

A control exists and is correctly bound - `postTime`, "Post time (optional)",
on the `schedule-weekly-announcements-for-term` step, bound as a runtime field
in the `SCHEDULE_WEEKLY_ANNOUNCEMENTS` preset. So this is not a missing input.

**It is a free-text field whose value is silently discarded unless it is exactly
24-hour `HH:MM`.** `parsePostTime` (`src/lib/announcement-schedule.ts`) matches
`/^([01]?\d|2[0-3]):([0-5]\d)$/` and returns the 8:00 AM default for anything
else - no error, no warning, nothing in the run result. So `9:30am`,
`09:30 AM`, `9.30`, or a stray trailing space all schedule **every announcement
for the whole term at 8:00 AM**, and nothing says so. From the instructor's
side that is indistinguishable from "I cannot set the time".

The silent fallback is deliberate - the function's own comment argues an
invalid value should behave like an absent one "never a thrown error over a
scheduling feature that should keep working". That instinct is right about not
throwing and wrong about staying quiet.

## Acceptance criteria

### T1 - a real time control

1. The run form gains a `time` field type, rendering a native time input, so
   the value it produces is unambiguous `HH:MM` by construction rather than by
   the instructor guessing the format. Today's renderer has `text`, `number`,
   `date` and others - `date` already proves the pattern
   (`RuntimeFieldInput.tsx`).
2. `postTime` becomes that type. Its help text stops teaching a format the
   widget now enforces, and keeps saying what BLANK means.
3. The builder-side editors that branch on field type must handle the new type
   rather than falling through to something odd - check `InputBindingRow.tsx`
   and `LiteralEditor.tsx`, both of which already special-case `date`.

### T2 - blank still means the default; wrong never means the default silently

4. **Blank remains 8:00 AM.** That is documented, intended, and the common
   case - do not turn an empty optional field into an error.
5. **A present but unparseable value is REPORTED.** It may still fall back
   rather than throwing (T1 makes it nearly unreachable anyway), but the run
   must say it did. Scheduling a whole term at the wrong hour, silently, is the
   defect - not the fallback itself.
6. `parsePostTime`'s existing callers must keep compiling and behaving; if
   reporting needs a different shape, add to it rather than changing what every
   caller already relies on.

### T3 - what must not change

7. The default hour and minute constants.
8. The strict `HH:MM` contract at the parsing boundary. A time picker removes
   the need for lenient parsing; it does not license guessing at `9.30`.
9. The weekday control, and the rule that every week's announcement uses the
   chosen weekday independent of the course start date's own weekday.

### T4 - gates

`npx eslint` clean on touched paths; `npx tsc --noEmit` clean; full `vitest
run` green from the 13785 baseline measured at dispatch; `npx next build`
reaching "Compiled successfully" and "Finished TypeScript". The parsing and
reporting decisions are pure and must be tested directly - vitest here is
node-env and renders no component, so the new field type's RENDERING cannot be
covered by any test and must be verified by reading.
