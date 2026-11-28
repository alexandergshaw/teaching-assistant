import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getInstitutionDeckRow } from "@/lib/institution-branded-decks-storage";
import { prepareRecordingBrandTemplate } from "@/lib/decks/recording-brand-template";
import { BRANDED_DECK_MIME } from "@/lib/institution-branded-decks";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/institution-branded-decks-storage", async (original) => ({
  ...await original<typeof import("@/lib/institution-branded-decks-storage")>(),
  getInstitutionDeckRow: vi.fn(),
}));
vi.mock("@/lib/decks/recording-brand-template", async (original) => ({
  ...await original<typeof import("@/lib/decks/recording-brand-template")>(),
  prepareRecordingBrandTemplate: vi.fn(),
}));

const account = "owner-a";
const fileId = "9dc93abf-b9ae-4fd8-9903-dea985cbabec";
const acronym = "WNCC";
const requestBody = { account, fileId, acronym, mode: "inspect" };
const row = { user_id: account, acronym, id: fileId, file_name: "Campus.potx", extension: "potx" as const, size_bytes: 3, created_at: "" };
const download = vi.fn();
const service = { storage: { from: vi.fn(() => ({ download })) } };
const fit = { kind: "layout" as const };
const fill = vi.fn(async () => Buffer.alloc(4_800_001, 42));

function request(body: Record<string, unknown>) {
  return new Request("https://app.example.test/api/recording-branded-deck", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: account, email: "owner@example.test" });
  vi.mocked(createServiceClient).mockReturnValue(service as never);
  vi.mocked(getInstitutionDeckRow).mockResolvedValue(row);
  download.mockResolvedValue({ data: new Blob(["PPT"]), error: null });
  vi.mocked(prepareRecordingBrandTemplate).mockResolvedValue({ fit, fill });
});

describe("institution-branded recording deck route", () => {
  it("does not touch storage without a verified session and exact expected account", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("not signed in"));
    expect((await POST(request(requestBody))).status).toBe(401);
    expect((await POST(request({ ...requestBody, account: "foreign" }))).status).toBe(403);
    expect((await POST(request({ ...requestBody, acronym: "../foreign" }))).status).toBe(400);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("resolves only owned institution files and inspects capacity without returning original content", async () => {
    vi.mocked(getInstitutionDeckRow).mockResolvedValueOnce(null);
    expect((await POST(request({ ...requestBody, acronym: "OTHER" }))).status).toBe(404);
    expect(getInstitutionDeckRow).toHaveBeenLastCalledWith(service, account, "OTHER", fileId);
    expect(download).not.toHaveBeenCalled();
    const response = await POST(request(requestBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ fit });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(download).toHaveBeenCalledWith(`files/${account}/${acronym}/${fileId}.potx`);
    expect(prepareRecordingBrandTemplate).toHaveBeenCalledWith(Buffer.from("PPT"), "potx");
  });

  it("streams a private PPTX larger than the JSON wire limit from the bounded slide request", async () => {
    const slides = [{ title: "Course title", bullets: [] }];
    const response = await POST(request({ ...requestBody, mode: "fill", slides }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(BRANDED_DECK_MIME.pptx);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fill).toHaveBeenCalledWith(slides);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.value?.byteLength).toBe(256 * 1024);
    let size = first.value?.byteLength ?? 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
    }
    expect(size).toBe(4_800_001);
  });
});
