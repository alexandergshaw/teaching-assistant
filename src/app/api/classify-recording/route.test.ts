import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// RECORDING ONE-VS-MANY W1: the dark classify route. Auth is the REAL guard over
// targeted mocks (supabase/server + app-users); the model, Storage and the Files
// client are mocked, nothing dials out. The flag is forced ON except where noted.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(() => ({}) as never),
}));
vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});
vi.mock("@/lib/grade/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grade/constants")>()),
  RECORDING_SPLIT_ENABLED: true,
}));
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  callLlm: vi.fn(),
}));
vi.mock("@/lib/supabase/storage", () => ({ downloadFile: vi.fn(), removeFiles: vi.fn(async () => ({ error: null })) }));
vi.mock("@/lib/gemini", () => ({ getGeminiApiKey: () => "test-key" }));
vi.mock("@/lib/gemini-files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gemini-files")>()),
  createGeminiFilesClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { callLlm } from "@/lib/llm";
import { downloadFile } from "@/lib/supabase/storage";
import { createGeminiFilesClient } from "@/lib/gemini-files";
import { POST } from "./route";
import type { NextRequest } from "next/server";

const mockLlm = vi.mocked(callLlm);
const mockDownload = vi.mocked(downloadFile);
const mockClientFactory = vi.mocked(createGeminiFilesClient);

const OWN = "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
const FOREIGN = "u2/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
const URI = "https://generativelanguage.googleapis.com/v1beta/files/r-1";
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31, 1, 2, 3]);

function ownerRow(): AppUserRow {
  return {
    id: "u1",
    email: "m@example.com",
    displayName: null,
    status: "active",
    role: "owner",
    approvedAt: null,
    approvedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    statusChangedAt: null,
    statusChangedBy: null,
    roleGrantedBy: null,
  };
}

function signIn(role: "owner" | "instructor"): void {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "u1", email: "m@example.com" } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
      },
    },
  } as never);
  vi.mocked(getAppUser).mockResolvedValue({ ...ownerRow(), role });
}

function request(storagePath: string, contentType = "application/json"): NextRequest {
  const body = { storagePath, sizeBytes: MP4.byteLength, assignmentInstructions: "each student presents", rubric: "r" };
  return { headers: { get: () => contentType }, json: vi.fn(async () => body) } as unknown as NextRequest;
}

function fakeFiles() {
  const client = {
    upload: vi.fn(async () => ({ name: "files/r-1", uri: URI })),
    waitActive: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  mockClientFactory.mockReturnValue(client);
  return client;
}

function storageHas(path: string): void {
  mockDownload.mockImplementation((async (_bucket: string, p: string) =>
    p === path
      ? { data: { size: MP4.byteLength, arrayBuffer: async () => MP4.buffer.slice(0) }, error: null }
      : { data: null, error: { message: "nope" } }) as never);
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(getAppUser).mockReset();
  mockLlm.mockReset();
  mockDownload.mockReset();
  mockClientFactory.mockReset();
  signIn("owner");
  storageHas(OWN);
});

describe("the ruled failed-path contract (passed through verbatim)", () => {
  it("a callLlm that THROWS -> failed:true with split single", async () => {
    fakeFiles();
    mockLlm.mockRejectedValue(new Error("model exploded"));
    const res = await POST(request(OWN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ split: { kind: "single" }, failed: true });
  });

  it("a callLlm that returns an error result -> failed:true", async () => {
    fakeFiles();
    mockLlm.mockResolvedValue({ ok: false, status: 500, body: "x" });
    expect(await (await POST(request(OWN))).json()).toEqual({ split: { kind: "single" }, failed: true });
  });

  it("a genuine single -> failed ABSENT", async () => {
    fakeFiles();
    mockLlm.mockResolvedValue({ ok: true, text: '{"kind":"single"}' });
    const json = await (await POST(request(OWN))).json();
    expect(json).toEqual({ split: { kind: "single" } });
    expect("failed" in json).toBe(false);
  });

  it("a confirmed multiple -> segments, failed absent", async () => {
    const files = fakeFiles();
    mockLlm.mockResolvedValue({
      ok: true,
      text: '{"kind":"multiple","segments":[{"startSec":0,"endSec":30,"label":"A"},{"startSec":30,"endSec":60,"label":"B"}]}',
    });
    const json = await (await POST(request(OWN))).json();
    expect(json.split.kind).toBe("multiple");
    expect("failed" in json).toBe(false);
    expect(files.delete).toHaveBeenCalledWith("files/r-1");
  });
});

describe("auth and validation order", () => {
  it("a non-owner is refused before the body is read", async () => {
    signIn("instructor");
    const req = request(OWN);
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(req.json).not.toHaveBeenCalled();
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it("a non-JSON content type is refused before the body is read", async () => {
    const req = request(OWN, "text/plain");
    expect((await POST(req)).status).toBe(400);
    expect(req.json).not.toHaveBeenCalled();
  });

  it("a foreign user's path is refused with no Storage, Files or model call", async () => {
    const files = fakeFiles();
    expect((await POST(request(FOREIGN))).status).toBe(400);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(files.upload).not.toHaveBeenCalled();
    expect(mockLlm).not.toHaveBeenCalled();
  });
});

describe("source-text pins on the real route", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/classify-recording/route.ts"), "utf8");
  const testSrc = readFileSync(join(process.cwd(), "src/app/api/classify-recording/route.test.ts"), "utf8");
  const banned = [["grading", "DiagnosticLog"].join(""), ["session-diag", "nostic-log"].join("")];

  it("guard first, CSRF floor before the body, soft budget under the hard cap", () => {
    expect(src.indexOf("requireAppOwner(", src.indexOf("export async function POST"))).toBeLessThan(
      src.indexOf('req.headers.get("content-type")')
    );
    expect(src.indexOf('req.headers.get("content-type")')).toBeLessThan(src.indexOf("req.json("));
    const cap = Number(/export const maxDuration = (\d+)/.exec(src)?.[1]);
    const budget = Number((/TOTAL_BUDGET_MS = ([\d_]+)/.exec(src)?.[1] ?? "").replace(/_/g, ""));
    expect(budget).toBeLessThan(cap * 1000);
  });

  it("names no browser-only diagnostic module", () => {
    for (const name of banned) {
      expect(src).not.toContain(name);
      expect(testSrc).not.toContain(name); // the names are built by join above, never written literally
    }
  });
});

describe("the dark flag", () => {
  it("is shipped FALSE", async () => {
    const actual = await vi.importActual<typeof import("@/lib/grade/constants")>("@/lib/grade/constants");
    expect(actual.RECORDING_SPLIT_ENABLED).toBe(false);
  });
});
