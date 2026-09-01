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

// docs/discussion-thread-structure-acceptance-criteria.md T2: the three-
// member set a captured post's thread position can hold. Lives HERE (not in
// discussion-capture.ts or discussion-replies.ts) for the same reason
// DiscussionAudience does - it is read by BOTH the extraction action (to
// type what it returns) and, structurally, by anything that needs to name
// the same three strings without restating them. T2b: anything outside this
// set coerces to `undefined`, never throws and never invents a fourth value.
export type ThreadPosition = "root" | "reply" | "unknown";

export type DiscussionAudience = "peers" | "students";

export const DISCUSSION_AUDIENCE_LABELS: Record<DiscussionAudience, string> = {
  peers: "Peers",
  students: "Students",
};

// docs/reply-composition-controls-acceptance-criteria.md C2/C4. These live
// HERE for the same reason DiscussionAudience and ThreadPosition do: this file
// is already the leaf that both the client controls and the prompt builder
// import, and every edge points INTO it, so no cycle is possible. Entry 372
// shipped one three-member set restated in four modules; that is not repeated.
export type ReplyIngredient =
  | "compliment"
  | "deeper-question"
  | "insight"
  | "resources"
  | "correction";

export const REPLY_INGREDIENTS: readonly ReplyIngredient[] = [
  "compliment",
  "deeper-question",
  "insight",
  "resources",
  "correction",
] as const;

// C2e: stem-completing labels - the control reads "Each reply should include:
// a compliment on what the post did well". "correction" states its own
// conditionality in the label (C2a), so the UI carries it too, not only the
// prompt.
export const REPLY_INGREDIENT_LABELS: Record<ReplyIngredient, string> = {
  compliment: "a compliment on what the post did well",
  "deeper-question": "a question that goes deeper",
  // Deliberately does NOT say "the post": this label is shared with the
  // announcement surface (take-announcement.ts), where there is no post and
  // "the post" read as a stray reference to something that does not exist.
  // Neutral wording serves both surfaces, which is why the list is shared
  // rather than forked - entry 372 shipped one set restated in four modules.
  insight: "an insight not already covered",
  resources: "two or three relevant resources",
  correction: "a gentle correction, only if something is wrong",
};

// C4a: three stops, ordered casual -> formal, indexed by the slider position.
// "Balanced" (not "Neutral") because the middle stop preserves the audience
// register's own tone rather than flattening it.
export type ReplyFormality = "casual" | "balanced" | "formal";

export const REPLY_FORMALITY_STOPS: readonly ReplyFormality[] = [
  "casual",
  "balanced",
  "formal",
] as const;

export const REPLY_FORMALITY_LABELS: Record<ReplyFormality, string> = {
  casual: "Casual",
  balanced: "Balanced",
  formal: "Formal",
};

/**
 * What the instructor has asked every drafted reply to contain. Passed whole
 * from the panel through runDraftLoop to buildReplyDraftingPrompt, so a new
 * field cannot be added on one side and silently dropped on the other.
 *
 * C4b-i: the DEFAULTS ARE NOT INERT - two ingredients are pre-selected and
 * addressByName is ON, so the first capture after this ships produces visibly
 * different replies with no action taken. That is intended.
 */
export interface ReplyCompositionSettings {
  ingredients: readonly ReplyIngredient[];
  addressByName: boolean;
  formality: ReplyFormality;
}

export const DEFAULT_REPLY_COMPOSITION: ReplyCompositionSettings = {
  ingredients: ["compliment", "deeper-question"],
  addressByName: true,
  formality: "balanced",
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

    // docs/discussion-thread-structure-acceptance-criteria.md T3a. Every
    // clause below maps to a named failure case from that doc's section 1/0:
    // T0-1/T0-2 rule out cross-image and cross-batch inference outright (the
    // model has no memory of another batch and the client cannot stitch
    // relationships either), and T1/T1a make "unknown" the safe default
    // rather than a guess. No numeric depth is ever requested - LMS views cap
    // visual nesting, so depth 3 and depth 4 are pixel-identical, and asking
    // for a number that is not actually in the image only manufactures a
    // confident wrong answer.
    "THREAD POSITION",
    "- For each post, report whether it is a top-level post or a reply to another post, using only what is visible in these images.",
    "- If the board prints a line naming who a post replies to, report that name in \"replyingToAuthor\", exactly as it is shown.",
    "- If you cannot tell from what is visible, report \"unknown\" rather than guessing.",
    "- Do not infer a post's position from where it sits relative to posts in OTHER images - each image is its own evidence.",
    "- Do not guess a nesting level from how far a post is indented when no un-indented post is visible for comparison in the same image.",
    "- Never report a \"replyingToAuthor\" you cannot actually read. A name inferred from context, rather than read off the screen, is a guess about a real person.",

    "TEXT THAT IS CUT OFF",
    "- If a post is truncated by a control such as \"Show more\", \"Read more\", \"See more\" or an ellipsis, return only the text that is actually visible, and do NOT include the control's own words in the text.",
    "- If a post runs off the bottom edge of the last image, return the visible part.",
    "- If a post's author name is NOT visible in any image - because the top of the post was already scrolled past - SKIP that post entirely. Do not guess who wrote it and do not attribute it to the nearest name you can see.",
    "- Never continue, complete, summarise, paraphrase, correct or tidy a post. Transcribe the words that are on the screen. If you cannot read a word, leave it out rather than inventing one.",

    "IF THERE ARE NO POSTS",
    "- If these images show only navigation, a course home page, an empty board or a loading state, return an empty array: []",

    "OUTPUT",
    'Return ONLY a JSON array, and nothing else. Each element is {"author": "...", "text": "...", "postedAt": "...", "threadPosition": "...", "replyingToAuthor": "..."} - no other keys.',
    '"author" is the display name exactly as it is shown, with no title, no timestamp and no role label.',
    '"text" is the post\'s words as plain text. Use "\\n" between paragraphs. Do not use markdown and do not use backticks.',
    '"postedAt" is omitted entirely when no timestamp is visible.',
    '"threadPosition" is exactly one of "root", "reply" or "unknown", per the THREAD POSITION rules above.',
    '"replyingToAuthor" is included only when the board prints the name of who a reply answers; omit it entirely otherwise.',
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

// docs/reply-composition-controls-acceptance-criteria.md C4b: modulates
// AUDIENCE_STANCE rather than restating or contradicting it - diction only,
// never a stance change. C4b/the "balanced stop is inert" requirement: the
// middle stop contributes NOTHING (empty string, dropped by
// .filter(Boolean)) so a default-formality call is byte-identical to a call
// that never mentioned formality at all.
function formalityClause(formality: ReplyFormality): string {
  switch (formality) {
    case "casual":
      return "Lean casual in how you write this: contractions are fine, favor shorter sentences and everyday word choices - without abandoning the tone and substance described above.";
    case "formal":
      return "Lean formal in how you write this: avoid contractions, favor fuller sentences and more precise, exact word choices - without abandoning the tone and substance described above.";
    case "balanced":
    default:
      return "";
  }
}

// docs/reply-composition-controls-acceptance-criteria.md C1a: the
// "No greeting line and no sign-off..." bullet, made conditional on the
// address-by-name toggle. The no-standalone-greeting-line and no-sign-off
// rule is unconditional in BOTH branches - it was never about names - only
// the "do not open with the person's name" clause flips. When `addressing`
// is false this returns the ORIGINAL line, byte-identical to before this
// change (C1a "toggle OFF: today's line, byte-identical").
function nameLine(addressing: boolean, audience: DiscussionAudience): string {
  if (!addressing) {
    return "- No greeting line and no sign-off. Do not open with the person's name. The reply is pasted into a box that already shows who is speaking and who is being answered.";
  }
  // C2g: for students, the greeting PRECEDES the register's own mandated
  // opening move (naming something the student said) rather than replacing
  // it - stated explicitly so the two instructions do not compete for the
  // same sentence.
  const studentsOrdering =
    audience === "students"
      ? ' For students, this comes before naming something the student actually said, not instead of it - for example "Maria, your point about the second reading ...", not a greeting line followed by a restart.'
      : "";
  return (
    "- No separate greeting line of its own (no \"Hi\", no \"Hello\") and no sign-off. Where a greeting name is given for a post below, open that reply with the name itself and nothing else, leading straight into the same sentence - never a standalone salutation." +
    studentsOrdering +
    " A post with no greeting name given gets no greeting at all. The reply is pasted into a box that already shows who is speaking and who is being answered."
  );
}

// docs/reply-composition-controls-acceptance-criteria.md C2: one prompt
// clause per selected ingredient.
//   - C2a: "correction" is explicitly conditional - it must say nothing
//     against a post that is not actually wrong, or an unconditional
//     "correct them" instruction invites an invented error.
//   - C2b: "resources" does NOT ask the model to write links itself - actual
//     resource links are gathered by a separate pass (entry 368's state
//     machine, gated elsewhere by this same selection) and inventing a URL
//     here would be a hallucination this clause exists to forbid.
//   - C2f: "compliment" is audience-aware. The peers register (:186 above)
//     already says "Do not open with praise" - the compliment clause for
//     peers must not instruct an opening praise line, only substance
//     engagement elsewhere in the reply. The students register (:178) has no
//     such conflict - it already mandates opening by naming something the
//     student said, so the compliment clause ties into that SAME opening
//     move rather than adding a competing one.
function ingredientClause(ingredient: ReplyIngredient, audience: DiscussionAudience): string {
  switch (ingredient) {
    case "compliment":
      return audience === "peers"
        ? "- Somewhere in the reply, acknowledge something specific the post gets right - but not as an opening line; the stance above already asks you not to open with praise."
        : "- A specific compliment on something the post did well, worked into the opening move above rather than a separate line.";
    case "deeper-question":
      return "- Ask one question that pushes past what the post already said, not a restatement of it.";
    case "insight":
      return "- Add one insight or idea the post did not already raise.";
    case "resources":
      return "- Leave room for two or three resource links to be attached separately after your reply; do not invent or write any URL yourself.";
    case "correction":
      return "- Only if the post actually contains a factual error, gently correct it. If it does not, say nothing about a correction - do not invent one to satisfy this list.";
    default:
      return "";
  }
}

/**
 * Prompt for drafting one reply to each of `posts`. `styleBlock` (from
 * getWritingStyleBlock) is threaded through as the LAST element deliberately
 * - it begins with its own "MATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE"
 * header and can carry up to 1500 characters of freeform prose; placing it
 * before the output contract would put format instructions too far from the
 * model's turn. It is "" on any getWritingStyleBlock failure, which
 * .filter(Boolean) drops cleanly. This builder owns the WHOLE prompt so the
 * whole prompt is unit-testable - the action never concatenates onto it.
 *
 * docs/discussion-thread-structure-acceptance-criteria.md T6/T6a: a post may
 * carry an optional `parent` - the row `resolveDraftParent` (in
 * discussion-capture.ts, owned by the sibling half of this group) resolved
 * for it, already gated on all three of threadPosition === "reply", a
 * printed replyingToAuthor and exactly one matching author. When present, it
 * is rendered immediately before that post's own block, labelled
 * `CONTEXT ONLY - DO NOT REPLY TO THIS`, and carries NO "POST n" number -
 * the output contract only ever asks for `1..posts.length`, so a numberless
 * block is structurally unaddressable by the model's own reply. This is
 * deliberate, not an oversight: conflating the parent with something the
 * model can be asked to answer is the one failure mode T6a exists to
 * foreclose, and budget was never the constraint (worst case is
 * DRAFT_BATCH_SIZE extra ~600-character blocks, about 3.5% input growth).
 *
 * docs/reply-composition-controls-acceptance-criteria.md C1b/C1b-ii: each
 * post may also carry an optional `greetingName` - precomputed by the
 * caller (discussion-draft-loop.ts, the sibling half of this group) via
 * person-name.ts's `greetingNameFromAuthor`, threaded per-post exactly like
 * `parent`. This file never imports person-name.ts and never derives a name
 * itself - the model is TOLD the name to use, never asked to guess one
 * (C1b). Per C1b-ii this also structurally keeps the CONTEXT ONLY parent
 * block from ever being greeted: `greetingName` only ever exists on a post
 * element, never on `parent`, and the code below never reads
 * `p.parent.greetingName`.
 *
 * `knowledgeContext` (the "activate this recording from the Knowledge base"
 * feature, src/lib/recording-launch.ts): an optional, ALREADY-RENDERED block
 * - the caller (src/app/actions/discussion-replies.ts) hands this function
 * exactly what buildKnowledgeContextBlock (src/lib/chat/knowledge-context.ts)
 * produced, verbatim, including its own anti-prompt-injection framing header.
 * This function never reformats it, never truncates it further, and never
 * re-derives its own framing - the instructor's selected standards pages are
 * DATA, and that header is the one guard against a page whose text reads
 * like a directive. Appended immediately BEFORE `styleBlock`, never after -
 * `styleBlock` stays the LAST element exactly as its own "LAST deliberately"
 * placement (this doc's own paragraph above) requires, so styleBlock's own
 * "put format instructions right before the model's turn" reasoning stays
 * true even when knowledgeContext is also present: reference material about
 * SUBSTANCE precedes format instructions about FORM. Omitted (not just
 * falsy) leaves the returned prompt byte-identical to a call that never
 * mentioned it at all, via the same `.filter(Boolean)` every other optional
 * block in this function already relies on - this is what keeps every
 * EXISTING call site in this file's own test suite (all of them omit this
 * 6th argument) provably unchanged by this addition.
 */
export function buildReplyDraftingPrompt(
  posts: ReadonlyArray<{
    id: string;
    author: string;
    text: string;
    parent?: { author: string; text: string };
    greetingName?: string;
  }>,
  audience: DiscussionAudience,
  courseName: string,
  styleBlock: string,
  composition: ReplyCompositionSettings,
  knowledgeContext?: string
): string {
  const course = courseName.trim();
  const addressing = composition.addressByName;
  const hasGreetingNames = posts.some((p) => p.greetingName);

  // C2c: emitted ONLY when at least one ingredient is selected - zero
  // selected leaves the prompt byte-identical to today's.
  const ingredientsBlock =
    composition.ingredients.length > 0
      ? [
          "EACH REPLY SHOULD INCLUDE",
          ...composition.ingredients.map((ingredient) => ingredientClause(ingredient, audience)),
        ].join("\n")
      : "";

  // The precomputed per-post greeting names, addressed by the SAME "POST n"
  // numbering used in THE POSTS block and the output contract below (both
  // left untouched, per this group's scope) so the model can map a name to
  // a post without either block being restructured. Only emitted when the
  // toggle is on AND at least one post actually carries a name - a post
  // that has none is simply absent from this list, which is how "no
  // greeting instruction even when the toggle is ON" (for that row) is
  // enforced.
  const greetingNamesBlock =
    addressing && hasGreetingNames
      ? [
          "GREETING NAMES",
          "Use each name below only for the post it is listed against, and only as instructed above - never invent, guess, or reuse a name for a post it is not listed against.",
          ...posts
            .map((p, i) => (p.greetingName ? `- POST ${i + 1}: ${p.greetingName}` : ""))
            .filter(Boolean),
        ].join("\n")
      : "";

  return [
    AUDIENCE_STANCE[audience],
    formalityClause(composition.formality),
    course ? `The discussion is on a course called "${course}".` : "",

    "Write one reply to each post below.",

    "EVERY REPLY, BOTH REGISTERS",
    "- Write in the first person, as yourself.",
    "- 3 to 6 sentences. Plain prose.",
    "- No markdown, no headings, no bullet lists, no bold.",
    nameLine(addressing, audience),
    "- No emoji.",
    // T6b: widened EXPLICITLY from "the post you are answering" to "the
    // posts shown to you here" - a CONTEXT ONLY parent block is now
    // sometimes shown alongside the post being answered, and the old
    // phrasing would otherwise silently narrow to exclude it. The point is
    // to change this on purpose rather than let it drift.
    "- Never state a fact about the course - a date, a policy, a reading, an assignment, a grade - that is not written in the posts shown to you here. If you need one, write around it.",
    "- Reply only to what that post says. Do not refer to the other posts below.",
    // Only stated when at least one post in this batch actually carries a
    // parent - an unconditional instruction about a block that never
    // appears would be noise in the common case, and would also break the
    // T6a guarantee that the parent block is the ONLY thing distinguishing
    // a batch that needed context from one that did not.
    posts.some((p) => p.parent)
      ? "- A block labelled CONTEXT ONLY - DO NOT REPLY TO THIS is background for understanding the post beneath it. Never write a reply to that block, and never count it as one of the numbered posts."
      : "",

    ingredientsBlock,
    greetingNamesBlock,

    "THE POSTS",
    posts
      .map((p, i) => {
        const context = p.parent
          ? `CONTEXT ONLY - DO NOT REPLY TO THIS\nWritten by: ${p.parent.author}\n${p.parent.text}\n\n`
          : "";
        return `${context}POST ${i + 1}\nWritten by: ${p.author}\n${p.text}`;
      })
      .join("\n\n---\n\n"),

    "OUTPUT",
    `Return ONLY a JSON array with exactly ${posts.length} elements, and nothing else.`,
    'Each element is {"post": <the POST number>, "reply": "..."} - the number, not the name.',
    `Include every post number from 1 to ${posts.length}, in order.`,
    // C3-i: this line CHANGED (not supplemented) - "if you need one" was a
    // suggestion; C3 requires a paragraph break, with a blank line, for a
    // reply over roughly 60 words.
    'Write the reply as plain text. If it runs longer than about 60 words, break it into at least two paragraphs, separated by a blank line ("\\n\\n"). No backticks.',
    "No prose before or after the array. No code fences.",
    // knowledgeContext BEFORE styleBlock, never after - see this function's
    // own doc comment for why styleBlock must stay LAST even when both are
    // present. "" (never present) is dropped by .filter(Boolean) below,
    // which is what keeps a call that omits this argument byte-identical.
    knowledgeContext ?? "",
    styleBlock,
  ].filter(Boolean).join("\n\n");
}
