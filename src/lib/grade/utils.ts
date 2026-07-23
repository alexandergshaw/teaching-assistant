import type { SubmittedFileInfo, InferredFileNameLookup } from "./types";
import type { CodeRunResult } from "../code-runner";
import { getMimeType } from "./constants";

const MAX_PREVIEW_CHARS = 16000;

export function truncateSubmission(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }

  const omitted = content.length - maxChars;
  return `${content.slice(0, maxChars)}\n\n[Truncated ${omitted} characters to stay within configured grading limits.]`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getBaseFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? path;
}

export function removeLastExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return fileName;
  }

  return fileName.slice(0, lastDot);
}

export function toPreviewContent(content: string): {
  text: string;
  truncated: boolean;
} {
  if (content.length <= MAX_PREVIEW_CHARS) {
    return {
      text: content,
      truncated: false,
    };
  }

  const omitted = content.length - MAX_PREVIEW_CHARS;

  return {
    text: `${content.slice(0, MAX_PREVIEW_CHARS)}\n\n[Preview truncated: ${omitted} additional characters are not shown.]`,
    truncated: true,
  };
}

export function parseSubmissionFileName(
  filePath: string,
  inferredLookup?: InferredFileNameLookup
): {
  studentKey: string;
  studentDisplay: string;
  citationFileName: string;
  extension: string;
} {
  const baseName = getBaseFileName(filePath);

  const inferred =
    inferredLookup?.byRaw.get(filePath) ?? inferredLookup?.byBase.get(baseName);

  if (inferred) {
    return {
      studentKey: inferred.studentDisplay.toLowerCase(),
      studentDisplay: inferred.studentDisplay,
      citationFileName: inferred.citationFileName,
      extension: getFileExtension(baseName) || getFileExtension(inferred.citationFileName) || "(none)",
    };
  }

  const parts = baseName.split("_");

  // Expected format: studentname_date_time_filename
  if (parts.length >= 4) {
    const studentPart = parts[0].trim();
    const filePart = parts.slice(3).join("_").trim();

    if (studentPart && filePart) {
      return {
        studentKey: studentPart.toLowerCase(),
        studentDisplay: studentPart,
        citationFileName: filePart,
        extension: getFileExtension(filePart) || "(none)",
      };
    }
  }

  const stem = removeLastExtension(baseName);
  const match = stem.match(/^([A-Za-z0-9]+)/);
  const fallbackStudent = (match?.[1] ?? stem).trim() || "unknown";

  return {
    studentKey: fallbackStudent.toLowerCase(),
    studentDisplay: fallbackStudent,
    citationFileName: baseName,
    extension: getFileExtension(baseName) || "(none)",
  };
}

export function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot <= 0) return "";
  const ext = filePath.slice(lastDot + 1).toLowerCase();
  return ext;
}

export function inferStudentPrefix(
  filePath: string,
  inferredLookup?: InferredFileNameLookup
): { key: string; display: string } {
  const parsed = parseSubmissionFileName(filePath, inferredLookup);
  return {
    key: parsed.studentKey,
    display: parsed.studentDisplay,
  };
}

export function groupSubmissionsByStudent(
  submissions: Record<string, string>,
  inferredLookup?: InferredFileNameLookup,
  rawData?: Record<string, string>
): Array<{
  student: string;
  content: string;
  mergedFileCount: number;
  submittedFiles: SubmittedFileInfo[];
}> {
  const grouped = new Map<string, { student: string; files: Array<[string, string]> }>();

  for (const [filePath, content] of Object.entries(submissions)) {
    const inferred = inferStudentPrefix(filePath, inferredLookup);
    const existing = grouped.get(inferred.key);

    if (!existing) {
      grouped.set(inferred.key, {
        student: inferred.display,
        files: [[filePath, content]],
      });
      continue;
    }

    existing.files.push([filePath, content]);
  }

  const entries = Array.from(grouped.values());
  entries.sort((a, b) => a.student.localeCompare(b.student));

  return entries.map((entry) => {
    const mergedContent = entry.files
      .map(([filePath, content]) => {
        const parsed = parseSubmissionFileName(filePath, inferredLookup);
        return `File: ${parsed.citationFileName}\n\n${content}`;
      })
      .join("\n\n---\n\n");

    const submittedFiles = entry.files.map(([filePath, content]) => {
      const parsed = parseSubmissionFileName(filePath, inferredLookup);
      const preview = toPreviewContent(content);

      return {
        name: parsed.citationFileName,
        extension: parsed.extension,
        previewContent: preview.text,
        previewTruncated: preview.truncated,
        rawBase64: rawData?.[filePath],
        mimeType: getMimeType(parsed.extension),
      };
    });

    return {
      student: entry.student,
      content: mergedContent,
      mergedFileCount: entry.files.length,
      submittedFiles,
    };
  });
}

export function buildCodeExecutionNote(codeRun: CodeRunResult): string {
  const cap = (s: string) => (s.length > 4000 ? `${s.slice(0, 4000)}\n[truncated]` : s);
  const lines = [
    `\n\nAUTOMATED CODE EXECUTION (the student's ${codeRun.language} code was run in a sandbox):`,
    `- Ran without errors: ${codeRun.ran ? "yes" : "no"}`,
  ];
  if (codeRun.compileOutput && codeRun.compileOutput.trim()) {
    lines.push(`- Compiler output:\n${cap(codeRun.compileOutput)}`);
  }
  lines.push(`- Program output (stdout):\n${cap(codeRun.stdout) || "(none)"}`);
  if (codeRun.stderr && codeRun.stderr.trim()) {
    lines.push(`- Errors (stderr):\n${cap(codeRun.stderr)}`);
  }
  lines.push("Factor this execution result into your assessment where the rubric concerns whether the code works. Do not mention that the code was run automatically.");
  return lines.join("\n");
}
