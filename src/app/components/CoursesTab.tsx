"use client";

// Thin orchestrator for the Courses tab (Phase 2 of the tiles -> table
// redesign). Owns cross-cutting state (form open/closed, previews, the
// Common Resources library) and wires the data/save/import hooks into
// CoursesTable. The table itself, per-row cells, and the row-detail editors
// live under src/app/components/courses/.
import { useState } from "react";
import type { Course } from "@/lib/supabase/courses";
import {
  deleteCourseHubAction,
  getFinalizedSyllabusAction,
  previewFinalizedSyllabusAction,
} from "../actions";
import { downloadDocx } from "@/lib/courses-tab-helpers";
import { useInstitutionSelection } from "@/lib/institutions";
import { setCourseHandoff } from "@/lib/course-handoff";
import { useSupabase } from "@/context/SupabaseProvider";
import TabHeader from "./TabHeader";
import SyllabusPreviewModal, { type SyllabusPreviewPara } from "./SyllabusPreviewModal";
import CsvPreviewModal from "./CsvPreviewModal";
import RubricPreviewModal from "./RubricPreviewModal";
import TabShell from "./TabShell";
import styles from "../page.module.css";
import { useCoursesData } from "./courses/useCoursesData";
import { useCourseImportActions } from "./courses/useCourseImportActions";
import { useInlineFieldSave } from "./courses/useInlineFieldSave";
import CoursesTable from "./courses/CoursesTable";
import AddCourseForm from "./courses/AddCourseForm";

export default function CoursesTab({ onNavigate }: { onNavigate: (tab: "course-planning" | "version-control" | "workflows") => void }) {
  const { institutions } = useInstitutionSelection();
  const { supabase, user } = useSupabase();
  const {
    courses,
    setCourses,
    syllabi,
    orgs,
    state,
    refreshing,
    error,
    setError,
    load,
    reloadSyllabi,
    notifByCourse,
    ownedRepos,
  } = useCoursesData();

  const [search, setSearch] = useState("");
  const [formState, setFormState] = useState<{ mode: "new" } | { mode: "edit"; course: Course } | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [previewSyllabusId, setPreviewSyllabusId] = useState<string | null>(null);
  const [downloadSyllabusId, setDownloadSyllabusId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; paragraphs: SyllabusPreviewPara[] } | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ name: string; csv: string } | null>(null);
  const [rubricPreview, setRubricPreview] = useState<{ name: string; rubric: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const onCourseUpdated = (course: Course) => setCourses((prev) => prev.map((c) => (c.id === course.id ? course : c)));

  const imports = useCourseImportActions({
    supabase,
    user,
    onCourseUpdated,
    setError,
    reloadSyllabi,
    busyKey,
    setBusyKey,
  });
  const { saveField } = useInlineFieldSave(onCourseUpdated, setError);

  const query = search.trim().toLowerCase();
  const filteredCourses = courses.filter((c) => {
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
  });

  const handleNavigate = (tab: "course-planning" | "version-control" | "workflows", course: Course) => {
    const primary = course.repos[0];
    if (tab === "course-planning") {
      setCourseHandoff({
        target: "syllabus",
        name: course.name,
        courseCode: course.courseCode ?? undefined,
        term: course.term ?? undefined,
        institution: course.institution ?? undefined,
        textbook: course.textbook ?? undefined,
        repo: primary?.repo,
        branch: primary?.branch ?? undefined,
      });
    } else if (tab === "version-control") {
      setCourseHandoff({
        target: "version-control",
        githubOrg: course.githubOrg ?? undefined,
        repo: primary?.repo,
        branch: primary?.branch ?? undefined,
      });
    }
    onNavigate(tab);
  };

  const handleDelete = async (course: Course) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${course.name}"? This cannot be undone.`)) return;
    setDeleteBusyId(course.id);
    setError(null);
    const result = await deleteCourseHubAction(course.id);
    setDeleteBusyId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    await load({ silent: true });
  };

  const handlePreviewSyllabus = async (course: Course) => {
    if (!course.syllabusId) return;
    setPreviewSyllabusId(course.id);
    setError(null);
    const r = await previewFinalizedSyllabusAction(course.syllabusId);
    setPreviewSyllabusId(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setPreview({ name: r.name, paragraphs: r.paragraphs });
  };

  const handleDownloadSyllabus = async (course: Course) => {
    if (!course.syllabusId) return;
    setDownloadSyllabusId(course.id);
    setError(null);
    const r = await getFinalizedSyllabusAction(course.syllabusId);
    setDownloadSyllabusId(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    downloadDocx(r.syllabus.content, r.syllabus.fileName);
  };

  const handleSyllabusUploaded = (course: Course, syllabusId: string) => {
    onCourseUpdated({ ...course, syllabusId });
    void reloadSyllabi();
  };

  return (
    <TabShell>
      <TabHeader
        eyebrow="Courses"
        title="Your courses"
        subtitle="Keep everything for a course in one place — its codebases, syllabus, textbook, organization, and Canvas link."
      />

      {error && !formState && <p className={styles.error}>{error}</p>}

      {/* The add/edit form opens above the table - the table (and its own
          empty/loading states) stays mounted underneath, matching the
          pre-redesign behavior where the form never hid the course list. */}
      {formState && (
        <AddCourseForm
          editing={formState.mode === "edit" ? formState.course : null}
          institutions={institutions}
          orgs={orgs}
          syllabi={syllabi}
          onSaved={async () => {
            setFormState(null);
            await load({ silent: true });
          }}
          onCancel={() => setFormState(null)}
          onReloadSyllabi={reloadSyllabi}
        />
      )}

      <CoursesTable
        courses={filteredCourses}
        loading={state === "loading"}
        refreshing={refreshing}
        onRefresh={() => void load({ silent: true })}
        onNewCourse={() => setFormState({ mode: "new" })}
        search={search}
        onSearchChange={setSearch}
        totalCourseCount={courses.length}
        syllabi={syllabi}
        ownedRepos={ownedRepos}
        notifByCourse={notifByCourse}
        saveField={saveField}
        onCourseUpdated={onCourseUpdated}
        setError={setError}
        imports={imports}
        onNavigate={handleNavigate}
        onEdit={(course) => setFormState({ mode: "edit", course })}
        onDelete={(course) => void handleDelete(course)}
        deleteBusyId={deleteBusyId}
        onPreviewCsv={(name, csv) => setCsvPreview({ name, csv })}
        onPreviewRubric={(name, rubric) => setRubricPreview({ name, rubric })}
        onPreviewSyllabus={(course) => void handlePreviewSyllabus(course)}
        onDownloadSyllabus={(course) => void handleDownloadSyllabus(course)}
        previewSyllabusId={previewSyllabusId}
        downloadSyllabusId={downloadSyllabusId}
        onSyllabusUploaded={handleSyllabusUploaded}
      />

      {preview && <SyllabusPreviewModal name={preview.name} paragraphs={preview.paragraphs} onClose={() => setPreview(null)} />}
      {csvPreview && <CsvPreviewModal name={csvPreview.name} csv={csvPreview.csv} onClose={() => setCsvPreview(null)} />}
      {rubricPreview && <RubricPreviewModal name={rubricPreview.name} rubric={rubricPreview.rubric} onClose={() => setRubricPreview(null)} />}
    </TabShell>
  );
}
