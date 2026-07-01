/**
 * Deterministic scaffolds for the slide-deck and in-class-example generators.
 * Each mirrors its LLM counterpart's shape but is templated from the instructor's
 * objectives with no model call: it lays out the structure of a lecture (a slide
 * per objective, plus a summary) and example placeholders per concept, which the
 * instructor then fills in.
 */

import {
  deriveTitle,
  detectLanguage,
  detectLessonType,
  titleCase,
  toBullets,
  type LessonType,
} from "./scaffold";

export interface SlideScaffold {
  title: string;
  bullets: string[];
  code?: string;
  codeLanguage?: string;
}

export interface DeckScaffold {
  presentationTitle: string;
  slides: SlideScaffold[];
}

function conceptTitle(objective: string): string {
  const phrase = objective.replace(/[.:;,]+$/, "").trim().split(/\s+/).slice(0, 8).join(" ");
  return titleCase(phrase);
}

/** Build a lecture outline: a title slide, one slide per objective, a summary. */
export function scaffoldLessonPlan(objectives: string, context = ""): DeckScaffold {
  const presentationTitle = deriveTitle(objectives, context, "Lesson Plan");
  const bullets = toBullets(objectives);

  const titleSlide: SlideScaffold = {
    title: presentationTitle,
    bullets: (bullets.length > 0 ? bullets : ["Overview of this lesson"]).slice(0, 5).map(conceptTitle),
  };

  const conceptSlides: SlideScaffold[] = bullets.slice(0, 8).map((objective) => {
    const phrase = objective.replace(/[.:;,]+$/, "").trim().toLowerCase();
    return {
      title: conceptTitle(objective),
      bullets: [
        `Key idea: ${phrase}`,
        "Why it matters: connect this to prior topics and a real-world example students recognize",
        "In practice: walk through a concrete example together in class",
      ],
    };
  });

  const summarySlide: SlideScaffold = {
    title: "Summary",
    bullets:
      bullets.length > 0
        ? bullets.slice(0, 4).map((b) => conceptTitle(b))
        : ["Recap the key ideas from this lesson"],
  };

  return {
    presentationTitle,
    slides: conceptSlides.length > 0 ? [titleSlide, ...conceptSlides, summarySlide] : [titleSlide, summarySlide],
  };
}

export interface ExampleItemScaffold {
  concept: string;
  title: string;
  content: string;
  explanation: string;
  language?: string;
}

export interface ExamplesScaffold {
  lessonType: LessonType;
  examples: ExampleItemScaffold[];
}

function exampleContent(lessonType: LessonType, concept: string, language: string): { content: string; language?: string } {
  switch (lessonType) {
    case "programming":
      return {
        content: `# Worked example for: ${concept}\n# Replace this stub with a short, runnable snippet that demonstrates the concept.\n`,
        language,
      };
    case "math":
      return { content: `Problem: pose a problem that requires ${concept}, then solve it step by step below.` };
    default:
      return { content: `Scenario: describe a concrete situation that illustrates ${concept}.` };
  }
}

/**
 * Build two example placeholders per concept, typed to the lesson (worked-code
 * stub, math problem, or general scenario). Placeholders are clearly marked for
 * the instructor to complete — deterministic templating cannot invent correct
 * worked solutions.
 */
export function scaffoldExamples(concepts: string[], text: string): ExamplesScaffold {
  const cleanedConcepts = concepts.map((c) => c.trim()).filter(Boolean);
  const lessonType = detectLessonType(`${text}\n${cleanedConcepts.join("\n")}`);
  const language = detectLanguage(`${text}\n${cleanedConcepts.join("\n")}`);

  const examples: ExampleItemScaffold[] = [];
  for (const concept of cleanedConcepts) {
    for (let i = 1; i <= 2; i += 1) {
      const { content, language: lang } = exampleContent(lessonType, concept, language);
      examples.push({
        concept,
        title: `${concept} — Example ${i}`,
        content,
        explanation: "Work through the solution step by step, explaining each decision so a student can follow it without the instructor.",
        ...(lang ? { language: lang } : {}),
      });
    }
  }

  return { lessonType, examples };
}
