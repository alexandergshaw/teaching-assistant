import { describe, it, expect } from "vitest";
import {
  readPersistedSpeedRate,
  formatCostLine,
  formatProgressLine,
  formatProgressAriaValueText,
  crossedAnnounceThreshold,
  stageStatusMessage,
  describeError,
  stageFailureMessage,
  successMessage,
  NOT_SIGNED_IN_MESSAGE,
  CANCELLED_MESSAGE,
  NO_SOURCE_MESSAGE,
  PITCH_FALLBACK_MESSAGE,
  KEEP_OPEN_WARNING,
  DEFAULT_SPEED_RATE,
} from "./useVideoSpeed";

// This suite is node-env and renders no component (see the acceptance
// criteria's Limits section) - it covers only the pure helpers extracted out
// of useVideoSpeed.ts. Nothing here exercises the renderer, the preview
// element, focus movement, or ARIA wiring in the actual DOM; those are
// VERIFY items for a human in a browser.

describe("readPersistedSpeedRate", () => {
  it("accepts a valid stored rate", () => {
    expect(readPersistedSpeedRate("2")).toBe(2);
    expect(readPersistedSpeedRate("0.5")).toBe(0.5);
  });

  it("falls back to the default for a rate the current build no longer offers", () => {
    expect(readPersistedSpeedRate("1.3")).toBe(DEFAULT_SPEED_RATE);
    expect(readPersistedSpeedRate("4")).toBe(DEFAULT_SPEED_RATE);
  });

  it("falls back to the default for null or garbage", () => {
    expect(readPersistedSpeedRate(null)).toBe(DEFAULT_SPEED_RATE);
    expect(readPersistedSpeedRate("not-a-number")).toBe(DEFAULT_SPEED_RATE);
  });
});

describe("formatCostLine (AC11)", () => {
  it("states the generic slow-down warning until a source's duration is known", () => {
    expect(formatCostLine(null, 1.5)).toBe(
      "Re-encoding plays the video through in real time, so a slower copy takes longer to make than the original is long."
    );
  });

  it("computes the real wall-clock cost for a 10:00 source at 1.5x (AC's own worked example)", () => {
    expect(formatCostLine(600, 1.5)).toBe(
      "Re-encoding plays the video through in real time - about 6:40 at 1.5x - and the copy will be 6:40 long."
    );
  });

  it("does not soften the slow-down case: a 10:00 source at 0.5x costs 20:00", () => {
    expect(formatCostLine(600, 0.5)).toBe(
      "Re-encoding plays the video through in real time - about 20:00 at 0.5x - and the copy will be 20:00 long."
    );
  });
});

describe("formatProgressLine / formatProgressAriaValueText (AC12)", () => {
  it("renders the visible progress line", () => {
    expect(formatProgressLine(1.5, 40, 240)).toBe("Re-encoding at 1.5x - 40% - about 4:00 left");
  });

  it("renders the spoken aria-valuetext form of the same facts", () => {
    expect(formatProgressAriaValueText(1.5, 40, 240)).toBe("Re-encoding at 1.5x, 40 percent, about 4:00 left");
  });
});

describe("crossedAnnounceThreshold (AC12: stage changes + roughly every 25 percent, not every tick)", () => {
  it("does not announce within the same quarter", () => {
    expect(crossedAnnounceThreshold(0, 0)).toBe(false);
    expect(crossedAnnounceThreshold(0, 24)).toBe(false);
    expect(crossedAnnounceThreshold(25, 25)).toBe(false);
    expect(crossedAnnounceThreshold(25, 49)).toBe(false);
  });

  it("announces on crossing each quarter boundary", () => {
    expect(crossedAnnounceThreshold(0, 25)).toBe(true);
    expect(crossedAnnounceThreshold(49, 50)).toBe(true);
    expect(crossedAnnounceThreshold(74, 75)).toBe(true);
    expect(crossedAnnounceThreshold(90, 100)).toBe(true);
  });

  it("does not double-announce a value that was already announced", () => {
    expect(crossedAnnounceThreshold(100, 100)).toBe(false);
  });
});

describe("stageStatusMessage", () => {
  it("has a distinct string for each in-flight stage", () => {
    expect(stageStatusMessage("reading")).toBe("Reading the video.");
    expect(stageStatusMessage("rendering")).toBe("Re-encoding started.");
    expect(stageStatusMessage("saving")).toBe("Re-encoding finished. Saving to the Files tab.");
  });
});

describe("describeError", () => {
  it("uses an Error's own message", () => {
    expect(describeError(new Error("disk full"))).toBe("disk full");
  });

  it("falls back to a generic reason for a non-Error throw", () => {
    expect(describeError("boom")).toBe("unknown error");
    expect(describeError(undefined)).toBe("unknown error");
  });
});

describe("stageFailureMessage (AC13: each stage's failure is distinguishable)", () => {
  it("reading", () => {
    expect(stageFailureMessage("reading", "disk full")).toBe("Could not read that video - disk full. Nothing was saved.");
  });

  it("rendering", () => {
    expect(stageFailureMessage("rendering", "disk full")).toBe(
      "Could not re-encode this video - disk full. Nothing was saved."
    );
  });

  it("saving", () => {
    expect(stageFailureMessage("saving", "disk full")).toBe(
      "The video was made but could not be saved to the Files tab - disk full. Try saving again."
    );
  });

  it("the three stage messages are pairwise distinct for the same reason", () => {
    const reading = stageFailureMessage("reading", "x");
    const rendering = stageFailureMessage("rendering", "x");
    const saving = stageFailureMessage("saving", "x");
    expect(new Set([reading, rendering, saving]).size).toBe(3);
  });
});

describe("successMessage (AC14: names the next step in the chain)", () => {
  it("names the saved file and points at Caption Studio's Refresh button", () => {
    expect(successMessage("Week 3 module (1.5x)")).toBe(
      'Saved "Week 3 module (1.5x)" to the Files tab. To caption it, open Caption a video and press Refresh under "From the Files tab".'
    );
  });
});

describe("pinned copy constants (AC17)", () => {
  it("matches the acceptance criteria's copy table verbatim", () => {
    expect(NOT_SIGNED_IN_MESSAGE).toBe("Sign in to save to the Files tab.");
    expect(CANCELLED_MESSAGE).toBe("Cancelled - nothing was saved.");
    expect(NO_SOURCE_MESSAGE).toBe("Pick a video first.");
    expect(PITCH_FALLBACK_MESSAGE).toBe(
      "This browser could not hold the pitch steady, so voices will sound higher or lower."
    );
    expect(KEEP_OPEN_WARNING).toBe(
      "Keep this tab open - the re-encode runs in this browser and stops if you close the page."
    );
  });
});
