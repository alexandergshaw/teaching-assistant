import { describe, expect, it, vi } from "vitest";
import { admitRoleFiles, readRoleSetup, resolveRoleSetup, ROLE_BYTE_LIMIT, type ChatRoleRow } from "./chatFileRoles";
describe("explicit role intake admission and setup", () => {
  it("atomically bounds file count and aggregate declared bytes", () => {
    expect(admitRoleFiles(Array.from({ length: 40 }, () => new File(["a"], "same.txt")))).toBeNull();
    expect(admitRoleFiles(Array.from({ length: 41 }, () => new File(["a"], "same.txt")))).toContain("40");
    expect(admitRoleFiles([{ size: ROLE_BYTE_LIMIT } as File])).toBeNull();
    expect(admitRoleFiles([{ size: ROLE_BYTE_LIMIT + 1 } as File])).toContain("size limit");
  });
  it("decodes exact UTF-8 with BOM removal and admits the character/raw-byte boundaries without truncating", async () => {
    expect(await readRoleSetup(new File(["\uFEFFExact\r\nRubric (12 pts)"], "rubric.md"))).toBe("Exact\r\nRubric (12 pts)");
    expect((await readRoleSetup(new File(["a".repeat(20_000)], "rubric.markdown"))).length).toBe(20_000);
    expect((await readRoleSetup(new File(["𐀀".repeat(10_000)], "rubric.txt"))).length).toBe(20_000);
    await expect(readRoleSetup(new File(["a".repeat(20_001)], "rubric.txt"))).rejects.toThrow("20,000");
    const boundary = new File(["a".repeat(80_000)], "rubric.txt"), boundaryRead = vi.spyOn(boundary, "arrayBuffer");
    await expect(readRoleSetup(boundary)).rejects.toThrow("20,000"); expect(boundaryRead).toHaveBeenCalledTimes(1);
    const arrayBuffer = vi.fn();
    await expect(readRoleSetup({ name: "rubric.txt", size: 80_001, arrayBuffer } as unknown as File)).rejects.toThrow("80,000"); expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it.each([new File(["rubric"], "rubric.pdf"), new File([new Uint8Array([0xff, 0xfe, 0x61])], "rubric.txt"), new File(["a\0b"], "rubric.txt"), new File([" \r\n"], "rubric.txt")])("refuses unavailable/binary/empty setup: $name", async (file) => { await expect(readRoleSetup(file)).rejects.toThrow(); });
  it("keeps draft by default, replaces only explicitly, rejects competing sources and gives combined text to both fields", () => {
    const source: ChatRoleRow = { id: 1, name: "combined.txt", size: 10, file: new File(["FILE"], "combined.txt"), role: "combined", status: "ready", text: "FILE_EXACT" };
    const keep = resolveRoleSetup([source], { instructions: "TYPED", rubric: "" }, { instructions: "draft", rubric: "draft" }, false);
    expect(keep.effective).toEqual({ instructions: "TYPED", rubric: "FILE_EXACT" });
    expect(resolveRoleSetup([source], { instructions: "TYPED", rubric: "" }, { instructions: "file", rubric: "file" }, false).effective).toEqual({ instructions: "FILE_EXACT", rubric: "FILE_EXACT" });
    expect(resolveRoleSetup([source, { ...source, id: 2 }], { instructions: "", rubric: "" }, { instructions: "file", rubric: "file" }, false).errors).toHaveLength(2);
    expect(resolveRoleSetup([source], { instructions: "", rubric: "" }, { instructions: "file", rubric: "file" }, true).errors.join(" ")).toContain("New session");
  });
});
