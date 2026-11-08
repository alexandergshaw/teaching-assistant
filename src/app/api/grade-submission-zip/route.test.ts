import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// BULK-ZIP BW2: the Route Handler's own guard. action-guard-coverage cannot
// see a Route Handler, so these tests are the only thing behind
// /api/grade-submission-zip. Source-text predicates (RULING 41 style) cover
// the ordering and the soft-budget-under-hard-cap checks; the behaviour tests
// below mock auth, Storage and extraction (network is blocked in vitest).
const ROUTE_PATH = join(process.cwd(), "src/app/api/grade-submission-zip/route.ts");
const routeSource = readFileSync(ROUTE_PATH, "utf8");

/** requireAppOwner( strictly before the first Storage/extract call. The
 * anchor is the first of statObjectSize( CALL, withUploadedSyllabusFile( or
 * ingestZipEntries( after the POST handler starts. */
function checkAuthOrder(src: string): boolean {
  const post = src.indexOf("export async function POST");
  const idxGuard = src.indexOf("requireAppOwner(", post);
  const anchors = ["await statBeforeDeadline(", "await statObjectSize(", "withUploadedSyllabusFile(\n", "await ingestZipEntries(", "return ingestZipEntries("]
    .map((a) => src.indexOf(a, post))
    .filter((i) => i >= 0);
  const idxFirst = Math.min(...anchors);
  return post >= 0 && idxGuard >= 0 && anchors.length > 0 && idxGuard < idxFirst;
}

function checkCsrfFloor(src: string): boolean {
  const idxCt = src.indexOf('req.headers.get("content-type")');
  const idxJson = src.indexOf("req.json(");
  return idxCt >= 0 && idxJson >= 0 && idxCt < idxJson;
}

function checkSoftBudgetUnderCap(src: string): boolean {
  const maxDurationMatch = src.match(/export const maxDuration = (\d+)/);
  const totalBudgetMatch = src.match(/TOTAL_BUDGET_MS = ([\d_]+)/);
  if (!maxDurationMatch || !totalBudgetMatch) return false;
  return Number.parseInt(totalBudgetMatch[1].replace(/_/g, ""), 10) < Number.parseInt(maxDurationMatch[1], 10) * 1000;
}

describe("source-text checks on the real route", () => {
  it("guard is first, content-type precedes the body read, soft budget is under the hard cap", () => {
    expect(checkAuthOrder(routeSource)).toBe(true);
    expect(checkCsrfFloor(routeSource)).toBe(true);
    expect(checkSoftBudgetUnderCap(routeSource)).toBe(true);
  });

  it("uses requireAppOwner, not the weaker guards", () => {
    expect(routeSource).toContain("requireAppOwner(");
    expect(routeSource).not.toContain("requireUser(");
    expect(routeSource).not.toContain("requireOwner(");
  });

  it("the three predicates fail on their own mutation (negative controls)", () => {
    const base = [
      "export const maxDuration = 60;",
      "const TOTAL_BUDGET_MS = 35_000;",
      "export async function POST(req) {",
      "  await requireAppOwner();",
      '  const contentType = req.headers.get("content-type") ?? "";',
      "  const rawBody = await req.json();",
      "  const size = await statObjectSize(path);",
      "}",
    ].join("\n");
    expect(checkAuthOrder(base)).toBe(true);
    expect(checkAuthOrder(base.replace("  await requireAppOwner();\n", ""))).toBe(false);
    expect(checkCsrfFloor(base.replace('  const contentType = req.headers.get("content-type") ?? "";\n', ""))).toBe(false);
    expect(checkSoftBudgetUnderCap(base.replace("35_000", "60_000"))).toBe(false);
  });
});

// The video flag is driven EXPLICITLY off for this baseline file (the shipped
// constant is true since W4); the flag-on staging path is route.video.test.ts.
vi.mock("@/lib/grade/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grade/constants")>("@/lib/grade/constants");
  return { ...actual, VIDEO_GRADING_ENABLED: false };
});

const requireAppOwnerMock = vi.fn();
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: (...args: unknown[]) => requireAppOwnerMock(...args),
}));

const listMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ storage: { from: () => ({ list: (...args: unknown[]) => listMock(...args), download: (...args: unknown[]) => ({ asStream: async () => { const result = await downloadFileMock(...args); return { ...result, data: result.data?.stream() ?? null }; } }) }) } }),
}));

const downloadFileMock = vi.fn();
const removeFilesMock = vi.fn();
vi.mock("@/lib/supabase/storage", () => ({
  downloadFile: (...args: unknown[]) => downloadFileMock(...args),
  removeFiles: (...args: unknown[]) => removeFilesMock(...args),
}));

const ingestZipEntriesMock = vi.fn();
vi.mock("@/lib/grade/extraction", () => ({
  ingestZipEntries: (...args: unknown[]) => ingestZipEntriesMock(...args),
}));

import { ZipCapError } from "@/lib/zip-caps";
import { POST } from "./route";
import { GRADING_ZIP_MAX_BYTES } from "@/lib/grade/grading-zip-transport";
import type { NextRequest } from "next/server";

const USER = "user-1";
const GOOD_PATH = `${USER}/grading-uploads/abc.zip`;

function jsonRequest(body: unknown, contentType = "application/json"): NextRequest {
  const json = vi.fn(async () => body);
  return { headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) }, json } as unknown as NextRequest;
}

async function readLines(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAppOwnerMock.mockResolvedValue({ id: USER, email: "o@example.com" });
  listMock.mockResolvedValue({ data: [{ name: "abc.zip", metadata: { size: 12 * 1024 * 1024 } }], error: null });
  downloadFileMock.mockResolvedValue({ data: new Blob([new Uint8Array(1024)]), error: null });
  removeFilesMock.mockResolvedValue({ error: null });
  ingestZipEntriesMock.mockResolvedValue({ entries: [], attemptedSupportedFiles: 0, failedSupportedFiles: [] });
});

describe("POST /api/grade-submission-zip", () => {
  it("guard first: an unauthenticated POST is 401 and the body is never read, no Storage call", async () => {
    requireAppOwnerMock.mockRejectedValue(new Error("Not authorized"));
    const req = jsonRequest({ storagePath: GOOD_PATH });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect((req as unknown as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(removeFilesMock).not.toHaveBeenCalled();
  });

  it("a non-JSON content-type is 400 before the body is read", async () => {
    const req = jsonRequest({ storagePath: GOOD_PATH }, "text/plain");
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((req as unknown as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
  });

  it.each([
    [`${USER}/syllabus-uploads/abc.zip`],
    [`${USER}/rubric-uploads/abc.zip`],
    [`${USER}/course-1/abc.zip`],
    ["abc.zip"],
    [""],
  ])("the segment bind refuses %s before any Storage call", async (storagePath) => {
    const res = await POST(jsonRequest({ storagePath }));
    expect(res.status).toBe(400);
    expect(listMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(removeFilesMock).not.toHaveBeenCalled();
  });

  it("a foreign-uid or traversal grading path is 400 before ANY Storage call (including list)", async () => {
    for (const storagePath of [`other-user/grading-uploads/abc.zip`, `${USER}/grading-uploads/../../x/abc.zip`]) {
      const res = await POST(jsonRequest({ storagePath }));
      expect(res.status).toBe(400);
    }
    expect(listMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(removeFilesMock).not.toHaveBeenCalled();
    expect(ingestZipEntriesMock).not.toHaveBeenCalled();
  });

  it("W2: a size between the OLD 25MiB ceiling and the new one is no longer refused (the raise reaches the stat gate)", async () => {
    listMock.mockResolvedValue({ data: [{ name: "abc.zip", metadata: { size: 30 * 1024 * 1024 } }], error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(200);
    expect(downloadFileMock).toHaveBeenCalled();
  });

  it("W2 (T6): both ceiling uses in route.ts read the ONE imported constant", () => {
    const uses = routeSource.match(/GRADING_ZIP_MAX_BYTES/g) ?? [];
    // the import, the stat gate, stream bound and post-download re-check
    expect(uses.length).toBe(4);
    expect(routeSource).not.toMatch(/\d+\s*\*\s*1024\s*\*\s*1024/);
  });

  it("S4: an object reported over the ceiling is refused before download", async () => {
    listMock.mockResolvedValue({ data: [{ name: "abc.zip", metadata: { size: GRADING_ZIP_MAX_BYTES + 1 } }], error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(413);
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(ingestZipEntriesMock).not.toHaveBeenCalled();
  });
  it("allows metadata exactly at the ceiling to reach the download backstop", async () => {
    listMock.mockResolvedValue({ data: [{ name: "abc.zip", metadata: { size: GRADING_ZIP_MAX_BYTES } }], error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(200); expect(downloadFileMock).toHaveBeenCalledTimes(1);
  });

  it("refuses unknown size before download and leaves cleanup to the caller", async () => {
    listMock.mockResolvedValue({ data: [], error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(503); expect((await res.json()).error).toContain("size could not be verified");
    expect(downloadFileMock).not.toHaveBeenCalled(); expect(ingestZipEntriesMock).not.toHaveBeenCalled(); expect(removeFilesMock).not.toHaveBeenCalled();
  });
  it("times out and aborts a stalled lookup without continuing a late page", async () => {
    vi.useFakeTimers();
    try {
      let finish!: (value: unknown) => void;
      listMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
      const pending = POST(jsonRequest({ storagePath: GOOD_PATH }));
      await vi.advanceTimersByTimeAsync(35_100);
      const response = await pending;
      expect(response.status).toBe(503);
      expect((await response.json()).error).toContain("Choose the ZIP again");
      expect(listMock.mock.calls[0][2].signal.aborted).toBe(true);
      finish({ data: Array.from({ length: 100 }, (_, i) => ({ name: `abc.zip-${i}`, metadata: { size: 1 } })), error: null });
      await vi.advanceTimersByTimeAsync(0);
      expect(listMock).toHaveBeenCalledTimes(1);
      expect(downloadFileMock).not.toHaveBeenCalled();
      expect(ingestZipEntriesMock).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("uses the remaining request budget for download after a slow lookup", async () => {
    vi.useFakeTimers();
    try {
      listMock.mockImplementationOnce(async () => { await new Promise((resolve) => setTimeout(resolve, 34_000)); return { data: [{ name: "abc.zip", metadata: { size: 64 } }], error: null }; });
      const cancel = vi.fn();
      downloadFileMock.mockResolvedValue({ data: { stream: () => new ReadableStream({ cancel }) }, error: null });
      const pending = POST(jsonRequest({ storagePath: GOOD_PATH }));
      await vi.advanceTimersByTimeAsync(35_100);
      const lines = await readLines(await pending);
      expect(lines[0].error).toContain("too large to prepare in time");
      expect(cancel).toHaveBeenCalledOnce();
      expect(ingestZipEntriesMock).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("finds the exact upload after a page of substring matches", async () => {
    listMock.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => ({ name: `abc.zip-${i}`, metadata: { size: 1 } })), error: null })
      .mockResolvedValueOnce({ data: [{ name: "abc.zip", metadata: { size: 64 } }], error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(200); expect(downloadFileMock).toHaveBeenCalledTimes(1);
    expect(listMock.mock.calls[1][1]).toMatchObject({ offset: 100, search: "abc.zip" });
  });
  it("stops after the bounded lookup when no exact name is found", async () => {
    listMock.mockResolvedValue({ data: Array.from({ length: 100 }, (_, i) => ({ name: `abc.zip-${i}`, metadata: { size: 1 } })), error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(503); expect(listMock).toHaveBeenCalledTimes(10); expect(downloadFileMock).not.toHaveBeenCalled();
  });
  it.each(["error", "throw"])("refuses a Storage list %s before downloading", async (mode) => {
    if (mode === "throw") listMock.mockRejectedValueOnce(new Error("storage unavailable"));
    else listMock.mockResolvedValueOnce({ data: null, error: { message: "storage unavailable" } });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(503); expect(downloadFileMock).not.toHaveBeenCalled(); expect(removeFilesMock).not.toHaveBeenCalled();
  });
  it.each([null, "123", -1, NaN, Infinity, 1.5])("refuses invalid stored size %s before download", async (size) => {
    listMock.mockResolvedValue({ data: [{ name: "abc.zip", metadata: { size } }], error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(503); expect(downloadFileMock).not.toHaveBeenCalled(); expect(removeFilesMock).not.toHaveBeenCalled();
  });
  it("retains the post-download size backstop for stale metadata", async () => {
    const cancel = vi.fn();
    downloadFileMock.mockResolvedValue({ data: { stream: () => new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(GRADING_ZIP_MAX_BYTES + 1)); }, cancel }) }, error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    const lines = await readLines(res); expect(lines[0]).toMatchObject({ type: "done", error: expect.any(String) });
    expect(ingestZipEntriesMock).not.toHaveBeenCalled(); expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("aborts a stalled download at the route deadline without extracting", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      downloadFileMock.mockResolvedValue({ data: { stream: () => new ReadableStream({ cancel }) }, error: null });
      const pending = POST(jsonRequest({ storagePath: GOOD_PATH }));
      await vi.advanceTimersByTimeAsync(35_100);
      const lines = await readLines(await pending);
      expect(lines[0]).toMatchObject({ type: "done", error: expect.stringContaining("too large to prepare in time") });
      expect(cancel).toHaveBeenCalledOnce();
      expect(ingestZipEntriesMock).not.toHaveBeenCalled();
      expect(downloadFileMock.mock.calls[0][2].signal.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it("cleans up after a Storage stream fails without extracting", async () => {
    downloadFileMock.mockResolvedValue({ data: { stream: () => new ReadableStream({ start(c) { c.error(new Error("stream failed")); } }) }, error: null });
    const lines = await readLines(await POST(jsonRequest({ storagePath: GOOD_PATH })));
    expect(lines[0]).toMatchObject({ type: "done", error: "stream failed" });
    expect(ingestZipEntriesMock).not.toHaveBeenCalled();
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });
  it("does not start extraction when byte conversion finishes after the deadline", async () => {
    vi.useFakeTimers();
    let finish!: (value: ArrayBuffer) => void;
    const conversion = vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    try {
      const pending = POST(jsonRequest({ storagePath: GOOD_PATH }));
      await vi.advanceTimersByTimeAsync(35_100);
      expect((await readLines(await pending))[0].error).toContain("too large to prepare in time");
      expect(finish).toBeTypeOf("function");
      finish(new ArrayBuffer(1));
      await vi.advanceTimersByTimeAsync(0);
      expect(ingestZipEntriesMock).not.toHaveBeenCalled();
    } finally { conversion.mockRestore(); vi.useRealTimers(); }
  });

  it("isolates the oversized student and emits the other entries; the object is deleted", async () => {
    ingestZipEntriesMock.mockResolvedValue({
      entries: [
        { student: "A", content: "a", mergedFileCount: 1, submittedFiles: [] },
        { student: "Big", content: "x".repeat(4_000_000), mergedFileCount: 1, submittedFiles: [] },
        { student: "C", content: "c", mergedFileCount: 1, submittedFiles: [] },
      ],
      attemptedSupportedFiles: 3,
      failedSupportedFiles: [],
    });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH, provider: "gemini" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = await readLines(res);
    expect(lines.map((line) => line.type)).toEqual(["entry", "skip", "entry", "done"]);
    expect(lines[1]).toMatchObject({ student: "Big (item 2)", reason: "too large to grade on this surface" });
    expect(lines[3]).toMatchObject({ studentsFound: 3, studentsEmitted: 2 });
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });

  it("O-10: a video object path posted to the ZIP route is refused 400 and is NEVER stat'ed, downloaded or deleted", async () => {
    for (const ext of ["mp4", "webm", "mov", "m4v", "MP4"]) {
      const res = await POST(jsonRequest({ storagePath: `${USER}/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.${ext}` }));
      expect(res.status).toBe(400);
    }
    expect(listMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(removeFilesMock).not.toHaveBeenCalled();
    expect(ingestZipEntriesMock).not.toHaveBeenCalled();
  });

  it("flag explicitly OFF: no stager is handed to extraction, so the pre-feature path is unchanged", async () => {
    await POST(jsonRequest({ storagePath: GOOD_PATH }));
    const options = ingestZipEntriesMock.mock.calls[0][1] as Record<string, unknown>;
    expect(options.stageVideo).toBeUndefined();
    expect(options).toMatchObject({ deferLinks: true, requireSupportedFiles: true });
  });

  it("a thrown video-count ZipCapError becomes a done-with-error line carrying the TYPED class", async () => {
    ingestZipEntriesMock.mockRejectedValue(
      new ZipCapError({
        code: "video-count",
        entryName: "a/5.mp4",
        chain: [],
        limitName: "ZIP_MAX_VIDEO_MEMBERS",
        limitValue: 4,
        limitIsBytes: false,
        observed: 5,
      })
    );
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    const lines = await readLines(res);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ type: "done", videoFailure: "too many videos" });
    expect(String(lines[0].error).startsWith("Refused: ")).toBe(true);
  });

  it("an ordinary refusal carries NO videoFailure key (flag-off wire stays byte-identical)", async () => {
    ingestZipEntriesMock.mockRejectedValue(new Error("Refused: too many entries"));
    const lines = await readLines(await POST(jsonRequest({ storagePath: GOOD_PATH })));
    expect(lines[0]).not.toHaveProperty("videoFailure");
  });

  it("an extraction refusal becomes a worded done-with-error line, and the object is still deleted", async () => {
    ingestZipEntriesMock.mockRejectedValue(new Error("Refused: too many entries"));
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    const lines = await readLines(res);
    expect(lines).toEqual([{ type: "done", error: "Refused: too many entries" }]);
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });
});
