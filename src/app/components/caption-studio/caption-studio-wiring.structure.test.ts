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

  it("never lists a whole hook result in a useEffect dep array", () => {
    // Third shipped bug of the same family: the teardown effect depended on
    // [voiceOverlay, burnCaptions]. Both hooks return a fresh object literal
    // every render, so React re-ran that effect's CLEANUP after every render -
    // and the cleanup revokes the imported video's object URL. The <video> went
    // dead mid-session and "Generate captions" then hung forever sampling
    // frames from a revoked url.
    //
    // The invariant, not the spelling: no dep array in this component may name
    // a value that is a fresh object on every render.
    const hookResults = ["captionGen", "videoImport", "voiceOverlay", "burnCaptions", "recordingContext"];
    const depArrays = [...source.matchAll(/,\s*\[([^\]]*)\]\s*\)/g)].map((m) => m[1]);

    expect(depArrays.length, "expected to find dep arrays to check").toBeGreaterThan(0);

    for (const deps of depArrays) {
      const named = deps.split(",").map((d) => d.trim()).filter(Boolean);
      for (const dep of named) {
        expect(hookResults).not.toContain(dep);
      }
    }
  });

  it("revokes the imported video url only in an unmount-only cleanup", () => {
    // The revoke must sit behind a dep array that cannot change, otherwise it
    // fires while the video is still on screen.
    //
    // Anchored on the registering effect itself rather than searched for
    // anywhere in the file: a pattern that scans from the first useEffect to
    // the first `[]` swallows the whole component body, so `teardownRef`
    // appearing inside that span proves nothing about which effect carries the
    // empty array.
    expect(source).toContain("URL.revokeObjectURL(videoUrlRef.current)");

    const registrations = [...source.matchAll(/useEffect\(([^;]*?teardownRef\.current[^;]*?),\s*\[([^\]]*)\]\s*\)/g)];
    expect(registrations.length, "expected one effect registering the teardown").toBe(1);
    expect(registrations[0][2].trim(), "the teardown effect's dep array must be empty").toBe("");
  });

  it("reads the burn abort at click time, not at render time", () => {
    // burnAbortRef.current is null on the render that first shows Cancel - the
    // abort closure is installed later, during the export's setup - so passing
    // the ref's value made Cancel a permanently dead button whenever the
    // progress percentage never moved.
    const passed = source.match(/onAbortBurn=\{([^}]*)\}/);
    expect(passed, "expected CaptionStudio to pass onAbortBurn").not.toBeNull();
    expect(passed?.[1]).toContain("=>");
  });

  it("still hands useBurnCaptions the imported video url", () => {
    // Guard the export path against a future refactor of the lines above. It
    // was never the safe one it was once described as: the same every-render
    // cleanup also called burnAbortRef.current, so every export cancelled
    // itself as soon as the progress percentage moved.
    expect(firstArgumentOf("useBurnCaptions")).toBe("videoImport.videoUrl");
  });
});
