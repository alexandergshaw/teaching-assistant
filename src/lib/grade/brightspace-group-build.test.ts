import { expect, it } from "vitest";
import JSZip from "jszip";
import { planRecoverableZip } from "./large-zip-subset";
import { buildBrightspaceGroup } from "./brightspace-group-build";
import { ingestZipEntries } from "./extraction";
import { appendZipEvidence } from "./append-zip-evidence";

it("keeps reviewed nested source and companion reflection together through real intake", async () => {
  const project = new JSZip(); project.file("src/main.cpp", "int main() { return 0; }"); project.file("src/vector.hpp", "int value;"); project.file("other/main.cpp", "int second;"); project.file("config.vcxproj.user", "<config>student</config>"); project.file("Debug/main.obj", "generated");
  const outer = new JSZip(); outer.file("100-200 - Project-Student-Nov 5, 2026 400 PM.zip", await project.generateAsync({ type: "uint8array" })); outer.file("100-200 - Reflection-Student-Nov 5, 2026 400 PM.txt", "Synthetic reflection.");
  const source = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array" })).buffer]); const plan = await planRecoverableZip(source);
  expect(plan.ok).toBe(true); if (!plan.ok) return;
  const built = await buildBrightspaceGroup(source, plan.groups[0], { "100-200 - Project-Student-Nov 5, 2026 400 PM.zip": ["Debug/main.obj"] }); expect(built.ok).toBe(true); if (!built.ok) return;
  expect(built.excludedPaths).toEqual(["100-200 - Project-Student-Nov 5, 2026 400 PM.zip/Debug/main.obj"]);
  const mapping = Object.fromEntries(built.mappedPaths.map((path) => [path, "Student"]));
  const result = await ingestZipEntries(await built.archive.arrayBuffer(), { requireSupportedFiles: true, reviewedMapping: mapping });
  expect(result.entries).toHaveLength(1); expect(result.entries[0].student).toBe("Student"); expect(result.entries[0].mergedFileCount).toBe(5);
  expect(result.entries[0].submittedFiles.map((file) => file.name)).toEqual(expect.arrayContaining(["Project-Student-Nov 5, 2026 400 PM.zip/src/main.cpp", "Project-Student-Nov 5, 2026 400 PM.zip/other/main.cpp"]));
  expect(result.entries[0].content).toContain("int main()"); expect(result.entries[0].content).toContain("int value;"); expect(result.entries[0].content).toContain("Synthetic reflection.");
  expect(result.entries[0].submittedFiles.map((file) => file.name)).toContain("Project-Student-Nov 5, 2026 400 PM.zip/config.vcxproj.user"); expect(result.entries[0].content).toContain("<config>student</config>");
  const evidencePath = "100-200 - brightspace-index-evidence.txt", appended = await appendZipEvidence(built.archive, [{ path: evidencePath, text: "Submission comment: keep this" }]);
  expect(appended.ok).toBe(true); if (!appended.ok) return;
  const withComment = await ingestZipEntries(await appended.archive.arrayBuffer(), { requireSupportedFiles: true, reviewedMapping: { ...mapping, [evidencePath]: "Student" } });
  expect(withComment.entries).toHaveLength(1); expect(withComment.entries[0].content).toContain("Submission comment: keep this"); expect(withComment.entries[0].content).toContain("int main()");
});
