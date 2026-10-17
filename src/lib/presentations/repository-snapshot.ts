import { createHash } from "node:crypto";
import JSZip from "jszip";
import type { DeckContent } from "./types";
import { serializeDeckToPptx } from "./deck-file";
import { repositoryRendererFiles } from "./repository-renderer";
import { repositoryTemplateRendererFiles } from "./repository-template-renderer";
import { renderRepositoryTemplate } from "./repository-template";
import type { PipelineTemplateChoice } from "@/app/components/presentations/pipeline/template-choice";

export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
export const COPILOT_SNAPSHOT_UNAVAILABLE = "Copilot generation is disabled for this deployment. An owner must configure the verified GitHub integration and explicitly enable task dispatch. Publishing a snapshot does not start a task.";
export interface SnapshotInput {
  deck: DeckContent;
  context: { text: string; sources: { name: string; text: string }[]; objectives: string[] };
  includeContext: boolean;
  templateSelected: boolean;
  templateChoice?: PipelineTemplateChoice;
}
export interface SnapshotFile { path: string; bytes: Buffer }
export interface DeckSnapshot { id: string; files: SnapshotFile[]; slides: number; bytes: number }
export function digest(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function strings(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every(v => typeof v === "string" && v.length <= 20_000);
}

/** Reject malformed or excessive action input before rendering or network access. */
export function validateSnapshotInput(value: unknown): asserts value is SnapshotInput {
  if (!object(value) || typeof value.templateSelected !== "boolean" || typeof value.includeContext !== "boolean") throw new Error("TEMPLATE_OR_INPUT");
  if (Object.keys(value).some(key => !["deck", "context", "includeContext", "templateSelected", "templateChoice"].includes(key))) throw new Error("INVALID_INPUT");
  const choice = value.templateChoice;
  if (value.templateSelected) {
    if (!object(choice) || !["raw", "library"].includes(String(choice.kind)) || typeof choice.sourceFileId !== "string" || !/^[a-f0-9-]{36}$/i.test(choice.sourceFileId) || typeof choice.name !== "string" || choice.name.length > 500 || (choice.kind === "library" && (typeof choice.libraryId !== "string" || !/^[a-f0-9-]{36}$/i.test(choice.libraryId)))) throw new Error("TEMPLATE_OR_INPUT");
  } else if (choice !== undefined && (!object(choice) || choice.kind !== "own")) throw new Error("TEMPLATE_OR_INPUT");
  const deck = value.deck;
  if (!object(deck) || typeof deck.presentationTitle !== "string" || !deck.presentationTitle.trim() || deck.presentationTitle.length > 500 || !Array.isArray(deck.slides) || !deck.slides.length || deck.slides.length > 100) throw new Error("INVALID_DECK");
  if (Object.keys(deck).some(key => !["presentationTitle", "slides"].includes(key))) throw new Error("INVALID_DECK");
  for (const slide of deck.slides) {
    if (!object(slide) || typeof slide.title !== "string" || !slide.title.trim() || slide.title.length > 500 || !strings(slide.bullets, 50)) throw new Error("INVALID_SLIDE");
    for (const field of ["notes", "code", "codeLanguage"]) if (slide[field] !== undefined && (typeof slide[field] !== "string" || slide[field].length > 20_000)) throw new Error("INVALID_SLIDE");
    if (slide.graphic !== undefined && !validGraphic(slide.graphic)) throw new Error("INVALID_GRAPHIC");
    if (Object.keys(slide).some(key => !["title", "bullets", "notes", "code", "codeLanguage", "graphic"].includes(key))) throw new Error("INVALID_SLIDE");
  }
  const context = value.context;
  if (!object(context) || typeof context.text !== "string" || context.text.length > 100_000 || !strings(context.objectives, 100) || !Array.isArray(context.sources) || context.sources.length > 30 || context.sources.some(s => !object(s) || typeof s.name !== "string" || s.name.length > 500 || typeof s.text !== "string" || s.text.length > 100_000)) throw new Error("INVALID_CONTEXT");
  if (Buffer.byteLength(JSON.stringify(value)) > 700_000) throw new Error("SNAPSHOT_TOO_LARGE");
}

function validGraphic(value: unknown): boolean {
  if (!object(value)) return false;
  if (value.kind === "table") return strings(value.headers, 20) && Array.isArray(value.rows) && value.rows.length <= 30 && value.rows.every(row => strings(row, 20));
  if (value.kind === "process") return Array.isArray(value.steps) && value.steps.length > 0 && value.steps.length <= 10 && value.steps.every(s => object(s) && typeof s.label === "string" && s.label.length < 2000 && (s.caption === undefined || typeof s.caption === "string" && s.caption.length < 2000));
  if (value.kind === "matrix2x2") return typeof value.xAxisLabel === "string" && typeof value.yAxisLabel === "string" && object(value.quadrants) && ["topLeft", "topRight", "bottomLeft", "bottomRight"].every(key => { const q = (value.quadrants as Record<string, unknown>)[key]; return object(q) && typeof q.label === "string" && strings(q.items, 20); });
  return false;
}

export function snapshotIdentity(input: SnapshotInput, original?: Buffer): string {
  return digest(JSON.stringify({ version: 1, deck: input.deck, context: exportContext(input), template: original ? { choice: input.templateChoice, sha256: digest(original) } : null, renderer: original ? repositoryTemplateRendererFiles : repositoryRendererFiles }));
}
function exportContext(input: SnapshotInput) {
  return { objectives: input.context.objectives, optionalContext: input.includeContext ? { text: input.context.text, sources: input.context.sources } : null, optionalContextOmitted: !input.includeContext };
}

export async function buildDeckSnapshot(input: unknown, original?: Buffer): Promise<DeckSnapshot> {
  validateSnapshotInput(input);
  if (input.templateSelected !== !!original) throw new Error("TEMPLATE_OR_INPUT");
  const id = snapshotIdentity(input, original);
  const pptx = original ? await renderRepositoryTemplate(original, input.deck) : Buffer.from(await serializeDeckToPptx(input.deck));
  const zip = await JSZip.loadAsync(pptx);
  if (!zip.file("[Content_Types].xml") || !zip.file("ppt/presentation.xml")) throw new Error("INVALID_PPTX");
  const contents: Record<string, string | Buffer> = {
    "deck.pptx": pptx,
    "deck.json": JSON.stringify(input.deck, null, 2),
    "context.json": JSON.stringify(exportContext(input), null, 2),
    ...(original ? repositoryTemplateRendererFiles : repositoryRendererFiles),
    ...(original ? { "template/original.pptx": original } : {}),
    "package.json": JSON.stringify({ private: true, type: "module", scripts: { render: "node render.mjs" }, dependencies: original ? { jszip: "3.10.1" } : { pptxgenjs: "4.0.1" } }, null, 2),
    "render.mjs": original ? 'import { readFile, writeFile } from "node:fs/promises";\nimport { renderRepositoryTemplate } from "./renderer/presentations/repository-template.mjs";\nconst deck = JSON.parse(await readFile("deck.json", "utf8"));\nawait writeFile("regenerated.pptx", await renderRepositoryTemplate(await readFile("template/original.pptx"), deck));\n' : 'import { readFile, writeFile } from "node:fs/promises";\nimport { buildSlidesPptx } from "./renderer/pptx.mjs";\nconst deck = JSON.parse(await readFile("deck.json", "utf8"));\nawait writeFile("regenerated.pptx", Buffer.from(await buildSlidesPptx(deck)));\n',
    "README.md": `# Deck snapshot\n\nSnapshot: ${id}\n\nInstall Node.js 22 and run npm install, then npm run render. This builds regenerated.pptx from deck.json with ${original ? "the app's frozen template paragraph fill, identical to Pipeline download. Original template notes, themes, layouts and all assets (including unused slides and embedded files) are included in template/original.pptx. Only generated titles/bullets are filled; generated notes, code and graphics remain in deck.json and are not added to template slides" : "the app's frozen own-layout renderer"}. Optional context is explicitly declared in context.json. Review any Copilot output before use. No task is dispatched by publishing. No credentials are required to render. ZIP metadata may differ between builds; verify slide content, not ZIP byte identity.\n`,
  };
  const files = Object.entries(contents).map(([path, content]) => ({ path, bytes: Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8") }));
  const manifest = { version: 1, snapshot: id, rendering: original ? "template" : "own-layout", template: original ? { sha256: digest(original), path: "template/original.pptx" } : null, files: files.map(f => ({ path: f.path, bytes: f.bytes.length, sha256: digest(f.bytes) })) };
  files.push({ path: "manifest.json", bytes: Buffer.from(JSON.stringify(manifest, null, 2)) });
  const bytes = files.reduce((sum, f) => sum + f.bytes.length, 0);
  if (bytes > MAX_SNAPSHOT_BYTES) throw new Error("SNAPSHOT_TOO_LARGE");
  return { id, files, bytes, slides: input.deck.slides.length };
}
