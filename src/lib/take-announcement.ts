// Builds the single instruction string draftAnnouncementAction
// (src/app/actions/messaging.ts:405) needs to draft a subject and body from a
// recorded take's transcript. draftAnnouncementAction takes ONE instruction
// string - it does not know about takes, transcripts or recordings - so the
// transcript, the recording's own context and a standing framing instruction
// are composed into that string here, in a pure, dependency-free, testable
// function, rather than inline where the action is called.
//
// No React, no browser API, no "use server": safe to import from a client
// hook and to unit test in Node.

/**
 * Cap on how much of the transcript reaches the drafting prompt, in
 * characters. Same value and same rationale as MODULE_MATERIALS_CAP
 * (src/lib/announcement-module-content.ts:30): a 40-minute recording
 * produces roughly 6000 words of transcript - well past any sensible prompt -
 * and an unbounded transcript is how a draft call starts failing on
 * MAX_OUTPUT_TOKENS for reasons nobody can see. Do not raise this without a
 * reason.
 */
export const TRANSCRIPT_PROMPT_CAP = 8000;

const TRUNCATION_MARKER = " [transcript truncated]";

// docs/reply-composition-controls-acceptance-criteria.md C0-1: this group
// (implementer C2) brings the same reply-composition vocabulary to
// announcements, reusing discussion-reply-prompt.ts's ReplyIngredient /
// ReplyFormality types and REPLY_INGREDIENT_LABELS rather than forking a
// second copy - that file is already the one leaf both the discussion
// controls and its prompt builder import, for exactly this reason.
//
// The ingredient list needed real judgement, not a blind copy of all five:
//   - "compliment" and "deeper-question" are aimed at ONE person's post -
//     an announcement addresses the whole class at once, so there is no
//     single post to compliment and no single argument to push a question
//     deeper on. Omitted.
//   - "correction" gently corrects a factual error IN A POST - an
//     announcement is not a reply to anyone's writing, so there is nothing
//     for it to correct. Omitted.
//   - "insight" and "resources" transfer. "resources" is reinterpreted,
//     though: the discussion side gates a SEPARATE resource-search pass
//     (entry 368's state machine) and there is no such pass, and no per-row
//     surface to attach a fetched link to, on this surface - asking the
//     model to invent one would be exactly the hallucination C2b forbids.
//     Here "resources" instead asks the model to surface a resource ALREADY
//     named in the transcript, never to invent one.
//
// There is deliberately no "address by name" control on this surface at
// all (contrast the discussion side's addressByName toggle, ON by default).
// An announcement has no single recipient - it goes to a whole class under
// the instructor's name - so a per-person greeting toggle would be either a
// no-op or would have to invent a collective address ("Hi everyone") nobody
// asked for. Omitted rather than shipped as a control that silently does
// nothing.
import { REPLY_INGREDIENT_LABELS, type ReplyFormality, type ReplyIngredient } from "@/lib/discussion-reply-prompt";

export type AnnouncementIngredient = Extract<ReplyIngredient, "insight" | "resources">;

export const ANNOUNCEMENT_INGREDIENTS: readonly AnnouncementIngredient[] = ["insight", "resources"];

// Reused verbatim from REPLY_INGREDIENT_LABELS, not forked into a second map.
// Both labels now read correctly on both surfaces: "insight" was renamed at
// the source (discussion-reply-prompt.ts) from "an insight the post did not
// cover" to "an insight not already covered", because "the post" named
// something that does not exist here. Renaming the shared label was the fix;
// forking a second map so each surface could word it differently would have
// been the mistake - entry 372 shipped one set restated in four modules.
export const ANNOUNCEMENT_INGREDIENT_LABELS: Record<AnnouncementIngredient, string> = {
  insight: REPLY_INGREDIENT_LABELS.insight,
  resources: REPLY_INGREDIENT_LABELS.resources,
};

export interface AnnouncementCompositionSettings {
  ingredients: readonly AnnouncementIngredient[];
  formality: ReplyFormality;
}

// C4b-i's reasoning, transferred: NOT inert by default. Both available
// ingredients are pre-selected, so the first announcement drafted after this
// ships is visibly different with no action taken - deliberate. Formality
// still defaults to "balanced", a true no-op (see formalityClause below).
export const DEFAULT_ANNOUNCEMENT_COMPOSITION: AnnouncementCompositionSettings = {
  ingredients: ANNOUNCEMENT_INGREDIENTS,
  formality: "balanced",
};

// docs/reply-composition-controls-acceptance-criteria.md C4b/C4: modulates
// the standing instruction below rather than restating or contradicting it -
// diction only. Reuses the discussion side's exact wording pattern (its own
// formalityClause is private to discussion-reply-prompt.ts, so this is a
// parallel function, not an import) so the two surfaces read as one
// vocabulary. "balanced" is a true no-op - the empty string is dropped by
// the caller below, so a default-formality call is byte-identical to one
// that never mentioned formality at all.
function formalityClause(formality: ReplyFormality): string {
  switch (formality) {
    case "casual":
      return "Lean casual in how you write this: contractions are fine, favor shorter sentences and everyday word choices - without abandoning the warmth and clarity already asked for above.";
    case "formal":
      return "Lean formal in how you write this: avoid contractions, favor fuller sentences and more precise, exact word choices - without abandoning the warmth and clarity already asked for above.";
    case "balanced":
    default:
      return "";
  }
}

// docs/reply-composition-controls-acceptance-criteria.md C2: one prompt
// clause per selected ingredient - see this file's own header for why only
// two of the five reply ingredients exist here.
function announcementIngredientClause(ingredient: AnnouncementIngredient): string {
  switch (ingredient) {
    case "insight":
      return "- Where it fits naturally, add one relevant insight or connection beyond what the transcript explicitly says - never a date, policy, deadline or fact that is not actually in the transcript below.";
    case "resources":
      return "- If the transcript names any specific resource, reading, tool or link, remind students of it in the announcement. Do not invent or write any resource, reading or link that is not already named in the transcript below.";
    default:
      return "";
  }
}

/**
 * The standing instruction, included verbatim in every built prompt so a
 * wording change is a one-line diff here rather than an edit inside a
 * component.
 */
export const TAKE_ANNOUNCEMENT_INSTRUCTION =
  "Write a short announcement for students about this recording. Link the recording's purpose to what they should do next. Do not summarize the video minute by minute.";

export interface TakeAnnouncementContext {
  takeName: string;
  durationSec: number;
  topic?: string;
  objectives?: string;
  cardTitle?: string;
  cardSubtitle?: string;
}

/**
 * Truncates `transcript` to at most `cap` characters (default
 * TRANSCRIPT_PROMPT_CAP), cutting at a word boundary rather than mid-word,
 * and appending a trailing marker so both the model and a human reading the
 * prompt know the transcript was cut. A transcript already at or under the
 * cap is returned completely unchanged - no trim, no marker.
 *
 * The marker's own length is reserved out of the cap up front, so the
 * returned string never exceeds `cap` - a truncation that busts its own
 * limit would defeat the point (same reasoning as formatModuleMaterials in
 * src/lib/announcement-module-content.ts, which this mirrors for the cap
 * arithmetic but not for the cut point - that function cuts at a raw
 * character boundary, which is wrong for a spoken transcript being read by a
 * model as prose).
 */
export function truncateTranscriptForPrompt(transcript: string, cap: number = TRANSCRIPT_PROMPT_CAP): string {
  if (transcript.length <= cap) return transcript;

  const keep = Math.max(0, cap - TRUNCATION_MARKER.length);
  let cut = transcript.slice(0, keep);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 0) {
    cut = cut.slice(0, lastSpace);
  }
  return cut + TRUNCATION_MARKER;
}

function formatDuration(durationSec: number): string {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return "an unknown length";
  const totalSeconds = Math.round(durationSec);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  if (seconds === 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${minutes} minute${minutes === 1 ? "" : "s"} ${seconds} second${seconds === 1 ? "" : "s"}`;
}

/**
 * Composes the transcript, the recording's context, and the standing
 * instruction into the ONE instruction string draftAnnouncementAction takes.
 *
 * Ordering is pinned (standing instruction first, framing and context next,
 * transcript last) because it is what a reader of the prompt - and any
 * future prompt-debugging session - relies on; the exact prose is not, since
 * this repo has twice had a source-text assertion force a contorted
 * implementation to satisfy an over-specified test.
 *
 * docs/reply-composition-controls-acceptance-criteria.md C0-2/C3/C4, this
 * group's own C-2: `composition` is optional, defaulting to the fully inert
 * state (no ingredients, balanced formality) - a call that omits it is
 * byte-identical to this function's pre-composition-controls behaviour,
 * proven in take-announcement.test.ts. The paragraph requirement below is
 * the one UNCONDITIONAL addition (C0-2: a requirement, not a toggle) and is
 * emitted regardless of `composition`.
 */
export function buildTakeAnnouncementInstruction(
  transcript: string,
  context: TakeAnnouncementContext,
  composition: AnnouncementCompositionSettings = { ingredients: [], formality: "balanced" }
): string {
  const truncated = truncateTranscriptForPrompt(transcript);

  const lines: string[] = [
    TAKE_ANNOUNCEMENT_INSTRUCTION,
    "",
    // C3, generalized from the discussion side's C3-i line (same ~60-word
    // threshold and blank-line requirement, reworded for "announcement"
    // rather than "reply"): unconditional, never post-processed - see this
    // file's own C0-2 note above. The owner's separate "plain text
    // copyable" requirement is unaffected: a blank line is plain text, not
    // markdown.
    'If the announcement runs longer than about 60 words, break it into at least two paragraphs, separated by a blank line ("\\n\\n"). Never write it as one unbroken block.',
  ];

  const formality = formalityClause(composition.formality);
  if (formality) lines.push("", formality);

  if (composition.ingredients.length > 0) {
    lines.push(
      "",
      "IN ADDITION, WHERE IT FITS",
      ...composition.ingredients.map((ingredient) => announcementIngredientClause(ingredient))
    );
  }

  lines.push(
    "",
    `This is a transcript of a screen recording titled "${context.takeName}" (${formatDuration(context.durationSec)} long), made by an instructor for their students. Draft the announcement from this transcript - it is source material, not the announcement itself.`
  );

  if (context.topic && context.topic.trim()) {
    lines.push(`Course topic: ${context.topic.trim()}`);
  }
  if (context.objectives && context.objectives.trim()) {
    lines.push(`Learning objectives: ${context.objectives.trim()}`);
  }
  if (context.cardTitle && context.cardTitle.trim()) {
    lines.push(`Recording title card: ${context.cardTitle.trim()}`);
  }
  if (context.cardSubtitle && context.cardSubtitle.trim()) {
    lines.push(`Recording subtitle card: ${context.cardSubtitle.trim()}`);
  }

  lines.push("", "TRANSCRIPT:", truncated);

  return lines.join("\n");
}

/**
 * Cap on how much of the drafted subject+body reaches the image prompt, in
 * characters. Same rationale in miniature as TRANSCRIPT_PROMPT_CAP above: an
 * instructor can freely edit the body in the review TextField before ever
 * regenerating the image, and an unbounded edit is how an image prompt call
 * starts failing for reasons nobody can see. 4000 is far more generous than
 * any real announcement needs (a drafted announcement's own maxOutputTokens
 * budget, ~1024 tokens, tops out around 4000 characters on its own) - this
 * exists as a backstop against a pasted-in essay, not as a routine limiter.
 */
export const IMAGE_PROMPT_TOPIC_CAP = 4000;

const IMAGE_TRUNCATION_MARKER = " [truncated]";

function truncateForImagePrompt(text: string, cap: number = IMAGE_PROMPT_TOPIC_CAP): string {
  if (text.length <= cap) return text;
  const keep = Math.max(0, cap - IMAGE_TRUNCATION_MARKER.length);
  return text.slice(0, keep) + IMAGE_TRUNCATION_MARKER;
}

/**
 * Builds the prompt sent to generateGeminiImage (src/lib/llm.ts) for the
 * announcement's companion image. Pure and dependency-free, like
 * buildTakeAnnouncementInstruction above, so it is unit-testable without a
 * network call and importable from the client hook.
 *
 * The owner's own framing ("a simple, everyday image that is relevant") is
 * encoded directly into the instructions below, plus three constraints this
 * feature's acceptance criteria require unconditionally (not toggles):
 *   - no text/letters/numbers baked into the image - image models render
 *     text badly, and a misspelled word in a generated image would be worse
 *     than no image;
 *   - no real, identifiable person depicted;
 *   - no real school, company, institution, or logo implied.
 * The announcement's own drafted subject and body are the source material
 * (truncated per IMAGE_PROMPT_TOPIC_CAP above) so the image is actually
 * relevant to THIS announcement, not a generic stock illustration.
 */
export function buildAnnouncementImagePrompt(subject: string, body: string): string {
  const topic = truncateForImagePrompt(`${subject.trim()}\n\n${body.trim()}`.trim());

  return [
    "Create ONE simple, everyday, uncluttered illustration relevant to this class announcement - a clean, friendly illustration suitable alongside a college course announcement, not a photo, not a screenshot, not a meme, not a diagram or infographic.",
    "Keep it simple: one clear subject, a plain uncluttered background, nothing busy.",
    "Do not render any text, letters, numbers, or writing anywhere in the image, in any language.",
    "Do not depict any real, identifiable person.",
    "Do not depict or imply any real, specific school, company, or institution - no logos, no signage or branding naming a real place.",
    "",
    "ANNOUNCEMENT THIS IMAGE ILLUSTRATES:",
    topic || "(no announcement text yet)",
  ].join("\n");
}

/**
 * Alt text for the announcement's companion image, posted into the Canvas
 * HTML body alongside it (createAnnouncementAction, src/app/actions/
 * canvas-inbox.ts, via buildAnnouncementBodyHtml in
 * src/lib/canvas/announcements.ts). Students using a screen reader get
 * nothing from an empty or filename-derived alt attribute - and a Canvas
 * upload's filename is a generated slug (announcementImageFileName), not a
 * description, so deriveAltTextFromHtml (src/lib/embedded/accessibility.ts,
 * which derives alt text FROM a filename) is the wrong tool here. This
 * instead derives the description from the announcement's own drafted
 * subject line - the same short, specific text (~10 words,
 * draftAnnouncementAction's own prompt) a sighted reader already sees above
 * the image - so the alt text is meaningful and content-derived, not
 * decorative boilerplate. Falls back to a generic-but-honest description
 * when the subject has been edited down to blank, so the alt attribute is
 * never empty either way.
 */
export function buildAnnouncementImageAltText(subject: string): string {
  const trimmed = subject.trim();
  return trimmed
    ? `Illustration accompanying the announcement: ${trimmed}`
    : "Illustration accompanying this announcement";
}
