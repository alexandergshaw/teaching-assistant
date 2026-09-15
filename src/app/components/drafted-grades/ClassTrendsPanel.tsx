"use client";

import { useMemo, useState } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import {
  computeClassTrends,
  containsForbiddenCompletenessPhrase,
  type AreaTrend,
} from "@/lib/grade/class-trends";
import type { ClassTrendsInsightObservation } from "@/lib/grade/class-trends-insight";
import type { GradingRunEntry } from "@/lib/grade";
import ClassTrendsDraftPanel from "./ClassTrendsDraftPanel";

// Backlog N12: the reachability surface for backlog N9/N10's class trends
// feature. Two layers were shipped with no caller - src/lib/grade/class-trends.ts
// (layer A, counted) and src/app/api/class-trends-insight/route.ts (layer B,
// inferred) - and this panel is the first and only thing that mounts either.
//
// Posted to by its route path, kept as a literal so the wiring test can pin
// this panel to the exact route layer B lives at, not merely "some fetch".
const CLASS_TRENDS_INSIGHT_ROUTE = "/api/class-trends-insight";

type InsightState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; observations: ClassTrendsInsightObservation[] }
  | { status: "error"; message: string };

const GENERIC_INSIGHT_ERROR =
  "Could not get an AI reading. The counted trends above are unaffected.";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Structural validation of one candidate observation from the route's JSON
 * body - defense in depth alongside the route's own parseClassTrendsInsightResponse
 * (class-trends-insight.ts), which already drops anything carrying a
 * forbidden completeness phrase. This panel never trusts the network body's
 * shape and re-checks the same rule using the SAME exported function
 * (requirement 3 of the item: reuse, never re-derive the phrase list). */
function toValidObservation(candidate: unknown): ClassTrendsInsightObservation | null {
  if (!isPlainRecord(candidate)) return null;
  const { kind, concept, reading } = candidate;
  if (kind !== "inferred" || typeof concept !== "string" || typeof reading !== "string") {
    return null;
  }
  if (containsForbiddenCompletenessPhrase(concept) || containsForbiddenCompletenessPhrase(reading)) {
    return null;
  }
  return { kind: "inferred", concept, reading };
}

/**
 * Renders layer A (counted, per-rubric-area trends) and, opt-in, layer B (a
 * model's inferred concept-level reading of the same run's submissions).
 *
 * Requirement 1: layer A is computed with computeClassTrends - a pure,
 * synchronous, no-network function - on every render, and rendered whenever
 * this panel's body is expanded. It never waits on, and is never hidden by,
 * layer B's fetch. The "expanded" toggle is the same density control every
 * sibling panel in this folder already uses (see AssignmentChecklistPanel,
 * RepoGradingLogPanel); it does not gate layer A on any network outcome.
 *
 * Requirement 2: layer B renders in its own block, below layer A, with its
 * own heading that says plainly these are a model's reading - never merged
 * into or styled like the counted list above it.
 *
 * Requirement 7: the layer B fetch can fail in several ways (network error,
 * non-2xx status, a body that is not JSON, a body missing "observations") and
 * every one of them resolves to an { status: "error" } state, never a thrown
 * exception - this app has no error boundary, so a throw here would take the
 * whole tab down with it.
 */
export default function ClassTrendsPanel({ entry }: { entry: GradingRunEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [insight, setInsight] = useState<InsightState>({ status: "idle" });

  const report = useMemo(() => computeClassTrends(entry), [entry]);

  const requestInsight = () => {
    setInsight({ status: "loading" });
    void (async () => {
      let response: Response;
      try {
        response = await fetch(CLASS_TRENDS_INSIGHT_ROUTE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry }),
        });
      } catch (err) {
        setInsight({
          status: "error",
          message: err instanceof Error ? `${GENERIC_INSIGHT_ERROR} (${err.message})` : GENERIC_INSIGHT_ERROR,
        });
        return;
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (!response.ok || !isPlainRecord(body)) {
        const message =
          isPlainRecord(body) && typeof body.error === "string" ? body.error : GENERIC_INSIGHT_ERROR;
        setInsight({ status: "error", message });
        return;
      }

      const rawObservations = Array.isArray(body.observations) ? body.observations : [];
      const observations = rawObservations
        .map(toValidObservation)
        .filter((o): o is ClassTrendsInsightObservation => o !== null);
      setInsight({ status: "done", observations });
    })();
  };

  return (
    <>
      <Button size="small" variant="text" onClick={() => setExpanded((v) => !v)} style={{ minWidth: 0 }}>
        {expanded ? "Hide trends" : `Trends (${report.areas.length})`}
      </Button>
      {expanded && (
        <div className={styles.draftExpand} style={{ flexBasis: "100%", marginTop: "var(--space-1)" }}>
          <div className={styles.fieldHint} style={{ margin: 0, fontWeight: 600 }}>
            Counted trends, per rubric area
          </div>
          {report.areas.length === 0 ? (
            <span className={styles.fieldHint}>No graded results to summarize yet.</span>
          ) : (
            <ul
              style={{ margin: 0, paddingLeft: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}
            >
              {report.areas.map((area: AreaTrend) => (
                <li key={area.area} className={styles.draftFeedback} style={{ margin: 0 }}>
                  {area.summary}
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: "var(--space-2)" }}>
            {insight.status === "idle" && (
              <Button size="small" variant="outlined" onClick={requestInsight}>
                Get AI reading (optional)
              </Button>
            )}
            {insight.status === "loading" && (
              <span className={styles.fieldHint} role="status" aria-live="polite">
                Reading the submissions graded so far for concept-level patterns...
              </span>
            )}
            {insight.status === "error" && (
              <>
                <div className={styles.error} style={{ margin: "0 0 var(--space-1)" }}>
                  {insight.message}
                </div>
                <Button size="small" variant="outlined" onClick={requestInsight}>
                  Try again
                </Button>
              </>
            )}
            {insight.status === "done" && (
              <div>
                <div className={styles.fieldHint} style={{ margin: "0 0 var(--space-1)", fontWeight: 600 }}>
                  AI reading of the submissions graded so far - a model&apos;s inference, not a counted fact
                </div>
                {insight.observations.length === 0 ? (
                  <span className={styles.fieldHint}>No clear concept-level pattern was found.</span>
                ) : (
                  <ul
                    style={{ margin: 0, paddingLeft: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}
                  >
                    {insight.observations.map((obs, idx) => (
                      <li key={idx} className={styles.draftFeedback} style={{ margin: 0 }}>
                        <strong>{obs.concept}:</strong> {obs.reading}
                      </li>
                    ))}
                  </ul>
                )}
                <Button size="small" variant="text" onClick={requestInsight} style={{ marginTop: "var(--space-1)" }}>
                  Ask again
                </Button>
              </div>
            )}
          </div>

          <ClassTrendsDraftPanel
            report={report}
            observations={insight.status === "done" ? insight.observations : []}
            assignmentName={entry.assignmentName}
          />
        </div>
      )}
    </>
  );
}
