import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { buildRecoverableZip, checkRecoverableBatch, planRecoverableZip } from "./large-zip-subset";
import { ingestZipEntries } from "./extraction";
import { GRADING_ZIP_MAX_BYTES } from "./grading-zip-transport";

describe("recoverable large ZIP subset", () => {
  it("uses the same metadata limit when planning and building", async () => {
    const zip = new JSZip(); zip.file("ada_1_2_a.txt", "a"); zip.file("lin_3_4_b.txt", "b");
    const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]);
    const plan = await planRecoverableZip(source); expect(plan.ok).toBe(true); if (!plan.ok) return;
    for (const groups of [plan.groups, plan.groups.slice(0, 1), plan.groups.slice(1)]) {
      expect(checkRecoverableBatch(groups, plan.groups)).toBeNull();
      expect((await buildRecoverableZip(source, groups.map((group) => group.label), true)).ok).toBe(true);
    }
    const tooMany = Array.from({ length: 1001 }, () => plan.groups[0].members[0]);
    expect(checkRecoverableBatch([{ ...plan.groups[0], members: tooMany }], plan.groups)).toBe("batch exceeds grading limits");
    expect(checkRecoverableBatch(plan.groups, plan.groups, [{ nameBytes: 20, bytes: 200 * 1024 * 1024 }])).toBe("batch exceeds grading limits");
  });
  it("does not reserve space for a sentinel omitted from in-app batches", async () => {
    const zip = new JSZip(); zip.file("ada_1_2_a.txt", "a");
    const plan = await planRecoverableZip(new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer])); if (!plan.ok) throw new Error("fixture failed");
    const member = plan.groups[0].members[0], overhead = 22 + 30 + member.rawName.length + member.centralEntry.length;
    const group = { ...plan.groups[0], members: [{ ...member, compressedBytes: GRADING_ZIP_MAX_BYTES - overhead }] };
    expect(checkRecoverableBatch([group], [group], [], false, true)).toBeNull();
    expect(checkRecoverableBatch([group], [group])).toBe("batch exceeds transport limit");
  });
  it("reuses verified bytes only for the same immutable source", async () => {
    const zip = new JSZip(); zip.file("ada_1_2_work.txt", "content");
    const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "STORE" }));
    const source = new Blob([bytes.buffer]), plan = await planRecoverableZip(source); expect(plan.ok).toBe(true); if (!plan.ok) return;
    const member = plan.groups[0].members[0], spy = vi.spyOn(source, "slice"), cache = new WeakMap<Blob, Set<string>>();
    expect((await buildRecoverableZip(source, ["ada"], true, cache)).ok).toBe(true);
    const reads = () => spy.mock.calls.filter(([start, end]) => start === member.dataOffset && end === member.dataOffset + member.compressedBytes).length;
    const firstReads = reads(); expect(firstReads).toBeGreaterThan(0);
    expect((await buildRecoverableZip(source, ["ada"], true, cache)).ok).toBe(true);
    // Each build still slices the member for output; the second does not read it for CRC.
    expect(reads() - firstReads).toBe(1);
    bytes[member.dataOffset] ^= 1;
    const changed = new Blob([bytes.buffer]);
    expect(await buildRecoverableZip(changed, ["ada"], true, cache)).toEqual({ ok: false, reason: "member integrity could not be verified in this browser" });
  });
  it("inventories numeric Brightspace groups and keeps the unassigned index out of grading", async () => {
    const zip = new JSZip(); zip.file("100-200 - Last-First-Nov 5, 2026 400 PM.cpp", "int main() {}"); zip.file("100-200 - Other-First-Nov 5, 2026 400 PM.docx", "synthetic"); zip.file("300-400 - project.zip", "not opened"); zip.file("index.html", "<html>summary</html>");
    const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]);
    const plan = await planRecoverableZip(source); expect(plan.ok).toBe(true); if (!plan.ok) return;
    expect(plan.groups.map((group) => [group.label, group.members.length, group.reason])).toEqual([["100-200", 2, undefined], ["300-400", 1, "nested archive"], ["Unassigned index.html", 1, "unassigned index"]]);
    expect((await buildRecoverableZip(source, ["Unassigned index.html"])).ok).toBe(false);
    expect((await buildRecoverableZip(source, ["300-400"])).ok).toBe(false);
  });
  it("refuses ambiguous numeric IDs that downstream grouping would merge", async () => {
    const zip = new JSZip(); zip.file("100-200 - one.cpp", "one"); zip.file("100-201 - two.cpp", "two");
    const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]);
    expect(await planRecoverableZip(source)).toEqual({ ok: false, reason: "ambiguous member identity" });
  });
  it("retains all files from one LMS group across different or unknown times", async () => {
    const zip = new JSZip(); zip.file("100-200 - Last-First-Nov 5, 2026 400 PM.cpp", "int a;"); zip.file("100-200 - Last-First-Nov 5, 2026 402 PM.txt", "reflection"); zip.file("100-200 - unknown.h", "int b;");
    const bytes = await zip.generateAsync({ type: "uint8array" }); const source = new Blob([new Uint8Array(bytes).buffer]);
    const plan = await planRecoverableZip(source); expect(plan.ok).toBe(true); if (!plan.ok) return; expect(plan.groups[0].reason).toBeUndefined();
    const built = await buildRecoverableZip(source, ["100-200"], true); expect(built.ok).toBe(true); if (!built.ok) return;
    const mapping = Object.fromEntries(Object.keys(zip.files).map((path) => [path, "Student"]));
    const result = await ingestZipEntries(await built.archive.arrayBuffer(), { requireSupportedFiles: true, reviewedMapping: mapping }); expect(result.entries).toHaveLength(1); expect(result.entries[0].mergedFileCount).toBe(3); expect(result.entries[0].content).toContain("reflection");
  });
  it("passes Brightspace code, header and reflection together through reviewed extraction", async () => {
    const zip = new JSZip(); zip.file("100-200 - Main-First-Nov 5, 2026 400 PM.cpp", "int main() { return 0; }"); zip.file("100-200 - Vector-First-Nov 5, 2026 400 PM.hpp", "int value;"); zip.file("100-200 - Reflect-First-Nov 5, 2026 400 PM.txt", "Synthetic reflection.");
    const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]);
    const built = await buildRecoverableZip(source, ["100-200"], true); expect(built.ok).toBe(true); if (!built.ok) return;
    const mapping = { "100-200 - Main-First-Nov 5, 2026 400 PM.cpp": "Student", "100-200 - Vector-First-Nov 5, 2026 400 PM.hpp": "Student", "100-200 - Reflect-First-Nov 5, 2026 400 PM.txt": "Student" };
    const result = await ingestZipEntries(await built.archive.arrayBuffer(), { requireSupportedFiles: true, reviewedMapping: mapping });
    expect(result.entries).toHaveLength(1); expect(result.entries[0].student).toBe("Student"); expect(result.entries[0].mergedFileCount).toBe(3);
    expect(result.entries[0].content).toContain("int main()"); expect(result.entries[0].content).toContain("int value;"); expect(result.entries[0].content).toContain("Synthetic reflection.");
  });
  it("refuses Brightspace reviewed mappings that merge, split, omit or mix source groups", async () => {
    const zip = new JSZip(); zip.file("100-200 - First-First-Nov 5, 2026 400 PM.cpp", "int a;"); zip.file("100-200 - Second-First-Nov 5, 2026 400 PM.h", "int b;"); zip.file("300-400 - other.cpp", "int c;"); const bytes = await zip.generateAsync({ type: "arraybuffer" });
    await expect(ingestZipEntries(bytes, { requireSupportedFiles: true, reviewedMapping: { "100-200 - First-First-Nov 5, 2026 400 PM.cpp": "Student", "100-200 - Second-First-Nov 5, 2026 400 PM.h": "Student", "300-400 - other.cpp": "student" } })).rejects.toThrow(/split or merge/i);
    await expect(ingestZipEntries(bytes, { requireSupportedFiles: true, reviewedMapping: { "100-200 - First-First-Nov 5, 2026 400 PM.cpp": "Student", "100-200 - Second-First-Nov 5, 2026 400 PM.h": "Other", "300-400 - other.cpp": "Third" } })).rejects.toThrow(/split or merge/i);
    await expect(ingestZipEntries(bytes, { requireSupportedFiles: true, reviewedMapping: { "100-200 - First-First-Nov 5, 2026 400 PM.cpp": "Student" } })).rejects.toThrow(/mapping does not match/i);
    const mixed = new JSZip(); mixed.file("100-200 - First-First-Nov 5, 2026 400 PM.cpp", "int a;"); mixed.file("unrecognized.cpp", "int b;");
    const source = new Blob([new Uint8Array(await mixed.generateAsync({ type: "uint8array" })).buffer]);
    expect(await planRecoverableZip(source)).toEqual({ ok: false, reason: "unrecognized member identity" });
  });
  it("keeps complete student groups together and refuses groups with nested archives", async () => {
    const zip = new JSZip(); zip.file("ada_1_2_one.txt", "first"); zip.file("ada_1_2_two.py", "print(1)"); zip.file("lin_3_4_one.txt", "work"); zip.file("lin_3_4_child.zip", "not an archive");
    const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })).buffer]);
    const plan = await planRecoverableZip(source);
    expect(plan.ok).toBe(true); if (!plan.ok) return;
    expect(plan.groups.map((group) => [group.label, group.members.length, group.reason])).toEqual([["ada", 2, undefined], ["lin", 2, "nested archive"]]);
    expect((await buildRecoverableZip(source, ["lin"])).ok).toBe(false);
    const built = await buildRecoverableZip(source, ["ada"]); expect(built.ok).toBe(true); if (!built.ok) return;
    expect(built.ownershipVerified).toBe(false);
    expect(built.selected.map((group) => [group.label, group.sourceIdentifier, group.members.length])).toEqual([["ada", "1", 2]]);
    expect(built.omitted.map((group) => [group.label, group.reason])).toEqual([["lin", "nested archive"]]);
    const extracted = await JSZip.loadAsync(await built.archive.arrayBuffer(), { checkCRC32: true });
    expect(Object.keys(extracted.files)).toEqual(["ada_1_2_one.txt", "ada_1_2_two.py", "PARTIAL_ARCHIVE_REQUIRES_REVIEW.json"]);
    expect(JSON.parse(await extracted.file("PARTIAL_ARCHIVE_REQUIRES_REVIEW.json")!.async("string"))).toMatchObject({ ownershipVerified: false, selected: [{ label: "ada" }], omitted: [{ label: "lin", reason: "nested archive" }] });
    await expect(ingestZipEntries(await built.archive.arrayBuffer(), { requireSupportedFiles: true })).rejects.toThrow(/partial archive includes omitted submissions/i);
    const handoff = await buildRecoverableZip(source, ["ada"], true); expect(handoff.ok).toBe(true); if (!handoff.ok) return;
    const handoffFiles = await JSZip.loadAsync(await handoff.archive.arrayBuffer(), { checkCRC32: true });
    expect(handoffFiles.file("PARTIAL_ARCHIVE_REQUIRES_REVIEW.json")).toBeNull();
    expect(handoff.omitted.map((group) => [group.label, group.reason])).toEqual([["lin", "nested archive"]]);
    const mapping = { "ada_1_2_one.txt": "ada", "ada_1_2_two.py": "ada" };
    const admitted = await ingestZipEntries(await handoff.archive.arrayBuffer(), { requireSupportedFiles: true, reviewedMapping: mapping });
    expect(admitted.entries.map((entry) => [entry.student, entry.mergedFileCount])).toEqual([["ada", 2]]);
    const remapped = await ingestZipEntries(await handoff.archive.arrayBuffer(), { requireSupportedFiles: true, reviewedMapping: { "ada_1_2_one.txt": "other", "ada_1_2_two.py": "other" } });
    expect(remapped.entries.map((entry) => [entry.student, entry.mergedFileCount])).toEqual([["other", 2]]);
    await expect(ingestZipEntries(await handoff.archive.arrayBuffer(), { requireSupportedFiles: true, reviewedMapping: { "ada_1_2_one.txt": "ada" } })).rejects.toThrow(/mapping does not match/i);
    expect(await extracted.file("ada_1_2_one.txt")!.async("string")).toBe("first");
    expect(await extracted.file("ada_1_2_two.py")!.async("string")).toBe("print(1)");
  });
  it("refuses unknown groupings and tampered compressed content", async () => {
    const unknown = new JSZip(); unknown.file("unlabeled.txt", "content");
    expect((await planRecoverableZip(new Blob([new Uint8Array(await unknown.generateAsync({ type: "uint8array" })).buffer]))).ok).toBe(false);
    const zip = new JSZip(); zip.file("ada_1_2_work.txt", "content");
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" }); bytes[30 + "ada_1_2_work.txt".length] ^= 1;
    const result = await buildRecoverableZip(new Blob([new Uint8Array(bytes).buffer]), ["ada"]);
    expect(result).toEqual({ ok: false, reason: "member integrity could not be verified in this browser" });
  });
  it.each([["ada_1_2_a.txt", "ada_2_3_b.txt"], ["ada_1_2_a.txt", "lin_1_3_b.txt"]])("refuses conflicting name and numeric identity", async (first, second) => {
    const zip = new JSZip(); zip.file(first, "a"); zip.file(second, "b");
    const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]);
    expect(await planRecoverableZip(source)).toEqual({ ok: false, reason: "ambiguous member identity" });
    expect((await buildRecoverableZip(source, ["ada"])).ok).toBe(false);
  });
  it("accepts distinct per-file numeric suffixes when the first numeric field is consistent", async () => {
    const zip = new JSZip(); zip.file("ada_12_101_work.txt", "one"); zip.file("ada_12_102_work.py", "two"); zip.file("lin_13_103_work.txt", "three");
    const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]);
    const plan = await planRecoverableZip(source); expect(plan.ok).toBe(true); if (!plan.ok) return;
    expect(plan.groups.map((group) => [group.sourceIdentifier, group.members.length])).toEqual([["12", 2], ["13", 1]]);
  });
  it("refuses a filename that the grading intake would group under another student", async () => {
    const zip = new JSZip(); zip.file("ada_lovelace_12_101_work.txt", "one");
    const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]);
    expect(await planRecoverableZip(source)).toEqual({ ok: false, reason: "archive grouping differs from grading intake" });
  });
  it("refuses server mapping that merges or splits source groups", async () => {
    const zip = new JSZip(); zip.file("ada_1_2_one.txt", "one"); zip.file("ada_1_3_two.txt", "two"); zip.file("lin_2_4_work.txt", "three");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    await expect(ingestZipEntries(bytes, { requireSupportedFiles: true, reviewedMapping: { "ada_1_2_one.txt": "Student", "ada_1_3_two.txt": "Student", "lin_2_4_work.txt": " student " } })).rejects.toThrow(/split or merge/i);
    await expect(ingestZipEntries(bytes, { requireSupportedFiles: true, reviewedMapping: { "ada_1_2_one.txt": "Student", "ada_1_3_two.txt": "Other", "lin_2_4_work.txt": "Third" } })).rejects.toThrow(/split or merge/i);
    for (const variant of ["student", "Ｓtudent"]) await expect(ingestZipEntries(bytes, { requireSupportedFiles: true, reviewedMapping: { "ada_1_2_one.txt": "Student", "ada_1_3_two.txt": variant, "lin_2_4_work.txt": "Third" } })).rejects.toThrow(/split or merge/i);
    const grouped = await ingestZipEntries(bytes, { requireSupportedFiles: true, reviewedMapping: { "ada_1_2_one.txt": " Student ", "ada_1_3_two.txt": "Student", "lin_2_4_work.txt": "Third" } });
    expect(grouped.entries.map((entry) => [entry.student, entry.mergedFileCount])).toEqual([["Student", 2], ["Third", 1]]);
  });
});
