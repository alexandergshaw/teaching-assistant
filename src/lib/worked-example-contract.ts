// U1 fix: worked examples in generated openers and assignments showed ONE
// row and called it done.
//
// A real generated course (MGT 422) asked students to build a work
// breakdown structure and identify the critical path, then illustrated the
// entire skill with a single task entry (Task/Predecessor/Duration/Start/End
// - one row). That teaches FORMATTING, not the skill being assessed - a
// student who copies the shape has no idea what a critical path even looks
// like. The class opener's warm-up had the identical shape: a 4-task
// exercise illustrated by one 3-field entry.
//
// The root cause is CONCRETE_DIRECTION_CONTRACT itself (src/lib/artifact-
// voice.ts), composed into every hands-on generator in the app: it asks for
// "ONE worked mini-example... a single filled-in row, quadrant, or entry".
// That line is exactly right for a SIMPLE example (a single stakeholder
// entry, a single risk score) but wrong for a deliverable whose whole point
// is the RELATIONSHIP between rows - a schedule's critical path, a register's
// ranking - where one row cannot show the thing being assessed at all.
//
// artifact-voice.ts is shared by generators outside this fix's scope (slide
// decks, course guides, live-class content), so this constant is composed
// ALONGSIDE CONCRETE_DIRECTION_CONTRACT, in the two generators U1 actually
// covers (the assignment-instructions prompt in shared.ts and the class-
// opener prompt in research.ts), rather than edited into it - it explicitly
// overrides the "single row" scope for exactly those two prompts, without
// touching the shared contract every other caller still relies on unchanged.
//
// Pure: no I/O, no Date, no randomness.
export const WORKED_EXAMPLE_CONTRACT = `WORKED EXAMPLE SCOPE (overrides "a single filled-in row, quadrant, or entry" above for this document): the worked example must show a COMPLETE small instance of the deliverable, not one row, quadrant, or entry - include enough rows/entries for the relationships between them to be visible (at least 3-4 for a table, register, network, or schedule), plus the RESULT that is derived from them (a critical-path example must state which sequence is critical AND why; a risk-register example must show the scores AND which risk therefore ranks highest). The example must demonstrate the HARDEST step being assessed, not the easiest formatting step - an entry that only shows column labels does not satisfy this. Use a scenario clearly different from the student's own project or assignment subject so it cannot be copied, and say plainly that it is a model to learn the pattern from, not a template to fill in.`;
