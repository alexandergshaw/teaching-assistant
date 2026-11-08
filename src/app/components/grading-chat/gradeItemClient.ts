import { serializeGradeItemWithOfficeSource } from "@/app/components/grading/officeSourceWire";
import { ITEM_REQUEST_BYTE_BUDGET, type GradeRunItemRequestBody } from "@/app/components/grading/incrementalRunPlan";
import type { GradeResult } from "@/lib/grade/types";
import type { ItemDiagnosticSink } from "./chatGradeDetail";
import { gradeFailureFromBody } from "./videoClient";

export async function postGradeRunItem(request: GradeRunItemRequestBody, sink?: ItemDiagnosticSink): Promise<GradeResult> {
  const bodyText = serializeGradeItemWithOfficeSource(request);
  if (new TextEncoder().encode(bodyText).byteLength > ITEM_REQUEST_BYTE_BUDGET) {
    throw new Error("This submission and grading setup exceed the request size limit. Reduce the submission or setup, then submit it again.");
  }
  const res = await fetch("/api/grade-run-item", {
    method: "POST", headers: { "content-type": "application/json" }, body: bodyText,
  });
  const body = (await res.json().catch(() => ({}))) as { result?: GradeResult; error?: string; videoFailure?: unknown; diagnostic?: unknown };
  if (sink) { sink.httpStatus = res.status; sink.diagnostic = body.diagnostic; }
  if (!res.ok || !body.result) throw gradeFailureFromBody(body);
  return body.result;
}

export function safeDiagnostic(fn: () => void): void {
  try { fn(); } catch { /* Diagnostics cannot change a grade. */ }
}
