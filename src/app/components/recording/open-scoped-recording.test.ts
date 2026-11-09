import { describe, expect, it, vi } from "vitest";
import { openScopedRecording } from "./open-scoped-recording";
describe("scoped recording open", () => {
  it("discards a deferred result after its scope changes", async () => {
    let resolve!: (item: string) => void;
    const open = vi.fn(), discard = vi.fn();
    let current = true;
    const result = openScopedRecording(() => new Promise<string>(r => { resolve = r; }), () => current, open, discard);
    current = false; resolve("object-url");
    expect(await result).toBe(false); expect(open).not.toHaveBeenCalled(); expect(discard).toHaveBeenCalledWith("object-url");
  });
  it("opens a result that still belongs to the active operation", async () => {
    const open = vi.fn(), discard = vi.fn();
    expect(await openScopedRecording(async () => "object-url", () => true, open, discard)).toBe(true);
    expect(open).toHaveBeenCalledWith("object-url"); expect(discard).not.toHaveBeenCalled();
  });
});
