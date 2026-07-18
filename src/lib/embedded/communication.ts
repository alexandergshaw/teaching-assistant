/**
 * Deterministic scaffolds for the inbox / announcement drafters. When the
 * embedded provider is selected these template a professional, editable draft
 * from the instructor's own instruction and thread text, with no model call and
 * without inventing facts (dates, links, grades) that were not provided.
 */

import { capitalizeFirst, cleanText, copyedit, ensureSentence, pick, splitSentences, stripLongDashes } from "./scaffold";
import { toProse } from "@/lib/prose";

// Directive lead-ins ("tell students that …", "tell students:") that front an
// announcement request; a trailing colon or comma is consumed with them.
const ANNOUNCEMENT_DIRECTIVE =
  /^(?:please\s+)?(?:tell|let|inform|notify|remind|announce|advise|update)\s+(?:the\s+)?(?:students?|class|everyone)\s*(?:know\s+)?(?:that|about|to|of)?\s*[:,]?\s*/i;

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
  // Structured instructions (a bullet list, key-value lines, a table) are
  // rendered as natural-language prose; plain instructions are copy-edited.
  const stripped = instruction.replace(ANNOUNCEMENT_DIRECTIVE, "");
  const converted = toProse(stripped);
  const core = converted.format === "prose" ? copyedit(stripped) : converted.prose;
  const greeting = pick(["Hi everyone,", "Hello everyone,", "Hi all,"], instruction);
  const closer = pick(
    [
      "If you have any questions, please reach out during office hours or by reply.",
      "Please reach out during office hours or by reply if anything is unclear.",
      "Questions are welcome, by reply or during office hours.",
    ],
    instruction
  );
  const signoff = pick(["Thanks,\nYour instructor", "Best,\nYour instructor", "Thank you,\nYour instructor"], instruction);
  const message = [greeting, core, closer, signoff].join("\n\n");
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

/**
 * A warm, short reminder to a student with missing submissions. Greets by
 * first name, lists the missing assignments, folds in optional notes, and
 * offers help. Deterministic templating with no LLM involvement.
 */
export function scaffoldStudentNudge(studentName: string, missingAssignments: string[], extraNotes: string): string {
  const first = studentName.split(/\s+/)[0]?.replace(/[^A-Za-z'-]/g, "") || "";
  const greeting = first ? `Hi ${capitalizeFirst(first)},` : "Hi,";

  const lines: string[] = [greeting];

  if (missingAssignments.length > 0) {
    lines.push("I noticed you haven't submitted the following:");
    missingAssignments.forEach((assignment) => {
      lines.push(`- ${assignment}`);
    });
    lines.push("If you're having trouble or need an extension, please reach out.");
  } else {
    lines.push("I wanted to check in about your recent submissions.");
  }

  if (extraNotes.trim()) {
    lines.push(extraNotes.trim());
  }

  lines.push("Best,\nYour instructor");

  return stripLongDashes(lines.join("\n\n"));
}
