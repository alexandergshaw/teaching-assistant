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

/** Post-lecture practice + answer pair: 2 problems per concept at increasing
 *  difficulty. The first is moderate (intro-difficulty or the first available),
 *  the second is challenging (core-difficulty or the second available). */
function postLecturePracticePair(phrase: string, problems: PracticeProblemEntry[], index: number): SlideScaffold[] {
  if (index >= problems.length) {
    // Not enough problems; fall back to placeholder if this is the first one
    if (index === 0) {
      return placeholderPostLecturePracticePair(phrase, problems[0]?.language ?? "");
    }
    return [];
  }

  const problem = problems[index];
  const title = titleCase(phrase.split(/\s+/).slice(0, 6).join(" "));
  const difficultyLabel = index === 0 ? "(moderate)" : "(challenging)";

  return [
    {
      title: `Post-Lecture Practice: ${title}`,
      bullets: [problem.prompt, `Self-study problem ${index + 1} of 2. ${difficultyLabel}`],
      code: problem.exampleCode,
      codeLanguage: problem.language,
    },
    {
      title: `Answer: ${title}`,
      bullets: ["One correct solution to the post-lecture practice challenge."],
      code: problem.solutionCode,
      codeLanguage: problem.language,
    },
  ];
}

/** A clearly-marked, instructor-completed post-lecture-practice pair, used when
 *  the curated library has insufficient problems. The engine never invents a
 *  verified solution, so the answer points the student back to the deck's
 *  worked examples and leaves the solution to the instructor. */
function placeholderPostLecturePracticePair(phrase: string, language: string): SlideScaffold[] {
  const title = titleCase(phrase.split(/\s+/).slice(0, 6).join(" "));
  if (language) {
    return [
      {
        title: `Post-Lecture Practice: ${title}`,
        bullets: [
          `Write a short ${language} snippet that applies ${phrase} in a new way, then run it.`,
          "Self-study problem 1 of 2. (moderate)",
        ],
        code: `# Post-lecture practice: ${phrase}\n# Write your solution below.\n`,
        codeLanguage: language,
      },
      {
        title: `Answer: ${title}`,
        bullets: [
          "Check your solution against the worked examples earlier in this deck.",
          "Model solution to be added by the instructor.",
        ],
      },
    ];
  }
  return [
    {
      title: `Post-Lecture Practice: ${title}`,
      bullets: [
        `Apply ${phrase} to a new problem and show each step of your reasoning.`,
        "Self-study problem 1 of 2. (moderate)",
      ],
    },
    {
      title: `Answer: ${title}`,
      bullets: [
        "Compare your reasoning with the concept slides earlier in this deck.",
        "Model answer to be added by the instructor.",
      ],
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

  // Post-lecture practice: exactly 2 problems per concept at increasing difficulty.
  // First problem is intro/moderate, second is core/challenging. The order preference
  // is intro-difficulty first, then core-difficulty for the second; fall back to
  // whatever the bank has, never crash when fewer are available.
  const postLecturePracticeIntroSlide: SlideScaffold = {
    title: "Post-Lecture Practice",
    bullets: [
      "Self-study practice problems to deepen your understanding.",
      "For each concept, try 2 problems at increasing difficulty before checking the answers.",
    ],
  };

  const postLecturePracticeSlides: SlideScaffold[] = [postLecturePracticeIntroSlide];
  for (const objective of bullets.slice(0, 8)) {
    const phrase = objective.replace(/[.:;,]+$/, "").trim().toLowerCase();
    const candidates = (await findPracticeProblems(phrase, 6)).filter((p) => !usedProblems.has(p.id));

    // Prefer intro difficulty first, then core difficulty for the second problem.
    // If only core or only intro available, use what we have.
    let problem1: PracticeProblemEntry | undefined;
    let problem2: PracticeProblemEntry | undefined;

    const introProblems = candidates.filter((p) => p.difficulty === "intro");
    const coreProblems = candidates.filter((p) => p.difficulty === "core");

    if (introProblems.length > 0) {
      problem1 = introProblems[0];
      usedProblems.add(problem1.id);
    } else if (coreProblems.length > 0) {
      problem1 = coreProblems[0];
      usedProblems.add(problem1.id);
    }

    if (problem1) {
      // Get the second problem from remaining candidates, preferring core difficulty.
      const remaining = candidates.filter((p) => p.id !== problem1!.id);
      if (remaining.length > 0) {
        // Prefer core-difficulty for problem2, fall back to whatever is available.
        const coreCandidates = remaining.filter((p) => p.difficulty === "core");
        problem2 = coreCandidates.length > 0 ? coreCandidates[0] : remaining[0];
        usedProblems.add(problem2.id);
      }
    }

    // Add the first problem (moderate difficulty).
    if (problem1) {
      postLecturePracticeSlides.push(...postLecturePracticePair(phrase, [problem1], 0));
    } else {
      postLecturePracticeSlides.push(...placeholderPostLecturePracticePair(phrase, fallbackLanguage));
    }

    // Add the second problem (challenging difficulty).
    if (problem2) {
      postLecturePracticeSlides.push(...postLecturePracticePair(phrase, [problem1!, problem2], 1));
    } else {
      // If we don't have a second problem, add a placeholder for it (always).
      postLecturePracticeSlides.push(...placeholderPostLecturePracticePair(phrase, fallbackLanguage).slice(0, 2).map((s) => ({
        ...s,
        bullets: s.bullets.map((b) => b.replace("problem 1 of 2", "problem 2 of 2").replace("(moderate)", "(challenging)")),
      })));
    }
  }

  // Documentation: a concept reference sheet from the definitions found in the source.
  const conceptRefBullets = definitions.slice(0, 6).map((d) => `${d.term}: ${d.definition}`);
  const documentationConceptsSlide: SlideScaffold = {
    title: "Documentation: Key Concepts",
    bullets: conceptRefBullets.length > 0 ? conceptRefBullets : bullets.slice(0, 5).map(conceptTitle),
  };

  // Documentation and references (deterministic - names resources, invents nothing).
  const documentationReferencesSlide: SlideScaffold = {
    title: "Documentation & References",
    bullets: [
      fallbackLanguage
        ? `Consult the official ${fallbackLanguage} documentation for the language features used here.`
        : "Consult the official documentation for the tools and libraries used in these examples.",
      "Review your course textbook, lecture notes, and any assigned readings for these topics.",
      "Look up each library or tool referenced in the examples in its own official documentation.",
    ],
  };

  const closingSlides: SlideScaffold[] = [
    ...postLecturePracticeSlides,
    documentationConceptsSlide,
    documentationReferencesSlide,
  ];

  const leadSlides = caseStudySlide ? [titleSlide, caseStudySlide] : [titleSlide];
  return {
    presentationTitle,
    slides:
      conceptSlides.length > 0
        ? [...leadSlides, ...conceptSlides, summarySlide, ...closingSlides]
        : [...leadSlides, summarySlide, ...closingSlides],
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
