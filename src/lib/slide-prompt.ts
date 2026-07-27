import type { CourseKind } from "@/lib/course-kind";

/**
 * Shared pedagogical slide-deck structure and requirements.
 * Every deck-generation prompt composes these constants so all decks (assignment
 * lectures, module lectures, etc.) share one pedagogical contract: Example →
 * Walkthrough → Practice → Answer coding sequences, Case Study engagement,
 * Additional Practice closers, Modern Tech exploration, and Documentation sections.
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
- Every slide must also have "notes": the speaker notes for that slide - what the instructor SAYS while it is on screen. Write 3-6 sentences of real teaching narration: the explanation behind the bullets, the transition into the next slide, and at least one question to ask the class. The notes are the lecture; the bullets are only what the students see. Never repeat the bullets verbatim, and never write a placeholder or an instruction to the instructor to fill something in.
- Maximum 4 bullets per slide.
- Each bullet must be a complete, self-explanatory sentence (or two) that a student can fully understand without any verbal elaboration. Define every term you introduce, explain how each concept works, and state why it matters for this material. Never use bare keywords or vague one-liners — write as if the student is reading the slide alone with no instructor present.
- The first slide should be a title/overview slide listing the key topics covered in the lecture.
- The SECOND slide MUST be a real-world case study or news story about this lecture's subject, with "title" beginning with "Case Study:". Name a specific, well-known, widely-documented real event (the organization or product involved and roughly when it happened). Prefer a dramatic, motivating story — a high-profile failure, security breach, or outage, OR an impressive system that was built — to show students why this matters. Use the bullets to summarize what happened, and make the last bullet connect the story to what students are about to learn. Do not put "code" on this slide. Stick to established facts; never invent events or fabricate specifics.
- BREADTH: Cover the subject at maximum breadth. Enumerate every subtopic a student at this level needs: core ideas, syntax variants, common pitfalls, real-world use cases — do not limit to 2-3 most common subtopics; breadth may increase slide count.
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
 * the closing brace of SLIDE_DECK_JSON_SHAPE, preserving valid JSON syntax.
 */
export function slideDeckJsonShapeWith(extraFieldLine: string): string {
  return SLIDE_DECK_JSON_SHAPE.replace(/}\s*$/, `, ${extraFieldLine}\n}`);
}

// ── Course-kind variants ───────────────────────────────────────────────────
//
// The two constants above ARE the programming-course contract, and stay
// exactly as they were so every existing caller and assertion is unchanged.
// An applied (no-code) course needs the same pedagogical shape - case study,
// breadth, worked example, practice, documentation, modern tech - with the
// code replaced by the artifacts practitioners in that field actually produce.

const APPLIED_DECK_JSON_SHAPE = `{
  "presentationTitle": "...",
  "slides": [
    { "title": "...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Case Study: ...", "bullets": ["...", "...", "..."], "notes": "..." },
    { "title": "Example: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Walkthrough: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Practice: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Answer: ...", "bullets": ["..."], "notes": "..." },
    { "title": "Documentation: Key Concepts", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Modern Tech: ...", "bullets": ["...", "..."], "notes": "..." },
    { "title": "Documentation & References", "bullets": ["...", "..."], "notes": "..." }
  ]
}`;

const APPLIED_STRUCTURE_REQUIREMENTS = `- Each slide must have a "title" and a "bullets" array.
- Every slide must also have "notes": the speaker notes for that slide - what the instructor SAYS while it is on screen. Write 3-6 sentences of real teaching narration: the explanation behind the bullets, the transition into the next slide, and at least one question to ask the class. The notes are the lecture; the bullets are only what the students see. Never repeat the bullets verbatim, and never write a placeholder or an instruction to the instructor to fill something in.
- Maximum 4 bullets per slide.
- Each bullet must be a complete, self-explanatory sentence (or two) that a student can fully understand without any verbal elaboration. Define every term you introduce, explain how each concept works, and state why it matters. Never use bare keywords or vague one-liners.
- NEVER include a "code" or "codeLanguage" field on any slide. This course does not involve programming.
- The first slide should be a title/overview slide listing the key topics covered in the lecture.
- The SECOND slide MUST be a real-world case study about this lecture's subject, with "title" beginning with "Case Study:". Name a specific, well-known, widely-documented real event - the organization involved and roughly when it happened. Prefer a dramatic, motivating story (a high-profile failure, a costly overrun, a turnaround) to show students why this matters. Use the bullets to summarize what happened, and make the last bullet connect the story to what students are about to learn. Stick to established facts; never invent events or fabricate specifics.
- BREADTH: Cover the subject at maximum breadth. Enumerate every subtopic a student at this level needs: core ideas, common variants, common pitfalls, real-world use cases.
- For every concept-focused slide, immediately follow it with these slides, in this order:
  1. Example slide - "title" begins with "Example:"; walk through ONE concrete, realistic instance of the concept as it appears in practice. Name the situation, the people involved, and the artifact produced (a plan, a matrix, a register, a memo, a schedule, a worked calculation).
  2. Walkthrough slide - "title" begins with "Walkthrough:"; explain that example step by step in "bullets", so a student understands the reasoning without the instructor narrating it.
  3. Practice slide - "title" begins with "Practice:"; pose a short, self-contained exercise on the same concept, stated in 1-2 bullets, that the student completes by producing a small artifact. Keep it introductory and gently scaffolded: single skill, no tricks, mirroring the worked example closely.
  4. Answer slide - "title" begins with "Answer:"; give a model answer to that exact exercise - the completed artifact, described concretely.
- CLOSING SECTIONS: after all the coverage slides above, ALWAYS append these closing sections at the very END of the deck, in this exact order:
  A. POST-LECTURE PRACTICE: add a "Post-Lecture Practice" slide introducing self-study practice. Then for EACH concept in the deck, add exactly 2 additional practice exercises at increasing difficulty - the first noticeably harder than the in-lecture practice, the second harder still - each slide titled "Post-Lecture Practice:" followed by its "Answer:" slide.
  B. DOCUMENTATION - KEY CONCEPTS: one or more slides whose "title" begins with "Documentation:" that recap the key concepts, terms, and definitions taught in this deck as a concise study reference.
  C. MODERN TECH TO EXPLORE: 1-2 slides whose "title" begins with "Modern Tech:" naming real, widely used tools, platforms, or standards practitioners in this field actually use. Each bullet names one, states in a sentence how it relates to a concept taught in this deck, and suggests what to explore first. Name only real, well-known tools; never invent products.
  D. DOCUMENTATION AND REFERENCES: a final slide titled exactly "Documentation & References" listing authoritative resources - the governing body's own standard or handbook where one exists, plus 2-4 suggested further-reading resources. Name only real, well-known resources; do NOT fabricate URLs.
- Do not include any text outside the JSON object.`;

/** The deck JSON shape for a course kind. */
export function slideDeckJsonShape(kind: CourseKind): string {
  return kind === "applied" ? APPLIED_DECK_JSON_SHAPE : SLIDE_DECK_JSON_SHAPE;
}

/** The deck structure requirements for a course kind. */
export function slideStructureRequirements(kind: CourseKind): string {
  return kind === "applied" ? APPLIED_STRUCTURE_REQUIREMENTS : SLIDE_STRUCTURE_REQUIREMENTS;
}
