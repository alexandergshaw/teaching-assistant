"use client";

// Ported from CoursesTab's tile handlers (Phase 2): pulling scalar/structural
// course fields either live from the LMS ("From LMS") or from a previously
// uploaded LMS export package ("From import"). Behavior, actions, and copy
// are unchanged from the monolith - only the module location moved.
import { useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  updateCourseHubAction,
  getCourseInfoAction,
  importLmsSyllabusAction,
  listCourseContentAction,
  listRubricsAction,
  getRubricAction,
  listCourseRosterAction,
  exportCourseCartridgeAction,
  importSyllabusHtmlAction,
  appendCourseExportFileAction,
  type ScheduleWeekPlan,
} from "@/app/actions";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import { courseToInput, rosterToRows, rowsToRoster } from "@/lib/courses-tab-helpers";
import { canLms, canImport, latestExportFile } from "@/lib/courses-table-helpers";
import { downloadCourseZipBlob, uploadCourseZipChunked, removeCourseZipObjects } from "@/lib/course-files";
import { parseCartridgeBlob, type CartridgeCourseData } from "@/lib/cartridge-import";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { scheduleToCsv } from "@/lib/workflows/types";
import type { Database } from "@/lib/supabase/types";

export const NO_COURSE_SETTINGS_ERROR =
  "This export package has no Canvas course settings, so tiles cannot be populated from it.";

// Parsed LMS export packages keyed by storage path; module-level so tab
// switches do not re-download. Values are promises so concurrent clicks on
// the same course share a single download+parse.
const cartridgeCache = new Map<string, Promise<CartridgeCourseData>>();

export interface UseCourseImportActionsArgs {
  supabase: SupabaseClient<Database>;
  user: { id: string } | null;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  reloadSyllabi: () => Promise<void>;
  /** Which `${courseId}:${field}` key is currently busy (LMS/import in flight). */
  busyKey: string | null;
  setBusyKey: (key: string | null) => void;
}

export interface UseCourseImportActionsReturn {
  busyKey: string | null;
  canLms: (c: Course) => boolean;
  canImport: (c: Course) => boolean;
  handleLmsStartDate: (c: Course) => Promise<void>;
  handleLmsSyllabus: (c: Course) => Promise<void>;
  handleLmsCsv: (c: Course) => Promise<void>;
  handleLmsWeeks: (c: Course) => Promise<void>;
  handleLmsRubric: (c: Course) => Promise<void>;
  handleLmsExport: (c: Course) => Promise<void>;
  handleImportStartDate: (c: Course) => Promise<void>;
  handleImportWeeks: (c: Course) => Promise<void>;
  handleImportCsv: (c: Course) => Promise<void>;
  handleImportRubric: (c: Course) => Promise<void>;
  handleImportSyllabus: (c: Course) => Promise<void>;
  /** For the roster tile: apply an LMS roster fetch result into a draft the caller can edit before saving. */
  fetchLmsRosterDraft: (c: Course) => Promise<string | null>;
}

function moduleNumbersAndTopics(modules: Array<{ name: string; items: Array<{ type: string; title: string }> }>): ScheduleWeekPlan[] {
  const rows: ScheduleWeekPlan[] = [];
  for (const courseModule of modules) {
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
  return rows;
}

export function useCourseImportActions({
  supabase,
  user,
  onCourseUpdated,
  setError,
  reloadSyllabi,
  busyKey,
  setBusyKey,
}: UseCourseImportActionsArgs): UseCourseImportActionsReturn {
  // Ref mirror so async handlers always evict/replace against the latest cache state.
  const cacheRef = useRef(cartridgeCache);

  const getCourseCartridge = useCallback((c: Course): Promise<CartridgeCourseData> => {
    const file = latestExportFile(c);
    if (!file) return Promise.reject(new Error("This course has no LMS export to import from."));
    const cached = cacheRef.current.get(file.path);
    if (cached) return cached;
    const promise = (async () => {
      const blob = await downloadCourseZipBlob(supabase, file);
      return await parseCartridgeBlob(blob);
    })();
    cacheRef.current.set(file.path, promise);
    promise.catch(() => cacheRef.current.delete(file.path));
    return promise;
  }, [supabase]);

  const saveCourseFromImport = useCallback(async (c: Course, patch: Partial<CourseInput>) => {
    const result = await updateCourseHubAction(c.id, { ...courseToInput(c), ...patch });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onCourseUpdated(result.course);
  }, [onCourseUpdated, setError]);

  const handleImportStartDate = useCallback(async (c: Course) => {
    const key = `${c.id}:startDate`;
    setBusyKey(key);
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
      setBusyKey(null);
    }
  }, [getCourseCartridge, saveCourseFromImport, setBusyKey, setError]);

  const handleImportWeeks = useCallback(async (c: Course) => {
    const key = `${c.id}:weeks`;
    setBusyKey(key);
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
        if (match) weekNumbers.add(parseInt(match[1], 10));
      }
      if (weekNumbers.size === 0) {
        setError("No Module NN modules found in the LMS export.");
        return;
      }
      await saveCourseFromImport(c, { weeks: weekNumbers.size });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the modules from the export.");
    } finally {
      setBusyKey(null);
    }
  }, [getCourseCartridge, saveCourseFromImport, setBusyKey, setError]);

  const handleImportCsv = useCallback(async (c: Course) => {
    const key = `${c.id}:csv`;
    setBusyKey(key);
    setError(null);
    try {
      const data = await getCourseCartridge(c);
      if (!data.hasCourseSettings) {
        setError(NO_COURSE_SETTINGS_ERROR);
        return;
      }
      const rows = moduleNumbersAndTopics(data.modules).sort((a, b) => a.week - b.week);
      if (rows.length === 0) {
        setError("No Module NN modules found in the LMS export.");
        return;
      }
      await saveCourseFromImport(c, { csvName: "lms-schedule.csv", csvData: scheduleToCsv(rows) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the modules from the export.");
    } finally {
      setBusyKey(null);
    }
  }, [getCourseCartridge, saveCourseFromImport, setBusyKey, setError]);

  const handleImportRubric = useCallback(async (c: Course) => {
    const key = `${c.id}:rubric`;
    setBusyKey(key);
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
        for (const rating of criterion.ratings) lines.push(`  - ${rating.description}: ${rating.points} pts`);
      }
      await saveCourseFromImport(c, { rubricName: `${rubric.title}.md`, rubricData: lines.join("\n") });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the rubric from the export.");
    } finally {
      setBusyKey(null);
    }
  }, [getCourseCartridge, saveCourseFromImport, setBusyKey, setError]);

  const handleImportSyllabus = useCallback(async (c: Course) => {
    const key = `${c.id}:syllabus`;
    setBusyKey(key);
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
      setBusyKey(null);
    }
  }, [getCourseCartridge, saveCourseFromImport, setBusyKey, setError, reloadSyllabi]);

  const fetchLmsRosterDraft = useCallback(async (c: Course): Promise<string | null> => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return null;
    }
    const key = `${c.id}:roster`;
    setBusyKey(key);
    setError(null);
    try {
      const courseId = parseCanvasCourseId(c.canvasUrl ?? "")?.toString();
      if (!courseId) {
        setError("Could not extract course ID from Canvas URL.");
        return null;
      }
      const r = await listCourseRosterAction((c.institution ?? "").trim().toUpperCase(), courseId);
      if ("error" in r) {
        setError(r.error);
        return null;
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
      return rowsToRoster(lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch roster from LMS.");
      return null;
    } finally {
      setBusyKey(null);
    }
  }, [setBusyKey, setError]);

  const handleLmsStartDate = useCallback(async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const key = `${c.id}:startDate`;
    setBusyKey(key);
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
      onCourseUpdated(result.course);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch start date from LMS.");
    } finally {
      setBusyKey(null);
    }
  }, [onCourseUpdated, setBusyKey, setError]);

  const handleLmsSyllabus = useCallback(async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const key = `${c.id}:syllabus`;
    setBusyKey(key);
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
      onCourseUpdated(result.course);
      await reloadSyllabi();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import syllabus from LMS.");
    } finally {
      setBusyKey(null);
    }
  }, [onCourseUpdated, reloadSyllabi, setBusyKey, setError]);

  const handleLmsCsv = useCallback(async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const key = `${c.id}:csv`;
    setBusyKey(key);
    setError(null);
    try {
      const r = await listCourseContentAction(c.canvasUrl ?? "", c.institution?.trim());
      if ("error" in r) {
        setError(r.error);
        return;
      }
      const rows = moduleNumbersAndTopics(r.modules).sort((a, b) => a.week - b.week);
      if (rows.length === 0) {
        setError("No Module NN modules found in the LMS course.");
        return;
      }
      const csv = scheduleToCsv(rows);
      const result = await updateCourseHubAction(c.id, { ...courseToInput(c), csvName: "lms-schedule.csv", csvData: csv });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onCourseUpdated(result.course);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch course content from LMS.");
    } finally {
      setBusyKey(null);
    }
  }, [onCourseUpdated, setBusyKey, setError]);

  const handleLmsWeeks = useCallback(async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const key = `${c.id}:weeks`;
    setBusyKey(key);
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
        if (match) weekNumbers.add(parseInt(match[1], 10));
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
      onCourseUpdated(result.course);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch course content from LMS.");
    } finally {
      setBusyKey(null);
    }
  }, [onCourseUpdated, setBusyKey, setError]);

  const handleLmsRubric = useCallback(async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const key = `${c.id}:rubric`;
    setBusyKey(key);
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
        for (const rating of criterion.ratings) lines.push(`  - ${rating.description}: ${rating.points} pts`);
      }
      const result = await updateCourseHubAction(c.id, {
        ...courseToInput(c),
        rubricName: `${rubric.title}.md`,
        rubricData: lines.join("\n"),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onCourseUpdated(result.course);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch rubric from LMS.");
    } finally {
      setBusyKey(null);
    }
  }, [onCourseUpdated, setBusyKey, setError]);

  const handleLmsExport = useCallback(async (c: Course) => {
    if (!canLms(c)) {
      setError("Course must have both a Canvas URL and institution to pull from LMS.");
      return;
    }
    const key = `${c.id}:lmsExports`;
    setBusyKey(key);
    setError(null);
    if (!user) {
      setError("You must be logged in.");
      setBusyKey(null);
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
      const filtered = c.exportFiles.filter((f) => f.name !== r.fileName);
      onCourseUpdated({
        ...c,
        exportFiles: [
          ...filtered,
          { name: r.fileName, path, size: blob.size, addedAt: new Date().toISOString(), ...(parts ? { parts } : {}) },
        ],
      });
      await removeCourseZipObjects(supabase, appendResult.replacedPaths);
      for (const p of appendResult.replacedPaths) cacheRef.current.delete(p);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not export from LMS.";
      if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(message)) {
        setError("This export exceeds the storage upload limit. Raise \"Upload file size limit\" in Supabase Storage settings (currently the project default is 50 MB), then retry.");
      } else {
        setError(message);
      }
    } finally {
      setBusyKey(null);
    }
  }, [onCourseUpdated, setBusyKey, setError, supabase, user]);

  return {
    busyKey,
    canLms,
    canImport,
    handleLmsStartDate,
    handleLmsSyllabus,
    handleLmsCsv,
    handleLmsWeeks,
    handleLmsRubric,
    handleLmsExport,
    handleImportStartDate,
    handleImportWeeks,
    handleImportCsv,
    handleImportRubric,
    handleImportSyllabus,
    fetchLmsRosterDraft,
  };
}
