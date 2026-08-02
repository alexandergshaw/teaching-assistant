import type JSZip from "jszip";

// Shared course-zip parsing. The zip-based course tools (rubric, "generate
// all" plans, and "generate one" module) all locate an assignments folder,
// enumerate its subfolders, and pull each one's lecture-relevant text the same
// way. These helpers are the single source of truth so every path reads a
// codebase zip identically.

export const ASSIGNMENTS_FOLDER_PATTERN =
  /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;

export const COURSE_TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c",
  ".h", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".r", ".sql",
  ".sh", ".yaml", ".yml", ".json", ".html", ".css", ".scss",
]);

export const ASSIGNMENT_MAX_FILE_CHARS = 3000;
export const ASSIGNMENT_MAX_TOTAL_CHARS = 12000;

export interface AssignmentContentBundle {
  name: string;
  content: string;
  readmeContent: string;
}

/** Locate the assignments folder in a course zip, including one wrapped level. */
export function findAssignmentsPrefix(allPaths: string[]): string {
  const topFolders = new Set<string>();
  for (const path of allPaths) {
    const m = path.match(/^([^/]+)\//);
    if (m) topFolders.add(m[1]);
  }
  for (const folder of topFolders) {
    if (ASSIGNMENTS_FOLDER_PATTERN.test(folder)) return folder + "/";
  }
  for (const path of allPaths) {
    const m = path.match(/^[^/]+\/([^/]+)\//);
    if (m && ASSIGNMENTS_FOLDER_PATTERN.test(m[1])) {
      const firstSlash = path.indexOf("/");
      const secondSlash = path.indexOf("/", firstSlash + 1);
      if (firstSlash !== -1 && secondSlash !== -1) {
        return path.slice(0, secondSlash + 1);
      }
    }
  }
  return "";
}

/** List assignment subfolder slugs in natural numeric order. */
export function listAssignmentFolders(allPaths: string[], prefix: string): string[] {
  const folders = new Set<string>();
  for (const path of allPaths) {
    if (path.startsWith(prefix)) {
      const parts = path.slice(prefix.length).split("/");
      if (parts.length >= 2 && parts[0]) folders.add(parts[0]);
    }
  }
  return Array.from(folders).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

/** Pull one assignment's lecture-relevant text within fixed context limits. */
export async function extractAssignmentContentBundle(
  zip: JSZip,
  allPaths: string[],
  prefix: string,
  folder: string
): Promise<AssignmentContentBundle | null> {
  const folderPrefix = prefix + folder + "/";
  const folderFiles = allPaths.filter((p) => p.startsWith(folderPrefix) && !zip.files[p].dir);

  const mdFiles = folderFiles.filter((p) => p.toLowerCase().endsWith(".md"));
  const testFiles = folderFiles.filter((p) => {
    const name = p.toLowerCase();
    return (name.includes("test") || name.includes("spec")) && !p.toLowerCase().endsWith(".md");
  });
  const otherFiles = folderFiles.filter((p) => {
    const ext = p.includes(".") ? "." + p.split(".").pop()!.toLowerCase() : "";
    const name = p.toLowerCase();
    return (
      COURSE_TEXT_EXTENSIONS.has(ext) &&
      !p.toLowerCase().endsWith(".md") &&
      !name.includes("test") &&
      !name.includes("spec")
    );
  });

  const orderedFiles = [...mdFiles, ...testFiles, ...otherFiles];
  let content = "";
  let totalChars = 0;

  for (const filePath of orderedFiles) {
    if (totalChars >= ASSIGNMENT_MAX_TOTAL_CHARS) break;
    const ext = filePath.includes(".") ? "." + filePath.split(".").pop()!.toLowerCase() : "";
    if (!COURSE_TEXT_EXTENSIONS.has(ext)) continue;

    try {
      let fileContent = await zip.files[filePath].async("string");
      const fileName = filePath.slice(folderPrefix.length);
      if (fileContent.length > ASSIGNMENT_MAX_FILE_CHARS) {
        fileContent = fileContent.slice(0, ASSIGNMENT_MAX_FILE_CHARS) + "\n\u2026 (truncated)";
      }
      content += `\n\n=== ${fileName} ===\n${fileContent}`;
      totalChars += fileContent.length;
    } catch {
      // Skip unreadable or binary files.
    }
  }

  if (!content.trim()) return null;

  const readmeFile =
    mdFiles.find((p) => p.slice(folderPrefix.length).toLowerCase().startsWith("readme")) ??
    mdFiles[0];
  let readmeContent = "";
  if (readmeFile) {
    try {
      readmeContent = await zip.files[readmeFile].async("string");
      if (readmeContent.length > ASSIGNMENT_MAX_FILE_CHARS) {
        readmeContent = readmeContent.slice(0, ASSIGNMENT_MAX_FILE_CHARS) + "\n\u2026 (truncated)";
      }
    } catch {
      // Fall back to the full content.
    }
  }

  return { name: folder, content, readmeContent: readmeContent || content };
}
