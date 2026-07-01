/**
 * Deterministic markdown-document scaffolds for the "generate a document" flows.
 * Output uses the lightweight markdown the docx builder expects (a single "# "
 * title, "## " section headings, "- " bullets, blank-line-separated paragraphs).
 * Everything is templated from the instructor's own input, with no model call and
 * no invented facts; placeholders mark where specifics should be filled in.
 */

import {
  capitalizeFirst,
  deriveTitle,
  ensureSentence,
  extractDefinitions,
  summarize,
  summarizeObjectives,
  toBullets,
} from "./scaffold";

// ── Curated free resources ───────────────────────────────────────────────────
// Real, stable, free references keyed by technology signals in the content. The
// LLM version of the assignment sheet always includes a resources section; this
// is its deterministic counterpart, drawn from a vetted list instead of model
// recall so every link is real.

interface Resource {
  title: string;
  url: string;
  why: string;
}

const RESOURCE_SETS: Array<{ test: RegExp; resources: Resource[] }> = [
  {
    test: /\bpython\b|\bpandas\b|\bnumpy\b|\.py\b/i,
    resources: [
      { title: "The Python Tutorial", url: "https://docs.python.org/3/tutorial/", why: "The official walkthrough of the language, from basics to classes." },
      { title: "Python Standard Library Reference", url: "https://docs.python.org/3/library/", why: "Authoritative documentation for every built-in module." },
    ],
  },
  {
    test: /\bjavascript\b|\bnode(?:\.js)?\b|\breact\b|\.js\b/i,
    resources: [
      { title: "MDN JavaScript Guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", why: "The standard reference for the JavaScript language." },
      { title: "The Modern JavaScript Tutorial", url: "https://javascript.info/", why: "A free, in-depth tutorial covering the language step by step." },
    ],
  },
  {
    test: /\bjava\b/i,
    resources: [
      { title: "Dev.java Learn Java", url: "https://dev.java/learn/", why: "Oracle's official learning path for the Java language." },
      { title: "The Java Tutorials", url: "https://docs.oracle.com/javase/tutorial/", why: "Official, example-driven coverage of core Java." },
    ],
  },
  {
    test: /\bsql\b|\bdatabase\b/i,
    resources: [
      { title: "SQLBolt", url: "https://sqlbolt.com/", why: "Free interactive lessons that teach SQL by writing queries." },
      { title: "SQLite Documentation", url: "https://www.sqlite.org/docs.html", why: "Official documentation for a free database you can run anywhere." },
    ],
  },
  {
    test: /\bhtml\b|\bcss\b|\bweb\s*(?:page|site|development)\b/i,
    resources: [
      { title: "MDN Learn Web Development", url: "https://developer.mozilla.org/en-US/docs/Learn", why: "Structured, free lessons on HTML, CSS, and JavaScript." },
      { title: "freeCodeCamp Responsive Web Design", url: "https://www.freecodecamp.org/learn/2022/responsive-web-design/", why: "A free, hands-on certification course in building web pages." },
    ],
  },
];

const GENERAL_RESOURCES: Resource[] = [
  { title: "GitHub Docs: Get Started", url: "https://docs.github.com/en/get-started", why: "Official guidance for working with repositories and pull requests." },
  { title: "freeCodeCamp", url: "https://www.freecodecamp.org/learn", why: "Free, self-paced courses across programming topics." },
  { title: "W3Schools", url: "https://www.w3schools.com/", why: "Quick, example-first references for many languages." },
  { title: "Pro Git (free book)", url: "https://git-scm.com/book/en/v2", why: "The complete, free reference for version control with Git." },
  { title: "Stack Overflow", url: "https://stackoverflow.com/", why: "Searchable answers to specific error messages and questions." },
];

/** At least five real free resources: technology matches first, general fill after. */
function freeResources(content: string, minimum = 5): Resource[] {
  const matched = RESOURCE_SETS.filter((set) => set.test.test(content)).flatMap((set) => set.resources);
  const seen = new Set(matched.map((r) => r.url));
  const filled = [...matched];
  for (const resource of GENERAL_RESOURCES) {
    if (filled.length >= minimum) break;
    if (!seen.has(resource.url)) {
      filled.push(resource);
      seen.add(resource.url);
    }
  }
  return filled;
}

// Domain-level (not company-specific) real-world application statements per
// technology. Broad and factual by construction, matching the LLM sheet's
// Real-World Applications requirement without asserting specifics.
const APPLICATION_SETS: Array<{ test: RegExp; applications: string[] }> = [
  {
    test: /\bpython\b|\bpandas\b|\bnumpy\b/i,
    applications: [
      "Python is the standard language of data science and machine learning, through libraries like pandas, NumPy, and scikit-learn.",
      "Web services and site backends are commonly built with Python frameworks such as Django and Flask.",
      "Python scripts automate everyday work like renaming files, filling spreadsheets, and generating reports.",
    ],
  },
  {
    test: /\bjavascript\b|\bnode(?:\.js)?\b|\breact\b/i,
    applications: [
      "JavaScript runs the interactive parts of virtually every website you visit.",
      "Frameworks like React power the interfaces of many major web applications.",
      "With Node.js, the same language also runs servers and command-line tools.",
    ],
  },
  {
    test: /\bsql\b|\bdatabase\b/i,
    applications: [
      "Nearly every application you use stores its data in a database queried with SQL.",
      "Reservation, banking, and inventory systems all depend on relational databases.",
      "Analysts across industries answer business questions by writing SQL queries.",
    ],
  },
  {
    test: /\bjava\b/i,
    applications: [
      "Android apps are traditionally written on the Java platform.",
      "Large enterprise systems in banking and insurance run on Java.",
      "Widely used server software, including many big-data tools, is written in Java.",
    ],
  },
];

/** Real application bullets for the detected technology, or null when none match. */
function realWorldApplications(content: string): string[] | null {
  const match = APPLICATION_SETS.find((set) => set.test.test(content));
  return match ? match.applications : null;
}

/** A general handout/document scaffold built from a freeform prompt. */
export function scaffoldDocument(prompt: string): string {
  const title = deriveTitle(prompt, "", "Course Document");
  const bullets = toBullets(prompt);
  const overview =
    capitalizeFirst(ensureSentence(summarize(prompt, 2))) ||
    capitalizeFirst(ensureSentence(prompt));
  const detailBullets = (
    bullets.length > 1 ? bullets : ["[Add the first key point here]", "[Add another key point here]"]
  )
    .map((b) => `- ${b}`)
    .join("\n");

  // A Key Terms section only when the prompt actually defines terms.
  const definitions = extractDefinitions(prompt, 6);
  const keyTermsSection =
    definitions.length > 0
      ? ["## Key Terms", definitions.map((d) => `- ${d.definition}`).join("\n")]
      : [];

  return [
    `# ${title}`,
    "## Overview",
    overview,
    "## Details",
    detailBullets,
    ...keyTermsSection,
    "## Summary",
    "Review the points above and add any specifics relevant to your course.",
  ].join("\n\n");
}

/**
 * A module-introduction document (markdown) built from an assignment's title and
 * source content. Mirrors the section structure of the LLM version.
 */
export function scaffoldModuleIntroDoc(displayTitle: string, content: string): string {
  const summary = summarizeObjectives(content);
  const contentSummary = content.trim() ? capitalizeFirst(ensureSentence(summarize(content, 1))) : "";
  const overview = [
    ensureSentence(`This module introduces ${displayTitle.toLowerCase()} and why it matters`),
    summary,
    contentSummary,
  ]
    .filter(Boolean)
    .join(" ");

  const applications = realWorldApplications(`${displayTitle}\n${content}`);
  return [
    `# Module Introduction: ${displayTitle}`,
    overview,
    "## Real-World Applications",
    applications
      ? applications.map((a) => `- ${a}`).join("\n")
      : "These concepts appear across real software and everyday technology. Add two or three concrete examples your students will recognize.",
    "## What You Will Learn",
    toBullets(content).slice(0, 5).map((b) => `- ${b}`).join("\n") || "- [List the key skills and concepts here]",
  ].join("\n\n");
}

/**
 * A student-facing assignment instruction sheet (markdown) built from an
 * assignment's title and README/source content.
 */
export function scaffoldAssignmentDoc(displayTitle: string, content: string): string {
  const instructionBullets =
    toBullets(content).slice(0, 8).map((b) => `- ${b}`).join("\n") ||
    "- [List each task the student must complete]";

  const resources = freeResources(`${displayTitle}\n${content}`)
    .map((r) => `- ${r.title} (${r.url}): ${r.why}`)
    .join("\n");

  return [
    `# ${displayTitle}`,
    "## Assignment Overview",
    ensureSentence(`This assignment covers ${displayTitle.toLowerCase()} and the objectives described in the source material`),
    "## Instructions",
    instructionBullets,
    "## Requirements",
    "- Meet each instruction listed above",
    "- Use only free, accessible tools",
    "## Helpful Free Resources",
    resources,
    "## Deliverables",
    "- Submit the up-to-date zip of the entire codebase with all completed files included",
  ].join("\n\n");
}
