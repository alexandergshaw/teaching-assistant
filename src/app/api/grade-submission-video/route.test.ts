import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// VIDEO-GRADING W2 (ops T10): the loose-video Route Handler's own guard.
// action-guard-coverage cannot see a Route Handler, so this file is the only
// thing behind /api/grade-submission-video. Source-text predicates pin the
// FIXED ORDER; behaviour tests mock auth, Storage and the constants module
// (the dark flag is a module constant). Never `fetch` (network is blocked).
const ROUTE_PATH = join(process.cwd(), "src/app/api/grade-submission-video/route.ts");
const routeSource = readFileSync(ROUTE_PATH, "utf8");

describe("source-text pins on the real route (order, not spelling)", () => {
  const post = routeSource.indexOf("export async function POST");
  const idx = (needle: string) => routeSource.indexOf(needle, post);

  it("requireAppOwner() precedes the body read, the body read follows the content-type floor, and prepare comes last", () => {
    expect(post).toBeGreaterThan(-1);
    expect(idx("requireAppOwner(")).toBeGreaterThan(-1);
    expect(idx("requireAppOwner(")).toBeLessThan(idx('req.headers.get("content-type")'));
    expect(idx('req.headers.get("content-type")')).toBeLessThan(idx("req.json("));
    expect(idx("req.json(")).toBeLessThan(idx("VIDEO_GRADING_ENABLED"));
    expect(idx("VIDEO_GRADING_ENABLED")).toBeLessThan(idx("prepareLooseVideo("));
  });

  it("uses requireAppOwner, not the weaker guards", () => {
    expect(routeSource).not.toContain("requireUser(");
    expect(routeSource).not.toContain("requireOwner(");
  });

  it("takes no client URL and never returns a signed URL: the only URL is minted from the validated path", () => {
    expect(routeSource).not.toMatch(/body\.(url|signedUrl|fileUri)/);
    // createSignedUrl exists only inside the injected readHead, which feeds the head reader.
    const uses = routeSource.match(/createSignedUrl/g) ?? [];
    expect(uses.length).toBe(2); // import + the one readHead call
    expect(routeSource).not.toMatch(/NextResponse\.json\([^)]*signed/i);
  });

  it("the soft budget, if any, stays under maxDuration", () => {
    const max = routeSource.match(/export const maxDuration = (\d+)/);
    expect(max).not.toBeNull();
  });
});

const requireAppOwnerMock = vi.fn();
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: (...args: unknown[]) => requireAppOwnerMock(...args),
}));

const listMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ storage: { from: () => ({ list: (...args: unknown[]) => listMock(...args) }) } }),
}));

const createSignedUrlMock = vi.fn();
const removeFilesMock = vi.fn();
vi.mock("@/lib/supabase/storage", () => ({
  createSignedUrl: (...args: unknown[]) => createSignedUrlMock(...args),
  removeFiles: (...args: unknown[]) => removeFilesMock(...args),
}));

const flag = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/grade/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/grade/constants")>();
  return {
    ...actual,
    get VIDEO_GRADING_ENABLED() {
      return flag.on;
    },
  };
});

import { POST } from "./route";
import { VIDEO_MAX_BYTES } from "@/lib/grade/video-limits";
import type { NextRequest } from "next/server";

const USER = "11111111-2222-4333-8444-555555555555";
const OBJ = "2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b";
const GOOD_PATH = `${USER}/grading-uploads/${OBJ}.mp4`;
const MP4_HEAD = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]);

function jsonRequest(body: unknown, contentType = "application/json"): NextRequest {
  const json = vi.fn(async () => body);
  return { headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) }, json } as unknown as NextRequest;
}

function stubHeadFetch(head: Uint8Array) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(head);
        controller.close();
      },
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  flag.on = true;
  requireAppOwnerMock.mockResolvedValue({ id: USER, email: "o@example.com" });
  listMock.mockResolvedValue({ data: [{ name: `${OBJ}.mp4`, metadata: { size: 12 * 1024 * 1024 } }], error: null });
  createSignedUrlMock.mockResolvedValue({ data: { signedUrl: "https://signed.example/obj" }, error: null });
  removeFilesMock.mockResolvedValue({ error: null });
});

describe("POST /api/grade-submission-video", () => {
  it("guard first: a rejected owner check is 401, the body is never read and Storage is UNCALLED", async () => {
    requireAppOwnerMock.mockRejectedValue(new Error("Not authorized"));
    const req = jsonRequest({ storagePath: GOOD_PATH });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect((req as unknown as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
    expect(removeFilesMock).not.toHaveBeenCalled();
  });

  it("a non-JSON content-type is 400 before the body is read", async () => {
    const req = jsonRequest({ storagePath: GOOD_PATH }, "text/plain");
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((req as unknown as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
  });

  it("flag OFF: 403 with the typed 'not supported here' class and NO Storage call", async () => {
    flag.on = false;
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ videoFailure: "not supported here" });
    expect(listMock).not.toHaveBeenCalled();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it.each([
    [`${USER}/grading-uploads/../../x/${OBJ}.mp4`],
    [`other-user/grading-uploads/${OBJ}.mp4`],
    [`${USER}/syllabus-uploads/${OBJ}.mp4`],
    [`${USER}/grading-uploads/${OBJ}.zip`],
    [`https://evil.example/${OBJ}.mp4`],
    [""],
  ])("a hostile or foreign path (%s) is 400 and NO Storage call is made", async (storagePath) => {
    const res = await POST(jsonRequest({ storagePath }));
    expect(res.status).toBe(400);
    expect(listMock).not.toHaveBeenCalled();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
    expect(removeFilesMock).not.toHaveBeenCalled();
  });

  it("an oversize stored object is 413 with the typed class AND is deleted; no signed URL is minted", async () => {
    listMock.mockResolvedValue({ data: [{ name: `${OBJ}.mp4`, metadata: { size: VIDEO_MAX_BYTES + 1 } }], error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ videoFailure: "too large" });
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("bad magic bytes: 415 with the typed class AND the object is deleted", async () => {
    stubHeadFetch(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ videoFailure: "unsupported format" });
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });

  it("success: one entry with a videoRef and NO rawBase64; the object is NOT deleted; the fetched URL is the server-minted one", async () => {
    const fetchMock = stubHeadFetch(MP4_HEAD);
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH, name: "demo.mp4", label: "Jordan" }));
    expect(res.status).toBe(200);
    const { entry } = (await res.json()) as { entry: { student: string; submittedFiles: Array<Record<string, unknown>> } };
    expect(entry.student).toBe("Jordan");
    expect(entry.submittedFiles[0].videoRef).toEqual({ storagePath: GOOD_PATH, sizeBytes: 12 * 1024 * 1024 });
    expect("rawBase64" in entry.submittedFiles[0]).toBe(false);
    expect(entry.submittedFiles[0].mimeType).toBe("video/mp4");
    expect(removeFilesMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe("https://signed.example/obj");
    expect(createSignedUrlMock).toHaveBeenCalledWith("course-files", GOOD_PATH, 60);
  });

  it("a client-supplied url or fileUri in the body is ignored: it never reaches fetch", async () => {
    const fetchMock = stubHeadFetch(MP4_HEAD);
    await POST(jsonRequest({ storagePath: GOOD_PATH, url: "https://evil.example/x", fileUri: "https://evil.example/f" }));
    for (const call of fetchMock.mock.calls) {
      expect(String((call as unknown[])[0])).not.toContain("evil.example");
    }
  });
});
