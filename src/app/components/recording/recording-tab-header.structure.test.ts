import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// A18, AC-5: the shared TabShell title AND subtitle, rendered above every one
// of the twelve inner views of the Recording tab, must stop asserting a
// universal "this tab records" claim that is false for most of its own
// views. Moved into this brand-new, A18-exclusive file (rather than
// recording-split.structure.test.ts, which already reads RecordingTab.tsx
// for unrelated reasons and is also A20's file) to stay file-disjoint from
// A20's own concurrent edits to that file - see docs/a18-scope.md section 3.
//
// Per ruling Z2, both strings are frozen as exact literals (after whitespace
// normalization) rather than checked by keyword presence - a keyword check
// was demonstrated exploitable by appending words that satisfy the regex
// while still making the false claim.

const RECORDING_TAB_PATH = path.resolve(process.cwd(), "src/app/components/RecordingTab.tsx");
const source = fs.readFileSync(RECORDING_TAB_PATH, "utf-8");

const FROZEN_TITLE = "Recording, Capture & Playback Tools";
const FROZEN_SUBTITLE =
  "Recording, capture, and playback tools for this course. Some record and " +
  "preview live; others read a shared screen, or work from a recording you " +
  "already have.";

function resolveAttr(nearEyebrow: string, attr: "title" | "subtitle"): string {
  const inlineMatch = nearEyebrow.match(new RegExp(`${attr}="([^"]*)"`));
  if (inlineMatch) return inlineMatch[1];
  const refMatch = nearEyebrow.match(new RegExp(`${attr}=\\{([A-Za-z0-9_]+)\\}`));
  expect(
    refMatch,
    `expected an inline ${attr}="..." or a {CONST_NAME} reference near the Recording tab's TabShell`
  ).toBeTruthy();
  const constName = refMatch![1];
  const constMatch = source.match(new RegExp(`const ${constName}\\s*=\\s*"([^"]*)"`));
  expect(constMatch, `expected to find ${constName}'s own string assignment in this file`).toBeTruthy();
  return constMatch![1];
}

describe("A18 AC-5: RecordingTab.tsx's shared TabShell title and subtitle stop promising every inner view records", () => {
  const eyebrowIdx = source.indexOf('eyebrow="Recording"');

  it("finds eyebrow=\"Recording\" on the TabShell this tool is rendered under (anchor resolves)", () => {
    expect(
      eyebrowIdx,
      "expected to find eyebrow=\"Recording\" on the TabShell this tool is rendered under"
    ).toBeGreaterThan(-1);
  });

  const nearEyebrow = source.slice(eyebrowIdx, eyebrowIdx + 400);

  it("finds a title attribute or reference within 400 characters of the eyebrow (anchor resolves)", () => {
    const titleText = resolveAttr(nearEyebrow, "title");
    expect(titleText.length).toBeGreaterThan(0);
  });

  it("finds a subtitle attribute or reference within 400 characters of the eyebrow (anchor resolves)", () => {
    const subtitleText = resolveAttr(nearEyebrow, "subtitle");
    expect(subtitleText.length).toBeGreaterThan(0);
  });

  it("the title is exactly the frozen replacement literal, not the old camera-only claim", () => {
    const titleText = resolveAttr(nearEyebrow, "title");
    expect(titleText.replace(/\s+/g, " ").trim()).toBe(FROZEN_TITLE);
  });

  it("the subtitle is exactly the frozen replacement literal, not the old camera-only claim", () => {
    const subtitleText = resolveAttr(nearEyebrow, "subtitle");
    expect(subtitleText.replace(/\s+/g, " ").trim()).toBe(FROZEN_SUBTITLE);
  });
});
