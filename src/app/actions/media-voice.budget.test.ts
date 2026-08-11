import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Coverage for the voice-clone upload budget defect fixed in
// src/app/actions/media-voice.ts's createVoiceCloneAction.
//
// The PRE-EXISTING check summed DECODED bytes (`base64.length * 0.75`)
// against a 7MB ceiling - correct arithmetic, wrong unit and wrong ceiling.
// 7MB of decoded audio is ~9.33MB on the wire (base64 inflates by 4/3),
// more than double Vercel's ~4.5MB platform-layer request body cap. Any
// request between ~4.5MB and 7MB (decoded) was rejected by the PLATFORM
// before this function ever ran, so the friendly in-function message could
// never fire for that entire range.
//
// The fix budgets the COMBINED WIRE size (sumBase64WireBytes) against the
// shared UPLOAD_WIRE_BUDGET_BYTES ceiling (checkWireBudget, from
// @/lib/upload-budget), the same budget every other upload path in this repo
// uses. requireOwner (auth) and global fetch (the ElevenLabs call) are
// mocked so the guard's placement - strictly BEFORE any network call - is
// directly observable.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { createVoiceCloneAction } from "./media-voice";

const OWNER = { id: "owner-1", email: "owner@example.com" };

/** A base64 payload of exactly `wireBytes` characters. sumBase64WireBytes
 * sums `base64.length` directly, so the string's length IS the wire byte
 * count under test - its content never needs to decode to real audio,
 * because the budget check runs before any decoding or network call. */
function base64OfWireBytes(wireBytes: number): string {
  return "A".repeat(wireBytes);
}

function sampleFile(wireBytes: number, fileName = "sample.mp3") {
  return { base64: base64OfWireBytes(wireBytes), mimeType: "audio/mpeg", fileName };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ voice_id: "voice-xyz" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createVoiceCloneAction - wire-size budget", () => {
  it("refuses a single sample whose combined wire size is already over budget, BEFORE any ElevenLabs call", async () => {
    const files = [sampleFile(UPLOAD_WIRE_BUDGET_BYTES + 1_000)];

    const result = await createVoiceCloneAction("My Voice", files);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("too large to upload in one request");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses several INDIVIDUALLY-small files that together exceed the budget - the case a per-file check misses", async () => {
    // Each file alone is comfortably under the whole budget (a per-file
    // check would pass every one of them), but five together add up to well
    // over it. This is the entire reason the fix sums across files instead
    // of checking each in isolation.
    const perFileWireBytes = Math.floor(UPLOAD_WIRE_BUDGET_BYTES / 4); // 4 of these alone would still be under budget
    const files = [
      sampleFile(perFileWireBytes, "sample-1.mp3"),
      sampleFile(perFileWireBytes, "sample-2.mp3"),
      sampleFile(perFileWireBytes, "sample-3.mp3"),
      sampleFile(perFileWireBytes, "sample-4.mp3"),
      sampleFile(perFileWireBytes, "sample-5.mp3"),
    ];
    // Sanity check on the fixture itself: no single file is anywhere near
    // the budget, but the five together are well over it.
    expect(perFileWireBytes).toBeLessThan(UPLOAD_WIRE_BUDGET_BYTES / 2);
    expect(perFileWireBytes * files.length).toBeGreaterThan(UPLOAD_WIRE_BUDGET_BYTES);

    const result = await createVoiceCloneAction("My Voice", files);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("too large to upload in one request");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proceeds to the ElevenLabs call when the combined wire size is under budget", async () => {
    const files = [
      sampleFile(1_000, "sample-1.mp3"),
      sampleFile(1_000, "sample-2.mp3"),
    ];

    const result = await createVoiceCloneAction("My Voice", files);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/voices/add",
      expect.objectContaining({ method: "POST" })
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.voiceId).toBe("voice-xyz");
    }
  });
});
