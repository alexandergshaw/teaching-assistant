"use client";

import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import {
  listCourseHubAction,
  createCourseHubAction,
  updateCourseHubAction,
  deleteCourseHubAction,
  listFinalizedSyllabiAction,
  getFinalizedSyllabusAction,
} from "../actions";
import type { Course } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import GithubRepoPicker from "./GithubRepoPicker";
import TabHeader from "./TabHeader";
import styles from "../page.module.css";

// The editable form state (all strings; "" means "not set").
interface CourseForm {
  id: string | null;
  name: string;
  courseCode: string;
  term: string;
  canvasUrl: string;
  githubRepo: string;
  githubBranch: string;
  textbook: string;
  syllabusId: string;
  notes: string;
}

const EMPTY_FORM: CourseForm = {
  id: null,
  name: "",
  courseCode: "",
  term: "",
  canvasUrl: "",
  githubRepo: "",
  githubBranch: "",
  textbook: "",
  syllabusId: "",
  notes: "",
};

function formFromCourse(c: Course): CourseForm {
  return {
    id: c.id,
    name: c.name,
    courseCode: c.courseCode ?? "",
    term: c.term ?? "",
    canvasUrl: c.canvasUrl ?? "",
    githubRepo: c.githubRepo ?? "",
    githubBranch: c.githubBranch ?? "",
    textbook: c.textbook ?? "",
    syllabusId: c.syllabusId ?? "",
    notes: c.notes ?? "",
  };
}

// Download a finalized syllabus (base64 .docx) fetched from the server.
function downloadDocx(base64: string, fileName: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CoursesTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [syllabi, setSyllabi] = useState<FinalizedSyllabusMeta[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CourseForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setState("loading");
    const [c, s] = await Promise.all([listCourseHubAction(), listFinalizedSyllabiAction()]);
    if ("error" in c) {
      setState("error");
      setError(c.error);
      return;
    }
    setCourses(c.courses);
    setSyllabi("error" in s ? [] : s.syllabi);
    setState("idle");
  };

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load();
  }, []);

  const syllabusName = (id: string | null): string | null =>
    id ? syllabi.find((s) => s.id === id)?.name ?? "Linked syllabus" : null;

  const update = (patch: Partial<CourseForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const handleSave = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      setError("Enter a course name.");
      return;
    }
    setSaving(true);
    setError(null);
    const input = {
      name: form.name,
      courseCode: form.courseCode,
      term: form.term,
      canvasUrl: form.canvasUrl,
      githubRepo: form.githubRepo,
      githubBranch: form.githubBranch,
      textbook: form.textbook,
      syllabusId: form.syllabusId,
      notes: form.notes,
    };
    const result = form.id ? await updateCourseHubAction(form.id, input) : await createCourseHubAction(input);
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setForm(null);
    await load();
  };

  const handleDelete = async (c: Course) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    setBusyId(c.id);
    setError(null);
    const result = await deleteCourseHubAction(c.id);
    setBusyId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    await load();
  };

  const handleDownloadSyllabus = async (c: Course) => {
    if (!c.syllabusId) return;
    setBusyId(c.id);
    setError(null);
    const r = await getFinalizedSyllabusAction(c.syllabusId);
    setBusyId(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    downloadDocx(r.syllabus.content, r.syllabus.fileName);
  };

  return (
    <section className={styles.card}>
      <TabHeader
        eyebrow="Courses"
        title="Your courses"
        subtitle="Keep everything for a course in one place — its codebase, syllabus, textbook, and Canvas link."
      />

      {!form && (
        <div className={styles.adaptActionBar} style={{ marginTop: 0 }}>
          <Button variant="contained" size="small" onClick={() => setForm({ ...EMPTY_FORM })}>
            New course
          </Button>
        </div>
      )}

      {error && !form && <p className={styles.error}>{error}</p>}

      {/* Create / edit form */}
      {form && (
        <div className={styles.adaptPanel}>
          <div className={styles.adaptPanelHeader}>
            <p className={styles.adaptPanelTitle}>{form.id ? "Edit course" : "New course"}</p>
            <p className={styles.adaptPanelSubtitle}>Link the resources that belong to this course. Only the name is required.</p>
          </div>

          <TextField
            label="Course name"
            size="small"
            fullWidth
            required
            placeholder="e.g. Database Management"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
          />

          <div className={styles.adaptFieldGrid2}>
            <TextField
              label="Course code"
              size="small"
              fullWidth
              placeholder="e.g. BIT270"
              value={form.courseCode}
              onChange={(e) => update({ courseCode: e.target.value })}
            />
            <TextField
              label="Term"
              size="small"
              fullWidth
              placeholder="e.g. Fall 2026"
              value={form.term}
              onChange={(e) => update({ term: e.target.value })}
            />
          </div>

          <TextField
            label="Canvas course URL"
            size="small"
            fullWidth
            placeholder="https://canvas.../courses/123"
            value={form.canvasUrl}
            onChange={(e) => update({ canvasUrl: e.target.value })}
          />

          <div className={styles.field}>
            <label>Course codebase (GitHub)</label>
            <GithubRepoPicker
              value={form.githubRepo}
              onChange={(v) => update({ githubRepo: v })}
              branch={form.githubBranch}
              onBranchChange={(v) => update({ githubBranch: v })}
            />
          </div>

          <TextField
            label="Syllabus"
            select
            size="small"
            fullWidth
            value={form.syllabusId}
            onChange={(e) => update({ syllabusId: e.target.value })}
            helperText={syllabi.length === 0 ? "Build and save a syllabus in New Build Courses to link one here." : undefined}
          >
            <MenuItem value="">No syllabus linked</MenuItem>
            {syllabi.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Textbook / required materials"
            size="small"
            fullWidth
            multiline
            minRows={2}
            placeholder="Title, author, edition, ISBN…"
            value={form.textbook}
            onChange={(e) => update({ textbook: e.target.value })}
          />

          <TextField
            label="Notes"
            size="small"
            fullWidth
            multiline
            minRows={2}
            placeholder="Anything else worth keeping with this course."
            value={form.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.adaptActionBar} style={{ marginTop: 0 }}>
            <Button variant="contained" size="small" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : form.id ? "Save changes" : "Create course"}
            </Button>
            <Button variant="text" size="small" onClick={() => { setForm(null); setError(null); }} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Course list */}
      {state === "loading" && (
        <div className={styles.finalizedLoading}>
          <CircularProgress size={22} />
        </div>
      )}
      {state === "error" && !form && <p className={styles.error}>{error}</p>}
      {state === "idle" && !form && courses.length === 0 && (
        <p className={styles.fieldHint}>No courses yet. Choose &ldquo;New course&rdquo; to bundle your first one.</p>
      )}

      {state === "idle" && courses.length > 0 && (
        <div className={styles.courseGrid}>
          {courses.map((c) => {
            const sName = syllabusName(c.syllabusId);
            return (
              <div key={c.id} className={styles.courseCard}>
                <div className={styles.courseCardHead}>
                  <div style={{ minWidth: 0 }}>
                    <p className={styles.courseCardTitle}>{c.name}</p>
                    {(c.courseCode || c.term) && (
                      <p className={styles.courseCardSub}>
                        {[c.courseCode, c.term].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className={styles.courseCardActions}>
                    <Button variant="outlined" size="small" disabled={busyId === c.id} onClick={() => { setForm(formFromCourse(c)); setError(null); }}>
                      Edit
                    </Button>
                    <Button variant="text" size="small" color="error" disabled={busyId === c.id} onClick={() => handleDelete(c)}>
                      Delete
                    </Button>
                  </div>
                </div>

                <div className={styles.courseResources}>
                  <div className={styles.courseResource}>
                    <span className={styles.courseResourceLabel}>Canvas</span>
                    {c.canvasUrl ? (
                      <a className={styles.courseResourceValue} href={c.canvasUrl} target="_blank" rel="noreferrer">
                        Open course
                      </a>
                    ) : (
                      <span className={styles.courseResourceEmpty}>Not linked</span>
                    )}
                  </div>

                  <div className={styles.courseResource}>
                    <span className={styles.courseResourceLabel}>Codebase</span>
                    {c.githubRepo ? (
                      <a
                        className={styles.courseResourceValue}
                        href={`https://github.com/${c.githubRepo}${c.githubBranch ? `/tree/${c.githubBranch}` : ""}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c.githubRepo}
                        {c.githubBranch ? ` (${c.githubBranch})` : ""}
                      </a>
                    ) : (
                      <span className={styles.courseResourceEmpty}>Not set</span>
                    )}
                  </div>

                  <div className={styles.courseResource}>
                    <span className={styles.courseResourceLabel}>Syllabus</span>
                    {sName ? (
                      <button type="button" className={styles.courseResourceValue} onClick={() => handleDownloadSyllabus(c)} disabled={busyId === c.id}>
                        {busyId === c.id ? "Downloading…" : `${sName} — download`}
                      </button>
                    ) : (
                      <span className={styles.courseResourceEmpty}>Not linked</span>
                    )}
                  </div>

                  <div className={styles.courseResource}>
                    <span className={styles.courseResourceLabel}>Textbook</span>
                    {c.textbook ? (
                      <span className={styles.courseResourceValue}>{c.textbook}</span>
                    ) : (
                      <span className={styles.courseResourceEmpty}>Not set</span>
                    )}
                  </div>
                </div>

                {c.notes && <p className={styles.courseCardSub}>{c.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
