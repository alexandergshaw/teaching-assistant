import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rail = readFileSync(join(root, "src/app/components/manual/manual-rail.ts"), "utf8");
const page = readFileSync(join(root, "src/app/page.tsx"), "utf8");
const panel = readFileSync(join(root, "src/app/components/presentations/UploadedSlideEditor.tsx"), "utf8");
const route = readFileSync(join(root, "src/app/api/presentations/uploaded-slide-editor/route.ts"), "utf8");

describe("uploaded slide editor wiring", () => {
  it("is a sibling Presentations destination mounted as its own editor", () => {
    expect(rail).toContain('"ppt-editor": true');
    expect(rail).toContain('id: "presentations-ppt-editor", label: "PowerPoint Editor"');
    expect(page).toContain("presentationsView === \"ppt-editor\"");
    expect(page).toContain("<UploadedSlideEditor />");
  });

  it("keeps uploaded bytes in the browser and only sends selected slide content to regeneration", () => {
    expect(panel).toContain('op: "inspect", base64');
    expect(panel).toContain('op: "apply", base64: workingBase64');
    expect(panel).toContain('op: "regenerate", base64: workingBase64, slideNumber: selectedNumber, instruction');
    expect(route).toContain("await requireUser()");
    expect(route).toContain("const slides = await inspectUploadedPptx(source)");
    expect(route).toContain("regenerationPrompt(paragraphs, objects, body.instruction.trim())");
    expect(route).toContain("applyUploadedSlideEdits");
    expect(panel).toContain("Slide objects");
    expect(panel).toContain("Save object changes");
    expect(route).not.toContain("recordSessionDiagnosticEntry");
  });

  it("holds a candidate for review and records safe outcomes without slide content", () => {
    expect(panel).toContain("Accept candidate");
    expect(panel).toContain("Discard");
    expect(panel).toContain('surface: "presentations"');
    expect(panel).not.toContain("paragraph.text });");
  });

  it("allows object-only slides to request regeneration and does not imply layout editing shipped", () => {
    expect(panel).toContain("selected?.paragraphs.some((paragraph) => paragraph.editable !== false) || selected?.objects?.some((object) => object.editable)");
    expect(panel).toContain("Layout editing is not available yet.");
    expect(panel).not.toContain("available in the separate layout control");
  });
});
