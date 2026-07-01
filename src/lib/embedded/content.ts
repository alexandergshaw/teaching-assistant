/**
 * Deterministic content scaffolds for the ContentTab generators. Each mirrors
 * the shape its LLM counterpart returns, but is templated from the instructor's
 * objectives and context with no model call. The output is a professional
 * starting point the instructor edits, not finished prose.
 */

import {
  capitalizeFirst,
  deriveTitle,
  deriveTopic,
  ensureSentence,
  keyPhrases,
  summarize,
  summarizeObjectives,
  titleCase,
  toBullets,
} from "./scaffold";

export interface ModuleIntroScaffold {
  overview: string;
  keyTerms: string;
}

export interface AssignmentStepScaffold {
  stepTitle: string;
  description: string;
}

export interface AssignmentScaffold {
  title: string;
  overview: string;
  steps: AssignmentStepScaffold[];
  tools: string[];
  deliverables: string[];
}

/** Build a 2-3 sentence overview + key-terms intro from the module objectives. */
export function scaffoldModuleIntro(objectives: string, context = ""): ModuleIntroScaffold {
  const topic = deriveTopic(objectives, context);
  const summary = summarizeObjectives(objectives);
  const terms = keyPhrases(`${objectives}\n${context}`, 5);

  // A real summary of the supplied context, so the overview reflects the source
  // material instead of a fixed closing line.
  const contextSummary = context.trim() ? capitalizeFirst(ensureSentence(summarize(context, 1))) : "";
  const overview = [
    ensureSentence(`This module focuses on ${topic}`),
    summary,
    contextSummary,
    "These ideas build on what you have already seen and set up the work in the modules that follow.",
  ]
    .filter(Boolean)
    .join(" ");

  const keyTerms =
    terms.length > 0
      ? [
          ensureSentence(`As you work through this module, watch for key terms such as ${terms.join(", ")}`),
          "Each one is introduced and defined in the materials as it comes up.",
          "Keeping these straight will make the examples and activities easier to follow.",
        ].join(" ")
      : "The key terms for this module are introduced and defined in the materials as they come up. Note each one as you encounter it so the examples and activities are easier to follow.";

  return { overview, keyTerms };
}

// Free-tool suggestions keyed by signals in the objectives/context. First match
// wins per group; a small default set always applies.
const TOOL_SIGNALS: Array<{ test: RegExp; tools: string[] }> = [
  { test: /\bpython\b|\bpandas\b|\bnumpy\b|data\s+(?:science|analysis)/i, tools: ["Python", "Google Colab"] },
  { test: /\bjavascript\b|\bnode(?:\.js)?\b|\breact\b|\bfront[-\s]?end\b/i, tools: ["Node.js", "VS Code"] },
  { test: /\bjava\b/i, tools: ["Java (JDK)", "IntelliJ IDEA Community Edition"] },
  { test: /\bsql\b|\bdatabase\b|\bqueries\b/i, tools: ["SQLite", "DB Browser for SQLite"] },
  { test: /\bhtml\b|\bcss\b|\bweb\s+page\b|\bwebsite\b/i, tools: ["VS Code", "A modern web browser"] },
  { test: /\bfigma\b|\bdesign\b|\bwireframe\b|\bui\/ux\b/i, tools: ["Figma (free tier)"] },
];

function suggestTools(text: string): string[] {
  const tools = new Set<string>(["VS Code", "GitHub (free account)"]);
  for (const signal of TOOL_SIGNALS) {
    if (signal.test.test(text)) signal.tools.forEach((t) => tools.add(t));
  }
  return [...tools];
}

/** Build a practical assignment scaffold (overview, steps, tools, deliverables). */
export function scaffoldAssignment(objectives: string, context = ""): AssignmentScaffold {
  const topic = deriveTopic(objectives, context);
  const title = `${deriveTitle(objectives, context, "Module")}: Applied Assignment`;

  const overview = [
    ensureSentence(
      `In this assignment you will apply what you learned about ${topic} to a practical, hands-on task`
    ),
    summarizeObjectives(objectives),
    "Work through the steps below on your own, using only free tools.",
  ]
    .filter(Boolean)
    .join(" ");

  // One step per objective, then standard closing steps, capped at 8.
  const objectiveSteps: AssignmentStepScaffold[] = toBullets(objectives)
    .slice(0, 5)
    .map((objective) => {
      const phrase = objective.replace(/[.:;,]+$/, "").trim();
      return {
        stepTitle: `Apply: ${titleCase(phrase.split(/\s+/).slice(0, 6).join(" "))}`,
        description: ensureSentence(
          `Complete the part of the task that addresses ${phrase.toLowerCase()}, and briefly note the choices you made`
        ),
      };
    });

  const closingSteps: AssignmentStepScaffold[] = [
    {
      stepTitle: "Test and Verify",
      description: "Check your work against the objectives above and confirm each requirement is met.",
    },
    {
      stepTitle: "Document Your Approach",
      description: "Write a short explanation of how you approached the task and why you made your key decisions.",
    },
    {
      stepTitle: "Package and Submit",
      description: "Gather all of your files and submit them as instructed.",
    },
  ];

  const steps = [...objectiveSteps, ...closingSteps].slice(0, 8);

  return {
    title,
    overview,
    steps: steps.length >= 4 ? steps : [...steps, ...closingSteps].slice(0, 4),
    tools: suggestTools(`${objectives}\n${context}`),
    deliverables: [
      "A completed submission that demonstrates each required step",
      "A short write-up explaining your approach and key decisions",
      "All source files, packaged together for submission",
    ],
  };
}
