"use client";

// The add/edit course form - ported as-is from CoursesTab (panel, not
// redesigned). Opens above the table from the "New course" button, or from
// a row's "Edit" action.
import { useRef, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import {
  createCourseHubAction,
  createFinalizedSyllabusAction,
  extractTextbookInfoAction,
  listCourseRosterAction,
} from "@/app/actions";
import { updateCourseHubAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import { EMPTY_FORM, type CourseForm, formFromCourse, readFileBase64 } from "@/lib/courses-tab-helpers";
import { getStoredProvider } from "@/lib/llm-provider";
import GithubRepoPicker from "../GithubRepoPicker";
import styles from "../../page.module.css";

export interface AddCourseFormProps {
  editing: Course | null;
  institutions: string[];
  orgs: string[];
  syllabi: FinalizedSyllabusMeta[];
  onSaved: (course: Course) => void;
  onCancel: () => void;
  onReloadSyllabi: () => Promise<void>;
}

export default function AddCourseForm({ editing, institutions, orgs, syllabi, onSaved, onCancel, onReloadSyllabi }: AddCourseFormProps) {
  const [form, setForm] = useState<CourseForm>(() => (editing ? formFromCourse(editing) : { ...EMPTY_FORM }));
  const [formNote, setFormNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false);
  const [extractingTextbook, setExtractingTextbook] = useState(false);
  const [fetchingRoster, setFetchingRoster] = useState(false);
  const syllabusUploadRef = useRef<HTMLInputElement>(null);
  const textbookPhotoRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<CourseForm>) => setForm((f) => ({ ...f, ...patch }));
  const updateRepo = (i: number, patch: Partial<{ repo: string; branch: string }>) =>
    setForm((f) => ({ ...f, repos: f.repos.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const addRepo = () => setForm((f) => ({ ...f, repos: [...f.repos, { repo: "", branch: "" }] }));
  const removeRepo = (i: number) => setForm((f) => ({ ...f, repos: f.repos.filter((_, idx) => idx !== i) }));

  const updateIntegration = (i: number, patch: Partial<{ name: string; url: string }>) =>
    setForm((f) => ({ ...f, integrations: f.integrations.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) }));
  const addIntegration = () => setForm((f) => ({ ...f, integrations: [...f.integrations, { name: "", url: "" }] }));
  const removeIntegration = (i: number) => setForm((f) => ({ ...f, integrations: f.integrations.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
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
      integrations: form.integrations.map((i) => ({ name: i.name, url: i.url.trim() || null })),
      roster: form.roster,
      notes: form.notes,
      topics: form.topics,
      startDate: form.startDate,
      description: form.description,
      weeks: form.weeks.trim() ? (Number.isFinite(Number(form.weeks.trim())) ? Number(form.weeks.trim()) : null) : null,
      tests: form.tests.trim() ? (Number.isFinite(Number(form.tests.trim())) ? Number(form.tests.trim()) : null) : null,
      lms: form.lms,
      dayTime: form.dayTime,
      modality: form.modality,
    };
    const result = form.id ? await updateCourseHubAction(form.id, input) : await createCourseHubAction(input);
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSaved(result.course);
  };

  const handleUploadSyllabus = async (file: File) => {
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
      await onReloadSyllabi();
      update({ syllabusId: r.syllabus.id });
      setFormNote(`Uploaded and linked "${r.syllabus.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the syllabus.");
    } finally {
      setUploadingSyllabus(false);
    }
  };

  const handleTextbookPhotos = async (files: File[]) => {
    if (files.length === 0) return;
    setExtractingTextbook(true);
    setError(null);
    setFormNote(null);
    try {
      const images = await Promise.all(files.map(async (f) => ({ base64: await readFileBase64(f), mimeType: f.type || "image/png" })));
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

  const handleFetchRoster = async () => {
    const match = form.canvasUrl.match(/\/courses\/(\d+)/);
    const inst = form.institution.trim();
    if (!match || !inst) {
      setError("Set the Canvas course URL and institution first.");
      return;
    }
    setFetchingRoster(true);
    setError(null);
    setFormNote(null);
    const r = await listCourseRosterAction(inst, match[1]);
    setFetchingRoster(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    const lines = r.students.map((s) => s.sortableName || s.name).map((s) => s.trim()).filter(Boolean);
    update({ roster: lines.join("\n") });
    setFormNote(`Fetched ${lines.length} student${lines.length === 1 ? "" : "s"} from Canvas.`);
  };

  return (
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
        <TextField label="Course code" size="small" fullWidth placeholder="e.g. BIT270" value={form.courseCode} onChange={(e) => update({ courseCode: e.target.value })} />
        <TextField label="Term" size="small" fullWidth placeholder="e.g. Fall 2026" value={form.term} onChange={(e) => update({ term: e.target.value })} />
        <TextField
          label="Start date"
          size="small"
          fullWidth
          type="date"
          value={form.startDate}
          onChange={(e) => update({ startDate: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </div>

      <TextField
        label="Description"
        size="small"
        fullWidth
        multiline
        minRows={2}
        placeholder="Course overview, learning objectives, etc."
        value={form.description}
        onChange={(e) => update({ description: e.target.value })}
      />

      <div className={styles.adaptFieldGrid3}>
        <TextField label="Weeks" size="small" fullWidth type="number" value={form.weeks} onChange={(e) => update({ weeks: e.target.value })} />
        <TextField label="Tests" size="small" fullWidth type="number" value={form.tests} onChange={(e) => update({ tests: e.target.value })} />
        <TextField label="Day/Time" size="small" fullWidth placeholder="MW 10:00-11:15" value={form.dayTime} onChange={(e) => update({ dayTime: e.target.value })} />
      </div>

      <div className={styles.adaptFieldGrid3}>
        <TextField select label="LMS" size="small" fullWidth value={form.lms} onChange={(e) => update({ lms: e.target.value })}>
          <MenuItem value="">Not set</MenuItem>
          <MenuItem value="canvas">Canvas</MenuItem>
          <MenuItem value="blackboard">Blackboard</MenuItem>
        </TextField>
        <TextField select label="Modality" size="small" fullWidth value={form.modality} onChange={(e) => update({ modality: e.target.value })}>
          <MenuItem value="">Not set</MenuItem>
          <MenuItem value="async">Asynchronous</MenuItem>
          <MenuItem value="sync">Synchronous</MenuItem>
        </TextField>
      </div>

      <div className={styles.adaptFieldGrid3}>
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
              <GithubRepoPicker value={r.repo} onChange={(v) => updateRepo(i, { repo: v })} branch={r.branch} onBranchChange={(v) => updateRepo(i, { branch: v })} />
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
          <TextField select size="small" fullWidth value={form.syllabusId} onChange={(e) => update({ syllabusId: e.target.value })}>
            <MenuItem value="">No syllabus linked</MenuItem>
            {syllabi.map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" size="small" disabled={uploadingSyllabus} onClick={() => syllabusUploadRef.current?.click()}>
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
          <Button variant="outlined" size="small" disabled={extractingTextbook} onClick={() => textbookPhotoRef.current?.click()}>
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

      <div className={styles.field}>
        <label>Roster</label>
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={3}
          placeholder="One student per line. Add a GitHub username with a pipe: Smith, John | jsmith-gh"
          value={form.roster}
          onChange={(e) => update({ roster: e.target.value })}
        />
        <div>
          <Button variant="outlined" size="small" disabled={fetchingRoster} onClick={() => void handleFetchRoster()}>
            {fetchingRoster ? "Fetching…" : "Fetch from Canvas"}
          </Button>
        </div>
        <p className={styles.fieldHint}>Fetching replaces the list with the course&apos;s Canvas enrollment (Last, First per line). Append | github-username to a line to link that student&apos;s GitHub account.</p>
      </div>

      <div className={styles.field}>
        <label>Topics</label>
        <TextField size="small" fullWidth multiline minRows={3} placeholder="One topic per line." value={form.topics} onChange={(e) => update({ topics: e.target.value })} />
        <p className={styles.fieldHint}>One topic per line. Used to describe what the course covers.</p>
      </div>

      <div className={styles.field}>
        <label>Integrations</label>
        {form.integrations.length === 0 && <p className={styles.fieldHint}>No integrations linked yet (e.g. Cengage, McGraw-Hill Connect, Pearson).</p>}
        {form.integrations.map((it, i) => (
          <div key={i} className={styles.courseRepoRow}>
            <TextField size="small" label="Name" placeholder="e.g. Cengage" value={it.name} onChange={(e) => updateIntegration(i, { name: e.target.value })} sx={{ flex: "0 0 200px" }} />
            <TextField size="small" fullWidth label="Link" placeholder="https://…" value={it.url} onChange={(e) => updateIntegration(i, { url: e.target.value })} sx={{ flex: 1 }} />
            <Button variant="text" size="small" color="error" onClick={() => removeIntegration(i)} title="Remove this integration">
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button variant="outlined" size="small" onClick={addIntegration}>
            Add integration
          </Button>
        </div>
      </div>

      <TextField label="Notes" size="small" fullWidth multiline minRows={2} placeholder="Anything else worth keeping with this course." value={form.notes} onChange={(e) => update({ notes: e.target.value })} />

      {formNote && <p className={styles.fieldHint}>{formNote}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.adaptActionBar} style={{ marginTop: 0 }}>
        <Button variant="contained" size="small" onClick={() => void handleSave()} disabled={saving || !form.name.trim()}>
          {saving ? "Saving…" : form.id ? "Save changes" : "Create course"}
        </Button>
        <Button variant="text" size="small" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
