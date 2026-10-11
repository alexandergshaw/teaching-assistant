// Oracle for the pure frame -> File leaf. The capture hook itself is owner-walk:
// getDisplayMedia and canvas do not exist under vitest.
import { describe, it, expect } from "vitest";
import { frameToImageFile } from "./chatFrameCapture";
import { classifyGradingUpload } from "@/lib/grade/single-file-entry";
import { VIDEO_GRADING_ENABLED } from "@/lib/grade/constants";

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
    // Default (VIDEO_GRADING_ENABLED is false): a video is unsupported, as before.
    expect(classifyGradingUpload("screen-recording-2.webm")).toBe("unsupported");
  });

  // VIDEO-GRADING W1: pin BOTH states of the dark flag so the test proves the
  // gate and not just one branch. Off = today's behaviour, on = "video".
  it("keeps .webm unsupported with the video flag off and classifies it video with the flag on", () => {
    expect(classifyGradingUpload("screen-recording-2.webm", false)).toBe("unsupported");
    expect(classifyGradingUpload("screen-recording-2.webm", true)).toBe("video");
    expect(classifyGradingUpload("walkthrough.MP4", false)).toBe("unsupported");
    expect(classifyGradingUpload("walkthrough.MP4", true)).toBe("video");
    // The flag never changes the other kinds.
    expect(classifyGradingUpload("screen-recording-2.jpg", true)).toBe("single");
    expect(classifyGradingUpload("bundle.zip", true)).toBe("zip");
  });

  it("ships with the video flag OFF (zero user impact until the owner enables it)", () => {
    expect(VIDEO_GRADING_ENABLED).toBe(false);
  });
});
