/**
 * Deterministic scaffolds for the inbox / announcement drafters. When the
 * embedded provider is selected these template a professional, editable draft
 * from the instructor's own instruction and thread text, with no model call and
 * without inventing facts (dates, links, grades) that were not provided.
 */

import { capitalizeFirst, cleanText, copyedit, ensureSentence, splitSentences } from "./scaffold";

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
  const core = copyedit(instruction.replace(ANNOUNCEMENT_DIRECTIVE, ""));
  const message = [
    "Hi everyone,",
    core,
    "If you have any questions, please reach out during office hours or by reply.",
    "Thanks,\nYour instructor",
  ].join("\n\n");
  return { title: announcementTitle(instruction), message: stripLongDashes(message) };
}

// Authors that are the instructor / system rather than a student to greet.
const NON_STUDENT_AUTHOR = /^(?:instructor|professor|prof|teacher|ta|staff|me|admin|system)$/i;

/** The most recent message in an "Author: body" thread (blocks split by blanks). */
function latestMessage(threadText: string): { author?: string; body: string } {
  const blocks = threadText
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const last = blocks.length > 0 ? blocks[blocks.length - 1] : threadText.trim();
  const m = /^([^:\n]{1,60}):\s*([\s\S]+)$/.exec(last);
  return m ? { author: m[1].trim(), body: m[2].trim() } : { body: last };
}

/** A student's first name to greet, or undefined when it is the instructor/blank. */
function greetName(author?: string): string | undefined {
  if (!author) return undefined;
  const first = author.split(/\s+/)[0].replace(/[^A-Za-z'-]/g, "");
  if (!first || NON_STUDENT_AUTHOR.test(first)) return undefined;
  return capitalizeFirst(first);
}

function quote(sentence: string): string {
  return `"${sentence.replace(/^["'“”]|["'“”]$/g, "").trim()}"`;
}

/**
 * A courteous, editable reply that reflects the actual thread: it greets the
 * student by name and restates the specific question they asked, then leaves a
 * clearly marked spot for the instructor's answer (folding in a steer note when
 * one was given). Deterministic templating still cannot compose the answer, so
 * that part stays an explicit placeholder.
 */
export function scaffoldMessageReply(threadText: string, instructions = ""): { body: string } {
  const { author, body } = latestMessage(threadText);
  const name = greetName(author);
  const questions = splitSentences(body)
    .filter((s) => s.trim().endsWith("?"))
    .slice(0, 2);

  const answer = instructions.trim()
    ? `[Respond here. You noted: ${capitalizeFirst(ensureSentence(instructions.trim()))}]`
    : "[Add your response here.]";

  const lines: string[] = [name ? `Hi ${name},` : "Hi,"];
  if (questions.length > 0) {
    lines.push("Thanks for your message.");
    lines.push(`You asked: ${questions.map(quote).join(" and ")}`);
  } else {
    lines.push("Thanks for your message. I've read it and want to make sure I address it fully.");
  }
  lines.push(answer, "Please let me know if you have any other questions.", "Best,\nYour instructor");

  return { body: stripLongDashes(lines.join("\n\n")) };
}
