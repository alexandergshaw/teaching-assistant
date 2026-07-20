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

  // Find the export and inject the new leaf before the closing bracket
  const pattern = new RegExp(
    `(export\\s+const\\s+${topicExport}\\s*=\\s*\\[[\\s\\S]*?)\\];`,
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
