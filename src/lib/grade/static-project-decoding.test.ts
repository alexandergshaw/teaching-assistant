import { describe, expect, it } from "vitest";
import { decodeStaticProjectText } from "./static-project-decoding";
describe("legacy source decoding", () => {
  it("identifies valid UTF-8 without assuming a legacy encoding", () => expect(decodeStaticProjectText(new TextEncoder().encode("valid"))).toEqual({ text: "valid", assumedWindows1252: false }));
  it("decodes a common legacy copyright byte with an explicit assumption", () => expect(decodeStaticProjectText(new Uint8Array([47, 47, 32, 0xa9]))).toEqual({ text: "// \u00a9", assumedWindows1252: true }));
  it.each([0, 1, 0x81, 0x8d, 0x8f, 0x90, 0x9d, 0xff])("refuses binary or undefined legacy byte %i", byte => expect(decodeStaticProjectText(new Uint8Array([0xa9, byte]))).toBeNull());
});
