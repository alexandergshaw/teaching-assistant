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
import { findCaseStudyMaterial, findPracticeProblems, type PracticeProblemEntry } from "@/lib/research";
import { maybeLearnInBackground } from "@/lib/research/gap";
import { rememberDefinitions, lookupDefinitionsForPhrases } from "@/lib/research/glossary";

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
 * Practice + Answer slide pair from a curated practice problem. Following the
 * LLM slide contract, the Practice slide's code repeats the reference example
 * (never the solution), and only the Answer slide shows the verified solution.
 */
function practiceSlidePair(
  phrase: string,
  problem: PracticeProblemEntry,
  referenceCode: string,
  referenceLanguage: string
): SlideScaffold[] {
  const title = titleCase(phrase.split(/\s+/).slice(0, 6).join(" "));
  return [
    {
      title: `Practice: ${title}`,
      bullets: [problem.prompt, "Use the reference code below as a worked example, then write your own solution."],
      code: referenceCode,
      codeLanguage: referenceLanguage,
    },
    {
      title: `Answer: ${title}`,
      bullets: ["One correct solution to the practice challenge."],
      code: problem.solutionCode,
      codeLanguage: problem.language,
    },
  ];
}

/**
 * Build a lecture outline: a title slide, a real case study from the research
 * library as the second slide (mirroring the LLM slide contract), one slide per
 * objective (with a real definition from the source when one exists), Example/
 * Walkthrough pairs showing real code, and Practice/Answer pairs drawn from the
 * curated practice problems, then a summary.
 */
export async function scaffoldLessonPlan(objectives: string, context = ""): Promise<DeckScaffold> {
  const source = `${objectives}\n${context}`;
  const presentationTitle = deriveTitle(objectives, context, "Lesson Plan");
  const bullets = toBullets(objectives);
  const definitions = extractDefinitions(source, 12);
  const codeBlocks = extractCodeBlocks(source);
  const fallbackLanguage = detectLanguage(source);

  // Usage-driven learning: schedule the research loop for this topic in the
  // background when the knowledge base has a gap. This deck neither waits on
  // nor uses the result — future decks on the topic get richer.
  void maybeLearnInBackground(source);

  const titleSlide: SlideScaffold = {
    title: presentationTitle,
    bullets: (bullets.length > 0 ? bullets : ["Overview of this lesson"]).slice(0, 5).map(conceptTitle),
  };

  // A real, documented case study as the second slide, when one matches the
  // topic (the LLM contract's "Case Study:" slide). Off-topic decks get none.
  // Learned (research-loop) material carries its source attribution.
  const caseStudy = await findCaseStudyMaterial(source);
  const caseStudySlide: SlideScaffold | null = caseStudy
    ? {
        title: `Case Study: ${caseStudy.title}`,
        bullets: caseStudy.bullets,
      }
    : null;

  // Grow the glossary from this material, and pull instructor-authored
  // definitions back out of it for concepts the current material never defines.
  void rememberDefinitions(definitions);
  const phrasesNeedingDefs = bullets
    .slice(0, 8)
    .map((objective) => objective.replace(/[.:;,]+$/, "").trim().toLowerCase())
    .filter((phrase) => !definitionFor(phrase, definitions));
  const glossaryDefs = await lookupDefinitionsForPhrases(phrasesNeedingDefs);

  let blockIndex = 0;
  const usedProblems = new Set<string>();
  const conceptSlides: SlideScaffold[] = [];
  for (const objective of bullets.slice(0, 8)) {
    const phrase = objective.replace(/[.:;,]+$/, "").trim().toLowerCase();
    const definition = definitionFor(phrase, definitions);
    conceptSlides.push({
      title: conceptTitle(objective),
      bullets: [
        definition ? definition.definition : glossaryDefs.get(phrase) ?? `Key idea: ${phrase}`,
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

    // Prefer real code from the course material for the Example/Walkthrough
    // pair; otherwise fall back to a curated problem's worked example.
    const problem = (await findPracticeProblems(phrase, 3)).find((p) => !usedProblems.has(p.id));
    const sourceBlock = blockIndex < codeBlocks.length ? codeBlocks[blockIndex] : null;

    if (sourceBlock) {
      conceptSlides.push(...codeSlidePair(phrase, sourceBlock, fallbackLanguage));
      blockIndex += 1;
    } else if (problem) {
      conceptSlides.push(
        ...codeSlidePair(phrase, { code: problem.exampleCode, language: problem.language }, fallbackLanguage)
      );
    }

    // Practice/Answer from the curated problem, completing the LLM contract's
    // Example -> Walkthrough -> Practice -> Answer sequence for the concept.
    if (problem) {
      usedProblems.add(problem.id);
      const referenceCode = sourceBlock?.code ?? problem.exampleCode;
      const referenceLanguage = sourceBlock ? sourceBlock.language ?? fallbackLanguage : problem.language;
      conceptSlides.push(...practiceSlidePair(phrase, problem, referenceCode, referenceLanguage));
    }
  }

  const summarySlide: SlideScaffold = {
    title: "Summary",
    bullets:
      bullets.length > 0
        ? bullets.slice(0, 4).map((b) => conceptTitle(b))
        : ["Recap the key ideas from this lesson"],
  };

  const leadSlides = caseStudySlide ? [titleSlide, caseStudySlide] : [titleSlide];
  return {
    presentationTitle,
    slides: conceptSlides.length > 0 ? [...leadSlides, ...conceptSlides, summarySlide] : [...leadSlides, summarySlide],
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
 * Build two examples per concept. Real material fills the slots in priority
 * order: a code block extracted from the provided text first, then a curated
 * practice problem (its prompt plus verified solution) from the research
 * library; only when neither exists does a slot fall back to a clearly-marked
 * placeholder, since deterministic templating cannot invent correct solutions.
 */
export async function scaffoldExamples(concepts: string[], text: string): Promise<ExamplesScaffold> {
  const cleanedConcepts = concepts.map((c) => c.trim()).filter(Boolean);
  // Schedule background learning for this topic (never awaited or used here).
  void maybeLearnInBackground(`${text}\n${cleanedConcepts.join("\n")}`);
  const lessonType = detectLessonType(`${text}\n${cleanedConcepts.join("\n")}`);
  const language = detectLanguage(`${text}\n${cleanedConcepts.join("\n")}`);
  const codeBlocks = extractCodeBlocks(text);
  let blockIndex = 0;
  const usedProblems = new Set<string>();

  const examples: ExampleItemScaffold[] = [];
  for (const concept of cleanedConcepts) {
    // Real candidates for this concept, best first.
    const candidates: ExampleItemScaffold[] = [];

    if (lessonType === "programming" && blockIndex < codeBlocks.length) {
      const block = codeBlocks[blockIndex];
      blockIndex += 1;
      candidates.push({
        concept,
        title: "",
        content: block.code,
        explanation: `Trace this example from the course material line by line to see how it demonstrates ${concept}.`,
        language: block.language ?? language,
      });
    }

    const problem = (await findPracticeProblems(concept, 3)).find((p) => !usedProblems.has(p.id));
    if (problem) {
      usedProblems.add(problem.id);
      candidates.push({
        concept,
        title: "",
        content: problem.solutionCode,
        explanation: `Practice problem: ${problem.prompt} The code above is one correct solution; trace it line by line.`,
        language: problem.language,
      });
    }

    for (let i = 1; i <= 2; i += 1) {
      const candidate = candidates.shift();
      if (candidate) {
        examples.push({ ...candidate, title: `${concept} — Example ${i}` });
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
