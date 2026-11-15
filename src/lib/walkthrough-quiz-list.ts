import type { AnnouncementOutline } from "./announcement-outline-types";

/** Normalize only an unambiguously headed quiz-details list; leave all text intact. */
export function matchQuizDetailsBullets(message: string, outline: AnnouncementOutline): string {
  const sections = outline.sections.filter(section => section.heading?.trim().toLowerCase() === "quiz details");
  if (sections.length !== 1 || sections[0].listKind !== "unordered") return message;
  const lines = message.split("\n");
  const headers = lines.flatMap((line, index) => /^(?:#{1,6}\s*)?(?:\*\*)?quiz details:?(?:\*\*)?:?\s*$/i.test(line.trim()) ? [index] : []);
  if (headers.length !== 1) return message;
  let start = headers[0] + 1;
  while (start < lines.length && !lines[start].trim()) start += 1;
  let end = start;
  while (end < lines.length && /^\s*\d+[.)]\s+\S/.test(lines[end])) end += 1;
  if (end - start < 2 || (end < lines.length && /^\s+\S/.test(lines[end]))) return message;
  for (let index = start; index < end; index += 1) lines[index] = lines[index].replace(/^(\s*)\d+[.)](\s+)/, "$1-$2");
  return lines.join("\n");
}
