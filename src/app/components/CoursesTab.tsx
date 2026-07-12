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
  getCourseNotificationsAction,
  listCourseRosterAction,
  extractTopicsFromRepoAction,
  listGithubReposAction,
  setCourseMaterialsAction,
  listCoursesAction,
} from "../actions";
import type { Course } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import GithubRepoPicker from "./GithubRepoPicker";
import TabHeader from "./TabHeader";
import SyllabusPreviewModal, { type SyllabusPreviewPara } from "./SyllabusPreviewModal";
import { getStoredProvider } from "@/lib/llm-provider";
import { useInstitutionSelection } from "@/lib/institutions";
import { setCourseHandoff } from "@/lib/course-handoff";
import { useSupabase } from "@/context/SupabaseProvider";
import { uploadCourseZip, getCourseZipUrl, removeCourseZip } from "@/lib/course-files";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import Typeahead from "./ui/Typeahead";
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
  integrations: Array<{ name: string; url: string }>;
  roster: string;
  notes: string;
  topics: string;
  startDate: string;
  lms: string;
}

// Fields that can be edited inline on tiles.
type InlineField = "githubOrg" | "textbook" | "roster" | "repos" | "syllabusId" | "integrations" | "topics" | "csv" | "startDate" | "lms";

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
  integrations: [],
  roster: "",
  notes: "",
  topics: "",
  startDate: "",
  lms: "",
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
    integrations: c.integrations.map((i) => ({ name: i.name, url: i.url ?? "" })),
    roster: c.roster ?? "",
    notes: c.notes ?? "",
    topics: c.topics ?? "",
    startDate: c.startDate ?? "",
    lms: c.lms ?? "",
  };
}

// Map a Course row to the update-action input (used by inline tile saves).
function courseToInput(c: Course) {
  return {
    name: c.name,
    courseCode: c.courseCode ?? "",
    term: c.term ?? "",
    institution: c.institution ?? "",
    canvasUrl: c.canvasUrl ?? "",
    repos: c.repos.map((r) => ({ repo: r.repo, branch: r.branch })),
    githubOrg: c.githubOrg ?? "",
    textbook: c.textbook ?? "",
    syllabusId: c.syllabusId ?? "",
    integrations: c.integrations.map((i) => ({ name: i.name, url: i.url })),
    roster: c.roster ?? "",
    notes: c.notes ?? "",
    topics: c.topics ?? "",
    csvName: c.csvName ?? "",
    csvData: c.csvData ?? "",
    startDate: c.startDate ?? "",
    lms: c.lms ?? "",
  };
}

// Serialization helpers for complex fields.
const reposToText = (c: Course) => c.repos.map((r) => (r.branch ? `${r.repo}#${r.branch}` : r.repo)).join("\n");
const integrationsToText = (c: Course) => c.integrations.map((i) => (i.url ? `${i.name} | ${i.url}` : i.name)).join("\n");
const parseRepoLines = (text: string) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [repo, branch] = l.split("#").map((p) => p.trim());
    return { repo, branch: branch || null };
  }).filter((r) => r.repo);
const parseIntegrationLines = (text: string) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, url] = l.split("|").map((p) => p.trim());
    return { name: name ?? "", url: url || null };
  }).filter((i) => i.name || i.url);

// Count roster lines and how many carry a "| github-username" suffix.
function rosterStats(roster: string): { students: number; withUsernames: number } {
  const lines = roster.split("\n").map((l) => l.trim()).filter(Boolean);
  return { students: lines.length, withUsernames: lines.filter((l) => l.includes("|") && l.split("|").pop()!.trim()).length };
}

// Parse roster text into explicit rows (pipe convention; see rosterStats).
function rosterToRows(text: string): Array<{ student: string; username: string }> {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((row) => {
    const idx = row.lastIndexOf("|");
    if (idx === -1) return { student: row, username: "" };
    return { student: row.slice(0, idx).trim(), username: row.slice(idx + 1).trim() };
  });
}

function rowsToRoster(rows: Array<{ student: string; username: string }>): string {
  return rows
    .filter((r) => r.student.trim() || r.username.trim())
    .map((r) => (r.username.trim() ? `${r.student.trim()} | ${r.username.trim()}` : r.student.trim()))
    .join("\n");
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

// Read a File as text.
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsText(file);
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

// Which institution groups are collapsed, keyed by institution ("__none__" for
// courses without one). Persisted so the layout is stable across visits.
const COLLAPSE_KEY = "ta-courses-collapsed";
const NO_INSTITUTION = "__none__";

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
    </svg>
  );
}

export default function CoursesTab({ onNavigate }: { onNavigate: (tab: "course-planning" | "version-control") => void }) {
  const { institutions, active: activeInstitution } = useInstitutionSelection();
  const { supabase, user } = useSupabase();
  const [courses, setCourses] = useState<Course[]>(() => hubCache?.courses ?? []);
  const [syllabi, setSyllabi] = useState<FinalizedSyllabusMeta[]>(() => hubCache?.syllabi ?? []);
  const [orgs, setOrgs] = useState<string[]>(() => hubCache?.orgs ?? []);
  const [state, setState] = useState<"loading" | "idle" | "error">(hubCache ? "idle" : "loading");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Per-course LMS notification counts, keyed by course id.
  const [notifByCourse, setNotifByCourse] = useState<Record<string, { needsGrading: number; unread: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CourseForm | null>(null);
  const [formNote, setFormNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false);
  const [extractingTextbook, setExtractingTextbook] = useState(false);
  const [fetchingRoster, setFetchingRoster] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; paragraphs: SyllabusPreviewPara[] } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [tileEdit, setTileEdit] = useState<{ id: string; field: InlineField; value: string } | null>(null);
  const [tileSaving, setTileSaving] = useState(false);
  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);
  const [expandedTopicsId, setExpandedTopicsId] = useState<string | null>(null);
  const [topicsExtractOpen, setTopicsExtractOpen] = useState<string | null>(null);
  const [expandedCsvId, setExpandedCsvId] = useState<string | null>(null);
  const [csvRemoveConfirm, setCsvRemoveConfirm] = useState<string | null>(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [ownedRepos, setOwnedRepos] = useState<string[] | null>(null);
  const [ownedReposLoading, setOwnedReposLoading] = useState(false);
  const [topicsRepoSel, setTopicsRepoSel] = useState<Record<string, string>>({});
  const [extractingTopicsId, setExtractingTopicsId] = useState<string | null>(null);
  const [repoAddSel, setRepoAddSel] = useState("");
  const [repoAddBranch, setRepoAddBranch] = useState("");
  const [autoTopicsId, setAutoTopicsId] = useState<string | null>(null);
  const [uploadingMaterials, setUploadingMaterials] = useState(false);
  const [materialsRemoveConfirm, setMaterialsRemoveConfirm] = useState<string | null>(null);
  const [lmsCourseOpts, setLmsCourseOpts] = useState<Array<{ url: string; name: string }> | null>(null);
  const [lmsCourseOptsError, setLmsCourseOptsError] = useState<string | null>(null);
  const [lmsCourseDraft, setLmsCourseDraft] = useState<string | null>(null);
  const syllabusUploadRef = useRef<HTMLInputElement>(null);
  const textbookPhotoRef = useRef<HTMLInputElement>(null);
  const csvUploadRef = useRef<HTMLInputElement>(null);
  const materialsUploadRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    // Restore collapsed institution groups (client-only to avoid SSR mismatch).
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}");
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      if (saved && typeof saved === "object") setCollapsed(saved as Record<string, boolean>);
    } catch {
      /* ignore malformed state */
    }
  }, []);

  // Load the user's GitHub repos once on mount for the topic extraction dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOwnedReposLoading(true);
      const r = await listGithubReposAction();
      if (cancelled) return;
      if (!("error" in r)) {
        const sorted = r.repos.map((repo) => repo.fullName).sort();
        setOwnedRepos(sorted);
      }
      setOwnedReposLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load per-course LMS notification counts for courses that have a Canvas URL
  // and an institution. One targeted fetch per such course, in parallel.
  useEffect(() => {
    const targets = courses.filter((c) => c.canvasUrl && c.institution);
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        targets.map(async (c) => [c.id, await getCourseNotificationsAction(c.canvasUrl as string, c.institution as string)] as const)
      );
      if (cancelled) return;
      const map: Record<string, { needsGrading: number; unread: number }> = {};
      for (const [id, r] of entries) if (!("error" in r)) map[id] = r;
      setNotifByCourse(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [courses]);

  // Load the institution's connected LMS courses while the LMS tile editor is
  // open (await-first so no synchronous setState). Resets live in startTileEdit.
  const lmsEditTileId = tileEdit?.field === "lms" ? tileEdit.id : null;
  useEffect(() => {
    if (!lmsEditTileId) return;
    const institution = courses.find((c) => c.id === lmsEditTileId)?.institution || activeInstitution;
    if (!institution) return;
    let cancelled = false;
    (async () => {
      const result = await listCoursesAction(institution);
      if (cancelled) return;
      if ("error" in result) {
        setLmsCourseOptsError(result.error);
        setLmsCourseOpts([]);
        return;
      }
      // The app stores relative course URLs; server actions resolve the
      // institution's base URL from the acronym (mirrors CoursePicker).
      setLmsCourseOpts(result.courses.map((c) => ({ url: `/courses/${c.id}`, name: c.name })));
      setLmsCourseOptsError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [lmsEditTileId, courses, activeInstitution]);

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      return next;
    });

  const setAllCollapsed = (value: boolean, keys: string[]) =>
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = value;
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      return next;
    });

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

  const updateIntegration = (i: number, patch: Partial<{ name: string; url: string }>) =>
    setForm((f) => (f ? { ...f, integrations: f.integrations.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) } : f));
  const addIntegration = () => setForm((f) => (f ? { ...f, integrations: [...f.integrations, { name: "", url: "" }] } : f));
  const removeIntegration = (i: number) =>
    setForm((f) => (f ? { ...f, integrations: f.integrations.filter((_, idx) => idx !== i) } : f));

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
      integrations: form.integrations.map((i) => ({ name: i.name, url: i.url.trim() || null })),
      roster: form.roster,
      notes: form.notes,
      topics: form.topics,
      startDate: form.startDate,
      lms: form.lms,
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

  const handleFetchRoster = async () => {
    if (!form) return;
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

  const handleCsvUpload = async (c: Course, file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError("CSV is too large (max 2 MB).");
      return;
    }
    setUploadingCsv(true);
    setError(null);
    try {
      const text = await readFileText(file);
      const r = await updateCourseHubAction(c.id, { ...courseToInput(c), csvName: file.name, csvData: text });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setCourses((prev) => {
        const next = prev.map((course) => (course.id === r.course.id ? r.course : course));
        if (hubCache) hubCache = { ...hubCache, courses: next };
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the CSV file.");
    } finally {
      setUploadingCsv(false);
    }
  };

  const handleMaterialsUpload = async (c: Course, file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      setError("Zip is too large (max 50 MB).");
      return;
    }
    if (!user) {
      setError("You must be logged in.");
      return;
    }
    setUploadingMaterials(true);
    setError(null);
    try {
      const { path } = await uploadCourseZip(supabase, user.id, c.id, file, c.materialsZipPath ?? null);
      const r = await setCourseMaterialsAction(c.id, {
        materialsZipName: file.name,
        materialsZipPath: path,
        materialsZipSize: file.size,
      });
      if ("error" in r) {
        setError(r.error);
        await removeCourseZip(supabase, path);
        return;
      }
      setCourses((prev) => {
        const updated = prev.map((course) => {
          if (course.id === c.id) {
            return {
              ...course,
              materialsZipName: file.name,
              materialsZipPath: path,
              materialsZipSize: file.size,
            };
          }
          return course;
        });
        if (hubCache) hubCache = { ...hubCache, courses: updated };
        return updated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the materials.");
    } finally {
      setUploadingMaterials(false);
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

  const startTileEdit = (c: Course, field: InlineField) => {
    if (tileEdit && tileEdit.id === c.id && tileEdit.field === field) return;
    setError(null);
    const value =
      field === "repos" ? reposToText(c)
      : field === "integrations" ? integrationsToText(c)
      : field === "syllabusId" ? (c.syllabusId ?? "")
      : field === "topics" ? (c.topics ?? "")
      : field === "csv" ? ""
      : field === "startDate" ? (c.startDate ?? "")
      : field === "lms" ? (c.lms ?? "")
      : ((c[field as Exclude<InlineField, "csv" | "startDate" | "lms">] ?? "") as string);
    setTileEdit({ id: c.id, field, value });
    if (field === "lms") {
      setLmsCourseDraft(null);
      setLmsCourseOpts(null);
      setLmsCourseOptsError(null);
    } else if (field === "repos") {
      setRepoAddSel("");
      setRepoAddBranch("");
    }
  };

  const tileClick = (handler: () => void) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button, input, textarea, select, label")) return;
    handler();
  };

  const saveTileEdit = async () => {
    if (!tileEdit) return;
    const course = courses.find((c) => c.id === tileEdit.id);
    if (!course) return;
    setTileSaving(true);
    setError(null);
    const patch =
      tileEdit.field === "repos" ? { repos: parseRepoLines(tileEdit.value) }
      : tileEdit.field === "integrations" ? { integrations: parseIntegrationLines(tileEdit.value) }
      : tileEdit.field === "topics" ? { topics: tileEdit.value }
      : tileEdit.field === "lms" ? {
        lms: tileEdit.value || null,
        ...(lmsCourseDraft !== null ? { canvasUrl: lmsCourseDraft || null } : {}),
      }
      : { [tileEdit.field]: tileEdit.value };
    const r = await updateCourseHubAction(course.id, { ...courseToInput(course), ...patch });
    setTileSaving(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    // Update courses state with the saved course
    const savedCourse = r.course;
    setCourses((prev) => {
      const next = prev.map((c) => (c.id === savedCourse.id ? savedCourse : c));
      if (hubCache) hubCache = { ...hubCache, courses: next };
      return next;
    });
    setTileEdit(null);
    setRepoAddSel("");
    setRepoAddBranch("");
    setLmsCourseDraft(null);

    // Feature 2: After successful save of repos, extract topics from the repo the user just linked
    if (tileEdit.field === "repos" && patch.repos && patch.repos.length > 0) {
      // Extract from the repo the user just linked, not the tile's first repo; fall back to the last listed repo when nothing new was added.
      const prevRepos = new Set(course.repos.map((x) => x.repo.toLowerCase()));
      const added = patch.repos.filter((x) => !prevRepos.has(x.repo.toLowerCase()));
      const extractRepo = (added.length > 0 ? added[added.length - 1] : patch.repos[patch.repos.length - 1]).repo;
      const topicsEmpty = !savedCourse.topics || savedCourse.topics.trim() === "";
      // A newly linked repo re-extracts and replaces the topics so they always describe the repo just linked; a repos edit that adds nothing new only fills topics when they are empty.
      if (added.length > 0 || topicsEmpty) {
        // Start background extraction without blocking the save
        void (async () => {
          setAutoTopicsId(savedCourse.id);
          const extractResult = await extractTopicsFromRepoAction(extractRepo, getStoredProvider());
          if ("error" in extractResult) {
            setError(extractResult.error);
            setAutoTopicsId(null);
            return;
          }
          // Build update input from the saved course with extracted topics
          const topicsText = extractResult.topics.join("\n");
          const updatedInput = {
            ...courseToInput(savedCourse),
            repos: savedCourse.repos,
            topics: topicsText,
          };
          const updateResult = await updateCourseHubAction(savedCourse.id, updatedInput);
          if ("error" in updateResult) {
            setError(updateResult.error);
            setAutoTopicsId(null);
            return;
          }
          // Update courses state with the new topics
          setCourses((prev) => {
            const next = prev.map((c) => (c.id === updateResult.course.id ? updateResult.course : c));
            if (hubCache) hubCache = { ...hubCache, courses: next };
            return next;
          });
          setAutoTopicsId(null);
          setError(`Topics extracted from ${extractRepo}.`);
        })();
      }
    }
  };

  // A course's total outstanding LMS notifications (unread inbox + needs grading).
  const courseNotifTotal = (c: Course): number => {
    const n = notifByCourse[c.id];
    return n ? n.needsGrading + n.unread : 0;
  };

  // Click outside the currently-editing tile to cancel editing.
  useEffect(() => {
    if (!tileEdit) return;
    const onDown = (e: MouseEvent) => {
      // MUI select menus render in a body-level portal, outside the tile - do
      // not treat picking an option as clicking away.
      const el = e.target as HTMLElement;
      if (el.closest('[data-tile-editing="true"], .MuiPopover-root, .MuiMenu-root, [role="listbox"]')) return;
      setTileEdit(null);
      // Clear repo add states when closing the editor
      if (tileEdit.field === "repos") {
        setRepoAddSel("");
        setRepoAddBranch("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [tileEdit]);

  // Render the inline tile editor (input + save/cancel).
  const tileEditor = (multiline: boolean, placeholder: string, hint?: string) =>
    tileEdit && (
      <div className={styles.tileEditor}>
        <TextField
          size="small"
          fullWidth
          multiline={multiline}
          minRows={multiline ? 3 : undefined}
          placeholder={placeholder}
          value={tileEdit.value}
          onChange={(e) => setTileEdit((t) => (t ? { ...t, value: e.target.value } : t))}
          autoFocus
        />
        {hint && <p className={styles.fieldHint} style={{ margin: 0 }}>{hint}</p>}
        <div className={styles.tileEditorActions}>
          <Button variant="contained" size="small" disabled={tileSaving} onClick={() => void saveTileEdit()}>
            {tileSaving ? "Saving…" : "Save"}
          </Button>
          <Button variant="text" size="small" disabled={tileSaving} onClick={() => setTileEdit(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );

  // Render the inline syllabus editor (select + save/cancel).
  const tileSyllabusEditor = () =>
    tileEdit && (
      <div className={styles.tileEditor}>
        <TextField select size="small" fullWidth value={tileEdit.value}
          onChange={(e) => setTileEdit((t) => (t ? { ...t, value: e.target.value } : t))}>
          <MenuItem value="">No syllabus linked</MenuItem>
          {syllabi.map((s) => (
            <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
          ))}
        </TextField>
        <div className={styles.tileEditorActions}>
          <Button variant="contained" size="small" disabled={tileSaving} onClick={() => void saveTileEdit()}>
            {tileSaving ? "Saving…" : "Save"}
          </Button>
          <Button variant="text" size="small" disabled={tileSaving} onClick={() => setTileEdit(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );

  // Render the inline date editor (date picker + save/cancel).
  const tileDateEditor = () =>
    tileEdit && (
      <div className={styles.tileEditor}>
        <TextField
          size="small"
          fullWidth
          type="date"
          value={tileEdit.value}
          onChange={(e) => setTileEdit((t) => (t ? { ...t, value: e.target.value } : t))}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <div className={styles.tileEditorActions}>
          <Button variant="contained" size="small" disabled={tileSaving} onClick={() => void saveTileEdit()}>
            {tileSaving ? "Saving…" : "Save"}
          </Button>
          <Button variant="text" size="small" disabled={tileSaving} onClick={() => setTileEdit(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );

  // Render the inline LMS editor (select + save/cancel).
  const tileLmsEditor = () => {
    if (!tileEdit) return null;
    const editingCourse = courses.find((c) => c.id === tileEdit.id);
    if (!editingCourse) return null;

    const institution = editingCourse.institution || activeInstitution;
    const typeaheadOpts = (lmsCourseOpts ?? []).map((opt) => ({ value: opt.url, label: opt.name }));
    // Match the draft/current URL to an option by course id (stored URLs may be
    // absolute while options are relative); otherwise show the raw value.
    const rawUrl = lmsCourseDraft ?? (editingCourse.canvasUrl ?? "");
    const currentId = rawUrl ? parseCanvasCourseId(rawUrl) : null;
    const matched = currentId ? typeaheadOpts.find((opt) => opt.value === `/courses/${currentId}`) : undefined;
    const currentUrl = matched ? matched.value : rawUrl;

    if (currentUrl && !matched && !typeaheadOpts.some((opt) => opt.value === currentUrl)) {
      typeaheadOpts.push({ value: currentUrl, label: currentUrl });
    }

    return (
      <div className={styles.tileEditor}>
        <TextField
          select
          size="small"
          fullWidth
          value={tileEdit.value}
          onChange={(e) => setTileEdit((t) => (t ? { ...t, value: e.target.value } : t))}
        >
          <MenuItem value="">Not set</MenuItem>
          <MenuItem value="canvas">Canvas</MenuItem>
          <MenuItem value="blackboard">Blackboard</MenuItem>
        </TextField>
        <p className={styles.fieldHint} style={{ margin: "6px 0 0 0" }}>LMS course (optional)</p>
        {institution ? (
          <>
            <Typeahead
              options={typeaheadOpts}
              value={currentUrl}
              onChange={setLmsCourseDraft}
              placeholder={lmsCourseOpts === null ? "Loading courses..." : "Choose a connected course..."}
              loading={lmsCourseOpts === null}
              noOptionsText="No connected courses"
            />
            {lmsCourseOptsError && <p className={styles.fieldHint} style={{ color: "var(--danger)", margin: "6px 0 0 0" }}>{lmsCourseOptsError}</p>}
          </>
        ) : (
          <p className={styles.fieldHint}>Add an institution to pick a connected course.</p>
        )}
        <div className={styles.tileEditorActions}>
          <Button variant="contained" size="small" disabled={tileSaving} onClick={() => void saveTileEdit()}>
            {tileSaving ? "Saving…" : "Save"}
          </Button>
          <Button variant="text" size="small" disabled={tileSaving} onClick={() => setTileEdit(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  // Render the roster table editor (student/username pairs + save/cancel).
  const rosterTableEditor = () => {
    if (!tileEdit) return null;
    const rows = rosterToRows(tileEdit.value);
    const setRows = (next: Array<{ student: string; username: string }>) =>
      setTileEdit((t) => (t ? { ...t, value: rowsToRoster(next) } : t));
    const update = (i: number, patch: Partial<{ student: string; username: string }>) =>
      setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    return (
      <div className={styles.tileEditor}>
        <div style={{ display: "flex", gap: 6 }}>
          <span className={styles.ghMeta} style={{ flex: 1 }}>Student</span>
          <span className={styles.ghMeta} style={{ width: 150 }}>GitHub username</span>
          <span style={{ width: 24 }} />
        </div>
        <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <TextField size="small" value={r.student} onChange={(e) => update(i, { student: e.target.value })} sx={{ flex: 1 }} placeholder="Smith, John" />
              <TextField size="small" value={r.username} onChange={(e) => update(i, { username: e.target.value })} sx={{ width: 150 }} placeholder="jsmith-gh" />
              <button type="button" className={styles.linkButton} title="Remove student" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} style={{ width: 24, color: "var(--danger)" }}>
                x
              </button>
            </div>
          ))}
          {rows.length === 0 && <p className={styles.fieldHint} style={{ margin: 0 }}>No students yet.</p>}
        </div>
        <div>
          <Button variant="text" size="small" onClick={() => setRows([...rows, { student: "New student", username: "" }])}>
            Add student
          </Button>
        </div>
        <div className={styles.tileEditorActions}>
          <Button variant="contained" size="small" disabled={tileSaving} onClick={() => void saveTileEdit()}>
            {tileSaving ? "Saving…" : "Save"}
          </Button>
          <Button variant="text" size="small" disabled={tileSaving} onClick={() => setTileEdit(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  // Full-text filter across a course's searchable fields.
  const query = search.trim().toLowerCase();
  const matchesQuery = (c: Course): boolean => {
    if (!query) return true;
    const hay = [
      c.name,
      c.courseCode,
      c.term,
      c.institution,
      c.textbook,
      c.notes,
      c.topics,
      c.csvName,
      c.githubOrg,
      ...c.repos.map((r) => r.repo),
      ...c.integrations.map((i) => i.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(query);
  };
  const filteredCourses = courses.filter(matchesQuery);

  // Group the filtered courses by institution; named institutions sort first
  // (alphabetically), courses without one go into a "No institution" group last.
  const groupMap = new Map<string, Course[]>();
  for (const c of filteredCourses) {
    const key = (c.institution ?? "").trim() || NO_INSTITUTION;
    (groupMap.get(key) ?? groupMap.set(key, []).get(key)!).push(c);
  }
  const groups = Array.from(groupMap.entries())
    .map(([key, list]) => ({ key, label: key === NO_INSTITUTION ? "No institution" : key, courses: list }))
    .sort((a, b) => {
      if (a.key === b.key) return 0;
      if (a.key === NO_INSTITUTION) return 1;
      if (b.key === NO_INSTITUTION) return -1;
      return a.label.localeCompare(b.label);
    });
  const groupKeys = groups.map((g) => g.key);
  const allExpanded = groupKeys.length > 0 && groupKeys.every((k) => !collapsed[k]);

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
          {courses.length > 0 && (
            <TextField
              size="small"
              type="search"
              placeholder="Search courses, codes, repos, integrations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: "1 1 220px" }}
            />
          )}
          {!query && groups.length > 1 && (
            <Button variant="text" size="small" onClick={() => setAllCollapsed(allExpanded, groupKeys)}>
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
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

          <div className={styles.adaptFieldGrid3}>
            <TextField
              select
              label="LMS"
              size="small"
              fullWidth
              value={form.lms}
              onChange={(e) => update({ lms: e.target.value })}
            >
              <MenuItem value="">Not set</MenuItem>
              <MenuItem value="canvas">Canvas</MenuItem>
              <MenuItem value="blackboard">Blackboard</MenuItem>
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
              <Button variant="outlined" size="small" disabled={fetchingRoster} onClick={handleFetchRoster}>
                {fetchingRoster ? "Fetching…" : "Fetch from Canvas"}
              </Button>
            </div>
            <p className={styles.fieldHint}>Fetching replaces the list with the course&apos;s Canvas enrollment (Last, First per line). Append | github-username to a line to link that student&apos;s GitHub account.</p>
          </div>

          <div className={styles.field}>
            <label>Topics</label>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={3}
              placeholder="One topic per line."
              value={form.topics}
              onChange={(e) => update({ topics: e.target.value })}
            />
            <p className={styles.fieldHint}>One topic per line. Used to describe what the course covers.</p>
          </div>

          <div className={styles.field}>
            <label>Integrations</label>
            {form.integrations.length === 0 && <p className={styles.fieldHint}>No integrations linked yet (e.g. Cengage, McGraw-Hill Connect, Pearson).</p>}
            {form.integrations.map((it, i) => (
              <div key={i} className={styles.courseRepoRow}>
                <TextField
                  size="small"
                  label="Name"
                  placeholder="e.g. Cengage"
                  value={it.name}
                  onChange={(e) => updateIntegration(i, { name: e.target.value })}
                  sx={{ flex: "0 0 200px" }}
                />
                <TextField
                  size="small"
                  fullWidth
                  label="Link"
                  placeholder="https://…"
                  value={it.url}
                  onChange={(e) => updateIntegration(i, { url: e.target.value })}
                  sx={{ flex: 1 }}
                />
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
      {state === "idle" && !form && courses.length > 0 && filteredCourses.length === 0 && (
        <p className={styles.fieldHint}>No courses match &ldquo;{search.trim()}&rdquo;.</p>
      )}

      {state === "idle" && filteredCourses.length > 0 && (
        <div className={styles.courseGroups}>
          {groups.map((g) => {
            const open = query !== "" || !collapsed[g.key];
            const groupNotif = g.courses.reduce((s, c) => s + courseNotifTotal(c), 0);
            return (
              <div key={g.key} className={styles.courseGroup}>
                <button
                  type="button"
                  className={styles.courseGroupHeader}
                  aria-expanded={open}
                  onClick={() => toggleGroup(g.key)}
                >
                  <span className={styles.courseGroupName}>{g.label}</span>
                  {groupNotif > 0 && <span className={styles.navBadge} title="Outstanding LMS notifications">{groupNotif}</span>}
                  <span className={styles.courseGroupCount}>{g.courses.length}</span>
                </button>
                {open && (
                  <div className={styles.courseGrid}>
                    {g.courses.map((c) => {
                      const sName = syllabusName(c.syllabusId);
                      const notif = notifByCourse[c.id];
                      const notifTotal = notif ? notif.needsGrading + notif.unread : 0;
                      return (
              <div key={c.id} className={styles.courseCard}>
                <div className={styles.courseCardHead}>
                  <div style={{ minWidth: 0 }}>
                    <p className={styles.courseCardTitle}>
                      {c.name}
                      {notifTotal > 0 && <span className={styles.navBadge} style={{ marginLeft: 8 }} title="Outstanding LMS notifications">{notifTotal}</span>}
                    </p>
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
                  <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "githubOrg" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "githubOrg"))}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>Organization</span>
                      <button
                        type="button"
                        className={styles.tileEditBtn}
                        title="Edit"
                        onClick={() => startTileEdit(c, "githubOrg")}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    {tileEdit?.id === c.id && tileEdit?.field === "githubOrg"
                      ? tileEditor(false, "e.g. my-university-org")
                      : c.githubOrg
                        ? (
                          <a className={styles.courseResourceValue} href={`https://github.com/${c.githubOrg}`} target="_blank" rel="noreferrer">
                            {c.githubOrg}
                          </a>
                        )
                        : (
                          <span className={styles.courseResourceEmpty}>Not set</span>
                        )}
                  </div>

                  <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "repos" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "repos"))}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>Codebase{c.repos.length > 1 ? "s" : ""}</span>
                      <button
                        type="button"
                        className={styles.tileEditBtn}
                        title="Edit"
                        onClick={() => startTileEdit(c, "repos")}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    {tileEdit?.id === c.id && tileEdit?.field === "repos" ? (
                      <div className={styles.tileEditor}>
                        <Autocomplete
                          freeSolo
                          options={ownedRepos ?? []}
                          value={repoAddSel}
                          onInputChange={(_, v) => setRepoAddSel(v)}
                          sx={{ width: "100%" }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              size="small"
                              label="Add repository"
                              placeholder="owner/name"
                            />
                          )}
                        />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                          <TextField
                            size="small"
                            label="Branch (optional)"
                            placeholder="main"
                            value={repoAddBranch}
                            onChange={(e) => setRepoAddBranch(e.target.value)}
                            sx={{ width: "160px" }}
                          />
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={!/^[^/\s]+\/[^/\s]+$/.test(repoAddSel.trim())}
                            onClick={() => {
                              const newLine = `${repoAddSel.trim()}${repoAddBranch.trim() ? `#${repoAddBranch.trim()}` : ""}`;
                              const updatedValue = tileEdit.value.trim() ? `${tileEdit.value}\n${newLine}` : newLine;
                              setTileEdit((t) => (t ? { ...t, value: updatedValue } : t));
                              setRepoAddSel("");
                              setRepoAddBranch("");
                            }}
                          >
                            Add
                          </Button>
                        </div>
                        <TextField
                          size="small"
                          fullWidth
                          multiline
                          minRows={3}
                          placeholder="owner/repo#branch"
                          value={tileEdit.value}
                          onChange={(e) => setTileEdit((t) => (t ? { ...t, value: e.target.value } : t))}
                          sx={{ marginTop: 2 }}
                        />
                        <p className={styles.fieldHint} style={{ margin: 0 }}>One repository per line: owner/repo or owner/repo#branch.</p>
                        <div className={styles.tileEditorActions}>
                          <Button variant="contained" size="small" disabled={tileSaving} onClick={() => void saveTileEdit()}>
                            {tileSaving ? "Saving…" : "Save"}
                          </Button>
                          <Button variant="text" size="small" disabled={tileSaving} onClick={() => setTileEdit(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (c.repos.length > 0 ? (
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
                    ))}
                  </div>

                  <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "syllabusId" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "syllabusId"))}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>Syllabus</span>
                      <button
                        type="button"
                        className={styles.tileEditBtn}
                        title="Edit"
                        onClick={() => startTileEdit(c, "syllabusId")}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    {tileEdit?.id === c.id && tileEdit?.field === "syllabusId" ? tileSyllabusEditor() : (sName ? (
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
                    ))}
                  </div>

                  <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "textbook" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "textbook"))}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>Textbook</span>
                      <button
                        type="button"
                        className={styles.tileEditBtn}
                        title="Edit"
                        onClick={() => startTileEdit(c, "textbook")}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    {tileEdit?.id === c.id && tileEdit?.field === "textbook"
                      ? tileEditor(true, "Title, author, edition, ISBN…")
                      : c.textbook
                        ? (
                          <span className={styles.courseResourceValue}>{c.textbook}</span>
                        )
                        : (
                          <span className={styles.courseResourceEmpty}>Not set</span>
                        )}
                  </div>

                  <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "startDate" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "startDate"))}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>Start date</span>
                      <button
                        type="button"
                        className={styles.tileEditBtn}
                        title="Edit"
                        onClick={() => startTileEdit(c, "startDate")}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    {tileEdit?.id === c.id && tileEdit?.field === "startDate"
                      ? tileDateEditor()
                      : c.startDate
                        ? (
                          <span className={styles.courseResourceValue}>{new Date(`${c.startDate}T00:00:00`).toLocaleDateString()}</span>
                        )
                        : (
                          <span className={styles.courseResourceEmpty}>Not set</span>
                        )}
                  </div>

                  <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "lms" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "lms"))}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>LMS</span>
                      <button
                        type="button"
                        className={styles.tileEditBtn}
                        title="Edit"
                        onClick={() => startTileEdit(c, "lms")}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    {tileEdit?.id === c.id && tileEdit?.field === "lms"
                      ? tileLmsEditor()
                      : c.lms
                        ? (
                          <>
                            <span className={styles.courseResourceValue}>{c.lms === "canvas" ? "Canvas" : c.lms === "blackboard" ? "Blackboard" : c.lms}</span>
                            {c.canvasUrl && (
                              c.canvasUrl.startsWith("http") ? (
                                <a className={styles.courseResourceValue} href={c.canvasUrl} target="_blank" rel="noreferrer">Open LMS course</a>
                              ) : (
                                <span className={styles.courseResourceValue}>Course {parseCanvasCourseId(c.canvasUrl)} linked</span>
                              )
                            )}
                          </>
                        )
                        : (
                          <span className={styles.courseResourceEmpty}>Not set</span>
                        )}
                  </div>

                  <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "integrations" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "integrations"))}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>Integration{c.integrations.length > 1 ? "s" : ""}</span>
                      <button
                        type="button"
                        className={styles.tileEditBtn}
                        title="Edit"
                        onClick={() => startTileEdit(c, "integrations")}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    {tileEdit?.id === c.id && tileEdit?.field === "integrations" ? tileEditor(true, "Cengage | https://...", "One per line: Name | link (link optional).") : (c.integrations.length > 0 ? (
                      c.integrations.map((it, i) =>
                        it.url ? (
                          <a key={i} className={styles.courseResourceValue} href={it.url} target="_blank" rel="noreferrer">
                            {it.name || it.url}
                          </a>
                        ) : (
                          <span key={i} className={styles.courseResourceValue}>{it.name}</span>
                        )
                      )
                    ) : (
                      <span className={styles.courseResourceEmpty}>None</span>
                    ))}
                  </div>

                  <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "roster" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "roster"))}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>Roster</span>
                      <button
                        type="button"
                        className={styles.tileEditBtn}
                        title="Edit"
                        onClick={() => startTileEdit(c, "roster")}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    {tileEdit?.id === c.id && tileEdit?.field === "roster"
                      ? rosterTableEditor()
                      : c.roster && c.roster.trim()
                        ? (
                          <>
                            <span className={styles.courseResourceValue}>
                              {(() => { const s = rosterStats(c.roster ?? ""); return `${s.students} students${s.withUsernames > 0 ? ` - ${s.withUsernames} with GitHub usernames` : ""}`; })()}
                            </span>
                            <div className={styles.courseResourceActions}>
                              <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => setExpandedRosterId(expandedRosterId === c.id ? null : c.id)}
                              >
                                {expandedRosterId === c.id ? "Hide" : "View"}
                              </button>
                              <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => void navigator.clipboard.writeText(c.roster ?? "")}
                              >
                                Copy
                              </button>
                            </div>
                            {expandedRosterId === c.id && (
                              <div className={styles.rosterPreview}>
                                {(c.roster ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => (
                                  <div key={i}>{l}</div>
                                ))}
                              </div>
                            )}
                          </>
                        )
                        : (
                          <span className={styles.courseResourceEmpty}>Not set</span>
                        )}
                  </div>

                  <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "topics" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "topics"))}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>Topics</span>
                      {autoTopicsId === c.id && (
                        <span className={styles.fieldHint} style={{ margin: 0, marginLeft: 8 }}>Extracting topics from the codebase...</span>
                      )}
                      {c.topics && c.topics.trim() && (
                        <span className={styles.navBadge} style={{ marginLeft: 8 }}>{c.topics.split("\n").map((l) => l.trim()).filter(Boolean).length}</span>
                      )}
                      <button
                        type="button"
                        className={styles.tileEditBtn}
                        title="Edit"
                        onClick={() => startTileEdit(c, "topics")}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    {tileEdit?.id === c.id && tileEdit?.field === "topics"
                      ? tileEditor(true, "One topic per line.", "One topic per line. Used to describe what the course covers.")
                      : c.topics && c.topics.trim()
                        ? (() => {
                          const topics = c.topics.split("\n").map((l) => l.trim()).filter(Boolean);
                          const topicCount = topics.length;
                          const firstTopic = topics[0];
                          const truncatedFirst = firstTopic.length > 40 ? firstTopic.slice(0, 40) + "…" : firstTopic;
                          return (
                            <>
                              <span className={styles.courseResourceValue}>
                                {topicCount} topic{topicCount === 1 ? "" : "s"} - starting with &quot;{truncatedFirst}&quot;
                              </span>
                              <div className={styles.courseResourceActions}>
                                <button
                                  type="button"
                                  className={styles.linkButton}
                                  onClick={() => setExpandedTopicsId(expandedTopicsId === c.id ? null : c.id)}
                                >
                                  {expandedTopicsId === c.id ? "Hide" : "View"}
                                </button>
                                <button
                                  type="button"
                                  className={styles.linkButton}
                                  onClick={() => void navigator.clipboard.writeText(c.topics ?? "")}
                                >
                                  Copy
                                </button>
                                <button
                                  type="button"
                                  className={styles.linkButton}
                                  onClick={() => setTopicsExtractOpen(topicsExtractOpen === c.id ? null : c.id)}
                                >
                                  From repo
                                </button>
                              </div>
                              {expandedTopicsId === c.id && (
                                <ol className={styles.topicsList}>
                                  {topics.map((t, i) => (
                                    <li key={i}>{t}</li>
                                  ))}
                                </ol>
                              )}
                              {topicsExtractOpen === c.id && (
                                <div className={styles.topicsExtract} onClick={(e) => e.stopPropagation()}>
                                  <Autocomplete
                                    freeSolo
                                    options={ownedRepos ?? []}
                                    inputValue={topicsRepoSel[c.id] ?? ""}
                                    onInputChange={(_, v) => setTopicsRepoSel((prev) => ({ ...prev, [c.id]: v }))}
                                    sx={{ width: "100%" }}
                                    renderInput={(params) => (
                                      <TextField
                                        {...params}
                                        size="small"
                                        label="Extract from repo"
                                        placeholder={ownedReposLoading ? "Loading repos..." : "owner/name"}
                                      />
                                    )}
                                  />
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      disabled={!/^[^/\s]+\/[^/\s]+$/.test((topicsRepoSel[c.id] ?? "").trim()) || extractingTopicsId !== null}
                                      onClick={async () => {
                                        setExtractingTopicsId(c.id);
                                        setError(null);
                                        const r = await extractTopicsFromRepoAction((topicsRepoSel[c.id] ?? "").trim(), getStoredProvider());
                                        setExtractingTopicsId(null);
                                        if ("error" in r) {
                                          setError(r.error);
                                        } else {
                                          setTileEdit({ id: c.id, field: "topics", value: r.topics.join("\n") });
                                          setTopicsExtractOpen(null);
                                        }
                                      }}
                                    >
                                      {extractingTopicsId === c.id ? "Extracting..." : "Extract topics"}
                                    </Button>
                                    <button
                                      type="button"
                                      className={styles.linkButton}
                                      onClick={() => setTopicsExtractOpen(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                  <p className={styles.fieldHint} style={{ margin: 0 }}>
                                    Extracted topics load into the editor for review - press Save to keep them.
                                  </p>
                                </div>
                              )}
                            </>
                          );
                        })()
                        : (
                          <>
                            <span className={styles.courseResourceEmpty}>Not set</span>
                            <div className={styles.courseResourceActions}>
                              <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => setTopicsExtractOpen(topicsExtractOpen === c.id ? null : c.id)}
                              >
                                From repo
                              </button>
                            </div>
                            {topicsExtractOpen === c.id && (
                              <div className={styles.topicsExtract} onClick={(e) => e.stopPropagation()}>
                                <Autocomplete
                                  freeSolo
                                  options={ownedRepos ?? []}
                                  inputValue={topicsRepoSel[c.id] ?? ""}
                                  onInputChange={(_, v) => setTopicsRepoSel((prev) => ({ ...prev, [c.id]: v }))}
                                  sx={{ width: "100%" }}
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      size="small"
                                      label="Extract from repo"
                                      placeholder={ownedReposLoading ? "Loading repos..." : "owner/name"}
                                    />
                                  )}
                                />
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    disabled={!/^[^/\s]+\/[^/\s]+$/.test((topicsRepoSel[c.id] ?? "").trim()) || extractingTopicsId !== null}
                                    onClick={async () => {
                                      setExtractingTopicsId(c.id);
                                      setError(null);
                                      const r = await extractTopicsFromRepoAction((topicsRepoSel[c.id] ?? "").trim(), getStoredProvider());
                                      setExtractingTopicsId(null);
                                      if ("error" in r) {
                                        setError(r.error);
                                      } else {
                                        setTileEdit({ id: c.id, field: "topics", value: r.topics.join("\n") });
                                        setTopicsExtractOpen(null);
                                      }
                                    }}
                                  >
                                    {extractingTopicsId === c.id ? "Extracting..." : "Extract topics"}
                                  </Button>
                                  <button
                                    type="button"
                                    className={styles.linkButton}
                                    onClick={() => setTopicsExtractOpen(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                                <p className={styles.fieldHint} style={{ margin: 0 }}>
                                  Extracted topics load into the editor for review - press Save to keep them.
                                </p>
                              </div>
                            )}
                          </>
                        )}
                  </div>

                  <div className={`${styles.courseResource}${!c.csvData ? " " + styles.courseResourceClickable : ""}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "csv" ? "true" : undefined}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>CSV</span>
                      {c.csvData && c.csvData.trim() && (
                        <span className={styles.navBadge} style={{ marginLeft: 8 }}>
                          {(() => {
                            const lines = c.csvData.split("\n").map((l) => l.trim()).filter(Boolean);
                            const count = lines.length > 1 ? lines.length - 1 : lines.length;
                            return `${count} row${count !== 1 ? "s" : ""}`;
                          })()}
                        </span>
                      )}
                    </div>
                    {!c.csvData
                      ? (
                        <>
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={uploadingCsv}
                            onClick={() => csvUploadRef.current?.click()}
                          >
                            {uploadingCsv ? "Uploading…" : "Upload CSV"}
                          </Button>
                          <input
                            ref={csvUploadRef}
                            type="file"
                            accept=".csv,text/csv"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleCsvUpload(c, f);
                              e.target.value = "";
                            }}
                          />
                        </>
                      )
                      : (
                        <>
                          <span className={styles.courseResourceValue}>{c.csvName || "course.csv"}</span>
                          <div className={styles.courseResourceActions}>
                            <button
                              type="button"
                              className={styles.linkButton}
                              onClick={() => setExpandedCsvId(expandedCsvId === c.id ? null : c.id)}
                            >
                              {expandedCsvId === c.id ? "Hide" : "View"}
                            </button>
                            <button
                              type="button"
                              className={styles.linkButton}
                              onClick={() => {
                                const blob = new Blob([c.csvData ?? ""], { type: "text/csv;charset=utf-8" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = c.csvName || "course.csv";
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              }}
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              className={styles.linkButton}
                              disabled={uploadingCsv}
                              onClick={() => csvUploadRef.current?.click()}
                            >
                              {uploadingCsv ? "Uploading…" : "Replace"}
                            </button>
                            <button
                              type="button"
                              className={styles.linkButton}
                              style={{ color: "var(--danger)" }}
                              onClick={() => setCsvRemoveConfirm(csvRemoveConfirm === c.id ? null : c.id)}
                            >
                              {csvRemoveConfirm === c.id ? "Confirm" : "Remove"}
                            </button>
                            {csvRemoveConfirm === c.id && (
                              <input
                                type="hidden"
                                onChange={() => {
                                  /* Trigger update on confirm */
                                  void updateCourseHubAction(c.id, { ...courseToInput(c), csvName: null, csvData: null }).then((r) => {
                                    if (!("error" in r)) {
                                      setCourses((prev) => {
                                        const next = prev.map((course) => (course.id === r.course.id ? r.course : course));
                                        if (hubCache) hubCache = { ...hubCache, courses: next };
                                        return next;
                                      });
                                      setCsvRemoveConfirm(null);
                                    }
                                  });
                                }}
                              />
                            )}
                          </div>
                          {csvRemoveConfirm === c.id && (
                            <div style={{ marginTop: 8 }}>
                              <Button
                                variant="outlined"
                                size="small"
                                color="error"
                                onClick={() => {
                                  void updateCourseHubAction(c.id, { ...courseToInput(c), csvName: null, csvData: null }).then((r) => {
                                    if (!("error" in r)) {
                                      setCourses((prev) => {
                                        const next = prev.map((course) => (course.id === r.course.id ? r.course : course));
                                        if (hubCache) hubCache = { ...hubCache, courses: next };
                                        return next;
                                      });
                                      setCsvRemoveConfirm(null);
                                    } else {
                                      setError(r.error);
                                    }
                                  });
                                }}
                              >
                                Delete CSV
                              </Button>
                              <Button
                                variant="text"
                                size="small"
                                onClick={() => setCsvRemoveConfirm(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                          {expandedCsvId === c.id && c.csvData && (
                            <div className={styles.rosterPreview} style={{ maxHeight: 400, overflow: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85em" }}>
                                <tbody>
                                  {c.csvData.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20).map((line, i) => (
                                    <tr key={i} style={{ borderBottom: "1px solid var(--border-color)" }}>
                                      {line.split(",").map((cell, j) => (
                                        <td key={j} style={{ padding: "4px 8px", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {cell.trim()}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <p className={styles.fieldHint} style={{ margin: "8px 0 0 0" }}>Preview uses simple comma splitting.</p>
                            </div>
                          )}
                        </>
                      )}
                  </div>

                  <div className={`${styles.courseResource}${!c.materialsZipPath ? " " + styles.courseResourceClickable : ""}`}>
                    <div className={styles.courseResourceHead}>
                      <span className={styles.courseResourceLabel}>Materials</span>
                    </div>
                    {!c.materialsZipPath
                      ? (
                        <>
                          <span className={styles.courseResourceEmpty}>Not set</span>
                          <div className={styles.courseResourceActions}>
                            <Button
                              variant="outlined"
                              size="small"
                              disabled={uploadingMaterials}
                              onClick={() => materialsUploadRef.current?.click()}
                            >
                              {uploadingMaterials ? "Uploading…" : "Upload zip"}
                            </Button>
                            <input
                              ref={materialsUploadRef}
                              type="file"
                              accept=".zip,application/zip"
                              style={{ display: "none" }}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handleMaterialsUpload(c, f);
                                e.target.value = "";
                              }}
                            />
                          </div>
                        </>
                      )
                      : (
                        <>
                          <span className={styles.courseResourceValue}>{c.materialsZipName} - {((c.materialsZipSize || 0) / 1048576).toFixed(1)} MB</span>
                          <div className={styles.courseResourceActions}>
                            <button
                              type="button"
                              className={styles.linkButton}
                              onClick={async () => {
                                try {
                                  const url = await getCourseZipUrl(supabase, c.materialsZipPath ?? "");
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = c.materialsZipName || "materials.zip";
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "Could not download the materials.");
                                }
                              }}
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              className={styles.linkButton}
                              disabled={uploadingMaterials}
                              onClick={() => materialsUploadRef.current?.click()}
                            >
                              {uploadingMaterials ? "Uploading…" : "Replace"}
                            </button>
                            <button
                              type="button"
                              className={styles.linkButton}
                              style={{ color: "var(--danger)" }}
                              onClick={() => setMaterialsRemoveConfirm(materialsRemoveConfirm === c.id ? null : c.id)}
                            >
                              {materialsRemoveConfirm === c.id ? "Confirm" : "Remove"}
                            </button>
                          </div>
                          {materialsRemoveConfirm === c.id && (
                            <div style={{ marginTop: 8 }}>
                              <Button
                                variant="outlined"
                                size="small"
                                color="error"
                                onClick={() => {
                                  void removeCourseZip(supabase, c.materialsZipPath ?? "").then(async () => {
                                    const r = await setCourseMaterialsAction(c.id, {
                                      materialsZipName: null,
                                      materialsZipPath: null,
                                      materialsZipSize: null,
                                    });
                                    if (!("error" in r)) {
                                      setCourses((prev) => {
                                        const next = prev.map((course) => (course.id === c.id ? {
                                          ...course,
                                          materialsZipName: null,
                                          materialsZipPath: null,
                                          materialsZipSize: null,
                                        } : course));
                                        if (hubCache) hubCache = { ...hubCache, courses: next };
                                        return next;
                                      });
                                      setMaterialsRemoveConfirm(null);
                                    } else {
                                      setError(r.error);
                                    }
                                  });
                                }}
                              >
                                Delete materials
                              </Button>
                              <Button
                                variant="text"
                                size="small"
                                onClick={() => setMaterialsRemoveConfirm(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                  </div>

                  <div className={styles.courseResource}>
                    <span className={styles.courseResourceLabel}>Notifications</span>
                    {c.canvasUrl && c.institution ? (
                      <div className={styles.courseNotif}>
                        <div className={styles.notifSub}>
                          <span>LMS inbox</span>
                          {!notif ? (
                            <span className={styles.notifZero}>…</span>
                          ) : notif.unread > 0 ? (
                            <span className={styles.navBadge}>{notif.unread}</span>
                          ) : (
                            <span className={styles.notifZero}>0</span>
                          )}
                        </div>
                        <div className={styles.notifSub}>
                          <span>Grading</span>
                          {!notif ? (
                            <span className={styles.notifZero}>…</span>
                          ) : notif.needsGrading > 0 ? (
                            <span className={styles.navBadge}>{notif.needsGrading}</span>
                          ) : (
                            <span className={styles.notifZero}>0</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className={styles.courseResourceEmpty}>{c.canvasUrl ? "Set an institution" : "No Canvas link"}</span>
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
