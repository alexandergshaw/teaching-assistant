import { courseKindContract, courseKindNoun, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { stripModelUrls } from "@/lib/urls";

/**
 * Generate a current-events RESEARCH ASSIGNMENT body for one module in a
 * Modules-view bulk fan-out
 * (docs/current-events-assignment-from-modules-acceptance-criteria.md, section
 * 3b, D3).
 *
 * Shaped like generateIntroDiscussionForSelection
 * (./intro-discussion-generator.ts) - a plain async export with NO
 * "use server" directive (this file is a leaf the caller invokes directly,
 * once per module inside a Promise.allSettled fan-out - D3 - not a Server
 * Action boundary of its own), a `provider === "embedded"` deterministic
 * short-circuit before any model call, and stripModelUrls run over every
 * model-authored string before it can reach a posted assignment.
 *
 * Two deliberate divergences from the sibling generator, both required by D2
 * and W7:
 *
 * 1. This function returns ONLY a body, never a title. The title
 *    ("<module topic> - Current Events Research") is derived by CODE
 *    (1A's currentEventsAssignmentTitle) because it is the IDEMPOTENCY KEY: a
 *    model-authored title differs between runs, so the by-name pre-check
 *    would never match and every re-run would duplicate every assignment.
 * 2. The model is FORBIDDEN from stating any date, point value, or length
 *    target anywhere in its own prose. 1A's buildCurrentEventsRequirementsBlock
 *    is the SOLE authoritative statement of all three, appended by the caller
 *    (1E) after this function returns - exactly as buildDeadlinesBlock is
 *    appended after the model's prose in the sibling generator. Entry 328's
 *    shipped defect was two copies of one deadline drifting apart; this
 *    generator never states a date or a point value at all, so there is only
 *    ever one copy.
 *
 * `context.recencyWindow` and `context.lengthTarget` arrive from the caller
 * already resolved as plain, already-formatted strings - this file does no
 * date arithmetic of its own (AC11) and must not try to parse or reformat
 * either one. `recencyWindow` is RELATIVE phrasing ("in the last 30 days"),
 * never a hardcoded absolute date (AC10), because the assignment text
 * outlives the day it was generated.
 */
export interface CurrentEventsAssignmentContext {
  courseName: string;
  courseCode: string | null;
  description: string | null;
  topicOutline: string | null;
  institution: string | null;
  /** The module this assignment is generated for (AC12). */
  moduleName: string;
  /** This module's own topic, with its "Module NN:" label already stripped
   *  by the caller - the thing the current-events research must relate to. */
  moduleTopic: string;
  /** This module's item titles, already in hand client-side (AC12) - no
   *  extra Canvas call. May be empty. */
  itemTitles: string[];
  /** Relative recency phrasing, e.g. "in the last 30 days" (AC10). Read
   *  identically regardless of its exact wording - never parsed here. */
  recencyWindow: string;
  /** Already-formatted length guidance, e.g. "3-4 paragraphs (roughly
   *  300-500 words)". CONTEXT ONLY for this generator - see the "CONTEXT
   *  ONLY" paragraph in the prompt below - the model must not restate it,
   *  because 1A's requirements block is the sole authoritative statement
   *  (W7). Passed in only so the model can be told not to restate it. */
  lengthTarget: string;
}

/**
 * The module-context half of AC12: names the module this assignment belongs
 * to, its topic, its item titles, and the surrounding course fields
 * (including institution - W10). Shared by both the embedded scaffold and the
 * model prompt so the two paths never describe the module differently.
 */
function buildModuleContextBlock(context: CurrentEventsAssignmentContext): string {
  const lines: string[] = [];
  lines.push(
    `COURSE: ${context.courseName}${context.courseCode ? ` (${context.courseCode})` : ""}`
  );
  if (context.institution) lines.push(`INSTITUTION: ${context.institution}`);
  if (context.description) lines.push(`COURSE DESCRIPTION: ${context.description}`);
  if (context.topicOutline) lines.push(`COURSE TOPICS: ${context.topicOutline}`);
  lines.push(`THIS ASSIGNMENT BELONGS TO MODULE: ${context.moduleName}`);
  lines.push(`THIS MODULE'S TOPIC: ${context.moduleTopic}`);
  lines.push(
    context.itemTitles.length > 0
      ? `THIS MODULE'S MATERIALS:\n${context.itemTitles.map((title) => `- ${title}`).join("\n")}`
      : "THIS MODULE'S MATERIALS: none listed."
  );
  return lines.join("\n");
}

// W5: descriptionToHtml passes text through unchanged as HTML when it sees
// `<` followed by a letter and a later `>` - the prompt forbids angle
// brackets outright, and this is the backstop for when the model emits one
// anyway. Removed unconditionally rather than only in that exact shape,
// since a lone stray bracket is just as capable of confusing the same
// regex on a later edit.
function stripAngleBrackets(text: string): string {
  return text.replace(/[<>]/g, "");
}

// W7 backstop: the model is told, in the "CONTEXT ONLY" paragraph below, not
// to restate the length target, a due date, or a point value anywhere in its
// own prose - buildCurrentEventsRequirementsBlock (1A) is the sole
// authoritative statement of all three, appended by the caller after this
// function returns. A prompt instruction alone is not something a test can
// rely on as a guarantee (this repo has been bitten by treating model
// compliance as one before - see stripRestatedDeadlineLines in the sibling
// generator), so every line that looks like it states one of the three is
// dropped outright rather than merely hoped away.
//
// The length target is stripped by verbatim match, exactly like the sibling
// generator's deadline-text match, since it is handed to the model as a
// literal context string. A date or a point value is never handed to this
// generator at all (D4's structural guard: CurrentEventsGenerationRequest has
// no date field), so the model has nothing specific to echo - but it can
// still HALLUCINATE one from training-data habit ("This is due Friday" /
// "worth 20 points"), which is what the pattern-based checks below catch.
//
// Both patterns are deliberately narrower than "the grading word appears
// anywhere in the line" (step 10c review, finding 2): the assignment prompt
// this generator writes legitimately uses "points" and "date"/"submit" in
// non-grading senses - "Identify 3 points of connection", "cite it with...
// the date it was published", "Your submitted work should be based on an
// article published by a reputable outlet" - and the original, broader
// regexes deleted those whole lines (this generator's paragraphs are full
// lines, not short fragments), silently removing AC9's citation instructions
// along with the intended restatement.
//
// POINTS_STATEMENT_RE excludes "<number> points" when immediately followed
// by a preposition ("points of", "points to", "points about", "points for",
// "points on", "points in") - that shape is enumeration language ("3 points
// of connection"), never a grading statement ("worth 20 points.", "20
// points possible").
const POINTS_STATEMENT_RE =
  /\b\d+(?:\.\d+)?\s*points?\b(?!\s*(?:of|to|about|for|on|in)\b)|\bpoints?\s*(?:possible)?\s*:\s*\d+/i;

const WEEKDAY_RE = /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i;
const MONTH_RE =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const NUMERIC_DATE_RE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/;
const DUE_PHRASE_RE = /\b(?:due|deadline|submit(?:ted)?)\b.{0,40}?\b(?:on|by|date|at)\b/i;
const CLOCK_TIME_RE = /\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\b/i;

// DUE_PHRASE_RE alone is too loose to gate a whole-line deletion on: "Submit
// your response along with the date the article was published" matches it
// (submit -> date), and so does "Your submitted work should be based on an
// article published by a reputable outlet" (submitted -> on, from "based
// on") - neither one states a deadline. A genuine restatement of a due date
// always carries an actual date signal alongside the due/submit/deadline
// word (a weekday, a month name, a numeric date, or a clock time); requiring
// that co-occurrence is what tells "the date it was published" apart from
// "due Sunday, October 11 at 11:59 PM."
function looksLikeDateOrPointsStatement(line: string): boolean {
  const hasDateSignal = WEEKDAY_RE.test(line) || MONTH_RE.test(line) || NUMERIC_DATE_RE.test(line);
  return (
    POINTS_STATEMENT_RE.test(line) ||
    (DUE_PHRASE_RE.test(line) && (hasDateSignal || CLOCK_TIME_RE.test(line)))
  );
}

function stripForbiddenRestatements(text: string, context: CurrentEventsAssignmentContext): string {
  const lengthNeedle = context.lengthTarget.trim();
  return text
    .split(/\r?\n/)
    .filter((line) => {
      if (lengthNeedle && line.includes(lengthNeedle)) return false;
      if (looksLikeDateOrPointsStatement(line)) return false;
      return true;
    })
    .join("\n");
}

/**
 * Embedded Deterministic Engine scaffold (AC per the resources/objectives
 * precedent: every non-model provider still returns real, grounded content,
 * never a stub). Every course-specific detail here is pulled verbatim from
 * `context` - never invented - and states no date, point value, or length,
 * matching the model path's own restriction. Run through stripModelUrls
 * exactly like the model path below: `context.topicOutline` is
 * instructor-entered free text and could in principle carry a URL.
 */
function scaffoldCurrentEventsAssignment(context: CurrentEventsAssignmentContext): string {
  const body = [
    `This assignment asks you to connect ${context.courseName} to something happening right now.`,
    [
      `Find one recent, real news item or development ${context.recencyWindow} that relates to this module's topic: ${context.moduleTopic}.`,
      "Cite it with a link to the source and the date it was published or reported.",
      "Then write a submission that does all of the following:",
      "- Summarize the item in your own words.",
      `- Connect it directly to what this module covers (${context.moduleTopic}) - say specifically what it confirms, complicates, or changes about what you have learned here.`,
      "- Explain why this connection matters, not just that one exists.",
    ].join("\n"),
    "Submit your response as text directly in Canvas.",
  ].join("\n\n");

  return body;
}

export async function generateCurrentEventsAssignmentForModule(
  context: CurrentEventsAssignmentContext,
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<{ body: string } | { error: string }> {
  // Embedded Deterministic Engine: template the assignment straight from the
  // caller-supplied context, never a model call, never a silent failure -
  // same precedent as generateIntroDiscussionForSelection's own
  // `provider === "embedded"` branch.
  if (provider === "embedded") {
    const scaffolded = stripModelUrls(scaffoldCurrentEventsAssignment(context)).trim();
    if (!scaffolded) {
      return { error: `Current events assignment generation for "${context.moduleName}" contained no content once invented links were removed.` };
    }
    return { body: scaffolded };
  }

  const prompt = `You are an expert educator writing a CURRENT EVENTS RESEARCH ASSIGNMENT for a ${courseKindNoun(courseKind)}.

${courseKindContract(courseKind)}

${buildModuleContextBlock(context)}

Write an assignment prompt, grounded in the actual module context above (never generic), that asks each student to:
1. Find a recent, REAL news item or development ${context.recencyWindow} that relates to this module's topic ("${context.moduleTopic}"). Tell them to cite it with a link to the source and the date it was published or reported.
2. Write their submission as plain text directly in Canvas.
3. Connect the item back to what this module covers - what it confirms, complicates, or changes about what they have learned. This connection is the point of the assignment, not an afterthought.

Do NOT tell students where to search or name any specific news outlet, database, or search engine - they choose their own source.

CONTEXT ONLY, DO NOT WRITE THIS INTO YOUR PROSE: the expected length is ${context.lengthTarget}. Do not state any due date, deadline, point value, or length/word/paragraph target anywhere in your own text - not even a vague one ("by the end of the week", "a short paragraph"). Code appends the exact deadline, point value, and length requirement automatically after your response. Write only the assignment prompt itself: what to find, how to cite it, and what to connect it to, then stop.

Do not use angle brackets ("<" or ">") anywhere in your response.

${PLAIN_LANGUAGE_CONTRACT}

Return ONLY the assignment prompt as plain text paragraphs - no JSON, no markdown headers, no title, no preamble, no commentary about being an AI or about how this prompt was produced. Do not include any text outside the assignment prompt itself.`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
    },
    provider
  );

  if (!result.ok) {
    return { error: `LLM API error for current events assignment "${context.moduleName}": HTTP ${result.status} - ${result.body.slice(0, 200)}` };
  }

  if (!result.text.trim()) {
    return { error: `Current events assignment generation returned empty response for "${context.moduleName}".` };
  }

  // Backstop for the prompt's "do not restate the length/date/points, do not
  // use angle brackets" instructions (see stripForbiddenRestatements' and
  // stripAngleBrackets' own doc comments) - applied BEFORE stripModelUrls so
  // a restated line that also happens to carry a URL is removed by the more
  // specific check first, though in practice the two rarely overlap.
  const withoutRestatements = stripForbiddenRestatements(result.text.trim(), context);
  const withoutAngleBrackets = stripAngleBrackets(withoutRestatements);

  // D1/A8 precedent (learning-resources-generator.ts, intro-discussion-generator.ts):
  // the last line of defense against an invented link, applied unconditionally
  // regardless of whether the prompt above was followed.
  const strippedBody = stripModelUrls(withoutAngleBrackets).trim();

  // A response that is nothing but a restated deadline, an invented link, or
  // stray angle brackets strips down to "" - that must surface as an error,
  // never as an empty success silently saved and posted into a module.
  if (!strippedBody) {
    return { error: `Current events assignment generation for "${context.moduleName}" contained no content once forbidden restatements and invented links were removed.` };
  }

  return { body: strippedBody };
}
