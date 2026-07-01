/**
 * Deterministic scaffolds for the inbox / announcement drafters. When the
 * embedded provider is selected these template a professional, editable draft
 * from the instructor's own instruction and thread text, with no model call and
 * without inventing facts (dates, links, grades) that were not provided.
 */

import { capitalizeFirst, cleanText, ensureSentence, splitSentences } from "./scaffold";

/** The account owner never wants long dashes in a draft; mirror the LLM path. */
function stripLongDashes(text: string): string {
  return text.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, "-");
}

// Directive lead-ins ("tell students that …") that front an announcement request.
const ANNOUNCEMENT_DIRECTIVE =
  /^(?:please\s+)?(?:tell|let|inform|notify|remind|announce|advise|update)\s+(?:the\s+)?(?:students?|class|everyone)\s*(?:know\s+)?(?:that|about|to|of)?\s*/i;

/** Derive a short subject line from an announcement instruction. */
function announcementTitle(instruction: string): string {
  const firstSentence = splitSentences(instruction)[0] ?? cleanText(instruction);
  let title = firstSentence
    .replace(/^(?:announcement|reminder|fyi|heads up)[:\-—–]\s*/i, "")
    .replace(ANNOUNCEMENT_DIRECTIVE, "")
    .replace(/[.:;,]+$/, "")
    .trim();
  if (!title) return "Course Announcement";
  const words = title.split(/\s+/);
  if (words.length > 10) title = words.slice(0, 10).join(" ");
  return capitalizeFirst(title);
}

export interface AnnouncementScaffold {
  title: string;
  message: string;
}

/** Wrap the instruction in a warm, professional announcement body. */
export function scaffoldAnnouncement(instruction: string): AnnouncementScaffold {
  const core = capitalizeFirst(ensureSentence(instruction.replace(ANNOUNCEMENT_DIRECTIVE, "")));
  const message = [
    "Hi everyone,",
    core,
    "If you have any questions, please reach out during office hours or by reply.",
    "Thanks,\nYour instructor",
  ].join("\n\n");
  return { title: announcementTitle(instruction), message: stripLongDashes(message) };
}

/**
 * A courteous, editable reply template. Deterministic templating cannot compose a
 * specific answer from the thread, so it acknowledges the message and leaves a
 * clearly marked spot for the instructor's response (folding in a steer note when
 * one was given).
 */
export function scaffoldMessageReply(threadText: string, instructions = ""): { body: string } {
  const steer = instructions.trim()
    ? `[Respond here. You noted: ${capitalizeFirst(ensureSentence(instructions.trim()))}]`
    : "[Add your response here.]";
  const body = [
    "Hi,",
    "Thanks for reaching out. I've read your message and want to make sure I address it fully.",
    steer,
    "Please let me know if you have any other questions.",
    "Best,\nYour instructor",
  ].join("\n\n");
  return { body: stripLongDashes(body) };
}
