// Utilities for interacting with the programming concept visualizer
// (https://programming-concept-visualizer.vercel.app/).
// This module is importable from both server actions and tests - it must remain
// dependency-free (pure string logic + constants).

export const VISUALIZER_BASE_URL = "https://programming-concept-visualizer.vercel.app";
export const VISUALIZER_REPO = "alexandergshaw/programming-concept-visualizer";

export const TOPIC_ROUTES: Record<string, string> = {
  // Languages
  html: "/languages/html",
  javascript: "/languages/javascript",
  php: "/languages/php",
  python: "/languages/python",
  react: "/languages/react",
  sql: "/languages/sql",
  typescript: "/languages/typescript",
  // Skills
  cybersecurity: "/skills/cybersecurity",
  databases: "/skills/databases",
  "deploying-a-website": "/skills/deploying-a-website",
  github: "/skills/github",
  "programming-basics": "/skills/programming-basics",
  "project-management": "/skills/project-management",
  "software-testing": "/skills/software-testing",
  "website-management": "/skills/website-management",
};

/** Map kebab-case topic keys to camelCase export names (e.g. 'programming-basics' -> 'programmingBasicsNavItems') */
export const TOPIC_TO_EXPORT_MAP: Record<string, string> = {
  html: "htmlNavItems",
  javascript: "javascriptNavItems",
  php: "phpNavItems",
  python: "pythonNavItems",
  react: "reactNavItems",
  sql: "sqlNavItems",
  typescript: "typeScriptNavItems",
  cybersecurity: "cybersecurityNavItems",
  databases: "databasesNavItems",
  "deploying-a-website": "deployingAWebsiteNavItems",
  github: "gitHubNavItems",
  "programming-basics": "programmingBasicsNavItems",
  "project-management": "projectManagementNavItems",
  "software-testing": "softwareTestingNavItems",
  "website-management": "websiteManagementNavItems",
};

/** Map kebab-case topic keys to PascalCase directory names (e.g. 'programming-basics' -> 'ProgrammingBasics') */
export const TOPIC_TO_DIR_MAP: Record<string, string> = {
  html: "HTML",
  javascript: "JavaScript",
  php: "PHP",
  python: "Python",
  react: "React",
  sql: "SQL",
  typescript: "TypeScript",
  cybersecurity: "Cybersecurity",
  databases: "Databases",
  "deploying-a-website": "DeployingAWebsite",
  github: "GitHub",
  "programming-basics": "ProgrammingBasics",
  "project-management": "ProjectManagement",
  "software-testing": "SoftwareTesting",
  "website-management": "WebsiteManagement",
};

/**
 * Single source of truth for a topic's real shape in the visualizer repo -
 * its route, nav export, concept directory, the page file that renders it,
 * the import prefix that page uses for concept components, and whether it
 * can actually receive a new concept.
 *
 * Verified against the live repo (alexandergshaw/programming-concept-visualizer)
 * on 2026-07-27, by listing components/pageComponents through the GitHub
 * contents API and fetching the actual route files - NOT by trusting
 * TOPIC_TO_DIR_MAP:
 * - Ten topics have a working `<Dir>/<Dir>Page.tsx` (or, for the "deploying
 *   a website" stub below, `<Dir>/<Dir>.tsx`) with a real switch/case and a
 *   nav array in navItems.ts - those ten are `creatable: true`.
 * - Five topics (html, php, typescript, deploying-a-website, github) are
 *   UnderConstruction stubs: no nav array, no switch, no default case. A
 *   concept cannot be routed to one of them.
 * - SQL is the one exception among the creatable ten: the page actually
 *   rendered at /languages/sql is the TOP-LEVEL components/pageComponents/SqlPage.tsx
 *   (there is no SQL/SQLPage.tsx), and it imports its concept components
 *   from "./SQL/...", not "./...".
 * - "deploying-a-website" is a second trap: its directory and page file are
 *   named DeployingPage/DeployingPage.tsx (confirmed via
 *   src/app/skills/deploying-a-website/page.tsx's own import), NOT
 *   DeployingAWebsite/DeployingAWebsitePage.tsx - the value TOPIC_TO_DIR_MAP
 *   would suggest. That map's own staleness is the reason this table exists
 *   at all, so this one entry is written as a literal rather than derived
 *   from TOPIC_TO_DIR_MAP.
 *
 * TOPIC_TO_DIR_MAP is retained ONLY for backward compatibility (existing
 * callers/tests) and must NEVER be treated as the source of truth for a page
 * path - use topicByKey()/creatableTopics() (or VISUALIZER_TOPICS directly)
 * for that instead.
 */
export interface VisualizerTopic {
  key: string;
  route: string;
  navExport: string;
  /** Directory holding this topic's concept components (and, for every
   * creatable topic except SQL, also holding the page file itself). */
  conceptDir: string;
  /** Path (repo-relative) to the page component that renders this topic. */
  pagePath: string;
  /** Import prefix that page uses to pull in concept components. */
  conceptImportPrefix: string;
  /** False for the five UnderConstruction stub topics - no nav array, no
   * switch/case, so a new concept cannot be routed there. */
  creatable: boolean;
}

function dirPagePath(dir: string): string {
  return `components/pageComponents/${dir}/${dir}Page.tsx`;
}

function topLevelPagePath(name: string): string {
  return `components/pageComponents/${name}Page.tsx`;
}

export const VISUALIZER_TOPICS: VisualizerTopic[] = [
  // Languages
  {
    key: "html",
    route: TOPIC_ROUTES.html,
    navExport: TOPIC_TO_EXPORT_MAP.html,
    conceptDir: TOPIC_TO_DIR_MAP.html,
    pagePath: topLevelPagePath("Html"),
    conceptImportPrefix: "./",
    creatable: false,
  },
  {
    key: "javascript",
    route: TOPIC_ROUTES.javascript,
    navExport: TOPIC_TO_EXPORT_MAP.javascript,
    conceptDir: TOPIC_TO_DIR_MAP.javascript,
    pagePath: dirPagePath(TOPIC_TO_DIR_MAP.javascript),
    conceptImportPrefix: "./",
    creatable: true,
  },
  {
    key: "php",
    route: TOPIC_ROUTES.php,
    navExport: TOPIC_TO_EXPORT_MAP.php,
    conceptDir: TOPIC_TO_DIR_MAP.php,
    pagePath: topLevelPagePath("Php"),
    conceptImportPrefix: "./",
    creatable: false,
  },
  {
    key: "python",
    route: TOPIC_ROUTES.python,
    navExport: TOPIC_TO_EXPORT_MAP.python,
    conceptDir: TOPIC_TO_DIR_MAP.python,
    pagePath: dirPagePath(TOPIC_TO_DIR_MAP.python),
    conceptImportPrefix: "./",
    creatable: true,
  },
  {
    key: "react",
    route: TOPIC_ROUTES.react,
    navExport: TOPIC_TO_EXPORT_MAP.react,
    conceptDir: TOPIC_TO_DIR_MAP.react,
    pagePath: dirPagePath(TOPIC_TO_DIR_MAP.react),
    conceptImportPrefix: "./",
    creatable: true,
  },
  {
    key: "sql",
    route: TOPIC_ROUTES.sql,
    navExport: TOPIC_TO_EXPORT_MAP.sql,
    conceptDir: TOPIC_TO_DIR_MAP.sql,
    // The odd one out: SqlPage.tsx lives at the TOP LEVEL (there is no
    // SQL/SQLPage.tsx), but its concept components still live in ./SQL/.
    pagePath: topLevelPagePath("Sql"),
    conceptImportPrefix: "./SQL/",
    creatable: true,
  },
  {
    key: "typescript",
    route: TOPIC_ROUTES.typescript,
    navExport: TOPIC_TO_EXPORT_MAP.typescript,
    conceptDir: TOPIC_TO_DIR_MAP.typescript,
    pagePath: topLevelPagePath("TypeScript"),
    conceptImportPrefix: "./",
    creatable: false,
  },
  // Skills
  {
    key: "cybersecurity",
    route: TOPIC_ROUTES.cybersecurity,
    navExport: TOPIC_TO_EXPORT_MAP.cybersecurity,
    conceptDir: TOPIC_TO_DIR_MAP.cybersecurity,
    pagePath: dirPagePath(TOPIC_TO_DIR_MAP.cybersecurity),
    conceptImportPrefix: "./",
    creatable: true,
  },
  {
    key: "databases",
    route: TOPIC_ROUTES.databases,
    navExport: TOPIC_TO_EXPORT_MAP.databases,
    conceptDir: TOPIC_TO_DIR_MAP.databases,
    pagePath: dirPagePath(TOPIC_TO_DIR_MAP.databases),
    conceptImportPrefix: "./",
    creatable: true,
  },
  {
    key: "deploying-a-website",
    route: TOPIC_ROUTES["deploying-a-website"],
    navExport: TOPIC_TO_EXPORT_MAP["deploying-a-website"],
    // Deliberately NOT derived from TOPIC_TO_DIR_MAP (which holds the stale
    // "DeployingAWebsite") - the real directory and page file are named
    // DeployingPage/DeployingPage.tsx, verified against the live repo and
    // against src/app/skills/deploying-a-website/page.tsx's own import.
    conceptDir: "DeployingPage",
    pagePath: "components/pageComponents/DeployingPage/DeployingPage.tsx",
    conceptImportPrefix: "./",
    creatable: false,
  },
  {
    key: "github",
    route: TOPIC_ROUTES.github,
    navExport: TOPIC_TO_EXPORT_MAP.github,
    conceptDir: TOPIC_TO_DIR_MAP.github,
    pagePath: dirPagePath(TOPIC_TO_DIR_MAP.github),
    conceptImportPrefix: "./",
    creatable: false,
  },
  {
    key: "programming-basics",
    route: TOPIC_ROUTES["programming-basics"],
    navExport: TOPIC_TO_EXPORT_MAP["programming-basics"],
    conceptDir: TOPIC_TO_DIR_MAP["programming-basics"],
    pagePath: dirPagePath(TOPIC_TO_DIR_MAP["programming-basics"]),
    conceptImportPrefix: "./",
    creatable: true,
  },
  {
    key: "project-management",
    route: TOPIC_ROUTES["project-management"],
    navExport: TOPIC_TO_EXPORT_MAP["project-management"],
    conceptDir: TOPIC_TO_DIR_MAP["project-management"],
    pagePath: dirPagePath(TOPIC_TO_DIR_MAP["project-management"]),
    conceptImportPrefix: "./",
    creatable: true,
  },
  {
    key: "software-testing",
    route: TOPIC_ROUTES["software-testing"],
    navExport: TOPIC_TO_EXPORT_MAP["software-testing"],
    conceptDir: TOPIC_TO_DIR_MAP["software-testing"],
    pagePath: dirPagePath(TOPIC_TO_DIR_MAP["software-testing"]),
    conceptImportPrefix: "./",
    creatable: true,
  },
  {
    key: "website-management",
    route: TOPIC_ROUTES["website-management"],
    navExport: TOPIC_TO_EXPORT_MAP["website-management"],
    conceptDir: TOPIC_TO_DIR_MAP["website-management"],
    pagePath: dirPagePath(TOPIC_TO_DIR_MAP["website-management"]),
    conceptImportPrefix: "./",
    creatable: true,
  },
];

/** The topics that can actually receive a new concept (excludes the five
 * UnderConstruction stubs). */
export function creatableTopics(): VisualizerTopic[] {
  return VISUALIZER_TOPICS.filter((t) => t.creatable);
}

/** Look up a topic by its kebab-case key. */
export function topicByKey(key: string): VisualizerTopic | undefined {
  return VISUALIZER_TOPICS.find((t) => t.key === key);
}

/** Normalize a concept key: lowercase, collapse non-alphanumerics to nothing. */
export function normalizeConceptKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Parse navItems.ts source text and return metadata for each nav leaf.
 * Looks for patterns like:
 *   export const pythonNavItems = [{ label: "...", value: "..." }, ...]
 *   export const pythonNavItems: SidebarItem[] = [{ label: "...", value: "..." }, ...]
 */
export function parseNavItems(
  source: string
): Array<{ topicExport: string; label: string; value: string }> {
  const results: Array<{ topicExport: string; label: string; value: string }> = [];

  // Match each export const declaration (with optional TypeScript type annotation)
  const exportPattern =
    /export\s+const\s+(\w+)(?:\s*:\s*[^=]*)?\s*=\s*\[([\s\S]*?)\];/g;
  let exportMatch: RegExpExecArray | null;

  while ((exportMatch = exportPattern.exec(source)) !== null) {
    const topicExport = exportMatch[1];
    const arrayBody = exportMatch[2];

    // Match each object in the array
    const objectPattern = /\{\s*label:\s*["']([^"']*)["'],\s*value:\s*["']([^"']*)["']\s*\}/g;
    let objMatch: RegExpExecArray | null;

    while ((objMatch = objectPattern.exec(arrayBody)) !== null) {
      results.push({
        topicExport,
        label: objMatch[1],
        value: objMatch[2],
      });
    }
  }

  return results;
}

/** Build the URL for a concept page on the visualizer. */
export function conceptUrl(topicRoute: string, slug: string): string {
  const encoded = encodeURIComponent(slug);
  return `${VISUALIZER_BASE_URL}${topicRoute}?concept=${encoded}`;
}

/**
 * Find a concept in the parsed nav items.
 * Matches on normalized value or label (case-insensitive, space-insensitive).
 * Returns the first match or null.
 */
export function matchConcept(
  entries: Array<{ topicExport: string; label: string; value: string }>,
  concept: string
): (typeof entries)[number] | null {
  const normalized = normalizeConceptKey(concept);
  for (const entry of entries) {
    if (
      normalizeConceptKey(entry.value) === normalized ||
      normalizeConceptKey(entry.label) === normalized
    ) {
      return entry;
    }
  }
  return null;
}

/**
 * Insert a new nav leaf into navItems.ts source.
 * Adds `{ label, value }` to the specified topicExport array.
 * Returns modified source or null if topicExport not found or slug already present.
 */
export function insertNavLeaf(
  source: string,
  topicExport: string,
  label: string,
  value: string
): string | null {
  // Check if the slug already exists in any topic export
  const allItems = parseNavItems(source);
  if (matchConcept(allItems, value)) {
    return null; // Already present
  }

  // Find the export and inject the new leaf before the closing bracket.
  // The optional `(?:\s*:\s*[^=]*)?` mirrors parseNavItems: every real export
  // in the visualizer's navItems.ts carries a TypeScript type annotation
  // (`export const pythonNavItems: SidebarItem[] = [...]`), and without this
  // allowance the pattern matches nothing - insertNavLeaf always returned
  // null, so createVisualizerConceptAction could never actually update
  // navItems.ts.
  const pattern = new RegExp(
    `(export\\s+const\\s+${topicExport}(?:\\s*:\\s*[^=]*)?\\s*=\\s*\\[[\\s\\S]*?)\\];`,
    "g"
  );

  let found = false;
  const result = source.replace(pattern, (match) => {
    found = true;
    const newEntry = `  { label: "${label}", value: "${value}" }`;
    // Insert before the closing bracket, with a comma if there are existing entries
    const trimmedMatch = match.replace(/\];$/, "");
    const hasEntries = trimmedMatch.includes("{");
    return trimmedMatch + (hasEntries ? ",\n" : "\n") + newEntry + "\n];";
  });

  return found ? result : null;
}

/**
 * Add an import and case statement to a <Topic>Page.tsx.
 * Inserts the import after the last import line and adds the case before the default case.
 * Returns modified source or null if topic export not found or slug already present.
 */
export function insertTopicPageCase(
  source: string,
  componentName: string,
  slug: string,
  importPath: string
): string | null {
  // Check if the case already exists
  if (new RegExp(`case\\s+['"]${slug}['"]\\s*:`).test(source)) {
    return null; // Case already present
  }

  // Add import after the last import
  let result = source;
  const importLine = `import ${componentName} from "${importPath}";\n`;
  const lastImportMatch = source.match(/^(import\s+.*?[;\n])\s*(?=\n[^i])/m);
  if (lastImportMatch) {
    result = result.replace(lastImportMatch[1], lastImportMatch[1] + "\n" + importLine);
  } else {
    // No existing imports found, add at the top
    result = importLine + result;
  }

  // Add case before default (which is just "default:", not "case 'default':")
  const caseStatement = `    case "${slug}":\n      return <${componentName} />;\n`;
  const defaultMatch = result.match(/(\s+default:\n)/);
  if (defaultMatch) {
    result = result.replace(defaultMatch[1], caseStatement + defaultMatch[1]);
  } else {
    // If no default case found, add before the closing brace of the switch
    const switchEndMatch = result.match(/(\s+}\s*\}\s*$)/m);
    if (switchEndMatch) {
      result = result.replace(switchEndMatch[1], caseStatement + switchEndMatch[1]);
    }
  }

  return result;
}
