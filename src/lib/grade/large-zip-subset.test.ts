import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildRecoverableZip, planRecoverableZip } from "./large-zip-subset";
import { ingestZipEntries } from "./extraction";

describe("recoverable large ZIP subset", () => {
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
