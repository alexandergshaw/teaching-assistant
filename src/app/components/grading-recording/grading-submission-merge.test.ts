import { describe, it, expect } from "vitest";
import {
  studentNamesMatch,
  submissionTextSimilarityDistance,
  isSameSubmission,
  mergeExtractedSubmissions,
  findContinuationOverlap,
  PREFIX_TOKENS,
  SIMILARITY_THRESHOLD,
  MIN_TOKENS_FOR_SIMILARITY,
  WEAK_NAME_SIMILARITY_THRESHOLD,
  CONTINUATION_OVERLAP_TOKENS,
  type ExtractedSubmission,
} from "./grading-submission-merge";

describe("constants", () => {
  it("are positive, sane values", () => {
    expect(PREFIX_TOKENS).toBeGreaterThan(0);
    expect(SIMILARITY_THRESHOLD).toBeGreaterThan(0);
    expect(SIMILARITY_THRESHOLD).toBeLessThan(1);
    expect(MIN_TOKENS_FOR_SIMILARITY).toBeGreaterThan(0);
    expect(WEAK_NAME_SIMILARITY_THRESHOLD).toBeGreaterThan(0);
    // The weak (cropped-name) tier must be strictly tighter than the
    // general threshold, or it would offer no extra protection at all.
    expect(WEAK_NAME_SIMILARITY_THRESHOLD).toBeLessThan(SIMILARITY_THRESHOLD);
    expect(CONTINUATION_OVERLAP_TOKENS).toBeGreaterThan(0);
  });
});

describe("studentNamesMatch", () => {
  it("matches identical names", () => {
    expect(studentNamesMatch("Maria Alvarez", "Maria Alvarez")).toBe(true);
  });

  it("matches case- and whitespace-insensitively", () => {
    expect(studentNamesMatch("  MARIA   alvarez ", "maria alvarez")).toBe(true);
  });

  it("tolerates a middle initial appearing in one read but not the other", () => {
    expect(studentNamesMatch("Maria J. Alvarez", "Maria Alvarez")).toBe(true);
  });

  it("tolerates a surname-only read matching a full name", () => {
    expect(studentNamesMatch("Alvarez", "Maria Alvarez")).toBe(true);
  });

  it("does not match two different surnames", () => {
    expect(studentNamesMatch("Maria Alvarez", "Maria Chen")).toBe(false);
  });

  it("does not match two different students who happen to share a first name", () => {
    expect(studentNamesMatch("Maria Alvarez", "Maria Chen")).toBe(false);
  });

  it("does not match two different students who share a surname", () => {
    // Surname-anchoring alone would wrongly match these - the first-token
    // check (or single-token fallback) is what keeps siblings/cousins with
    // the same surname apart when BOTH sides give a full name.
    expect(studentNamesMatch("Maria Chen", "David Chen")).toBe(false);
  });
});

describe("submissionTextSimilarityDistance", () => {
  it("is 0 for identical text", () => {
    expect(submissionTextSimilarityDistance("the quick brown fox jumps", "the quick brown fox jumps")).toBe(0);
  });

  it("is low for a shorter re-read that is a true prefix of a longer one", () => {
    const full = "the quick brown fox jumps over the lazy dog near the old stone bridge";
    const partial = "the quick brown fox jumps over the lazy dog";
    expect(submissionTextSimilarityDistance(full, partial)).toBeLessThanOrEqual(SIMILARITY_THRESHOLD);
  });

  it("is high for genuinely different text", () => {
    const a = "photosynthesis converts light energy into chemical energy in plants";
    const b = "the french revolution began in seventeen eighty nine with the storming";
    expect(submissionTextSimilarityDistance(a, b)).toBeGreaterThan(SIMILARITY_THRESHOLD);
  });
});

describe("isSameSubmission - identity fields and their stability", () => {
  it("matches two overlapping reads of the same submission (name matches, text is a prefix/re-read)", () => {
    const a = { name: "Maria Alvarez", text: "The mitochondria is the powerhouse of the cell and produces ATP through respiration" };
    const b = { name: "Maria Alvarez", text: "The mitochondria is the powerhouse of the cell and produces ATP" };
    expect(isSameSubmission(a, b)).toBe(true);
  });

  it("does NOT merge two different students' submissions, even with similar text", () => {
    const a = { name: "Maria Alvarez", text: "The mitochondria is the powerhouse of the cell and produces ATP" };
    const b = { name: "David Chen", text: "The mitochondria is the powerhouse of the cell and produces ATP" };
    expect(isSameSubmission(a, b)).toBe(false);
  });

  it("does NOT merge the same student's two genuinely different submissions (e.g. two different questions)", () => {
    const a = { name: "Maria Alvarez", text: "Question one: photosynthesis converts light energy into chemical energy" };
    const b = { name: "Maria Alvarez", text: "Question two: the french revolution began in seventeen eighty nine" };
    expect(isSameSubmission(a, b)).toBe(false);
  });

  it("falls back to exact normalized-text equality when either side is too short for token similarity (MIN_TOKENS_FOR_SIMILARITY)", () => {
    const a = { name: "Maria Alvarez", text: "Yes" };
    const b = { name: "Maria Alvarez", text: "Yes" };
    expect(isSameSubmission(a, b)).toBe(true);

    const c = { name: "Maria Alvarez", text: "Yes" };
    const d = { name: "Maria Alvarez", text: "No" };
    expect(isSameSubmission(c, d)).toBe(false);
  });

  it("name is the primary gate - a text match alone is never enough", () => {
    const a = { name: "Maria Alvarez", text: "Short answer text here" };
    const b = { name: "Someone Else Entirely", text: "Short answer text here" };
    expect(isSameSubmission(a, b)).toBe(false);
  });
});

describe("mergeExtractedSubmissions", () => {
  it("adds a brand-new submission when nothing matches", () => {
    const existing: ExtractedSubmission[] = [];
    const result = mergeExtractedSubmissions(existing, [{ name: "Maria Alvarez", text: "A real submission with enough words to compare" }]);
    expect(result.submissions).toHaveLength(1);
    expect(result.addedCount).toBe(1);
    expect(result.mergedCount).toBe(0);
  });

  it("merges a re-read of the same submission into the existing entry rather than adding a duplicate row", () => {
    const existing: ExtractedSubmission[] = [
      { name: "Maria Alvarez", text: "The mitochondria is the powerhouse of the cell" },
    ];
    const result = mergeExtractedSubmissions(existing, [
      { name: "Maria Alvarez", text: "The mitochondria is the powerhouse of the cell and produces ATP through respiration" },
    ]);
    expect(result.submissions).toHaveLength(1);
    expect(result.addedCount).toBe(0);
    expect(result.mergedCount).toBe(1);
    // Longer reading wins.
    expect(result.submissions[0].text).toContain("respiration");
  });

  it("does NOT merge two different students' submissions into one row", () => {
    const existing: ExtractedSubmission[] = [
      { name: "Maria Alvarez", text: "The mitochondria is the powerhouse of the cell and produces ATP" },
    ];
    const result = mergeExtractedSubmissions(existing, [
      { name: "David Chen", text: "The mitochondria is the powerhouse of the cell and produces ATP" },
    ]);
    expect(result.submissions).toHaveLength(2);
    expect(result.addedCount).toBe(1);
    expect(result.mergedCount).toBe(0);
  });

  it("keeps the equal-or-shorter reading unapplied (the first/longer version wins) and does not change the array entry's identity when nothing changes", () => {
    const existing: ExtractedSubmission[] = [
      { name: "Maria Alvarez", text: "The mitochondria is the powerhouse of the cell and produces ATP through respiration" },
    ];
    const existingRef = existing[0];
    const result = mergeExtractedSubmissions(existing, [
      { name: "Maria Alvarez", text: "The mitochondria is the powerhouse of the cell" },
    ]);
    expect(result.mergedCount).toBe(1);
    expect(result.submissions[0].text).toBe(existingRef.text);
    expect(result.submissions[0]).toBe(existingRef);
  });

  it("collapses two matching entries within the SAME incoming batch to one row", () => {
    const result = mergeExtractedSubmissions([], [
      { name: "Maria Alvarez", text: "The mitochondria is the powerhouse of the cell" },
      { name: "Maria Alvarez", text: "The mitochondria is the powerhouse of the cell and produces ATP through respiration" },
    ]);
    expect(result.submissions).toHaveLength(1);
    expect(result.addedCount).toBe(1);
    expect(result.mergedCount).toBe(1);
    expect(result.submissions[0].text).toContain("respiration");
  });

  it("handles an empty incoming batch as a no-op", () => {
    const existing: ExtractedSubmission[] = [{ name: "Maria Alvarez", text: "Some submission text here" }];
    const result = mergeExtractedSubmissions(existing, []);
    expect(result.submissions).toEqual(existing);
    expect(result.addedCount).toBe(0);
    expect(result.mergedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The cropped-surname attack: a header read as just a surname must not
// carry identity on its own - it needs a near-verbatim text match
// (WEAK_NAME_SIMILARITY_THRESHOLD), not merely SIMILARITY_THRESHOLD, before
// two readings are trusted as the same submission.
// ---------------------------------------------------------------------------

describe("cropped-surname attack - a single-token name is corroborating evidence, not identity", () => {
  // Two DIFFERENT students' genuinely different answers, which happen to be
  // similar enough in wording to clear the general SIMILARITY_THRESHOLD
  // (distance 2/14 ~= 0.143), but must NOT clear the tighter
  // WEAK_NAME_SIMILARITY_THRESHOLD (0.05) a cropped name is held to.
  const fullReading = {
    name: "John Smith",
    text: "The sky appears blue because molecules in the air scatter blue light more than other colors",
  };
  // Same wording, two word swaps, and a HEADER CROPPED DOWN TO JUST THE
  // SURNAME - exactly the failure mode described in the review: "Smith"
  // matches every Smith in the class under the old single-token fallback.
  const croppedReadingOfADifferentSmith = {
    name: "Smith",
    text: "The sky looks blue because particles in the air scatter blue light more than other colors",
  };

  it("confirms the two readings' text is similar enough to clear the general threshold on its own", () => {
    const distance = submissionTextSimilarityDistance(fullReading.text, croppedReadingOfADifferentSmith.text);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThanOrEqual(SIMILARITY_THRESHOLD);
  });

  it("does NOT merge a cropped surname against a different student whose text merely resembles this one", () => {
    expect(isSameSubmission(fullReading, croppedReadingOfADifferentSmith)).toBe(false);
  });

  it("DOES merge the exact same text under an EXACT name match - the text signal alone was always trustworthy here, only the cropped name was the risk", () => {
    const sameStudentFullName = { name: "John Smith", text: croppedReadingOfADifferentSmith.text };
    expect(isSameSubmission(fullReading, sameStudentFullName)).toBe(true);
  });

  it("a cropped surname STILL joins its OWN submission's fuller reading (near-verbatim text) - the crop tolerance is not removed, only demoted to needing real corroboration", () => {
    const sameSubmissionCropped = { name: "Smith", text: fullReading.text };
    expect(isSameSubmission(fullReading, sameSubmissionCropped)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The combined attack from the review: a cropped name PLUS two different
// students restating the same assignment prompt/template before their
// (different) real content. The old text window (first 40 raw tokens) sat
// entirely inside the shared template for a long-enough submission, scoring
// distance 0 - "identical" - instead of a real distance. Fixed by comparing
// the window that starts where the two readings actually diverge.
// ---------------------------------------------------------------------------

describe("shared-opening-template collision - two different students restating the same prompt", () => {
  // A 42-token restated assignment prompt, byte-identical for every
  // student who copies it verbatim before writing their own answer - long
  // enough to consume the ENTIRE old 40-token comparison window by itself.
  const sharedTemplate =
    "In this assignment I will respond to the essay prompt by discussing how tensions between the thirteen American colonies and the British government grew throughout the seventeen sixties and seventeen seventies over issues of taxation representation and trade before finally resulting in";

  const johnsSubmission = {
    name: "John Smith",
    text: `${sharedTemplate} the Boston Tea Party and other acts of colonial protest against unfair British taxes`,
  };
  // A DIFFERENT student who shares John's surname, read off a cropped
  // header as just "Smith" - the same crop the previous describe block
  // covers, combined here with the shared-template text collision.
  const annasSubmissionCroppedName = {
    name: "Smith",
    text: `${sharedTemplate} the outbreak of armed conflict at Lexington and Concord in April of that year`,
  };

  it("the two submissions' real (post-template) content is genuinely different, not near-0 distance", () => {
    const distance = submissionTextSimilarityDistance(johnsSubmission.text, annasSubmissionCroppedName.text);
    expect(distance).toBeGreaterThan(SIMILARITY_THRESHOLD);
  });

  it("does NOT fuse two different students into one row just because they restate the same prompt and one header is cropped", () => {
    expect(isSameSubmission(johnsSubmission, annasSubmissionCroppedName)).toBe(false);
  });

  it("mergeExtractedSubmissions keeps both students as separate rows - the second student is never lost", () => {
    const result = mergeExtractedSubmissions([johnsSubmission], [annasSubmissionCroppedName]);
    expect(result.submissions).toHaveLength(2);
    expect(result.addedCount).toBe(1);
    expect(result.mergedCount).toBe(0);
  });

  it("a genuine re-read of John's OWN submission (same shared template, same real content, exact name) still merges", () => {
    const johnsRereadShorter = {
      name: "John Smith",
      text: `${sharedTemplate} the Boston Tea Party and other acts of colonial protest against unfair`,
    };
    expect(isSameSubmission(johnsSubmission, johnsRereadShorter)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The similarity boundary itself, with realistic text either side of the
// REAL threshold (0.25) - not the 0/1 extremes every fixture used to sit
// at, which could not have caught SIMILARITY_THRESHOLD drifting to 0.99.
// ---------------------------------------------------------------------------

describe("SIMILARITY_THRESHOLD boundary - realistic text on both sides, and exactly at it", () => {
  // 20 tokens, realistic student-submission prose about mitochondria.
  const base =
    "Mitochondria are membrane bound structures inside cells that convert nutrients into usable chemical energy through a process called cellular respiration";

  // Differs from `base` at exactly 4 of 20 token positions (0.20 distance)
  // - INSIDE the threshold (SIMILARITY_THRESHOLD = 0.25).
  const near =
    "Mitochondrion are membrane bound organelles inside cells that convert molecules into usable chemical power through a process called cellular respiration";

  // Differs from `base` at exactly 5 of 20 token positions (0.25 distance)
  // - EXACTLY at the threshold (the `<=` comparison is boundary-inclusive).
  const atBoundary =
    "Mitochondrion are membrane bound organelles inside cells that convert molecules into usable chemical power through a method called cellular respiration";

  // Differs from `base` at exactly 7 of 20 token positions (0.35 distance)
  // - OUTSIDE the threshold.
  const far =
    "Chloroplasts are rigid bound structures within cells which convert nutrients to usable chemical energy via a process named cellular respiration";

  it("scores 0.20 for the near variant - inside the threshold", () => {
    expect(submissionTextSimilarityDistance(base, near)).toBeCloseTo(0.2, 10);
  });

  it("scores exactly 0.25 for the at-boundary variant - AT the threshold", () => {
    expect(submissionTextSimilarityDistance(base, atBoundary)).toBeCloseTo(0.25, 10);
  });

  it("scores 0.35 for the far variant - outside the threshold", () => {
    expect(submissionTextSimilarityDistance(base, far)).toBeCloseTo(0.35, 10);
  });

  it("isSameSubmission merges the near and at-boundary variants (same exact name) but not the far one", () => {
    const a = { name: "Maria Alvarez", text: base };
    expect(isSameSubmission(a, { name: "Maria Alvarez", text: near })).toBe(true);
    expect(isSameSubmission(a, { name: "Maria Alvarez", text: atBoundary })).toBe(true);
    expect(isSameSubmission(a, { name: "Maria Alvarez", text: far })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A long submission split across two extraction batches: the second
// batch's reading starts mid-document (no shared opening with the first
// batch's reading at all), so it must rejoin via the continuation splice,
// not the opening-similarity check.
// ---------------------------------------------------------------------------

describe("continuation across batches - a body-only later reading rejoins its top-only earlier reading", () => {
  const topOfSubmission = {
    name: "Maria Alvarez",
    text: "Mitochondria are the powerhouse of the cell and they produce energy during the process of cellular respiration",
  };
  // Genuinely different opening (no shared prefix with topOfSubmission at
  // all) - this is the MIDDLE of the same document, read in a later batch.
  // Its first six tokens ("during the process of cellular respiration")
  // are the splice: the last six tokens of topOfSubmission, repeated
  // because the two batches' frames overlapped slightly across the
  // boundary.
  const bodyOfSubmission = {
    name: "Maria Alvarez",
    text: "During the process of cellular respiration the cell converts glucose into usable energy in the form of ATP molecules for the organism to use",
  };

  it("findContinuationOverlap finds the splice point", () => {
    expect(findContinuationOverlap(topOfSubmission.text, bodyOfSubmission.text)).toBe(CONTINUATION_OVERLAP_TOKENS);
  });

  it("findContinuationOverlap finds nothing for two texts with no shared splice", () => {
    expect(findContinuationOverlap(topOfSubmission.text, "A completely unrelated sentence about something else entirely")).toBeNull();
  });

  it("the opening-similarity check alone does NOT see these as the same submission - confirms the gap this fix closes", () => {
    const distance = submissionTextSimilarityDistance(topOfSubmission.text, bodyOfSubmission.text);
    expect(distance).toBeGreaterThan(SIMILARITY_THRESHOLD);
  });

  it("isSameSubmission recognizes the continuation despite the openings not matching", () => {
    expect(isSameSubmission(topOfSubmission, bodyOfSubmission)).toBe(true);
  });

  it("mergeExtractedSubmissions JOINS a continuation into ONE row, with the full text and no duplicated splice phrase", () => {
    const result = mergeExtractedSubmissions([topOfSubmission], [bodyOfSubmission]);
    expect(result.submissions).toHaveLength(1);
    expect(result.addedCount).toBe(0);
    expect(result.mergedCount).toBe(1);
    expect(result.submissions[0].text).toBe(
      "Mitochondria are the powerhouse of the cell and they produce energy during the process of cellular respiration the cell converts glucose into usable energy in the form of ATP molecules for the organism to use"
    );
    // The splice phrase appears exactly once, not twice.
    const occurrences = result.submissions[0].text.split("during the process of cellular respiration").length - 1;
    expect(occurrences).toBe(1);
  });

  it("a continuation from a DIFFERENT student's name is never joined, even if the text happens to splice", () => {
    const differentStudentBody = { name: "David Chen", text: bodyOfSubmission.text };
    expect(isSameSubmission(topOfSubmission, differentStudentBody)).toBe(false);
    const result = mergeExtractedSubmissions([topOfSubmission], [differentStudentBody]);
    expect(result.submissions).toHaveLength(2);
  });

  it("a cropped (weak) name match alone does not qualify for the continuation path, even with a real splice", () => {
    const croppedBody = { name: "Alvarez", text: bodyOfSubmission.text };
    // studentNamesMatch still tolerates the crop as a name...
    expect(studentNamesMatch(topOfSubmission.name, croppedBody.name)).toBe(true);
    // ...but the continuation path itself requires "exact" confidence, and
    // the text alone (opening-similarity) does not clear even the general
    // threshold here (it is a genuine continuation, not a re-read), so this
    // must NOT merge - a cropped name is not strong enough evidence to
    // resolve a case the text similarity itself cannot confirm.
    expect(isSameSubmission(topOfSubmission, croppedBody)).toBe(false);
  });
});
