// Message replies - prompt building and the composition-control machinery
// this feature owns outright. Sibling of discussion-reply-prompt.ts
// (docs/message-replies-acceptance-criteria.md section 0: "built by COPYING
// its row-typed machinery and IMPORTING its row-free machinery, exactly as
// the grading tool did").
//
// discussion-reply-prompt.ts's ReplyCompositionSettings has a closed
// `ingredients` union (ReplyIngredient) and ingredientClause is
// module-private there, so this file defines its own
// MessageCompositionSettings and COPIES the greeting-names block builder
// rather than reaching into that file's private surface or widening its
// public one. EXTRACT_BATCH_SIZE, DRAFT_BATCH_SIZE, MAX_POST_CHARS,
// formalityClause and the shared ReplyFormality machinery ARE imported as-is
// from there (formalityClause is exported by that file so both features
// share one implementation instead of two private copies that could drift -
// see the AC's section 0 for the full reuse/copy split).
//
// Like discussion-reply-prompt.ts, this file is pure and dependency-free of
// anything server-only (no "use server", no `document`/`navigator`), so it is
// safe to import from a "use client" component AND from a "use server" action.

import {
  EXTRACT_BATCH_SIZE,
  DRAFT_BATCH_SIZE,
  MAX_POST_CHARS,
  formalityClause,
  type ReplyFormality,
} from "./discussion-reply-prompt";

export { EXTRACT_BATCH_SIZE, DRAFT_BATCH_SIZE, MAX_POST_CHARS };

// ---------------------------------------------------------------------------
// M10: reply-composition ingredients, this feature's own closed union - NOT
// the discussion tool's ReplyIngredient (which has no "answer" or
// "deadline-reminder" member and does have "resources"/"correction", neither
// of which makes sense for a private one-to-one reply). Labels are stem-
// completing, exactly as given in the AC ("Each reply should include: ...").
// ---------------------------------------------------------------------------

export type MessageIngredient = "acknowledge" | "answer" | "next-step" | "offer-help" | "deadline-reminder";

export const MESSAGE_INGREDIENTS: readonly MessageIngredient[] = [
  "acknowledge",
  "answer",
  "next-step",
  "offer-help",
  "deadline-reminder",
] as const;

export const MESSAGE_INGREDIENT_LABELS: Record<MessageIngredient, string> = {
  acknowledge: "an acknowledgement of what they asked",
  answer: "a direct answer to their question",
  "next-step": "the next step they should take",
  "offer-help": "an offer to help further",
  "deadline-reminder": "a reminder of the deadline, only if one applies",
};

// M10: "default selection ['acknowledge', 'answer', 'next-step']".
export const DEFAULT_MESSAGE_INGREDIENTS: readonly MessageIngredient[] = ["acknowledge", "answer", "next-step"];

// AC section 0: "ingredientsRenderValue is closed to the discussion
// ingredient union and is COPIED into message-reply-prompt.ts re-typed to
// MessageIngredient" - identical logic to discussion-reply-controls.ts's own
// export, retyped. Kept here (not re-exported from discussion-reply-controls.ts)
// because that file's own export is closed to ReplyIngredient and this
// feature's controls (MessageCaptureSettings.tsx, Group C) need the message-
// typed version. Required in both directions for the same reason the
// original is: MUI's default multi-select renderValue prints raw ids once
// more than one is selected, and zero selected must read as a real phrase
// rather than a blank box.
export function ingredientsRenderValue(selected: readonly MessageIngredient[]): string {
  if (selected.length === 0) return "Nothing in particular";
  return selected.map((id) => MESSAGE_INGREDIENT_LABELS[id]).join(", ");
}

// M10/section 0: this feature's own composition-settings shape - structurally
// identical to ReplyCompositionSettings but keyed to MessageIngredient rather
// than ReplyIngredient, and with no `audience` concept (a message reply is
// always a private one-to-one reply, never a discussion-audience choice).
export interface MessageCompositionSettings {
  ingredients: readonly MessageIngredient[];
  addressByName: boolean;
  formality: ReplyFormality;
}

// M10: "MAX_DRAFT_THREAD_CHARS = 2400 applied after MAX_POST_CHARS: the
// latest incoming message is never truncated; older messages are dropped
// whole, oldest first". MAX_POST_CHARS truncation already happened upstream,
// at extraction (parseExtractedMessages below) - this is the SECOND, prompt-
// build-time budget, applied per thread, never per message.
export const MAX_DRAFT_THREAD_CHARS = 2400;

// ---------------------------------------------------------------------------
// M8: extraction.
// ---------------------------------------------------------------------------

export type MessagePane = "list" | "thread";

export interface ExtractedMessage {
  subject: string;
  sender: string;
  text: string;
  sentAt?: string;
  pane: MessagePane;
}

/**
 * Prompt for reading student messages off N consecutive, heavily-overlapping
 * screenshots of a scrolling Canvas Inbox (or any message list - extraction
 * reads pixels, per the AC's Goal). Structured like buildPostExtractionPrompt
 * (this file's discussion sibling): HOW THE IMAGES RELATE, THE TWO PANES,
 * WHAT COUNTS AS A MESSAGE, SUBJECT, SENDER, TIMESTAMPS, TEXT THAT IS CUT
 * OFF, IF THERE ARE NO MESSAGES, OUTPUT.
 */
export function buildMessageExtractionPrompt(courseName: string, frameCount: number): string {
  const course = courseName.trim();
  return [
    `The ${frameCount} images are consecutive screenshots of an online course messaging inbox, captured about a second apart while the reader scrolled the list or read through open conversations.`,
    course ? `The inbox belongs to a course called "${course}".` : "",

    "Read the messages exchanged with students and return them.",

    "HOW THE IMAGES RELATE TO EACH OTHER",
    "- The images overlap heavily. The same message will usually appear in several of them, in a different vertical position each time. That is one message, not several. Return it ONCE.",
    "- When a message appears in more than one image, use the reading in which the MOST of its text is visible.",
    "- When the top of a message is visible in one image and the bottom in another, join the two halves into one message and return the joined text.",
    "- Read the images in the order given; they run top to bottom down one page, or in the order the conversations were opened.",

    "THE TWO PANES",
    "- A conversation LIST pane shows one row per conversation: a subject, the participants, and a short one-line preview of the latest message. No more of the message body than that preview is visible there.",
    "- An open conversation's THREAD pane shows the full dated message bodies exchanged in that one conversation.",
    "- Report which pane a reading came from in \"pane\", exactly \"list\" for a list-pane row or exactly \"thread\" for an open conversation.",

    "WHAT COUNTS AS A MESSAGE",
    "- In the THREAD pane, a message is one dated body from one sender. Return each one as its own entry.",
    "- In the LIST pane, a row's one-line preview counts as a single entry - do not split it into more than one message and do not invent the rest of a body that is not shown.",
    "- Ignore everything that is page furniture rather than a message: navigation bars and menus, course sidebars, breadcrumbs, buttons and links such as Reply, Forward, Archive, Delete, Compose, Search, Filter, Mark as read; unread counters; avatars and profile pictures.",

    "SUBJECT",
    "- Every entry belongs to one conversation. Report that conversation's subject in \"subject\", exactly as shown, repeated on every entry that belongs to it.",
    "- When no subject is visible for a conversation, leave \"subject\" as an empty string rather than inventing one.",

    "SENDER",
    "- In the THREAD pane, report the name shown next to each message, exactly as it is displayed, in \"sender\". The inbox never marks which messages are your own with a \"you\" label or similar - report only the name that is actually printed, and do not guess whether a message is yours or the student's.",
    "- In the LIST pane, report the other participant's name that row is filed under in \"sender\" - the name the list shows for that conversation, not a guess at who wrote the preview text if that is not separately shown.",

    "TIMESTAMPS",
    "- Report the message's timestamp, exactly as it is shown on screen, in \"sentAt\" - for example \"Sep 3 at 2:14pm\", \"Yesterday\", or a bare time.",
    "- If no timestamp is visible for a message, leave \"sentAt\" out of that entry entirely.",

    "TEXT THAT IS CUT OFF",
    "- If a message is truncated by a control such as \"Show more\" or an ellipsis, return only the text that is actually visible, and do NOT include the control's own words in the text.",
    "- If a message runs off the bottom edge of the last image, return the visible part.",
    "- A message that quotes an earlier message beneath a reply (a line starting with \">\", or \"On ... wrote:\") is part of that message's own text - include it exactly as shown, do not strip it out yourself.",
    "- Never continue, complete, summarise, paraphrase, correct or tidy a message. Transcribe the words that are on the screen. If you cannot read a word, leave it out rather than inventing one.",

    "IF THERE ARE NO MESSAGES",
    "- If these images show only navigation, an empty inbox or a loading state, return an empty array: []",
    "- A frame showing only the list pane, with no conversation open, still yields \"list\" entries for whatever rows are visible - it is not empty just because no thread is open.",

    "OUTPUT",
    'Return ONLY a JSON array, and nothing else. Each element is {"subject": "...", "sender": "...", "sentAt": "...", "text": "...", "pane": "..."} - no other keys.',
    '"subject" is the conversation\'s subject line, exactly as shown, or "" when none is visible.',
    '"sender" is the display name exactly as it is shown, with no title, no timestamp and no role label.',
    '"text" is the message\'s words as plain text. Use "\\n" between paragraphs. Do not use markdown and do not use backticks.',
    '"sentAt" is omitted entirely when no timestamp is visible.',
    '"pane" is exactly "list" or "thread", per THE TWO PANES rules above.',
    "Order the array the way the messages appear on the page, top to bottom.",
    "No prose before or after the array. No code fences.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Coerces whatever an already lenient-JSON-parsed value contains into
 * ExtractedMessage[]. The caller (extractStudentMessagesAction, Group A)
 * runs the model's raw text through parseLenientJsonArray itself and checks
 * for `null` (an unparseable response, a real error) BEFORE calling this -
 * this function only ever sees a value that already parsed as SOME array (or
 * anything else, which coerces to []), so it never needs to distinguish
 * "could not parse" from "parsed to nothing", mirroring
 * extractDiscussionPostsAction's own author/text empty-field filter and
 * MAX_POST_CHARS truncation, pulled into a leaf function here so it has a
 * test surface independent of any LLM call.
 *
 * An entry with an empty/missing `sender` or `text` is dropped entirely (the
 * empty-field filtering the AC's M8 describes). `subject` defaults to "" -
 * never invented, and "" round-trips through threadKey (message-thread.ts)
 * to the same sentinel as a literal "(no subject)" reading. `pane` coerces
 * to "thread" for anything other than the literal "list" - the AC's own
 * "pane coerced to 'thread' when unrecognised" rule. `sentAt` survives only
 * as a non-empty, trimmed string; absent stays absent.
 */
export function parseExtractedMessages(raw: unknown): ExtractedMessage[] {
  if (!Array.isArray(raw)) return [];

  const out: ExtractedMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;

    const sender = typeof m.sender === "string" ? m.sender.trim() : "";
    const text = typeof m.text === "string" ? m.text.trim() : "";
    if (!sender || !text) continue;

    const subject = typeof m.subject === "string" ? m.subject.trim() : "";
    const sentAt = typeof m.sentAt === "string" && m.sentAt.trim() ? m.sentAt.trim() : undefined;
    // AC4b's own reasoning (discussion-reply-prompt.ts's sibling function):
    // a visible truncation marker so two truncated reads of an over-long
    // message never both land at exactly the same length.
    const truncated = text.length > MAX_POST_CHARS ? `${text.slice(0, MAX_POST_CHARS)}...` : text;
    const pane: MessagePane = m.pane === "list" ? "list" : "thread";

    const entry: ExtractedMessage = { subject, sender, text: truncated, pane };
    if (sentAt) entry.sentAt = sentAt;
    out.push(entry);
  }
  return out;
}

// ---------------------------------------------------------------------------
// M10: drafting.
// ---------------------------------------------------------------------------

// M10: rewritten for MESSAGE_INGREDIENTS - no audience parameter, since a
// message reply is always the same private, one-to-one register.
function ingredientClause(ingredient: MessageIngredient): string {
  switch (ingredient) {
    case "acknowledge":
      return "- Open by acknowledging what they actually asked or told you, in your own words - not a generic thank-you.";
    case "answer":
      return "- Give a direct answer to their question. Do not dodge it or defer it to somewhere else.";
    case "next-step":
      return "- Tell them the next concrete step they should take.";
    case "offer-help":
      return "- Offer to help further if they need it.";
    case "deadline-reminder":
      return "- Only if a deadline actually applies to what they asked about, remind them of it. If none applies, say nothing about a deadline - do not invent one to satisfy this list.";
    default:
      return "";
  }
}

// M10: "No greeting line and no sign-off" -> for messages, the sign-off half
// is covered by a separate, unconditional line (applySignoff appends it IN
// CODE per M11, and the model is told never to write one at all), so this
// addressing line only ever concerns the greeting. Adapted from discussion-
// reply-prompt.ts's own nameLine (module-private there) with the audience
// branching removed - a message reply has only one register.
function addressLine(addressing: boolean): string {
  if (!addressing) {
    return "- No greeting line. Do not open with the student's name. The reply is pasted into a box that already shows who is speaking and who is being answered.";
  }
  return (
    "- No separate greeting line of its own (no \"Hi\", no \"Hello\"). Where a greeting name is given for a thread below, open that reply with the name itself and nothing else, leading straight into the same sentence - never a standalone salutation." +
    " A thread with no greeting name given gets no greeting at all. The reply is pasted into a box that already shows who is speaking and who is being answered."
  );
}

/**
 * Prompt for drafting one reply to each thread in `threads`. Mirrors
 * buildReplyDraftingPrompt's block order (this file's discussion sibling)
 * with the audience stance replaced by one fixed line - a message reply is
 * always a private, one-to-one reply to the student who wrote in, never a
 * discussion-audience choice.
 *
 * Each thread is rendered oldest-first as one line per message, labelled
 * `[student]` (an incoming message) or `[you]` (fromMe) rather than by name -
 * the model is never asked to reproduce a name it might misspell, and the
 * role is the only thing the reply logic actually needs. `THREAD n` mirrors
 * discussion's `POST n` numbering; the output contract keeps the discussion
 * key verbatim (`{"post": <the THREAD number>, ...}`, per the AC's M10) so
 * the caller's seen-position dedupe and length-equal fallback are reused
 * unchanged.
 *
 * `styleBlock` stays the LAST element and `knowledgeContext` (optional, an
 * already-rendered block) is threaded through exactly like
 * buildReplyDraftingPrompt's own - see that function's doc comment for the
 * full ordering rationale, unchanged here.
 */
export function buildMessageReplyPrompt(
  threads: ReadonlyArray<{
    messages: ReadonlyArray<{ text: string; fromMe: boolean }>;
    greetingName?: string;
  }>,
  courseName: string,
  styleBlock: string,
  composition: MessageCompositionSettings,
  knowledgeContext?: string
): string {
  const course = courseName.trim();
  const addressing = composition.addressByName;
  const hasGreetingNames = threads.some((t) => t.greetingName);

  const ingredientsBlock =
    composition.ingredients.length > 0
      ? ["EACH REPLY SHOULD INCLUDE", ...composition.ingredients.map((ingredient) => ingredientClause(ingredient))].join("\n")
      : "";

  const greetingNamesBlock =
    addressing && hasGreetingNames
      ? [
          "GREETING NAMES",
          "Use each name below only for the thread it is listed against, and only as instructed above - never invent, guess, or reuse a name for a thread it is not listed against.",
          ...threads.map((t, i) => (t.greetingName ? `- THREAD ${i + 1}: ${t.greetingName}` : "")).filter(Boolean),
        ].join("\n")
      : "";

  return [
    "You are the instructor replying privately to one student who wrote to you.",
    formalityClause(composition.formality),
    course ? `The conversation is part of a course called "${course}".` : "",

    "Write one reply to each thread below, answering that thread's latest message from the student.",

    "EVERY REPLY",
    "- Write in the first person, as yourself.",
    "- 3 to 6 sentences. Plain prose.",
    "- No markdown, no headings, no bullet lists, no bold.",
    addressLine(addressing),
    "- No emoji.",
    "- Do not write a closing signature, sign-off or your name.",
    "- Never state a fact about the course - a date, a policy, a reading, an assignment, a grade - that is not written in the thread shown to you here. If you need one, write around it.",
    "- Answer the LATEST message from the student in that thread. Do not refer to the other threads below.",

    ingredientsBlock,
    greetingNamesBlock,

    "THE THREADS",
    threads
      .map((t, i) => `THREAD ${i + 1}\n${renderThreadForPrompt(t.messages).join("\n")}`)
      .join("\n\n---\n\n"),

    "OUTPUT",
    `Return ONLY a JSON array with exactly ${threads.length} elements, and nothing else.`,
    'Each element is {"post": <the THREAD number>, "reply": "..."} - the number, not the name.',
    `Include every thread number from 1 to ${threads.length}, in order.`,
    'Write the reply as plain text. If it runs longer than about 60 words, break it into at least two paragraphs, separated by a blank line ("\\n\\n"). No backticks.',
    "No prose before or after the array. No code fences.",
    knowledgeContext ?? "",
    styleBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Renders one thread's messages (oldest-first) as `[student]`/`[you]` lines,
 * applying MAX_DRAFT_THREAD_CHARS: the latest incoming message (the newest
 * entry with fromMe === false) is never dropped or truncated; older messages
 * are dropped WHOLE, oldest first, replaced by one omission line, until the
 * rendering fits the budget (or nothing droppable remains).
 */
function renderThreadForPrompt(messages: ReadonlyArray<{ text: string; fromMe: boolean }>): string[] {
  let protectedIndex = messages.length - 1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!messages[i].fromMe) {
      protectedIndex = i;
      break;
    }
  }

  const lineFor = (m: { text: string; fromMe: boolean }) => `${m.fromMe ? "[you]" : "[student]"} ${m.text}`;

  const renderFrom = (dropCount: number): string[] => {
    const lines: string[] = [];
    if (dropCount > 0) lines.push(`[... ${dropCount} earlier messages omitted]`);
    for (let i = dropCount; i < messages.length; i++) lines.push(lineFor(messages[i]));
    return lines;
  };

  let dropCount = 0;
  let lines = renderFrom(0);
  while (lines.join("\n").length > MAX_DRAFT_THREAD_CHARS && dropCount < protectedIndex) {
    dropCount++;
    lines = renderFrom(dropCount);
  }
  return lines;
}
