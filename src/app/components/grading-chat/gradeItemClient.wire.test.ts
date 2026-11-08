import { afterEach, describe, expect, it, vi } from "vitest";
import { ITEM_REQUEST_BYTE_BUDGET, type GradeRunItemRequestBody } from "@/app/components/grading/incrementalRunPlan";
import { serializeGradeItemWithOfficeSource } from "@/app/components/grading/officeSourceWire";
import { postGradeRunItem } from "./gradeItemClient";

function request(content: string): GradeRunItemRequestBody {
  return { sourceIndex: 0, entry: { student: "Ada", content, mergedFileCount: 1, submittedFiles: [] }, assignmentInstructions: "説明", rubric: "Rubric", provider: "gemini", pointsPossible: 10 };
}
const bytes = (body: GradeRunItemRequestBody) => new TextEncoder().encode(serializeGradeItemWithOfficeSource(body)).byteLength;
afterEach(() => vi.unstubAllGlobals());
describe("grade item complete wire budget", () => {
  it("sends an exact-budget body", async () => {
    const empty = request(""); const sized = request("x".repeat(ITEM_REQUEST_BYTE_BUDGET - bytes(empty)));
    expect(bytes(sized)).toBe(ITEM_REQUEST_BYTE_BUDGET);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ result: { student: "Ada" } }), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    await postGradeRunItem(sized); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new TextEncoder().encode(fetchMock.mock.calls[0][1]?.body as string).byteLength).toBe(ITEM_REQUEST_BYTE_BUDGET);
  });
  it("refuses one byte over budget before sending any request", async () => {
    const empty = request(""); const sized = request("x".repeat(ITEM_REQUEST_BYTE_BUDGET - bytes(empty) + 1));
    expect(bytes(sized)).toBe(ITEM_REQUEST_BYTE_BUDGET + 1);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(postGradeRunItem(sized)).rejects.toThrow(/submission and grading setup exceed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("counts multibyte rubric and instructions in the complete request", async () => {
    const empty = request(""); const content = "x".repeat(ITEM_REQUEST_BYTE_BUDGET - bytes(empty));
    const sized = { ...request(content), rubric: "採点基準" };
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(bytes(sized)).toBeGreaterThan(ITEM_REQUEST_BYTE_BUDGET);
    await expect(postGradeRunItem(sized)).rejects.toThrow(/request size limit/); expect(fetchMock).not.toHaveBeenCalled();
  });
});
