/**
 * The check runners for the Embedded Deterministic Engine. Each takes one
 * rubric check and one student's submission and returns a pass/points outcome
 * with a factual, student-facing detail line. No network, no model, no
 * randomness: identical input always yields identical output.
 */

import type { StudentSubmissionEntry } from "@/lib/grade";
import type { RubricCheck } from "./types";

export interface CheckOutcome {
  passed: boolean;
  earned: number;
  possible: number;
  detail: string;
}

function wordCount(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

/** Count non-overlapping, case-insensitive occurrences of `needle` in `haystackLower`. */
function countOccurrences(haystackLower: string, needle: string): number {
  const term = needle.trim().toLowerCase();
  if (!term) return 0;
  let count = 0;
  let index = haystackLower.indexOf(term);
  while (index !== -1) {
    count += 1;
    index = haystackLower.indexOf(term, index + term.length);
  }
  return count;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Patterns that recognise a definition of `symbol` across common languages. */
function codeSymbolPatterns(symbol: string): RegExp[] {
  const s = escapeRegExp(symbol);
  return [
    new RegExp(`\\bdef\\s+${s}\\b`, "i"), // python
    new RegExp(`\\bfunction\\s+${s}\\b`, "i"), // js / php
    new RegExp(`\\bclass\\s+${s}\\b`, "i"), // class declaration
    new RegExp(`\\b(?:const|let|var)\\s+${s}\\s*=`, "i"), // js assignment
    new RegExp(`\\b${s}\\s*=\\s*(?:function|\\()`, "i"), // js function expression / arrow
    new RegExp(`\\b${s}\\s*\\([^)]*\\)\\s*(?:=>|\\{)`, "i"), // method / arrow body
    new RegExp(
      `\\b(?:public|private|protected|static|final|void|int|long|double|float|boolean|string)\\s+${s}\\s*\\(`,
      "i"
    ), // java / c-like
  ];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function runCheck(check: RubricCheck, entry: StudentSubmissionEntry): CheckOutcome {
  const possible = check.points;
  const text = entry.content ?? "";
  const lower = text.toLowerCase();
  const extensions = entry.submittedFiles
    .map((file) => (file.extension || "").toLowerCase())
    .filter(Boolean);

  const pass = (detail: string): CheckOutcome => ({ passed: true, earned: possible, possible, detail });
  const fail = (detail: string): CheckOutcome => ({ passed: false, earned: 0, possible, detail });

  switch (check.checkType) {
    case "keyword": {
      const occurrences = countOccurrences(lower, check.target);
      return occurrences > 0
        ? pass(`Met: found the required term "${check.target}" (${occurrences} mention${occurrences === 1 ? "" : "s"}).`)
        : fail(`Not met: the required term "${check.target}" was not found.`);
    }
    case "all_keywords": {
      const terms = check.terms ?? [];
      if (terms.length === 0) return fail("Not met: no required terms were defined for this criterion.");
      const present = terms.filter((term) => countOccurrences(lower, term) > 0);
      const missing = terms.filter((term) => !present.includes(term));
      if (missing.length === 0) {
        return pass(`Met: all required terms are present (${terms.join(", ")}).`);
      }
      const earned = round2(possible * (present.length / terms.length));
      return {
        passed: false,
        earned,
        possible,
        detail: `Partially met: present (${present.join(", ") || "none"}); not found (${missing.join(", ")}).`,
      };
    }
    case "any_keywords": {
      const terms = check.terms ?? [];
      const present = terms.filter((term) => countOccurrences(lower, term) > 0);
      return present.length > 0
        ? pass(`Met: found ${present.join(", ")}.`)
        : fail(`Not met: none of these were found (${terms.join(", ")}).`);
    }
    case "min_words": {
      const required = check.count ?? 0;
      const actual = wordCount(text);
      return actual >= required
        ? pass(`Met: the submission has ${actual} words (required at least ${required}).`)
        : fail(`Not met: the submission has ${actual} words (required at least ${required}).`);
    }
    case "file_type": {
      const target = check.target.toLowerCase().replace(/^\./, "");
      const received = extensions.length ? extensions.map((ext) => `.${ext}`).join(", ") : "no files";
      return extensions.includes(target)
        ? pass(`Met: a .${target} file was submitted.`)
        : fail(`Not met: no .${target} file was submitted (received: ${received}).`);
    }
    case "min_file_count": {
      const required = check.count ?? 1;
      const actual = entry.submittedFiles.length;
      return actual >= required
        ? pass(`Met: ${actual} file${actual === 1 ? "" : "s"} submitted (required at least ${required}).`)
        : fail(`Not met: ${actual} file${actual === 1 ? "" : "s"} submitted (required at least ${required}).`);
    }
    case "regex": {
      const source = check.pattern ?? check.target;
      try {
        const regex = new RegExp(source, "im");
        return regex.test(text)
          ? pass("Met: the submission matches the required pattern.")
          : fail("Not met: the submission does not match the required pattern.");
      } catch {
        return fail("Not met: the rubric pattern could not be read.");
      }
    }
    case "code_symbol": {
      const found = codeSymbolPatterns(check.target).some((regex) => regex.test(text));
      return found
        ? pass(`Met: found a definition for "${check.target}".`)
        : fail(`Not met: no definition for "${check.target}" was found.`);
    }
    default:
      return fail("Not met: this criterion uses an unsupported check type.");
  }
}
