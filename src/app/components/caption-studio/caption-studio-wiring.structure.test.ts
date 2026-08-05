import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Wiring guards for CaptionStudio.tsx.
 *
 * These are source-structure assertions rather than render tests because this
 * project's vitest runs in the "node" environment with no jsdom and no
 * @testing-library/react (see vitest.config.ts), and the sibling
 * recording-split.structure.test.ts establishes the precedent of guarding a
 * .tsx component by reading its source.
 *
 * That is a good fit for this particular defect rather than a compromise: the
 * useCaptionGeneration hook is itself correct, and both bugs guarded here were
 * purely in how the component CALLS it. A wrong argument and a wrong dep array
 * are exactly what source structure can see.
 *
 * Both guards below correspond to shipped bugs, not hypotheticals:
 *  1. useCaptionGeneration was passed a literal null, so handleGenerate's
 *     `if (!videoUrl) return;` fired every time and "Generate captions" did
 *     nothing at all, with no error surfaced to the user.
 *  2. the caption-clearing effect listed `captionGen` in its dep array. That
 *     hook returns a fresh object literal every render, so the effect re-ran
 *     after every render and called setCaptions(null) - wiping the captions on
 *     the very render that generation had just set them. Fixing (1) alone
 *     would still have left the feature dead.
 */
describe("CaptionStudio wiring", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/components/caption-studio/CaptionStudio.tsx"),
    "utf-8"
  );

  /** The first argument of a `name(` call in the component source. */
  function firstArgumentOf(callee: string): string {
    const match = source.match(new RegExp(`${callee}\\(\\s*([^,)]+)`));
    if (!match) throw new Error(`Could not find a call to ${callee} in CaptionStudio.tsx`);
    return match[1].trim();
  }

  it("hands useCaptionGeneration the imported video url, never a literal null", () => {
    // The whole feature hangs off this argument: handleGenerate returns early
    // when it is falsy, and returns SILENTLY - no error state is set - so a
    // null here presents to the user as a button that does nothing.
    expect(firstArgumentOf("useCaptionGeneration")).toBe("videoImport.videoUrl");
  });

  it("declares videoImport before useCaptionGeneration consumes it", () => {
    // The original defect was an ordering slip: videoImport was declared on the
    // line AFTER the one that needed videoImport.videoUrl, so null was passed
    // to keep it compiling.
    const videoImportAt = source.indexOf("const videoImport = useVideoImport()");
    const captionGenAt = source.indexOf("const captionGen = useCaptionGeneration(");
    expect(videoImportAt).toBeGreaterThan(-1);
    expect(captionGenAt).toBeGreaterThan(-1);
    expect(videoImportAt).toBeLessThan(captionGenAt);
  });

  it("does not depend on captionGen in the effect that clears captions", () => {
    // useCaptionGeneration returns a new object literal each render, so listing
    // captionGen here makes the dep array change on EVERY render. The effect
    // would then clear captions immediately after generation set them.
    const effects = [...source.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[([^\]]*)\]\s*\)/g)];
    const clearing = effects.filter((m) => m[1].includes("setCaptions(null)"));

    expect(clearing.length, "expected exactly one caption-clearing effect").toBe(1);

    const deps = clearing[0][2].split(",").map((d) => d.trim()).filter(Boolean);
    expect(deps).not.toContain("captionGen");
    // It must still re-run when a different video is imported, otherwise stale
    // captions from the previous video linger over the new one.
    expect(deps).toContain("videoImport.videoUrl");
  });

  it("still hands useBurnCaptions the imported video url", () => {
    // Burning was the one part of this component that always worked; guard it
    // so a future refactor of the lines above cannot quietly break it too.
    expect(firstArgumentOf("useBurnCaptions")).toBe("videoImport.videoUrl");
  });
});
