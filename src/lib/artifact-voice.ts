// The shared voice contract for every student-facing generated artifact.
//
// An instructor reviewing a real generated course (a 16-week MGT 422 project
// management course) found the slides, class openers, and assignment
// instructions reading like a professional writing to other professionals:
// "the levers of project success", "the social architecture of the project
// environment", tasks like "select a real-world project" with no examples of
// what qualifies, and warm-ups that ask for a filled-in grid without ever
// showing one filled in. None of that is a per-generator bug - it is the
// same voice missing from every prompt that talks to a student.
//
// These two constants are that voice, defined once and composed VERBATIM
// into every student-facing generator, the same way courseKindContract (see
// src/lib/course-kind.ts) is composed rather than re-described - so the
// course speaks with one voice and there is exactly one place to tune it.
//
// PLAIN_LANGUAGE_CONTRACT belongs in anything a student reads: slides,
// module intros, assignments, tests, examples, class openers.
// CONCRETE_DIRECTION_CONTRACT belongs additionally in anything that hands
// the student an open-ended task, where "select a project" or "list two
// stakeholders" needs real options and a worked example to be actionable.
//
// Pure: no I/O, no Date, no randomness.

export const PLAIN_LANGUAGE_CONTRACT = `LANGUAGE: write for a reader with NO prior experience of this subject - someone encountering it for the first time. Prefer the everyday word over the professional one ("what students need to figure out" beats "identifying project stakeholders"; "who this affects and how much" beats "the universe of impact"). When a field term IS genuinely required (a certification-facing course needs the real vocabulary the exam uses), give it in plain English on first use, then use the term normally afterward. Cut abstract filler that could describe any topic in any field - phrases like "the levers of success" or "the social architecture of X" explain nothing; say the concrete thing instead. Write short, concrete sentences. Address the reader as "you". Stay professional throughout: plain is not casual - no slang, no jokes, and never talk down to the reader.`;

export const CONCRETE_DIRECTION_CONTRACT = `CONCRETE DIRECTION: when handing the student a task, name 2-4 specific example directions they could take - real, recognizable options (an actual company, scenario, or system), never abstract categories. State the expected scope explicitly: how many items, how long, what format. Then show ONE worked mini-example of the expected output - a single filled-in row, quadrant, or entry, not the whole assignment - so the student can see what "good" looks like before they start. Say explicitly that this example is a model to learn the pattern from, not a template to copy.`;
