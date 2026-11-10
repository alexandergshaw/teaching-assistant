import { expect, it, vi } from "vitest";
import JSZip from "jszip";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ blob: null as Blob | null, upload: vi.fn(), remove: vi.fn() }));
const owner = "11111111-2222-4333-8444-555555555555";
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "11111111-2222-4333-8444-555555555555" })) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ storage: { from: () => ({ list: async () => ({ data: [{ name: "abc.zip", metadata: { size: state.blob?.size } }], error: null }), download: () => ({ asStream: async () => ({ data: state.blob?.stream(), error: null }) }) }) } }) }));
vi.mock("@/lib/supabase/storage", () => ({ uploadFile: state.upload, removeFiles: state.remove }));
import { POST } from "./route";

it("stages video from a real small ZIP and returns its reference with the code", async () => {
  const zip = new JSZip();
  zip.file("Student/work.txt", "Synthetic code evidence");
  zip.file("Student/presentation.mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115, 111, 109]));
  state.blob = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]);
  state.upload.mockResolvedValue({ error: null }); state.remove.mockResolvedValue({ error: null });
  const req = { headers: new Headers({ "content-type": "application/json" }), json: async () => ({ storagePath: `${owner}/grading-uploads/abc.zip` }) } as NextRequest;
  const res = await POST(req); const body = await res.text();
  expect(state.upload).toHaveBeenCalled(); expect(body).toContain("videoRef"); expect(body).toContain("Synthetic code evidence");
});
