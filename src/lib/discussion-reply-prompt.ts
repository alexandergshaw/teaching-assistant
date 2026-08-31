// Discussion reply capture - prompt building and shared batch constants.
//
// Pure and dependency-free (no "use server", no imports from anywhere else in
// the repo) so it can be imported from BOTH a client component
// (discussion-capture.ts, for EXTRACT_BATCH_SIZE / DRAFT_BATCH_SIZE /
// MAX_POST_CHARS / DiscussionAudience / DISCUSSION_AUDIENCE_LABELS /
// normalizeAudience) and a "use server" action
// (src/app/actions/discussion-replies.ts, for everything here). See AC35 in
// docs/discussion-reply-capture-acceptance-criteria.md.
//
// EXTRACT_BATCH_SIZE, DRAFT_BATCH_SIZE, MAX_POST_CHARS and RESOURCE_BATCH_SIZE
// live HERE rather than in discussion-capture.ts specifically because the
// server enforces them too (AC8) - one owner, one direction, no cycle. A
// client batching more frames/posts than the server accepts would fail every
// single request with a generic message, and no gate in this repo would
// catch that drift.

export const EXTRACT_BATCH_SIZE = 6;
export const DRAFT_BATCH_SIZE = 5;
export const MAX_POST_CHARS = 4000;

// docs/discussion-reply-resources-acceptance-criteria.md R4a: the resource
// pass's own batch size. Deliberately NOT DRAFT_BATCH_SIZE - raising DRAFT_
// BATCH_SIZE later (say, to 7) would make gatherReplyResourcesAction's own
// reused call (findResourceLinksForConceptsAction) silently `.slice(0,
// MAX_CONCEPTS_PER_RUN)` the 7th concept away with no error surfaced
// anywhere, and that post would carry no resources with nothing to explain
// why. Must never exceed that action's own MAX_CONCEPTS_PER_RUN (6, private
// to src/app/actions/learning-resource-links.ts).
export const RESOURCE_BATCH_SIZE = 5;

// docs/discussion-reply-resources-acceptance-criteria.md R4c: the character
// cap `deriveResourceConcept` below truncates a post's text to, on a word
// boundary, before it is ever sent to the resource-search action as a
// "concept". This is the ONE implementation of that rule (normalise
// whitespace, truncate to 400 chars on a word boundary, author name never
// included) - this leaf owns it, and both consumers import it FROM here:
// `discussion-capture.ts` (a client component module) re-exports
// RESOURCE_CONCEPT_CHARS above rather than restating it, and
// `discussion-replies.ts` (a "use server" action) imports
// `deriveResourceConcept` directly and calls it on the live path. There used
// to be a second, client-side wrapper (`conceptFromPost`) that restated this
// same rule for the author-exclusion guarantee alone; it was deleted as a
// tested-but-dead twin - nothing but its own test ever called it - and that
// guarantee is now pinned by a test against the live boundary instead
// (discussion-replies.test.ts). If this cap ever changes, there is exactly
// one place to change it: here.
export const RESOURCE_CONCEPT_CHARS = 400;

/**
 * Turn one discussion post's raw text into a search "concept": whitespace
 * collapsed to single spaces, trimmed, then truncated to
 * RESOURCE_CONCEPT_CHARS on a word boundary (never mid-word) when it is
 * longer. Never includes an author name - the caller here
 * (gatherReplyResourcesAction) is only ever handed `{ id, text }`, so there
 * is no author field to accidentally fold in. Pure; empty input (or input
 * that normalises to nothing) returns "".
 */
export function deriveResourceConcept(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= RESOURCE_CONCEPT_CHARS) return normalized;
  const truncated = normalized.slice(0, RESOURCE_CONCEPT_CHARS);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

export type DiscussionAudience = "peers" | "students";

export const DISCUSSION_AUDIENCE_LABELS: Record<DiscussionAudience, string> = {
  peers: "Peers",
  students: "Students",
};

/**
 * Coerce an arbitrary value (localStorage, a form control, an untrusted
 * caller) to a DiscussionAudience. Trims and lowercases before comparing, so
 * " Peers " and "PEERS" both resolve to "peers"; anything else - including
 * null, undefined and non-strings - is "students", the overwhelmingly common
 * case and the register that errs toward being encouraging and explanatory
 * rather than toward collegial shorthand aimed at a colleague. Mirrors
 * coerceMessageDraftPayload's own never-throw shape (message-drafts.ts:57-58).
 */
export function normalizeAudience(value: unknown): DiscussionAudience {
  if (typeof value !== "string") return "students";
  return value.trim().toLowerCase() === "peers" ? "peers" : "students";
}

/**
 * Prompt for reading discussion posts off N consecutive, heavily-overlapping
 * screenshots of a scrolling discussion board. Folded verbatim from AC17a -
 * every clause here maps to a named failure case (dedup across overlapping
 * frames, truncation controls, headless fragments, code fences). Do not
 * paraphrase.
 */
export function buildPostExtractionPrompt(courseName: string, frameCount: number): string {
  const course = courseName.trim();
  return [
    `The ${frameCount} images are consecutive screenshots of an online course discussion board, captured about a second apart while the reader scrolled down the page.`,
    course ? `The board belongs to a course called "${course}".` : "",

    "Read the discussion posts written by people and return them.",

    "HOW THE IMAGES RELATE TO EACH OTHER",
    "- The images overlap heavily. The same post will usually appear in several of them, in a different vertical position each time. That is one post, not several. Return it ONCE.",
    "- When a post appears in more than one image, use the reading in which the MOST of its text is visible.",
    "- When the top of a post is visible in one image and the bottom in another, join the two halves into one post and return the joined text.",
    "- Read the images in the order given; they run top-to-bottom down one page.",

    "WHAT COUNTS AS A POST",
    "- A post is a person's own writing, with their display name shown next to it.",
    "- Include replies nested underneath other posts. Return each one as its own entry with its own author. Do not merge a reply into its parent and do not prefix it with the parent's text.",
    "- Include posts by the instructor or by anyone else. Do not skip a post because of who wrote it, and do not mark it in any way. The author's name is the only thing that distinguishes it.",
    "- Ignore everything that is page furniture rather than someone's writing: navigation bars and menus, course sidebars, breadcrumbs, buttons and links such as Reply, Like, Edit, Delete, Subscribe, Mark as read, Search entries, Sort by, Expand threads; reply counters such as \"3 replies\" or \"12 unread\"; avatars and profile pictures; badges, pill labels, points, and any grading or rubric panel.",
    "- Ignore the discussion's own prompt or question at the top of the page if it is the assignment text rather than a person's post. If it carries a person's display name, treat it as a post.",

    "TIMESTAMPS",
    "- Do not put the post's timestamp inside its text.",
    "- Report it separately in \"postedAt\", exactly as it is shown on screen, for example \"Mar 12 at 9:04 PM\".",
    "- If no timestamp is visible for a post, leave \"postedAt\" out of that entry entirely.",

    "TEXT THAT IS CUT OFF",
    "- If a post is truncated by a control such as \"Show more\", \"Read more\", \"See more\" or an ellipsis, return only the text that is actually visible, and do NOT include the control's own words in the text.",
    "- If a post runs off the bottom edge of the last image, return the visible part.",
    "- If a post's author name is NOT visible in any image - because the top of the post was already scrolled past - SKIP that post entirely. Do not guess who wrote it and do not attribute it to the nearest name you can see.",
    "- Never continue, complete, summarise, paraphrase, correct or tidy a post. Transcribe the words that are on the screen. If you cannot read a word, leave it out rather than inventing one.",

    "IF THERE ARE NO POSTS",
    "- If these images show only navigation, a course home page, an empty board or a loading state, return an empty array: []",

    "OUTPUT",
    'Return ONLY a JSON array, and nothing else. Each element is {"author": "...", "text": "...", "postedAt": "..."} - no other keys, and "postedAt" omitted when it is not visible.',
    '"author" is the display name exactly as it is shown, with no title, no timestamp and no role label.',
    '"text" is the post\'s words as plain text. Use "\\n" between paragraphs. Do not use markdown and do not use backticks.',
    "Order the array the way the posts appear on the page, top to bottom.",
    "No prose before or after the array. No code fences.",
  ].filter(Boolean).join("\n\n");
}

/**
 * Audience stances for reply drafting, folded verbatim from AC17b/AC65. The
 * two registers differ STRUCTURALLY (opening move, whether explanation is
 * required or banned, whether a closing question is mandated, stance toward
 * disagreement, four prohibitions unique to the student register), not by a
 * single tone adjective - see AC65 for the full rationale.
 */
const AUDIENCE_STANCE: Record<DiscussionAudience, string> = {
  students: [
    "You are the instructor, replying to a student's post on your course discussion board.",
    "Be warm, specific and encouraging. Open by naming something the student actually said - quote or paraphrase their own words, not a generic compliment.",
    "Add one substantive thing: an idea they did not raise, a correction if something is wrong, or a concrete example from the field.",
    "End with a question that invites them to take it further.",
    "Never grade the post, never give or imply a score or a mark, never say whether it meets a requirement, and never promise or hint at a deadline change.",
  ].join(" "),
  peers: [
    "You are replying to a fellow educator's post in a professional community of practice.",
    "Address them as an equal. They are not your student and you are not assessing them.",
    "Do not open with praise and do not explain the underlying concepts back to them - assume they know the field as well as you do.",
    "Engage with the substance directly: extend their argument, add your own experience of it, or put a concrete counterpoint to them.",
    "It is fine to disagree, and fine to say the thing you are unsure about.",
  ].join(" "),
};

/**
 * Prompt for drafting one reply to each of `posts`. `styleBlock` (from
 * getWritingStyleBlock) is threaded through as the LAST element deliberately
 * - it begins with its own "MATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE"
 * header and can carry up to 1500 characters of freeform prose; placing it
 * before the output contract would put format instructions too far from the
 * model's turn. It is "" on any getWritingStyleBlock failure, which
 * .filter(Boolean) drops cleanly. This builder owns the WHOLE prompt so the
 * whole prompt is unit-testable - the action never concatenates onto it.
 */
export function buildReplyDraftingPrompt(
  posts: ReadonlyArray<{ id: string; author: string; text: string }>,
  audience: DiscussionAudience,
  courseName: string,
  styleBlock: string
): string {
  const course = courseName.trim();
  return [
    AUDIENCE_STANCE[audience],
    course ? `The discussion is on a course called "${course}".` : "",

    "Write one reply to each post below.",

    "EVERY REPLY, BOTH REGISTERS",
    "- Write in the first person, as yourself.",
    "- 3 to 6 sentences. Plain prose.",
    "- No markdown, no headings, no bullet lists, no bold.",
    "- No greeting line and no sign-off. Do not open with the person's name. The reply is pasted into a box that already shows who is speaking and who is being answered.",
    "- No emoji.",
    "- Never state a fact about the course - a date, a policy, a reading, an assignment, a grade - that is not written in the post you are answering. If you need one, write around it.",
    "- Reply only to what that post says. Do not refer to the other posts below.",

    "THE POSTS",
    posts.map((p, i) => `POST ${i + 1}\nWritten by: ${p.author}\n${p.text}`).join("\n\n---\n\n"),

    "OUTPUT",
    `Return ONLY a JSON array with exactly ${posts.length} elements, and nothing else.`,
    'Each element is {"post": <the POST number>, "reply": "..."} - the number, not the name.',
    `Include every post number from 1 to ${posts.length}, in order.`,
    'Write the reply as plain text. Use "\\n" between paragraphs if you need one. No backticks.',
    "No prose before or after the array. No code fences.",
    styleBlock,
  ].filter(Boolean).join("\n\n");
}
