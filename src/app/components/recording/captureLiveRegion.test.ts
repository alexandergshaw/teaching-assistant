// docs/recording-controls-ux-acceptance-criteria.md CC12/section 6.
// `composeCaptureLiveSentence` is pinned against a frozen fixture in the
// exact shape DiscussionRepliesPanel.tsx:101-118 emits (both nouns);
// `useThrottledLiveSentence` cannot be exercised directly (this repo's
// vitest is node-env - no component, and therefore no effect, ever runs),
// so its await-before-setState idiom is pinned as source text instead, the
// same way DiscussionRepliesPanel.tsx:383-401's own comment records the
// reason (this repo's eslint forbids reaching setState synchronously from
// inside a useEffect body).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { composeCaptureLiveSentence, type CaptureLiveSentenceArgs } from "./captureLiveRegion";

const POSTS = { one: "post", many: "posts" };
const SUBMISSIONS = { one: "submission", many: "submissions" };

function args(overrides: Partial<CaptureLiveSentenceArgs>): CaptureLiveSentenceArgs {
  return {
    count: 0,
    noun: POSTS,
    extracting: false,
    pendingFrames: 0,
    stalled: false,
    capturing: false,
    ...overrides,
  };
}

describe("composeCaptureLiveSentence", () => {
  it("stalled beats everything, and its wording is fixed regardless of the noun", () => {
    const expected =
      "Nothing new has been read off the screen for 30 seconds. Keep this app's tab visible in a second window while you scroll.";
    expect(composeCaptureLiveSentence(args({ stalled: true, capturing: true, count: 5 }))).toBe(expected);
    expect(composeCaptureLiveSentence(args({ stalled: true, noun: SUBMISSIONS, capturing: false }))).toBe(expected);
  });

  it("not capturing (and not stalled) is silent", () => {
    expect(composeCaptureLiveSentence(args({ capturing: false, count: 3 }))).toBe("");
  });

  it("capturing at zero uses the plural noun in the zero-state sentence", () => {
    expect(composeCaptureLiveSentence(args({ capturing: true, count: 0 }))).toBe("Capturing - 0 posts so far.");
    expect(composeCaptureLiveSentence(args({ capturing: true, count: 0, noun: SUBMISSIONS }))).toBe(
      "Capturing - 0 submissions so far."
    );
  });

  it("capturing at one uses the singular noun; capturing above one uses the plural", () => {
    expect(composeCaptureLiveSentence(args({ capturing: true, count: 1 }))).toBe("1 post found.");
    expect(composeCaptureLiveSentence(args({ capturing: true, count: 1, noun: SUBMISSIONS }))).toBe(
      "1 submission found."
    );
    expect(composeCaptureLiveSentence(args({ capturing: true, count: 4 }))).toBe("4 posts found.");
    expect(composeCaptureLiveSentence(args({ capturing: true, count: 4, noun: SUBMISSIONS }))).toBe(
      "4 submissions found."
    );
  });

  it("extracting and pendingFrames each append their own clause, in order, only while capturing", () => {
    expect(composeCaptureLiveSentence(args({ capturing: true, count: 2, extracting: true }))).toBe(
      "2 posts found. Reading the screen…"
    );
    expect(composeCaptureLiveSentence(args({ capturing: true, count: 2, pendingFrames: 3 }))).toBe(
      "2 posts found. Catching up - scroll a little slower."
    );
    expect(
      composeCaptureLiveSentence(args({ capturing: true, count: 2, extracting: true, pendingFrames: 3 }))
    ).toBe("2 posts found. Reading the screen… Catching up - scroll a little slower.");
  });
});

const HOOK_SOURCE_PATH = join(process.cwd(), "src/app/components/recording/captureLiveRegion.ts");
const source = readFileSync(HOOK_SOURCE_PATH, "utf8");

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("useThrottledLiveSentence - the await-before-setState idiom, pinned as source text", () => {
  const stripped = stripComments(source);

  it("SABOTAGE TARGET: the effect body carries a `cancelled` flag set on cleanup, not just declared and ignored", () => {
    expect(stripped).toMatch(/let cancelled = false;/);
    expect(stripped).toMatch(/cancelled = true;/);
    expect(stripped).toMatch(/if \(cancelled\) return;/);
  });

  it("setState is reached only AFTER an await inside the effect - never synchronously in the effect body", () => {
    const effectIdx = stripped.indexOf("useEffect(() => {");
    expect(effectIdx).toBeGreaterThan(-1);
    const awaitIdx = stripped.indexOf("await new Promise", effectIdx);
    const setStateIdx = stripped.indexOf("setAnnounced(sentence)", effectIdx);
    expect(awaitIdx).toBeGreaterThan(effectIdx);
    expect(setStateIdx).toBeGreaterThan(awaitIdx);
  });

  it("the async work is wrapped in `void (async () => { ... })()`, not passed directly as the effect callback (an effect callback must return void | a cleanup function, never a Promise)", () => {
    expect(stripped).toMatch(/void \(async \(\) => \{/);
  });

  it("defaults minIntervalMs to 5000, matching the panel's own 5-second throttle", () => {
    expect(stripped).toMatch(/minIntervalMs = 5000/);
  });
});
