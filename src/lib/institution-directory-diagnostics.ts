import { recordSessionDiagnosticEntry, type SessionDiagnosticEntry } from "./session-diagnostic-log";

export type InstitutionDirectoryOperation =
  | "list" | "create-profile" | "update-profile" | "remove-profile" | "create-column" | "rename-column" | "save-value" | "clear-value" | "remove-column" | "external-open";
export type InstitutionDirectoryOutcome = "success" | "failure";
export type InstitutionDirectoryTarget = "profile" | "column" | "value" | "directory" | "email" | "lms" | "faculty-portal" | "institution-website" | "custom-column-link" | "password-manager-help";

const LABELS: Record<InstitutionDirectoryOperation, string> = {
  list: "Load institution directory",
  "create-profile": "Create institution profile",
  "update-profile": "Update institution profile",
  "remove-profile": "Remove institution profile",
  "create-column": "Create institution column",
  "rename-column": "Rename institution column",
  "save-value": "Save institution value",
  "clear-value": "Clear institution value",
  "remove-column": "Remove institution column",
  "external-open": "Open institution destination",
};

export interface InstitutionDirectoryMetrics {
  durationMs?: number;
  institutionCount?: number;
  columnCount?: number;
}

export function institutionDirectoryDiagnosticReason(code: string): "validation" | "storage" | "unauthenticated" | "not-found" {
  if (code === "unauthenticated") return "unauthenticated";
  if (code === "target-not-found") return "not-found";
  if (code.startsWith("invalid") || code === "duplicate-acronym" || code === "duplicate-label" || code === "credential-label" || code === "missing-email-client-name" || code === "missing-lms-name") return "validation";
  return "storage";
}

export type InstitutionDirectoryRequestResult<T> = { kind: "returned"; value: T } | { kind: "unavailable" };

/** Converts transport-level rejection into a privacy-safe, measured outcome. */
export async function runInstitutionDirectoryRequest<T>(input: {
  operation: Exclude<InstitutionDirectoryOperation, "external-open">;
  target: Extract<InstitutionDirectoryTarget, "directory" | "profile" | "column" | "value">;
  startedAt: number;
  request: () => Promise<T>;
  now?: () => number;
  onUnavailable?: () => void;
}): Promise<InstitutionDirectoryRequestResult<T>> {
  try {
    return { kind: "returned", value: await input.request() };
  } catch {
    const now = input.now ?? (() => globalThis.performance.now());
    recordInstitutionDirectoryDiagnostic(input.operation, "failure", input.target, "unavailable", { durationMs: now() - input.startedAt });
    input.onUnavailable?.();
    return { kind: "unavailable" };
  }
}

export function buildInstitutionDirectoryDiagnostic(input: {
  at: string;
  operation: InstitutionDirectoryOperation;
  outcome: InstitutionDirectoryOutcome;
  target: InstitutionDirectoryTarget;
  reason?: "validation" | "storage" | "unavailable" | "unauthenticated" | "not-found";
  metrics?: InstitutionDirectoryMetrics;
}): SessionDiagnosticEntry {
  const metrics = input.metrics ?? {};
  return {
    at: input.at,
    surface: "courses",
    operation: `institution_directory_${input.operation.replaceAll("-", "_")}`,
    label: LABELS[input.operation],
    institution: "",
    course: "",
    outcome: input.outcome,
    error: "",
    ...(Number.isFinite(metrics.durationMs) ? { durationMs: Math.max(0, Math.round(metrics.durationMs!)) } : {}),
    detail: {
      target: input.target,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(Number.isFinite(metrics.institutionCount) ? { institutionCount: metrics.institutionCount! } : {}),
      ...(Number.isFinite(metrics.columnCount) ? { columnCount: metrics.columnCount! } : {}),
    },
  };
}

export function recordInstitutionDirectoryDiagnostic(
  operation: InstitutionDirectoryOperation,
  outcome: InstitutionDirectoryOutcome,
  target: InstitutionDirectoryTarget,
  reason?: "validation" | "storage" | "unavailable" | "unauthenticated" | "not-found",
  metrics?: InstitutionDirectoryMetrics
): void {
  try {
    recordSessionDiagnosticEntry(buildInstitutionDirectoryDiagnostic({
      at: new Date().toISOString(), operation, outcome, target,
      ...(reason ? { reason } : {}), ...(metrics ? { metrics } : {}),
    }));
  } catch {
    // A telemetry failure must never change a confirmed directory operation.
  }
}
