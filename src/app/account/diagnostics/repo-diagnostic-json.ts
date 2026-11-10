import { formatSessionDiagnosticLogJson, type SessionDiagnosticLog } from "@/lib/session-diagnostic-log";

/** Preserve the canonical session log envelope when adding explicit repository exports. */
export function formatRepoDiagnosticExportJson(log: SessionDiagnosticLog, requiresReload: boolean, recentTargets: unknown, manualAttempts: unknown): string {
  return JSON.stringify({ ...JSON.parse(formatSessionDiagnosticLogJson(log)), sessionLogRequiresReload: requiresReload, repoGradeRecentRunTargets: recentTargets, repoGradeManualAttempts: manualAttempts }, null, 2);
}
