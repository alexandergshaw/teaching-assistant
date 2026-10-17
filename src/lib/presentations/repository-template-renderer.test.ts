import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import JSZip from "jszip";
import { repositoryTemplateRendererFiles } from "./repository-template-renderer";
import { buildDeckSnapshot, digest } from "./repository-snapshot";
import { fillOfficeTemplate, groupOfficeTemplateParagraphsBySlide, planSlideTemplateFill } from "@/lib/decks/office-template-fill";

import { originalFixture, templateInput } from "./repository-template-fixture";

describe("reproducible authorized template package", () => {
  it("freezes every actual shared renderer dependency without reimplementation", () => {
    for (const [key, frozen] of Object.entries(repositoryTemplateRendererFiles)) {
      const source = "src/lib/" + key.slice("renderer/".length).replace(/\.mjs$/, ".ts");
      let expected = ts.transpileModule(readFileSync(source, "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, removeComments: true } }).outputText;
      expected = expected.replace(/(from\s+|import\s*\()(["'])([^"']+)\2/g, (all, prefix, quote, spec: string) => {
        if (!spec.startsWith(".") && !spec.startsWith("@/lib/")) return all;
        const target = spec.startsWith("@/lib/") ? "renderer/" + spec.slice(6) + ".mjs" : posix.normalize(posix.join(posix.dirname(key), spec)) + ".mjs";
        expect(repositoryTemplateRendererFiles).toHaveProperty(target);
        let relative = posix.relative(posix.dirname(key), target);
        if (!relative.startsWith(".")) relative = "./" + relative;
        return prefix + quote + relative + quote;
      });
      expect(frozen, source).toBe(expected);
    }
  });
  it("matches download fill and standalone output for slides, layouts, themes, notes and assets, and renders edited JSON", async () => {
    const original = await originalFixture();
    const snapshot = await buildDeckSnapshot(templateInput, original);
    const files = Object.fromEntries(snapshot.files.map(file => [file.path, file.bytes]));
    expect(files["template/original.pptx"]).toEqual(original);
    expect(JSON.parse(files["deck.json"].toString())).toEqual(templateInput.deck);
    expect(files["context.json"].toString()).not.toContain("private context");
    const manifest = JSON.parse(files["manifest.json"].toString());
    expect(manifest.template.sha256).toBe(digest(original));
    const plan = planSlideTemplateFill(await groupOfficeTemplateParagraphsBySlide("pptx", original), templateInput.deck.slides);
    if (!plan.ok) throw new Error("fixture fit");
    const download = await JSZip.loadAsync(await fillOfficeTemplate("pptx", original, plan.replacements));
    const packaged = await JSZip.loadAsync(files["deck.pptx"]);
    const directory = mkdtempSync(join(process.cwd(), ".snapshot-template-test-"));
    try {
      for (const file of snapshot.files) { mkdirSync(dirname(join(directory, file.path)), { recursive: true }); writeFileSync(join(directory, file.path), file.bytes); }
      execFileSync(process.execPath, ["--preserve-symlinks", "--preserve-symlinks-main", "render.mjs"], { cwd: directory, timeout: 20_000 });
      const regenerated = await JSZip.loadAsync(readFileSync(join(directory, "regenerated.pptx")));
      for (const entry of Object.values(download.files).filter(file => !file.dir)) {
        expect(await packaged.file(entry.name)!.async("nodebuffer"), entry.name).toEqual(await entry.async("nodebuffer"));
        expect(await regenerated.file(entry.name)!.async("nodebuffer"), entry.name).toEqual(await entry.async("nodebuffer"));
      }
      writeFileSync(join(directory, "deck.json"), JSON.stringify({ ...templateInput.deck, slides: [{ title: "Edited by Copilot", bullets: ["New body"] }] }));
      execFileSync(process.execPath, ["--preserve-symlinks", "--preserve-symlinks-main", "render.mjs"], { cwd: directory, timeout: 20_000 });
      const edited = await JSZip.loadAsync(readFileSync(join(directory, "regenerated.pptx")));
      expect(await edited.file("ppt/slides/slide1.xml")!.async("string")).toContain("Edited by Copilot");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30_000);
  it("refuses unavailable slides, overflowing bullets and malformed originals", async () => {
    const original = await originalFixture();
    await expect(buildDeckSnapshot({ ...templateInput, deck: { ...templateInput.deck, slides: [...templateInput.deck.slides, ...templateInput.deck.slides] } }, original)).rejects.toThrow("TEMPLATE_FIT");
    await expect(buildDeckSnapshot({ ...templateInput, deck: { ...templateInput.deck, slides: [{ title: "Title", bullets: ["one", "two"] }] } }, original)).rejects.toThrow("TEMPLATE_FIT");
    await expect(buildDeckSnapshot(templateInput, Buffer.from("not pptx"))).rejects.toThrow();
  });
});
