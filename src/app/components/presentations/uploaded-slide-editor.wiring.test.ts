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

  it("allows object-only regeneration and gates layout replacement on an explicit package-bound review", () => {
    expect(panel).toContain("selected?.paragraphs.some((paragraph) => paragraph.editable !== false) || selected?.objects?.some((object) => object.editable)");
    expect(panel).toContain('op: "layoutPreview"');
    expect(panel).toContain('op: "applyLayout"');
    expect(panel).toContain("Accept layout change");
    expect(panel).toContain("packageDigest");
    expect(panel).toContain("Replace picture from PNG or JPEG");
    expect(panel).toContain('record("layout_preview", "success")');
    expect(panel).toContain('record("layout_apply", "failure", "layout_apply_failed")');
    expect(panel).toContain('record("picture_replace", "success")');
    expect(panel).toContain('operation: `uploaded_slide_${operation}`');
    expect(panel).toContain('surface: "presentations"');
    expect(route).toContain("switchSlideLayout(bytes, body.slideNumber, body.targetLayoutMember)");
    expect(route).toContain("replaceUploadedSlidePicture(bytes, body.slideNumber, body.objectId, body.mimeType, body.imageBase64)");
    expect(panel).not.toContain("available in the separate layout control");
  });
});
