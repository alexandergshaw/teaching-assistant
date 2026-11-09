import { describe, expect, it, vi } from "vitest";
import { loadTakeCourses } from "./useTakeCourses";
describe("recording course loading", () => {
  it("times out a stalled load and suppresses its late result", async () => {
    vi.useFakeTimers();
    let finish!: (value: Awaited<ReturnType<typeof import("../../actions").listCourseHubAction>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof import("../../actions").listCourseHubAction>>>((resolve) => { finish = resolve; });
    const load = loadTakeCourses(() => pending, 20);
    await vi.advanceTimersByTimeAsync(20);
    expect(await load).toEqual({ error: "Loading courses timed out. Try again." });
    finish({ courses: [] });
    await Promise.resolve();
    vi.useRealTimers();
  });
  it("surfaces a rejected load for retry", async () => {
    expect(await loadTakeCourses(async () => { throw new Error("Unavailable"); })).toEqual({ error: "Unavailable" });
  });
});
