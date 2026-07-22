// Pure LMS detection and metadata extraction from submission archives.
// Fingerprints entries by LMS pattern to detect course/assignment/points/rubric.
// Cartridge archives (.imscc) reuse parseCartridgeBlob for title/rubrics/points.

import { parseCartridgeBlob } from "@/lib/cartridge-import";

export interface SniffResult {
  lms?: "canvas" | "brightspace" | "blackboard" | "moodle";
  courseLabel?: string;
  assignmentLabel?: string;
  pointsPossible?: number;
  rubricText?: string;
  notes: string[];
}

export interface SniffMergeInput {
  courseLabel: string;
  assignmentLabel: string;
  pointsPossible: string;
  rubricText: string;
  lms: "canvas" | "brightspace" | "blackboard" | "moodle";
  lmsChosen: boolean;
}

export interface SniffMergeOutput {
  courseLabel: string;
  assignmentLabel: string;
  pointsPossible: number | null;
  rubricText: string | null;
  lms: "canvas" | "brightspace" | "blackboard" | "moodle";
}

export interface ArchiveEntry {
  name: string;
  dir: boolean;
}

// Serializes a CartridgeRubric to readable text format for display.
// Format: criterion description (points), then one rating per line.
function serializeRubric(rubric: {
  title: string;
  criteria: Array<{
    description: string;
    points: number;
    ratings: Array<{ description: string; points: number }>;
  }>;
}): string {
  const lines: string[] = [`${rubric.title}`];
  for (const criterion of rubric.criteria) {
    lines.push(`  ${criterion.description} (${criterion.points}pt)`);
    for (const rating of criterion.ratings) {
      lines.push(`    - ${rating.description}: ${rating.points}pt`);
    }
  }
  return lines.join("\n");
}

/**
 * Merges sniffed values into current form values using the empty-only rule:
 * user-typed values win; sniff fills blanks; lms gated on lmsChosen.
 * Returns effective values ready for submission.
 */
export function mergeSniffedValues(
  current: SniffMergeInput,
  sniff: SniffResult
): SniffMergeOutput {
  // User value wins; sniff fills blanks
  const effCourseLabel = current.courseLabel || sniff.courseLabel || "";
  const effAssignmentLabel = current.assignmentLabel || sniff.assignmentLabel || "";
  const effPointsPossible = current.pointsPossible
    ? Number(current.pointsPossible)
    : sniff.pointsPossible ?? null;
  const effRubricText = current.rubricText || sniff.rubricText || null;

  // Gate lms prefill: only apply if user hasn't chosen this session
  let effLms = current.lms;
  if (!current.lmsChosen && sniff.lms) {
    effLms = sniff.lms;
  }

  return {
    courseLabel: effCourseLabel,
    assignmentLabel: effAssignmentLabel,
    pointsPossible: effPointsPossible,
    rubricText: effRubricText,
    lms: effLms,
  };
}

// Counts Moodle submission pattern: entries containing "_assignsubmission_"
function countMoodlePattern(entries: ArchiveEntry[]): number {
  return entries.filter((e) => e.name.includes("_assignsubmission_")).length;
}

// Counts Canvas bulk export pattern matches: entries matching <name>_<digits>_<digits>_<rest>
function countCanvasPattern(entries: ArchiveEntry[]): number {
  const canvasPattern = /_\d+_\d+_/;
  const files = entries.filter((e) => !e.dir);
  if (files.length === 0) return 0;
  return files.filter((e) => canvasPattern.test(e.name)).length;
}

// Counts Brightspace folder pattern: <digits>-<digits> - <name> - <date>
function countBrightspacePattern(entries: ArchiveEntry[]): number {
  const brightspacePattern = /^\d+-\d+\s+-\s+.+\s+-\s+\d{4}-\d{2}-\d{2}/;
  return entries.filter((e) => e.dir && brightspacePattern.test(e.name)).length;
}

// Counts Blackboard gradebook export: entries starting with "gradebook_"
function countBlackboardPattern(entries: ArchiveEntry[]): number {
  return entries.filter((e) => e.name.startsWith("gradebook_")).length;
}

// Extracts course and assignment labels from Blackboard gradebook filename.
// Pattern: gradebook_<course>_<column>_...
// Returns [courseLabel, assignmentLabel] or [null, null] if pattern doesn't match
function extractBlackboardLabels(filename: string): [string | null, string | null] {
  // Remove .txt extension if present
  const base = filename.replace(/\.txt$/, "");
  const parts = base.split("_");
  if (parts.length < 4 || parts[0] !== "gradebook") {
    return [null, null];
  }
  const course = parts[1] || null;
  const column = parts[2] || null;
  return [course, column];
}

// Determines if a filename is generic and should be suppressed as assignmentLabel fallback
function isGenericName(name: string): boolean {
  const base = name.toLowerCase().replace(/\.[^.]+$/, "");
  return ["submissions", "archive", "download", "export", "empty"].includes(base);
}

/**
 * Pure function to detect LMS and extract metadata from submission archive entries.
 * Best-effort detection: when multiple patterns match, cartridge wins; otherwise majority pattern wins.
 * assignmentLabel falls back to uploadFileName basename when not a generic name.
 * Cartridge support reuses parseCartridgeBlob and parseRubrics.
 *
 * @param entries - Array of archive entries with name and dir flag
 * @param uploadFileName - Original filename of the archive (used for fallback assignment label)
 * @param textOf - Optional async function to read file contents by name (for Blackboard txt reading)
 * @returns SniffResult with optional metadata fields and explanatory notes
 */
export async function sniffEntries(
  entries: ArchiveEntry[],
  uploadFileName: string,
  textOf?: (name: string) => Promise<string | null>
): Promise<SniffResult> {
  const notes: string[] = [];
  const result: SniffResult = { notes };

  // Check for cartridge first (imsmanifest.xml or Canvas course_settings/)
  const hasCartridge =
    entries.some((e) => e.name === "imsmanifest.xml") ||
    entries.some((e) => e.name.startsWith("course_settings/"));

  if (hasCartridge) {
    // Return early - caller will handle cartridge parsing via parseCartridgeBlob
    notes.push("Cartridge archive detected");
    result.lms = "canvas";
    return result;
  }

  // Detect LMS by fingerprint pattern: count matches for majority rule
  const moodleCount = countMoodlePattern(entries);
  const canvasCount = countCanvasPattern(entries);
  const brightspaceCount = countBrightspacePattern(entries);
  const blackboardCount = countBlackboardPattern(entries);

  // Build list of detected patterns with their counts
  // Canvas requires >50% majority of files
  const files = entries.filter((e) => !e.dir);
  const canvasMajority = files.length > 0 ? canvasCount > files.length / 2 : false;

  const patternCounts: Array<[string, number]> = [
    ["moodle", moodleCount],
    ["canvas", canvasMajority ? canvasCount : 0],
    ["brightspace", brightspaceCount],
    ["blackboard", blackboardCount],
  ];

  // Filter to only patterns that matched (count > 0)
  const matchedPatterns = patternCounts.filter(([, count]) => count > 0);

  if (matchedPatterns.length === 1) {
    result.lms = matchedPatterns[0][0] as
      | "canvas"
      | "brightspace"
      | "blackboard"
      | "moodle";
    notes.push(`LMS detected: ${result.lms}`);
  } else if (matchedPatterns.length > 1) {
    // Multiple patterns matched; use majority rule (highest count wins)
    // Ties broken by order in patternCounts array
    const winner = matchedPatterns.reduce((max, current) =>
      current[1] > max[1] ? current : max
    );
    result.lms = winner[0] as
      | "canvas"
      | "brightspace"
      | "blackboard"
      | "moodle";
    notes.push(`Multiple patterns detected; using majority: ${result.lms}`);
  }

  // Extract metadata based on detected LMS
  if (result.lms === "blackboard") {
    // Blackboard: extract from gradebook_ filename and companion txt
    const gradebookEntry = entries.find((e) => e.name.startsWith("gradebook_"));
    if (gradebookEntry) {
      const [course, assignment] = extractBlackboardLabels(gradebookEntry.name);
      if (course) {
        result.courseLabel = course;
        notes.push(`Blackboard course extracted from filename: ${course}`);
      }
      if (assignment) {
        result.assignmentLabel = assignment;
        notes.push(`Blackboard assignment extracted from filename: ${assignment}`);
      }

      // Look for companion .txt file with points - try multiple patterns
      if (textOf) {
        const baseName = gradebookEntry.name
          .replace("gradebook_", "")
          .replace(/_grades\.txt$/, "")
          .replace(/\.txt$/, "");

        // Try patterns: gradebook_<course>_<column>_info.txt or gradebook_<course>_<column>_grades_info.txt
        const patterns = [
          `gradebook_${baseName}_info.txt`,
          `${gradebookEntry.name.replace(/\.txt$/, "")}_info.txt`,
        ];

        let txt: string | null = null;
        for (const pattern of patterns) {
          txt = await textOf(pattern);
          if (txt) break;
        }

        if (txt) {
          const pointsMatch = txt.match(/points?:\s*(\d+(?:\.\d+)?)/i);
          if (pointsMatch) {
            result.pointsPossible = parseFloat(pointsMatch[1]);
            notes.push(
              `Blackboard points extracted from companion file: ${result.pointsPossible}`
            );
          }
        }
      }
    }
  }

  // Fallback: assignmentLabel from upload filename if not already set
  if (!result.assignmentLabel) {
    const base = uploadFileName.replace(/\.[^.]+$/, "");
    if (!isGenericName(base)) {
      result.assignmentLabel = base;
      notes.push(`Assignment label fallback: upload filename ${base}`);
    }
  }

  if (notes.length === 0) {
    notes.push("No metadata extracted");
  }

  return result;
}

/**
 * Wrapper to sniff a File submission archive.
 * For .imscc or cartridge archives, parses via parseCartridgeBlob and returns full metadata.
 * For plain zips, uses sniffEntries with a textOf helper that reads file contents.
 */
export async function sniffSubmissionArchive(file: File): Promise<SniffResult> {
  // Import jszip using the same pattern as cartridge-import.ts
  const JSZip = (await import("jszip")).default;

  // Try to load as zip
  const arrayBuffer = await file.arrayBuffer();
  // Type the zip result as JSZip instance with forEach and file methods
  type ZipInstance = {
    forEach: (
      callback: (
        path: string,
        entry: { dir: boolean; async: (type: "string") => Promise<string> }
      ) => void
    ) => void;
    file: (path: string) => { dir: boolean; async: (type: "string") => Promise<string> } | null;
  };
  let zip: ZipInstance;
  try {
    zip = (await JSZip.loadAsync(arrayBuffer)) as ZipInstance;
  } catch {
    // Not a zip - return empty result
    return { notes: ["Not a valid archive file"] };
  }

  // Collect all entries
  const entries: ArchiveEntry[] = [];
  const entryMap = new Map<
    string,
    { dir: boolean; async: (type: "string") => Promise<string> }
  >();
  zip.forEach((path, entry) => {
    entries.push({ name: path, dir: entry.dir });
    entryMap.set(path, entry);
  });

  // Check for cartridge
  const hasCartridge =
    entries.some((e) => e.name === "imsmanifest.xml") ||
    entries.some((e) => e.name.startsWith("course_settings/"));

  if (hasCartridge) {
    // Parse via cartridge parser
    const cartridgeData = await parseCartridgeBlob(file);
    const result: SniffResult = {
      lms: "canvas",
      courseLabel: cartridgeData.title || undefined,
      notes: ["Cartridge archive detected"],
    };

    // Extract rubricText from first rubric if present
    if (cartridgeData.rubrics.length > 0) {
      result.rubricText = serializeRubric(cartridgeData.rubrics[0]);
    }

    // Extract pointsPossible from first rubric
    if (cartridgeData.rubrics.length > 0) {
      const firstRubric = cartridgeData.rubrics[0];
      const totalPoints = firstRubric.criteria.reduce((sum, c) => sum + c.points, 0);
      if (totalPoints > 0) {
        result.pointsPossible = totalPoints;
      }
    }

    return result;
  }

  // Helper to read file contents
  const textOf = async (name: string): Promise<string | null> => {
    const entry = entryMap.get(name);
    if (!entry || entry.dir) return null;
    try {
      return await entry.async("string");
    } catch {
      return null;
    }
  };

  // Use sniffEntries for plain zips
  return sniffEntries(entries, file.name, textOf);
}
