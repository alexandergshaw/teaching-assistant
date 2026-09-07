import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The course picker must show WHY listing failed, not that it failed.
 *
 * This is a source-text test because it has to be: vitest here is node-env and
 * collects only `src/**\/*.test.ts`, so no component is ever rendered and there
 * is no way to observe what this picker actually paints. Reading the file that
 * decides is the only check available.
 *
 * THE BUG IT PINS, which was real and user-reported. The failure branch used to
 * discard the action's message and render a fixed sentence: "Could not list
 * courses for this school." So the single thing the reader needed - what to do
 * next - was the single thing thrown away.
 *
 * It was survivable while Canvas credentials were per-deployment, because a
 * failure here was rare and usually the owner's own environment. Per-user
 * credentials changed the common case: an instructor who has simply not
 * connected this institution yet gets a resolver message saying exactly that,
 * and the generic sentence turned a solvable setup step into a dead end.
 *
 * Rendering the real message is safe, and that is worth stating because it is
 * not automatic. Every string that reaches this branch is composed by this app -
 * the credential prompt, or canvasError's own token/not-found/HTTP-status
 * wording - never a raw upstream response body, which is the thing that must
 * never be shown.
 */

const SOURCE = readFileSync(
  join(process.cwd(), "src", "app", "components", "CoursePicker.tsx"),
  "utf8"
);

describe("CoursePicker surfaces the reason a course listing failed", () => {
  it("keeps the action's own error message instead of discarding it", () => {
    // The failure branch must store what came back. Without this the component
    // can still set an error state and render something - it just renders
    // something useless.
    expect(SOURCE).toMatch(/setCoursesError\(\s*result\.error/);
  });

  it("renders that message rather than a hard-coded sentence", () => {
    const renderIndex = SOURCE.indexOf("coursesError ||");
    expect(
      renderIndex,
      "the error branch does not render the captured message. A fixed string " +
        "here tells an instructor that something failed and never what to do " +
        "about it - which for the common case (no credential connected for " +
        "this institution yet) is a dead end rather than a setup step."
    ).toBeGreaterThan(-1);
  });

  it("clears the message on a successful reload, so a stale reason cannot outlive its failure", () => {
    // Without this, switching to a working institution keeps showing the
    // previous one's error underneath a list that loaded fine.
    expect(SOURCE).toMatch(/setCoursesError\(""\)/);
  });

  it("finds the component at all, so a move cannot make this vacuously pass", () => {
    // Every assertion above is an indexOf or a regex over one file. If that
    // read ever returned an empty string, they would all fail for the wrong
    // reason - or worse, a future rewrite could make them pass over nothing.
    expect(SOURCE.length).toBeGreaterThan(1000);
    expect(SOURCE).toContain("listCoursesAction");
  });
});
