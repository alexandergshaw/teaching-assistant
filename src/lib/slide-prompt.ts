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

export const SLIDE_DECK_JSON_SHAPE = `{
  "presentationTitle": "...",
  "slides": [
    { "title": "...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Case Study: ...", "bullets": ["...", "...", "..."] },
    { "title": "Example: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Walkthrough: ...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python" },
    { "title": "Practice: ...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python" },
    { "title": "Answer: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Additional Practice: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Answer: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Documentation: Key Concepts", "bullets": ["...", "..."] },
    { "title": "Modern Tech: ...", "bullets": ["...", "..."] },
    { "title": "Documentation & References", "bullets": ["...", "..."] }
  ]
}`;

export const SLIDE_STRUCTURE_REQUIREMENTS = `- Each slide must have a "title" and a "bullets" array.
- ${PLAIN_LANGUAGE_CONTRACT}
- Every slide must also have "notes": the speaker notes for that slide - what the instructor SAYS while it is on screen. Write 3-6 FULL sentences of real teaching narration (roughly 60-120 words, not fragments): the explanation behind the bullets and at least one question to ask the class. Every slide's notes but the last MUST close with a handoff sentence that explicitly names the next slide's topic or idea, so the deck reads as one continuous lecture instead of a stack of disconnected cards. The notes are the lecture; the bullets are only what the students see. Never repeat the bullets verbatim, and never write a placeholder or an instruction to the instructor to fill something in.
- Maximum 4 bullets per slide.
- Each bullet must be a complete, self-explanatory sentence (or two) that a student can fully understand without any verbal elaboration. Define every term you introduce, explain how each concept works, and state why it matters for this material. Ground it in something concrete and checkable: name the specific framework, standard, method, API, data structure, real figure/statistic, or named artifact involved, or spell out the actual steps of the process - never a generic statement that could apply to any topic in the field. Never use bare keywords or vague one-liners — write as if the student is reading the slide alone with no instructor present.
- BREADTH MINIMUM: never stop at a single concept. When a CONCEPT PLAN is given above, it names the floor for how many distinct concepts this deck teaches - cover EVERY one of them, each with its OWN full cycle (a concept slide, Example, Walkthrough, Practice, Answer); do not merge multiple listed concepts into one cycle, and do not stop after only the first. Absent a concept plan, a topic that itself names multiple ideas (e.g. a title like "X and Y") still teaches BOTH, never just the first.
- The first slide should be a title/overview slide listing the key topics covered in the lecture.
- The SECOND slide MUST be a real-world case study or news story about this lecture's subject, with "title" beginning with "Case Study:". Name a specific, well-known, widely-documented real event (the organization or product involved and roughly when it happened). Prefer a dramatic, motivating story — a high-profile failure, security breach, or outage, OR an impressive system that was built — to show students why this matters. Use the bullets to summarize what happened, and make the last bullet connect the story to what students are about to learn. Do not put "code" on this slide. Stick to established facts; never invent events or fabricate specifics.
- BREADTH: Cover the subject at maximum breadth. Enumerate every subtopic a student at this level needs: core ideas, syntax variants, common pitfalls, real-world use cases — do not limit to 2-3 most common subtopics; breadth may increase slide count.
- ORDER: sequence the subtopics so the lecture flows logically — teach a prerequisite before any topic that depends on it, keep every slide about one subtopic contiguous rather than returning to it later in the deck, cover foundations before advanced or optimization material, and never split one subject across two separate places in the deck. The overview slide's topic list must match the order the deck actually teaches them in.
- FLOW: the bullets on a slide must read as a progression, not four parallel statements at the same altitude - each bullet builds on the one above it. This applies to every slide in the deck, coding and conceptual alike.
- CONNECT TO THE STUDENT: for every concept, ground it - before or alongside the professional example - in a situation the student has actually been in (a group project where nobody owned a task, a part-time job, a club budget, registering for classes) and say plainly why it matters to them now, not only to a practitioner later. This is IN ADDITION to the real-world case study and professional examples required elsewhere on this list, never a replacement for them.
- Use real-world analogies and concrete examples that students will recognise; integrate the analogy into the bullet itself so it is self-contained.
- For every concept-focused slide, immediately follow it with a concrete example slide and a step-by-step walkthrough slide that explains each step or line in plain English so the student understands the reasoning without needing the instructor to narrate it. Label these slides clearly (e.g. "Example: <concept>" and "Walkthrough: <concept>").
- CODING CONCEPTS: When the concept being introduced is a coding concept (a loop, conditional, variable, function, class, data structure, etc.), follow it with exactly these four slides, in this order:
  1. Example slide — "title" begins with "Example:"; demonstrate that exact concept with a short, correct, self-contained snippet in "code" (use real newlines) and "codeLanguage" set; keep "bullets" to at most one short caption.
  2. Walkthrough slide — "title" begins with "Walkthrough:"; explain the example code line by line in "bullets" while showing the same code in the "code" field; use the exact code from the Example slide so students can read both the code and the explanation together.
  3. Practice slide — "title" begins with "Practice:"; pose a simple, self-contained coding challenge on the same concept for the student to attempt. State the task in 1-2 "bullets" and set "codeLanguage". Its "code" field MUST repeat the SAME reference code shown on the Example/Walkthrough slide so the student has a worked example to reference — it must NOT contain the solution to the practice challenge or any code that gives away the answer. Keep this practice problem introductory and gently scaffolded: single skill, no tricks, mirrors the worked example closely.
  4. Answer slide — "title" begins with "Answer:"; give the correct, runnable solution to that exact practice challenge in "code" with "codeLanguage" set, plus at most one "bullets" caption.
- All of Example, Walkthrough, Practice, and Answer slides must include "code"/"codeLanguage". Do not omit "code" on Walkthrough or Practice slides. Omit code only on conceptual slides.
- CLOSING SECTIONS: after all the coverage slides above, ALWAYS append these closing sections at the very END of the deck, in this exact order:
  A. POST-LECTURE PRACTICE: after the main content slides and before Documentation & References, add a "Post-Lecture Practice" slide introducing self-study practice. Then for EACH coding concept in the deck, add exactly 2 additional practice problems at increasing difficulty — the first noticeably harder than the in-lecture practice (moderate), the second harder still (challenging, combining ideas or edge cases). Each problem slide titled "Post-Lecture Practice:" followed by its "Answer:" slide. For a non-programming module, add exactly 2 additional conceptual practice questions per concept, each followed by an "Answer:" slide, with no code fields.
  B. DOCUMENTATION - KEY CONCEPTS: one or more slides whose "title" begins with "Documentation:" that recap the key concepts, terms, and syntax taught in this deck as a concise study reference the student can revise from (use bullets; short code snippets are allowed).
  C. MODERN TECH TO EXPLORE: 1-2 slides whose "title" begins with "Modern Tech:" that connect this deck's concepts to current, real-world technology students can investigate to dig deeper. Each bullet names one real, widely used modern technology, framework, tool, or service (for example a popular library, cloud service, or AI tool that builds on these concepts), states in a sentence how it relates to a concept taught in this deck, and suggests what to explore first. Name only real, well-known technologies; never invent products or overstate what they do. No "code" on these slides.
  D. DOCUMENTATION AND REFERENCES: a final slide titled exactly "Documentation & References" that lists authoritative resources for the topics: name the official documentation for each language, library, or tool used, plus 2-4 suggested further-reading resources. Name only real, well-known resources (official language/library documentation, MDN, the tool's own docs); do NOT fabricate specific URLs or invent facts.
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
// The applied variant instead runs a six-slide cycle per concept - Principle,
// In Practice, Artifact, Judgment Call, Your Turn, Model Response - plus two
// deck-level sections coding decks do not need: Failure Modes and
// Terminology. See docs/REGRESSION.md entries 83-84 for the course-kind
// plumbing this variant rides on (kind selection, the no-code guarantee);
// this rewrite only changes what the applied variant's cycle looks like.

const APPLIED_DECK_JSON_SHAPE = `{
  "presentationTitle": "...",
  "moduleTools": ["Tool Name (free tier, free trial, community edition, or spreadsheet equivalent)", "..."],
  "slides": [
    { "title": "...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Case Study: ...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Principle: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "In Practice: ...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Artifact: ...", "bullets": ["...", "..."], "notes": "...", "graphic": { "kind": "table", "headers": ["...", "..."], "rows": [["...", "..."], ["...", "..."]] } },
    { "title": "Judgment Call: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Your Turn: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Model Response: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Failure Modes: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Post-Lecture Practice: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Model Response: ...", "bullets": ["..."], "notes": "..." },
    { "title": "Documentation: Key Concepts", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Terminology: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Modern Tech: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Documentation & References", "bullets": ["...", "..."], "notes": "..." }
  ]
}`;

const APPLIED_STRUCTURE_REQUIREMENTS = `- Each slide must have a "title" and a "bullets" array.
- ${PLAIN_LANGUAGE_CONTRACT}
- Every slide must also have "notes": the speaker notes for that slide - what the instructor SAYS while it is on screen. Write 3-6 FULL sentences of real teaching narration (roughly 60-120 words, not fragments): the explanation behind the bullets and at least one question to ask the class. Every slide's notes but the last MUST close with a handoff sentence that explicitly names the next slide's topic or idea, so the deck reads as one continuous lecture instead of a stack of disconnected cards. The notes are the lecture; the bullets are only what the students see. Never repeat the bullets verbatim, and never write a placeholder or an instruction to the instructor to fill something in.
- Maximum 4 bullets per slide.
- Each bullet must be a complete, self-explanatory sentence (or two) that a student can fully understand without any verbal elaboration. Define every term you introduce, explain how each concept works, and state why it matters. Ground it in something concrete and checkable: name the specific framework, standard, methodology, named artifact, real figure/statistic, or spell out the actual steps of the process - never a generic statement that could apply to any topic in the field. Never use bare keywords or vague one-liners.
- BREADTH MINIMUM: never stop at a single concept. When a CONCEPT PLAN is given above, it names the floor for how many distinct concepts this deck teaches - cover EVERY one of them, each with its OWN full cycle (Principle, In Practice, Artifact, Judgment Call, Your Turn, Model Response); do not merge multiple listed concepts into one cycle, and do not stop after only the first. Absent a concept plan, a topic that itself names multiple ideas (e.g. a title like "X and Y") still teaches BOTH, never just the first.
- NEVER include a "code" or "codeLanguage" field on any slide. This course does not involve programming.
- REAL PROFESSIONAL TOOLS: instead of code, ground the hands-on work in the actual software the field runs on. "moduleTools" at the top level of the JSON is a list with one entry per concept in the plan (concepts that genuinely share one tool may share an entry) - for each entry, ${APPLIED_REAL_TOOL_RULE} This is the slot a programming course fills with code; an applied course fills it with the tool the field itself runs on, so a student is never asked to buy anything.
- The first slide should be a title/overview slide listing the key topics covered in the lecture.
- The SECOND slide MUST be a real-world case study about this lecture's subject, with "title" beginning with "Case Study:". Name a specific, well-known, widely-documented real event - the organization involved and roughly when it happened. Prefer a dramatic, motivating story (a high-profile failure, a costly overrun, a turnaround) to show students why this matters. Use the bullets to summarize what happened, and make the last bullet connect the story to what students are about to learn. Stick to established facts; never invent events or fabricate specifics.
- BREADTH: Cover the subject at maximum breadth. Enumerate every subtopic a student at this level needs: core ideas, common variants, common pitfalls, real-world use cases.
- ORDER: sequence the subtopics so the lecture flows logically — teach a prerequisite before any topic that depends on it, keep every slide about one subtopic contiguous rather than returning to it later in the deck, cover foundations before advanced or optimization material, and never split one subject across two separate places in the deck. The overview slide's topic list must match the order the deck actually teaches them in.
- FLOW: the bullets on a slide must read as a progression, not four parallel statements at the same altitude - each bullet builds on the one above it. This applies to every slide in the deck, including the cycle slides below.
- CONNECT TO THE STUDENT: for every concept, ground it - before or alongside the professional In Practice case - in a situation the student has actually been in (a group project where nobody owned a task, a part-time job, a club budget, registering for classes) and say plainly why it matters to them now, not only to a practitioner later. This is IN ADDITION to the required Case Study and In Practice slides, never a replacement for them.
- APPLIED CONCEPT CYCLE: for every concept in the plan, produce exactly this six-slide cycle, in this order. The first slide of the six (Principle) IS the concept-introduction slide - do not add a separate untitled concept slide before it.
  1. Principle slide - "title" begins with "Principle:"; state what the concept IS, WHY it exists (the problem it solves), and what it COSTS a team when it is skipped - a concrete, specific consequence, not a vague warning.
  2. In Practice slide - "title" begins with "In Practice:"; name ONE specific, real, widely-documented organization and roughly when this played out, showing the concept applied well or applied badly. This must be a DIFFERENT case from the deck's opening Case Study slide and from every other concept's In Practice slide - never reuse or lightly reword the same story twice. Never invent an organization, outcome, or date; if you are not certain a case is real and documented, choose a different, well-known one instead.
  3. Artifact slide - "title" begins with "Artifact:"; show the ACTUAL document or output a practitioner produces for this concept (a charter, a register, a matrix, a schedule, a memo, a worked calculation) with its real sections, fields, or rows reproduced concretely in the bullets, each one annotated with why that part exists. Do not describe the artifact in the abstract - show its actual content, not a summary of what it contains. Name the tool from "moduleTools" that produces this artifact in the field, and give one sentence on what practitioners use that tool for and where this concept lives inside it - the slide introduces the tool, not just the artifact.
  4. Judgment Call slide - "title" begins with "Judgment Call:"; pose ONE realistic tradeoff for this concept where competing pressures (cost vs. schedule, thoroughness vs. speed, one stakeholder's interest vs. another's) pull in different directions and there is no clean answer. State what a professional actually weighs when deciding, not a rule that resolves it for them.
  5. Your Turn slide - "title" begins with "Your Turn:"; give the student a short task, stated in 1-2 bullets: produce a small artifact for a stated scenario, or make the judgment call posed above and justify the choice. Keep it introductory and gently scaffolded: single skill, no tricks, mirroring the worked Artifact/Judgment Call slides closely. The task must be done IN the same tool named on the Artifact slide, using the free option given in "moduleTools" - state which free option explicitly so a student is never asked to buy anything.
  6. Model Response slide - "title" begins with "Model Response:"; give a STRONG response to that exact task WITH its reasoning (why this choice, not just what it is), AND a clearly distinct weak response with a concrete explanation of why it falls short. Never present the strong response as the only possible correct one - frame it as a well-reasoned choice among defensible options, since applied practice is judgment under constraint, not a single right answer.
- TOOL CONTINUITY: never name a tool on a concept's Artifact slide and then leave that concept's Your Turn task tool-agnostic - each concept's own "moduleTools" entry is the one tool its Artifact and Your Turn slides both use, so a student always knows exactly which software to open.
- SLIDE GRAPHICS: any slide may optionally carry one "graphic" field alongside its bullets - a real visual (never an image, never a chart) rendered as PowerPoint shapes and tables. Use exactly one of these three shapes, matching these exact field names:
  - matrix2x2: { "kind": "matrix2x2", "xAxisLabel": "...", "yAxisLabel": "...", "quadrants": { "topLeft": { "label": "...", "items": ["...", "..."] }, "topRight": { "label": "...", "items": ["...", "..."] }, "bottomLeft": { "label": "...", "items": ["...", "..."] }, "bottomRight": { "label": "...", "items": ["...", "..."] } } } - up to 4 items per quadrant.
  - process: { "kind": "process", "steps": [ { "label": "...", "caption": "..." }, ... ] } - 3 to 6 steps; "caption" is optional.
  - table: { "kind": "table", "headers": ["...", "..."], "rows": [["...", "..."], ["...", "..."]] } - up to 5 columns and 6 rows; every row must have the same number of cells as "headers".
  EVERY Artifact slide MUST carry a graphic: a "table" for a register, charter, or log; a "matrix2x2" for a grid; a "process" for a lifecycle. Judgment Call slides SHOULD use a "matrix2x2" or "table" when the tradeoff has two real dimensions worth laying out side by side. Principle slides MAY use a "process" when the concept itself IS a sequence of steps. No other slide should carry a graphic unless it genuinely fits one of these three shapes.
  At most one graphic per slide. A slide that carries a graphic keeps its "bullets" to 2 so the graphic has room to render - do not also write 3-4 bullets on a graphic slide.
  A graphic may only contain content that is real and already grounded elsewhere on that same slide - never invent figures, dates, statistics, or rows the bullets do not support. This is the same no-fabrication rule that governs every other part of this contract, stated explicitly here because a graphic is exactly the place a model is tempted to pad with invented specifics.
- CLOSING SECTIONS: after all the coverage slides above, ALWAYS append these closing sections at the very END of the deck, in this exact order:
  A. FAILURE MODES: one or more slides whose "title" begins with "Failure Modes:" naming, concretely, how this material actually goes wrong in the field - a specific mistake practitioners make, why it happens, and what it costs when it does. Ground each bullet in a named, concrete failure pattern, never a generic warning.
  B. POST-LECTURE PRACTICE: add a "Post-Lecture Practice" slide introducing self-study practice. Then for EACH concept in the deck, add exactly 2 additional practice exercises at increasing difficulty - the first noticeably harder than the in-lecture Your Turn exercise, the second harder still - each slide titled "Post-Lecture Practice:" followed by its own "Model Response:" slide giving a strong response with reasoning and a weak response with why it fails, exactly like the in-cycle Model Response slide.
  C. DOCUMENTATION - KEY CONCEPTS: one or more slides whose "title" begins with "Documentation:" that recap the key concepts taught in this deck as a concise study reference.
  D. TERMINOLOGY: one or more slides whose "title" begins with "Terminology:" listing the professional vocabulary of this field - each bullet names one term and gives its precise, field-standard definition (the definition a professional certification exam would expect), distinct from the conceptual recap in the Documentation slides above.
  E. MODERN TECH TO EXPLORE: 1-2 slides whose "title" begins with "Modern Tech:" naming real, widely used tools, platforms, or standards practitioners in this field actually use. Each bullet names one, states in a sentence how it relates to a concept taught in this deck, and suggests what to explore first. Name only real, well-known tools; never invent products.
  F. DOCUMENTATION AND REFERENCES: a final slide titled exactly "Documentation & References" listing authoritative resources - the governing body's own standard or handbook where one exists, plus 2-4 suggested further-reading resources. Name only real, well-known resources; do NOT fabricate URLs.
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
