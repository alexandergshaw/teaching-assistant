// Unit tests for log-file-name.ts, the leaf lifted out of repo-grading-log.ts
// / message-replies-log.ts / discussion-replies-log.ts (each carried a
// byte-identical private copy of slugify/fileStamp - see this module's own
// header). Frozen literal oracles: the three log modules' own filename tests
// exercise `logFileName` indirectly through their own `<prefix>` and must
// keep passing unchanged, which is the proof this lift is behaviour-
// preserving; this file pins the leaf's own contract directly.

import { describe, it, expect } from "vitest";
import { slugify, fileStamp, logFileName } from "./log-file-name";

describe("slugify", () => {
  it("lowercases, collapses non-alphanumerics to single dashes, and trims the ends", () => {
    expect(slugify("CS 101: Intro")).toBe("cs-101-intro");
  });

  it("returns an empty string for input that slugs to nothing", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("fileStamp", () => {
  it("renders an ISO timestamp as YYYYMMDD-HHMMSS, dropping sub-second precision", () => {
    expect(fileStamp("2026-08-24T15:04:05.123Z")).toBe("20260824-150405");
  });

  it("falls back to a sanitized version of the input when it does not match the expected shape", () => {
    expect(fileStamp("not-a-timestamp")).toBe("not-a-timestamp");
  });
});

describe("logFileName", () => {
  it("builds <prefix>-<name-slug>-<YYYYMMDD-HHMMSS>.<extension>", () => {
    expect(logFileName("repo-grading-log", "CS 101", "md", "2026-08-24T15:04:05.123Z")).toBe(
      "repo-grading-log-cs-101-20260824-150405.md"
    );
  });

  it("drops the name segment entirely (no dangling double dash) when it slugifies to nothing", () => {
    expect(logFileName("repo-grading-log", "!!!", "csv", "2026-08-24T15:04:05.123Z")).toBe(
      "repo-grading-log-20260824-150405.csv"
    );
  });

  it("works with a different prefix, matching each log module's own convention", () => {
    expect(logFileName("message-replies-log", "CS 101: Intro", "csv", "2026-08-31T09:05:07.123Z")).toBe(
      "message-replies-log-cs-101-intro-20260831-090507.csv"
    );
  });
});
