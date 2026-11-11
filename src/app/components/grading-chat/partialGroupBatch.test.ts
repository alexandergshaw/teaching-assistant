import { describe, expect, it, vi } from "vitest";
import { annotateOmittedGroups, minimumBatchPlan, minimumNonMonotoneBatchPlan, omittedGroups, preflightSingles, remainingGroups, submitBoundedGroups } from "./partialGroupBatch";
import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";

it("retains distinct hold reasons across automatic batches", () => {
  const groups = ["submitted", "pending", "ambiguous", "review"].map((label) => ({ label, sourceIdentifier: label, members: [] })) as RecoverableGroup[];
  const omitted = omittedGroups(groups, ["pending"], ["submitted"]);
  expect(annotateOmittedGroups(omitted, (group) => group.label === "ambiguous" ? "student identity is ambiguous" : undefined, true).map((group) => [group.label, group.reason])).toEqual([["ambiguous", "student identity is ambiguous"], ["review", "held for review"]]);
});

describe("non-monotone batch planning", () => {
  it("finds a valid grouping when an invalid prefix becomes valid after another group", async () => {
    const fits = (labels: readonly string[]) => labels.length === 2 ? null : "invalid ratio";
    expect(await minimumNonMonotoneBatchPlan(["a", "b", "c", "d"], fits)).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("fails before dispatch when no partition is feasible", async () => {
    await expect(minimumNonMonotoneBatchPlan(["a", "b", "c"], (labels) => labels.length === 2 ? null : "invalid ratio")).rejects.toThrow("No valid grouping");
  });

  it("proves two batches without enumerating every partition", async () => {
    const labels = Array.from({ length: 30 }, (_, index) => String(index));
    expect((await minimumNonMonotoneBatchPlan(labels, (batch) => batch.length <= 15 ? null : "full")).length).toBe(2);
  });

  it("can prove two batches beyond the exhaustive-search size cap", async () => {
    const labels = Array.from({ length: 600 }, (_, index) => String(index));
    expect((await minimumNonMonotoneBatchPlan(labels, (batch) => batch.length <= 300 ? null : "full")).length).toBe(2);
  });

  it("yields during greedy planning and honors cancellation", async () => {
    let current = true; setTimeout(() => { current = false; }, 0);
    await expect(minimumNonMonotoneBatchPlan(Array.from({ length: 80 }, (_, index) => String(index)), (batch) => batch.length <= 40 ? null : "full", () => current)).rejects.toThrow("canceled");
  });

  it("matches all valid partitions for arbitrary subset feasibility", async () => {
    const labels = ["a", "b", "c", "d"];
    const partitions: string[][][] = [];
    const enumerate = (index: number, batches: string[][]) => {
      if (index === labels.length) { partitions.push(batches.map((batch) => [...batch])); return; }
      for (const batch of batches) { batch.push(labels[index]); enumerate(index + 1, batches); batch.pop(); }
      batches.push([labels[index]]); enumerate(index + 1, batches); batches.pop();
    };
    enumerate(0, []);
    const mask = (batch: readonly string[]) => batch.reduce((result, label) => result | (1 << labels.indexOf(label)), 0);
    for (let sample = 0; sample < 128; sample++) {
      const allowed = (sample * 7919 + 12345) & 0xffff;
      const fits = (batch: readonly string[]) => (allowed & (1 << mask(batch))) !== 0 ? null : "invalid";
      const feasible = partitions.filter((batches) => batches.every((batch) => !fits(batch)));
      if (!feasible.length) await expect(minimumNonMonotoneBatchPlan(labels, fits)).rejects.toThrow();
      else expect((await minimumNonMonotoneBatchPlan(labels, fits)).length).toBe(Math.min(...feasible.map((batch) => batch.length)));
    }
  });
});
it("keeps only not-yet-admitted groups selected after a successful batch", () => {
  expect(remainingGroups(["a", "b", "c"], ["a", "b"])).toEqual(["c"]);
  expect(remainingGroups(["c"], [])).toEqual(["c"]);
});
it("does not label previously admitted groups as omitted on retry", () => {
  const groups = [{ label: "a" }, { label: "held" }];
  expect(omittedGroups(groups, ["b"], ["a"])).toEqual([{ label: "held" }]);
});
it("finds a proven minimum when first-fit uses an extra upload", async () => {
  const size: Record<string, number> = { a: 4, b: 4, c: 4, d: 6, e: 6, f: 6 };
  const batches = await minimumBatchPlan(Object.keys(size), (labels) => labels.reduce((sum, label) => sum + size[label], 0) > 10 ? "batch exceeds grading limits" : null);
  expect(batches).toHaveLength(3); expect(batches.flat().sort()).toEqual(Object.keys(size).sort());
  expect(batches.every((batch) => batch.reduce((sum, label) => sum + size[label], 0) <= 10)).toBe(true);
});
it("matches an independent subset optimum across varied small classes", async () => {
  for (let seed = 1; seed <= 20; seed++) {
    const values = Array.from({ length: 7 }, (_, index) => 1 + ((seed * (index + 3) + index * index) % 9));
    const labels = values.map((_, index) => String(index)), fits = (batch: readonly string[]) => batch.reduce((sum, label) => sum + values[Number(label)], 0) <= 10 ? null : "batch exceeds grading limits";
    const optimum = Array<number>(1 << values.length).fill(Infinity); optimum[0] = 0;
    for (let mask = 1; mask < optimum.length; mask++) for (let subset = mask; subset; subset = (subset - 1) & mask) {
      const chosen = labels.filter((_, index) => subset & (1 << index));
      if (!fits(chosen)) optimum[mask] = Math.min(optimum[mask], 1 + optimum[mask ^ subset]);
    }
    expect((await minimumBatchPlan(labels, fits)).length).toBe(optimum.at(-1));
  }
});
it("never dispatches when the review is already canceled", async () => {
  const build = vi.fn(), submit = vi.fn();
  await expect(submitBoundedGroups(["a"], () => null, build, submit, () => false)).rejects.toThrow(/canceled/);
  expect(build).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
});
it("preflights nested projects one at a time and fails before any dispatch", async () => {
  const build = vi.fn(async (batch: readonly string[]) => batch[0] === "b" ? { ok: false as const, reason: "nested too large" } : { ok: true as const, value: new Blob(["prepared"]) });
  await expect(preflightSingles(["a", "b", "c"], build, () => true)).rejects.toThrow(/nested too large/);
  expect(build.mock.calls.map(([labels]) => labels)).toEqual([["a"], ["b"]]);
});
it("builds and submits each ordered batch before building the next", async () => {
  const events: string[] = [];
  await submitBoundedGroups(["a", "b", "c", "d", "e"], (labels) => labels.length > 2 ? "batch exceeds grading limits" : null,
    async (labels) => { events.push(`build:${labels.join("")}`); return { ok: true, value: labels.join("") }; },
    async (value) => { events.push(`submit:${value}`); });
  expect(events).toEqual(["build:ab", "submit:ab", "build:cd", "submit:cd", "build:e", "submit:e"]);
});
it("stops before any build when a group cannot fit, and after a failed submission", async () => {
  const build = vi.fn(async (labels: readonly string[]) => ({ ok: true as const, value: labels[0] })), submit = vi.fn(async () => { throw new Error("uncertain"); });
  await expect(submitBoundedGroups(["a", "b"], (labels) => labels.includes("b") ? "group too large" : null, build, submit)).rejects.toThrow(/group too large/);
  expect(build).not.toHaveBeenCalled();
  await expect(submitBoundedGroups(["a", "b"], (labels) => labels.length > 1 ? "batch exceeds grading limits" : null, build, submit)).rejects.toThrow(/uncertain/);
  expect(build).toHaveBeenCalledOnce(); expect(submit).toHaveBeenCalledOnce();
});
it("reports a failed build without submitting it or later batches", async () => {
  const build = vi.fn(async () => ({ ok: false as const, reason: "integrity" })), submit = vi.fn();
  await expect(submitBoundedGroups(["a", "b"], () => null, build, submit)).rejects.toThrow(/integrity/); expect(submit).not.toHaveBeenCalled();
});
