"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import CircularProgress from "@mui/material/CircularProgress";
import {
  listCourseHubAction,
  createCourseHubAction,
  updateCourseHubAction,
  deleteCourseHubAction,
  listFinalizedSyllabiAction,
  getFinalizedSyllabusAction,
  previewFinalizedSyllabusAction,
  createFinalizedSyllabusAction,
  extractTextbookInfoAction,
  listMyOrgsAction,
} from "../actions";
import type { Course } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import GithubRepoPicker from "./GithubRepoPicker";
import TabHeader from "./TabHeader";
import SyllabusPreviewModal, { type SyllabusPreviewPara } from "./SyllabusPreviewModal";
import { getStoredProvider } from "@/lib/llm-provider";
import { useInstitutions } from "@/lib/institutions";
import { setCourseHandoff } from "@/lib/course-handoff";
import styles from "../page.module.css";

// The editable form state (all strings; "" means "not set").
interface CourseForm {
  id: string | null;
  name: string;
  courseCode: string;
  term: string;
  institution: string;
  canvasUrl: string;
  repos: Array<{ repo: string; branch: string }>;
  githubOrg: string;
  textbook: string;
  syllabusId: string;
  notes: string;
}

const EMPTY_FORM: CourseForm = {
  id: null,
  name: "",
  courseCode: "",
  term: "",
  institution: "",
  canvasUrl: "",
  repos: [],
  githubOrg: "",
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
    institution: c.institution ?? "",
    canvasUrl: c.canvasUrl ?? "",
    repos: c.repos.map((r) => ({ repo: r.repo, branch: r.branch ?? "" })),
    githubOrg: c.githubOrg ?? "",
    textbook: c.textbook ?? "",
    syllabusId: c.syllabusId ?? "",
    notes: c.notes ?? "",
  };
}

// Read a File as a bare base64 string (no data: prefix).
function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
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

// Module-level cache of the tab's data, so switching away and back does not
// refetch or flash a spinner. Survives unmount/remount within the session; a
// silent background revalidate keeps it fresh, and mutations update it in place.
let hubCache: { courses: Course[]; syllabi: FinalizedSyllabusMeta[]; orgs: string[] } | null = null;

export default function CoursesTab({ onNavigate }: { onNavigate: (tab: "course-planning" | "version-control") => void }) {
  const institutions = useInstitutions();
  const [courses, setCourses] = useState<Course[]>(() => hubCache?.courses ?? []);
  const [syllabi, setSyllabi] = useState<FinalizedSyllabusMeta[]>(() => hubCache?.syllabi ?? []);
  const [orgs, setOrgs] = useState<string[]>(() => hubCache?.orgs ?? []);
  const [state, setState] = useState<"loading" | "idle" | "error">(hubCache ? "idle" : "loading");
  const [refreshing, setRefreshing] = useState(false);
  const [filterInstitution, setFilterInstitution] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CourseForm | null>(null);
  const [formNote, setFormNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false);
  const [extractingTextbook, setExtractingTextbook] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; paragraphs: SyllabusPreviewPara[] } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const syllabusUploadRef = useRef<HTMLInputElement>(null);
  const textbookPhotoRef = useRef<HTMLInputElement>(null);

  // Fetch everything and refresh the cache. `silent` skips the blocking spinner
  // (used for background revalidation and post-mutation refreshes).
  const load = async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setState("loading");
    const [c, s, o] = await Promise.all([listCourseHubAction(), listFinalizedSyllabiAction(), listMyOrgsAction()]);
    if ("error" in c) {
      setRefreshing(false);
      if (!opts?.silent) {
        setState("error");
        setError(c.error);
      }
      return;
    }
    const next = {
      courses: c.courses,
      syllabi: "error" in s ? [] : s.syllabi,
      orgs: "error" in o ? [] : o.orgs,
    };
    hubCache = next;
    setCourses(next.courses);
    setSyllabi(next.syllabi);
    setOrgs(next.orgs);
    setState("idle");
    setRefreshing(false);
  };

  useEffect(() => {
    // On first ever mount, load with a spinner. On later mounts (cache present),
    // show cached data instantly and revalidate silently in the background.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load({ silent: hubCache != null });
  }, []);

  const reloadSyllabi = async () => {
    const s = await listFinalizedSyllabiAction();
    if (!("error" in s)) {
      setSyllabi(s.syllabi);
      if (hubCache) hubCache = { ...hubCache, syllabi: s.syllabi };
    }
  };

  const syllabusName = (id: string | null): string | null =>
    id ? syllabi.find((s) => s.id === id)?.name ?? "Linked syllabus" : null;

  const update = (patch: Partial<CourseForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const updateRepo = (i: number, patch: Partial<{ repo: string; branch: string }>) =>
    setForm((f) => (f ? { ...f, repos: f.repos.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) } : f));
  const addRepo = () => setForm((f) => (f ? { ...f, repos: [...f.repos, { repo: "", branch: "" }] } : f));
  const removeRepo = (i: number) => setForm((f) => (f ? { ...f, repos: f.repos.filter((_, idx) => idx !== i) } : f));

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
      institution: form.institution,
      canvasUrl: form.canvasUrl,
      repos: form.repos.map((r) => ({ repo: r.repo, branch: r.branch.trim() || null })),
      githubOrg: form.githubOrg,
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
    setFormNote(null);
    await load({ silent: true });
  };

  // Upload a .docx straight onto the course: save it to the finalized library
  // and link it.
  const handleUploadSyllabus = async (file: File) => {
    if (!form) return;
    if (!/\.docx$/i.test(file.name)) {
      setError("The syllabus must be a Word .docx file.");
      return;
    }
    setUploadingSyllabus(true);
    setError(null);
    setFormNote(null);
    try {
      const base64 = await readFileBase64(file);
      const name = form.name.trim() ? `${form.name.trim()} syllabus` : file.name.replace(/\.docx$/i, "");
      const r = await createFinalizedSyllabusAction(name, file.name, base64, form.courseCode.trim() || undefined);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      await reloadSyllabi();
      update({ syllabusId: r.syllabus.id });
      setFormNote(`Uploaded and linked "${r.syllabus.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the syllabus.");
    } finally {
      setUploadingSyllabus(false);
    }
  };

  // Extract textbook details from uploaded photos and fill the textbook field.
  const handleTextbookPhotos = async (files: File[]) => {
    if (!form || files.length === 0) return;
    setExtractingTextbook(true);
    setError(null);
    setFormNote(null);
    try {
      const images = await Promise.all(
        files.map(async (f) => ({ base64: await readFileBase64(f), mimeType: f.type || "image/png" }))
      );
      const r = await extractTextbookInfoAction(images, getStoredProvider());
      if ("error" in r) {
        setError(r.error);
        return;
      }
      if (!r.text.trim()) {
        setFormNote("No textbook details were found in that image.");
        return;
      }
      update({ textbook: form.textbook.trim() ? `${form.textbook.trim()}\n\n${r.text}` : r.text });
      setFormNote("Added textbook details from the photo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the textbook image.");
    } finally {
      setExtractingTextbook(false);
    }
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
    await load({ silent: true });
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

  const handlePreviewSyllabus = async (c: Course) => {
    if (!c.syllabusId) return;
    setPreviewId(c.id);
    setError(null);
    const r = await previewFinalizedSyllabusAction(c.syllabusId);
    setPreviewId(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setPreview({ name: r.name, paragraphs: r.paragraphs });
  };

  // Hand this course's fields to another tab and switch to it.
  const openInSyllabus = (c: Course) => {
    const primary = c.repos[0];
    setCourseHandoff({
      target: "syllabus",
      name: c.name,
      courseCode: c.courseCode ?? undefined,
      term: c.term ?? undefined,
      institution: c.institution ?? undefined,
      textbook: c.textbook ?? undefined,
      repo: primary?.repo,
      branch: primary?.branch ?? undefined,
    });
    onNavigate("course-planning");
  };

  const openInVersionControl = (c: Course) => {
    const primary = c.repos[0];
    setCourseHandoff({
      target: "version-control",
      githubOrg: c.githubOrg ?? undefined,
      repo: primary?.repo,
      branch: primary?.branch ?? undefined,
    });
    onNavigate("version-control");
  };

  // Courses filtered by the institution dropdown, then grouped by institution
  // (courses without one sort last).
  const visibleCourses = (filterInstitution ? courses.filter((c) => (c.institution ?? "") === filterInstitution) : courses)
    .slice()
    .sort((a, b) => {
      const ai = a.institution ?? "";
      const bi = b.institution ?? "";
      if (ai === bi) return 0;
      if (!ai) return 1;
      if (!bi) return -1;
      return ai.localeCompare(bi);
    });

  return (
    <section className={styles.card}>
      <TabHeader
        eyebrow="Courses"
        title="Your courses"
        subtitle="Keep everything for a course in one place — its codebases, syllabus, textbook, organization, and Canvas link."
      />

      {!form && (
        <div className={styles.adaptActionBar} style={{ marginTop: 0 }}>
          <Button variant="contained" size="small" onClick={() => { setForm({ ...EMPTY_FORM }); setFormNote(null); setError(null); }}>
            New course
          </Button>
          <Button variant="text" size="small" onClick={() => void load({ silent: true })} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          {institutions.length > 0 && courses.length > 0 && (
            <TextField
              select
              size="small"
              label="Institution"
              value={filterInstitution}
              onChange={(e) => setFilterInstitution(e.target.value)}
              sx={{ minWidth: 190, marginLeft: "auto" }}
            >
              <MenuItem value="">All institutions</MenuItem>
              {institutions.map((i) => (
                <MenuItem key={i} value={i}>
                  {i}
                </MenuItem>
              ))}
            </TextField>
          )}
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

          <div className={styles.adaptFieldGrid3}>
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
            <Autocomplete
              freeSolo
              options={institutions}
              value={form.institution}
              onInputChange={(_, v) => update({ institution: v })}
              size="small"
              fullWidth
              renderInput={(params) => <TextField {...params} label="Institution" placeholder="e.g. MCC" />}
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
            <label>Organization (GitHub)</label>
            <Autocomplete
              freeSolo
              options={orgs}
              value={form.githubOrg}
              onInputChange={(_, v) => update({ githubOrg: v })}
              size="small"
              fullWidth
              renderInput={(params) => <TextField {...params} placeholder="e.g. my-university-org" />}
            />
          </div>

          <div className={styles.field}>
            <label>Course codebases (GitHub)</label>
            {form.repos.length === 0 && <p className={styles.fieldHint}>No repositories linked yet.</p>}
            {form.repos.map((r, i) => (
              <div key={i} className={styles.courseRepoRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <GithubRepoPicker
                    value={r.repo}
                    onChange={(v) => updateRepo(i, { repo: v })}
                    branch={r.branch}
                    onBranchChange={(v) => updateRepo(i, { branch: v })}
                  />
                </div>
                <Button variant="text" size="small" color="error" onClick={() => removeRepo(i)} title="Remove this repository">
                  Remove
                </Button>
              </div>
            ))}
            <div>
              <Button variant="outlined" size="small" onClick={addRepo}>
                Add repository
              </Button>
            </div>
          </div>

          <div className={styles.field}>
            <label>Syllabus</label>
            <div className={styles.courseRepoRow}>
              <TextField
                select
                size="small"
                fullWidth
                value={form.syllabusId}
                onChange={(e) => update({ syllabusId: e.target.value })}
              >
                <MenuItem value="">No syllabus linked</MenuItem>
                {syllabi.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined"
                size="small"
                disabled={uploadingSyllabus}
                onClick={() => syllabusUploadRef.current?.click()}
              >
                {uploadingSyllabus ? "Uploading…" : "Upload .docx"}
              </Button>
              <input
                ref={syllabusUploadRef}
                type="file"
                accept=".docx"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadSyllabus(f);
                  e.target.value = "";
                }}
              />
            </div>
            <p className={styles.fieldHint}>Pick a saved syllabus, or upload a .docx to save and link it here.</p>
          </div>

          <div className={styles.field}>
            <label>Textbook / required materials</label>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              placeholder="Title, author, edition, ISBN…"
              value={form.textbook}
              onChange={(e) => update({ textbook: e.target.value })}
            />
            <div>
              <Button
                variant="outlined"
                size="small"
                disabled={extractingTextbook}
                onClick={() => textbookPhotoRef.current?.click()}
              >
                {extractingTextbook ? "Reading photo…" : "Extract from photo"}
              </Button>
              <input
                ref={textbookPhotoRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) void handleTextbookPhotos(files);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

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

          {formNote && <p className={styles.fieldHint}>{formNote}</p>}
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.adaptActionBar} style={{ marginTop: 0 }}>
            <Button variant="contained" size="small" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : form.id ? "Save changes" : "Create course"}
            </Button>
            <Button variant="text" size="small" onClick={() => { setForm(null); setError(null); setFormNote(null); }} disabled={saving}>
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
      {state === "idle" && !form && courses.length > 0 && visibleCourses.length === 0 && (
        <p className={styles.fieldHint}>No courses for {filterInstitution}.</p>
      )}

      {state === "idle" && visibleCourses.length > 0 && (
        <div className={styles.courseGrid}>
          {visibleCourses.map((c) => {
            const sName = syllabusName(c.syllabusId);
            return (
              <div key={c.id} className={styles.courseCard}>
                <div className={styles.courseCardHead}>
                  <div style={{ minWidth: 0 }}>
                    <p className={styles.courseCardTitle}>{c.name}</p>
                    {(c.courseCode || c.term || c.institution) && (
                      <p className={styles.courseCardSub}>{[c.institution, c.courseCode, c.term].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                  <div className={styles.courseCardActions}>
                    <Button variant="outlined" size="small" disabled={busyId === c.id} onClick={() => { setForm(formFromCourse(c)); setError(null); setFormNote(null); }}>
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
                    <span className={styles.courseResourceLabel}>Organization</span>
                    {c.githubOrg ? (
                      <a className={styles.courseResourceValue} href={`https://github.com/${c.githubOrg}`} target="_blank" rel="noreferrer">
                        {c.githubOrg}
                      </a>
                    ) : (
                      <span className={styles.courseResourceEmpty}>Not set</span>
                    )}
                  </div>

                  <div className={styles.courseResource}>
                    <span className={styles.courseResourceLabel}>Codebase{c.repos.length > 1 ? "s" : ""}</span>
                    {c.repos.length > 0 ? (
                      c.repos.map((r, i) => (
                        <a
                          key={i}
                          className={styles.courseResourceValue}
                          href={`https://github.com/${r.repo}${r.branch ? `/tree/${r.branch}` : ""}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.repo}
                          {r.branch ? ` (${r.branch})` : ""}
                        </a>
                      ))
                    ) : (
                      <span className={styles.courseResourceEmpty}>Not set</span>
                    )}
                  </div>

                  <div className={styles.courseResource}>
                    <span className={styles.courseResourceLabel}>Syllabus</span>
                    {sName ? (
                      <>
                        <span className={styles.courseResourceValue}>{sName}</span>
                        <div className={styles.courseResourceActions}>
                          <button type="button" className={styles.linkButton} onClick={() => handlePreviewSyllabus(c)} disabled={previewId === c.id}>
                            {previewId === c.id ? "Opening…" : "Preview"}
                          </button>
                          <button type="button" className={styles.linkButton} onClick={() => handleDownloadSyllabus(c)} disabled={busyId === c.id}>
                            {busyId === c.id ? "Downloading…" : "Download"}
                          </button>
                        </div>
                      </>
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

                <div className={styles.courseOpenBar}>
                  <span className={styles.courseResourceLabel}>Open in</span>
                  <button type="button" className={styles.linkButton} onClick={() => openInSyllabus(c)}>
                    Syllabus builder
                  </button>
                  <button type="button" className={styles.linkButton} onClick={() => openInVersionControl(c)}>
                    Version control
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview && (
        <SyllabusPreviewModal name={preview.name} paragraphs={preview.paragraphs} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}
