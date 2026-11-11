import { expect, it, vi } from "vitest";
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

it("preserves verified UTF-8 configuration and log bytes under their original names", async () => {
  const project = new JSZip(); project.file("main.cpp", "int main() {} "); project.file("config.vcxproj.user", "<config>valid</config>\r\n"); project.file("build.log", "line one\nline two");
  const outer = new JSZip(); outer.file("100-200 - project.zip", await project.generateAsync({ type: "uint8array", compression: "STORE" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]), directory = await inspectLargeZipDirectory(source);
  expect(directory.ok).toBe(true); if (!directory.ok) return;
  const inventory = await inspectBrightspaceProject(source, directory.members[0]); expect(inventory.ok).toBe(true); if (!inventory.ok) return;
  expect(inventory.files.find((file) => file.path === "config.vcxproj.user")).toMatchObject({ disposition: "retain" });
  const built = await buildReviewedBrightspaceProject(source, directory.members[0], []); expect(built.ok).toBe(true); if (!built.ok) return;
  const retained = await JSZip.loadAsync(await built.archive.arrayBuffer());
  expect(await retained.file("config.vcxproj.user")!.async("string")).toBe("<config>valid</config>\r\n");
  expect(await retained.file("build.log")!.async("string")).toBe("line one\nline two");
  expect(built.retainedPaths).toContain("config.vcxproj.user");
});

it("holds invalid text bytes without changing existing paths", async () => {
  const project = new JSZip(); project.file("main.cpp", "source"); project.file("bad.log", new Uint8Array([0xff, 0xfe])); project.file("config.user", "text"); project.file("config.user.txt", "different text");
  const outer = new JSZip(); outer.file("100-200 - project.zip", await project.generateAsync({ type: "uint8array", compression: "STORE" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]), directory = await inspectLargeZipDirectory(source);
  expect(directory.ok).toBe(true); if (!directory.ok) return;
  const inventory = await inspectBrightspaceProject(source, directory.members[0]); expect(inventory.ok).toBe(true); if (!inventory.ok) return;
  expect(inventory.files.find((file) => file.path === "bad.log")?.disposition).toBe("needs-review");
  expect(inventory.files.find((file) => file.path === "config.user")?.disposition).toBe("retain");
  expect((await buildReviewedBrightspaceProject(source, directory.members[0], [])).ok).toBe(false);
});


it("excludes only an exact verified course dataset while retaining changed data", async () => {
  const project = new JSZip(); project.file("src/main.cpp", "int main() {} "); project.file("data.csv", new Uint8Array(2_039_946));
  const outer = new JSZip(); outer.file("100-200 - project.zip", await project.generateAsync({ type: "uint8array" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array" })).buffer]); const directory = await inspectLargeZipDirectory(source);
  expect(directory.ok).toBe(true); if (!directory.ok) return;
  const exact = "8a4203bb40c1f023676f79060da104ff316509faf2db226db3915ee5a096e90d";
  const digest = vi.spyOn(crypto.subtle, "digest").mockResolvedValueOnce(Uint8Array.from(exact.match(/../g)!, (byte) => parseInt(byte, 16)).buffer).mockResolvedValueOnce(new Uint8Array(32).buffer);
  try {
    const matched = await inspectBrightspaceProject(source, directory.members[0]);
    const changed = await inspectBrightspaceProject(source, directory.members[0]);
    expect(matched.ok && matched.files.find((file) => file.path === "data.csv")?.disposition).toBe("course-fixture");
    expect(changed.ok && changed.files.find((file) => file.path === "data.csv")?.disposition).toBe("retain");
  } finally { digest.mockRestore(); }
});
