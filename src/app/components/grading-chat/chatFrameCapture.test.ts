// Oracle for the pure frame -> File leaf. The capture hook itself is owner-walk:
// getDisplayMedia and canvas do not exist under vitest.
import { describe, it, expect } from "vitest";
import { frameToImageFile } from "./chatFrameCapture";
import { classifyGradingUpload } from "@/lib/grade/single-file-entry";

// Frozen literal oracle: the bytes FF D8 FF E0 00 10 (a JPEG header prefix) and
// their base64, written out rather than produced by the encoder under test.
const JPEG_HEADER_BASE64 = "/9j/4AAQ";
const JPEG_HEADER_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];

describe("frameToImageFile", () => {
  it("names the file .jpg and types it image/jpeg", () => {
    const file = frameToImageFile(JPEG_HEADER_BASE64, 3);
    expect(file.name).toBe("screen-recording-3.jpg");
    expect(file.type).toBe("image/jpeg");
  });

  it("round-trips the bytes", async () => {
    const file = frameToImageFile(JPEG_HEADER_BASE64, 1);
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    expect(bytes).toEqual(JPEG_HEADER_BYTES);
  });

  it("is classified as a single gradable upload by the server, keyed on the extension", () => {
    const file = frameToImageFile(JPEG_HEADER_BASE64, 2);
    expect(classifyGradingUpload(file.name)).toBe("single");
    expect(classifyGradingUpload("screen-recording-2.webm")).toBe("unsupported");
  });
});
