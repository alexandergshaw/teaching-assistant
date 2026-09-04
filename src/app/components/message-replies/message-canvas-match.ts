// Message replies (Manual > Recording > Message replies) - matching a
// captured thread to a real Canvas conversation.
// docs/message-replies-acceptance-criteria.md M15 (section 7), section 9.
//
// Pure, React-free, DOM-free, same discipline as
// src/app/components/recording/discussion-capture.ts (see that file's own
// header): vitest in this repo is node-env and renders nothing, so a
// behaviour like this predicate needs a leaf like this one to have a test
// surface at all.
//
// Reused, not reimplemented: `normalizeForMatch` and `authorsMatch`
// (src/app/components/recording/discussion-capture.ts) are the SAME
// functions M9's threading and the discussion tool's own author matching
// already use - a second, hand-rolled string-similarity rule here would be
// exactly the "four instances in two features" defect class this repo's own
// history records (see that file's own header, and
// discussion-replies-log.ts's header on `resolveDraftParent`).
//
// `MessageThreadRow` and `CanvasConversationSummary` are both imported as
// TYPES ONLY (`import type`): `message-serialization.ts` is a sibling leaf
// owned by a concurrent implementer and may not exist yet when this file's
// tests run - a type-only import is erased by esbuild before vitest ever
// tries to resolve the module, so this file's own tests are unaffected by
// that file's landing order. `src/lib/canvas/inbox.ts` is a server-only
// module (imports canvas-core.ts) - CanvasConversationSummary is a plain
// data shape with no server dependency of its own, and `import type` never
// pulls the module's runtime code into this client-safe file, matching this
// task's "no import of server-only modules" rule.

import { normalizeForMatch, authorsMatch } from "../recording/discussion-capture";
import type { MessageThreadRow } from "./message-serialization";
import type { CanvasConversationSummary } from "@/lib/canvas/inbox";

/**
 * M15's result shape, verbatim from section 9:
 * `matchThreadToConversation(row, conversations): { kind: "matched"; canvas
 * } | { kind: "none" } | { kind: "ambiguous" }`.
 *
 * `canvas` OMITS `matchedAt` (present on `MessageThreadRow["canvas"]`,
 * required there): this module is pure and reads no clock
 * (`discussion-replies-log.ts`'s own header documents the same discipline -
 * "no clock reads ... every function takes the timestamp(s) it needs as
 * data, never calls Date.now() itself"). `matchThreadToConversation` has no
 * `now`/`matchedAt` parameter in section 9's signature, so the caller (Group
 * C, at apply time) stamps `matchedAt` itself when it copies this result
 * onto `row.canvas`.
 */
export type ThreadCanvasMatch =
  | { kind: "matched"; canvas: Omit<NonNullable<MessageThreadRow["canvas"]>, "matchedAt"> }
  | { kind: "none" }
  | { kind: "ambiguous" };

/** M15: "a row whose subject is empty or `"(no subject)"`" - the literal
 * sentinel M9's own `threadKey` uses, not a normalized comparison (a subject
 * that normalizes to the SAME tokens as "(no subject)" by coincidence - e.g.
 * a student who genuinely typed "No Subject" - is still a real subject and
 * should still be matched on subject+student). */
function isEmptySubject(subject: string): boolean {
  const trimmed = subject.trim();
  return trimmed === "" || trimmed === "(no subject)";
}

function toCanvasSnapshot(
  conv: CanvasConversationSummary,
  matchedBy: "subject+student" | "student+count"
): Omit<NonNullable<MessageThreadRow["canvas"]>, "matchedAt"> {
  return {
    conversationId: conv.id,
    matchedBy,
    subject: conv.subject,
    participants: conv.participants,
    messageCount: conv.messageCount,
  };
}

/**
 * M15's predicate, over the SNAPSHOT list a caller already fetched (the action layer
 * supplies `conversations` - this function makes no network call and reads
 * no clock).
 *
 * Two disjoint paths, chosen by whether the row's own subject is real:
 *
 * - Real subject: a conversation counts as a candidate when its subject
 *   normalizes equal to the row's AND at least one participant matches the
 *   row's student (`authorsMatch`). Exactly one candidate -> matched,
 *   `matchedBy: "subject+student"`. Zero -> `none`. More than one ->
 *   `ambiguous`.
 * - Empty/"(no subject)" subject: subject can't discriminate at all, so the
 *   candidate set is participant-match alone. M15's own wording -
 *   "matches on participant alone only when that match is unique across the
 *   list AND [the message-count tolerance]" - reads as two conditions that
 *   must BOTH hold for a positive match, not as "count disambiguates an
 *   otherwise-ambiguous set": uniqueness is judged on the participant match
 *   by itself (zero -> `none`, more than one -> `ambiguous`), and only once
 *   exactly one participant candidate exists does the
 *   `Math.abs(messageCount - row.messages.length) <= 1` tolerance decide
 *   whether that lone candidate is close enough to count as a match
 *   (`matchedBy: "student+count"`) or not (`none` - a genuine single
 *   candidate whose count is too far off is "not this thread", not "several
 *   threads to choose between").
 */
export function matchThreadToConversation(
  row: MessageThreadRow,
  conversations: ReadonlyArray<CanvasConversationSummary>
): ThreadCanvasMatch {
  if (!isEmptySubject(row.subject)) {
    const normalizedSubject = normalizeForMatch(row.subject);
    const candidates = conversations.filter(
      (conv) => normalizeForMatch(conv.subject) === normalizedSubject && conv.participants.some((p) => authorsMatch(p, row.student))
    );
    if (candidates.length === 0) return { kind: "none" };
    if (candidates.length > 1) return { kind: "ambiguous" };
    return { kind: "matched", canvas: toCanvasSnapshot(candidates[0], "subject+student") };
  }

  const participantCandidates = conversations.filter((conv) => conv.participants.some((p) => authorsMatch(p, row.student)));
  if (participantCandidates.length === 0) return { kind: "none" };
  if (participantCandidates.length > 1) return { kind: "ambiguous" };

  const only = participantCandidates[0];
  if (Math.abs(only.messageCount - row.messages.length) > 1) return { kind: "none" };
  return { kind: "matched", canvas: toCanvasSnapshot(only, "student+count") };
}
