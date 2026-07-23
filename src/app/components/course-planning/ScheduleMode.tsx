"use client";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import styles from "../../page.module.css";
import { triggerFileDownload } from "./utils";
import { LS_KEYS } from "./types";

interface ScheduleModeProps {
  courseDescription: string;
  onCourseDescriptionChange: (value: string) => void;
  scheduleTerm: string;
  onScheduleTermChange: (value: string) => void;
  scheduleStartDate: string;
  onScheduleStartDateChange: (value: string) => void;
  scheduleWeeks: string;
  onScheduleWeeksChange: (value: string) => void;
  scheduleTests: string;
  onScheduleTestsChange: (value: string) => void;
  scheduleRows: Array<{ week: number; dates: string; topics: string; assignment: string }>;
  scheduleTopics: string[] | null;
  isGeneratingSchedule: boolean;
  scheduleError: string | null;
  scheduleGenerated: boolean;
  isGeneratingProjectPrompt: boolean;
  onGenerateSchedule: () => Promise<void>;
  onResetSchedule: () => void;
  onExportScheduleCsv: () => void;
  onUseScheduleForProject: () => void;
}

export default function ScheduleMode({
  courseDescription,
  onCourseDescriptionChange,
  scheduleTerm,
  onScheduleTermChange,
  scheduleStartDate,
  onScheduleStartDateChange,
  scheduleWeeks,
  onScheduleWeeksChange,
  scheduleTests,
  onScheduleTestsChange,
  scheduleRows,
  scheduleTopics,
  isGeneratingSchedule,
  scheduleError,
  scheduleGenerated,
  isGeneratingProjectPrompt,
  onGenerateSchedule,
  onResetSchedule,
  onExportScheduleCsv,
  onUseScheduleForProject,
}: ScheduleModeProps) {
  if (!scheduleGenerated) {
    return (
      <>
        <div className={styles.field}>
          <TextField
            id="courseDescription"
            label="Course Description"
            multiline
            minRows={4}
            size="small"
            fullWidth
            placeholder="Describe the course — its topics, goals, and audience."
            value={courseDescription}
            onChange={(e) => {
              onCourseDescriptionChange(e.target.value);
              localStorage.setItem(LS_KEYS.courseDescription, e.target.value);
            }}
          />
        </div>
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: -8, marginBottom: 16 }}>
          Leave term, start date, weeks, and tests empty to get just an ordered topic list.
        </p>
        <div className={styles.field}>
          <TextField
            id="scheduleTerm"
            label="Term (optional)"
            type="text"
            size="small"
            fullWidth
            placeholder="e.g. Fall 2026"
            value={scheduleTerm}
            onChange={(e) => {
              onScheduleTermChange(e.target.value);
              localStorage.setItem(LS_KEYS.scheduleTerm, e.target.value);
            }}
          />
        </div>
        <div className={styles.field}>
          <TextField
            id="scheduleStartDate"
            label="Course Start Date (optional)"
            type="date"
            size="small"
            fullWidth
            value={scheduleStartDate}
            onChange={(e) => {
              onScheduleStartDateChange(e.target.value);
              localStorage.setItem(LS_KEYS.scheduleStartDate, e.target.value);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </div>
        <div className={styles.field}>
          <TextField
            id="scheduleWeeks"
            label="Number of Weeks (optional)"
            type="number"
            size="small"
            fullWidth
            placeholder="e.g. 15"
            slotProps={{ htmlInput: { min: 1, max: 52 } }}
            value={scheduleWeeks}
            onChange={(e) => {
              onScheduleWeeksChange(e.target.value);
              localStorage.setItem(LS_KEYS.scheduleWeeks, e.target.value);
            }}
          />
        </div>
        <div className={styles.field}>
          <TextField
            id="scheduleTests"
            label="Number of Tests (optional)"
            type="number"
            size="small"
            fullWidth
            placeholder="e.g. 3"
            slotProps={{ htmlInput: { min: 0 } }}
            value={scheduleTests}
            onChange={(e) => {
              onScheduleTestsChange(e.target.value);
              localStorage.setItem(LS_KEYS.scheduleTests, e.target.value);
            }}
          />
        </div>
        {scheduleError && <p className={styles.error}>{scheduleError}</p>}
        <Button
          variant="contained"
          size="small"
          onClick={onGenerateSchedule}
          disabled={isGeneratingSchedule || !courseDescription.trim()}
        >
          {isGeneratingSchedule ? "Generating schedule..." : "Generate Schedule"}
        </Button>
      </>
    );
  }

  // Results view
  return (
    <>
      {scheduleTopics && scheduleTopics.length > 0 ? (
        <>
          <div className={styles.field}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Course Topics</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: 12 }}>
              {scheduleTopics.length} topics
            </p>
            <ol style={{ paddingLeft: 24, lineHeight: 1.6 }}>
              {scheduleTopics.map((topic, idx) => (
                <li key={idx}>{topic}</li>
              ))}
            </ol>
          </div>
          <div className={styles.scheduleActions}>
            <Button
              variant="contained"
              size="small"
              onClick={() => {
                navigator.clipboard.writeText(scheduleTopics.join("\n"));
              }}
            >
              Copy
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={() => {
                const blob = new Blob([scheduleTopics.join("\n")], { type: "text/plain;charset=utf-8" });
                triggerFileDownload(blob, "course-topics.txt");
              }}
            >
              Download .txt
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={onResetSchedule}
            >
              Edit &amp; Regenerate
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.courseScheduleWrap}>
            <table className={styles.courseScheduleTable}>
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Dates</th>
                  <th>Topics</th>
                  <th>Assignment</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map((row) => (
                  <tr key={row.week}>
                    <td>{row.week}</td>
                    <td>{row.dates || "—"}</td>
                    <td>{row.topics}</td>
                    <td>{row.assignment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.scheduleActions}>
            <Button
              variant="contained"
              size="small"
              onClick={onResetSchedule}
            >
              Edit &amp; Regenerate
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={onExportScheduleCsv}
            >
              Export CSV
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={onUseScheduleForProject}
              disabled={isGeneratingProjectPrompt}
              title="Use this schedule for Course Project Planning and generate the Copilot prompt"
            >
              {isGeneratingProjectPrompt ? "Generating prompt..." : "Use for Project Planning"}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
