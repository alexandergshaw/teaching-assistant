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
  const anchors = ["await statObjectSize(", "withUploadedSyllabusFile(\n", "await ingestZipEntries(", "return ingestZipEntries("]
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

const requireAppOwnerMock = vi.fn();
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: (...args: unknown[]) => requireAppOwnerMock(...args),
}));

const listMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ storage: { from: () => ({ list: (...args: unknown[]) => listMock(...args) }) } }),
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

import { POST } from "./route";
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

  it("S4: an object reported over the ceiling is refused before download", async () => {
    listMock.mockResolvedValue({ data: [{ name: "abc.zip", metadata: { size: 30 * 1024 * 1024 } }], error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(res.status).toBe(413);
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(ingestZipEntriesMock).not.toHaveBeenCalled();
  });

  it("S4 backstop: an unknown stat size with an over-ceiling blob is refused before extraction, and the object is deleted", async () => {
    listMock.mockResolvedValue({ data: [], error: null });
    downloadFileMock.mockResolvedValue({ data: { size: 30 * 1024 * 1024, arrayBuffer: vi.fn() }, error: null });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    const lines = await readLines(res);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ type: "done" });
    expect(typeof lines[0].error).toBe("string");
    expect(ingestZipEntriesMock).not.toHaveBeenCalled();
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });

  it("streams entry lines, a skip line for the oversized student, and a sentinel; the object is deleted", async () => {
    ingestZipEntriesMock.mockResolvedValue({
      entries: [
        { student: "A", content: "a", mergedFileCount: 1, submittedFiles: [] },
        { student: "Big", content: "x".repeat(4_000_000), mergedFileCount: 1, submittedFiles: [] },
        { student: "C", content: "c", mergedFileCount: 1, submittedFiles: [] },
      ],
      attemptedSupportedFiles: 3,
      failedSupportedFiles: ["bad.pdf"],
    });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH, provider: "gemini" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = await readLines(res);
    expect(lines.map((l) => l.type)).toEqual(["entry", "skip", "entry", "done"]);
    expect(lines[1]).toMatchObject({ student: "Big" });
    expect(lines[3]).toMatchObject({
      studentsFound: 3,
      studentsEmitted: 2,
      failedSupportedFiles: ["bad.pdf"],
    });
    expect(lines[3]).not.toHaveProperty("nestedZipFailures");
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });

  it("an extraction refusal becomes a worded done-with-error line, and the object is still deleted", async () => {
    ingestZipEntriesMock.mockRejectedValue(new Error("Refused: too many entries"));
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    const lines = await readLines(res);
    expect(lines).toEqual([{ type: "done", error: "Refused: too many entries" }]);
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [GOOD_PATH]);
  });
});
