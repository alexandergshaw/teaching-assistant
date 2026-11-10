import { expect, it } from "vitest";
import JSZip from "jszip";
import { inspectLargeZipDirectory } from "./recoverable-zip-directory";
import { buildReviewedBrightspaceProject, inspectBrightspaceProject } from "./brightspace-project-inventory";

it("retains source and data even inside build folders, flags binaries, and holds unknown files", async () => {
  const project = new JSZip(); project.file("Debug/main.cpp", "source"); project.file("Debug/input.csv", "data"); project.file("Debug/main.obj", "binary"); project.file("Debug/unknown.bin", "unknown");
  const nested = await project.generateAsync({ type: "uint8array" }); const zip = new JSZip(); zip.file("100-200 - project.zip", nested);
  const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]); const inventory = await inspectLargeZipDirectory(source);
  expect(inventory.ok).toBe(true); if (!inventory.ok) return;
  const result = await inspectBrightspaceProject(source, inventory.members[0]); expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.files.map((file) => [file.path, file.disposition])).toEqual([["Debug/main.cpp", "retain"], ["Debug/input.csv", "retain"], ["Debug/main.obj", "candidate-build-artifact"], ["Debug/unknown.bin", "needs-review"]]);
  expect((await buildReviewedBrightspaceProject(source, inventory.members[0], ["Debug/main.obj"])).ok).toBe(false);
  expect((await buildReviewedBrightspaceProject(source, inventory.members[0], ["Debug/main.obj", "Debug/unknown.bin"])).ok).toBe(false);
});

it("refuses corrupt nested bytes before reporting a project inventory", async () => {
  const zip = new JSZip(); zip.file("100-200 - project.zip", "not a zip");
  const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]); const inventory = await inspectLargeZipDirectory(source);
  expect(inventory.ok).toBe(true); if (!inventory.ok) return;
  expect((await inspectBrightspaceProject(source, inventory.members[0])).ok).toBe(false);
});
it("retains diverse substantive project formats and refuses to classify an opaque file as disposable", async () => {
  const project = new JSZip(); for (const path of ["src/main.java", "src/main.cs", "notes.ipynb", "diagram.png", "data.xlsx", "mystery.dat", "shot.gif", "shot.bmp"]) project.file(path, "synthetic");
  const zip = new JSZip(); zip.file("100-200 - project.zip", await project.generateAsync({ type: "uint8array" }));
  const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]); const directory = await inspectLargeZipDirectory(source);
  expect(directory.ok).toBe(true); if (!directory.ok) return;
  const inventory = await inspectBrightspaceProject(source, directory.members[0]); expect(inventory.ok).toBe(true); if (!inventory.ok) return;
  expect(inventory.files.filter((file) => file.disposition === "retain").map((file) => file.path)).toEqual(expect.arrayContaining(["src/main.java", "src/main.cs", "notes.ipynb", "diagram.png", "data.xlsx"]));
  for (const path of ["mystery.dat", "shot.gif", "shot.bmp"]) expect(inventory.files.find((file) => file.path === path)?.disposition).toBe("needs-review");
  expect((await buildReviewedBrightspaceProject(source, directory.members[0], ["mystery.dat", "shot.gif", "shot.bmp"])).ok).toBe(false);
});
