/**
 * Deterministic scaffolds for the course-level generators: a universal project
 * rubric (fixed, broadly-applicable criteria) and a course outline derived from a
 * repository's structure. Both are templated with no model call; the outline
 * reads only the file paths already present in the repo digest, never inventing
 * technologies that are not there.
 */

import { detectLanguage, titleCase } from "./scaffold";

interface ProjectCriterion {
  name: string;
  points: number;
  excellent: string;
  satisfactory: string;
  needsImprovement: string;
}

const PROJECT_CRITERIA: ProjectCriterion[] = [
  {
    name: "Technical Correctness",
    points: 40,
    excellent: "The submission fully implements the required functionality and behaves correctly.",
    satisfactory: "Most functionality is implemented; minor errors or gaps remain.",
    needsImprovement: "Key functionality is missing or does not work as required.",
  },
  {
    name: "Code Quality & Clarity",
    points: 30,
    excellent: "Code is well organized, clearly named, and easy to follow.",
    satisfactory: "Code is mostly clear, with some organization or naming issues.",
    needsImprovement: "Code is difficult to follow or poorly organized.",
  },
  {
    name: "Completeness & Requirements",
    points: 30,
    excellent: "Every stated requirement and deliverable is present.",
    satisfactory: "Most requirements are met; a few are missing.",
    needsImprovement: "Several requirements or deliverables are missing.",
  },
];

/** A fixed, course-wide rubric formatted the same way as the LLM path's output. */
export function scaffoldCourseProjectRubric(): string {
  const lines: string[] = ["COURSE-WIDE GRADING RUBRIC (100 points)\n"];
  lines.push(
    ["Criterion", "Excellent", "Satisfactory", "Needs Improvement"].map((h) => h.padEnd(28)).join(" | ")
  );
  lines.push("-".repeat(110));
  for (const c of PROJECT_CRITERIA) {
    const excellentScore = c.points;
    const satisfactoryScore = Math.round(c.points * 0.75);
    const needsScore = Math.round(c.points * 0.5);
    lines.push(`\n${c.name} (${c.points}pts)`);
    lines.push(`  Excellent:         ${excellentScore} pts — ${c.excellent}`);
    lines.push(`  Satisfactory:      ${satisfactoryScore} pts — ${c.satisfactory}`);
    lines.push(`  Needs Improvement: ${needsScore} pts — ${c.needsImprovement}`);
  }
  return lines.join("\n");
}

// File extension -> human technology name, for the outline's summary.
const TECH_BY_EXT: Record<string, string> = {
  py: "Python",
  js: "JavaScript",
  ts: "TypeScript",
  tsx: "React (TypeScript)",
  jsx: "React",
  java: "Java",
  go: "Go",
  rb: "Ruby",
  rs: "Rust",
  cpp: "C++",
  c: "C",
  cs: "C#",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  php: "PHP",
  swift: "Swift",
  kt: "Kotlin",
  r: "R",
};

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

function detectTechnologies(paths: string[]): string[] {
  const techs = new Set<string>();
  for (const path of paths) {
    const tech = TECH_BY_EXT[extensionOf(path)];
    if (tech) techs.add(tech);
  }
  return [...techs];
}

function topLevelDirs(paths: string[]): string[] {
  const dirs = new Set<string>();
  for (const path of paths) {
    const slash = path.indexOf("/");
    if (slash > 0) dirs.add(path.slice(0, slash));
  }
  return [...dirs];
}

/**
 * Build a weekly course outline (markdown) from a repo's file paths: a summary of
 * the technologies present, one week per top-level directory (or file when the
 * repo is flat), and a capstone.
 */
export function scaffoldCourseOutline(fullName: string, paths: string[], truncated = false): string {
  const techs = detectTechnologies(paths);
  const techList = techs.length > 0 ? techs.join(", ") : "the technologies in this repository";

  const dirs = topLevelDirs(paths).slice(0, 12);
  const units =
    dirs.length > 0
      ? dirs
      : paths
          .map((p) => p.split("/").pop() ?? p)
          .filter(Boolean)
          .slice(0, 10);

  const sections: string[] = [
    `# Course from ${fullName}`,
    `This course teaches the concepts and skills demonstrated in ${fullName}. Students will work with ${techList}.${truncated ? " (The repository was large, so this outline covers the sampled portion.)" : ""}`,
    "## Week 1 — Getting Started",
    "Set up the project, tour the repository structure, and run it locally.\n\n**Assignment:** Fork the repository, get it running, and describe how the pieces fit together.",
  ];

  units.forEach((unit, index) => {
    const label = titleCase(unit.replace(/[-_]+/g, " "));
    const related = paths
      .filter((p) => p.startsWith(`${unit}/`))
      .slice(0, 3)
      .map((p) => p.split("/").pop() ?? p);
    sections.push(
      `## Week ${index + 2} — ${label}`,
      `Study the ${label} part of the project and the concepts it demonstrates.${related.length ? `\n\nDraws on: ${related.join(", ")}.` : ""}\n\n**Assignment:** Extend or rebuild the ${label} component, grounded in the existing code.`
    );
  });

  sections.push(
    "## Capstone",
    `Extend or rebuild a significant part of ${fullName}, combining what you learned across the term.`
  );

  return sections.join("\n\n");
}

/**
 * Build a GitHub Copilot scaffolding prompt from a course schedule. The bulk of
 * the prompt is the standard project structure (assignment0 onboarding, an
 * assignments/ directory, one editable file per assignment with unit tests, a
 * Vercel-deployed frontend that unlocks as students complete files); the schedule
 * is embedded verbatim and the primary language is detected from it.
 */
export function scaffoldCopilotPrompt(fileContent: string, fileName: string): string {
  const language = detectLanguage(fileContent);
  return [
    `Scaffold a complete, beginner-friendly software project for a course, based on the schedule below (from "${fileName}").`,
    "",
    "PRIMARY LANGUAGE (detected): " + language,
    "",
    "COURSE SCHEDULE:",
    fileContent.trim(),
    "",
    "Build the project with this exact structure:",
    "- A Next.js frontend deployed to Vercel out of the box, showcasing employer-relevant skills for the detected language and domain.",
    "- A single root-level `assignments/` directory. Every assignment lives in its own folder (`assignments/assignment0/`, `assignments/assignment1/`, ...).",
    "- `assignments/assignment0/` is an onboarding exercise that walks students, step by step and using the GitHub and GitHub Codespaces graphical interfaces (not the terminal), through: forking the repo, deploying to Vercel, creating a branch, opening it in Codespaces, making a simple change, running the tests via the Testing panel, committing and pushing via the Source Control panel, opening a pull request, verifying the Vercel preview, and merging.",
    "- In each assignment folder, exactly ONE file is student-editable; every other file is read-only scaffolding. Name the editable file explicitly.",
    "- Each assignment folder contains an `INSTRUCTIONS.md` with verbose, beginner-friendly instructions and worked examples that do NOT give away the solution, and unit tests that import only the student's editable file.",
    "- Completing the one editable file (and nothing else) automatically unlocks the corresponding feature in the frontend; specify the exact import/read path and what the frontend checks.",
    "- Create a `reviewN` folder for each review week and an `examN` folder for each test/exam week identified in the schedule, each with the same INSTRUCTIONS.md + editable file + tests + frontend-unlock structure.",
    "- Cover every topic and assignment in the schedule, in roughly the same order, evolving the project week by week.",
    "",
    "Return the scaffolded project. Keep everything free and deployable with only GitHub and Vercel.",
  ].join("\n");
}
