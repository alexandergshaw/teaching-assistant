"use client";

import { useState } from "react";
import { copyFileToCanvasPageAction } from "../actions";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { useInstitutionSelection } from "@/lib/institutions";
import CoursePicker from "./CoursePicker";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import styles from "../page.module.css";

interface PublishToCanvasPageProps {
  filePath: string;
  content: string;
}

export default function PublishToCanvasPage({ filePath, content }: PublishToCanvasPageProps) {
  const { active: activeInstitution } = useInstitutionSelection();

  const [open, setOpen] = useState(false);
  const [courseUrl, setCourseUrl] = useState("");
  const [title, setTitle] = useState("");
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string; url?: string } | null>(null);

  const handleOpen = () => {
    const basename = filePath.split("/").pop() || filePath;
    setTitle(basename);
    setNote(null);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!courseUrl.trim() || !title.trim()) {
      return;
    }

    setBusy(true);
    const result = await copyFileToCanvasPageAction(
      courseUrl,
      {
        filePath,
        content,
        title: title.trim(),
        published,
      },
      activeInstitution || undefined
    );
    setBusy(false);

    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
    } else {
      setNote({
        kind: "success",
        text: "Created Canvas page.",
        url: result.htmlUrl,
      });
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        onClick={handleOpen}
      >
        Send to Canvas page
      </Button>

      {open && (
        <div
          style={{
            border: "1px solid var(--field-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-3)",
            marginTop: "var(--space-2)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          {!activeInstitution ? (
            <>
              <p className={styles.fieldHint}>
                Please add or select a school in Settings first.
              </p>
              <Button variant="text" size="small" onClick={handleClose}>
                Close
              </Button>
            </>
          ) : (
            <>
              <CoursePicker
                activeInstitution={activeInstitution}
                courseUrl={courseUrl}
                onSelect={setCourseUrl}
                courseName=""
              />

              <TextField
                size="small"
                fullWidth
                label="Page title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={published}
                    onChange={(e) => setPublished(e.target.checked)}
                  />
                }
                label="Publish page"
              />

              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={
                    busy ||
                    !parseCanvasCourseId(courseUrl) ||
                    !title.trim()
                  }
                  onClick={handleCreate}
                >
                  {busy ? "Creating…" : "Create page"}
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={handleClose}
                >
                  Cancel
                </Button>
              </div>

              {note && (
                // AM11's notice idiom (inline, full width, --radius-md, a
                // token status surface) rather than the plain-text
                // styles.error/styles.fieldHint this used to reuse - neither
                // of those classes carries a surface/border, and adding one
                // requires page.module.css, which this group does not own.
                <div
                  role="status"
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${note.kind === "error" ? "var(--danger-border)" : "var(--accent-border-soft)"}`,
                    background: note.kind === "error" ? "var(--danger-surface)" : "var(--accent-surface)",
                    color: note.kind === "error" ? "var(--danger)" : "var(--text-primary)",
                    fontSize: "var(--font-size-md)",
                    marginTop: "var(--space-1)",
                  }}
                >
                  {note.text}
                  {note.url && (
                    <>
                      {" "}
                      <a
                        href={note.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View in Canvas
                      </a>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
