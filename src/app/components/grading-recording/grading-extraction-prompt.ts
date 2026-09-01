// Extraction prompt leaf for grading-via-recording (docs/grading-via-recording-
// acceptance-criteria.md sections 1 and 3). Pure and dependency-free (no
// React, no DOM, no "use server") so it is safe to import from BOTH a future
// client capture module and the "use server" action
// (src/app/actions/grading-submission-extract.ts) - the same discipline
// discussion-reply-prompt.ts and legibility-probe.ts already follow in this
// codebase.
//
// R4b is explicit that this must be a NEW prompt, not a parameterisation of
// buildPostExtractionPrompt (src/lib/discussion-reply-prompt.ts): every clause
// of that prompt names forum furniture (posts, threads, replies, "Like"
// buttons). This prompt reads student submissions - a document, code, a PDF,
// an LMS submission view - which is a different reading task with different
// failure modes, so nothing here is imported from or shared with that file.

/**
 * Caps how many frames one extraction batch sends to the model. Its OWN
 * constant, independently chosen - not a reuse of discussion-reply-prompt.ts's
 * EXTRACT_BATCH_SIZE or legibility-probe.ts's PROBE_MAX_FRAMES, per R4b's rule
 * that pieces built for a different instrument/loop must not be reused here
 * just because the numbers would happen to match. Landing on the same value
 * (6) is coincidence, not coupling: it is the same reasoning EXTRACT_BATCH_SIZE
 * used - enough frames to cover a scroll through one submission, cheap enough
 * to keep a batch fast - applied fresh to this surface.
 */
export const GRADING_EXTRACT_BATCH_SIZE = 6;

/**
 * Truncation cap for one extracted submission's text, mirroring MAX_POST_CHARS'
 * role in discussion-reply-prompt.ts (truncate with a visible "..." marker,
 * never silently) but declared independently, per R4b. Deliberately the SAME
 * numeric value as MAX_POST_CHARS for now: R1/R1b measured only whether a
 * submission page is LEGIBLE at all, not how long a real submission's
 * transcribed text runs, so there is no measured basis yet for picking a
 * larger number - and a larger cap directly competes with
 * GRADING_EXTRACT_BATCH_SIZE submissions needing to fit inside one
 * maxOutputTokens response. Easy to raise later once real submission lengths
 * are observed; kept conservative until then.
 */
export const MAX_SUBMISSION_CHARS = 4000;

/**
 * Prompt for reading student submissions off N consecutive, heavily-
 * overlapping screenshots of an instructor scrolling or paging through their
 * work. Structured like buildPostExtractionPrompt (dedup across overlapping
 * frames, a hard rule on cut-off text, an explicit output contract) because
 * that shape is proven, but every clause below is written fresh for what a
 * submission actually looks like on screen - not adapted from forum language.
 *
 * R3 / THE NAME RULE: carried over from the discussion prompt's own skip-if-
 * unnamed rule, stated as forcefully as that original does, because the
 * failure mode is identical and worse here - a rubric-scored feedback block
 * attached to the wrong student's name is not a cosmetic mistake.
 *
 * R1a / IF THERE ARE NO SUBMISSIONS: unlike buildPostExtractionPrompt (which
 * lets a genuinely post-free batch return a bare `[]`), this prompt REFUSES
 * a bare empty array. When nothing is visible, the model must return a
 * single explicit marker element naming what it actually saw instead. This
 * is what lets extractGradingSubmissionsAction (src/app/actions/
 * grading-submission-extract.ts) tell "the model read this and confirms
 * there is nothing here" apart from "the model returned nothing and said
 * why" - see that action's own header for how the two are distinguished.
 */
export function buildSubmissionExtractionPrompt(frameCount: number): string {
  return [
    `The ${frameCount} image${frameCount === 1 ? " is a single screenshot" : "s are consecutive screenshots"} of an instructor's screen, captured about a second apart while they scrolled or paged through student submissions - a document, code, a PDF, or an LMS submission view.`,

    "Read the student submissions shown and return them.",

    "HOW THE IMAGES RELATE TO EACH OTHER",
    "- The images overlap heavily. The same submission will usually appear in several of them, in a different position each time, or scrolled to a different part of the same document. That is one submission, not several. Return it ONCE.",
    "- When a submission appears in more than one image, use the reading in which the MOST of its text is visible.",
    "- When one part of a submission is visible in one image and a later part is visible in another, join the parts into one submission and return the joined text.",
    "- Read the images in the order given.",

    "WHAT COUNTS AS A SUBMISSION",
    "- A submission is one student's own written or coded work - an essay, a short answer, a document, a block of code, a discussion-style response - shown on screen and attributed to that student.",
    "- Ignore everything that is page furniture rather than a student's own work: navigation bars and menus, a gradebook or submission list, file browser panels, breadcrumbs, buttons and links such as Download, Next, Previous, Submit or Grade, toolbars, a rubric or grading panel, comments or annotations the instructor themselves is typing, avatars and profile pictures.",
    "- If the same student's work is shown more than once (for example a document view, then a zoomed-in view of the same paragraph), that is still one submission - follow the dedup rule above rather than returning it twice.",

    "THE NAME RULE - THE MOST IMPORTANT RULE HERE",
    "- A submission's name is the student's name exactly as printed on screen next to or above their work: a header, a file-list entry, or a submission-view byline.",
    "- If you cannot actually SEE a name for a submission - because it scrolled past, is hidden behind a menu, was cropped out of every image, or was simply never shown - SKIP THAT SUBMISSION ENTIRELY. Do not return it at all.",
    "- Never guess whose submission it is. Never attribute it to the nearest visible name, a name from an earlier or later image, a file name, a folder name, or any name you might otherwise know belongs to this course. If the name is not literally visible next to this submission, leave the submission out.",
    "- A wrong name here means a real student receives feedback meant for someone else. When in doubt, leave it out.",

    "TEXT THAT IS CUT OFF",
    '- If a submission is truncated by a control such as "Show more", "Read more", "See more", a scrollbar, or an ellipsis, return only the text that is actually visible, and do NOT include the control\'s own words in the text.',
    "- If a submission runs off the edge of the last image, return the visible part.",
    "- Never continue, complete, summarize, paraphrase, correct or tidy a submission. Transcribe the words that are on the screen. If you cannot read a word, leave it out rather than inventing one.",

    "IF THERE ARE NO SUBMISSIONS",
    '- If these images show only navigation, a gradebook or submission list with nothing open, a loading state, or an empty page, do NOT return an empty array. Return an array with exactly one element instead: {"noSubmissionsVisible": true, "reason": "..."}, where "reason" briefly names what the images actually show (for example "a gradebook list, no submission open" or "a loading spinner"). Always include this element rather than returning nothing at all - a page that genuinely holds no submissions must be told apart from a page you could not make sense of.',

    "OUTPUT",
    "Return ONLY a JSON array, and nothing else.",
    'Each element is either a submission - {"studentName": "...", "submissionText": "..."} - or, only when nothing else applies, the single no-submissions element described above. No other keys.',
    '"studentName" is the name exactly as it is shown, with no title, no timestamp and no role label.',
    '"submissionText" is the submission\'s words as plain text. Use "\\n" between paragraphs. Do not use markdown and do not use backticks.',
    "Order the array the way the submissions appear on the page, top to bottom.",
    "No prose before or after the array. No code fences.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
