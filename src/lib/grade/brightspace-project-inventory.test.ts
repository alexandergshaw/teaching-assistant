import { expect, it, vi } from "vitest";
import JSZip from "jszip";
import { inspectLargeZipDirectory } from "./recoverable-zip-directory";
import { buildReviewedBrightspaceProject, inspectBrightspaceProject } from "./brightspace-project-inventory";

it("retains verified Eclipse text and records narrowly scoped IDE cache artifacts", async () => {
  const project = new JSZip(); project.file("src/main.cpp", "int main() {}"); project.file(".project", "<projectDescription />"); project.file(".settings/org.eclipse.core.resources.prefs", "encoding=UTF-8");
  project.file(".vs/Example/CopilotIndices/17.0/SemanticSymbols.db", "cache"); project.file(".vs/slnx.sqlite", "cache"); project.file("x64/Debug/main.obj.dt.module.json.command", new Uint8Array([0xff, 0xfe]));
  project.file("x64/Debug/main.tlog/unsuccessfulbuild", ""); project.file("x64/Debug/main.Build.CppClean.log", ""); project.file("x64/Debug/main.vcxproj.FileListAbsolute.txt", ""); project.file("data/semantic.db", "student data");
  const outer = new JSZip(); outer.file("100-200 - project.zip", await project.generateAsync({ type: "uint8array" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array" })).buffer]); const directory = await inspectLargeZipDirectory(source);
  expect(directory.ok).toBe(true); if (!directory.ok) return;
  const inventory = await inspectBrightspaceProject(source, directory.members[0]); expect(inventory.ok).toBe(true); if (!inventory.ok) return;
  const disposition = (path: string) => inventory.files.find((item) => item.path === path)?.disposition;
  expect(disposition(".project")).toBe("retain"); expect(disposition(".settings/org.eclipse.core.resources.prefs")).toBe("retain");
  for (const path of [".vs/Example/CopilotIndices/17.0/SemanticSymbols.db", ".vs/slnx.sqlite", "x64/Debug/main.obj.dt.module.json.command", "x64/Debug/main.tlog/unsuccessfulbuild", "x64/Debug/main.Build.CppClean.log", "x64/Debug/main.vcxproj.FileListAbsolute.txt"]) expect(disposition(path)).toBe("candidate-build-artifact");
  expect(disposition("data/semantic.db")).toBe("needs-review");
});

it("holds invalid Eclipse configuration instead of accepting it as text", async () => {
  const project = new JSZip(); project.file("src/main.cpp", "int main() {}"); project.file(".project", new Uint8Array([0xff, 0xfe]));
  const outer = new JSZip(); outer.file("100-200 - project.zip", await project.generateAsync({ type: "uint8array" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array" })).buffer]); const directory = await inspectLargeZipDirectory(source);
  expect(directory.ok).toBe(true); if (!directory.ok) return;
  const inventory = await inspectBrightspaceProject(source, directory.members[0]); expect(inventory.ok).toBe(true); if (inventory.ok) expect(inventory.files.find((item) => item.path === ".project")?.disposition).toBe("needs-review");
});

it("holds an allegedly empty build marker whose CRC does not verify", async () => {
  const project = new JSZip(); project.file("x64/Debug/main.vcxproj.FileListAbsolute.txt", "", { createFolders: false });
  const bytes = Buffer.from(await project.generateAsync({ type: "uint8array", compression: "STORE" }));
  const signature = (value: number) => { const needle = Buffer.alloc(4); needle.writeUInt32LE(value); return bytes.indexOf(needle); };
  const local = signature(0x04034b50), central = signature(0x02014b50);
  expect(local).toBeGreaterThanOrEqual(0); expect(central).toBeGreaterThanOrEqual(0);
  bytes.writeUInt32LE(1, local + 14); bytes.writeUInt32LE(1, central + 16);
  const outer = new JSZip(); outer.file("100-200 - project.zip", bytes);
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array" })).buffer]); const directory = await inspectLargeZipDirectory(source);
  expect(directory.ok).toBe(true); if (!directory.ok) return;
  const inventory = await inspectBrightspaceProject(source, directory.members[0]); expect(inventory.ok).toBe(true);
  if (inventory.ok) expect(inventory.files[0].disposition).toBe("needs-review");
});

it("records Visual Studio databases and an executable as excluded evidence", async () => {
  const project = new JSZip(); project.file("project.vcxproj", "config"); project.file(".vs/project/v17/Browse.VC.db", "database"); project.file(".vs/project/v17/Solution.VC.db", "database"); project.file("x64/Debug/project.exe", "binary");
  const outer = new JSZip(); outer.file("100-200 - project.zip", await project.generateAsync({ type: "uint8array" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array" })).buffer]);
  const directory = await inspectLargeZipDirectory(source); expect(directory.ok).toBe(true); if (!directory.ok) return;
  const inventory = await inspectBrightspaceProject(source, directory.members[0]); expect(inventory.ok).toBe(true); if (!inventory.ok) return;
  expect(inventory.files.find((file) => file.path.endsWith("Browse.VC.db"))?.disposition).toBe("candidate-build-artifact");
  expect(inventory.files.find((file) => file.path.endsWith("Solution.VC.db"))?.disposition).toBe("candidate-build-artifact");
  expect(inventory.files.find((file) => file.path.endsWith("project.exe"))?.disposition).toBe("unexamined-binary");
  const excluded = inventory.files.filter((file) => file.disposition !== "retain").map((file) => file.path);
  const built = await buildReviewedBrightspaceProject(source, directory.members[0], excluded); expect(built.ok).toBe(true);
  if (built.ok) expect(built.excludedPaths).toEqual(excluded);
});

it("does not treat arbitrary databases as disposable Visual Studio artifacts", async () => {
  const project = new JSZip(); project.file("project.vcxproj", "config"); project.file("data/Browse.VC.db", "possibly student work");
  const outer = new JSZip(); outer.file("100-200 - project.zip", await project.generateAsync({ type: "uint8array" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array" })).buffer]);
  const directory = await inspectLargeZipDirectory(source); expect(directory.ok).toBe(true); if (!directory.ok) return;
  const inventory = await inspectBrightspaceProject(source, directory.members[0]); expect(inventory.ok).toBe(true); if (inventory.ok) expect(inventory.files.find((file) => file.path.endsWith("Browse.VC.db"))?.disposition).toBe("needs-review");
});

it("preserves readable project evidence and records artifacts when no source is present", async () => {
  const nested = new JSZip(); nested.file("build.log", "build failed"); nested.file("Debug/main.obj", "object");
  const outer = new JSZip(); outer.file("100-200 - project.zip", await nested.generateAsync({ type: "uint8array" }));
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array" })).buffer]);
  const directory = await inspectLargeZipDirectory(source); expect(directory.ok).toBe(true); if (!directory.ok) return;
  const built = await buildReviewedBrightspaceProject(source, directory.members[0], ["Debug/main.obj"]);
  expect(built.ok).toBe(true); if (!built.ok) return;
  expect(built.retainedPaths).toEqual(["build.log"]); expect(built.excludedPaths).toEqual(["Debug/main.obj"]);
  const contents = await JSZip.loadAsync(await built.archive.arrayBuffer());
  expect(await contents.file("build.log")!.async("string")).toBe("build failed");
});

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


it("distinguishes an exact verified course dataset from unexamined changed data", async () => {
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
    expect(changed.ok && changed.files.find((file) => file.path === "data.csv")?.disposition).toBe("unexamined-data");
  } finally { digest.mockRestore(); }
});
