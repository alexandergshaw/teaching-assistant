import type { SubmittedFileInfo, InferredFileNameLookup } from "./types";
import type { CodeRunResult } from "../code-runner";
import { getMimeType } from "./constants";

const MAX_PREVIEW_CHARS = 16000;

/**
 * Cut a merged submission down to `maxChars` if it exceeds that cap. Mirrors
 * the `{ text, truncated }` shape of {@link toPreviewContent} below so callers
 * can tell whether truncation happened without re-deriving it from string
 * lengths - the caller is expected to surface `truncated` back to the
 * instructor (see GradeResult.submissionTruncated in ./types) rather than
 * relying solely on the note appended to `text`, which only the model sees.
 */
export function truncateSubmission(
  content: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (content.length <= maxChars) {
    return { text: content, truncated: false };
  }

  const omitted = content.length - maxChars;
  return {
    text: `${content.slice(0, maxChars)}\n\n[Truncated ${omitted} characters to stay within configured grading limits.]`,
    truncated: true,
  };
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
  // codeRun.stdinReadSuspected (code-runner.ts): this run exited cleanly, but
  // its source appears to read from stdin and this sandbox always runs code
  // with stdin empty - in a language (c/c++) that reads past end-of-stream
  // SILENTLY (the variable is simply left unset, no error, no distinguishing
  // exit code), so a "clean run" here is not evidence the input-handling
  // code is correct. Only a caveat, never a suppression: unlike
  // codeRun.neededStdin (excluded from the prompt entirely by the caller,
  // grade/engine.ts, since that case is a genuine execution failure), this
  // run really did produce real output for whatever parts of the program
  // never touched the unread input - hiding that would be its own kind of
  // dishonesty. The model is told explicitly not to weigh the input-derived
  // parts of the output as real.
  if (codeRun.stdinReadSuspected) {
    lines.push(
      "- Note: this program appears to read from standard input, but this grading sandbox cannot provide any (input was empty). In this language, reading past the end of an empty input does not raise an error - it silently leaves the target variable unset, and the program can still exit cleanly. Do not treat the output above as evidence that the input-handling logic is correct or incorrect; judge that part of the submission from the source code instead."
    );
  }
  // An execution-influenced grade must be explainable to the student it
  // affects - the previous wording here ("Do not mention that the code was
  // run automatically") made that impossible by construction: a student
  // whose score moved because of a sandbox failure had no way to learn that
  // from the feedback. The model is now told it MAY say so, not required to
  // - most runs are unremarkable and do not need a note - but a run that
  // failed, or that changed the assessment, should be named as a reason.
  lines.push(
    "Factor this execution result into your assessment where the rubric concerns whether the code works. You may mention in your feedback that the code was run automatically - including a failure to run - when that is part of why the score is what it is; the student should be able to tell why, not be left guessing."
  );
  return lines.join("\n");
}
