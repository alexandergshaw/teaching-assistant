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
    { "title": "...", "bullets": ["...", "...", "..."] },
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
- Maximum 4 bullets per slide.
- Each bullet must be a complete, self-explanatory sentence (or two) that a student can fully understand without any verbal elaboration. Define every term you introduce, explain how each concept works, and state why it matters for this material. Never use bare keywords or vague one-liners — write as if the student is reading the slide alone with no instructor present.
- The first slide should be a title/overview slide listing the key topics covered in the lecture.
- The SECOND slide MUST be a real-world case study or news story about this lecture's subject, with "title" beginning with "Case Study:". Name a specific, well-known, widely-documented real event (the organization or product involved and roughly when it happened). Prefer a dramatic, motivating story — a high-profile failure, security breach, or outage, OR an impressive system that was built — to show students why this matters. Use the bullets to summarize what happened, and make the last bullet connect the story to what students are about to learn. Do not put "code" on this slide. Stick to established facts; never invent events or fabricate specifics.
- Use real-world analogies and concrete examples that students will recognise; integrate the analogy into the bullet itself so it is self-contained.
- For every concept-focused slide, immediately follow it with a concrete example slide and a step-by-step walkthrough slide that explains each step or line in plain English so the student understands the reasoning without needing the instructor to narrate it. Label these slides clearly (e.g. "Example: <concept>" and "Walkthrough: <concept>").
- CODING CONCEPTS: When the concept being introduced is a coding concept (a loop, conditional, variable, function, class, data structure, etc.), follow it with exactly these four slides, in this order:
  1. Example slide — "title" begins with "Example:"; demonstrate that exact concept with a short, correct, self-contained snippet in "code" (use real newlines) and "codeLanguage" set; keep "bullets" to at most one short caption.
  2. Walkthrough slide — "title" begins with "Walkthrough:"; explain the example code line by line in "bullets" while showing the same code in the "code" field; use the exact code from the Example slide so students can read both the code and the explanation together.
  3. Practice slide — "title" begins with "Practice:"; pose a simple, self-contained coding challenge on the same concept for the student to attempt. State the task in 1-2 "bullets" and set "codeLanguage". Its "code" field MUST repeat the SAME reference code shown on the Example/Walkthrough slide so the student has a worked example to reference — it must NOT contain the solution to the practice challenge or any code that gives away the answer.
  4. Answer slide — "title" begins with "Answer:"; give the correct, runnable solution to that exact practice challenge in "code" with "codeLanguage" set, plus at most one "bullets" caption.
- All of Example, Walkthrough, Practice, and Answer slides must include "code"/"codeLanguage". Do not omit "code" on Walkthrough or Practice slides. Omit code only on conceptual slides.
- CLOSING SECTIONS: after all the coverage slides above, ALWAYS append these closing sections at the very END of the deck, in this exact order:
  A. ADDITIONAL PRACTICE: for EACH coding concept you introduced in this deck, add 2-3 NEW slides whose "title" begins with "Additional Practice:" that pose fresh, self-contained challenges on that concept (clearly different from the earlier inline Practice slide). IMMEDIATELY follow each "Additional Practice:" slide with its own "Answer:" slide giving the correct, runnable solution in "code" with "codeLanguage" set. The "Additional Practice:" slide states the task in its bullets and must NOT reveal the solution (it may include a short reference/starter snippet in "code", but never the answer). For a non-programming module, make these 2-3 additional conceptual practice questions per concept, each followed by an "Answer:" slide, with no code fields.
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
