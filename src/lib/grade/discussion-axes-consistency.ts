import type { StudentSubmissionEntry } from "./types";

/** Check that independently supplied axes reconstruct the displayed evidence. */
export function discussionAxesMatchContent(content: string, axes: NonNullable<StudentSubmissionEntry["discussionAxes"]>): boolean {
  const { initialPostContent, replyContent, replyCount } = axes;
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
