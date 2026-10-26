import { recordGradingDiagnosticEntry } from "../grading/gradingDiagnosticLog";
import type { ChatRoleRow } from "./chatFileRoles";
const failures = { limits: "File role batch exceeds limits", "pending-preview": "Another file role preview is pending", "setup-invalid": "File role setup is invalid", "setup-refused": "File role setup was refused", "file-failed": "File role submission failed", canceled: "File role intake was canceled" } as const;
export function recordChatFileRoleDiagnostic(args: { operation: "stage" | "confirm"; outcome: "success" | "failure"; startedAtMs: number; rows: readonly ChatRoleRow[]; failure?: "limits" | "pending-preview" | "setup-invalid" | "setup-refused" | "file-failed" | "canceled" }): void {
  try {
    recordGradingDiagnosticEntry({ at: new Date().toISOString(), operation: args.operation === "stage" ? "stage_file_roles" : "confirm_file_roles", outcome: args.outcome,
      durationMs: Math.max(0, Math.round(performance.now() - args.startedAtMs)), error: args.outcome === "failure" ? failures[args.failure ?? "setup-invalid"] : undefined,
      roleDetail: { files: args.rows.length, assignmentFiles: args.rows.filter((row) => row.role === "instructions").length, rubricFiles: args.rows.filter((row) => row.role === "rubric").length,
        combinedFiles: args.rows.filter((row) => row.role === "combined").length, submissionFiles: args.rows.filter((row) => row.role === "submission").length,
        excludedFiles: args.rows.filter((row) => row.role === "exclude").length, unresolvedFiles: args.rows.filter((row) => row.role === "unassigned").length,
        failedFiles: args.rows.filter((row) => row.status === "failed" || row.status === "error").length, unattemptedFiles: args.rows.filter((row) => row.status === "unattempted").length } });
  } catch { /* Diagnostics cannot change role confirmation or dispatch. */ }
}
