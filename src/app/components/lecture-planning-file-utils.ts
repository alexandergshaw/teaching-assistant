// Pure file/blob helpers for LecturePlanningTab.tsx, extracted to keep that
// component under this project's 1000-line cap - a mechanical relocation of
// module-scoped functions that used to live directly in that file, no
// behavior change. None of these touch React state; they only read their
// arguments and the browser File/Blob/URL APIs.
import { parseGeneratedRubric } from "../utils/rubric";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import type { AssignmentPlan } from "../actions";

// Read a File as a base64 string (without the data: URL prefix).
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Build a File from a base64 payload (used to turn a downloaded GitHub repo zip
// into the same File the upload flow produces).
export function base64ToFile(base64: string, name: string, type = "application/zip"): File {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type });
}

// Decode a base64 payload (e.g. the Course Engine materials zip) and download it.
export function downloadBase64File(base64: string, fileName: string, mimeType: string) {
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArray], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadBlob(data: BlobPart, fileName: string, mimeType: string) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Same DOM download dance as downloadBlob above, but for a caller that
// already holds a finished Blob (e.g. JSZip's generateAsync output) and does
// not want it re-wrapped in a fresh Blob with a re-specified mime type.
export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build one document/deck download for a single lecture plan's "slides" /
 * "intro" / "instructions" section, matching downloadDoc's original inline
 * behavior in LecturePlanningTab.tsx exactly (same file names, same mime
 * types). Returns the Blob and file name rather than triggering the
 * download itself, so the caller (or a future test) can inspect the result;
 * LecturePlanningTab.tsx's downloadDoc passes both straight to
 * triggerDownload.
 */
export async function buildPlanDocDownload(
  plan: AssignmentPlan,
  kind: "slides" | "intro" | "instructions",
  author: string
): Promise<{ blob: Blob; fileName: string }> {
  const fileLabel = plan.label;
  if (kind === "slides") {
    const pptx = await buildSlidesPptx({
      presentationTitle: plan.presentationTitle,
      slides: plan.slides,
      subtitle: plan.assignmentName,
      author,
    });
    return {
      blob: new Blob([pptx], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }),
      fileName: `${fileLabel} Slides.pptx`,
    };
  }
  const text = kind === "intro" ? plan.moduleIntroduction : plan.assignmentInstructions;
  const headings = kind === "intro" ? plan.introTemplateHeadings : plan.instructionsTemplateHeadings;
  const name = kind === "intro" ? "Introduction" : "Instructions";
  const docx = await buildDocxFromPlainText(text, headings, author);
  return {
    blob: new Blob([docx], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    fileName: `${fileLabel} ${name}.docx`,
  };
}

/**
 * Build the "Download All as ZIP" archive for a full set of generated
 * lecture plans, matching handleDownloadAll's original inline behavior in
 * LecturePlanningTab.tsx exactly (same per-plan entries, same file names).
 * `author` is resolved by the caller (resolveDocumentAuthor(user)) since
 * this module has no dependency on the app's Supabase user shape.
 */
export async function buildLecturePlansZip(plans: AssignmentPlan[], author: string): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const outputZip = new JSZip();

  for (const plan of plans) {
    const pptxData = await buildSlidesPptx({
      presentationTitle: plan.presentationTitle,
      slides: plan.slides,
      subtitle: plan.label,
      author,
    });
    const fileLabel = plan.label;
    outputZip.file(`${fileLabel} Slides.pptx`, pptxData);
    if (plan.moduleIntroduction) {
      outputZip.file(`${fileLabel} Introduction.docx`, await buildDocxFromPlainText(plan.moduleIntroduction, plan.introTemplateHeadings, author));
    }
    if (plan.assignmentInstructions) {
      outputZip.file(`${fileLabel} Instructions.docx`, await buildDocxFromPlainText(plan.assignmentInstructions, plan.instructionsTemplateHeadings, author));
    }
  }

  return outputZip.generateAsync({ type: "blob" });
}

/**
 * Compute the base file name (before ".zip") for the "Download All as ZIP"
 * archive: the GitHub repo's own name when the course was loaded from
 * GitHub, else the uploaded zip's own file name (extension stripped), else
 * the "lecture_plans" fallback - then sanitized to alphanumeric/underscore
 * only, matching handleDownloadAll's original inline logic exactly.
 */
export function computeLecturePlansZipBaseName(githubRepo: string, zipFileName: string | null): string {
  let baseName = "lecture_plans";
  if (githubRepo.trim()) {
    const match = githubRepo.trim().match(/([^/]+)$/);
    if (match) {
      baseName = match[1];
    }
  } else if (zipFileName) {
    baseName = zipFileName.replace(/\.zip$/i, "");
  }
  // Sanitize: allow only alphanumeric and underscore, collapse multiple underscores
  baseName = baseName.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
  return baseName;
}

/**
 * Serialize a generated rubric to CSV, matching handleDownloadRubricCsv's
 * original inline behavior: a Gemini text rubric (parseable into rows) is
 * serialized row-by-row; a Course Engine rubric.csv (not parseable as the
 * label-based text format) is already CSV and passes through unchanged.
 */
export function buildRubricCsv(generatedRubric: string): string {
  const rows = parseGeneratedRubric(generatedRubric);
  if (!rows) {
    return generatedRubric;
  }
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = ["Criterion,Weight,Performance Levels"];
  for (const row of rows) {
    const weight = row.weight.endsWith("%") ? row.weight : `${row.weight}%`;
    const levels = row.subcategories.length > 0
      ? row.subcategories.map((s) => `${s.label}: ${s.description}`).join(" | ")
      : row.description;
    lines.push([esc(row.area), esc(weight), esc(levels)].join(","));
  }
  return lines.join("\r\n");
}
