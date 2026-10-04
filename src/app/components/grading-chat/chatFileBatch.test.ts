// The submit is a plain mock: no real fetch (the test setup throws on one).
import { describe, expect, it } from "vitest";
import { submitFilesSequentially } from "./chatFileBatch";

type Outcome = { kind: "accepted"; tag: string } | { kind: "refused"; reason: string };

function fakeFile(name: string): File {
  return { name } as unknown as File;
}

function makeHarness() {
  const calls: string[] = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const submit = async (file: File): Promise<Outcome> => {
    calls.push(file.name);
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((resolve) => setTimeout(resolve, 1));
    concurrent -= 1;
    return file.name === "c" ? { kind: "refused", reason: "bad c" } : { kind: "accepted", tag: file.name };
  };
  return { calls, submit, getMax: () => maxConcurrent };
}

function label(o: Outcome): string {
  return o.kind === "accepted" ? o.tag : o.reason;
}

const FILES: File[] = ["a", "b", "c", "d"].map(fakeFile);

describe("submitFilesSequentially", () => {
  it("returns every outcome in input order, one submit per file, never concurrent", async () => {
    const h = makeHarness();
    const out = await submitFilesSequentially(FILES, h.submit);
    expect(out.length).toBe(4);
    expect(h.calls).toEqual(["a", "b", "c", "d"]);
    expect(out.map(label)).toEqual(["a", "b", "bad c", "d"]);
    expect(out[2].kind).toBe("refused");
    expect(h.getMax()).toBe(1);
  });

  it("an empty batch makes no submit call", async () => {
    const h = makeHarness();
    expect(await submitFilesSequentially([], h.submit)).toEqual([]);
    expect(h.calls).toEqual([]);
  });
});

// Sabotage proofs: the concurrency counter is the ONLY assertion that sees a
// parallel implementation (Promise.all preserves order).
describe("submitFilesSequentially - the assertions can fail", () => {
  it("a Promise.all implementation reaches concurrency 4 while still returning ordered output", async () => {
    const h = makeHarness();
    const out = await Promise.all(FILES.map(h.submit));
    expect(h.getMax()).toBe(4);
    expect(out.map(label)).toEqual(["a", "b", "bad c", "d"]);
  });

  it("an implementation that drops refusals returns fewer than K outcomes", async () => {
    const h = makeHarness();
    const out: Outcome[] = [];
    for (const file of FILES) {
      const o = await h.submit(file);
      if (o.kind === "accepted") out.push(o);
    }
    expect(out.length).not.toBe(FILES.length);
  });

  it("an implementation that stops at the first refusal makes fewer than K calls", async () => {
    const h = makeHarness();
    for (const file of FILES) {
      const o = await h.submit(file);
      if (o.kind === "refused") break;
    }
    expect(h.calls).not.toEqual(["a", "b", "c", "d"]);
  });

  it("an implementation that reverses output breaks the order assertion", async () => {
    const h = makeHarness();
    const out: Outcome[] = [];
    for (const file of FILES) out.unshift(await h.submit(file));
    expect(out.map(label)).not.toEqual(["a", "b", "bad c", "d"]);
  });
});
