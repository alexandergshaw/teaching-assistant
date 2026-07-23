"use client";

import { Autocomplete, Button, TextField } from "@mui/material";
import styles from "../../page.module.css";

type LessonPlanPreviewFooterProps = {
  onDownload: () => Promise<void>;
  onClose: () => void;
  attachCourses?: Array<{ id: string; name: string }> | null;
  attachBusy?: boolean;
  attachNote?: { kind: "success" | "error"; text: string } | null;
  selectedCourse: { id: string; name: string } | null;
  onAttach?: (courseId: string) => void;
  onSelectedCourseChange: (course: { id: string; name: string } | null) => void;
};

export default function LessonPlanPreviewFooter({
  onDownload,
  onClose,
  attachCourses,
  attachBusy,
  attachNote,
  selectedCourse,
  onAttach,
  onSelectedCourseChange,
}: LessonPlanPreviewFooterProps) {
  return (
    <div className={styles.lessonPreviewFooter}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Button
          variant="contained"
          size="small"
          onClick={onDownload}
        >
          Download ZIP
        </Button>
        {onAttach && attachCourses && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Autocomplete
              options={attachCourses ?? []}
              value={selectedCourse}
              onChange={(_, newValue) => onSelectedCourseChange(newValue)}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value?.id}
              size="small"
              sx={{ width: 200 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={attachCourses === null ? "Loading…" : "Attach to course…"}
                  disabled={attachCourses === null || attachBusy}
                />
              )}
            />
            <Button
              variant="contained"
              size="small"
              disabled={!selectedCourse || attachBusy}
              onClick={() => {
                if (selectedCourse) onAttach(selectedCourse.id);
              }}
            >
              {attachBusy ? "Attaching…" : "Attach zip"}
            </Button>
          </div>
        )}
        <Button
          variant="outlined"
          size="small"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      {attachNote && (
        <p style={{ margin: "8px 0 0 0", fontSize: "0.875rem", color: attachNote.kind === "error" ? "var(--danger)" : "var(--success)" }}>
          {attachNote.text}
        </p>
      )}
    </div>
  );
}
