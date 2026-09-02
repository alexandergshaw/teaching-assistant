// docs/recording-controls-ux-acceptance-criteria.md CC14/section 6:
// `writeClipboardText` reproduces the guard three discussion sites and the
// new grading site inline today - throws when `navigator.clipboard` is
// absent or the context is not secure, resolves otherwise. Both branches are
// mocked (this repo's vitest is node-env; there is no real Clipboard API to
// exercise).
import { describe, it, expect, afterEach, vi } from "vitest";
import { writeClipboardText } from "./clipboard";

function setGlobals(opts: {
  clipboard: { writeText: (text: string) => Promise<void> } | undefined;
  isSecureContext: boolean;
}) {
  vi.stubGlobal("navigator", { clipboard: opts.clipboard });
  vi.stubGlobal("window", { isSecureContext: opts.isSecureContext });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("writeClipboardText", () => {
  it('throws "clipboard unavailable" when navigator.clipboard is absent', async () => {
    setGlobals({ clipboard: undefined, isSecureContext: true });
    await expect(writeClipboardText("hello")).rejects.toThrow("clipboard unavailable");
  });

  it('throws "clipboard unavailable" when isSecureContext is false, even with a clipboard object present', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setGlobals({ clipboard: { writeText }, isSecureContext: false });
    await expect(writeClipboardText("hello")).rejects.toThrow("clipboard unavailable");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("resolves and calls navigator.clipboard.writeText with the given text when both conditions hold", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setGlobals({ clipboard: { writeText }, isSecureContext: true });
    await expect(writeClipboardText("hello")).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("propagates a rejection from the underlying writeText call", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setGlobals({ clipboard: { writeText }, isSecureContext: true });
    await expect(writeClipboardText("hello")).rejects.toThrow("denied");
  });
});
