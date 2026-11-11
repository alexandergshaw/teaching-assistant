import { expect, it } from "vitest";
import JSZip from "jszip";
import { planRecoverableZip } from "./large-zip-subset";
import { readBrightspaceIndexEvidence } from "./brightspace-index-read";

it("retains exact index bytes while associating verified student comments", async () => {
  const index = '<html><body><table><tr><td>Smith, Ada</td></tr><tr><td>10-20 - Smith-Ada-Nov 5, 2026 400 PM:<p>Comments: keep this</p></td><td>Submitted: Nov 5</td></tr></table></body></html>';
  const zip = new JSZip(); zip.file("10-20 - Smith-Ada-Nov 5, 2026 400 PM.cpp", "int x;"); zip.file("index.html", index);
  const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  const plan = await planRecoverableZip(source); expect(plan.ok).toBe(true); if (!plan.ok) return;
  const result = await readBrightspaceIndexEvidence(source, plan.groups); expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.sourceBytes).toEqual(new TextEncoder().encode(index));
  expect(result.evidence.groups["10-20"].join(" ")).toContain("Comments: keep this");
  expect(result.evidence.unassigned.length).toBeGreaterThan(0);
});

it("holds invalid UTF-8 and corrupt indexes", async () => {
  const zip = new JSZip(); zip.file("10-20 - Smith-Ada-Nov 5, 2026 400 PM.cpp", "int x;"); zip.file("index.html", new Uint8Array([0xff]));
  const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "STORE" })), source = new Blob([bytes.buffer]);
  const plan = await planRecoverableZip(source); expect(plan.ok).toBe(true); if (!plan.ok) return;
  expect(await readBrightspaceIndexEvidence(source, plan.groups)).toEqual({ ok: false, reason: "The Brightspace index could not be decoded safely." });
  const index = plan.groups.find((group) => group.reason === "unassigned index")!.members[0]; bytes[index.dataOffset] ^= 1;
  expect(await readBrightspaceIndexEvidence(new Blob([bytes.buffer]), plan.groups)).toEqual({ ok: false, reason: "The Brightspace index failed integrity verification." });
});
