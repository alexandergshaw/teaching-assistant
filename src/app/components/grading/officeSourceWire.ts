import { ITEM_REQUEST_BYTE_BUDGET, stripUnneededRawBase64, type GradeRunItemRequestBody } from "@/app/components/grading/incrementalRunPlan";

/** Keep raw Office source for server reinspection only when the entire request fits. */
export function serializeGradeItemWithOfficeSource(request: GradeRunItemRequestBody): string {
  const stripped = stripUnneededRawBase64(request.entry);
  const rawCandidates = request.entry.submittedFiles.map((file) =>
    file.documentVisuals && (file.extension === "docx" || file.extension === "pptx") ? file.rawBase64 : undefined
  );
  const fallback = () => JSON.stringify({ ...request, entry: stripped });
  if (!rawCandidates.some((raw) => raw !== undefined)) return fallback();
  if (rawCandidates.reduce<number>((total, raw) => total + (raw?.length ?? 0), 0) > ITEM_REQUEST_BYTE_BUDGET) return fallback();
  const entry = { ...stripped, submittedFiles: stripped.submittedFiles.map((file, index) => rawCandidates[index] === undefined ? file : { ...file, rawBase64: rawCandidates[index] }) };
  const candidate = JSON.stringify({ ...request, entry });
  return new TextEncoder().encode(candidate).byteLength <= ITEM_REQUEST_BYTE_BUDGET ? candidate : fallback();
}
