"use server";

import type { ScheduleWeekPlan } from "../actions-types";
import type { RepoTreeEntry } from "@/lib/github";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { getAccessibilityItem, saveAccessibilityItemHtml } from "@/lib/canvas-modules";
import { downloadRepoZipball, getRepoTree, parseRepoRef, putFile, getFileText } from "@/lib/github";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown";
import { requireOwner } from "@/lib/supabase/auth";
import { assignmentSlug, extractAssignmentContentBundle, extractJsonObject, findAssignmentsPrefix, listAssignmentFolders } from "./shared";
import type { AssignmentContentBundle } from "./shared";


/**
 * Generate a course schedule from a repository's actual assignment structure,
 * deriving week plan and test distribution from the found assignment folders.
 * Returns a courseTitle and the structured week plan used by workflows.
 */
export async function generateSchedulePlanFromRepoAction(
  repoRef: string,
  weeks: number | null,
  tests: number | null,
  provider: LlmProvider = "gemini",
  courseDescription?: string
): Promise<{ courseTitle: string; schedule: ScheduleWeekPlan[] } | { error: string }> {
  try {
    await requireOwner();

    // Parse and validate repo reference
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const { owner, repo } = parsed;

    // Download and load the repo zipball
    const buffer = await downloadRepoZipball(owner, repo);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const allPaths = Object.keys(zip.files);

    // Find assignment folders
    const prefix = findAssignmentsPrefix(allPaths);
    if (!prefix) {
      return { error: "No assignment folders found in the repository." };
    }

    const folders = listAssignmentFolders(allPaths, prefix);
    if (folders.length === 0) {
      return { error: "No assignment folders found in the repository." };
    }

    // Extract content bundles for each folder
    const bundles: (AssignmentContentBundle | null)[] = [];
    for (const folder of folders) {
      const bundle = await extractAssignmentContentBundle(zip, allPaths, prefix, folder);
      bundles.push(bundle);
    }

    // Filter out null bundles
    const validBundles = bundles.filter((b) => b !== null) as AssignmentContentBundle[];
    if (validBundles.length === 0) {
      return { error: "No assignment folders found in the repository." };
    }

    // Read README.md if present (under the prefix wrapper)
    let readmeContent = "";
    const readmeFiles = allPaths.filter(
      (p) => p.startsWith(prefix) && p.toLowerCase().endsWith("readme.md")
    );
    if (readmeFiles.length > 0) {
      try {
        const readmeFile = readmeFiles[0];
        let content = await zip.files[readmeFile].async("string");
        if (content.length > 4000) {
          content = content.slice(0, 4000) + "\n... (truncated)";
        }
        readmeContent = content;
      } catch {
        // skip unreadable README
      }
    }

    // Derive week and test counts
    const folderCount = validBundles.length;
    const weekCount = Number.isInteger(weeks) && weeks !== null && weeks > 0 && weeks <= 52
      ? Math.min(weeks, 52)
      : folderCount;
    const testCount = Number.isInteger(tests) && tests !== null && tests >= 0 && tests <= weekCount
      ? tests
      : 0;

    // Build per-folder digest strings (truncated to ~2000 chars each)
    const folderDigests: string[] = [];
    for (const bundle of validBundles) {
      let digest = `Folder: ${bundle.name}\n`;
      let contentSlice = bundle.content;
      if (contentSlice.length > 2000) {
        contentSlice = contentSlice.slice(0, 2000) + "\n... (truncated)";
      }
      digest += contentSlice;
      folderDigests.push(digest);
    }

    // Build the prompt
    const prompt = `You are an expert curriculum designer. Given a repository's assignment folders with their content, plus the README, produce a JSON object ONLY (no markdown fences) with:
- "courseTitle": a clear, concise title for the course
- "weeks": an array with exactly ${weekCount} week objects, each with:
  - "week": 1-based week number
  - "topic": short topic name
  - "summary": 1-2 sentence description
  - "assignmentTitle": string or null (null only for review/test weeks)
  - "assignmentSlug": kebab-case slug matching the folder name exactly, or null
  - "testName": string like "Test 1" or null

Requirements:
- Each of the ${folderCount} assignment folders must appear as exactly ONE week's assignment IN ORDER, with assignmentSlug set to its folder name.
- Distribute exactly ${testCount} tests evenly (place final test in week ${weekCount} if testCount > 0).
- Weeks beyond folder count should have review/consolidation topics with null assignment and null test.
- Every non-test week must have an assignment.
- Topics should progress from foundational to advanced.
${courseDescription ? `- Topics and summaries should align with the course description provided below.` : ""}

${courseDescription ? `COURSE DESCRIPTION (context from the instructor):
${courseDescription.length > 2000 ? courseDescription.slice(0, 2000) + "\n... (truncated)" : courseDescription}

` : ""}Repository README:
${readmeContent}

Assignment folders and their content:
${folderDigests.join("\n\n---\n\n")}`;

    const r = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!r.ok) return { error: "The model returned no schedule." };

    const parsedPlan = extractJsonObject(r.text);
    if (!parsedPlan || typeof parsedPlan !== "object") {
      return { error: "Could not parse the generated schedule. Try again." };
    }

    // Extract and validate weeks array
    const weeksArray = parsedPlan.weeks;
    if (!Array.isArray(weeksArray)) {
      return { error: "Could not parse the generated schedule. Try again." };
    }

    if (weeksArray.length < weekCount) {
      return { error: "The model returned the wrong number of weeks. Try again." };
    }

    // Trim to exact count if extras exist
    const schedule: ScheduleWeekPlan[] = weeksArray.slice(0, weekCount).map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) {
        return {
          week: 0,
          topic: "",
          summary: "",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        };
      }
      const e = entry as Record<string, unknown>;
      return {
        week: Number(e.week) || 0,
        topic: typeof e.topic === "string" ? e.topic.trim() : "",
        summary: typeof e.summary === "string" ? e.summary.trim() : "",
        assignmentTitle: typeof e.assignmentTitle === "string" ? e.assignmentTitle.trim() : null,
        assignmentSlug: typeof e.assignmentSlug === "string" ? e.assignmentSlug.trim() : null,
        testName: typeof e.testName === "string" ? e.testName.trim() : null,
      };
    });

    // Derive courseTitle with fallback (repo name)
    let courseTitle = "";
    if (typeof parsedPlan.courseTitle === "string") {
      courseTitle = parsedPlan.courseTitle.trim();
    }
    if (!courseTitle) {
      courseTitle = repo.charAt(0).toUpperCase() + repo.slice(1);
    }

    return { courseTitle, schedule };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the schedule from the repository." };
  }
}

/**
 * Generate and write assignment README.md files based on a course schedule.
 * Creates one README per assignment in the course, with objectives, directions, deliverables, and submission instructions.
 */
export async function fillAssignmentReadmesAction(
  repoRef: string,
  schedule: ScheduleWeekPlan[],
  courseDescription: string,
  provider: LlmProvider = "gemini",
  context?: string
): Promise<{ written: string[]; repoUrl: string } | { error: string }> {
  try {
    await requireOwner();

    // Parse and validate repo reference
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const { owner, repo } = parsed;

    // Collect assignments (non-null assignmentTitle, sorted by week)
    const assignments = schedule
      .filter((w) => w.assignmentTitle !== null)
      .sort((a, b) => a.week - b.week);

    if (assignments.length === 0) {
      return { error: "The schedule contains no assignments to document." };
    }

    // Fetch repo tree
    let allPaths: string[] = [];
    try {
      const tree = await getRepoTree(owner, repo);
      allPaths = tree.map((e: RepoTreeEntry) => e.path);
    } catch {
      allPaths = [];
    }

    // Determine assignments folder prefix using the same logic as findAssignmentsPrefix
    const candidatePattern = /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;
    let prefix = "";
    const topFolders = new Set<string>();
    for (const path of allPaths) {
      const m = path.match(/^([^/]+)\//);
      if (m) topFolders.add(m[1]);
    }
    for (const folder of topFolders) {
      if (candidatePattern.test(folder)) {
        prefix = folder + "/";
        break;
      }
    }
    if (!prefix) {
      for (const path of allPaths) {
        const m = path.match(/^[^/]+\/([^/]+)\//);
        if (m && candidatePattern.test(m[1])) {
          const firstSlash = path.indexOf("/");
          const secondSlash = path.indexOf("/", firstSlash + 1);
          if (firstSlash !== -1 && secondSlash !== -1) {
            prefix = path.slice(0, secondSlash + 1);
            break;
          }
        }
      }
    }
    if (!prefix) prefix = "assignments/";

    // Extract existing assignment folders (unique sorted second-level folder names)
    const existingFolders = new Set<string>();
    for (const path of allPaths) {
      if (path.startsWith(prefix)) {
        const parts = path.slice(prefix.length).split("/");
        if (parts.length >= 2 && parts[0]) existingFolders.add(parts[0]);
      }
    }
    const existingList = Array.from(existingFolders).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    // Helper to sanitize slug
    const sanitizeSlug = (slug: string): string => {
      return slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    };

    // Build target folder for each assignment
    const assignmentFolders: Array<{ week: number; folder: string; title: string; topic: string; summary: string }> = [];
    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      let folder: string;
      if (i < existingList.length) {
        folder = existingList[i];
      } else {
        const slug = a.assignmentSlug ? sanitizeSlug(a.assignmentSlug) : "assignment";
        folder = `week-${String(a.week).padStart(2, "0")}-${slug}`;
      }
      assignmentFolders.push({
        week: a.week,
        folder,
        title: a.assignmentTitle || "",
        topic: a.topic,
        summary: a.summary,
      });
    }

    // Call LLM once to generate all READMEs
    const assignmentsList = assignmentFolders
      .map((a) => `Week ${a.week}: "${a.title}" (${a.topic}) - ${a.summary}`)
      .join("\n");

    let llmPrompt = `You are an instructor creating assignment documentation. Generate GitHub-flavored markdown README.md files for these assignments.

Course description: ${courseDescription}

Assignments:
${assignmentsList}`;

    if (context?.trim()) {
      llmPrompt += `

Additional instructor context (follow where applicable):
${context.trim()}`;
    }

    llmPrompt += `

Return ONLY a JSON array with one object per assignment, in the same order:
[
  {
    "week": number,
    "readme": "complete markdown with H1 title, overview paragraph, ## Objectives (bullets), ## Directions (numbered steps), ## Deliverables (bullets), ## Submission (paragraph). 200-400 words. No emojis."
  },
  ...
]`;

    const llmRes = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!llmRes.ok) return { error: "The model returned no directions." };

    const readmesRaw = parseLenientJsonArray(llmRes.text);
    if (!readmesRaw || !Array.isArray(readmesRaw)) {
      return { error: "Could not parse the generated directions. Try again." };
    }

    // Map by array order, skip extras
    const readmesMap = new Map<number, string>();
    readmesRaw.forEach((item: unknown, idx: number) => {
      if (idx < assignmentFolders.length && typeof item === "object" && item !== null) {
        const i = item as Record<string, unknown>;
        if (typeof i.readme === "string") {
          readmesMap.set(idx, i.readme);
        }
      }
    });

    // Write each assignment README
    const written: string[] = [];
    for (let i = 0; i < assignmentFolders.length; i++) {
      const a = assignmentFolders[i];
      const readme = readmesMap.get(i);
      if (!readme) continue;

      const filePath = `${prefix}${a.folder}/README.md`;
      try {
        await putFile(owner, repo, filePath, readme, `Add assignment directions: ${a.title}`);
        written.push(filePath);
      } catch {
        // Continue on individual write failures
      }
    }

    if (written.length === 0) {
      return { error: "No README files could be written to the repository." };
    }

    return { written, repoUrl: `https://github.com/${owner}/${repo}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fill assignment directions." };
  }
}

function parseAssignmentRef(
  assignmentUrl: string,
  repoRef: string
): { assignmentId: string; owner: string; repo: string } | { error: string } {
  const assignmentId = assignmentUrl.match(/\/assignments\/(\d+)/)?.[1];
  if (!assignmentId) return { error: "Paste a Canvas assignment URL (…/courses/<id>/assignments/<id>)." };
  const parsed = parseRepoRef(repoRef);
  if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
  return { assignmentId, owner: parsed.owner, repo: parsed.repo };
}

/** Load both sides of an assignment's instructions (Canvas + repo file) for review. */
export async function getAssignmentSyncStateAction(
  assignmentUrl: string,
  repoRef: string,
  path: string,
  acronym?: string,
  branch?: string
): Promise<
  { title: string; canvasMarkdown: string; repoMarkdown: string | null; path: string } | { error: string }
> {
  try {
    await requireOwner();
    const ref = parseAssignmentRef(assignmentUrl, repoRef);
    if ("error" in ref) return ref;
    const item = await getAccessibilityItem(assignmentUrl, "assignment", ref.assignmentId, acronym);
    if (!item) return { error: "Could not load that Canvas assignment." };
    const resolvedPath = path.trim() || `assignments/${assignmentSlug(item.title)}/README.md`;
    let repoMarkdown: string | null = null;
    try {
      repoMarkdown = await getFileText(ref.owner, ref.repo, resolvedPath, branch);
    } catch {
      repoMarkdown = null; // file not there yet
    }
    return { title: item.title, canvasMarkdown: htmlToMarkdown(item.html), repoMarkdown, path: resolvedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the assignment." };
  }
}

/** Push Canvas assignment instructions into the repo file (as Markdown). */
export async function syncAssignmentToRepoAction(
  assignmentUrl: string,
  repoRef: string,
  path: string,
  acronym?: string,
  branch?: string
): Promise<{ ok: true; path: string } | { error: string }> {
  try {
    await requireOwner();
    const ref = parseAssignmentRef(assignmentUrl, repoRef);
    if ("error" in ref) return ref;
    const item = await getAccessibilityItem(assignmentUrl, "assignment", ref.assignmentId, acronym);
    if (!item) return { error: "Could not load that Canvas assignment." };
    const resolvedPath = path.trim() || `assignments/${assignmentSlug(item.title)}/README.md`;
    const markdown = `# ${item.title}\n\n${htmlToMarkdown(item.html)}\n`;
    await putFile(ref.owner, ref.repo, resolvedPath, markdown, `Sync "${item.title}" instructions from Canvas`, branch);
    return { ok: true, path: resolvedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not write to the repository." };
  }
}

/** Pull the repo file (Markdown) into the Canvas assignment description (as HTML). */
export async function syncAssignmentFromRepoAction(
  assignmentUrl: string,
  repoRef: string,
  path: string,
  acronym?: string,
  branch?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const ref = parseAssignmentRef(assignmentUrl, repoRef);
    if ("error" in ref) return ref;
    if (!path.trim()) return { error: "Specify the repo file path to pull from." };
    let markdown: string;
    try {
      markdown = await getFileText(ref.owner, ref.repo, path.trim(), branch);
    } catch {
      return { error: "That file wasn't found in the repository." };
    }
    await saveAccessibilityItemHtml(assignmentUrl, "assignment", ref.assignmentId, markdownToHtml(markdown), acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the Canvas assignment." };
  }
}
