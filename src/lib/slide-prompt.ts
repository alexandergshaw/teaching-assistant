import { APPLIED_REAL_TOOL_RULE, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import type { SlideData } from "@/app/actions-types";

/**
 * Shared pedagogical slide-deck structure and requirements.
 * Every deck-generation prompt composes these constants so all decks (assignment
 * lectures, module lectures, etc.) share one pedagogical contract: Example →
 * Walkthrough → Practice → Answer coding sequences, Case Study engagement,
 * Additional Practice closers, Modern Tech exploration, and Documentation sections.
 *
 * They also compose PLAIN_LANGUAGE_CONTRACT (src/lib/artifact-voice.ts) and
 * add deck-specific FLOW and CONNECT-TO-THE-STUDENT rules: a real generated
 * deck read as four same-length parallel statements per slide with no
 * connective tissue between slides and nothing tying any concept to
 * something the student had personally experienced. Those rules are voice
 * and flow additions on top of the pedagogy above, not a replacement for it.
 */

/**
 * Hard cap on a slide title's length, in characters, prefix and spaces
 * included. Both course-kind contracts state it (TITLE LENGTH), and
 * enforceTitleLength below enforces it in code after generation.
 *
 * Measured, not guessed: across the 48 slides of a real generated deck
 * (INFO 1020 - Lecture Materials (14).zip) the median title was 29
 * characters, but 8 ran past 60 and the longest hit 88 - long enough to wrap
 * to a third line, shrink the body text under it, and stop being readable
 * from the back of a room. 60 keeps every title in the measured deck's
 * healthy majority untouched while cutting exactly the tail that broke the
 * layout.
 *
 * The contract's OWN worked example was part of the problem: ASSERTION
 * TITLES used to illustrate a good title with an 88-character sentence -
 * the exact length of the worst title in the shipped deck. Both contracts
 * now demonstrate the rule with an example that fits it.
 */
export const SLIDE_TITLE_MAX_CHARS = 60;

export const SLIDE_DECK_JSON_SHAPE = `{
  "presentationTitle": "...",
  "slides": [
    { "title": "...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Case Study: ...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Agenda: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Section 1: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "...", "bullets": ["..."], "notes": "..." },
    { "title": "Example: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python", "notes": "..." },
    { "title": "Walkthrough: ...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python", "notes": "..." },
    { "title": "Practice: ...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python", "notes": "..." },
    { "title": "Answer: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python", "notes": "..." },
    { "title": "Failure Modes: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Documentation: Key Concepts", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Terminology: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Recap: Where We Landed", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Next Week: ...", "bullets": ["..."], "notes": "..." },
    { "title": "Modern Tech: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Documentation & References", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Appendix: Post-Lecture Practice", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Post-Lecture Practice: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python", "notes": "..." },
    { "title": "Answer: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python", "notes": "..." }
  ]
}`;

export const SLIDE_STRUCTURE_REQUIREMENTS = `- Each slide must have a "title" and a "bullets" array.
- ${PLAIN_LANGUAGE_CONTRACT}
- Every slide must also have "notes": the speaker notes for that slide - what the instructor SAYS while it is on screen. Write 3-6 FULL sentences of real teaching narration (roughly 60-120 words, not fragments): the explanation behind the bullets and at least one question to ask the class. Every slide's notes but the last MUST close with a handoff sentence that explicitly names the next slide's topic or idea, so the deck reads as one continuous lecture instead of a stack of disconnected cards. That handoff sentence must be built from what THIS slide specifically just established - name the concept, the result, or the code just shown - never a generic, content-free connector like "let's see this in code", "now try it yourself", or "let's break this down" reused slide after slide: a deck where every Example-to-Walkthrough or Walkthrough-to-Practice transition uses the same stock phrase reads as a filled-in template, not a taught lecture, even when each individual handoff is technically present. The notes are the lecture; the bullets are only what the students see. Never repeat the bullets verbatim, and never write a placeholder or an instruction to the instructor to fill something in.
- Maximum 4 bullets per slide.
- Each bullet must be a complete, self-explanatory sentence (or two) that a student can fully understand without any verbal elaboration. Define every term you introduce, explain how each concept works, and state why it matters for this material. Ground it in something concrete and checkable: name the specific framework, standard, method, API, data structure, real figure/statistic, or named artifact involved, or spell out the actual steps of the process - never a generic statement that could apply to any topic in the field. Never use bare keywords or vague one-liners — write as if the student is reading the slide alone with no instructor present.
- BREADTH MINIMUM: never stop at a single concept. When a CONCEPT PLAN is given above, it names the floor for how many distinct concepts this deck teaches - cover EVERY one of them, each with its OWN full cycle (a concept slide, Example, Walkthrough, Practice, Answer); do not merge multiple listed concepts into one cycle, and do not stop after only the first. Absent a concept plan, a topic that itself names multiple ideas (e.g. a title like "X and Y") still teaches BOTH, never just the first.
- The first slide should be a title/overview slide listing the key topics covered in the lecture.
- The SECOND slide MUST be a real-world case study or news story about this lecture's subject, with "title" beginning with "Case Study:". Name a specific, well-known, widely-documented real event (the organization or product involved and roughly when it happened). Prefer a dramatic, motivating story — a high-profile failure, security breach, or outage, OR an impressive system that was built — to show students why this matters. Use the bullets to summarize what happened, and make the last bullet connect the story to what students are about to learn. Do not put "code" on this slide. Stick to established facts; never invent events or fabricate specifics.
- AGENDA SLIDE: the THIRD slide (immediately after the Case Study slide) MUST be titled "Agenda: <lecture topic>", listing this lecture's concepts (from the CONCEPT PLAN above) in the exact order they will be taught, and MUST carry a graphic (see SLIDE GRAPHICS below) that maps the lecture before it starts - this guarantees at least one real visual in every deck. The CONCEPT PLAN can name anywhere from 2 to 7 concepts, and "process" only accepts 3-6 steps, so which graphic shape to use depends on the concept count: with 3 to 6 concepts, a "process" graphic whose steps are exactly those concepts, one step per concept, in that same teaching order; with 2 concepts (too few for "process", which needs at least 3 steps) or 7 concepts (too many - "process" and "table" both cap at 6), a "table" graphic instead, headers "Section" and "What You Will Be Able To Do", one row per concept. At 2 concepts every concept fits in the table with no loss; at 7, the table itself can only hold the first 6 (its row cap), but the slide's own bullets - which already list every concept in teaching order, per this rule's first sentence - still name the 7th, so no concept is ever silently dropped from the lecture's map. Absent a CONCEPT PLAN, list the concepts this deck's own material organizes itself into instead - the same concepts the per-concept Section divider/Example cycle below builds for, in the order taught - and choose the graphic shape by that same count.
- BREADTH: Cover the subject at maximum breadth. Enumerate every subtopic a student at this level needs: core ideas, syntax variants, common pitfalls, real-world use cases — do not limit to 2-3 most common subtopics; breadth may increase slide count.
- ORDER: sequence the subtopics so the lecture flows logically — teach a prerequisite before any topic that depends on it, keep every slide about one subtopic contiguous rather than returning to it later in the deck, cover foundations before advanced or optimization material, and never split one subject across two separate places in the deck. The overview slide's topic list must match the order the deck actually teaches them in.
- FLOW: the bullets on a slide must read as a progression, not four parallel statements at the same altitude - each bullet after the first must extend, complicate, or follow FROM the fact stated in the bullet directly above it (its consequence, its exception, or the next-level detail it unlocks), never a second, independent fact about the same topic sitting next to the first. "Modular design is X. It improves maintainability. It also improves reusability. It also avoids spaghetti code." is four parallel facts wearing a bullet list, not a progression, even though each one is true on its own - a real test: if you deleted any one bullet, would the bullet after it stop making sense? If not, rewrite the chain so it would. This applies to every slide in the deck, coding and conceptual alike.
- CONNECT TO THE STUDENT: for every concept, ground it - before or alongside the professional example - in a situation the student has actually been in (a group project where nobody owned a task, a part-time job, a club budget, registering for classes) and say plainly why it matters to them now, not only to a practitioner later. This is IN ADDITION to the real-world case study and professional examples required elsewhere on this list, never a replacement for them.
- Use real-world analogies and concrete examples that students will recognise; integrate the analogy into the bullet itself so it is self-contained.
- For every concept-focused slide, immediately follow it with a concrete example slide and a step-by-step walkthrough slide that explains each step or line in plain English so the student understands the reasoning without needing the instructor to narrate it. Label these slides clearly (e.g. "Example: <concept>" and "Walkthrough: <concept>").
- CODING CONCEPTS: When the concept being introduced is a coding concept (a loop, conditional, variable, function, class, data structure, etc.), follow it with exactly these four slides, in this order:
  1. Example slide — "title" begins with "Example:"; demonstrate that exact concept with a short, correct, self-contained snippet in "code" (use real newlines) and "codeLanguage" set; keep "bullets" to at most one short caption.
  2. Walkthrough slide — "title" begins with "Walkthrough:"; explain the example code line by line in "bullets" while showing the same code in the "code" field; use the exact code from the Example slide so students can read both the code and the explanation together.
  3. Practice slide — "title" begins with "Practice:"; pose a simple, self-contained coding challenge on the same concept for the student to attempt. State the task in 1-2 "bullets" and set "codeLanguage". Its "code" field MUST repeat the SAME reference code shown on the Example/Walkthrough slide so the student has a worked example to reference — it must NOT contain the solution to the practice challenge or any code that gives away the answer. Keep this practice problem introductory and gently scaffolded: single skill, no tricks, mirrors the worked example closely.
  4. Answer slide — "title" begins with "Answer:"; give the correct, runnable solution to that exact practice challenge in "code" with "codeLanguage" set, plus at most one "bullets" caption.
- All of Example, Walkthrough, Practice, and Answer slides must include "code"/"codeLanguage". Do not omit "code" on Walkthrough or Practice slides. Omit code only on conceptual slides.
- SECTION DIVIDERS: immediately before each concept's own introduction slide (the concept-focused slide that opens its Example/Walkthrough/Practice/Answer cycle) - including the very first concept - insert a divider slide titled "Section <n>: <concept>" (n is that concept's 1-based position in the CONCEPT PLAN above). Its "bullets" are exactly two: (a) the one question this section answers, and (b) what the student will be able to do once this section is done. This marks, explicitly, where the lecture is at all times, instead of cutting hard from one concept straight into the next. Absent a CONCEPT PLAN, n is this concept's 1-based position in the order this deck itself teaches its concepts.
- NO TRANSITION SLIDES: never insert a slide whose only job is to announce the move from one concept to the next - no "Bridge:", "Transition:", "Up Next:", or "Moving On:" slide. Each concept's cycle flows directly into the next concept's Section divider. The hinge between concepts is already carried twice over: by the speaker NOTES, which every slide but the last must close by naming what comes next (see the notes rule above), and by the next Section divider's own two mandated bullets, which state the question that section answers. A slide that only says "we just settled X, now we start Y" adds nothing either of those does not already say - it is filler on screen, spends lecture time, and teaches nothing.
- SLIDE BUDGET: this deck must be deliverable within the stated LECTURE DURATION, not run over it - and SLIDE COUNT is not what determines that, so do not budget by counting slides. A Section divider, Agenda, or Recap slide is 10-20 seconds of talking; the Practice slide (an in-lecture coding exercise the student actually attempts) is several minutes of class time. The signpost slides in this contract (Agenda, Section dividers, Recap, Next Week) cost seconds each and are not what consumes the hour - the Example/Walkthrough/Practice/Answer cycle is what actually spends it. As a structural expectation, not a slide-count target: about "10 + concepts * 6" IN-LECTURE slides for the concept count named in the CONCEPT PLAN above - a 50-minute lecture with 5 concepts lands around 40 in-lecture slides. This figure covers ONLY the in-lecture material, from the title slide through the Recap/Next Week slides - it EXCLUDES the separate Post-Lecture Practice appendix (its own divider and intro slide, plus 2 additional practice problems - each with its own Answer - per concept), which adds roughly "2 + concepts * 4" more slides on top of the figure above and is deliberately self-study material the lecture hour itself never has to accommodate. Never read this figure, or any other slide-count figure in this rule, as a cap on the WHOLE deck including that appendix - it is a cap on the in-lecture portion only. Absent a stated LECTURE DURATION or CONCEPT PLAN, size the deck to the material itself instead - as many concepts as the material actually supports, without padding to hit a target.
- TITLE LENGTH: every slide title in this deck - of every kind, counting spaces and any mandated prefix - must be at most ${SLIDE_TITLE_MAX_CHARS} characters long. A title is a headline, not a sentence read aloud: past that length it wraps to a third line, squeezes the body text, and stops being readable from the back of the room. This is a hard cap, not a preference, and it is checked IN CODE after generation - an over-long title is cut down automatically, so write it short yourself rather than have it cut for you. Whenever the point genuinely needs more words than the title has room for, the full statement belongs in that slide's FIRST BULLET; the title keeps only the short form of the claim.
- ASSERTION TITLES: each concept's own introduction slide (the concept-focused slide referenced above, immediately after its Section divider and before its Example slide) must have a title that states a short, complete, grammatically full claim about that concept - never a bare topic label - AND that fits the TITLE LENGTH cap above. Both halves are required: the title is a claim, and the title is short. Write "Recursion solves a problem with a smaller copy of itself" (55 characters); never the bare label "Recursion", and never an unbounded sentence like "Recursion breaks a problem into a smaller version of itself until it reaches a base case" (88 characters - a true claim, but far past the cap and unreadable as a title). Put the complete assertion, with whatever qualifying clause the short title had to drop ("... until it reaches a base case"), in that slide's first bullet instead - never lengthen the title to hold it. A student should learn something true about the concept from the title alone, before reading a single bullet. This rule does NOT extend to "Example:", "Walkthrough:", "Practice:", or "Answer:" (their fixed prefix already names their role in the cycle, per CODING CONCEPTS above) nor to the SECTION DIVIDERS, AGENDA SLIDE, RECAP, or NEXT WEEK title formats, which are navigation furniture with their own mandated label form, not a claim. The TITLE LENGTH cap, unlike this rule, DOES apply to all of those.
- SLIDE GRAPHICS: any slide may optionally carry one "graphic" field alongside its bullets - a real visual (never an image, never a chart) rendered as PowerPoint shapes and tables. Use exactly one of these two shapes, matching these exact field names:
  - process: { "kind": "process", "steps": [ { "label": "...", "caption": "..." }, ... ] } - 3 to 6 steps; fits an algorithm's stages, a request/data lifecycle, or a concept that is itself a sequence of steps.
  - table: { "kind": "table", "headers": ["...", "..."], "rows": [["...", "..."], ["...", "..."]] } - up to 5 columns and 6 rows; fits a complexity comparison, an API surface, a class/relationship comparison, a term/definition glossary, or similar tabular material.
  The Agenda slide MUST carry a graphic too, but which KIND is decided entirely by the AGENDA SLIDE rule above (process at 3-6 concepts, table at 2 or 7) - never restate a specific kind for it here. EVERY concept's own introduction slide (the concept-focused slide described in CODING CONCEPTS above, immediately after its Section divider and before its Example slide) MUST also carry a graphic: it is the only slide in that concept's cycle with no code block already serving as its visual (a "graphic" field is ignored on any slide that also carries "code", so Example/Walkthrough/Practice/Answer keep their code panel as their visual instead). Choose whichever shape genuinely fits that concept: "process" when the concept IS itself a sequence (execution order, a lifecycle, an algorithm's stages), "table" otherwise (contrasting two related constructs, enumerating variants, or laying out a class's members). EVERY Terminology slide MUST carry a "table" graphic with headers "Term" and "Definition" and one row per term, restating - never expanding on - the exact term/definition pairs already in that slide's own bullets; this is the one slide in the deck where the graphic and the bullets say the identical thing in two forms, and that is intentional; it costs nothing to fabricate because there is nothing left to invent. No other coding slide is required to carry a graphic - use one only where it genuinely fits the material already grounded elsewhere on that slide; never fabricate a figure, row, or step the bullets do not already support. At most one graphic per slide; a slide that carries one keeps its "bullets" to 2 so the graphic has room to render, except the Agenda and Terminology slides, which are exempt from this cap: their bullets already list every concept or every term (per AGENDA SLIDE above and the TERMINOLOGY closing section below), and that list - not the graphic - is the slide's primary content, so its bullet count follows the concept/term count instead of the usual 2-bullet ceiling.
- CLOSING SECTIONS: after all the per-concept cycles above (each with its own Section divider), ALWAYS append these closing sections at the very END of the deck, in this exact order:
  A. FAILURE MODES: one or more slides whose "title" begins with "Failure Modes:" naming, concretely, how this material actually goes wrong in practice - a specific bug, misconception, or edge case programmers hit, why it happens, and what it costs when it does. Ground each bullet in a named, concrete failure pattern (an off-by-one error, a mutated shared reference, an unhandled null case), never a generic warning.
  B. DOCUMENTATION - KEY CONCEPTS: one or more slides whose "title" begins with "Documentation:" that recap the key concepts, terms, and syntax taught in this deck as a concise study reference the student can revise from (use bullets; short code snippets are allowed).
  C. TERMINOLOGY: one or more slides whose "title" begins with "Terminology:" listing the precise vocabulary of this material - each bullet names one term (a keyword, a data structure, a complexity class, a syntax construct) and gives its precise, field-standard definition, distinct from the conceptual recap in the Documentation slides above. Every Terminology slide MUST carry a "table" graphic (see SLIDE GRAPHICS above) restating that same term/definition list as rows.
  D. RECAP: a single slide titled EXACTLY "Recap: Where We Landed" that MUST name, by name, the organization/event from this deck's OPENING Case Study slide (the second slide) and close the loop that Case Study opened, rather than leaving it as a one-off hook never mentioned again. State concretely what this lecture's concepts EXPLAIN about that story, and let the story's OWN direction decide the shape: when the Case Study is a failure, name which specific concept taught here bears on the thing that went wrong; when it is a success - a system built well, or an organization that INVENTED, shipped, or popularized the very material this lecture teaches - name which of these concepts it applied and what that bought it. NEVER invert the Case Study you yourself told: do not claim an organization "would have avoided" an outcome it in fact produced on purpose, and never treat the technology an organization CREATED as a problem it should have prevented. Do not speculate about what anyone would have done differently unless the Case Study slide itself established that they failed to do it. This slide restates and connects what the deck already said - it introduces no new claim about the organization that the Case Study slide does not already support.
  E. NEXT WEEK: a single slide - for every week except the course's FINAL week - titled "Next Week: <next week's topic>" with one sentence on what carries forward from this lecture into it. For the course's FINAL week, title this slide "Where This Goes Next" instead, and use it to connect the term's material to professional application beyond the course, since there is no next week to name. Absent any information about which week this is or what (if anything) follows it, omit this slide entirely rather than guessing whether a next week exists or inventing its topic - neither title is safe to produce without that data.
  F. MODERN TECH TO EXPLORE: 1-2 slides whose "title" begins with "Modern Tech:" that connect this deck's concepts to current, real-world technology students can investigate to dig deeper. Each bullet names one real, widely used modern technology, framework, tool, or service (for example a popular library, cloud service, or AI tool that builds on these concepts), states in a sentence how it relates to a concept taught in this deck, and suggests what to explore first. Name only real, well-known technologies; never invent products or overstate what they do. No "code" on these slides.
  G. DOCUMENTATION AND REFERENCES: a final slide titled exactly "Documentation & References" that lists authoritative resources for the topics: name the official documentation for each language, library, or tool used, plus 2-4 suggested further-reading resources. Name only real, well-known resources (official language/library documentation, MDN, the tool's own docs); do NOT fabricate specific URLs or invent facts.
  H. APPENDIX - POST-LECTURE PRACTICE: the VERY LAST section of the deck, appearing AFTER "Documentation & References" above (never before it, and never mixed in among the earlier per-concept cycles). Open it with its own divider slide titled EXACTLY "Appendix: Post-Lecture Practice", then a "Post-Lecture Practice" slide introducing self-study practice. Then for EACH coding concept in the deck, add exactly 2 additional practice problems at increasing difficulty — the first noticeably harder than the in-lecture practice (moderate), the second harder still (challenging, combining ideas or edge cases). Each problem slide titled "Post-Lecture Practice:" followed by its "Answer:" slide. For a non-programming module, add exactly 2 additional conceptual practice questions per concept, each followed by an "Answer:" slide, with no code fields.
- Do not include any text outside the JSON object.`;

/**
 * Insert an extra JSON field (e.g., "announcement" for lecture decks) before
 * the closing brace of the deck JSON shape, preserving valid JSON syntax.
 * `kind` selects which shape to extend (default "coding", so every
 * pre-existing call site - which only ever extended the coding shape -
 * behaves exactly as before).
 */
export function slideDeckJsonShapeWith(extraFieldLine: string, kind: CourseKind = "coding"): string {
  return slideDeckJsonShape(kind).replace(/}\s*$/, `, ${extraFieldLine}\n}`);
}

// ── Course-kind variants ───────────────────────────────────────────────────
//
// The two constants above ARE the programming-course contract, and stay
// exactly as they were so every existing caller and assertion is unchanged.
//
// An applied (no-code) course does NOT reuse the coding cycle with the code
// stripped out. Example -> Walkthrough -> Practice -> Answer is a near-clone
// of the coding contract, and two of its assumptions do not hold for a field
// with no source code: "Walkthrough" means explaining code line by line, and
// "Answer" implies a single correct response - exactly wrong for a field
// (this app targets courses like PMP-facing project management) where
// practice is professional judgment under constraint, not one right answer.
//
// The applied variant instead runs, per concept, a four-slide CORE every
// concept gets without exception - Principle, In Practice, Artifact,
// Judgment Call - plus a Your Turn / Model Response pair that only some
// concepts additionally get in-lecture (see SLIDE BUDGET below), completing
// a six-slide cycle for those - plus two deck-level sections coding decks do
// not need: Failure Modes and Terminology. See docs/REGRESSION.md entries
// 83-84 for the course-kind plumbing this variant rides on (kind selection,
// the no-code guarantee); this rewrite only changes what the applied
// variant's cycle looks like.
//
// AMENDED (entry 156): this paragraph used to describe the cycle as an
// unconditional six-slide cycle for every concept, which directly
// contradicted the SLIDE BUDGET rule added below (which caps in-lecture
// Your Turn/Model Response pairs at the first 2 concepts) - a stale
// description here is exactly the failure mode that let the URL-curation
// rule go stale too (see the "help center, not marketing homepage" note in
// resource-links.ts), so it is corrected in place rather than left to drift
// further from the prompt strings below. Why the cycle changed: a lecture
// must be deliverable within its stated duration - the shipped decks ran
// 40-43 slides for a 50-minute session with five in-lecture tool exercises,
// which is not deliverable, so only the first 2 concepts keep their
// in-lecture Your Turn/Model Response pair and every later concept's
// hands-on task moves to the Post-Lecture Practice appendix instead.
//
// LECTURE FLOW (Group P, P2): an audited 16-week course generated from this
// contract had every deck as the identical 42-slide skeleton - no agenda, no
// section dividers, no bridges between concepts, no cross-week continuity,
// no recap, and 8 homework slides sitting mid-lecture. This is a prompt-only
// requirement with no data-layer enforcement (unlike the no-code guard
// above), so it lives entirely in the prose below: an Agenda slide (its
// graphic's KIND follows the AGENDA SLIDE rule's own concept-count table
// below - process at 3-6 concepts, table at 2 or 7 - stated ONCE there and
// never restated as a bare, unconditional shape anywhere else; the one
// guaranteed visual every deck now carries), a Section divider opening each
// concept's cycle, a slide
// budget that follows the lecture length instead of always landing at
// ~42 slides, a Recap that closes the loop the opening Case Study opened,
// and a Next Week/Where This Goes Next slide. Cross-week continuity and
// case-study-reuse avoidance (P2-AC7/AC8) are NOT prose - they are built by
// the caller (generateSlidesFromTopic, src/app/actions/
// course-planning-grounding.ts) from the schedule and the run's own
// generated decks, then handed in as extra prompt blocks alongside this
// contract.
//
// AMENDED (Group A): P2 originally paired each Section divider with a
// "Bridge: <this concept> to <next concept>" slide closing the cycle. Both
// contracts have since DROPPED bridge slides outright (NO TRANSITION SLIDES
// in each) - a deck audit found every one of them to be filler, and their
// titles, being two concatenated concept names, were structurally incapable
// of fitting the TITLE LENGTH cap that audit also produced. The hinge they
// provided survives in two places that cost no slide: the speaker notes'
// mandated hand-off sentence, and the next Section divider's own bullets.

const APPLIED_DECK_JSON_SHAPE = `{
  "presentationTitle": "...",
  "moduleTools": ["Tool Name (free tier, free trial, community edition, or spreadsheet equivalent)", "..."],
  "slides": [
    { "title": "...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Case Study: ...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Agenda: ...", "bullets": ["...", "..."], "notes": "...", "graphic": { "kind": "process", "steps": [ { "label": "...", "caption": "..." }, { "label": "...", "caption": "..." }, { "label": "...", "caption": "..." } ] } },
    { "title": "Section 1: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Principle: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "In Practice: ...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Artifact: ...", "bullets": ["...", "..."], "notes": "...", "graphic": { "kind": "table", "headers": ["...", "..."], "rows": [["...", "..."], ["...", "..."]] } },
    { "title": "Judgment Call: ...", "bullets": ["...", "..."], "notes": "...", "graphic": { "kind": "matrix2x2", "xAxisLabel": "...", "yAxisLabel": "...", "quadrants": { "topLeft": { "label": "...", "items": ["..."] }, "topRight": { "label": "...", "items": ["..."] }, "bottomLeft": { "label": "...", "items": ["..."] }, "bottomRight": { "label": "...", "items": ["..."] } } } },
    { "title": "Your Turn: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Model Response: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Failure Modes: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Documentation: Key Concepts", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Terminology: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Recap: Where We Landed", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Next Week: ...", "bullets": ["..."], "notes": "..." },
    { "title": "Modern Tech: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Documentation & References", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Appendix: Post-Lecture Practice", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Post-Lecture Practice: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Model Response: ...", "bullets": ["..."], "notes": "..." }
  ]
}`;

/**
 * Applied-contract slide title prefixes that are NOT present for every
 * concept - unlike "Principle:", "In Practice:", "Artifact:", and "Judgment
 * Call:", which every concept gets without exception (see APPLIED CONCEPT
 * CYCLE below), these two are conditional on something other than "this
 * concept exists":
 *   - "Your Turn:" / "Model Response:" - in-lecture, only for the first 2
 *     concepts in the CONCEPT PLAN (see SLIDE BUDGET below). Every concept
 *     still gets a Model Response in the Post-Lecture Practice appendix
 *     regardless, which is a separate, unconditional guarantee.
 *
 * "Bridge:" USED to be the third entry here - present for every concept
 * except the last. Bridge slides were removed from both contracts entirely
 * (see NO TRANSITION SLIDES in each), so there is no longer any conditional
 * bridge prefix to keep consistent; the deck's own NO TRANSITION SLIDES rule
 * now forbids the slide outright rather than scoping when it appears.
 *
 * RCA regression (docs/REGRESSION.md entry 156, RCA round 3 / RCA15): three
 * separate gate passes each found a NEW rule elsewhere in
 * APPLIED_STRUCTURE_REQUIREMENTS that named one of these prefixes in
 * unconditional language ("every concept ...", "without exception ...", or
 * simply presupposing the slide exists) with no scoping to the condition
 * above - the exact defect class RCA11 (ASSERTION TITLES vs. SECTION
 * DIVIDERS/BRIDGES) and the BRIDGES/TOOL CONTINUITY fixes described there
 * belong to. This constant exists so that class of bug is checkable
 * mechanically (see slide-prompt.test.ts's structural consistency guard)
 * instead of by a human re-reading the whole contract: any future rule
 * naming one of these prefixes must be checked against it.
 */
export const APPLIED_CONDITIONAL_SLIDE_PREFIXES = ["Your Turn:", "Model Response:"] as const;

const APPLIED_STRUCTURE_REQUIREMENTS = `- Each slide must have a "title" and a "bullets" array.
- ${PLAIN_LANGUAGE_CONTRACT}
- Every slide must also have "notes": the speaker notes for that slide - what the instructor SAYS while it is on screen. Write 3-6 FULL sentences of real teaching narration (roughly 60-120 words, not fragments): the explanation behind the bullets and at least one question to ask the class. Every slide's notes but the last MUST close with a handoff sentence that explicitly names the next slide's topic or idea, so the deck reads as one continuous lecture instead of a stack of disconnected cards. The notes are the lecture; the bullets are only what the students see. Never repeat the bullets verbatim, and never write a placeholder or an instruction to the instructor to fill something in.
- Maximum 4 bullets per slide.
- Each bullet must be a complete, self-explanatory sentence (or two) that a student can fully understand without any verbal elaboration. Define every term you introduce, explain how each concept works, and state why it matters. Ground it in something concrete and checkable: name the specific framework, standard, methodology, named artifact, real figure/statistic, or spell out the actual steps of the process - never a generic statement that could apply to any topic in the field. Never use bare keywords or vague one-liners.
- BREADTH MINIMUM: never stop at a single concept. When a CONCEPT PLAN is given above, it names the floor for how many distinct concepts this deck teaches - cover EVERY one of them, each with its OWN full cycle (at minimum the Principle, In Practice, Artifact, Judgment Call core, plus Your Turn and Model Response for the concepts the SLIDE BUDGET rule identifies); do not merge multiple listed concepts into one cycle, and do not stop after only the first. Absent a concept plan, a topic that itself names multiple ideas (e.g. a title like "X and Y") still teaches BOTH, never just the first.
- NEVER include a "code" or "codeLanguage" field on any slide. This course does not involve programming.
- REAL PROFESSIONAL TOOLS: instead of code, ground the hands-on work in the actual software the field runs on. "moduleTools" at the top level of the JSON is a list with one entry per concept in the plan (concepts that genuinely share one tool may share an entry) - for each entry, ${APPLIED_REAL_TOOL_RULE} This is the slot a programming course fills with code; an applied course fills it with the tool the field itself runs on, so a student is never asked to buy anything.
- The first slide should be a title/overview slide listing the key topics covered in the lecture.
- The SECOND slide MUST be a real-world case study about this lecture's subject, with "title" beginning with "Case Study:". Name a specific, well-known, widely-documented real event - the organization involved. Prefer a dramatic, motivating story (a high-profile failure, a costly overrun, a turnaround) to show students why this matters. Use the bullets to summarize what happened, and make the last bullet connect the story to what students are about to learn. NEVER state a specific year in the slide's TITLE - a title asserts a fact with no room for hedging. In the bullets, name the general period ONLY if you are confident of it (a decade or a short range, e.g. "in the mid-1990s"), and never state a single precise year unless you are certain it is correct; when unsure, name the organization and event with no date at all. Stick to established facts; never invent events or fabricate specifics.
- AGENDA SLIDE: the THIRD slide (immediately after the Case Study slide) MUST be titled "Agenda: <lecture topic>", listing this lecture's concepts (from the CONCEPT PLAN above) in the exact order they will be taught, and MUST carry a graphic (see SLIDE GRAPHICS below) that maps the lecture before it starts - this guarantees at least one real visual in every deck. The CONCEPT PLAN can name anywhere from 2 to 7 concepts, and "process" only accepts 3-6 steps, so which graphic shape to use depends on the concept count: with 3 to 6 concepts, a "process" graphic whose steps are exactly those concepts, one step per concept, in that same teaching order - as before; with 2 concepts (too few for "process", which needs at least 3 steps) or 7 concepts (too many - "process" and "table" both cap at 6), a "table" graphic instead, headers "Section" and "What You Will Be Able To Do", one row per concept. At 2 concepts every concept fits in the table with no loss; at 7, the table itself can only hold the first 6 (its row cap), but the slide's own bullets - which already list every concept in teaching order, per this rule's first sentence - still name the 7th, so no concept is ever silently dropped from the lecture's map. Absent a CONCEPT PLAN, list the concepts this deck's own material organizes itself into instead - the same concepts APPLIED CONCEPT CYCLE below builds a Section/Principle cycle for, in the order taught - and choose the graphic shape by that same count.
- BREADTH: Cover the subject at maximum breadth. Enumerate every subtopic a student at this level needs: core ideas, common variants, common pitfalls, real-world use cases.
- ORDER: sequence the subtopics so the lecture flows logically — teach a prerequisite before any topic that depends on it, keep every slide about one subtopic contiguous rather than returning to it later in the deck, cover foundations before advanced or optimization material, and never split one subject across two separate places in the deck. The overview slide's topic list must match the order the deck actually teaches them in.
- FLOW: the bullets on a slide must read as a progression, not four parallel statements at the same altitude - each bullet builds on the one above it. This applies to every slide in the deck, including the cycle slides below.
- CONNECT TO THE STUDENT: for every concept, ground it - before or alongside the professional In Practice case - in a situation the student has actually been in (a group project where nobody owned a task, a part-time job, a club budget, registering for classes) and say plainly why it matters to them now, not only to a practitioner later. This is IN ADDITION to the required Case Study and In Practice slides, never a replacement for them.
- APPLIED CONCEPT CYCLE: every concept in the plan gets this four-slide CORE, without exception, in this exact order - Principle, In Practice, Artifact, Judgment Call. The first slide of the four (Principle) IS the concept-introduction slide - do not add a separate untitled concept slide before it. In addition, the concepts the SLIDE BUDGET rule below identifies (the first 2 concepts in the CONCEPT PLAN) also get a Your Turn / Model Response pair in-lecture, immediately following their Judgment Call slide, completing the full six-slide cycle for those concepts. The per-slide detail below (1-6) describes every slide in that full cycle; which concepts receive slides 5 and 6 is decided entirely by the SLIDE BUDGET rule, not restated here. Absent a CONCEPT PLAN, apply this cycle to every concept this deck's own material organizes itself into instead - the requirement is that every concept gets its own full cycle, whether or not an externally supplied plan named it, per BREADTH MINIMUM above.
  1. Principle slide - "title" begins with "Principle:"; state what the concept IS, WHY it exists (the problem it solves), and what it COSTS a team when it is skipped - a concrete, specific consequence, not a vague warning.
  2. In Practice slide - "title" begins with "In Practice:"; name ONE specific, real, widely-documented organization, showing the concept applied well or applied badly. This must be a DIFFERENT case from the deck's opening Case Study slide and from every other concept's In Practice slide - never reuse or lightly reword the same story twice, and never a title implying repetition (e.g. "(Again)", "Revisited"). NEVER state a specific year in the slide's TITLE. Name the general period in the bullets ONLY if you are confident of it (a decade or a short range); never state a single precise year unless certain. Never invent an organization, outcome, or date; if you are not certain a case is real and documented, choose a different, well-known one instead.
  3. Artifact slide - "title" begins with "Artifact:"; show the ACTUAL document or output a practitioner produces for this concept (a charter, a register, a matrix, a schedule, a memo, a worked calculation) with its real sections, fields, or rows reproduced concretely in the bullets, each one annotated with why that part exists. Do not describe the artifact in the abstract - show its actual content, not a summary of what it contains. Name the tool from "moduleTools" that produces this artifact in the field, and give one sentence on what practitioners use that tool for and where this concept lives inside it - the slide introduces the tool, not just the artifact.
  4. Judgment Call slide - "title" begins with "Judgment Call:"; pose ONE realistic tradeoff for this concept where competing pressures (cost vs. schedule, thoroughness vs. speed, one stakeholder's interest vs. another's) pull in different directions and there is no clean answer. State what a professional actually weighs when deciding, not a rule that resolves it for them.
  5. Your Turn slide - "title" begins with "Your Turn:"; give the student a short task, stated in 1-2 bullets: produce a small artifact for a stated scenario, or make the judgment call posed above and justify the choice. Keep it introductory and gently scaffolded: single skill, no tricks, mirroring the worked Artifact/Judgment Call slides closely. The task must be done IN the same tool named on the Artifact slide, using the free option given in "moduleTools" - state which free option explicitly so a student is never asked to buy anything.
  6. Model Response slide - "title" begins with "Model Response:"; give a STRONG response to that exact task WITH its reasoning (why this choice, not just what it is), AND a clearly distinct weak response with a concrete explanation of why it falls short. Never present the strong response as the only possible correct one - frame it as a well-reasoned choice among defensible options, since applied practice is judgment under constraint, not a single right answer.
- TOOL CONTINUITY: never name a tool on a concept's Artifact slide and then leave that concept's Your Turn task tool-agnostic - each concept's own "moduleTools" entry is the one tool its Artifact slide, and its Your Turn task wherever that task appears - in the lecture or in the Post-Lecture Practice appendix - both use, so a student always knows exactly which software to open.
- SECTION DIVIDERS: immediately before each concept's Principle slide - including the very first concept - insert a divider slide titled "Section <n>: <concept>" (n is that concept's 1-based position in the CONCEPT PLAN above). Its "bullets" are exactly two: (a) the one question this section answers, and (b) what the student will be able to do once this section is done. This marks, explicitly, where the lecture is at all times, instead of cutting hard from one concept straight into the next. Absent a CONCEPT PLAN, n is this concept's 1-based position in the order this deck itself teaches its concepts.
- NO TRANSITION SLIDES: never insert a slide whose only job is to announce the move from one concept to the next - no "Bridge:", "Transition:", "Up Next:", or "Moving On:" slide. Each concept's cycle flows directly into the next concept's Section divider, and the last concept's cycle flows directly into Failure Modes. The hinge between concepts is already carried twice over: by the speaker NOTES, which every slide but the last must close by naming what comes next (see the notes rule above), and by the next Section divider's own two mandated bullets, which state the question that section answers. A slide that only says "we just settled X, now we start Y" adds nothing either of those does not already say - it is filler on screen, spends lecture time, and teaches nothing.
- SLIDE BUDGET: this deck must be deliverable within the stated LECTURE DURATION, not run over it - and SLIDE COUNT is not what determines that, so do not budget by counting slides. A Section divider, Agenda, or Recap slide is 10-20 seconds of talking; an in-lecture "Your Turn" task performed in a real tool (a spreadsheet, a board, a document) is several minutes of class time. The signpost slides in this contract (Agenda, Section dividers, Recap, Next Week) cost seconds each and are not what consumes the hour - the in-lecture "Your Turn"/"Model Response" pairs are what actually spend it, which is exactly why at most 2 of them appear per lecture regardless of concept count. As a structural expectation, not a slide-count target: about "14 + concepts * 5" IN-LECTURE slides, most of them fast, for the concept count named in the CONCEPT PLAN above - a 50-minute lecture with 5 concepts lands around 39 in-lecture slides, most of them seconds-long signposts or four-slide cores. This figure covers ONLY the in-lecture material, from the title slide through the Recap/Next Week slides - it EXCLUDES the separate Post-Lecture Practice appendix (its own divider and intro slide, plus 2 additional practice problems - each with its own Model Response - per concept), which adds roughly "2 + concepts * 4" more slides on top of the figure above and is deliberately self-study material the lecture hour itself never has to accommodate. Never read this figure, or any other slide-count figure in this rule, as a cap on the WHOLE deck including that appendix - it is a cap on the in-lecture portion only. This is the ONE rule the APPLIED CONCEPT CYCLE above defers to for deciding which concepts get the Your Turn / Model Response pair: only the FIRST 2 concepts in the CONCEPT PLAN get their full in-lecture "Your Turn" and "Model Response" pair; every concept after that still gets its four-slide core (Principle, In Practice, Artifact, and Judgment Call slides) in the lecture, same as every other concept, but its hands-on task moves out of the lecture entirely - do not add an in-lecture "Your Turn" slide for it, and leave its Judgment Call tradeoff for the student to resolve later, in the Post-Lecture Practice appendix below, rather than answering it on the spot. Never produce more than 2 in-lecture "Your Turn"/"Model Response" pairs, however many concepts the plan lists. Absent a stated LECTURE DURATION or CONCEPT PLAN, size the deck to the material itself instead - as many concepts as the material actually supports, without padding to hit a target - and still cap in-lecture "Your Turn"/"Model Response" pairs at the first 2 concepts in teaching order, exactly as above.
- TITLE LENGTH: every slide title in this deck - of every kind, counting spaces and any mandated prefix - must be at most ${SLIDE_TITLE_MAX_CHARS} characters long. A title is a headline, not a sentence read aloud: past that length it wraps to a third line, squeezes the body text, and stops being readable from the back of the room. This is a hard cap, not a preference, and it is checked IN CODE after generation - an over-long title is cut down automatically, so write it short yourself rather than have it cut for you. Whenever the point genuinely needs more words than the title has room for, the full statement belongs in that slide's FIRST BULLET; the title keeps only the short form of the claim.
- ASSERTION TITLES: every "Principle:", "In Practice:", "Artifact:", "Judgment Call:", "Your Turn:", and "Model Response:" title (the last two, for the concepts that have one) keeps its required prefix, but what follows the colon must be a short, complete, grammatically full sentence stating THIS SLIDE'S actual claim - never a topic label - and the whole title, prefix included, must fit the TITLE LENGTH cap above. Both halves are required: the title is a claim, and the title is short. Write "Principle: Scope creep kills a schedule before the budget" (56 characters), never the label "Principle: Managing Project Scope", and never an unbounded sentence that states the claim in full but runs past the cap. When the claim needs a qualifying clause the title has no room for, put the complete statement in that slide's first bullet and keep the short form in the title. A student should learn something true about the material from the title alone, before reading a single bullet. This rule does NOT extend to the SECTION DIVIDERS rule below - a divider is navigation furniture, not a claim, so the fixed label form that rule mandates is the right one for it, and its actual claim already lives in its own two mandated bullets, not in the title itself. The TITLE LENGTH cap, unlike this rule, DOES apply to it. (RCA11: this rule used to include the SECTION DIVIDERS title format too, directly contradicting the label form that rule mandates for its own prefix - do not add it back here.)
- SLIDE GRAPHICS: any slide may optionally carry one "graphic" field alongside its bullets - a real visual (never an image, never a chart) rendered as PowerPoint shapes and tables. Use exactly one of these three shapes, matching these exact field names:
  - matrix2x2: { "kind": "matrix2x2", "xAxisLabel": "...", "yAxisLabel": "...", "quadrants": { "topLeft": { "label": "...", "items": ["...", "..."] }, "topRight": { "label": "...", "items": ["...", "..."] }, "bottomLeft": { "label": "...", "items": ["...", "..."] }, "bottomRight": { "label": "...", "items": ["...", "..."] } } } - up to 4 items per quadrant.
  - process: { "kind": "process", "steps": [ { "label": "...", "caption": "..." }, ... ] } - 3 to 6 steps; "caption" is optional.
  - table: { "kind": "table", "headers": ["...", "..."], "rows": [["...", "..."], ["...", "..."]] } - up to 5 columns and 6 rows; every row must have the same number of cells as "headers".
  EVERY Artifact slide MUST carry a graphic: a "table" for a register, charter, or log; a "matrix2x2" for a grid; a "process" for a lifecycle. EVERY Judgment Call slide MUST use a "matrix2x2" or "table" to lay out the tradeoff's two competing pressures side by side - a tradeoff with two real dimensions is exactly what those shapes are for. The Agenda slide MUST carry a graphic too, but which KIND is decided entirely by the AGENDA SLIDE rule above (process at 3-6 concepts, table at 2 or 7) - never restate a specific kind for it here, since the two rules would then have to agree on every concept count instead of one rule simply deciding. Principle slides MAY use a "process" when the concept itself IS a sequence of steps. No other slide should carry a graphic unless it genuinely fits one of these three shapes.
  At most one graphic per slide. A slide that carries a graphic keeps its "bullets" to 2 so the graphic has room to render - do not also write 3-4 bullets on a graphic slide - except the Agenda slide, which is exempt from this cap: AGENDA SLIDE above requires its bullets to list every concept (up to 7 of them), and that list - not the graphic - is the slide's primary content, so its bullet count follows the concept count instead of the usual 2-bullet ceiling.
  A graphic may only contain content that is real and already grounded elsewhere on that same slide - never invent figures, dates, statistics, or rows the bullets do not support. This is the same no-fabrication rule that governs every other part of this contract, stated explicitly here because a graphic is exactly the place a model is tempted to pad with invented specifics.
- CLOSING SECTIONS: after all the per-concept cycles above (each with its own Section divider), ALWAYS append these closing sections at the very END of the deck, in this exact order:
  A. FAILURE MODES: one or more slides whose "title" begins with "Failure Modes:" naming, concretely, how this material actually goes wrong in the field - a specific mistake practitioners make, why it happens, and what it costs when it does. Ground each bullet in a named, concrete failure pattern, never a generic warning.
  B. DOCUMENTATION - KEY CONCEPTS: one or more slides whose "title" begins with "Documentation:" that recap the key concepts taught in this deck as a concise study reference.
  C. TERMINOLOGY: one or more slides whose "title" begins with "Terminology:" listing the professional vocabulary of this field - each bullet names one term and gives its precise, field-standard definition (the definition a professional certification exam would expect), distinct from the conceptual recap in the Documentation slides above.
  D. RECAP: a single slide titled EXACTLY "Recap: Where We Landed" that MUST name, by name, the organization from this deck's OPENING Case Study slide (the second slide) and close the loop that Case Study opened, rather than leaving it as a one-off hook never mentioned again. State concretely what this lecture's concepts EXPLAIN about that story, and let the story's OWN direction decide the shape: when the Case Study is a failure or a costly overrun, name which specific concept taught here bears on the thing that went wrong; when it is a success - a turnaround, or an organization that ESTABLISHED or popularized the very practice this lecture teaches - name which of these concepts it applied and what that bought it. NEVER invert the Case Study you yourself told: do not claim an organization "would have avoided" an outcome it in fact produced on purpose, and never treat the practice an organization ORIGINATED as a problem it should have prevented. Do not speculate about what anyone would have done differently unless the Case Study slide itself established that they failed to do it. This slide restates and connects what the deck already said - it introduces no new claim about the organization that the Case Study slide does not already support.
  E. NEXT WEEK: a single slide - for every week except the course's FINAL week - titled "Next Week: <next week's topic>" with one sentence on what carries forward from this lecture into it. For the course's FINAL week, title this slide "Where This Goes Next" instead, and use it to connect the term's material to professional application beyond the course, since there is no next week to name. Absent any information about which week this is or what (if anything) follows it, omit this slide entirely rather than guessing whether a next week exists or inventing its topic - neither title is safe to produce without that data.
  F. MODERN TECH TO EXPLORE: 1-2 slides whose "title" begins with "Modern Tech:" naming real, widely used tools, platforms, or standards practitioners in this field actually use. Each bullet names one, states in a sentence how it relates to a concept taught in this deck, and suggests what to explore first. Name only real, well-known tools; never invent products.
  G. DOCUMENTATION AND REFERENCES: a slide titled exactly "Documentation & References" listing authoritative resources - the governing body's own standard or handbook where one exists, plus 2-4 suggested further-reading resources. Name only real, well-known resources; do NOT fabricate URLs.
  H. APPENDIX - POST-LECTURE PRACTICE: the VERY LAST section of the deck, appearing AFTER "Documentation & References" above (never before it, and never mixed in among the earlier per-concept cycles). Open it with its own divider slide titled EXACTLY "Appendix: Post-Lecture Practice", then a "Post-Lecture Practice" slide introducing self-study practice. Then for EACH concept in the deck, add exactly 2 additional practice exercises at increasing difficulty - the first noticeably harder than the in-lecture "Your Turn" exercise for a concept that had one (per the SLIDE BUDGET rule above), or harder than that concept's Artifact/Judgment Call slides alone establish for a concept that had none - the second harder still. Each problem is a slide titled "Post-Lecture Practice:" followed by its own "Model Response:" slide giving a strong response with reasoning and a weak response with why it fails, exactly like the in-cycle Model Response slide.
- Do not include any text outside the JSON object.`;

/** The deck JSON shape for a course kind. */
export function slideDeckJsonShape(kind: CourseKind): string {
  return kind === "applied" ? APPLIED_DECK_JSON_SHAPE : SLIDE_DECK_JSON_SHAPE;
}

/** The deck structure requirements for a course kind. */
export function slideStructureRequirements(kind: CourseKind): string {
  return kind === "applied" ? APPLIED_STRUCTURE_REQUIREMENTS : SLIDE_STRUCTURE_REQUIREMENTS;
}

/**
 * Enforce the no-code contract at the DATA layer, not just the prompt. A
 * prompt regression can still ask the model for code - a project management
 * course received a deck full of Python this way TWICE despite the applied
 * prompt saying plainly "do NOT ask students to ... code" both times (see
 * docs/REGRESSION.md 83/84) - so a comment telling the prompt not to
 * include code is demonstrably not enough on its own. For an "applied"
 * course, any slide carrying "code"/"codeLanguage" is a defect: strip those
 * two fields (never show code to a no-code course's students) rather than
 * dropping the whole slide or failing the whole generation, which would
 * cost the instructor a perfectly good deck over two fixable fields. The
 * returned violation count lets the caller record/surface that the model
 * regressed, even though the shipped output is now safe either way.
 */
export function enforceNoCodeForApplied(
  slides: SlideData[],
  kind: CourseKind
): { slides: SlideData[]; violations: number } {
  if (kind !== "applied") return { slides, violations: 0 };
  let violations = 0;
  const cleaned = slides.map((slide) => {
    if (slide.code === undefined && slide.codeLanguage === undefined) return slide;
    violations++;
    const next = { ...slide };
    delete next.code;
    delete next.codeLanguage;
    return next;
  });
  return { slides: cleaned, violations };
}

/**
 * Enforce the coding Example -> Walkthrough -> Practice -> Answer cycle at
 * the DATA layer, not just the prompt. CODING CONCEPTS above already tells
 * the model, explicitly, that a Walkthrough slide must be preceded by an
 * Example slide showing the exact code it explains - but a real generated
 * 16-week course (measured directly from its shipped .pptx files) had every
 * one of a final week's five concept cycles arrive with a Walkthrough,
 * Practice, and Answer slide but NO Example slide before it, while every
 * other week in the same course - and the other course measured alongside
 * it - had the full four-slide cycle intact. So this is not the prompt
 * failing to ask (it does, explicitly, per CODING CONCEPTS item 1) or a
 * post-processing step dropping a slide it disagrees with (nothing in this
 * pipeline drops a well-formed slide) - it is the model itself, under the
 * combined weight of a dense final-week deck, silently skipping one slide
 * type while completing the rest of that same cycle correctly. A comment
 * telling the prompt to ask for the Example slide is demonstrably not
 * enough on its own, exactly the lesson enforceNoCodeForApplied above and
 * enforceGraphicsForApplied (src/lib/slide-graphics.ts) already learned for
 * their own contract clauses.
 *
 * Unlike the graphics gap (filled by a follow-up LLM call, since a graphic's
 * content has to be invented from the slide's own bullets), a missing
 * Example slide can be reconstructed with NO extra model call: the
 * Walkthrough slide that follows it is REQUIRED to carry the exact same
 * "code"/"codeLanguage" as the Example it explains (CODING CONCEPTS item 2),
 * so that code is already sitting on the very next slide, unused for this
 * purpose. Synthesizing the missing Example from it is a mechanical, always-
 * correct repair - not a guess - and needs no recheck pass the way an LLM-
 * filled gap does, because it cannot partially fail.
 *
 * A no-op for an applied course ("Walkthrough:" is not a title this app ever
 * asks an applied deck for - see APPLIED_STRUCTURE_REQUIREMENTS above, which
 * has no such prefix - but the kind check is still explicit here, mirroring
 * enforceNoCodeForApplied's own style, rather than relying on that vocabulary
 * difference to keep this a no-op by accident).
 */
export function enforceCodingCycle(
  slides: SlideData[],
  kind: CourseKind
): { slides: SlideData[]; repaired: number } {
  if (kind !== "coding") return { slides, repaired: 0 };

  const result: SlideData[] = [];
  let repaired = 0;

  for (const slide of slides) {
    const isWalkthrough = slide.title.startsWith("Walkthrough:");
    const precededByExample = result[result.length - 1]?.title.startsWith("Example:") ?? false;

    if (isWalkthrough && !precededByExample && slide.code && slide.codeLanguage) {
      const topic = slide.title.slice("Walkthrough:".length).trim();
      result.push({
        title: `Example: ${topic}`.trim(),
        bullets: [],
        code: slide.code,
        codeLanguage: slide.codeLanguage,
        notes: `Here is the example this walkthrough explains${topic ? `: ${topic}` : ""}. Look at the code on screen for a moment - the next slide breaks down exactly how it works, line by line.`,
      });
      repaired++;
    }

    result.push(slide);
  }

  return { slides: result, repaired };
}

// A shortened title must never END on one of these: cutting at a word
// boundary can leave a dangling conjunction, preposition, article, or bare
// auxiliary ("... are shared across calls and are"), which reads as a
// sentence someone forgot to finish. Trailing words are dropped until the
// title ends on a content word.
const TITLE_TRAILING_FUNCTION_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "before", "but", "by", "can",
  "do", "does", "for", "from", "had", "has", "have", "how", "if", "in", "into",
  "is", "it", "its", "of", "on", "or", "so", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "those", "to", "until",
  "was", "were", "what", "when", "where", "which", "while", "who", "why",
  "will", "with", "would",
]);

// The longest run of text before a ": " that still reads as a role label
// ("Post-Lecture Practice: " is 23) rather than as the title's own content.
// A colon further in than this belongs to the sentence, not to a prefix, so
// the whole title is shortened as one unit.
const TITLE_PREFIX_MAX_CHARS = 30;

/**
 * Split a mandated role prefix ("Example: ", "Section 3: ", "Case Study: ")
 * off the front of a title. The prefix is contract vocabulary that
 * downstream code matches on (enforceCodingCycle above,
 * propagateExampleCode, the graphics guard's required-prefix lists), so it
 * is never shortened - only what follows it is.
 */
function splitTitlePrefix(title: string): { prefix: string; rest: string } {
  const idx = title.indexOf(": ");
  if (idx === -1) return { prefix: "", rest: title };
  const prefix = title.slice(0, idx + 2);
  if (prefix.length > TITLE_PREFIX_MAX_CHARS) return { prefix: "", rest: title };
  return { prefix, rest: title.slice(idx + 2) };
}

/** Trim `text` to at most `budget` characters, cutting only at a word boundary. */
function shortenToWordBoundary(text: string, budget: number): string {
  if (budget <= 0) return "";
  if (text.length <= budget) return text;

  const kept: string[] = [];
  let length = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = kept.length === 0 ? word.length : length + 1 + word.length;
    if (next > budget) break;
    kept.push(word);
    length = next;
  }

  while (kept.length > 1) {
    const last = kept[kept.length - 1].replace(/[^A-Za-z]/g, "").toLowerCase();
    if (!TITLE_TRAILING_FUNCTION_WORDS.has(last)) break;
    kept.pop();
  }

  const joined = kept.join(" ").replace(/[\s,;:.-]+$/, "");
  // A single word longer than the whole budget leaves nothing to keep; fall
  // back to a hard cut rather than returning an empty title.
  return joined || text.slice(0, budget).trimEnd();
}

/**
 * The minimal shape enforceTitleLength needs from a slide. Generic over it,
 * mirroring enforceGraphicsForApplied's own GraphicGapSlide (src/lib/
 * slide-graphics.ts), so both the SlideData pipelines (actions) and the
 * PptxSlide one (src/lib/decks/generate.ts) keep their exact slide type
 * through the call instead of being widened to a shared interface.
 */
export interface TitleLengthSlide {
  title: string;
  bullets: string[];
  code?: string;
  graphic?: unknown;
}

/** Whether the bullets already open with the claim the title is about to lose. */
function bulletsAlreadyCarry(bullets: string[], text: string): boolean {
  const needle = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!needle) return true;
  return bullets.some((bullet) => {
    const hay = bullet.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return hay.includes(needle) || needle.includes(hay);
  });
}

/**
 * Enforce the TITLE LENGTH cap at the DATA layer, not just the prompt -
 * the same posture enforceNoCodeForApplied and enforceCodingCycle above
 * already take for their own clauses, and for the same reason: a rule that
 * lives only in prose is not verifiable, and this contract has now been
 * measured failing three of its own prose rules in shipped output.
 *
 * There was no title-length rule of ANY kind before this - not in the
 * prompt, not in code - which is how a real deck shipped 8 titles past 60
 * characters and one at 88. Two different causes produced them, and only
 * one is repaired here:
 *
 *   - Assertion titles ran long because the contract asked for a complete
 *     claim and never bounded it (its own worked example was 88 characters).
 *     Both halves are fixed: the prompt now caps the title and sends the
 *     full assertion to the first bullet, and this guard cuts anything that
 *     still arrives over the cap.
 *   - Bridge titles ("Bridge: <this concept> to <next concept>") ran long
 *     STRUCTURALLY - two concatenated concept names cannot reliably fit any
 *     cap - so they are not shortened here, they are gone: see NO TRANSITION
 *     SLIDES in both contracts.
 *
 * Shortening cuts at a word boundary, never mid-word, and preserves any
 * mandated role prefix verbatim so downstream prefix matching still works.
 *
 * Where the layout has room, the FULL original title is prepended as the
 * slide's first bullet, so a cut title never costs the deck the claim it
 * was making. "Room" is a real constraint, not a guess: pptx.ts renders a
 * graphic slide's bullets into a FIXED 1.3-inch band (GRAPHIC_BULLETS_HEIGHT)
 * and a code slide's into a fixed 1.5-inch band, so a third bullet on either
 * would spill over the graphic or the code panel. On those slides the title
 * is shortened and nothing is added - a slightly shorter title beats a
 * visibly broken slide, and the prompt already asks the model to put the
 * assertion in bullet one itself.
 */
export function enforceTitleLength<T extends TitleLengthSlide>(
  slides: T[],
  maxChars: number = SLIDE_TITLE_MAX_CHARS
): { slides: T[]; shortened: number } {
  let shortened = 0;

  const result = slides.map((slide) => {
    const title = slide.title ?? "";
    if (title.length <= maxChars) return slide;

    const { prefix, rest } = splitTitlePrefix(title);
    const shortRest = prefix.length < maxChars
      ? shortenToWordBoundary(rest, maxChars - prefix.length)
      : "";
    const nextTitle = shortRest
      ? `${prefix}${shortRest}`
      : shortenToWordBoundary(title, maxChars);

    if (!nextTitle || nextTitle === title) return slide;
    shortened++;

    const next: T = { ...slide, title: nextTitle };
    const hasRoomForBullet =
      slide.graphic === undefined && slide.code === undefined && slide.bullets.length < 4;
    if (hasRoomForBullet && !bulletsAlreadyCarry(slide.bullets, rest)) {
      next.bullets = [rest, ...slide.bullets];
    }
    return next;
  });

  return { slides: result, shortened };
}
