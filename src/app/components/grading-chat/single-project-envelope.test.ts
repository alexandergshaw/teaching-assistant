import { expect, it } from "vitest";
import JSZip from "jszip";
import { createSingleProjectEnvelope } from "./single-project-envelope";
import { planRecoverableZip } from "@/lib/grade/large-zip-subset";
import { inspectBrightspaceProject } from "@/lib/grade/brightspace-project-inventory";

it("preserves the original project and companion bytes in one review envelope", async () => {
  const zip = new File([new Uint8Array([80, 75, 1, 2])], "10-20 - Example-Ada-Nov 13, 2026 502 PM.zip");
  const doc = new File([new Uint8Array([0, 255, 13, 10])], "10-20 - Example-Ada-Nov 13, 2026 502 PM.docx");
  const result = await createSingleProjectEnvelope([zip, doc]); expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.group).toBe("10-20"); expect(result.originalFiles).toEqual([zip, doc]);
  const extracted = await JSZip.loadAsync(await result.archive.arrayBuffer());
  expect(await extracted.file(zip.name)!.async("uint8array")).toEqual(new Uint8Array([80, 75, 1, 2]));
  expect(await extracted.file(doc.name)!.async("uint8array")).toEqual(new Uint8Array([0, 255, 13, 10]));
});

it("refuses to merge different students, attempts, or duplicate names", async () => {
  const zip = new File(["zip"], "10-20 - Example-Ada-Nov 13, 2026 502 PM.zip");
  for (const name of ["11-20 - Other-Bob-Nov 13, 2026 502 PM.docx", "10-20 - Example-Ada-Nov 12, 2026 502 PM.docx", zip.name]) {
    expect((await createSingleProjectEnvelope([zip, new File(["x"], name)])).ok).toBe(false);
  }
});

it("keeps same-attempt duplicate-suffixed companion names intact", async () => {
  const zip = new File(["zip"], "10-20 - Example-Ada-Nov 13, 2026 502 PM.zip");
  const doc = new File(["first"], "10-20 - Example-Ada-Nov 13, 2026 502 PM.docx");
  const second = new File(["second"], "10-20 - Example-Ada-Nov 13, 2026 502 PM(1).docx");
  const result = await createSingleProjectEnvelope([zip, doc, second]); expect(result.ok).toBe(true); if (!result.ok) return;
  const entries = await JSZip.loadAsync(await result.archive.arrayBuffer());
  expect(await entries.file(second.name)!.async("string")).toBe("second");
});

it("is accepted by the existing archive planner and inventories unexamined binaries", async () => {
  const inner = new JSZip().file("project/main.cpp", "int main(){}").file("project/Debug/main.exe", "binary");
  const zip = new File([new Uint8Array(await inner.generateAsync({ type: "uint8array" })).buffer], "10-20 - Example-Ada-Nov 13, 2026 502 PM.zip");
  const doc = new File(["doc"], "10-20 - Example-Ada-Nov 13, 2026 502 PM.docx");
  const envelope = await createSingleProjectEnvelope([zip, doc], "Ada Example"); expect(envelope.ok).toBe(true); if (!envelope.ok) return;
  const plan = await planRecoverableZip(envelope.archive); expect(plan.ok).toBe(true); if (!plan.ok) return;
  expect(plan.groups).toHaveLength(1); expect(plan.groups[0].label).toBe(envelope.group);
  const member = plan.groups[0].members.find((item) => item.nestedArchive)!;
  const inventory = await inspectBrightspaceProject(envelope.archive, member); expect(inventory.ok).toBe(true);
  if (inventory.ok) expect(inventory.files.find((item) => item.path.endsWith("main.exe"))?.disposition).toBe("unexamined-binary");
});
