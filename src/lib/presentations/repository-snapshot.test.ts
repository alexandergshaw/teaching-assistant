import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import JSZip from "jszip";
import { buildDeckSnapshot, validateSnapshotInput, snapshotIdentity, digest, type SnapshotInput } from "./repository-snapshot";
import { repositoryRendererFiles } from "./repository-renderer";

const input: SnapshotInput = { deck: { presentationTitle: "Exact deck", slides: [{ title: "Saved title", bullets: ["Saved bullet"], notes: "Private notes", code: "print(1)", codeLanguage: "python" }] }, context: { text: "private-context", sources: [{ name: "private-source", text: "homework" }], objectives: ["Explain the result"] }, includeContext: false, templateSelected: false };

describe("private deck snapshot", () => {
  it("rejects missing/invalid/oversized input and selected templates before rendering", () => {
    for (const value of [null, {}, { ...input, templateSelected: true }, { ...input, deck: { ...input.deck, slides: [] } }, { ...input, context: { ...input.context, text: "x".repeat(100_001) } }]) expect(() => validateSnapshotInput(value)).toThrow();
  });
  it("binds identity to edited deck/context and excludes optional context by default", async () => {
    const snapshot = await buildDeckSnapshot(input);
    const files = Object.fromEntries(snapshot.files.map(f => [f.path, f.bytes]));
    const context = files["context.json"].toString();
    expect(context).toContain("Explain the result");
    expect(context).not.toContain("private-context");
    expect(context).not.toContain("private-source");
    expect(JSON.parse(files["deck.json"].toString())).toEqual(input.deck);
    const manifest = JSON.parse(files["manifest.json"].toString());
    expect(manifest.snapshot).toBe(snapshot.id);
    for (const row of manifest.files) expect(digest(files[row.path])).toBe(row.sha256);
    const zip = await JSZip.loadAsync(files["deck.pptx"]);
    expect(zip.file("ppt/presentation.xml")).not.toBeNull();
    const slideXml = await zip.file("ppt/slides/slide2.xml")!.async("string");
    expect(slideXml).toContain("Saved title");
    expect(slideXml).toContain("Saved bullet");
    expect(snapshotIdentity({ ...input, deck: { ...input.deck, slides: [{ title: "Changed", bullets: [] }] } })).not.toBe(snapshot.id);
    expect(snapshotIdentity({ ...input, includeContext: true })).not.toBe(snapshot.id);
  });
  it("exports the installed renderer sources exactly and independently rebuilds PPTX", async () => {
    const names = ["pptx", "slide-graphics", "text-normalize", "docx-blocks"];
    for (const name of names) {
      let expected = ts.transpileModule(readFileSync(join(process.cwd(), "src/lib", name + ".ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, removeComments: true } }).outputText;
      for (const dependency of names) expected = expected.replaceAll('"./' + dependency + '"', '"./' + dependency + '.mjs"');
      expect(repositoryRendererFiles["renderer/" + name + ".mjs"]).toBe(expected);
    }
    const snapshot = await buildDeckSnapshot(input);
    const directory = mkdtempSync(join(process.cwd(), ".snapshot-test-"));
    try {
      mkdirSync(join(directory, "renderer"));
      for (const file of snapshot.files) writeFileSync(join(directory, file.path), file.bytes);
      execFileSync(process.execPath, ["--preserve-symlinks", "--preserve-symlinks-main", "render.mjs"], { cwd: directory, timeout: 20_000 });
      const zip = await JSZip.loadAsync(readFileSync(join(directory, "regenerated.pptx")));
      expect(await zip.file("ppt/slides/slide2.xml")!.async("string")).toContain("Saved bullet");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30_000);
});
