"use client";

import { cloneElement, useEffect, useRef, useState } from "react";
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
  removeCourseMaterialFileAction,
  appendCourseExportFileAction,
  removeCourseExportFileAction,
  listCoursesAction,
  listSyllabusTemplatesAction,
  createSyllabusTemplateAction,
  getCourseInfoAction,
  exportCourseCartridgeAction,
  importLmsSyllabusAction,
  importSyllabusHtmlAction,
  listCourseContentAction,
  listRubricsAction,
  getRubricAction,
  type ScheduleWeekPlan,
} from "../actions";
import type { Course, CourseCustomTile, CourseInput, CourseMaterialFile } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import { loadCommonResources, saveCommonResources, type CommonResourceItem } from "@/lib/common-resources";
import { DEFAULT_CARD_LAYOUT, loadCardLayout, saveCardLayout, type CardLayoutGroup } from "@/lib/card-layout";
import { DEFAULT_INSTITUTION_FIELDS, loadInstitutionFields, saveInstitutionFields, type InstitutionField } from "@/lib/institution-fields";
import { listRecordingFiles, type RecordingFile } from "@/lib/recording-files";
import { scheduleToCsv } from "@/lib/workflows/types";
import GithubRepoPicker from "./GithubRepoPicker";
import TabHeader from "./TabHeader";
import SyllabusPreviewModal, { type SyllabusPreviewPara } from "./SyllabusPreviewModal";
import CsvPreviewModal from "./CsvPreviewModal";
import RubricPreviewModal from "./RubricPreviewModal";
import { parseGeneratedRubric } from "@/app/utils/rubric";
import { getStoredProvider } from "@/lib/llm-provider";
import { useInstitutionSelection } from "@/lib/institutions";
import { setCourseHandoff } from "@/lib/course-handoff";
import { useSupabase } from "@/context/SupabaseProvider";
import {
  uploadCourseZip,
  uploadCourseZipChunked,
  getCourseZipUrl,
  downloadCourseZipBlob,
  removeCourseZip,
  removeCourseZipObjects,
  courseZipObjectPaths,
} from "@/lib/course-files";
import { parseCartridgeBlob, type CartridgeCourseData } from "@/lib/cartridge-import";
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
  description: string;
  weeks: string;
  tests: string;
  lms: string;
  dayTime: string;
}

// Fields that can be edited inline on tiles.
type InlineField = "githubOrg" | "textbook" | "roster" | "repos" | "syllabusId" | "integrations" | "csv" | "startDate" | "description" | "weeks" | "tests" | "lms" | "dayTime";

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
  description: "",
  weeks: "",
  tests: "",
  lms: "",
  dayTime: "",
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
    description: c.description ?? "",
    weeks: c.weeks !== null ? String(c.weeks) : "",
    tests: c.tests !== null ? String(c.tests) : "",
    lms: c.lms ?? "",
    dayTime: c.dayTime ?? "",
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
    rubricName: c.rubricName ?? "",
    rubricData: c.rubricData ?? "",
    startDate: c.startDate ?? "",
    description: c.description ?? "",
    weeks: c.weeks,
    tests: c.tests,
    lms: c.lms ?? "",
    dayTime: c.dayTime ?? "",
    customTiles: c.customTiles,
    hiddenTiles: c.hiddenTiles,
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

// Parsed LMS export packages keyed by storage path; module-level (like
// hubCache) so tab switches do not re-download. Values are promises so
// concurrent tile clicks share a single download+parse.
const cartridgeCache = new Map<string, Promise<CartridgeCourseData>>();

const NO_COURSE_SETTINGS_ERROR =
  "This export package has no Canvas course settings, so tiles cannot be populated from it.";

// Display names for the built-in tile keys (used by the hidden-tiles row).
const TILE_LABELS: Record<string, string> = {
  organization: "Organization",
  codebases: "Codebases",
  syllabus: "Syllabus",
  textbook: "Textbook",
  description: "Description",
  startDate: "Start date",
  dayTime: "Day/Time",
  weeks: "Weeks",
  tests: "Tests",
  lms: "LMS",
  integrations: "Integrations",
  roster: "Roster",
  csv: "Schedule of Topics",
  rubric: "Rubric",
  lmsExports: "LMS Exports",
  materials: "Materials",
};

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
    </svg>
  );
}

// Small cross glyph for the per-course tile remove buttons.
function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" width="11" height="11" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 0 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

// Six-dot grab glyph for the tile drag handles.
function GrabDotsIcon() {
  return (
    <svg viewBox="0 0 10 16" width="8" height="12" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="3" cy="3" r="1.4" />
      <circle cx="7" cy="3" r="1.4" />
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="7" cy="8" r="1.4" />
      <circle cx="3" cy="13" r="1.4" />
      <circle cx="7" cy="13" r="1.4" />
    </svg>
  );
}

// Every built-in tile key; unknown keys in a saved layout are ignored at render.
const BUILT_IN_TILE_KEYS = new Set(DEFAULT_CARD_LAYOUT.flatMap((g) => g.tiles));

// Merge a saved card layout with the defaults: built-in tile keys missing from
// the saved layout are appended to the group DEFAULT_CARD_LAYOUT places them in
// (so future built-ins appear); a deleted default group is recreated when one of
// its tiles has no other home. Unknown keys are left in place (ignored at render).
function mergeCardLayout(saved: CardLayoutGroup[]): CardLayoutGroup[] {
  if (saved.length === 0) return DEFAULT_CARD_LAYOUT.map((g) => ({ ...g, tiles: [...g.tiles] }));
  const present = new Set(saved.flatMap((g) => g.tiles));
  const groups = saved.map((g) => ({ ...g, tiles: [...g.tiles] }));
  for (const def of DEFAULT_CARD_LAYOUT) {
    for (const key of def.tiles) {
      if (present.has(key)) continue;
      const home = groups.find((g) => g.id === def.id);
      if (home) home.tiles.push(key);
      else groups.push({ id: def.id, label: def.label, tiles: [key] });
    }
  }
  return groups;
}

// Merge saved institution fields with the defaults by id: defaults first (the
// default's label/type win so built-in chips can be relabeled centrally; only the
// saved value and lms carry over), extra saved fields after - so new defaults
// appear for existing users.
function mergeInstitutionFields(saved: InstitutionField[]): InstitutionField[] {
  const byId = new Map(saved.map((f) => [f.id, f]));
  const merged = DEFAULT_INSTITUTION_FIELDS.map((d) => {
    const saved_ = byId.get(d.id);
    return saved_ ? { ...d, value: saved_.value, lms: saved_.lms ?? d.lms } : { ...d };
  });
  const extras = saved.filter((f) => !DEFAULT_INSTITUTION_FIELDS.some((d) => d.id === f.id));
  return [...merged, ...extras];
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
  const [lmsBusyTile, setLmsBusyTile] = useState<string | null>(null);
  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ name: string; csv: string } | null>(null);
  const [csvRemoveConfirm, setCsvRemoveConfirm] = useState<string | null>(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [rubricPreview, setRubricPreview] = useState<{ name: string; rubric: string } | null>(null);
  const [rubricRemoveConfirm, setRubricRemoveConfirm] = useState<string | null>(null);
  const [uploadingRubric, setUploadingRubric] = useState(false);
  const [ownedRepos, setOwnedRepos] = useState<string[] | null>(null);
  const [repoAddSel, setRepoAddSel] = useState("");
  const [repoAddBranch, setRepoAddBranch] = useState("");
  const [uploadingMaterials, setUploadingMaterials] = useState(false);
  const [materialsRemoveConfirm, setMaterialsRemoveConfirm] = useState<string | null>(null);
  const [removingMaterialFile, setRemovingMaterialFile] = useState<string | null>(null);
  const [uploadingExport, setUploadingExport] = useState(false);
  const [exportRemoveConfirm, setExportRemoveConfirm] = useState<string | null>(null);
  const [lmsCourseOpts, setLmsCourseOpts] = useState<Array<{ url: string; name: string }> | null>(null);
  const [lmsCourseOptsError, setLmsCourseOptsError] = useState<string | null>(null);
  const [lmsCourseDraft, setLmsCourseDraft] = useState<string | null>(null);
  const [commonResources, setCommonResources] = useState<CommonResourceItem[]>([]);
  const [commonResourcesLoading, setCommonResourcesLoading] = useState(false);
  const [libFiles, setLibFiles] = useState<RecordingFile[] | null>(null);
  const [filePickerValue, setFilePickerValue] = useState("");
  const [pageTitleDraft, setPageTitleDraft] = useState("");
  const [pageBodyDraft, setPageBodyDraft] = useState("");
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  // Shared card layout (tile groups/order across every card) + drag state.
  const [cardLayout, setCardLayout] = useState<CardLayoutGroup[]>(DEFAULT_CARD_LAYOUT);
  const [dragTile, setDragTile] = useState<{ kind: "tile"; key: string; courseId?: string } | null>(null);
  const [dropHint, setDropHint] = useState<{ cardId: string; groupId: string; index: number } | null>(null);
  const [groupRename, setGroupRename] = useState<{ id: string; cardId: string; label: string } | null>(null);
  const [groupDeleteConfirm, setGroupDeleteConfirm] = useState<{ id: string; cardId: string } | null>(null);
  // Per-card custom tile add form + inline value editor.
  const [tileAdd, setTileAdd] = useState<{ courseId: string; groupId: string; label: string; value: string } | null>(null);
  const [customTileEdit, setCustomTileEdit] = useState<{ courseId: string; tileId: string; value: string } | null>(null);
  // Per-institution common fields (undefined = not loaded yet) + edit/add forms.
  const [instFields, setInstFields] = useState<Record<string, InstitutionField[] | undefined>>({});
  const [instFieldEdit, setInstFieldEdit] = useState<{ acronym: string; id: string; value: string; lms?: string } | null>(null);
  const [instFieldAdd, setInstFieldAdd] = useState<{ acronym: string; label: string; type: "text" | "date" | "url" } | null>(null);
  // Syllabus templates for the syllabusTemplate field typeahead (null = not loaded yet).
  const [syllabusTemplates, setSyllabusTemplates] = useState<Array<{ id: string; name: string }> | null>(null);
  // Acronym whose institution template chip is uploading a new .docx.
  const [instTemplateUploading, setInstTemplateUploading] = useState<string | null>(null);
  // Ref mirror of saveInstFieldEdit so the mount-once click-outside listener
  // always calls the latest closure (avoids TDZ/stale-closure issues).
  const saveInstFieldEditRef = useRef<() => void>(() => {});
  // Ref mirror of instFields so async handlers (template upload) read the
  // latest field list after their awaits instead of a stale render snapshot.
  const instFieldsRef = useRef(instFields);
  // Ref mirror of courses for the same reason (hidden-tile mutations).
  const coursesRef = useRef(courses);
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

  // Load the user's GitHub repos once on mount for the repo picker dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listGithubReposAction();
      if (cancelled) return;
      if (!("error" in r)) {
        const sorted = r.repos.map((repo) => repo.fullName).sort();
        setOwnedRepos(sorted);
      }
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

  // Load common resources on mount when user is present
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setCommonResourcesLoading(true);
      try {
        const items = await loadCommonResources(supabase, user.id);
        if (cancelled) return;
        setCommonResources(items);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load common resources:", err);
      } finally {
        setCommonResourcesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Load the per-user card layout (empty result -> defaults; see mergeCardLayout).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await loadCardLayout(supabase, user.id);
        if (cancelled) return;
        setCardLayout(mergeCardLayout(saved));
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load the card layout:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Lazy-load each institution's common fields the first time its section can
  // render (await-first, cancelled flag; a failed load falls back to defaults).
  useEffect(() => {
    if (!user) return;
    const acronyms = Array.from(new Set(courses.map((c) => (c.institution ?? "").trim()).filter(Boolean)));
    const missing = acronyms.filter((a) => instFields[a] === undefined);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const acronym of missing) {
        let fields: InstitutionField[];
        try {
          fields = mergeInstitutionFields(await loadInstitutionFields(supabase, user.id, acronym));
        } catch (err) {
          console.error("Failed to load institution fields:", err);
          fields = mergeInstitutionFields([]);
        }
        if (cancelled) return;
        setInstFields((prev) => ({ ...prev, [acronym]: fields }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase, courses, instFields]);

  // Lazy-load syllabus templates once when user is present and any institution
  // panel is visible (instFields has at least one loaded acronym).
  useEffect(() => {
    if (!user || syllabusTemplates !== null) return;
    const hasLoadedField = Object.values(instFields).some((f) => f !== undefined);
    if (!hasLoadedField) return;
    let cancelled = false;
    (async () => {
      const result = await listSyllabusTemplatesAction();
      if (cancelled) return;
      if ("error" in result) {
        console.error("Failed to load syllabus templates:", result.error);
        setSyllabusTemplates([]);
        return;
      }
      setSyllabusTemplates(result.templates.map((t) => ({ id: t.id, name: t.name })));
    })();
    return () => {
      cancelled = true;
    };
  }, [user, syllabusTemplates, instFields]);

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
      setSyllabi(() => {
        if (hubCache) hubCache = { ...hubCache, syllabi: s.syllabi };
        return s.syllabi;
      });
    }
  };

  const syllabusName = (id: string | null): string | null =>
    id ? syllabi.find((s) => s.id === id)?.name ?? "Linked syllabus" : null;

  const canLms = (c: Course) => Boolean((c.canvasUrl ?? "").trim() && (c.institution ?? "").trim());

  // Tiles fall back to the newest uploaded LMS export when the course has no
  // live LMS connection (no Canvas URL/institution) but does have an export.
  const canImport = (c: Course) => !canLms(c) && c.exportFiles.length > 0;

  const latestExportFile = (c: Course): CourseMaterialFile | null => {
    if (c.exportFiles.length === 0) return null;
    return c.exportFiles.reduce((latest, f) => (f.addedAt > latest.addedAt ? f : latest));
  };

  // Download (chunk-aware) and parse the course's newest LMS export, caching
  // the in-flight promise per storage path so parallel clicks share one fetch.
  const getCourseCartridge = (c: Course): Promise<CartridgeCourseData> => {
    const file = latestExportFile(c);
    if (!file) return Promise.reject(new Error("This course has no LMS export to import from."));
    const cached = cartridgeCache.get(file.path);
    if (cached) return cached;
    const promise = (async () => {
      const blob = await downloadCourseZipBlob(supabase, file);
      return await parseCartridgeBlob(blob);
    })();
    cartridgeCache.set(file.path, promise);
    // Evict failed downloads so a retry can succeed.
    promise.catch(() => cartridgeCache.delete(file.path));
    return promise;
  };

  // Shared tail of the from-import tile handlers: persist one patched field.
  const saveCourseFromImport = async (c: Course, patch: Partial<CourseInput>) => {
    const result = await updateCourseHubAction(c.id, { ...courseToInput(c), ...patch });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCourses((prev) => {
      const next = prev.map((course) => (course.id === result.course.id ? result.course : course));
      if (hubCache) hubCache = { ...hubCache, courses: next };
      return next;
    });
  };

  const handleImportStartDateFromTile = async (c: Course) => {
    const tileKey = `${c.id}:startDate`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const data = await getCourseCartridge(c);
      if (!data.hasCourseSettings) {
        setError(NO_COURSE_SETTINGS_ERROR);
        return;
      }
      if (!data.startAt) {
        setError("The LMS export has no start date.");
        return;
      }
      await saveCourseFromImport(c, { startDate: data.startAt.slice(0, 10) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the start date from the export.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleImportWeeksFromTile = async (c: Course) => {
    const tileKey = `${c.id}:weeks`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const data = await getCourseCartridge(c);
      if (!data.hasCourseSettings) {
        setError(NO_COURSE_SETTINGS_ERROR);
        return;
      }
      const weekNumbers = new Set<number>();
      for (const courseModule of data.modules) {
        const match = courseModule.name.match(/module\s*0*(\d+)/i);
        if (match) {
          weekNumbers.add(parseInt(match[1], 10));
        }
      }
      if (weekNumbers.size === 0) {
        setError("No Module NN modules found in the LMS export.");
        return;
      }
      await saveCourseFromImport(c, { weeks: weekNumbers.size });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the modules from the export.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleImportCsvFromTile = async (c: Course) => {
    const tileKey = `${c.id}:csv`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const data = await getCourseCartridge(c);
      if (!data.hasCourseSettings) {
        setError(NO_COURSE_SETTINGS_ERROR);
        return;
      }
      const rows: ScheduleWeekPlan[] = [];
      for (const courseModule of data.modules) {
        const match = courseModule.name.match(/module\s*0*(\d+)/i);
        if (!match) continue;
        const week = parseInt(match[1], 10);
        const topicText = courseModule.name.split(":").slice(1).join(":").trim();
        const assignmentItem = courseModule.items.find((item) => item.type.toLowerCase() === "assignment");
        rows.push({
          week,
          topic: topicText || "",
          summary: "",
          assignmentTitle: assignmentItem?.title ?? null,
          assignmentSlug: null,
          testName: null,
        });
      }
      if (rows.length === 0) {
        setError("No Module NN modules found in the LMS export.");
        return;
      }
      rows.sort((a, b) => a.week - b.week);
      await saveCourseFromImport(c, { csvName: "lms-schedule.csv", csvData: scheduleToCsv(rows) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the modules from the export.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleImportRubricFromTile = async (c: Course) => {
    const tileKey = `${c.id}:rubric`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const data = await getCourseCartridge(c);
      if (!data.hasCourseSettings) {
        setError(NO_COURSE_SETTINGS_ERROR);
        return;
      }
      if (data.rubrics.length === 0) {
        setError("The LMS export has no rubrics.");
        return;
      }
      const rubric = data.rubrics[0];
      const lines: string[] = [];
      for (const criterion of rubric.criteria) {
        const firstRating = criterion.ratings[0] ?? null;
        const summary = firstRating
          ? `${criterion.description} (${criterion.points}): ${criterion.longDescription?.split("\n")[0] ?? ""}`
          : `${criterion.description} (${criterion.points}): `;
        lines.push(summary);
        for (const rating of criterion.ratings) {
          lines.push(`  - ${rating.description}: ${rating.points} pts`);
        }
      }
      await saveCourseFromImport(c, { rubricName: `${rubric.title}.md`, rubricData: lines.join("\n") });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the rubric from the export.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleImportSyllabusFromTile = async (c: Course) => {
    const tileKey = `${c.id}:syllabus`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const data = await getCourseCartridge(c);
      if (!data.hasCourseSettings) {
        setError(NO_COURSE_SETTINGS_ERROR);
        return;
      }
      if (!data.syllabusHtml) {
        setError("The LMS export has no syllabus content.");
        return;
      }
      const r = await importSyllabusHtmlAction(c.name, data.syllabusHtml);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      await saveCourseFromImport(c, { syllabusId: r.syllabusId });
      await reloadSyllabi();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import the syllabus from the export.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleLmsRosterFromTile = async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const tileKey = `${c.id}:roster`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const courseId = parseCanvasCourseId(c.canvasUrl ?? "")?.toString();
      if (!courseId) {
        setError("Could not extract course ID from Canvas URL.");
        return;
      }
      const r = await listCourseRosterAction(c.institution!.trim().toUpperCase(), courseId);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      const currentRosterLines = rosterToRows(c.roster ?? "");
      const currentNames = new Map(currentRosterLines.map((row) => [row.student.trim(), row.username]));
      const lines = r.students
        .sort((a, b) => {
          const aName = (a.sortableName || a.name).trim();
          const bName = (b.sortableName || b.name).trim();
          return aName.localeCompare(bName);
        })
        .map((s) => {
          const name = (s.sortableName || s.name).trim();
          const username = currentNames.get(name) ?? "";
          return { student: name, username };
        });
      const rosterText = rowsToRoster(lines);
      setTileEdit({ id: c.id, field: "roster", value: rosterText });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch roster from LMS.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleLmsStartDateFromTile = async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const tileKey = `${c.id}:startDate`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const r = await getCourseInfoAction(c.canvasUrl ?? "", c.institution?.trim());
      if ("error" in r) {
        setError(r.error);
        return;
      }
      if (!r.startAt) {
        setError("The LMS course has no start date.");
        return;
      }
      const startDate = r.startAt.slice(0, 10);
      const result = await updateCourseHubAction(c.id, { ...courseToInput(c), startDate });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCourses((prev) => {
        const next = prev.map((course) => (course.id === result.course.id ? result.course : course));
        if (hubCache) hubCache = { ...hubCache, courses: next };
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch start date from LMS.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleLmsSyllabusFromTile = async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const tileKey = `${c.id}:syllabus`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const r = await importLmsSyllabusAction(c.canvasUrl ?? "", c.institution?.trim(), c.name);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      const result = await updateCourseHubAction(c.id, { ...courseToInput(c), syllabusId: r.syllabusId });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCourses((prev) => {
        const next = prev.map((course) => (course.id === result.course.id ? result.course : course));
        if (hubCache) hubCache = { ...hubCache, courses: next };
        return next;
      });
      await reloadSyllabi();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import syllabus from LMS.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleLmsCsvFromTile = async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const tileKey = `${c.id}:csv`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const r = await listCourseContentAction(c.canvasUrl ?? "", c.institution?.trim());
      if ("error" in r) {
        setError(r.error);
        return;
      }
      const rows: ScheduleWeekPlan[] = [];
      for (const courseModule of r.modules) {
        const match = courseModule.name.match(/module\s*0*(\d+)/i);
        if (!match) continue;
        const week = parseInt(match[1], 10);
        const topicText = courseModule.name.split(":").slice(1).join(":").trim();
        const assignmentItem = courseModule.items.find((item) => item.type.toLowerCase() === "assignment");
        rows.push({
          week,
          topic: topicText || "",
          summary: "",
          assignmentTitle: assignmentItem?.title ?? null,
          assignmentSlug: null,
          testName: null,
        });
      }
      if (rows.length === 0) {
        setError("No Module NN modules found in the LMS course.");
        return;
      }
      rows.sort((a, b) => a.week - b.week);
      const csv = scheduleToCsv(rows);
      const result = await updateCourseHubAction(c.id, { ...courseToInput(c), csvName: "lms-schedule.csv", csvData: csv });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCourses((prev) => {
        const next = prev.map((course) => (course.id === result.course.id ? result.course : course));
        if (hubCache) hubCache = { ...hubCache, courses: next };
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch course content from LMS.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleLmsWeeksFromTile = async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const tileKey = `${c.id}:weeks`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const r = await listCourseContentAction(c.canvasUrl ?? "", c.institution?.trim());
      if ("error" in r) {
        setError(r.error);
        return;
      }
      const weekNumbers = new Set<number>();
      for (const courseModule of r.modules) {
        const match = courseModule.name.match(/module\s*0*(\d+)/i);
        if (match) {
          weekNumbers.add(parseInt(match[1], 10));
        }
      }
      if (weekNumbers.size === 0) {
        setError("No Module NN modules found in the LMS course.");
        return;
      }
      const result = await updateCourseHubAction(c.id, { ...courseToInput(c), weeks: weekNumbers.size });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCourses((prev) => {
        const next = prev.map((course) => (course.id === result.course.id ? result.course : course));
        if (hubCache) hubCache = { ...hubCache, courses: next };
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch course content from LMS.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleLmsRubricFromTile = async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const tileKey = `${c.id}:rubric`;
    setLmsBusyTile(tileKey);
    setError(null);
    try {
      const lr = await listRubricsAction(c.canvasUrl ?? "", c.institution?.trim());
      if ("error" in lr) {
        setError(lr.error);
        return;
      }
      if (lr.rubrics.length === 0) {
        setError("The LMS course has no rubrics.");
        return;
      }
      const firstRubric = lr.rubrics[0];
      const rr = await getRubricAction(c.canvasUrl ?? "", firstRubric.id, c.institution?.trim());
      if ("error" in rr) {
        setError(rr.error);
        return;
      }
      const rubric = rr.rubric;
      const lines: string[] = [];
      for (const criterion of rubric.criteria) {
        const firstRating = rubric.criteria.length > 0 ? criterion.ratings[0] : null;
        const summary = firstRating
          ? `${criterion.description} (${criterion.points}): ${criterion.longDescription?.split("\n")[0] ?? ""}`
          : `${criterion.description} (${criterion.points}): `;
        lines.push(summary);
        for (const rating of criterion.ratings) {
          lines.push(`  - ${rating.description}: ${rating.points} pts`);
        }
      }
      const rubricText = lines.join("\n");
      const result = await updateCourseHubAction(c.id, {
        ...courseToInput(c),
        rubricName: `${rubric.title}.md`,
        rubricData: rubricText,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCourses((prev) => {
        const next = prev.map((course) => (course.id === result.course.id ? result.course : course));
        if (hubCache) hubCache = { ...hubCache, courses: next };
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch rubric from LMS.");
    } finally {
      setLmsBusyTile(null);
    }
  };

  const handleLmsExportFromTile = async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const tileKey = `${c.id}:lmsExports`;
    setLmsBusyTile(tileKey);
    setError(null);
    if (!user) {
      setError("You must be logged in.");
      setLmsBusyTile(null);
      return;
    }
    try {
      const r = await exportCourseCartridgeAction(c.canvasUrl ?? "", c.institution?.trim());
      if ("error" in r) {
        setError(r.error);
        return;
      }
      const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const { path, parts } = await uploadCourseZipChunked(supabase, user.id, c.id, blob);
      const appendResult = await appendCourseExportFileAction(c.id, {
        name: r.fileName,
        path,
        size: blob.size,
        ...(parts ? { parts } : {}),
      });
      if ("error" in appendResult) {
        setError(appendResult.error);
        await removeCourseZipObjects(supabase, parts ?? [path]);
        return;
      }
      setCourses((prev) => {
        const updated = prev.map((course) => {
          if (course.id === c.id) {
            const filtered = course.exportFiles.filter((f) => f.name !== r.fileName);
            return {
              ...course,
              exportFiles: [
                ...filtered,
                {
                  name: r.fileName,
                  path,
                  size: blob.size,
                  addedAt: new Date().toISOString(),
                  ...(parts ? { parts } : {}),
                },
              ],
            };
          }
          return course;
        });
        if (hubCache) hubCache = { ...hubCache, courses: updated };
        return updated;
      });
      await removeCourseZipObjects(supabase, appendResult.replacedPaths);
      for (const p of appendResult.replacedPaths) cartridgeCache.delete(p);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not export from LMS.";
      if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(message)) {
        setError("This export exceeds the storage upload limit. Raise \"Upload file size limit\" in Supabase Storage settings (currently the project default is 50 MB), then retry.");
      } else {
        setError(message);
      }
    } finally {
      setLmsBusyTile(null);
    }
  };

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
      description: form.description,
      weeks: form.weeks.trim() ? (Number.isFinite(Number(form.weeks.trim())) ? Number(form.weeks.trim()) : null) : null,
      tests: form.tests.trim() ? (Number.isFinite(Number(form.tests.trim())) ? Number(form.tests.trim()) : null) : null,
      lms: form.lms,
      dayTime: form.dayTime,
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

  const handleRubricUpload = async (c: Course, file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError("Rubric file is too large (max 2 MB).");
      return;
    }
    setUploadingRubric(true);
    setError(null);
    try {
      const text = await readFileText(file);
      const r = await updateCourseHubAction(c.id, { ...courseToInput(c), rubricName: file.name, rubricData: text });
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
      setError(err instanceof Error ? err.message : "Could not read the rubric file.");
    } finally {
      setUploadingRubric(false);
    }
  };

  const openRubricPicker = (c: Course) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt,text/plain,text/markdown";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void handleRubricUpload(c, f);
    };
    input.click();
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

  const handleRemoveMaterialFile = async (c: Course, path: string) => {
    if (!user) {
      setError("You must be logged in.");
      return;
    }
    setRemovingMaterialFile(path);
    setError(null);
    try {
      await removeCourseZip(supabase, path);
      const r = await removeCourseMaterialFileAction(c.id, path);
      if (!("error" in r)) {
        setCourses((prev) => {
          const updated = prev.map((course) => {
            if (course.id === c.id) {
              return {
                ...course,
                materialsFiles: course.materialsFiles.filter((f) => f.path !== path),
              };
            }
            return course;
          });
          if (hubCache) hubCache = { ...hubCache, courses: updated };
          return updated;
        });
      } else {
        setError(r.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the file from the course materials.");
    } finally {
      setRemovingMaterialFile(null);
    }
  };

  const handleExportUpload = async (c: Course, file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      setError("Export is too large (max 100 MB).");
      return;
    }
    if (!user) {
      setError("You must be logged in.");
      return;
    }
    setUploadingExport(true);
    setError(null);
    try {
      const { path, parts } = await uploadCourseZipChunked(supabase, user.id, c.id, file);
      const r = await appendCourseExportFileAction(c.id, {
        name: file.name,
        path,
        size: file.size,
        ...(parts ? { parts } : {}),
      });
      if ("error" in r) {
        setError(r.error);
        await removeCourseZipObjects(supabase, parts ?? [path]);
        return;
      }
      setCourses((prev) => {
        const updated = prev.map((course) => {
          if (course.id === c.id) {
            const filtered = course.exportFiles.filter((f) => f.name !== file.name);
            return {
              ...course,
              exportFiles: [
                ...filtered,
                {
                  name: file.name,
                  path,
                  size: file.size,
                  addedAt: new Date().toISOString(),
                  ...(parts ? { parts } : {}),
                },
              ],
            };
          }
          return course;
        });
        if (hubCache) hubCache = { ...hubCache, courses: updated };
        return updated;
      });
      await removeCourseZipObjects(supabase, r.replacedPaths);
      for (const p of r.replacedPaths) cartridgeCache.delete(p);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not upload the export.";
      if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(message)) {
        setError("This export exceeds the storage upload limit. Raise \"Upload file size limit\" in Supabase Storage settings (currently the project default is 50 MB), then retry.");
      } else {
        setError(message);
      }
    } finally {
      setUploadingExport(false);
    }
  };

  const handleRemoveExportFile = async (c: Course, file: CourseMaterialFile) => {
    if (!user) {
      setError("You must be logged in.");
      return;
    }
    try {
      await removeCourseZipObjects(supabase, courseZipObjectPaths(file));
      cartridgeCache.delete(file.path);
      const r = await removeCourseExportFileAction(c.id, file.path);
      if (!("error" in r)) {
        setCourses((prev) => {
          const updated = prev.map((course) => {
            if (course.id === c.id) {
              return {
                ...course,
                exportFiles: course.exportFiles.filter((f) => f.path !== file.path),
              };
            }
            return course;
          });
          if (hubCache) hubCache = { ...hubCache, courses: updated };
          return updated;
        });
        setExportRemoveConfirm(null);
      } else {
        setError(r.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the export file.");
    }
  };

  // Download an export entry; chunked entries are reassembled client-side.
  const handleDownloadExportFile = async (file: CourseMaterialFile) => {
    try {
      if (file.parts && file.parts.length > 0) {
        const blob = await downloadCourseZipBlob(supabase, file);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      const url = await getCourseZipUrl(supabase, file.path);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the file.");
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
      : field === "csv" ? ""
      : field === "startDate" ? (c.startDate ?? "")
      : field === "description" ? (c.description ?? "")
      : field === "weeks" ? (c.weeks !== null ? String(c.weeks) : "")
      : field === "tests" ? (c.tests !== null ? String(c.tests) : "")
      : field === "lms" ? (c.lms || institutionLms(c))
      : field === "dayTime" ? (c.dayTime ?? "")
      : ((c[field as Exclude<InlineField, "csv" | "startDate" | "description" | "weeks" | "tests" | "lms" | "dayTime">] ?? "") as string);
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

  const institutionLms = (c: Course): string => {
    const acr = (c.institution ?? "").trim();
    if (!acr) return "";
    const f = instFields[acr]?.find((x) => x.id === "lmsUrl");
    return f?.lms ?? "";
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
      : tileEdit.field === "weeks" ? { weeks: tileEdit.value.trim() ? (Number.isFinite(Number(tileEdit.value.trim())) ? Number(tileEdit.value.trim()) : null) : null }
      : tileEdit.field === "tests" ? { tests: tileEdit.value.trim() ? (Number.isFinite(Number(tileEdit.value.trim())) ? Number(tileEdit.value.trim()) : null) : null }
      : tileEdit.field === "lms" ? {
        lms: tileEdit.value || null,
        ...(lmsCourseDraft !== null ? { canvasUrl: lmsCourseDraft || null } : {}),
      }
      : tileEdit.field === "dayTime" ? { dayTime: tileEdit.value }
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
          const extractResult = await extractTopicsFromRepoAction(extractRepo, getStoredProvider());
          if ("error" in extractResult) {
            setError(extractResult.error);
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
            return;
          }
          // Update courses state with the new topics
          setCourses((prev) => {
            const next = prev.map((c) => (c.id === updateResult.course.id ? updateResult.course : c));
            if (hubCache) hubCache = { ...hubCache, courses: next };
            return next;
          });
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

  // Click outside the currently-editing institution field to save and close.
  // Mount-once; the ref indirection keeps the handler's closure fresh
  // (saveInstFieldEdit itself no-ops when nothing is being edited).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // MUI Typeahead menus render in a body-level portal - do not treat
      // picking an option as clicking away.
      const el = e.target as HTMLElement;
      if (el.closest('[data-inst-field-editing="true"], .MuiPopover-root, .MuiMenu-root, .MuiAutocomplete-popper, [role="listbox"]')) return;
      saveInstFieldEditRef.current();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

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

  // Render the inline multiline text editor (textarea + save/cancel).
  const tileTextAreaEditor = () =>
    tileEdit && (
      <div className={styles.tileEditor}>
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={3}
          value={tileEdit.value}
          onChange={(e) => setTileEdit((t) => (t ? { ...t, value: e.target.value } : t))}
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

  // Render the inline number editor (number input + save/cancel).
  const tileNumberEditor = () =>
    tileEdit && (
      <div className={styles.tileEditor}>
        <TextField
          size="small"
          fullWidth
          type="number"
          value={tileEdit.value}
          onChange={(e) => setTileEdit((t) => (t ? { ...t, value: e.target.value } : t))}
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
        {!editingCourse.lms && institutionLms(editingCourse) && (
          <p className={styles.fieldHint} style={{ margin: "6px 0 0 0" }}>Defaults to the institution&apos;s LMS.</p>
        )}
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

  // Load library files once for the file picker
  const loadLibFiles = async () => {
    if (libFiles !== null) return; // Already loaded
    if (!user) return;
    try {
      const files = await listRecordingFiles(supabase, user.id);
      setLibFiles(files);
    } catch (err) {
      console.error("Failed to load library files:", err);
      setLibFiles([]);
    }
  };

  const handleAddFile = async (fileId: string) => {
    const file = libFiles?.find((f) => f.id === fileId);
    if (!file) return;
    const newItem: CommonResourceItem = {
      id: crypto.randomUUID(),
      type: "file",
      title: file.name,
      fileId,
    };
    const updated = [...commonResources, newItem];
    setCommonResources(updated);
    setFilePickerValue("");
    if (user) {
      saveCommonResources(supabase, user.id, updated).catch((err) => {
        console.error("Failed to save common resources:", err);
      });
    }
  };

  const handleAddPage = () => {
    if (!pageTitleDraft.trim()) return;
    const newItem: CommonResourceItem = {
      id: crypto.randomUUID(),
      type: "page",
      title: pageTitleDraft.trim(),
      body: pageBodyDraft,
    };
    const updated = [...commonResources, newItem];
    setCommonResources(updated);
    setPageTitleDraft("");
    setPageBodyDraft("");
    if (user) {
      saveCommonResources(supabase, user.id, updated).catch((err) => {
        console.error("Failed to save common resources:", err);
      });
    }
  };

  const handleUpdateItemTitle = (id: string, title: string) => {
    const updated = commonResources.map((item) =>
      item.id === id ? { ...item, title } : item
    );
    setCommonResources(updated);
    if (user) {
      saveCommonResources(supabase, user.id, updated).catch((err) => {
        console.error("Failed to save common resources:", err);
      });
    }
  };

  const handleUpdatePageBody = (id: string, body: string) => {
    const updated = commonResources.map((item) =>
      item.id === id ? { ...item, body } : item
    );
    setCommonResources(updated);
    if (user) {
      saveCommonResources(supabase, user.id, updated).catch((err) => {
        console.error("Failed to save common resources:", err);
      });
    }
  };

  const handleRemoveItem = (id: string) => {
    const updated = commonResources.filter((item) => item.id !== id);
    setCommonResources(updated);
    if (user) {
      saveCommonResources(supabase, user.id, updated).catch((err) => {
        console.error("Failed to save common resources:", err);
      });
    }
  };

  const handleMoveItem = (id: string, direction: "up" | "down") => {
    const idx = commonResources.findIndex((item) => item.id === id);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === commonResources.length - 1) return;

    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    const updated = [...commonResources];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setCommonResources(updated);
    if (user) {
      saveCommonResources(supabase, user.id, updated).catch((err) => {
        console.error("Failed to save common resources:", err);
      });
    }
  };

  // Persist a card-layout mutation: state first, fire-and-forget save.
  const applyLayout = (next: CardLayoutGroup[]) => {
    setCardLayout(next);
    if (user) void saveCardLayout(supabase, user.id, next).catch((err) => console.error("Failed to save the card layout:", err));
  };

  // Persist a course's custom tiles through the standard update action.
  const persistCustomTiles = async (course: Course, nextTiles: CourseCustomTile[]) => {
    const r = await updateCourseHubAction(course.id, { ...courseToInput(course), customTiles: nextTiles });
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setCourses((prev) => {
      const next = prev.map((x) => (x.id === r.course.id ? r.course : x));
      if (hubCache) hubCache = { ...hubCache, courses: next };
      return next;
    });
  };

  // Grab handle rendered inside a tile's label; courseId marks a custom tile.
  const tileGrabHandle = (key: string, courseId?: string) => (
    <span
      className={styles.tileGrabHandle}
      draggable
      role="button"
      aria-label="Drag to move"
      onClick={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData("text/plain", key);
        e.dataTransfer.effectAllowed = "move";
        setDragTile({ kind: "tile", key, courseId });
      }}
      onDragEnd={() => {
        setDragTile(null);
        setDropHint(null);
      }}
    >
      <GrabDotsIcon />
    </span>
  );

  // Mutate a course's hidden-tile list against the LATEST course row (ref, not
  // the click-time closure) with an optimistic update, so hiding two tiles in
  // quick succession cannot drop one to a stale full-row save.
  const mutateHiddenTiles = async (courseId: string, mutate: (prev: string[]) => string[]) => {
    const current = coursesRef.current.find((x) => x.id === courseId);
    if (!current) return;
    const next = mutate(current.hiddenTiles);
    const optimistic = { ...current, hiddenTiles: next };
    setCourses((prev) => {
      const updated = prev.map((course) => (course.id === courseId ? optimistic : course));
      if (hubCache) hubCache = { ...hubCache, courses: updated };
      return updated;
    });
    const result = await updateCourseHubAction(courseId, { ...courseToInput(optimistic), hiddenTiles: next });
    if ("error" in result) {
      setError(result.error);
      // Roll the optimistic change back.
      setCourses((prev) => {
        const updated = prev.map((course) => (course.id === courseId ? current : course));
        if (hubCache) hubCache = { ...hubCache, courses: updated };
        return updated;
      });
      return;
    }
    setCourses((prev) => {
      const updated = prev.map((course) => (course.id === result.course.id ? result.course : course));
      if (hubCache) hubCache = { ...hubCache, courses: updated };
      return updated;
    });
  };

  // Hide a built-in tile on this course's card only (data is untouched).
  const hideTile = (c: Course, key: string) => {
    void mutateHiddenTiles(c.id, (prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const restoreTile = (c: Course, key: string) => {
    void mutateHiddenTiles(c.id, (prev) => prev.filter((k) => k !== key));
  };

  // Hover-revealed remove control shown next to each built-in tile's drag handle.
  const tileHideButton = (key: string, c: Course) => (
    <button
      type="button"
      className={styles.tileHideBtn}
      title="Remove tile from this card"
      aria-label={`Remove the ${TILE_LABELS[key] ?? key} tile from this card`}
      onClick={(e) => {
        e.stopPropagation();
        hideTile(c, key);
      }}
    >
      <CrossIcon />
    </button>
  );

  // The group's built-in tiles as rendered on this card (hidden keys excluded).
  // Drag/drop indexes are relative to this list, so the drop handler uses it too.
  const visibleGroupBuiltins = (lg: CardLayoutGroup, c: Course) =>
    lg.tiles.filter((k) => BUILT_IN_TILE_KEYS.has(k) && !c.hiddenTiles.includes(k));

  // Track the hovered drop position (index within the group's rendered tiles;
  // index === tile count means "end of group").
  const handleTileDragOver = (e: React.DragEvent, cardId: string, groupId: string, index: number) => {
    if (!dragTile) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropHint((h) => (h && h.cardId === cardId && h.groupId === groupId && h.index === index ? h : { cardId, groupId, index }));
  };

  // Drop a dragged tile at `index` in group `lg`. Built-in tiles move within the
  // shared layout (applies to every card); custom tiles reorder/reassign within
  // their own course only.
  const handleTileDrop = (e: React.DragEvent, c: Course, lg: CardLayoutGroup, index: number) => {
    if (!dragTile) return;
    e.preventDefault();
    e.stopPropagation();
    const drag = dragTile;
    setDragTile(null);
    setDropHint(null);
    // Indexes from render are relative to this card's VISIBLE built-in tiles
    // (per-course hidden tiles are not rendered), so resolve through them.
    const builtins = visibleGroupBuiltins(lg, c);
    if (!drag.courseId) {
      const next = cardLayout.map((g) => ({ ...g, tiles: [...g.tiles] }));
      const src = next.find((g) => g.tiles.includes(drag.key));
      const target = next.find((g) => g.id === lg.id);
      if (!target) return;
      // Clamp to the built-in slots and correct for removing the dragged key
      // from before the insertion point when moving within the same group.
      let validIdx = Math.min(index, builtins.length);
      if (src && src.id === target.id) {
        const oldIdx = builtins.indexOf(drag.key);
        if (oldIdx !== -1 && oldIdx < validIdx) validIdx -= 1;
      }
      if (src) src.tiles = src.tiles.filter((k) => k !== drag.key);
      const targetValid = target.tiles.filter((k) => BUILT_IN_TILE_KEYS.has(k) && !c.hiddenTiles.includes(k));
      const insertAt = validIdx >= targetValid.length ? target.tiles.length : target.tiles.indexOf(targetValid[validIdx]);
      target.tiles.splice(insertAt, 0, drag.key);
      applyLayout(next);
    } else {
      if (drag.courseId !== c.id) return;
      const course = courses.find((x) => x.id === c.id);
      if (!course) return;
      const moving = course.customTiles.find((t) => t.id === drag.key);
      if (!moving) return;
      // Position among the group's custom tiles (rendered after the built-ins).
      let at = Math.max(0, index - builtins.length);
      if (moving.groupId === lg.id) {
        const oldIdx = course.customTiles.filter((t) => t.groupId === lg.id).findIndex((t) => t.id === drag.key);
        if (oldIdx !== -1 && oldIdx < at) at -= 1;
      }
      const others = course.customTiles.filter((t) => t.groupId !== lg.id && t.id !== drag.key);
      const inGroup = course.customTiles.filter((t) => t.groupId === lg.id && t.id !== drag.key);
      at = Math.min(at, inGroup.length);
      inGroup.splice(at, 0, { ...moving, groupId: lg.id });
      void persistCustomTiles(course, [...others, ...inGroup]);
    }
  };

  const saveGroupRename = () => {
    if (!groupRename) return;
    const label = groupRename.label.trim() || "Untitled";
    applyLayout(cardLayout.map((g) => (g.id === groupRename.id ? { ...g, label } : g)));
    setGroupRename(null);
  };

  // Delete a layout group: its built-in tiles return to their DEFAULT_CARD_LAYOUT
  // groups and custom tiles in it move to the first remaining group (every course).
  const deleteLayoutGroup = (groupId: string) => {
    const doomed = cardLayout.find((g) => g.id === groupId);
    if (!doomed || cardLayout.length <= 1) return;
    const remaining = cardLayout.filter((g) => g.id !== groupId).map((g) => ({ ...g, tiles: [...g.tiles] }));
    for (const key of doomed.tiles) {
      if (!BUILT_IN_TILE_KEYS.has(key)) continue;
      const def = DEFAULT_CARD_LAYOUT.find((d) => d.tiles.includes(key));
      const home = (def && remaining.find((g) => g.id === def.id)) ?? remaining[0];
      if (!home.tiles.includes(key)) home.tiles.push(key);
    }
    applyLayout(remaining);
    setGroupDeleteConfirm(null);
    const fallback = remaining[0].id;
    for (const course of courses) {
      if (course.customTiles.some((t) => t.groupId === groupId)) {
        void persistCustomTiles(course, course.customTiles.map((t) => (t.groupId === groupId ? { ...t, groupId: fallback } : t)));
      }
    }
  };

  // Append a new empty group and open its rename (from the card that clicked).
  const addLayoutGroup = (cardId: string) => {
    const id = crypto.randomUUID();
    applyLayout([...cardLayout, { id, label: "New category", tiles: [] }]);
    setGroupRename({ id, cardId, label: "New category" });
  };

  const submitTileAdd = async () => {
    if (!tileAdd || !tileAdd.label.trim()) return;
    const course = courses.find((x) => x.id === tileAdd.courseId);
    if (!course) return;
    const next = [...course.customTiles, { id: crypto.randomUUID(), label: tileAdd.label.trim(), value: tileAdd.value, groupId: tileAdd.groupId }];
    setTileAdd(null);
    await persistCustomTiles(course, next);
  };

  // Persist the inline custom-tile value edit (called on blur).
  const saveCustomTileValue = () => {
    if (!customTileEdit) return;
    const edit = customTileEdit;
    setCustomTileEdit(null);
    const course = courses.find((x) => x.id === edit.courseId);
    if (!course) return;
    const current = course.customTiles.find((t) => t.id === edit.tileId);
    if (!current || current.value === edit.value) return;
    void persistCustomTiles(course, course.customTiles.map((t) => (t.id === edit.tileId ? { ...t, value: edit.value } : t)));
  };

  const removeCustomTile = (c: Course, tileId: string) => {
    void persistCustomTiles(c, c.customTiles.filter((t) => t.id !== tileId));
  };

  // Render one custom tile (label header + value text, inline-editable, removable).
  const renderCustomTile = (t: CourseCustomTile, c: Course) => {
    const editing = customTileEdit && customTileEdit.courseId === c.id && customTileEdit.tileId === t.id;
    return (
      <div
        className={`${styles.courseResource} ${styles.courseResourceClickable}`}
        data-tile-editing={editing ? "true" : undefined}
        onClick={tileClick(() => {
          if (!editing) setCustomTileEdit({ courseId: c.id, tileId: t.id, value: t.value });
        })}
      >
        <div className={styles.courseResourceHead}>
          <span className={styles.courseResourceLabel}>{tileGrabHandle(t.id, c.id)}{t.label}</span>
          <button
            type="button"
            className={styles.tileEditBtn}
            title="Edit"
            onClick={() => setCustomTileEdit({ courseId: c.id, tileId: t.id, value: t.value })}
          >
            <PencilIcon />
          </button>
        </div>
        {editing ? (
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            autoFocus
            value={customTileEdit.value}
            onChange={(e) => setCustomTileEdit((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
            onBlur={saveCustomTileValue}
          />
        ) : t.value ? (
          <span className={styles.courseResourceValue}>{t.value}</span>
        ) : (
          <span className={styles.courseResourceEmpty}>Not set</span>
        )}
        <div className={styles.courseResourceActions}>
          <button
            type="button"
            className={styles.linkButton}
            style={{ color: "var(--danger)" }}
            onClick={() => removeCustomTile(c, t.id)}
          >
            Remove
          </button>
        </div>
      </div>
    );
  };

  // Render one built-in tile by its layout key. Returns null for unknown keys so
  // stale entries in a saved layout are ignored at render.
  const renderTile = (key: string, c: Course): React.ReactElement<React.HTMLAttributes<HTMLDivElement>> | null => {
    switch (key) {
      case "organization":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "githubOrg" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "githubOrg"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("organization")}{tileHideButton("organization", c)}Organization</span>
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
        );
      case "codebases":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "repos" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "repos"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("codebases")}{tileHideButton("codebases", c)}Codebase{c.repos.length > 1 ? "s" : ""}</span>
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
        );
      case "syllabus": {
        const sName = syllabusName(c.syllabusId);
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "syllabusId" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "syllabusId"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("syllabus")}{tileHideButton("syllabus", c)}Syllabus</span>
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
                  {canLms(c) && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      disabled={lmsBusyTile === `${c.id}:syllabus`}
                      onClick={() => void handleLmsSyllabusFromTile(c)}
                    >
                      {lmsBusyTile === `${c.id}:syllabus` ? "Loading..." : "From LMS"}
                    </button>
                  )}
                  {canImport(c) && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      disabled={lmsBusyTile !== null && lmsBusyTile.startsWith(`${c.id}:`)}
                      onClick={() => void handleImportSyllabusFromTile(c)}
                    >
                      {lmsBusyTile === `${c.id}:syllabus` ? "Loading..." : "From import"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className={styles.courseResourceEmpty}>Not linked</span>
                {(canLms(c) || canImport(c)) && (
                  <div className={styles.courseResourceActions}>
                    {canLms(c) && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={lmsBusyTile === `${c.id}:syllabus`}
                        onClick={() => void handleLmsSyllabusFromTile(c)}
                      >
                        {lmsBusyTile === `${c.id}:syllabus` ? "Loading..." : "From LMS"}
                      </button>
                    )}
                    {canImport(c) && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={lmsBusyTile !== null && lmsBusyTile.startsWith(`${c.id}:`)}
                        onClick={() => void handleImportSyllabusFromTile(c)}
                      >
                        {lmsBusyTile === `${c.id}:syllabus` ? "Loading..." : "From import"}
                      </button>
                    )}
                  </div>
                )}
              </>
            ))}
          </div>
        );
      }
      case "textbook":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "textbook" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "textbook"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("textbook")}{tileHideButton("textbook", c)}Textbook</span>
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
        );
      case "description":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "description" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "description"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("description")}{tileHideButton("description", c)}Description</span>
              <button
                type="button"
                className={styles.tileEditBtn}
                title="Edit"
                onClick={() => startTileEdit(c, "description")}
              >
                <PencilIcon />
              </button>
            </div>
            {tileEdit?.id === c.id && tileEdit?.field === "description"
              ? tileTextAreaEditor()
              : c.description
                ? (
                  <span className={styles.courseResourceValue} title={c.description}>
                    {c.description.length > 90 ? c.description.slice(0, 90) + "…" : c.description}
                  </span>
                )
                : (
                  <span className={styles.courseResourceEmpty}>Not set</span>
                )}
          </div>
        );
      case "startDate":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "startDate" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "startDate"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("startDate")}{tileHideButton("startDate", c)}Start date</span>
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
                  <>
                    <span className={styles.courseResourceValue}>{new Date(`${c.startDate}T00:00:00`).toLocaleDateString()}</span>
                    {(canLms(c) || canImport(c)) && (
                      <div className={styles.courseResourceActions}>
                        {canLms(c) && (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={lmsBusyTile === `${c.id}:startDate`}
                            onClick={() => void handleLmsStartDateFromTile(c)}
                          >
                            {lmsBusyTile === `${c.id}:startDate` ? "Loading..." : "From LMS"}
                          </button>
                        )}
                        {canImport(c) && (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={lmsBusyTile !== null && lmsBusyTile.startsWith(`${c.id}:`)}
                            onClick={() => void handleImportStartDateFromTile(c)}
                          >
                            {lmsBusyTile === `${c.id}:startDate` ? "Loading..." : "From import"}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )
                : (
                  <>
                    <span className={styles.courseResourceEmpty}>Not set</span>
                    {(canLms(c) || canImport(c)) && (
                      <div className={styles.courseResourceActions}>
                        {canLms(c) && (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={lmsBusyTile === `${c.id}:startDate`}
                            onClick={() => void handleLmsStartDateFromTile(c)}
                          >
                            {lmsBusyTile === `${c.id}:startDate` ? "Loading..." : "From LMS"}
                          </button>
                        )}
                        {canImport(c) && (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={lmsBusyTile !== null && lmsBusyTile.startsWith(`${c.id}:`)}
                            onClick={() => void handleImportStartDateFromTile(c)}
                          >
                            {lmsBusyTile === `${c.id}:startDate` ? "Loading..." : "From import"}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
          </div>
        );
      case "weeks":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "weeks" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "weeks"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("weeks")}{tileHideButton("weeks", c)}Weeks</span>
              <button
                type="button"
                className={styles.tileEditBtn}
                title="Edit"
                onClick={() => startTileEdit(c, "weeks")}
              >
                <PencilIcon />
              </button>
            </div>
            {tileEdit?.id === c.id && tileEdit?.field === "weeks"
              ? tileNumberEditor()
              : c.weeks !== null
                ? (
                  <>
                    <span className={styles.courseResourceValue}>{c.weeks}</span>
                    {(canLms(c) || canImport(c)) && (
                      <div className={styles.courseResourceActions}>
                        {canLms(c) && (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={lmsBusyTile === `${c.id}:weeks`}
                            onClick={() => void handleLmsWeeksFromTile(c)}
                          >
                            {lmsBusyTile === `${c.id}:weeks` ? "Loading..." : "From LMS"}
                          </button>
                        )}
                        {canImport(c) && (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={lmsBusyTile !== null && lmsBusyTile.startsWith(`${c.id}:`)}
                            onClick={() => void handleImportWeeksFromTile(c)}
                          >
                            {lmsBusyTile === `${c.id}:weeks` ? "Loading..." : "From import"}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )
                : (
                  <>
                    <span className={styles.courseResourceEmpty}>Not set</span>
                    {(canLms(c) || canImport(c)) && (
                      <div className={styles.courseResourceActions}>
                        {canLms(c) && (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={lmsBusyTile === `${c.id}:weeks`}
                            onClick={() => void handleLmsWeeksFromTile(c)}
                          >
                            {lmsBusyTile === `${c.id}:weeks` ? "Loading..." : "From LMS"}
                          </button>
                        )}
                        {canImport(c) && (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={lmsBusyTile !== null && lmsBusyTile.startsWith(`${c.id}:`)}
                            onClick={() => void handleImportWeeksFromTile(c)}
                          >
                            {lmsBusyTile === `${c.id}:weeks` ? "Loading..." : "From import"}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
          </div>
        );
      case "tests":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "tests" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "tests"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("tests")}{tileHideButton("tests", c)}Tests</span>
              <button
                type="button"
                className={styles.tileEditBtn}
                title="Edit"
                onClick={() => startTileEdit(c, "tests")}
              >
                <PencilIcon />
              </button>
            </div>
            {tileEdit?.id === c.id && tileEdit?.field === "tests"
              ? tileNumberEditor()
              : c.tests !== null
                ? (
                  <span className={styles.courseResourceValue}>{c.tests}</span>
                )
                : (
                  <span className={styles.courseResourceEmpty}>Not set</span>
                )}
          </div>
        );
      case "dayTime":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "dayTime" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "dayTime"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("dayTime")}{tileHideButton("dayTime", c)}Day/Time</span>
              <button
                type="button"
                className={styles.tileEditBtn}
                title="Edit"
                onClick={() => startTileEdit(c, "dayTime")}
              >
                <PencilIcon />
              </button>
            </div>
            {tileEdit?.id === c.id && tileEdit?.field === "dayTime"
              ? tileEditor(false, "MW 10:00-11:15")
              : c.dayTime
                ? (
                  <span className={styles.courseResourceValue}>{c.dayTime}</span>
                )
                : (
                  <span className={styles.courseResourceEmpty}>Not set</span>
                )}
          </div>
        );
      case "lms":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "lms" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "lms"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("lms")}{tileHideButton("lms", c)}LMS</span>
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
                : institutionLms(c)
                  ? (
                    <>
                      <span className={styles.courseResourceValue}>{institutionLms(c) === "canvas" ? "Canvas" : institutionLms(c) === "blackboard" ? "Blackboard" : institutionLms(c)}</span>
                      <span className={styles.fieldHint} style={{ margin: 0 }}>From the institution</span>
                    </>
                  )
                  : (
                    <span className={styles.courseResourceEmpty}>Not set</span>
                  )}
          </div>
        );
      case "integrations":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "integrations" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "integrations"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("integrations")}{tileHideButton("integrations", c)}Integration{c.integrations.length > 1 ? "s" : ""}</span>
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
        );
      case "roster":
        return (
          <div className={`${styles.courseResource} ${styles.courseResourceClickable}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "roster" ? "true" : undefined} onClick={tileClick(() => startTileEdit(c, "roster"))}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("roster")}{tileHideButton("roster", c)}Roster</span>
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
                      {canLms(c) && (
                        <button
                          type="button"
                          className={styles.linkButton}
                          disabled={lmsBusyTile === `${c.id}:roster`}
                          onClick={() => void handleLmsRosterFromTile(c)}
                        >
                          {lmsBusyTile === `${c.id}:roster` ? "Loading..." : "From LMS"}
                        </button>
                      )}
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
                  <>
                    <span className={styles.courseResourceEmpty}>Not set</span>
                    {canLms(c) && (
                      <div className={styles.courseResourceActions}>
                        <button
                          type="button"
                          className={styles.linkButton}
                          disabled={lmsBusyTile === `${c.id}:roster`}
                          onClick={() => void handleLmsRosterFromTile(c)}
                        >
                          {lmsBusyTile === `${c.id}:roster` ? "Loading..." : "From LMS"}
                        </button>
                      </div>
                    )}
                  </>
                )}
          </div>
        );
      case "csv":
        return (
          <div className={`${styles.courseResource}${!c.csvData ? " " + styles.courseResourceClickable : ""}`} data-tile-editing={tileEdit?.id === c.id && tileEdit?.field === "csv" ? "true" : undefined}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("csv")}{tileHideButton("csv", c)}Schedule of Topics</span>
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
                  <span className={styles.courseResourceEmpty}>No schedule saved yet - Course Refresh saves one here, or upload a CSV.</span>
                  <div className={styles.courseResourceActions}>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={uploadingCsv}
                      onClick={() => csvUploadRef.current?.click()}
                    >
                      {uploadingCsv ? "Uploading…" : "Upload CSV"}
                    </Button>
                    {canLms(c) && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={lmsBusyTile === `${c.id}:csv`}
                        onClick={() => void handleLmsCsvFromTile(c)}
                      >
                        {lmsBusyTile === `${c.id}:csv` ? "Loading..." : "From LMS"}
                      </button>
                    )}
                    {canImport(c) && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={lmsBusyTile !== null && lmsBusyTile.startsWith(`${c.id}:`)}
                        onClick={() => void handleImportCsvFromTile(c)}
                      >
                        {lmsBusyTile === `${c.id}:csv` ? "Loading..." : "From import"}
                      </button>
                    )}
                  </div>
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
                      onClick={() => setCsvPreview({ name: c.csvName || "course.csv", csv: c.csvData ?? "" })}
                    >
                      Preview
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
                    {canLms(c) && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={lmsBusyTile === `${c.id}:csv`}
                        onClick={() => void handleLmsCsvFromTile(c)}
                      >
                        {lmsBusyTile === `${c.id}:csv` ? "Loading..." : "From LMS"}
                      </button>
                    )}
                    {canImport(c) && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={lmsBusyTile !== null && lmsBusyTile.startsWith(`${c.id}:`)}
                        onClick={() => void handleImportCsvFromTile(c)}
                      >
                        {lmsBusyTile === `${c.id}:csv` ? "Loading..." : "From import"}
                      </button>
                    )}
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
                </>
              )}
          </div>
        );
      case "rubric":
        return (
          <div className={`${styles.courseResource}${!c.rubricData ? " " + styles.courseResourceClickable : ""}`}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("rubric")}{tileHideButton("rubric", c)}Rubric</span>
              {c.rubricData && c.rubricData.trim() && (
                <span className={styles.navBadge} style={{ marginLeft: 8 }}>
                  {(() => {
                    const rows = parseGeneratedRubric(c.rubricData ?? "");
                    const count = rows?.length ?? 0;
                    return `${count} criteri${count === 1 ? "on" : "a"}`;
                  })()}
                </span>
              )}
            </div>
            {!c.rubricData
              ? (
                <>
                  <span className={styles.courseResourceEmpty}>No rubric yet - Course Refresh generates one here, or upload a rubric.</span>
                  <div className={styles.courseResourceActions}>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={uploadingRubric}
                      onClick={() => openRubricPicker(c)}
                    >
                      {uploadingRubric ? "Uploading…" : "Upload rubric"}
                    </Button>
                    {canLms(c) && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={lmsBusyTile === `${c.id}:rubric`}
                        onClick={() => void handleLmsRubricFromTile(c)}
                      >
                        {lmsBusyTile === `${c.id}:rubric` ? "Loading..." : "From LMS"}
                      </button>
                    )}
                    {canImport(c) && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={lmsBusyTile !== null && lmsBusyTile.startsWith(`${c.id}:`)}
                        onClick={() => void handleImportRubricFromTile(c)}
                      >
                        {lmsBusyTile === `${c.id}:rubric` ? "Loading..." : "From import"}
                      </button>
                    )}
                  </div>
                </>
              )
              : (
                <>
                  <span className={styles.courseResourceValue}>{c.rubricName || "rubric.md"}</span>
                  <div className={styles.courseResourceActions}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => setRubricPreview({ name: c.rubricName || "rubric.md", rubric: c.rubricData ?? "" })}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => {
                        const blob = new Blob([c.rubricData ?? ""], { type: "text/markdown;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = c.rubricName || "rubric.md";
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
                      disabled={uploadingRubric}
                      onClick={() => openRubricPicker(c)}
                    >
                      {uploadingRubric ? "Uploading…" : "Replace"}
                    </button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      style={{ color: "var(--danger)" }}
                      onClick={() => setRubricRemoveConfirm(rubricRemoveConfirm === c.id ? null : c.id)}
                    >
                      {rubricRemoveConfirm === c.id ? "Confirm" : "Remove"}
                    </button>
                    {canLms(c) && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={lmsBusyTile === `${c.id}:rubric`}
                        onClick={() => void handleLmsRubricFromTile(c)}
                      >
                        {lmsBusyTile === `${c.id}:rubric` ? "Loading..." : "From LMS"}
                      </button>
                    )}
                    {canImport(c) && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={lmsBusyTile !== null && lmsBusyTile.startsWith(`${c.id}:`)}
                        onClick={() => void handleImportRubricFromTile(c)}
                      >
                        {lmsBusyTile === `${c.id}:rubric` ? "Loading..." : "From import"}
                      </button>
                    )}
                  </div>
                  {rubricRemoveConfirm === c.id && (
                    <div style={{ marginTop: 8 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => {
                          void updateCourseHubAction(c.id, { ...courseToInput(c), rubricName: null, rubricData: null }).then((r) => {
                            if (!("error" in r)) {
                              setCourses((prev) => {
                                const next = prev.map((course) => (course.id === r.course.id ? r.course : course));
                                if (hubCache) hubCache = { ...hubCache, courses: next };
                                return next;
                              });
                              setRubricRemoveConfirm(null);
                            } else {
                              setError(r.error);
                            }
                          });
                        }}
                      >
                        Delete rubric
                      </Button>
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setRubricRemoveConfirm(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </>
              )}
          </div>
        );
      case "lmsExports":
        return (
          <div className={styles.courseResource}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("lmsExports")}{tileHideButton("lmsExports", c)}LMS Exports</span>
              {c.exportFiles.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: "0.85em", color: "var(--text-secondary)" }}>
                  {c.exportFiles.length} file(s)
                </span>
              )}
            </div>
            {c.exportFiles.length === 0 ? (
              <>
                <span className={styles.courseResourceEmpty}>No exports yet - Course Refresh saves its cartridge here, or upload an LMS export.</span>
                <div className={styles.courseResourceActions}>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={uploadingExport}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".imscc,.zip,application/zip";
                      input.onchange = () => {
                        const f = input.files?.[0];
                        if (f) void handleExportUpload(c, f);
                      };
                      input.click();
                    }}
                  >
                    {uploadingExport ? "Uploading..." : "Upload export"}
                  </Button>
                  {canLms(c) && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      disabled={lmsBusyTile === `${c.id}:lmsExports`}
                      onClick={() => void handleLmsExportFromTile(c)}
                    >
                      {lmsBusyTile === `${c.id}:lmsExports` ? "Exporting... (takes a minute)" : "Pull export from LMS"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ marginTop: 8 }}>
                  {c.exportFiles.map((f) => (
                    <div key={f.path} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border-color)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9em" }}>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.name} - {(f.size / 1048576).toFixed(1)} MB
                        </span>
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.85em", marginLeft: 8 }}>
                          {new Date(f.addedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => void handleDownloadExportFile(f)}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className={styles.linkButton}
                          style={{ color: "var(--danger)" }}
                          onClick={() => {
                            const confirmKey = `${c.id}:${f.path}`;
                            setExportRemoveConfirm(exportRemoveConfirm === confirmKey ? null : confirmKey);
                          }}
                        >
                          {exportRemoveConfirm === `${c.id}:${f.path}` ? "Confirm" : "Remove"}
                        </button>
                      </div>
                      {exportRemoveConfirm === `${c.id}:${f.path}` && (
                        <div style={{ marginTop: 8 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            color="error"
                            onClick={() => void handleRemoveExportFile(c, f)}
                          >
                            Delete export
                          </Button>
                          <Button
                            variant="text"
                            size="small"
                            onClick={() => setExportRemoveConfirm(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className={styles.courseResourceActions} style={{ marginTop: 12 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={uploadingExport}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".imscc,.zip,application/zip";
                      input.onchange = () => {
                        const f = input.files?.[0];
                        if (f) void handleExportUpload(c, f);
                      };
                      input.click();
                    }}
                  >
                    {uploadingExport ? "Uploading..." : "Upload export"}
                  </Button>
                </div>
              </>
            )}
          </div>
        );
      case "materials":
        return (
          <div className={`${styles.courseResource}${!c.materialsZipPath ? " " + styles.courseResourceClickable : ""}`}>
            <div className={styles.courseResourceHead}>
              <span className={styles.courseResourceLabel}>{tileGrabHandle("materials")}{tileHideButton("materials", c)}Materials</span>
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
              {c.materialsFiles.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  {c.materialsFiles.map((f) => (
                    <div key={f.path} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border-color)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9em" }}>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.name} - {(f.size / 1048576).toFixed(1)} MB
                        </span>
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.85em", marginLeft: 8 }}>
                          {new Date(f.addedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={async () => {
                            try {
                              const url = await getCourseZipUrl(supabase, f.path);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = f.name;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Could not download the file.");
                            }
                          }}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className={styles.linkButton}
                          style={{ color: "var(--danger)" }}
                          disabled={removingMaterialFile === f.path}
                          onClick={() => void handleRemoveMaterialFile(c, f.path)}
                        >
                          {removingMaterialFile === f.path ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        );
      default:
        return null;
    }
  };

  // Render one layout group inside a course card: label row with hover-revealed
  // actions, the shared built-in tiles, then this card's custom tiles.
  const renderCardGroup = (lg: CardLayoutGroup, c: Course) => {
    const builtins = visibleGroupBuiltins(lg, c);
    const customs = c.customTiles.filter((t) => t.groupId === lg.id);
    const total = builtins.length + customs.length;
    const renaming = groupRename && groupRename.id === lg.id && groupRename.cardId === c.id;
    const confirmingDelete = groupDeleteConfirm && groupDeleteConfirm.id === lg.id && groupDeleteConfirm.cardId === c.id;
    const adding = tileAdd && tileAdd.courseId === c.id && tileAdd.groupId === lg.id;
    const isDropGroup = dropHint && dropHint.cardId === c.id && dropHint.groupId === lg.id;
    return (
      <div
        key={lg.id}
        className={`${styles.courseResourceGroup}${isDropGroup ? " " + styles.groupDropTarget : ""}`}
        onDragOver={(e) => handleTileDragOver(e, c.id, lg.id, total)}
        onDrop={(e) => handleTileDrop(e, c, lg, total)}
      >
        <div className={styles.courseResourceGroupHead}>
          {renaming ? (
            <TextField
              size="small"
              autoFocus
              value={groupRename.label}
              onChange={(e) => setGroupRename((p) => (p ? { ...p, label: e.target.value } : p))}
              onBlur={saveGroupRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveGroupRename();
                if (e.key === "Escape") setGroupRename(null);
              }}
            />
          ) : (
            <>
              <span className={styles.courseResourceGroupLabel}>{lg.label}</span>
              <span className={styles.courseResourceGroupActions}>
                <button type="button" className={styles.linkButton} style={{ fontSize: "0.75em" }} onClick={() => setGroupRename({ id: lg.id, cardId: c.id, label: lg.label })}>
                  Rename
                </button>
                {confirmingDelete ? (
                  <>
                    <button type="button" className={styles.linkButton} style={{ fontSize: "0.75em", color: "var(--danger)" }} onClick={() => deleteLayoutGroup(lg.id)}>
                      Delete group (tiles return to defaults)
                    </button>
                    <button type="button" className={styles.linkButton} style={{ fontSize: "0.75em" }} onClick={() => setGroupDeleteConfirm(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  cardLayout.length > 1 && (
                    <button type="button" className={styles.linkButton} style={{ fontSize: "0.75em" }} onClick={() => setGroupDeleteConfirm({ id: lg.id, cardId: c.id })}>
                      Delete
                    </button>
                  )
                )}
                <button type="button" className={styles.linkButton} style={{ fontSize: "0.75em" }} onClick={() => setTileAdd({ courseId: c.id, groupId: lg.id, label: "", value: "" })}>
                  + Tile
                </button>
              </span>
            </>
          )}
        </div>
        <div className={styles.courseResources}>
          {builtins.map((tileKey, i) => {
            const tile = renderTile(tileKey, c);
            if (!tile) return null;
            const dropBefore = dropHint && dropHint.cardId === c.id && dropHint.groupId === lg.id && dropHint.index === i;
            const dragging = dragTile && !dragTile.courseId && dragTile.key === tileKey;
            return cloneElement(tile, {
              key: tileKey,
              className: `${tile.props.className ?? ""}${dragging ? " " + styles.tileDragging : ""}${dropBefore ? " " + styles.tileDropBefore : ""}`,
              onDragOver: (e: React.DragEvent<HTMLDivElement>) => handleTileDragOver(e, c.id, lg.id, i),
              onDrop: (e: React.DragEvent<HTMLDivElement>) => handleTileDrop(e, c, lg, i),
            });
          })}
          {customs.map((t, j) => {
            const i = builtins.length + j;
            const tile = renderCustomTile(t, c);
            const dropBefore = dropHint && dropHint.cardId === c.id && dropHint.groupId === lg.id && dropHint.index === i;
            const dragging = dragTile && dragTile.courseId === c.id && dragTile.key === t.id;
            return cloneElement(tile, {
              key: t.id,
              className: `${tile.props.className ?? ""}${dragging ? " " + styles.tileDragging : ""}${dropBefore ? " " + styles.tileDropBefore : ""}`,
              onDragOver: (e: React.DragEvent<HTMLDivElement>) => handleTileDragOver(e, c.id, lg.id, i),
              onDrop: (e: React.DragEvent<HTMLDivElement>) => handleTileDrop(e, c, lg, i),
            });
          })}
          {adding && (
            <div className={styles.courseResource}>
              <div className={styles.courseResourceHead}>
                <span className={styles.courseResourceLabel}>New tile</span>
              </div>
              <div className={styles.tileEditor}>
                <TextField
                  size="small"
                  autoFocus
                  label="Label"
                  value={tileAdd.label}
                  onChange={(e) => setTileAdd((p) => (p ? { ...p, label: e.target.value } : p))}
                />
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  label="Value"
                  value={tileAdd.value}
                  onChange={(e) => setTileAdd((p) => (p ? { ...p, value: e.target.value } : p))}
                />
                <div className={styles.tileEditorActions}>
                  <Button variant="contained" size="small" disabled={!tileAdd.label.trim()} onClick={() => void submitTileAdd()}>
                    Add
                  </Button>
                  <Button variant="text" size="small" onClick={() => setTileAdd(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Save the whole institution field list (state first, fire-and-forget save).
  const applyInstFields = (acronym: string, next: InstitutionField[]) => {
    setInstFields((prev) => ({ ...prev, [acronym]: next }));
    if (user) void saveInstitutionFields(supabase, user.id, acronym, next).catch((err) => console.error("Failed to save institution fields:", err));
  };

  // Persist the inline institution-field edit (Enter/blur).
  const saveInstFieldEdit = () => {
    if (!instFieldEdit) return;
    const edit = instFieldEdit;
    setInstFieldEdit(null);
    const list = instFields[edit.acronym];
    if (!list) return;
    const current = list.find((f) => f.id === edit.id);
    if (!current || (current.value === edit.value.trim() && (current.lms ?? "") === (edit.lms ?? ""))) return;
    applyInstFields(edit.acronym, list.map((f) => (f.id === edit.id ? { ...f, value: edit.value.trim(), lms: edit.lms ?? current.lms } : f)));
  };

  // Keep the click-outside listener's ref pointing at the latest closure.
  useEffect(() => {
    saveInstFieldEditRef.current = saveInstFieldEdit;
  });

  useEffect(() => {
    instFieldsRef.current = instFields;
  });

  useEffect(() => {
    coursesRef.current = courses;
  });

  const submitInstFieldAdd = () => {
    if (!instFieldAdd || !instFieldAdd.label.trim()) return;
    const list = instFields[instFieldAdd.acronym];
    if (!list) return;
    applyInstFields(instFieldAdd.acronym, [...list, { id: crypto.randomUUID(), label: instFieldAdd.label.trim(), type: instFieldAdd.type, value: "" }]);
    setInstFieldAdd(null);
  };

  // Upload a .docx straight from the institution's template chip: save it to
  // the template library, then select it as the chip's value.
  const handleInstTemplateUpload = async (acronym: string, fieldId: string, file: File) => {
    if (!/\.docx$/i.test(file.name)) {
      setError("The template must be a Word .docx file.");
      return;
    }
    setInstTemplateUploading(acronym);
    setError(null);
    try {
      const base64 = await readFileBase64(file);
      if (base64.length > 8 * 1024 * 1024) {
        setError("That file is too large (limit ~6 MB).");
        return;
      }
      const name = file.name.replace(/\.docx$/i, "").trim() || file.name;
      const r = await createSyllabusTemplateAction(name, file.name, base64);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setSyllabusTemplates((prev) => [
        { id: r.template.id, name: r.template.name },
        ...(prev ?? []).filter((t) => t.id !== r.template.id),
      ]);
      setInstFieldEdit(null);
      // Read through the ref: other field edits may have saved while the
      // upload was in flight, and a render-time snapshot would revert them.
      const list = instFieldsRef.current[acronym];
      if (list) {
        applyInstFields(acronym, list.map((f) => (f.id === fieldId ? { ...f, value: r.template.id } : f)));
      }
      // Reconcile with the server list: the optimistic prepend above flips
      // syllabusTemplates from null, which cancels the initial lazy load. The
      // upload itself succeeded, so a failed refetch stays silent.
      try {
        const listResult = await listSyllabusTemplatesAction();
        if (!("error" in listResult)) {
          setSyllabusTemplates(listResult.templates.map((t) => ({ id: t.id, name: t.name })));
        }
      } catch {
        // Keep the optimistic entry.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the template.");
    } finally {
      setInstTemplateUploading(null);
    }
  };

  // Compact per-institution "Common fields" panel above the section's cards.
  const renderInstitutionPanel = (acronym: string) => {
    const fields = instFields[acronym];
    const addingField = instFieldAdd && instFieldAdd.acronym === acronym;
    return (
      <div className={styles.instFieldsPanel}>
        {fields === undefined ? (
          <span className={styles.fieldHint}>Loading fields...</span>
        ) : (
          <>
            {fields.map((f) => {
              const editing = instFieldEdit && instFieldEdit.acronym === acronym && instFieldEdit.id === f.id;
              return (
                <div
                  key={f.id}
                  className={styles.instFieldChip}
                  data-inst-field-editing={editing ? "true" : "false"}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a, button, input, textarea, select, label")) return;
                    if (!editing) setInstFieldEdit({ acronym, id: f.id, value: f.value, lms: f.lms ?? "" });
                  }}
                >
                  <span className={styles.instFieldLabel}>{f.label}</span>
                  {editing ? (
                    f.type === "syllabusTemplate" ? (
                      <div>
                        <Typeahead
                          options={(syllabusTemplates ?? []).map((t) => ({ value: t.id, label: t.name }))}
                          value={instFieldEdit.value}
                          onChange={(v) => setInstFieldEdit((p) => (p ? { ...p, value: v } : p))}
                          placeholder={syllabusTemplates === null ? "Loading templates..." : "Choose a template..."}
                          loading={syllabusTemplates === null}
                          noOptionsText="No templates available"
                        />
                        <input
                          id={`inst-template-upload-${acronym}-${f.id}`}
                          type="file"
                          accept=".docx"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleInstTemplateUpload(acronym, f.id, file);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          className={styles.linkButton}
                          style={{ marginTop: 6, fontSize: "0.85em" }}
                          disabled={instTemplateUploading === acronym}
                          onClick={() => document.getElementById(`inst-template-upload-${acronym}-${f.id}`)?.click()}
                        >
                          {instTemplateUploading === acronym ? "Uploading..." : "Upload new template (.docx)"}
                        </button>
                      </div>
                    ) : f.type === "lms" ? (
                      <div>
                        <Typeahead
                          options={[
                            { value: "canvas", label: "Canvas" },
                            { value: "blackboard", label: "Blackboard" },
                          ]}
                          value={instFieldEdit.lms ?? ""}
                          onChange={(v) => setInstFieldEdit((p) => (p ? { ...p, lms: v } : p))}
                          placeholder="Choose an LMS..."
                        />
                        <TextField
                          size="small"
                          fullWidth
                          type="text"
                          value={instFieldEdit.value}
                          onChange={(e) => setInstFieldEdit((p) => (p ? { ...p, value: e.target.value } : p))}
                          onBlur={saveInstFieldEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveInstFieldEdit();
                            if (e.key === "Escape") setInstFieldEdit(null);
                          }}
                          placeholder="LMS URL"
                          style={{ marginTop: "6px" }}
                        />
                      </div>
                    ) : (
                      <TextField
                        size="small"
                        autoFocus
                        type={f.type === "date" ? "date" : "text"}
                        value={instFieldEdit.value}
                        onChange={(e) => setInstFieldEdit((p) => (p ? { ...p, value: e.target.value } : p))}
                        onBlur={saveInstFieldEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveInstFieldEdit();
                          if (e.key === "Escape") setInstFieldEdit(null);
                        }}
                      />
                    )
                  ) : f.value || (f.type === "lms" && f.lms) ? (
                    f.type === "date" ? (
                      <span className={styles.instFieldValue}>{new Date(`${f.value}T00:00:00`).toLocaleDateString()}</span>
                    ) : f.type === "url" ? (
                      <a className={styles.instFieldValue} href={f.value} target="_blank" rel="noreferrer">{f.value}</a>
                    ) : f.type === "syllabusTemplate" ? (
                      <span className={styles.instFieldValue}>{(syllabusTemplates ?? []).find((t) => t.id === f.value)?.name ?? f.value}</span>
                    ) : f.type === "lms" ? (
                      <>
                        {f.lms && (
                          <span className={styles.instFieldValue}>{f.lms === "canvas" ? "Canvas" : f.lms === "blackboard" ? "Blackboard" : f.lms}</span>
                        )}
                        {f.value && (
                          <a className={styles.instFieldValue} href={f.value} target="_blank" rel="noreferrer">{f.value}</a>
                        )}
                      </>
                    ) : (
                      <span className={styles.instFieldValue}>{f.value}</span>
                    )
                  ) : (
                    <span className={styles.courseResourceEmpty}>Not set</span>
                  )}
                  {!DEFAULT_INSTITUTION_FIELDS.some((d) => d.id === f.id) && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      style={{ color: "var(--danger)", fontSize: "0.75em", textAlign: "left" }}
                      onClick={() => applyInstFields(acronym, fields.filter((x) => x.id !== f.id))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            {addingField ? (
              <div className={styles.instFieldChip} style={{ cursor: "default" }}>
                <TextField
                  size="small"
                  autoFocus
                  label="Label"
                  value={instFieldAdd.label}
                  onChange={(e) => setInstFieldAdd((p) => (p ? { ...p, label: e.target.value } : p))}
                />
                <TextField
                  select
                  size="small"
                  label="Type"
                  value={instFieldAdd.type}
                  onChange={(e) => setInstFieldAdd((p) => (p ? { ...p, type: e.target.value as "text" | "date" | "url" } : p))}
                >
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="date">Date</MenuItem>
                  <MenuItem value="url">URL</MenuItem>
                </TextField>
                <div className={styles.tileEditorActions}>
                  <Button variant="contained" size="small" disabled={!instFieldAdd.label.trim()} onClick={submitInstFieldAdd}>
                    Add
                  </Button>
                  <Button variant="text" size="small" onClick={() => setInstFieldAdd(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.linkButton}
                style={{ fontSize: "0.85em", alignSelf: "center" }}
                onClick={() => setInstFieldAdd({ acronym, label: "", type: "text" })}
              >
                Add field
              </button>
            )}
          </>
        )}
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
            <TextField
              label="Weeks"
              size="small"
              fullWidth
              type="number"
              value={form.weeks}
              onChange={(e) => update({ weeks: e.target.value })}
            />
            <TextField
              label="Tests"
              size="small"
              fullWidth
              type="number"
              value={form.tests}
              onChange={(e) => update({ tests: e.target.value })}
            />
            <TextField
              label="Day/Time"
              size="small"
              fullWidth
              placeholder="MW 10:00-11:15"
              value={form.dayTime}
              onChange={(e) => update({ dayTime: e.target.value })}
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
                <div className={styles.courseGroupSticky}>
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
                  {/* Per-institution common fields (signed-in only; not for the "No institution" section). */}
                  {open && user && g.key !== NO_INSTITUTION && renderInstitutionPanel(g.key)}
                </div>
                {open && (
                  <div className={styles.courseGrid}>
                    {g.courses.map((c) => {
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

                {cardLayout.map((lg) => renderCardGroup(lg, c))}

                {c.hiddenTiles.some((k) => BUILT_IN_TILE_KEYS.has(k)) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: "0.8em", color: "var(--text-secondary)" }}>
                    <span>Hidden tiles:</span>
                    {c.hiddenTiles.filter((k) => BUILT_IN_TILE_KEYS.has(k)).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={styles.linkButton}
                        style={{ fontSize: "inherit" }}
                        title="Restore this tile"
                        onClick={() => restoreTile(c, k)}
                      >
                        {TILE_LABELS[k] ?? k}
                      </button>
                    ))}
                  </div>
                )}

                <div>
                  <button type="button" className={styles.linkButton} style={{ fontSize: "0.85em" }} onClick={() => addLayoutGroup(c.id)}>
                    Add category
                  </button>
                </div>

                <div className={styles.courseResources}>
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

      {/* Common Resources section */}
      {state === "idle" && !form && (
        <div className={styles.card} style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: "1rem", marginBottom: 8, marginTop: 0 }}>Common Resources</h3>
          <p className={styles.fieldHint}>The Starter Materials workflow adds these items to every course&apos;s Start Here module, in this order.</p>

          {!user ? (
            <p className={styles.fieldHint}>Sign in to manage common resources.</p>
          ) : (
            <>
              {/* Items list */}
              <div style={{ marginBottom: 20 }}>
                {commonResources.length === 0 && (
                  <p className={styles.fieldHint}>{commonResourcesLoading ? "Loading common resources..." : "No items yet. Add files or pages below."}</p>
                )}
                {commonResources.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      padding: "12px",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    <span
                      className={styles.ghBadge}
                      style={{
                        backgroundColor: item.type === "file" ? "var(--badge-bg-neutral)" : "var(--badge-bg-neutral)",
                        color: "var(--text-secondary)",
                        fontSize: "0.75em",
                        padding: "4px 8px",
                        borderRadius: "3px",
                        flexShrink: 0,
                      }}
                    >
                      {item.type === "file" ? "File" : "Page"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingPageId === item.id && item.type === "page" ? (
                        <>
                          <TextField
                            size="small"
                            fullWidth
                            value={item.title}
                            onChange={(e) => handleUpdateItemTitle(item.id, e.target.value)}
                            placeholder="Page title"
                            sx={{ marginBottom: 1 }}
                          />
                          <TextField
                            size="small"
                            fullWidth
                            multiline
                            minRows={3}
                            value={item.body || ""}
                            onChange={(e) => handleUpdatePageBody(item.id, e.target.value)}
                            placeholder="Page content"
                          />
                        </>
                      ) : (
                        <>
                          <TextField
                            size="small"
                            fullWidth
                            value={item.title}
                            onChange={(e) => handleUpdateItemTitle(item.id, e.target.value)}
                          />
                          {item.type === "page" && item.body && (
                            <button
                              type="button"
                              className={styles.linkButton}
                              onClick={() => setEditingPageId(editingPageId === item.id ? null : item.id)}
                              style={{ marginTop: 6, fontSize: "0.85em" }}
                            >
                              {editingPageId === item.id ? "Collapse" : "Edit content"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={idx === 0}
                        onClick={() => handleMoveItem(item.id, "up")}
                        title="Move up"
                      >
                        Up
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={idx === commonResources.length - 1}
                        onClick={() => handleMoveItem(item.id, "down")}
                        title="Move down"
                      >
                        Down
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => handleRemoveItem(item.id)}
                        title="Remove"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add file section */}
              <div style={{ marginBottom: 16, paddingTop: 12, borderTop: "1px solid var(--border-color)" }}>
                <p style={{ margin: "0 0 8px 0", fontSize: "0.9em", fontWeight: 500 }}>Add file</p>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Typeahead
                      placeholder="Search library files..."
                      options={
                        libFiles
                          ? libFiles.map((f) => ({ value: f.id, label: f.name }))
                          : []
                      }
                      value={filePickerValue}
                      onChange={setFilePickerValue}
                      loading={libFiles === null}
                      noOptionsText={libFiles === null ? "Loading files..." : "No files found"}
                    />
                  </div>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={!filePickerValue || !libFiles}
                    onClick={() => {
                      const selected = filePickerValue;
                      if (libFiles && selected) {
                        handleAddFile(selected);
                      }
                    }}
                    style={{ marginTop: 4 }}
                  >
                    Add
                  </Button>
                </div>
                {libFiles === null && (
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={loadLibFiles}
                    style={{ marginTop: 8, fontSize: "0.85em" }}
                  >
                    Load files
                  </button>
                )}
              </div>

              {/* Add page section */}
              <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-color)" }}>
                <p style={{ margin: "0 0 8px 0", fontSize: "0.9em", fontWeight: 500 }}>Add page</p>
                <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                  <TextField
                    size="small"
                    label="Page title"
                    placeholder="e.g. Welcome to this course"
                    value={pageTitleDraft}
                    onChange={(e) => setPageTitleDraft(e.target.value)}
                  />
                  <TextField
                    size="small"
                    label="Page content"
                    placeholder="Enter page text here"
                    multiline
                    minRows={3}
                    value={pageBodyDraft}
                    onChange={(e) => setPageBodyDraft(e.target.value)}
                  />
                  <div>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={!pageTitleDraft.trim()}
                      onClick={handleAddPage}
                    >
                      Add page
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {preview && (
        <SyllabusPreviewModal name={preview.name} paragraphs={preview.paragraphs} onClose={() => setPreview(null)} />
      )}

      {csvPreview && (
        <CsvPreviewModal name={csvPreview.name} csv={csvPreview.csv} onClose={() => setCsvPreview(null)} />
      )}

      {rubricPreview && (
        <RubricPreviewModal name={rubricPreview.name} rubric={rubricPreview.rubric} onClose={() => setRubricPreview(null)} />
      )}
    </section>
  );
}
