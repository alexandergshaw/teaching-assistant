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

/**
 * A14: the Canvas bulk-download naming convention this repo has always
 * parsed (studentname_date_time_filename) and the synthetic convention
 * canvasWorkToZipBase64 (../canvas/submissions.ts) builds for API-fetched
 * work (sanitizedname_userId_seq_filename) share the same four-part shape.
 * Both are matched by this one check - the function never knows or cares
 * which convention produced a given name, only that it has the shape.
 *
 * A14 rulings v2, CORRECTION 2: parts[1] is deliberately NOT extracted or
 * folded into the identity key here. The withdrawn M3 ruling cited
 * ../canvas/submissions.ts:165-193 as proof parts[1] is a unique userId, but
 * that file is this app's own synthetic packer, not the real Canvas
 * bulk-download convention - for which this same comment says the second
 * part is a DATE. Folding a date into the grouping key would split one
 * student's own two submissions into two rows that look identical in the UI
 * (studentDisplay stays bare) and share one edit entry and one grade. The
 * sanitized-name collision M3 targeted is a known-open item again, not fixed
 * here - see scratchpad/a14-rulings-v2.md CORRECTION 2.
 */
function matchStudentFileConvention(
  name: string
): { studentPart: string; filePart: string } | null {
  const parts = name.split("_");

  // Expected format: studentname_date_time_filename (or the synthetic
  // sanitizedname_userId_seq_filename equivalent) - either way, at least
  // four underscore-separated parts.
  if (parts.length < 4) {
    return null;
  }

  const studentPart = parts[0].trim();
  const filePart = parts.slice(3).join("_").trim();

  if (!studentPart || !filePart) {
    return null;
  }

  return { studentPart, filePart };
}

/** Builds the identity key from a convention match: just the lowered student
 *  name. A14 rulings v2 CORRECTION 2 withdrew the parts[1]/userId fold a
 *  prior pass added here - see matchStudentFileConvention above for why. */
function identityFromConventionMatch(match: {
  studentPart: string;
}): { studentKey: string; studentDisplay: string } {
  return {
    studentKey: match.studentPart.toLowerCase(),
    studentDisplay: match.studentPart,
  };
}

function leafStemFallback(baseName: string): { studentKey: string; studentDisplay: string } {
  const stem = removeLastExtension(baseName);
  const match = stem.match(/^([A-Za-z0-9]+)/);
  const fallbackStudent = (match?.[1] ?? stem).trim() || "unknown";
  return { studentKey: fallbackStudent.toLowerCase(), studentDisplay: fallbackStudent };
}

/**
 * Parse one submission file path into the student identity it belongs to,
 * plus the citation name/extension to show for that file.
 *
 * `zipChain` (A14) is the whole sequence of zip-archive entry names this
 * file crossed to reach its current path, OUTERMOST FIRST (built by
 * extraction.ts's collectFromZip as it recurses into nested zips) - never
 * just the outermost or innermost name in isolation. It defaults to an
 * empty array, which reproduces today's exact behavior byte-for-byte: a
 * caller that does not thread the chain through gets the unfixed algorithm,
 * not a silently different one, so an unwired call site is provably
 * detectable (see grouping-zip-parents.wiring.test.ts) rather than
 * accidentally "working" for the wrong reason.
 *
 * THE ALGORITHM (binding per the A14 rulings, corrected by rulings v2's
 * CORRECTION 1, in this exact priority order):
 *   1. inferredLookup.byRaw - an exact per-file model inference. Stays the
 *      single highest-priority signal; untouched by this fix.
 *   2. LEAF FIRST: if the leaf's own name (baseName) matches the convention,
 *      use ITS identity. An ancestor is consulted only once the leaf's own
 *      check fails - a false positive on a leaf costs one file, a false
 *      positive on an ancestor costs the whole run.
 *   3. THE CROSSING CHAIN, scanned NARROWEST FIRST (A14 rulings v2
 *      CORRECTION 1 - this scanned outward-in, outermost first, before, and
 *      that was wrong): walk zipChain from its LAST entry (innermost)
 *      toward its first (outermost), and use the first crossing whose own
 *      (base-named) entry name matches the convention. The same
 *      false-positive-cost argument from step 2 applies at every level of
 *      the chain, not just the leaf/ancestor boundary - an outer crossing is
 *      the widest scope there is, so matching it first is broad-before-
 *      narrow and can attribute an entire wrapper or bulk-download zip's
 *      worth of students onto whichever name happens to pass the convention
 *      check first (e.g. a wrapper literally named
 *      "CS101_Fall_2026_submissions.zip", which itself has four
 *      underscore-separated parts). This is a crossing-derived, ground-truth
 *      identity - ruling M2 says it must outrank inferredLookup.byBase (a
 *      mere base-name guess), which is why byBase is not consulted until
 *      after this step.
 *   4. inferredLookup.byBase - a base-name guess, consulted only once
 *      neither the leaf nor any crossing produced a ground-truth identity.
 *   5. THE INNERMOST CROSSING's stem, when the chain is non-empty - the
 *      per-student zip in the ordinary nested case. This is what fixes the
 *      filed bug (two students' zips each holding main.py/report.docx no
 *      longer collapse onto "main"/"report").
 *   6. Today's leaf-stem fallback, unchanged - reached only when the chain
 *      is empty (or absent) and nothing above matched, which is exactly
 *      today's behavior for every shape this fix does not touch.
 */
export function parseSubmissionFileName(
  filePath: string,
  inferredLookup?: InferredFileNameLookup,
  zipChain: string[] = []
): {
  studentKey: string;
  studentDisplay: string;
  citationFileName: string;
  extension: string;
} {
  const baseName = getBaseFileName(filePath);

  // 1. byRaw - exact per-file model inference, unchanged, still the top
  // priority signal.
  const rawInferred = inferredLookup?.byRaw.get(filePath);
  if (rawInferred) {
    return {
      studentKey: rawInferred.studentDisplay.toLowerCase(),
      studentDisplay: rawInferred.studentDisplay,
      citationFileName: rawInferred.citationFileName,
      extension: getFileExtension(baseName) || getFileExtension(rawInferred.citationFileName) || "(none)",
    };
  }

  // 2. LEAF FIRST.
  const leafMatch = matchStudentFileConvention(baseName);
  if (leafMatch) {
    return {
      ...identityFromConventionMatch(leafMatch),
      citationFileName: leafMatch.filePart,
      extension: getFileExtension(leafMatch.filePart) || "(none)",
    };
  }

  // 3. THE CROSSING CHAIN, scanned narrowest first - innermost crossing to
  // outermost (A14 rulings v2 CORRECTION 1). citationFileName/extension stay
  // leaf-derived (baseName) here - identity may come from an ancestor, but
  // the file a student and grader actually see is always the leaf's own
  // name (code-run-selection.ts, prompts.ts both depend on this staying a
  // bare leaf name).
  for (let i = zipChain.length - 1; i >= 0; i -= 1) {
    const crossing = zipChain[i];
    const crossingMatch = matchStudentFileConvention(getBaseFileName(crossing));
    if (crossingMatch) {
      return {
        ...identityFromConventionMatch(crossingMatch),
        citationFileName: baseName,
        extension: getFileExtension(baseName) || "(none)",
      };
    }
  }

  // 4. byBase - a guess, and per ruling M2 it must not outrank the
  // ground-truth crossing-chain identity above, which is why it is only
  // consulted here.
  const baseInferred = inferredLookup?.byBase.get(baseName);
  if (baseInferred) {
    return {
      studentKey: baseInferred.studentDisplay.toLowerCase(),
      studentDisplay: baseInferred.studentDisplay,
      citationFileName: baseInferred.citationFileName,
      extension: getFileExtension(baseName) || getFileExtension(baseInferred.citationFileName) || "(none)",
    };
  }

  // 5. THE INNERMOST CROSSING's stem - the per-student zip in the ordinary
  // nested case, and the fix for the filed bug.
  if (zipChain.length > 0) {
    const innermost = zipChain[zipChain.length - 1];
    const fallback = leafStemFallback(getBaseFileName(innermost));
    return {
      ...fallback,
      citationFileName: baseName,
      extension: getFileExtension(baseName) || "(none)",
    };
  }

  // 6. Today's leaf-stem fallback, unchanged.
  const fallback = leafStemFallback(baseName);
  return {
    ...fallback,
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
  inferredLookup?: InferredFileNameLookup,
  zipChain?: string[]
): { key: string; display: string } {
  const parsed = parseSubmissionFileName(filePath, inferredLookup, zipChain);
  return {
    key: parsed.studentKey,
    display: parsed.studentDisplay,
  };
}

/**
 * `zipParents` (A14): per-file zip-crossing chains, keyed by the same file
 * path used in `submissions`/`rawData` - populated by extraction.ts's
 * collectFromZip. A file absent from `zipParents` (or the whole map being
 * `undefined`, which is what a caller that predates this fix passes) is
 * treated as having crossed no zip boundary at all, which is exactly
 * today's assumption and keeps every un-migrated caller byte-for-byte
 * unchanged.
 */
export function groupSubmissionsByStudent(
  submissions: Record<string, string>,
  inferredLookup?: InferredFileNameLookup,
  rawData?: Record<string, string>,
  zipParents?: Record<string, string[]>
): Array<{
  student: string;
  content: string;
  mergedFileCount: number;
  submittedFiles: SubmittedFileInfo[];
}> {
  const grouped = new Map<string, { student: string; files: Array<[string, string]> }>();

  for (const [filePath, content] of Object.entries(submissions)) {
    const inferred = inferStudentPrefix(filePath, inferredLookup, zipParents?.[filePath]);
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
        const parsed = parseSubmissionFileName(filePath, inferredLookup, zipParents?.[filePath]);
        return `File: ${parsed.citationFileName}\n\n${content}`;
      })
      .join("\n\n---\n\n");

    const submittedFiles = entry.files.map(([filePath, content]) => {
      const parsed = parseSubmissionFileName(filePath, inferredLookup, zipParents?.[filePath]);
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
