import type { StudentSubmissionEntry } from "./types";

/** Accept only numbered, nonempty reviewed reply sections for absent initials. */
function validReviewedReplies(content: string, count: number): boolean {
  const prefix = "=== REPLIES TO CLASSMATES ===\n";
  if (!content.startsWith(prefix) || !Number.isSafeInteger(count) || count < 1) return false;
  const body = content.slice(prefix.length);
  const markers = [...body.matchAll(/^--- Reply (\d+) ---$/gm)];
  const allReplyMarkers = [...body.matchAll(/^---\s*Reply\b.*---\s*$/gim)];
  if (markers.length !== count || allReplyMarkers.length !== markers.length || markers[0]?.index !== 0) return false;
  const furniture = /^(?:collapse subdiscussion|manage discussion entry|reply|replies|unread|\d+\s+(?:replies|views?)|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))?)$/i;
  return markers.every((marker, index) => {
    if (Number(marker[1]) !== index + 1) return false;
    const start = marker.index! + marker[0].length;
    const end = markers[index + 1]?.index ?? body.length;
    const lines = body.slice(start, end).split("\n").map((line) => line.trim()).filter(Boolean);
    return lines.some((line, i) => !furniture.test(line) && !/^---/.test(line) && !/^===/.test(line) && !furniture.test(lines[i + 1] ?? "") && !(line === lines[i + 1] && furniture.test(lines[i + 2] ?? "")));
  });
}
/** Check that independently supplied axes reconstruct the displayed evidence. */
export function discussionAxesMatchContent(content: string, axes: NonNullable<StudentSubmissionEntry["discussionAxes"]>): boolean {
  const { initialPostContent, replyContent, replyCount } = axes;
  const absent = "=== INITIAL POST ===\n[The instructor confirmed no initial post was present.]";
  if (axes.initialPostAbsentConfirmed !== undefined) return axes.initialPostAbsentConfirmed === true && initialPostContent === absent && validReviewedReplies(replyContent, replyCount) && content === [initialPostContent, replyContent].join("\n\n");
  if (initialPostContent === absent) return false;
  if (content === [initialPostContent, replyContent].filter(Boolean).join("\n\n")) {
    const marker = "=== INITIAL POST ===\n";
    return initialPostContent.startsWith(marker) && initialPostContent.slice(marker.length).trim().length > 0;
  }

  const prefix = /^This is the initial-post portion of a discussion contribution: ([1-9]\d*) initial posts?\. Evaluate only the initial post\.\n\n/.
    exec(initialPostContent);
  if (!prefix) return false;
  const initialCount = Number(prefix[1]);
  if (!Number.isSafeInteger(initialCount)) return false;
  const initial = initialPostContent.slice(prefix[0].length);
  if (!initial.startsWith("=== INITIAL POST ===\n\n")) return false;
  const replyPrefix = `This is the replies portion of a discussion contribution: ${replyCount} repl${replyCount === 1 ? "y" : "ies"} to classmates. Evaluate only these replies.\n\n`;
  if (replyCount > 0 && !replyContent.startsWith(replyPrefix + "=== REPLIES TO CLASSMATES ===\n\n")) return false;
  const reply = replyCount > 0 ? replyContent.slice(replyPrefix.length) : "";
  const manifest = `This submission is a discussion contribution: ${initialCount} initial post${initialCount === 1 ? "" : "s"} and ${replyCount} repl${replyCount === 1 ? "y" : "ies"} to classmates. A reply is engagement with a classmate, not a second initial post; evaluate each contribution for what it is.`;
  return content === [manifest, initial, reply].filter(Boolean).join("\n\n");
}
