/**
 * Deterministic scaffolds for the slide-deck and in-class-example generators.
 * Each mirrors its LLM counterpart's shape but is built from the instructor's
 * own material with no model call: definitions found in the source become
 * concept-slide bullets, and real fenced code blocks from the README/brief
 * become Example and Walkthrough slides (and worked examples), so the deck
 * reflects the actual content rather than a fixed template. Only where nothing
 * usable exists in the source does a slide fall back to a clearly-marked
 * placeholder the instructor completes.
 */

import {
  deriveTitle,
  detectLanguage,
  detectLessonType,
  extractCodeBlocks,
  extractDefinitions,
  pick,
  titleCase,
  toBullets,
  type CodeBlock,
  type Definition,
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

/** The definition whose term appears in (or contains) the concept phrase. */
function definitionFor(phrase: string, definitions: Definition[]): Definition | undefined {
  const lower = phrase.toLowerCase();
  return definitions.find(
    (d) => lower.includes(d.term.toLowerCase()) || d.term.toLowerCase().includes(lower)
  );
}

/** Example + Walkthrough slide pair for one concept, showing the same real code. */
function codeSlidePair(phrase: string, block: CodeBlock, fallbackLanguage: string): SlideScaffold[] {
  const codeLanguage = block.language ?? fallbackLanguage;
  const title = titleCase(phrase.split(/\s+/).slice(0, 6).join(" "));
  return [
    {
      title: `Example: ${title}`,
      bullets: [pick(
        [`A worked example of ${phrase}, taken from the course material.`,
         `This code from the course material demonstrates ${phrase}.`],
        phrase
      )],
      code: block.code,
      codeLanguage,
    },
    {
      title: `Walkthrough: ${title}`,
      bullets: [
        "Read the example line by line and note what each step does.",
        `Connect each line back to ${phrase} before moving on.`,
      ],
      code: block.code,
      codeLanguage,
    },
  ];
}

/**
 * Build a lecture outline: a title slide, one slide per objective (with a real
 * definition from the source when one exists), Example/Walkthrough pairs showing
 * real code blocks found in the material, and a summary.
 */
export function scaffoldLessonPlan(objectives: string, context = ""): DeckScaffold {
  const source = `${objectives}\n${context}`;
  const presentationTitle = deriveTitle(objectives, context, "Lesson Plan");
  const bullets = toBullets(objectives);
  const definitions = extractDefinitions(source, 12);
  const codeBlocks = extractCodeBlocks(source);
  const fallbackLanguage = detectLanguage(source);

  const titleSlide: SlideScaffold = {
    title: presentationTitle,
    bullets: (bullets.length > 0 ? bullets : ["Overview of this lesson"]).slice(0, 5).map(conceptTitle),
  };

  let blockIndex = 0;
  const conceptSlides: SlideScaffold[] = [];
  for (const objective of bullets.slice(0, 8)) {
    const phrase = objective.replace(/[.:;,]+$/, "").trim().toLowerCase();
    const definition = definitionFor(phrase, definitions);
    conceptSlides.push({
      title: conceptTitle(objective),
      bullets: [
        definition ? definition.definition : `Key idea: ${phrase}`,
        pick(
          [
            "Why it matters: connect this to prior topics and a real-world example students recognize",
            "Why it matters: tie this to something students already use or have seen",
            "Why it matters: show where this appears in real software or coursework",
          ],
          phrase
        ),
        pick(
          [
            "In practice: walk through a concrete example together in class",
            "In practice: demonstrate this live, then have students try a variation",
            "In practice: work one example as a class before students practice alone",
          ],
          phrase
        ),
      ],
    });

    // Follow the concept with real code from the material, when available.
    if (blockIndex < codeBlocks.length) {
      conceptSlides.push(...codeSlidePair(phrase, codeBlocks[blockIndex], fallbackLanguage));
      blockIndex += 1;
    }
  }

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

function exampleStub(lessonType: LessonType, concept: string, language: string): { content: string; language?: string } {
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
 * Build two examples per concept. For programming lessons, the first example per
 * concept uses a real code block extracted from the provided material when one is
 * available (consumed in document order); everything else is a clearly-marked
 * placeholder, since deterministic templating cannot invent correct solutions.
 */
export function scaffoldExamples(concepts: string[], text: string): ExamplesScaffold {
  const cleanedConcepts = concepts.map((c) => c.trim()).filter(Boolean);
  const lessonType = detectLessonType(`${text}\n${cleanedConcepts.join("\n")}`);
  const language = detectLanguage(`${text}\n${cleanedConcepts.join("\n")}`);
  const codeBlocks = extractCodeBlocks(text);
  let blockIndex = 0;

  const examples: ExampleItemScaffold[] = [];
  for (const concept of cleanedConcepts) {
    for (let i = 1; i <= 2; i += 1) {
      if (lessonType === "programming" && i === 1 && blockIndex < codeBlocks.length) {
        const block = codeBlocks[blockIndex];
        blockIndex += 1;
        examples.push({
          concept,
          title: `${concept} — Example ${i}`,
          content: block.code,
          explanation: `Trace this example from the course material line by line to see how it demonstrates ${concept}.`,
          language: block.language ?? language,
        });
        continue;
      }
      const { content, language: lang } = exampleStub(lessonType, concept, language);
      examples.push({
        concept,
        title: `${concept} — Example ${i}`,
        content,
        explanation:
          "Work through the solution step by step, explaining each decision so a student can follow it without the instructor.",
        ...(lang ? { language: lang } : {}),
      });
    }
  }

  return { lessonType, examples };
}
