"use client";

import { Button } from "@mui/material";
import { splitDetailSections } from "@/lib/workflows/detail-sections";
import type { StepRunSummary } from "@/lib/workflows/registry";
import styles from "../../page.module.css";

// Summary renderer for a finished step. A separate component so `summary` is a
// const parameter: the `summary.kind` narrowing then persists into the CSV
// button closures, which TypeScript does not allow on state property chains.
export function SummaryView({ summary }: { summary: StepRunSummary }) {
  if (summary.kind === "schedule") {
    return (
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.85rem",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--field-border)",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Week
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--field-border)",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Topic
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--field-border)",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Summary
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--field-border)",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Assignment
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--field-border)",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                Test
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.schedule.map((week) => (
              <tr key={week.week}>
                <td
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  {week.week}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  {week.topic}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  {week.summary}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  {week.assignmentTitle}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  {week.testName}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              const blob = new Blob([summary.csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const sanitized =
                summary.courseTitle.replace(/\s+/g, "-").toLowerCase() ||
                "schedule";
              a.download = `${sanitized}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
          >
            Download CSV
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              navigator.clipboard.writeText(summary.csv).catch(() => {});
            }}
          >
            Copy CSV
          </Button>
        </div>
        {summary.notes && (
          <p className={styles.fieldHint} style={{ marginTop: 8 }}>
            {summary.notes}
          </p>
        )}
      </div>
    );
  }

  if (summary.kind === "link") {
    return (
      <a
        className={styles.linkButton}
        href={summary.url}
        target="_blank"
        rel="noreferrer"
      >
        {summary.label}
      </a>
    );
  }

  if (summary.kind === "list") {
    return (
      <>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{summary.label}</p>
        <ul className={styles.fieldHint} style={{ margin: "4px 0 0 16px" }}>
          {summary.items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </>
    );
  }

  return <p className={styles.fieldHint}>{summary.text}</p>;
}

// Numeric-aware comparison for review-table sorting: numbers sort numerically
// and before non-numbers; everything else sorts lexicographically.
export function compareTableValues(a: string, b: string): number {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  const aNum = a.trim() !== "" && Number.isFinite(na);
  const bNum = b.trim() !== "" && Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

export function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Validity of a review-table grade cell (tables with grade/outOf columns):
// null when fine, else a short problem description. An EMPTY grade is valid -
// post-grades deliberately supports comment-only posting with no score.
export function tableGradeIssue(row: Record<string, string>): string | null {
  const raw = (row.grade ?? "").trim();
  if (raw === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return "not a number";
  const grade = parseFloat(raw);
  const outOf = parseFloat((row.outOf ?? "").trim());
  if (grade < 0) return "below 0";
  if (Number.isFinite(outOf) && grade > outOf) return `above ${outOf}`;
  return null;
}

export type GradeBand = "success" | "accent" | "warning" | "danger" | "neutral";

// Visual banding for the Grade badge/distribution bar: percentage bands when
// grade/outOf are both usable numbers, else a neutral "unbanded" pill (empty,
// invalid, or no outOf to compute a percentage against).
export function tableGradeBand(row: Record<string, string>): { band: GradeBand; pct: number | null } {
  const raw = (row.grade ?? "").trim();
  if (raw === "" || tableGradeIssue(row) !== null) return { band: "neutral", pct: null };
  const outOf = parseFloat((row.outOf ?? "").trim());
  if (!Number.isFinite(outOf) || outOf <= 0) return { band: "neutral", pct: null };
  const pct = (parseFloat(raw) / outOf) * 100;
  const band: GradeBand =
    pct >= 90 ? "success" : pct >= 80 ? "accent" : pct >= 70 ? "warning" : "danger";
  return { band, pct };
}

const GRADE_BAND_BADGE_CLASS: Record<GradeBand, string> = {
  success: styles.ghBadgeSuccess,
  accent: styles.ghBadgeAccent,
  warning: styles.ghBadgeWarning,
  danger: styles.ghBadgeDanger,
  neutral: styles.ghBadgeNeutral,
};

// Compact read-out beside the editable Grade cell - a visual summary only,
// the TextField above it stays the actual (and only) way to edit the value.
export function GradeBadge({ row }: { row: Record<string, string> }) {
  const raw = (row.grade ?? "").trim();
  if (raw === "") {
    return (
      <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>No grade</span>
    );
  }
  const { band, pct } = tableGradeBand(row);
  const label = pct !== null ? `${Math.round(pct)}%` : raw;
  return (
    <span className={`${styles.ghBadge} ${GRADE_BAND_BADGE_CLASS[band]}`}>{label}</span>
  );
}

// Presentation for a row-detail text blob: headed sections when the
// registry's rowDetail text has recognizable section labels ("Rubric
// breakdown:", "AI feedback:", ...), otherwise the original single
// pre-wrap block untouched (no headers to show, so no dividers either).
export function DetailSectionsView({ text }: { text: string }) {
  const sections = splitDetailSections(text);
  const hasHeaders = sections.some((s) => s.header !== null);
  if (!hasHeaders) {
    return <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>;
  }
  return (
    <>
      {sections.map((section, idx) => (
        <div key={idx} className={idx > 0 ? styles.workflowDetailSectionDivider : undefined}>
          {section.header && (
            <div className={styles.workflowDetailSectionHeader}>{section.header}</div>
          )}
          {section.body && <div style={{ whiteSpace: "pre-wrap" }}>{section.body}</div>}
        </div>
      ))}
    </>
  );
}
