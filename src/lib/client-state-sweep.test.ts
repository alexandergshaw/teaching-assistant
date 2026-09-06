import { describe, expect, it } from "vitest";
import {
  DEVICE_PREFERENCE_KEYS,
  INDEXED_DB_NAMES,
  shouldKeepLocalStorageKey,
} from "./client-state-sweep";

/**
 * What sign-out must erase from the browser, and the one small set it must
 * NOT (docs/multi-user-login-acceptance-criteria.md B6, as amended by the
 * data-engineering pass).
 *
 * THE DESIGN IS A KEEP-LIST, NOT A PREFIX SCAN, and that is the whole point
 * of this file. The acceptance criterion originally said "sweep the `ta-`,
 * `ta:` and `ta_` namespaces". Implemented literally, that ships the bug it
 * exists to prevent: sixteen keys written by the course-planning screens carry
 * no `ta` prefix at all, and two of them - `adapt_instructorName` and
 * `adapt_instructorEmail` - are the PREVIOUS USER'S NAME AND EMAIL, sitting in
 * the next person's form after a sign-out.
 *
 * So the rule is inverted. Everything goes unless it is named. A key added
 * later is then forgotten-and-erased, which is safe, rather than
 * forgotten-and-kept, which leaks. The cost is that a genuine device
 * preference has to be added here deliberately - which is the trade being
 * bought, not an oversight.
 */

describe("shouldKeepLocalStorageKey - the default is ERASE", () => {
  it("keeps the named device preferences", () => {
    for (const key of DEVICE_PREFERENCE_KEYS) {
      expect(shouldKeepLocalStorageKey(key), `${key} is a device preference`).toBe(true);
    }
  });

  it("keeps the theme, which is a device choice and not user data", () => {
    // Sweeping it flashes the app to light mode on every sign-in and
    // sign-out, because the anti-FOUC bootstrap reads it before React runs.
    expect(DEVICE_PREFERENCE_KEYS).toContain("ta-theme");
    expect(shouldKeepLocalStorageKey("ta-theme")).toBe(true);
  });

  it("erases prefixed keys that hold another person's work", () => {
    for (const key of [
      "ta-active-institution",
      "ta-institutions",
      "ta-workflows",
      "ta-voice-id",
      "ta-github-grading-run",
      "ta-grading-results-edits:https://canvas.example.edu",
      "ta-castletop-abc123-notes",
      "ta:chat-window-state",
      "ta_prompt_history",
    ]) {
      expect(shouldKeepLocalStorageKey(key), `${key} must be erased`).toBe(false);
    }
  });

  it("erases the UNPREFIXED course-planning keys - the ones a prefix scan misses", () => {
    // This is the specific bug the keep-list exists to prevent. Two of these
    // are the previous user's own name and email address.
    for (const key of [
      "adapt_instructorName",
      "adapt_instructorEmail",
      "adapt_courseName",
      "adapt_courseCode",
      "adapt_description",
      "adapt_textbookText",
      "adapt_startDate",
      "adapt_meetingDays",
      "adapt_meetingTimes",
      "adapt_location",
      "coursePlanning_planningMode",
      "schedule_courseDescription",
      "schedule_scheduleTerm",
      "schedule_scheduleStartDate",
      "schedule_scheduleWeeks",
      "schedule_scheduleTests",
    ]) {
      expect(shouldKeepLocalStorageKey(key), `${key} must be erased`).toBe(false);
    }
  });

  it("erases a key nobody has written yet", () => {
    // The property that makes this design safe: forgetting to consider a new
    // key erases it, rather than leaking it.
    for (const key of [
      "some-future-key",
      "ta-invented-tomorrow",
      "unrelated_vendor_key",
      "",
    ]) {
      expect(shouldKeepLocalStorageKey(key)).toBe(false);
    }
  });

  it("is total for input that is not a string", () => {
    for (const key of [null, undefined, 42, {}]) {
      expect(shouldKeepLocalStorageKey(key as never)).toBe(false);
    }
  });

  it("matches a keep-listed key exactly, not by prefix", () => {
    // "ta-theme-something" is not the theme, and must not inherit its
    // exemption.
    expect(shouldKeepLocalStorageKey("ta-theme-extra")).toBe(false);
    expect(shouldKeepLocalStorageKey("ta-them")).toBe(false);
    expect(shouldKeepLocalStorageKey(" ta-theme")).toBe(false);
  });
});

describe("the keep-list is small and justified", () => {
  it("stays short - every entry is a decision someone has to defend", () => {
    expect(DEVICE_PREFERENCE_KEYS.length).toBeGreaterThan(0);
    expect(DEVICE_PREFERENCE_KEYS.length).toBeLessThanOrEqual(6);
  });

  it("contains no key that looks like user content", () => {
    for (const key of DEVICE_PREFERENCE_KEYS) {
      for (const smell of ["instructor", "course", "grading", "workflow", "institution", "prompt"]) {
        expect(key.toLowerCase(), `${key} looks like user data, not a device preference`).not.toContain(
          smell
        );
      }
    }
  });
});

describe("both IndexedDB databases are named", () => {
  it("names the two databases that survive a sign-out today", () => {
    // One holds a granted OS directory handle - the next user's recordings
    // would be written into the previous user's folder with no prompt. The
    // other holds raw uploaded File blobs.
    expect([...INDEXED_DB_NAMES].sort()).toEqual(["ta-backup", "teaching-assistant-files"]);
  });
});
