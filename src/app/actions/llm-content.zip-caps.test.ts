// ZIP-BOMB-CAPS W1 (docs/zip-bomb-caps-scope.md), instrument I9a:
// testGeminiAction is the one extractSubmissions caller with NO auth guard
// (pinned in action-guard-coverage.test.ts PINNED_UNGUARDED), so it is the
// reachable exposure. It must refuse a bomb with a "Refused: " message and
// never reach the paid model. Only callLlm is mocked; the zip is a real
// in-memory jszip fixture whose central-directory size is patched.
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { testGeminiAction } from "./llm-content";

beforeEach(() => {
  vi.clearAllMocks();
});

function seededBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

/** Patch the CENTRAL-directory uncompressed size of the first entry. */
function patchFirstEntryUncompressed(archive: Uint8Array, value: number): void {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let eocd = -1;
  for (let i = archive.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  const first = view.getUint32(eocd + 16, true);
  view.setUint32(first + 24, value, true);
}

async function formDataWithZip(patchTo: number | null): Promise<FormData> {
  const zip = new JSZip();
  zip.file("student_1_2_essay.txt", seededBytes(1024, 7), { createFolders: false });
  const bytes = await zip.generateAsync({ type: "uint8array" });
  if (patchTo !== null) patchFirstEntryUncompressed(bytes, patchTo);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const formData = new FormData();
  formData.set("studentSubmissions", new File([buffer], "submissions.zip", { type: "application/zip" }));
  formData.set("provider", "gemini");
  return formData;
}

describe("testGeminiAction - zip caps (I9a)", () => {
  it("returns a Refused error for a lying-header bomb and never calls the model", async () => {
    const state = await testGeminiAction({ result: null, error: null }, await formDataWithZip(200 * 1024 * 1024));
    expect(state.result).toBeNull();
    expect(state.error).not.toBeNull();
    expect((state.error as string).startsWith("Refused: ")).toBe(true);
    expect(state.error).toContain("student_1_2_essay.txt");
    expect(vi.mocked(callLlm)).not.toHaveBeenCalled();
  });

  it("positive control: the same fixture unpatched reaches the model", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, body: "", text: "A summary." } as never);
    const state = await testGeminiAction({ result: null, error: null }, await formDataWithZip(null));
    expect(state.error).toBeNull();
    expect(vi.mocked(callLlm)).toHaveBeenCalledTimes(1);
  });
});
