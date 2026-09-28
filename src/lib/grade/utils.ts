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
 * A44 RULE K: length-prefix every identity component (`${part.length}:${part}`)
 * and concatenate. Applied TOTALLY, at all six `parseSubmissionFileName`
 * return sites below - never only at the two stem-fallback sites. A partial
 * encoding is forgeable: a flat file whose own name happens to spell an
 * already-encoded key (e.g. a leading space that defeats `leafStemFallback`'s
 * anchored regex, so `.trim()` hands back the whole crafted string) then
 * collides with a genuinely foldered student's key and the two silently
 * merge into one graded row - see docs/a44-test-notes.md R13 (the K1
 * fixture) for the exact bytes. The length prefix, not a printable
 * separator, is what makes this injective: a printable separator such as
 * `::` can itself appear inside a folder name or stem and produce the same
 * concatenation from two different splits (docs/a44-test-notes.md G13).
 */
function a44Encode(parts: string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("");
}

/**
 * A44 wave 2: the decoder for `a44Encode`'s length-prefixed join. Returns the
 * original parts array in order, or `null` when `key` is not validly encoded
 * (never throws - a caller gets an explicit signal instead of a corrupt
 * partial parse). Exists so `collisionRefusal.ts` can recover a group's
 * arity (one part = no folder, two parts = `[dir, stem]`) from the identity
 * key it already has, rather than re-deriving the folder from the raw path a
 * second time - see docs/a44-waves.md 6.3 for why the arity is what the
 * refusal's amnesty predicate needs and `reachedStemFallback` below is why
 * arity alone cannot distinguish every case that matters.
 */
export function a44DecodeKey(key: string): string[] | null {
  const parts: string[] = [];
  let rest = key;
  while (rest.length > 0) {
    const colonIndex = rest.indexOf(":");
    if (colonIndex <= 0) return null;
    const lengthStr = rest.slice(0, colonIndex);
    if (!/^[0-9]+$/.test(lengthStr)) return null;
    const length = Number(lengthStr);
    const partStart = colonIndex + 1;
    const partEnd = partStart + length;
    if (partEnd > rest.length) return null;
    parts.push(rest.slice(partStart, partEnd));
    rest = rest.slice(partEnd);
  }
  return parts;
}

/**
 * Wrap an identity produced by a non-fallback step (1-4) in the same
 * length-prefixed encoding the folded fallback steps (5-6) use, so every one
 * of the six return sites emits an encoded key and none can be mistaken for
 * a raw, unencoded one - see `a44Encode` above for why the encoding must be
 * total.
 */
function a44Wrap(id: { studentKey: string; studentDisplay: string }): {
  studentKey: string;
  studentDisplay: string;
} {
  return { studentKey: a44Encode([id.studentKey]), studentDisplay: id.studentDisplay };
}

/**
 * A44 RULE K: the container-relative directory PATH - every path segment
 * strictly between a file's innermost container (the last `zipChain` entry,
 * or the run root when `zipChain` is empty) and the file's own leaf name.
 * Returns "" when the file sits directly in its container (no folder to
 * fold). Case-preserving: RULE D's display fold uses this verbatim; RULE K's
 * key fold lower-cases it itself.
 *
 * Exported for A44 wave 2's refusal copy only (`collisionRefusal.ts`), which
 * is the one caller that needs the case-preserving path rather than the
 * lower-cased form `a44DecodeKey` recovers from the identity key - see
 * docs/a44-waves.md 6.3's condition on this export.
 */
export function a44ContainerRelativeDir(filePath: string, zipChain: string[]): string {
  const segments = filePath.replace(/\\/g, "/").split("/");
  let startIndex = 0;
  if (zipChain.length > 0) {
    const innermost = getBaseFileName(zipChain[zipChain.length - 1]);
    const idx = segments.findIndex((segment) => segment === innermost);
    if (idx >= 0) {
      startIndex = idx + 1;
    }
  }
  return segments.slice(startIndex, segments.length - 1).join("/");
}

/**
 * A44 RULE K + RULE D: fold the container-relative directory into both the
 * identity key (lower-cased, length-prefixed alongside the base key so the
 * fold stays injective) and the display (verbatim, in path order) - only at
 * the two stem-fallback return sites (5 and 6), never at 1-4, where a file's
 * identity already came from a ground-truth convention match or model
 * inference the folder must not perturb. `dirFirst` controls DISPLAY order
 * only: true for the ordinary leaf-stem fallback (folder, then the stem -
 * "AlvarezMaria/essay"), false for the innermost-crossing fallback (the
 * per-student zip's own stem, then the folder inside it - "bulk/AlvarezMaria"),
 * matching what each site's `studentDisplay` already meant before this fold.
 */
function a44Fold(
  id: { studentKey: string; studentDisplay: string },
  relDir: string,
  dirFirst: boolean
): { studentKey: string; studentDisplay: string } {
  if (!relDir) {
    return a44Wrap(id);
  }
  return {
    studentKey: a44Encode([relDir.toLowerCase(), id.studentKey]),
    studentDisplay: dirFirst ? `${relDir}/${id.studentDisplay}` : `${id.studentDisplay}/${relDir}`,
  };
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
  /**
   * A44 wave 2: whether THIS return came from step 5 or step 6 - the two
   * stem-fallback steps RULE K/D fold a directory into - as opposed to a
   * ground-truth model inference (1, 4) or a convention match (2, 3). A
   * decoded key's arity alone cannot make this distinction: a convention
   * match at step 2/3 and a directory-less stem fallback at step 6 both
   * decode to one part (docs/a44-waves.md 3.3). `collisionRefusal.ts`'s
   * amnesty predicate needs exactly this population, not "every file".
   */
  reachedStemFallback: boolean;
} {
  const baseName = getBaseFileName(filePath);

  // 1. byRaw - exact per-file model inference, unchanged, still the top
  // priority signal.
  const rawInferred = inferredLookup?.byRaw.get(filePath);
  if (rawInferred) {
    return {
      studentKey: a44Encode([rawInferred.studentDisplay.toLowerCase()]),
      studentDisplay: rawInferred.studentDisplay,
      citationFileName: rawInferred.citationFileName,
      extension: getFileExtension(baseName) || getFileExtension(rawInferred.citationFileName) || "(none)",
      reachedStemFallback: false,
    };
  }

  // 2. LEAF FIRST.
  const leafMatch = matchStudentFileConvention(baseName);
  if (leafMatch) {
    return {
      ...a44Wrap(identityFromConventionMatch(leafMatch)),
      citationFileName: leafMatch.filePart,
      extension: getFileExtension(leafMatch.filePart) || "(none)",
      reachedStemFallback: false,
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
        ...a44Wrap(identityFromConventionMatch(crossingMatch)),
        citationFileName: baseName,
        extension: getFileExtension(baseName) || "(none)",
        reachedStemFallback: false,
      };
    }
  }

  // 4. byBase - a guess, and per ruling M2 it must not outrank the
  // ground-truth crossing-chain identity above, which is why it is only
  // consulted here.
  const baseInferred = inferredLookup?.byBase.get(baseName);
  if (baseInferred) {
    return {
      studentKey: a44Encode([baseInferred.studentDisplay.toLowerCase()]),
      studentDisplay: baseInferred.studentDisplay,
      citationFileName: baseInferred.citationFileName,
      extension: getFileExtension(baseName) || getFileExtension(baseInferred.citationFileName) || "(none)",
      reachedStemFallback: false,
    };
  }

  // 5. THE INNERMOST CROSSING's stem - the per-student zip in the ordinary
  // nested case, and the fix for the filed bug. A44 RULE K/D: the container-
  // relative directory INSIDE that per-student zip is folded into both the
  // key and the display here, which is what stops that zip's own several
  // subdirectories from blending onto one row (the immediate-parent rule
  // rejected by the architecture still blended them one level down).
  if (zipChain.length > 0) {
    const innermost = zipChain[zipChain.length - 1];
    const fallback = leafStemFallback(getBaseFileName(innermost));
    const relDir5 = a44ContainerRelativeDir(filePath, zipChain);
    return {
      ...a44Fold(fallback, relDir5, false),
      citationFileName: baseName,
      extension: getFileExtension(baseName) || "(none)",
      reachedStemFallback: true,
    };
  }

  // 6. Today's leaf-stem fallback. A44 RULE K/D: the container-relative
  // directory (here, simply the file's own containing folder path, since
  // there is no zip to be relative to) is folded into both the key and the
  // display, unconditionally - this is the headline fix: three students each
  // submitting the same filename in their own folder no longer collapse onto
  // one row keyed by that shared filename stem.
  const fallback = leafStemFallback(baseName);
  const relDir6 = a44ContainerRelativeDir(filePath, zipChain);
  return {
    ...a44Fold(fallback, relDir6, true),
    citationFileName: baseName,
    extension: getFileExtension(baseName) || "(none)",
    reachedStemFallback: true,
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

  // A44 RULE D's terminal disambiguation pass. RULE D's fold above is a
  // function of the FILE alone, so two distinct identity keys can still
  // produce the identical raw display (e.g. one file resolved via an
  // innermost-crossing zip stem, another via the ordinary leaf-stem
  // fallback, both landing on "JaneDoe/src/deep"). This pass guarantees the
  // returned rows' displays are pairwise distinct.
  //
  // Walked in IDENTITY-KEY order, never insertion/Object.entries order: the
  // two orders assign different labels to the same set of files (only key
  // order gives the same answer regardless of which file happened to be
  // read first), and under RULING 93 the display IS the storage label, so
  // an order-dependent assignment would silently reassign a stored edit
  // across runs (docs/a44-test-notes.md R16).
  //
  // Assigns the first UNCLAIMED label against the set of labels already
  // taken, never a counted suffix: appending " (2)", " (3)" to the Nth
  // claimant of a base label does not guarantee distinctness, because a
  // crafted or coincidental RAW label (e.g. a leading space defeating
  // leafStemFallback's anchored regex, so a file's own stem IS "deep (2)")
  // can collide with a suffix a counting pass would also produce
  // (docs/a44-test-notes.md R15, fixture K4).
  const sortedKeys = Array.from(grouped.keys()).sort();
  const takenLabels = new Set<string>();
  const displayByKey = new Map<string, string>();
  for (const key of sortedKeys) {
    const group = grouped.get(key);
    if (!group) continue;
    const baseLabel = group.student;
    let candidate = baseLabel;
    let suffix = 2;
    while (takenLabels.has(candidate)) {
      candidate = `${baseLabel} (${suffix})`;
      suffix += 1;
    }
    takenLabels.add(candidate);
    displayByKey.set(key, candidate);
  }

  const entries = sortedKeys.map((key) => {
    const group = grouped.get(key);
    if (!group) throw new Error(`groupSubmissionsByStudent: missing group for key ${key}`);
    return { student: displayByKey.get(key) ?? group.student, files: group.files };
  });
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
