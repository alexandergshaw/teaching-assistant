import { courseKindContract, courseKindNoun, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { stripModelUrls } from "@/lib/urls";
import { jsonObjectSlice } from "@/lib/json-slice";

/**
 * Generate an "introduce yourself and your career" graded discussion prompt
 * for the module a Modules-view selection targets
 * (docs/intro-discussion-from-modules-acceptance-criteria.md, AC17-AC19c).
 *
 * Shaped like generateLearningResourcesForSelection
 * (./learning-resources-generator.ts) - a plain async export with no
 * "use server" directive (this file is a leaf the runner calls directly, not
 * a Server Action boundary of its own), an `provider === "embedded"`
 * deterministic short-circuit before any model call, and stripModelUrls run
 * over every model-authored string before it can reach a posted discussion.
 *
 * Every field below arrives from the caller (A8's generateFromSelectionAction)
 * already resolved - this file does no Supabase access, no Canvas fetch, and
 * critically no date arithmetic of its own. `initialPostDeadlineText` and
 * `repliesDeadlineText` are plain, already-formatted strings (either a real
 * calendar date+time or the AC21 fallback phrase, "11:59pm Thursday of this
 * module's week" / "11:59pm Sunday of this module's week") - this file never
 * inspects which kind of string it received and must not try to parse or
 * reformat either one. A model asked to compute "the Sunday of week 7" gets
 * it wrong, and so does string-munging a date here (AC20).
 */
export interface IntroDiscussionContext {
  courseName: string;
  courseCode: string | null;
  description: string | null;
  topicOutline: string | null;
  institution: string | null;
  /** The module this discussion is generated for and will default to
   *  posting into (AC18). */
  targetModuleName: string;
  /** Every OTHER module in the course, in Canvas order (AC18, "other modules
   *  submitted as context"). May be empty - a single-module course, or a
   *  selection where the module-list fetch degraded (see the caller's own
   *  W5 handling), still generates. */
  otherModuleNames: string[];
  materialsText: string;
  /** Already formatted by the caller (AC20/AC21) - a concrete calendar date
   *  ("Thursday, October 9 at 11:59pm") or the no-start-date fallback phrase.
   *  Never a Date, never touched by date arithmetic here. */
  initialPostDeadlineText: string;
  repliesDeadlineText: string;
  requiredReplyCount: number;
  pointsPossible: number;
}

/**
 * The AC20 structural guarantee, and the ONLY place in the returned message
 * that states a deadline, a reply count, or a point value. Appended by CODE
 * after the model's prose, exactly as buildResourcesSection is appended
 * after the prose in learning-resources-generator.ts.
 *
 * This used to sit alongside a prompt that ALSO asked the model to mention
 * both deadlines and the points value in its own prose - which produced a
 * real, shipped defect: an instructor previewing the discussion (and then a
 * student reading it in Canvas) could see "post by Thursday, October 9 at
 * 11:59pm" once in the model's wording and once more in this block, reading
 * as a mistake and inviting the two copies to drift apart under a hand-edit.
 * The prompt below now explicitly forbids the model from restating any of
 * these three values - see the "CONTEXT ONLY" paragraph - and
 * stripRestatedDeadlineLines is the backstop for when it does so anyway: a
 * prompt instruction alone is not something a test can rely on as a
 * guarantee (this repo has been bitten by treating model compliance as one
 * before), so the code strips a restated deadline line rather than merely
 * hoping the model omits it.
 *
 * Worded as two separate dated obligations, not one sentence carrying two
 * dates (AC19b) - "Post your introduction by X. Then reply substantively to
 * at least N classmates by Y." - followed by the points value and an
 * explicit statement that the two parts are graded separately (AC19b, last
 * bullet). `initialPostDeadlineText` / `repliesDeadlineText` are read
 * identically whether they are concrete dates or the AC21 fallback phrases -
 * this function does not, and must not, special-case either.
 */
function buildDeadlinesBlock(context: IntroDiscussionContext): string {
  return [
    `Post your introduction by ${context.initialPostDeadlineText}. Then reply substantively to at least ${context.requiredReplyCount} classmates by ${context.repliesDeadlineText}.`,
    `This discussion is worth ${context.pointsPossible} points. The initial post and the replies are graded separately.`,
  ].join("\n\n");
}

/**
 * Backstop for the "forbid restating" instruction in the prompt below: strip
 * any line of the model's prose that echoes either deadline text verbatim,
 * BEFORE buildDeadlinesBlock's own, authoritative statement of the same
 * value is appended. Both deadline texts are handed to the model as literal
 * context strings (the "CONTEXT ONLY" paragraph in the prompt itself, not
 * buildModuleContextBlock), so any line where the model echoes one back is
 * guaranteed to contain that exact substring - this is a reliable structural
 * check, not a guess, and it can never remove a line that never mentions
 * either deadline text at all.
 *
 * Deliberately drops the WHOLE line rather than attempting to excise just
 * the matched phrase from the middle of a sentence: splitting a sentence
 * apart at an arbitrary substring boundary tends to leave a grammatically
 * broken fragment behind, which reads worse than losing one line of prose a
 * plain, working prompt is being explicitly told not to write in the first
 * place. `initialPostDeadlineText` / `repliesDeadlineText` are read
 * identically whether they are concrete dates or the AC21 fallback phrases -
 * exactly like buildDeadlinesBlock above, this never special-cases either.
 */
function stripRestatedDeadlineLines(text: string, context: IntroDiscussionContext): string {
  const needles = [context.initialPostDeadlineText, context.repliesDeadlineText].filter(
    (needle) => needle.trim().length > 0
  );
  if (needles.length === 0) return text;
  return text
    .split(/\r?\n/)
    .filter((line) => !needles.some((needle) => line.includes(needle)))
    .join("\n");
}

/**
 * The module-context half of AC18: names the target module and lists every
 * other module in the course, in the order the caller supplied (Canvas
 * order). Shared by both the embedded scaffold and the model prompt so the
 * two paths never describe the course structure differently.
 */
function buildModuleContextBlock(context: IntroDiscussionContext): string {
  const lines: string[] = [];
  lines.push(
    `COURSE: ${context.courseName}${context.courseCode ? ` (${context.courseCode})` : ""}`
  );
  if (context.institution) lines.push(`INSTITUTION: ${context.institution}`);
  if (context.description) lines.push(`COURSE DESCRIPTION: ${context.description}`);
  if (context.topicOutline) lines.push(`COURSE TOPICS: ${context.topicOutline}`);
  lines.push(`THIS DISCUSSION BELONGS TO MODULE: ${context.targetModuleName}`);
  lines.push(
    context.otherModuleNames.length > 0
      ? `OTHER MODULES IN THIS COURSE (context only - this discussion is generated for and defaults to posting into "${context.targetModuleName}"):\n${context.otherModuleNames.map((name) => `- ${name}`).join("\n")}`
      : "OTHER MODULES IN THIS COURSE: none - this appears to be the only module, or no other modules could be listed."
  );
  return lines.join("\n");
}

/**
 * Embedded Deterministic Engine scaffold (AC per the `resources`/`objectives`
 * precedent: every non-model provider still returns real, grounded content,
 * never a stub). Every course-specific detail here is pulled verbatim from
 * `context` - the module names, the course topics, the two deadline texts,
 * the reply count, and the points value - nothing is invented. Run through
 * stripModelUrls exactly like the model path below: `context.topicOutline`
 * is instructor-entered free text and could in principle carry a URL, and
 * this scaffold must not forward one unfiltered any more than the model path
 * may.
 */
function scaffoldIntroDiscussion(context: IntroDiscussionContext): { title: string; message: string } {
  const title = `Introduce Yourself: ${context.targetModuleName}`;

  const topicsLine = context.topicOutline?.trim()
    ? context.topicOutline.trim()
    : [context.targetModuleName, ...context.otherModuleNames].join(", ");

  const body = [
    `Welcome to ${context.courseName}! Use this discussion to introduce yourself to the rest of the class.`,
    [
      `In your initial post (150-250 words), cover all four of these:`,
      "- Your name and your program or role.",
      "- A concrete career anchor: your current job, a target job, or a role you are curious about.",
      `- One explicit link between that career and this course: name one skill from this course you expect to use, and where. This course covers ${topicsLine} - ground your answer in one of those, not in generalities.`,
      "- One small human detail that gives classmates something to reply to (a hobby, a hometown, a favorite show - anything low-stakes).",
    ].join("\n"),
    `Then reply to at least ${context.requiredReplyCount} classmates. A substantive reply asks a follow-up question or names something you have in common with that classmate - "great post!" or similar on its own does not count.`,
  ].join("\n\n");

  return {
    title,
    message: [body, buildDeadlinesBlock(context)].join("\n\n"),
  };
}

export async function generateIntroDiscussionForSelection(
  context: IntroDiscussionContext,
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<{ title: string; message: string } | { error: string }> {
  // Embedded Deterministic Engine: template the discussion straight from the
  // caller-supplied context, never a model call, never a silent failure -
  // same precedent as generateLearningResourcesForSelection's own
  // `provider === "embedded"` branch.
  if (provider === "embedded") {
    const scaffolded = scaffoldIntroDiscussion(context);
    return { title: scaffolded.title, message: stripModelUrls(scaffolded.message).trim() };
  }

  const prompt = `You are an expert educator writing an "introduce yourself and your career" DISCUSSION BOARD prompt for a ${courseKindNoun(courseKind)}.

${courseKindContract(courseKind)}

${buildModuleContextBlock(context)}

SELECTED MATERIALS FOR THIS MODULE:
${context.materialsText}

Write a welcoming discussion prompt, grounded in the actual course and module context above (never generic), that asks each student to introduce themselves and connect their career to this course. Ask for exactly these four things, so no two posts read alike:
1. Their name and their program or role.
2. A concrete career anchor: their current job, a target job, or a role they are curious about.
3. One explicit link between that career and THIS course's subject matter - phrased as "name one skill from this course you expect to use, and where." Ground this in the real topics named above (the course topics and "${context.targetModuleName}"'s own materials), never in generalities.
4. One small human detail that gives classmates something to reply to (a hobby, a hometown, a favorite show - anything low-stakes).

Give a length target for the initial post of 150-250 words - state it as a RANGE, never as a minimum or an "at least" figure. A floor produces padding; a target produces aim.

Ask students to reply substantively to at least ${context.requiredReplyCount} classmates, and define what "substantive" means concretely: a follow-up question, or naming something they have in common with that classmate. State plainly that a reply like "great post!" on its own does not count.

Mention that students should write and post their own introduction before reading their classmates' posts.

CONTEXT ONLY, DO NOT WRITE THIS INTO YOUR PROSE: the initial post is due ${context.initialPostDeadlineText}, the replies are due ${context.repliesDeadlineText}, and this discussion is worth ${context.pointsPossible} points with the initial post and the replies graded separately. Two sentences stating exactly this are appended automatically after your response. Do not state any deadline, due date, reply count, or point value anywhere in your own text - write only the welcome and the four things students must cover, then stop.

${PLAIN_LANGUAGE_CONTRACT}

Return ONLY valid JSON in this exact shape:
{"title": "...", "message": "..."}

"title" is a short, specific title for this discussion (for example "Introduce Yourself: Careers and ${context.targetModuleName}"). "message" is the discussion prompt itself, written directly to students as plain text/markdown paragraphs - no preamble, no commentary about being an AI or about how this prompt was produced. Do not include any text outside the JSON object.`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
    },
    provider
  );

  if (!result.ok) {
    return { error: `LLM API error for intro discussion "${context.targetModuleName}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
  }

  if (!result.text.trim()) {
    return { error: `Intro discussion generation returned empty response for "${context.targetModuleName}".` };
  }

  const jsonText = jsonObjectSlice(result.text);
  if (!jsonText) {
    return { error: `Could not parse the intro discussion from the model response for "${context.targetModuleName}".` };
  }

  let parsed: { title?: string; message?: string };
  try {
    parsed = JSON.parse(jsonText) as { title?: string; message?: string };
  } catch {
    return { error: `Could not parse the intro discussion from the model response for "${context.targetModuleName}".` };
  }

  const rawTitle = (parsed.title ?? "").trim();

  // Backstop for the prompt's "do not restate the deadlines/reply
  // count/points" instruction (see stripRestatedDeadlineLines' own doc
  // comment) - applied BEFORE stripModelUrls so a restated deadline line
  // that also happens to carry a URL is removed by the more specific check
  // first, though in practice the two never overlap.
  const dedupedMessage = stripRestatedDeadlineLines((parsed.message ?? "").trim(), context);

  // D1/A8 precedent (learning-resources-generator.ts): the last line of
  // defense against an invented link, applied unconditionally regardless of
  // whether the prompt above was followed.
  const strippedMessage = stripModelUrls(dedupedMessage).trim();

  // A response that is nothing but an invented link (or is otherwise empty)
  // strips down to "" - that must surface as an error, never as an empty
  // success silently saved and posted into a module (AC applies the same
  // rule the resources/objectives generators already enforce).
  if (!strippedMessage) {
    return { error: `Intro discussion generation for "${context.targetModuleName}" contained no content once invented links were removed.` };
  }

  if (!rawTitle) {
    return { error: `Intro discussion generation for "${context.targetModuleName}" returned no title.` };
  }

  return { title: rawTitle, message: [strippedMessage, buildDeadlinesBlock(context)].join("\n\n") };
}
