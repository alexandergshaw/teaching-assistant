import "server-only";
import type { ExpectedOwnerSession } from "./owner-session-binding";
import { loadNotebookAttempt } from "./notebook-attempt-store";
import { notebookGradeBinding } from "./notebook-grade-binding";
import { parseNotebookObservations } from "./notebook-kernel-controller";
import type { CodeRunResult } from "../code-runner";
import type { GradeAttachment } from "./engine";
import { validateNotebookOutputImages } from "./notebook-output-images";

/** Only server-stored, owner/session-scoped observations for this exact
 * request and submitted URL may reach the grader. */
export async function notebookGradeHandoff(session: ExpectedOwnerSession, attempt: string, request: unknown, sourceUrl: string, commit: string): Promise<{ codeRun: CodeRunResult; images: GradeAttachment[] } | null> {
  const row = await loadNotebookAttempt(session, attempt) as { status?: string; expires_at?: string; grade_binding_sha256?: string; source_url?: string; notebook_path?: string; commit_sha?: string; expected_cells?: number[]; result?: unknown } | null;
  const expiry = row?.expires_at ? Date.parse(row.expires_at) : NaN;
  if (!row || row.status !== "succeeded" || !Number.isFinite(expiry) || expiry <= Date.now() || row.source_url !== sourceUrl || row.commit_sha !== commit.toLowerCase() || typeof row.notebook_path !== "string" || row.grade_binding_sha256 !== await notebookGradeBinding(request) || !Array.isArray(row.expected_cells)) return null;
  const observations = parseNotebookObservations(JSON.stringify(row.result), 0, row.expected_cells);
  if (!observations) return null;
  const images = await validateNotebookOutputImages(observations); if (!images) return null;
  return { codeRun: { language: "python", files: [row.notebook_path], entryPoint: row.notebook_path, ran: true, exitCode: 0, notebookExecutionObserved: true, notebookOutputImages: images.length, stdout: JSON.stringify({ observedCells: observations.observed, outputs: observations.outputs, images: observations.images.map(image => ({ cell: image.cell, attached: true })), caveat: "Kernel replies are untrusted and are not tamper-resistant attestation." }), stderr: "" }, images };
}
