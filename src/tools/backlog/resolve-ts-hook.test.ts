import { describe, it, expect, vi } from "vitest";
import { resolve } from "./resolve-ts-hook";

describe("resolve (the Node loader hook that appends .ts to extensionless relative specifiers)", () => {
  it("appends .ts to an extensionless relative specifier and hands it to nextResolve", async () => {
    const nextResolve = vi.fn().mockResolvedValue({ url: "file:///x/yaml-codec.ts" });
    const result = await resolve("./yaml-codec", {}, nextResolve);
    expect(nextResolve).toHaveBeenCalledWith("./yaml-codec.ts", {});
    expect(result).toEqual({ url: "file:///x/yaml-codec.ts" });
  });

  it("passes a specifier that already has an extension through unchanged", async () => {
    const nextResolve = vi.fn().mockResolvedValue({ url: "file:///x/yaml-codec.ts" });
    await resolve("./yaml-codec.ts", {}, nextResolve);
    expect(nextResolve).toHaveBeenCalledWith("./yaml-codec.ts", {});
    expect(nextResolve).toHaveBeenCalledTimes(1);
  });

  it("passes a bare (non-relative) specifier through unchanged, never guessing a .ts suffix on a package name", async () => {
    const nextResolve = vi.fn().mockResolvedValue({ url: "node:fs" });
    await resolve("node:fs", {}, nextResolve);
    expect(nextResolve).toHaveBeenCalledWith("node:fs", {});
    expect(nextResolve).toHaveBeenCalledTimes(1);
  });

  it("falls back to the original specifier when the .ts-appended attempt throws, rather than swallowing a real resolution error", async () => {
    const nextResolve = vi
      .fn()
      .mockRejectedValueOnce(new Error("not found with .ts"))
      .mockResolvedValueOnce({ url: "file:///x/some.json" });
    const result = await resolve("./some.json".replace(".json", ""), {}, nextResolve);
    expect(nextResolve).toHaveBeenNthCalledWith(1, "./some.ts", {});
    expect(nextResolve).toHaveBeenNthCalledWith(2, "./some", {});
    expect(result).toEqual({ url: "file:///x/some.json" });
  });

  it("is deterministic - the same inputs produce the same call to nextResolve", async () => {
    const calls: unknown[] = [];
    const nextResolve = vi.fn(async (specifier: string) => {
      calls.push(specifier);
      return { url: `file:///x/${specifier}` };
    });
    await resolve("./a", {}, nextResolve);
    await resolve("./a", {}, nextResolve);
    expect(calls).toEqual(["./a.ts", "./a.ts"]);
  });
});
