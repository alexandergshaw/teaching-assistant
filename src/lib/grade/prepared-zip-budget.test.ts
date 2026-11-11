import { expect, it } from "vitest";
import JSZip from "jszip";
import { inspectPreparedZipBudget, preparedZipBudgetFits } from "./prepared-zip-budget";
import { mergePreparedZips } from "./merge-prepared-zips";
import { chargeArchiveLevel, createZipBudget } from "@/lib/zip-caps";
import { extractTextFromBuffer } from "@/lib/office-extract";

it("counts nested directory entries and charges outer members before nested contents", async () => {
  const inner = new JSZip(); inner.file("project/main.cpp", "int main() {}");
  const outer = new JSZip(); outer.file("100-200 - project.zip", await inner.generateAsync({ type: "uint8array", compression: "STORE" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  const budget = await inspectPreparedZipBudget(source); expect(budget).not.toBeNull();
  expect(budget?.nestedEntries).toBe(2);
  expect(budget && preparedZipBudgetFits([budget], 105 * 1024 * 1024)).toBe(true);
  expect(budget && preparedZipBudgetFits([budget], 1)).toBe(false);
  expect(budget && preparedZipBudgetFits([budget, budget], 105 * 1024 * 1024)).toBe(false);
});

it("refuses unclassified nested data instead of silently omitting it", async () => {
  const inner = new JSZip(); inner.file("project/unknown.db", "data");
  const outer = new JSZip(); outer.file("100-200 - project.zip", await inner.generateAsync({ type: "uint8array", compression: "STORE" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  expect(await inspectPreparedZipBudget(source)).toBeNull();
});

it("holds unreadable Office documents instead of guessing their extraction budget", async () => {
  const outer = new JSZip(); outer.file("100-200 - work.docx", "document container");
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  expect(await inspectPreparedZipBudget(source)).toBeNull();
});

it("accounts for videos and Office bytes together", async () => {
  const document = new JSZip(); document.file("word/document.xml", "<w:p>content</w:p>");
  const zip = new JSZip(); zip.file("100-200 - work.docx", await document.generateAsync({ type: "uint8array", compression: "STORE" })); zip.file("100-200 - video.mp4", "video fixture");
  const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  const summary = await inspectPreparedZipBudget(source); expect(summary?.videos).toBe(1); expect(summary?.outerOfficeBytes).toBeGreaterThan(0);
  if (summary) expect(preparedZipBudgetFits([{ ...summary, videos: 5 }], 105 * 1024 * 1024)).toBe(false);
});

it("rejects opaque data masquerading as a supported flat log before dispatch", async () => {
  const zip = new JSZip(); zip.file("100-200 - work.log", new Uint8Array([0xff, 0xfe]));
  const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  expect(await inspectPreparedZipBudget(source)).toBeNull();
});

it.each(["", "   \r\n"])("holds a guarded text file the extractor cannot emit", async (text) => {
  const zip = new JSZip(); zip.file("100-200 - work.log", text);
  const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  expect(await inspectPreparedZipBudget(source)).toBeNull();
});

it("includes a docx document XML charge in the shared budget", async () => {
  const docx = new JSZip(); docx.file("word/document.xml", "<w:p>student content</w:p>");
  const outer = new JSZip(); outer.file("100-200 - work.docx", await docx.generateAsync({ type: "uint8array", compression: "STORE" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  const budget = await inspectPreparedZipBudget(source);
  expect(budget?.outerOfficeBytes).toBe(new TextEncoder().encode("<w:p>student content</w:p>").length);
  const extractionBudget = createZipBudget();
  await extractTextFromBuffer("work.docx", Buffer.from(await docx.generateAsync({ type: "uint8array", compression: "STORE" })), { budget: extractionBudget });
  expect(extractionBudget.declaredBytes).toBe(budget?.outerOfficeBytes);
});

it.each([
  ["pptx", "ppt/slides/slide1.xml", "<a:t>slide text</a:t>"],
  ["xlsx", "xl/sharedStrings.xml", "<t>cell text</t>"],
  ["odt", "content.xml", "<text:p>open document</text:p>"],
] as const)("matches the real %s extractor's shared Office charge", async (extension, path, content) => {
  const document = new JSZip(); document.file(path, content);
  const bytes = await document.generateAsync({ type: "uint8array", compression: "STORE" });
  const outer = new JSZip(); outer.file(`100-200 - work.${extension}`, bytes);
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  const planned = await inspectPreparedZipBudget(source); expect(planned).not.toBeNull();
  const actual = createZipBudget();
  try { await extractTextFromBuffer(`work.${extension}`, Buffer.from(bytes), { budget: actual }); } catch { /* ODF fallback may reject a minimal fixture after charging. */ }
  expect(planned?.outerOfficeBytes).toBe(actual.declaredBytes);
});

it("tracks Office charges separately for each nested project", async () => {
  const outer = new JSZip();
  for (let index = 0; index < 2; index++) {
    const docx = new JSZip(); docx.file("word/document.xml", `<w:p>student ${index}</w:p>`);
    const project = new JSZip(); project.file("project/work.docx", await docx.generateAsync({ type: "uint8array", compression: "STORE" }));
    outer.file(`${index}-200 - project.zip`, await project.generateAsync({ type: "uint8array", compression: "STORE" }));
  }
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  const planned = await inspectPreparedZipBudget(source); expect(planned?.nested).toHaveLength(2);
  expect(planned?.nested.map((project) => project.officeBytes)).toEqual(["<w:p>student 0</w:p>".length, "<w:p>student 1</w:p>".length]);
  const budget = createZipBudget(), archive = await JSZip.loadAsync(await source.arrayBuffer());
  const outerPlan = chargeArchiveLevel(archive, budget, { parentPath: "", chain: [], classify: () => "nested" });
  for (const item of outerPlan) {
    const project = await JSZip.loadAsync(await item.entry.async("uint8array"));
    const childPlan = chargeArchiveLevel(project, budget, { parentPath: item.name, chain: [item.name], classify: () => "leaf" });
    for (const child of childPlan) await extractTextFromBuffer(child.name, Buffer.from(await child.entry.async("uint8array")), { budget });
  }
  const expected = planned!.outer.reduce((sum, item) => sum + item.declared, 0) + planned!.outerOfficeBytes + planned!.nested.reduce((sum, project) => sum + project.officeBytes + project.charges.reduce((n, item) => n + item.declared, 0), 0);
  expect(budget.declaredBytes).toBe(expected);
});

it("allows later outer bytes to make a nested cumulative ratio valid", () => {
  const project = { outer: [{ declared: 10_000, compressed: 10_000 }], outerOfficeBytes: 0, nested: [{ charges: [{ declared: 900_000, compressed: 1000 }, { declared: 900_000, compressed: 1000 }, { declared: 900_000, compressed: 1000 }], officeBytes: 0 }], nestedEntries: 3, wireBytes: 10_000, paths: ["project.zip"], videos: 0 };
  const flat = { outer: [{ declared: 2_000_000, compressed: 2_000_000 }], outerOfficeBytes: 0, nested: [], nestedEntries: 0, wireBytes: 2_000_000, paths: ["flat.txt"], videos: 0 };
  expect(preparedZipBudgetFits([project], 105 * 1024 * 1024)).toBe(false);
  expect(preparedZipBudgetFits([project, flat], 105 * 1024 * 1024)).toBe(true);
});

it("matches the extractor budget on merged nested and flat submissions", async () => {
  const sources: Blob[] = [];
  for (let i = 0; i < 3; i++) {
    const inner = new JSZip(); inner.file(`project${i}/main.cpp`, "x".repeat(1000 + i));
    const outer = new JSZip(); outer.file(`${i}-200 - project.zip`, await inner.generateAsync({ type: "uint8array", compression: "STORE" }));
    outer.file(`${i}-200 - comment.txt`, `comment ${i}`);
    sources.push(new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]));
  }
  const traces = await Promise.all(sources.map(inspectPreparedZipBudget));
  expect(traces.every(Boolean)).toBe(true);
  const merged = await mergePreparedZips(sources); expect(merged.ok).toBe(true); if (!merged.ok || traces.some((trace) => !trace)) return;
  const zip = await JSZip.loadAsync(await merged.archive.arrayBuffer()), budget = createZipBudget();
  const planned = chargeArchiveLevel(zip, budget, { parentPath: "", chain: [], classify: (name) => name.endsWith(".zip") ? "nested" : "leaf" });
  for (const item of planned.filter((member) => member.kind === "nested")) {
    const child = await JSZip.loadAsync(await item.entry.async("uint8array"));
    chargeArchiveLevel(child, budget, { parentPath: item.name, chain: [item.name], classify: () => "leaf" });
  }
  expect(preparedZipBudgetFits(traces.filter((trace) => trace !== null), 105 * 1024 * 1024)).toBe(true);
  expect(budget.entryCount).toBe(traces.reduce((sum, trace) => sum + trace!.outer.length + trace!.nestedEntries, 0));
  expect(budget.declaredBytes).toBe(traces.reduce((sum, trace) => sum + [...trace!.outer, ...trace!.nested.flatMap((project) => project.charges)].reduce((n, item) => n + item.declared, 0), 0));
});
