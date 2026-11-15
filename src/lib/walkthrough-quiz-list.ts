import type { AnnouncementOutline } from "./announcement-outline-types";

/** Normalize only an unambiguously headed quiz-details list; leave all text intact. */
export function matchQuizDetailsBullets(message: string, outline: AnnouncementOutline): string {
  const sections = outline.sections.filter(section => section.heading?.trim().toLowerCase() === "quiz details");
  if (sections.length !== 1 || sections[0].listKind !== "unordered") return message;
  const lines = message.split("\n");
  const headers: number[] = [];
  let fence: { marker: string; length: number } | null = null;
  lines.forEach((line, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = { marker: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.marker && marker[1].length >= fence.length) fence = null;
      return;
    }
    if (!fence && /^ {0,3}(?:#{1,6}\s*)?(?:\*\*)?(?:quiz details|quiz information|quiz overview|assessment details|assessment information|assessment overview):?(?:\*\*)?:?\s*$/i.test(line)) headers.push(index);
  });
  if (headers.length !== 1) return message;
  let start = headers[0] + 1;
  while (start < lines.length && !lines[start].trim()) start += 1;
  let end = start;
  while (end < lines.length && /^ {0,3}\d+[.)][ \t]+\S/.test(lines[end])) end += 1;
  if (end - start < 2 || (end < lines.length && /^\s+\S/.test(lines[end]))) return message;
  const isSpecificQuizHeading = /quiz details/i.test(lines[headers[0]]);
  const metadata = /^ {0,3}\d+[.)][ \t]+(?:due|points?|questions?|attempts?|time limit|duration|score(?: recorded)?|resources|availability|format)\s*:/i;
  if (!isSpecificQuizHeading && !lines.slice(start, end).every(line => metadata.test(line))) return message;
  for (let index = start; index < end; index += 1) lines[index] = lines[index].replace(/^( {0,3})\d+[.)]([ \t]+)/, "$1-$2");
  return lines.join("\n");
}
