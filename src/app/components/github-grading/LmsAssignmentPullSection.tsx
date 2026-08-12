"use client";

// AC B: the "pull instructions/rubric from a course assignment" field group,
// split out of GithubGradingPanel.tsx (see useLmsAssignmentPull.ts's header
// comment) purely to keep that file under this project's 1000-line ceiling.
// Presentational only - props in, JSX out, no server-action calls of its
// own. Every value and handler below is owned by useLmsAssignmentPull.ts;
// GithubGradingPanel.tsx just wires that hook's result into these props.

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import styles from "../../page.module.css";
import type { LmsRenderSources } from "@/lib/courses-table-helpers";
import type { ExportAssignmentOption } from "@/lib/lms-export-source/export-assignments";
import type { GithubGradingUiState, GithubGradingPullSource } from "./githubGradingUiState";
import type { Course } from "@/lib/supabase/courses";
import type { CanvasAssignmentBrief } from "@/lib/canvas";
import type { CartridgeRubric } from "@/lib/cartridge-import-shared";

export interface LmsAssignmentPullSectionProps {
  pullCourseId: string;
  hubCourses: Course[];
  hubCoursesState: "loading" | "ready" | "error";
  selectPullCourse: (id: string) => void;
  pullCourse: Course | null;
  pullCourseSources: LmsRenderSources;
  pullSource: GithubGradingPullSource;
  updateUiState: (patch: Partial<GithubGradingUiState>) => void;

  selectedLiveAssignmentId: string;
  liveAssignments: CanvasAssignmentBrief[];
  liveAssignmentsLoading: boolean;
  liveAssignmentsError: string | null;
  pullFromLive: () => Promise<void>;
  livePulling: boolean;
  livePullNote: string | null;

  selectedExportAssignmentKey: string;
  exportAssignmentOptionList: ExportAssignmentOption[];
  exportContentLoading: boolean;
  exportContentError: string | null;
  pullFromExport: () => void;
  exportPullNote: string | null;

  selectedExportRubricTitle: string;
  exportRubricOptions: CartridgeRubric[];
  pullExportRubric: () => void;
  exportRubricNote: string | null;
}

/* AC B: pull instructions/rubric from a live Canvas assignment or a saved
   course export - read-only, explicit-pull-only (see the pullFromLive/
   pullFromExport/pullExportRubric props, implemented in
   useLmsAssignmentPull.ts). */
export default function LmsAssignmentPullSection({
  pullCourseId,
  hubCourses,
  hubCoursesState,
  selectPullCourse,
  pullCourse,
  pullCourseSources,
  pullSource,
  updateUiState,
  selectedLiveAssignmentId,
  liveAssignments,
  liveAssignmentsLoading,
  liveAssignmentsError,
  pullFromLive,
  livePulling,
  livePullNote,
  selectedExportAssignmentKey,
  exportAssignmentOptionList,
  exportContentLoading,
  exportContentError,
  pullFromExport,
  exportPullNote,
  selectedExportRubricTitle,
  exportRubricOptions,
  pullExportRubric,
  exportRubricNote,
}: LmsAssignmentPullSectionProps) {
  return (
    <div className={styles.field}>
      <label>Pull instructions/rubric from a course assignment (optional)</label>
      <TextField
        select
        size="small"
        value={pullCourseId}
        onChange={(e) => selectPullCourse(e.target.value)}
        disabled={hubCoursesState === "loading"}
        sx={{ minWidth: 240 }}
      >
        <MenuItem value="">{hubCoursesState === "loading" ? "Loading courses…" : "Choose a course…"}</MenuItem>
        {hubCourses.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
      {hubCoursesState === "error" && <p className={styles.error}>Could not load your courses.</p>}

      {pullCourse && !pullCourseSources.live && !pullCourseSources.export && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 6 }}>
          &quot;{pullCourse.name}&quot; has no live Canvas connection and no saved export - add one on the course tile to pull from it here.
        </p>
      )}

      {pullCourse && (pullCourseSources.live || pullCourseSources.export) && (
        <>
          {pullCourseSources.live && pullCourseSources.export && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Button
                type="button"
                size="small"
                variant={pullSource === "live" ? "contained" : "outlined"}
                onClick={() => updateUiState({ source: "live" })}
              >
                Live Canvas
              </Button>
              <Button
                type="button"
                size="small"
                variant={pullSource === "export" ? "contained" : "outlined"}
                onClick={() => updateUiState({ source: "export" })}
              >
                Saved export
              </Button>
            </div>
          )}

          {pullSource === "live" && pullCourseSources.live && (
            <div style={{ marginTop: 8 }}>
              <TextField
                select
                size="small"
                fullWidth
                value={selectedLiveAssignmentId}
                onChange={(e) => updateUiState({ liveAssignmentId: e.target.value })}
                disabled={liveAssignmentsLoading}
              >
                <MenuItem value="">{liveAssignmentsLoading ? "Loading assignments…" : "Choose an assignment…"}</MenuItem>
                {liveAssignments.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                  </MenuItem>
                ))}
              </TextField>
              {liveAssignmentsError && <p className={styles.error}>{liveAssignmentsError}</p>}
              <Button
                type="button"
                variant="contained"
                size="small"
                sx={{ mt: 1 }}
                onClick={() => void pullFromLive()}
                disabled={!selectedLiveAssignmentId || livePulling}
              >
                {livePulling ? "Pulling…" : "Pull instructions + rubric"}
              </Button>
              {livePullNote && <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 6 }}>{livePullNote}</p>}
            </div>
          )}

          {pullSource === "export" && pullCourseSources.export && (
            <div style={{ marginTop: 8 }}>
              <TextField
                select
                size="small"
                fullWidth
                value={selectedExportAssignmentKey}
                onChange={(e) => updateUiState({ exportAssignmentKey: e.target.value })}
                disabled={exportContentLoading}
              >
                <MenuItem value="">{exportContentLoading ? "Loading export…" : "Choose an assignment…"}</MenuItem>
                {exportAssignmentOptionList.map((opt) => (
                  <MenuItem key={opt.key} value={opt.key}>
                    {opt.moduleTitle} — {opt.itemTitle}
                  </MenuItem>
                ))}
              </TextField>
              {exportContentError && <p className={styles.error}>{exportContentError}</p>}
              <Button
                type="button"
                variant="contained"
                size="small"
                sx={{ mt: 1 }}
                onClick={pullFromExport}
                disabled={!selectedExportAssignmentKey}
              >
                Pull instructions
              </Button>
              {exportPullNote && <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 6 }}>{exportPullNote}</p>}

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                <label style={{ display: "block", marginBottom: 4 }}>Course rubric (optional)</label>
                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 6px" }}>
                  A course export has no record of which rubric belongs to which assignment - this is every rubric
                  in the export, by title. Pick one only if you judge it matches this assignment; the pairing is
                  your call, not the export&apos;s.
                </p>
                {exportRubricOptions.length === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>This export has no saved rubrics.</p>
                ) : (
                  <>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={selectedExportRubricTitle}
                      onChange={(e) => updateUiState({ exportRubricTitle: e.target.value })}
                    >
                      <MenuItem value="">Choose a rubric…</MenuItem>
                      {exportRubricOptions.map((r) => (
                        <MenuItem key={r.title} value={r.title}>
                          {r.title}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      type="button"
                      variant="outlined"
                      size="small"
                      sx={{ mt: 1 }}
                      onClick={pullExportRubric}
                      disabled={!selectedExportRubricTitle}
                    >
                      Use this rubric
                    </Button>
                    {exportRubricNote && <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 6 }}>{exportRubricNote}</p>}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
