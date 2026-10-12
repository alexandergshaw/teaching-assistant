"use client";

// Owner-only LMS connectivity probe, on the Settings > Diagnostics screen
// (docs/lms-connectivity-diagnostics-deep-scope.md, section 4.9, W3).
//
// Lists the configured institutions, and probes ONE per server call
// (probeLmsConnectivityAction) - a loop here, so no single call approaches the
// platform cap and no call can fan out. Each probe is also recorded as one
// "diagnostics"-surface entry so the downloadable session log carries it.
//
// There is no textbox, select or checkbox, so the persist-control-state rule
// has nothing to persist. A non-owner who loads the page gets the "owner only"
// line from the action's not-authorized result; the server gate is the control,
// this component only renders.
import { useEffect, useState } from "react";
import { listConfiguredInstitutionsAction } from "@/app/actions/course-hub-integrations";
import { probeLmsConnectivityAction } from "./connectivity-actions";
import type { ConnectivityProbeResult, ConnectivityVerdict } from "@/lib/canvas-connectivity-probe";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import styles from "../security/security.module.css";

const VERDICT_LABELS: Readonly<Record<ConnectivityVerdict, string>> = {
  connected: "Connected",
  "token-rejected": "Token rejected",
  "not-canvas": "Not Canvas",
  "http-error": "Host returned an error",
  "refused-by-host-rules": "Refused by host rules",
  network: "No response",
};

type RowState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: ConnectivityProbeResult }
  | { kind: "message"; text: string };

function describeRow(row: RowState): string {
  if (row.kind === "idle") return "Not tested yet.";
  if (row.kind === "running") return "Testing...";
  if (row.kind === "message") return row.text;
  const r = row.result;
  const parts = [
    VERDICT_LABELS[r.verdict],
    r.cause ? `cause ${r.cause}${r.code ? ` (${r.code})` : ""}` : "",
    r.httpStatus !== undefined ? `HTTP ${r.httpStatus}` : "",
    `reached: ${r.stagesReached.length > 0 ? r.stagesReached.join(", ") : "nothing"}`,
    `${r.latencyMs} ms`,
  ].filter((p) => p !== "");
  return `${r.host} - ${parts.join(" - ")}. ${r.hint}`;
}

function record(institution: string, result: ConnectivityProbeResult): void {
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "diagnostics",
    operation: "probe_lms_connectivity",
    label: "Test LMS connection",
    institution,
    course: "",
    outcome: result.verdict === "connected" ? "success" : "failure",
    error: result.verdict === "connected" ? "" : `${VERDICT_LABELS[result.verdict]}. ${result.hint}`,
    durationMs: result.latencyMs,
    host: result.host,
    ...(result.cause ? { cause: result.cause } : {}),
    ...(result.code ? { code: result.code } : {}),
  });
}

function describeRuntime(result: ConnectivityProbeResult): string {
  const family = result.runtime.autoSelectFamily;
  return `Server runtime: Node ${result.runtime.node}, automatic address-family selection ${
    family === null ? "unknown" : family ? "on" : "off"
  }.`;
}

export default function ConnectivitySection() {
  const [institutions, setInstitutions] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [busy, setBusy] = useState(false);
  const [runtimeLine, setRuntimeLine] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listConfiguredInstitutionsAction();
      if (cancelled) return;
      if ("error" in res) setLoadError(res.error);
      else setInstitutions(res.acronyms);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setRow = (code: string, row: RowState) => setRows((prev) => ({ ...prev, [code]: row }));

  async function probeOne(code: string): Promise<void> {
    setRow(code, { kind: "running" });
    try {
      const res = await probeLmsConnectivityAction(code);
      if (res.kind === "ok") {
        record(code, res.result);
        setRuntimeLine(describeRuntime(res.result));
        setRow(code, { kind: "done", result: res.result });
      } else if (res.kind === "not-authorized") {
        setRow(code, { kind: "message", text: "Owner only." });
      } else if (res.kind === "no-credential") {
        setRow(code, { kind: "message", text: "No usable credential is configured for this institution." });
      } else {
        setRow(code, { kind: "message", text: "That is not a valid institution code." });
      }
    } catch {
      setRow(code, { kind: "message", text: "The test could not be run. Try again." });
    }
  }

  async function probeAll(): Promise<void> {
    if (!institutions) return;
    setBusy(true);
    for (const code of institutions) {
      await probeOne(code);
    }
    setBusy(false);
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>LMS connectivity</p>
      <p className={styles.help}>
        Owner only. Tests whether this server can reach each configured Canvas site, one at a time, with a single
        read-only request, and names the likely reason when it cannot. Results are added to the session log.
      </p>

      {loadError && <p className={styles.error}>{loadError}</p>}

      {institutions === null && !loadError && (
        <div className={styles.loadingRow}>
          <span className={styles.spinner} aria-hidden="true" />
          Loading institutions...
        </div>
      )}

      {institutions !== null && institutions.length === 0 && (
        <p className={styles.emptyState}>No school is configured yet.</p>
      )}

      {institutions !== null && institutions.length > 0 && (
        <>
          <div className={styles.row}>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void probeAll()}>
              Test all connections
            </button>
          </div>
          <ul className={styles.factorList}>
            {institutions.map((code) => {
              const row = rows[code] ?? { kind: "idle" };
              return (
                <li key={code} className={styles.rowDetail}>
                  <strong>{code}</strong> - {describeRow(row)}{" "}
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={busy || row.kind === "running"}
                    onClick={() => void probeOne(code)}
                  >
                    Test connection
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {runtimeLine && (
        <p role="status" aria-live="polite" className={styles.help}>
          {runtimeLine}
        </p>
      )}
    </div>
  );
}
