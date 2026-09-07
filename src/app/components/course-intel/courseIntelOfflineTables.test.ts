import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// THE OFFLINE ANSWER IS BUILT FROM THREE localStorage TABLES THIS FILE'S
// DIRECTORY DOES NOT OWN.
//
// useGradingRows.ts owns "ta-rec-grade-table", useReplyRows.ts owns
// "ta-rec-disc-table", and useGradingAssessmentDeclarations.ts owns
// "ta-rec-grade-declarations". None of them exports its key - each is a
// module-private `const STORAGE_KEY_*` - so useCourseIntel.ts spells the same
// three literals to read them.
//
// WHAT GOES WRONG WITHOUT THIS CHECK, and it is the exact confidently-wrong
// shape this whole feature exists to avoid: a rename in one of those three
// modules leaves the reader here pointing at a key nothing writes, every
// offline answer is built from an empty table, and it reads as "you have
// recorded nothing for this course" rather than as a failure. Nothing else in
// the repo connects the two sides - the grading-recording directory's own key
// canary scans only its own directory, and the recording split check only
// scans its own.
//
// Read as source text rather than imported because the constants are private
// on both sides on purpose. The keys are spelled as WHOLE literals here, never
// a prefix plus a suffix, mirroring grading-rows.test.ts's own rule: a bare
// prefix in this file would be harvested by that directory's regex as a fake
// key with an empty suffix.

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), "utf-8");

const CONSUMER = "src/app/components/course-intel/useCourseIntel.ts";

const OWNED_KEYS: readonly { key: string; owner: string }[] = [
  { key: "ta-rec-grade-table", owner: "src/app/components/grading-recording/useGradingRows.ts" },
  { key: "ta-rec-disc-table", owner: "src/app/components/recording/useReplyRows.ts" },
  { key: "ta-rec-grade-declarations", owner: "src/app/components/grading-recording/useGradingAssessmentDeclarations.ts" },
];

describe("the offline reader points at the keys the recording suite actually writes", () => {
  const consumer = read(CONSUMER);

  it("finds the keys it is going to check - a check over nothing proves nothing", () => {
    expect(OWNED_KEYS.length).toBe(3);
    for (const { key } of OWNED_KEYS) expect(consumer).toContain(`"${key}"`);
  });

  it.each(OWNED_KEYS)("$key is still declared as a storage key by $owner", ({ key, owner }) => {
    expect(read(owner)).toMatch(new RegExp(`const\\s+STORAGE_KEY_\\w+\\s*=\\s*"${key}"`));
  });

  it.each(OWNED_KEYS)("$key is read by useCourseIntel.ts through localStorage", ({ key }) => {
    // Bound to a const and read via that identifier - the same "direct or
    // indirect" shape grading-rows.test.ts accepts for its own keys.
    const constNames = [...consumer.matchAll(new RegExp(`const\\s+(\\w+)\\s*=\\s*"${key}"`, "g"))].map((m) => m[1]);
    expect(constNames.length, `expected a const bound to "${key}"`).toBeGreaterThan(0);
    const wired = constNames.some((name) => new RegExp(`readLocalStorage\\(\\s*${name}\\s*\\)`).test(consumer));
    expect(wired, `expected a localStorage read wired to "${key}"`).toBe(true);
  });

  it("uses each owner's own deserializer rather than a second parser", () => {
    // A hand-rolled JSON.parse here would silently disagree with the store's
    // own version guard and its per-record drop rules the first time either
    // changed.
    expect(consumer).toContain("deserializeGradingRows");
    expect(consumer).toContain("deserializeReplyTable");
    expect(consumer).toContain("deserializeGradingDeclarations");
  });

  it("sends no student prose from any of the three tables", () => {
    // The wire projection names its fields explicitly. These six are the ones
    // that carry a student's or an instructor's written words, and none of
    // them may appear in the request body this hook builds.
    const wireSection = consumer.slice(consumer.indexOf("export function readOfflineRecordedTables"));
    expect(wireSection.length).toBeGreaterThan(0);
    // WORD-BOUNDED, and that is not decoration: a plain substring search for
    // "row.post" matches "row.postedAt", which IS sent and must be, so the
    // naive version of this check fails on correct code and gets deleted.
    const forbidden = [/\brow\.submissionText\b/, /\brow\.strengths\b/, /\brow\.improvements\b/, /\brow\.overallComment\b/, /\brow\.post\b/, /\brow\.reply\b/];
    for (const pattern of forbidden) {
      expect(wireSection, `${pattern} must not be projected onto the wire`).not.toMatch(pattern);
    }
    // The positive control: the fields that ARE sent are in that same section,
    // so the search above ran over the code that builds the body.
    expect(wireSection).toContain("studentName: row.studentName");
    expect(wireSection).toContain("author: row.author");
  });
});
