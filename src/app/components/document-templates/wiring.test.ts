import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// Source wiring is the available non-rendering instrument; browser behavior remains a runtime residual.
describe("document template panel wiring", () => {
  it("wires explicit abstraction, review/save, persisted reopen and all download choices", () => {
    const source = readFileSync("src/app/components/document-templates/index.tsx", "utf8");
    for (const action of ["abstractDocumentTemplateAction(upload)", "saveDocumentTemplateAction(name", "getDocumentTemplateAction(result.template.id)", 'download("original")', 'download("template")', 'download("filled")']) expect(source).toContain(action);
    expect(source).toContain("onUseInSlideDeckCreation?: () => void"); expect(source).toContain("PDF_DISCLOSURE"); expect(source).toContain('role="alert"'); expect(source).toContain('aria-live="polite"'); expect(source).toContain("requests.invalidate()"); expect(source).toContain("gate.current.current(token)");
  });
  it("renders ordered merged retained text and placeholders as text after abstraction and reopen", () => {
    const source = readFileSync("src/app/components/document-templates/index.tsx", "utf8");
    for (const wiring of ["setReview(result.proposal.review)", "setReview(result.template.review)", "setReview(recovered.template.review)", "reviewDocumentProposal(review, proposal)", "mergedReview.map", "{paragraph.templateText}", "{paragraph.sourceText}"]) expect(source).toContain(wiring);
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
  it("offers current-proposal preview for saved edits separately from saved definition downloads", () => {
    const source = readFileSync("src/app/components/document-templates/index.tsx", "utf8");
    expect(source).toContain("previewReviewedDocument(upload, opened?.id, proposal)");
    expect(source).toContain('onClick={() => void downloadReviewed()}>Download reviewed proposal DOCX');
    expect(source).toContain("downloadDocumentTemplateAction(opened!.id, kind, values)");
    expect(source).not.toMatch(/upload && <button[^>]*downloadReviewed/);
  });
  it("keeps the reviewed proposal on failed save and only resets after persisted read succeeds", () => {
    const source = readFileSync("src/app/components/document-templates/index.tsx", "utf8");
    const save = source.slice(source.indexOf("async function save()"), source.indexOf("async function download("));
    expect(save.indexOf('if ("error" in result)')).toBeLessThan(save.indexOf("getDocumentTemplateAction(result.template.id)")); expect(save).not.toContain('setProposal("")'); expect(save).toContain("setProposal(JSON.stringify(recovered.template.definition");
  });
});
