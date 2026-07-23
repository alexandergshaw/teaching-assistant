"use client";

import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import GithubSyncPanel from "../GithubSyncPanel";
import LecturePlanningTab from "../LecturePlanningTab";
import TabHeader from "../TabHeader";
import { useInstitutionSelection } from "@/lib/institutions";
import styles from "../../page.module.css";
import { triggerFileDownload } from "./utils";
import { LS_KEYS, PLANNING_MODES, type PlanningMode } from "./types";
import { useSchedule } from "./useSchedule";
import { useProjectPlanning } from "./useProjectPlanning";
import { useSyllabusAdaptation } from "./useSyllabusAdaptation";
import { useSaveOptions } from "./useSaveOptions";
import ScheduleMode from "./ScheduleMode";
import ProjectMode from "./ProjectMode";
import SyllabusMode from "./SyllabusMode";

export default function CoursePlanningTab({ innerTabs }: { innerTabs?: ReactNode }) {
  const [planningMode, setPlanningMode] = useState<PlanningMode>("syllabus");

  const schedule = useSchedule();
  const project = useProjectPlanning();
  const syllabus = useSyllabusAdaptation();
  const saveOptions = useSaveOptions();
  const { active: activeInstitution } = useInstitutionSelection();

  // Hydrate planning mode and schedule fields from localStorage
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const savedMode = localStorage.getItem(LS_KEYS.planningMode);
    if (savedMode === "syllabus" || savedMode === "schedule" || savedMode === "project" || savedMode === "lecture" || savedMode === "sync") {
      setPlanningMode(savedMode);
    }
    schedule.setCourseDescription(localStorage.getItem(LS_KEYS.courseDescription) || "");
    schedule.setScheduleTerm(localStorage.getItem(LS_KEYS.scheduleTerm) || "");
    schedule.setScheduleStartDate(localStorage.getItem(LS_KEYS.scheduleStartDate) || "");
    schedule.setScheduleWeeks(localStorage.getItem(LS_KEYS.scheduleWeeks) || "");
    schedule.setScheduleTests(localStorage.getItem(LS_KEYS.scheduleTests) || "");
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExportScheduleCsv = () => {
    const { content, fileName } = schedule.buildScheduleCsv();
    triggerFileDownload(new Blob([content], { type: "text/csv;charset=utf-8" }), fileName);
  };

  const handleUseScheduleForProject = () => {
    const { content, fileName } = schedule.buildScheduleCsv();
    project.setProjectFileContent(content);
    project.setProjectFileName(fileName);
    project.setProjectPrompt(null);
    project.setProjectError(null);
    setPlanningMode("project");
    localStorage.setItem(LS_KEYS.planningMode, "project");
    void project.handleGenerateProjectPrompt(content, fileName);
  };

  const handleBuildAdaptedSyllabus = async () => {
    syllabus.setAdaptError(null);
    const base64 = await syllabus.buildSyllabusBase64();
    if (!base64) return;
    try {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      triggerFileDownload(blob, syllabus.adaptedFileName());
    } catch (err) {
      syllabus.setAdaptError(err instanceof Error ? err.message : "Failed to build the syllabus.");
    }
  };

  const handleSaveFinalized = async () => {
    const suggested =
      [syllabus.adaptCourseCode.trim(), syllabus.adaptCourseName.trim()].filter(Boolean).join(" ") ||
      syllabus.adaptSyllabusName.replace(/\.docx$/i, "") ||
      "Syllabus";
    const name = typeof window !== "undefined" ? window.prompt("Name this finalized syllabus", suggested) : suggested;
    if (name === null) return;
    if (!name.trim()) {
      saveOptions.setSaveNote({ kind: "error", text: "Enter a name for the syllabus." });
      return;
    }
    const base64 = await syllabus.buildSyllabusBase64();
    if (!base64) {
      saveOptions.setSaveNote({ kind: "error", text: syllabus.adaptError ?? "Could not build the syllabus." });
      return;
    }
    await saveOptions.handleSaveFinalized(name, syllabus.adaptedFileName(), base64, syllabus.adaptCourseCode.trim() || undefined);
  };

  const handleSaveAsCourse = async () => {
    const base64 = await syllabus.buildSyllabusBase64();
    if (!base64) {
      saveOptions.setSaveNote({ kind: "error", text: syllabus.adaptError ?? "Could not build the syllabus." });
      return;
    }
    const textbook = [syllabus.adaptTextbookText.trim(), syllabus.extractedTextbookInfo.trim()].filter(Boolean).join("\n\n");
    await saveOptions.handleSaveAsCourse(
      base64,
      syllabus.adaptedFileName(),
      syllabus.adaptCourseInfo(),
      syllabus.adaptSyllabusName,
      textbook,
      syllabus.adaptRepo,
      syllabus.adaptBranch
    );
  };

  const handleAddToModule = async () => {
    const base64 = await syllabus.buildSyllabusBase64();
    if (!base64) {
      saveOptions.setPlaceNote({ kind: "error", text: syllabus.adaptError ?? "Could not build the syllabus." });
      return;
    }
    await saveOptions.handleAddToModule(base64, syllabus.adaptedFileName());
  };

  return (
    <section className={styles.card}>
      <TabHeader
        eyebrow="Build Courses"
        title="Build a new course"
        subtitle="Build a syllabus or generate a weekly course schedule with the help of AI."
      />

      {innerTabs}

      <div className={styles.scheduleModeToggle}>
        {PLANNING_MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`${styles.scheduleModeBtn}${planningMode === m.key ? ` ${styles.active}` : ""}`}
            onClick={() => {
              setPlanningMode(m.key);
              localStorage.setItem(LS_KEYS.planningMode, m.key);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {planningMode === "syllabus" && (
        <SyllabusMode
          adaptSyllabusRef={syllabus.adaptSyllabusRef}
          adaptZipRef={syllabus.adaptZipRef}
          textbookImagesRef={syllabus.textbookImagesRef}
          pickedTemplate={syllabus.pickedTemplate}
          onPickedTemplateChange={syllabus.setPickedTemplate}
          adaptSyllabusName={syllabus.adaptSyllabusName}
          adaptTextbookText={syllabus.adaptTextbookText}
          onAdaptTextbookTextChange={syllabus.setAdaptTextbookText}
          adaptSections={syllabus.adaptSections}
          adaptStatus={syllabus.adaptStatus}
          adaptError={syllabus.adaptError}
          adaptCourseName={syllabus.adaptCourseName}
          onAdaptCourseNameChange={syllabus.setAdaptCourseName}
          adaptCourseCode={syllabus.adaptCourseCode}
          onAdaptCourseCodeChange={syllabus.setAdaptCourseCode}
          adaptInstructorName={syllabus.adaptInstructorName}
          onAdaptInstructorNameChange={syllabus.setAdaptInstructorName}
          adaptInstructorEmail={syllabus.adaptInstructorEmail}
          onAdaptInstructorEmailChange={syllabus.setAdaptInstructorEmail}
          adaptDescription={syllabus.adaptDescription}
          onAdaptDescriptionChange={syllabus.setAdaptDescription}
          adaptStartDate={syllabus.adaptStartDate}
          onAdaptStartDateChange={syllabus.setAdaptStartDate}
          adaptMeetingDays={syllabus.adaptMeetingDays}
          onAdaptMeetingDaysChange={syllabus.setAdaptMeetingDays}
          adaptMeetingTimes={syllabus.adaptMeetingTimes}
          onAdaptMeetingTimesChange={syllabus.setAdaptMeetingTimes}
          adaptLocation={syllabus.adaptLocation}
          onAdaptLocationChange={syllabus.setAdaptLocation}
          adaptRegenKey={syllabus.adaptRegenKey}
          adaptRepo={syllabus.adaptRepo}
          onAdaptRepoChange={syllabus.setAdaptRepo}
          adaptBranch={syllabus.adaptBranch}
          onAdaptBranchChange={syllabus.setAdaptBranch}
          onJumpToNextField={syllabus.jumpToNextField}
          onUpdateSection={syllabus.updateSection}
          onDeleteSection={syllabus.deleteSection}
          onAddSectionAfter={syllabus.addSectionAfter}
          onAnalyzeSyllabus={syllabus.handleAnalyzeSyllabus}
          onRegenerateAdaptSection={syllabus.handleRegenerateAdaptSection}
          onBuildAdaptedSyllabus={handleBuildAdaptedSyllabus}
          saveBusy={saveOptions.saveBusy}
          saveNote={saveOptions.saveNote}
          savedReloadToken={saveOptions.savedReloadToken}
          savingCourse={saveOptions.savingCourse}
          placeCourseUrl={saveOptions.placeCourseUrl}
          onPlaceCourseUrlChange={saveOptions.setPlaceCourseUrl}
          placeModules={saveOptions.placeModules}
          placeModuleId={saveOptions.placeModuleId}
          onPlaceModuleIdChange={saveOptions.setPlaceModuleId}
          placePosition={saveOptions.placePosition}
          onPlacePositionChange={saveOptions.setPlacePosition}
          placeBusy={saveOptions.placeBusy}
          placeNote={saveOptions.placeNote}
          onLoadPlaceModules={saveOptions.handleLoadPlaceModules}
          onAddToModule={handleAddToModule}
          onSaveFinalized={handleSaveFinalized}
          onSaveAsCourse={handleSaveAsCourse}
        />
      )}

      {planningMode === "schedule" && !schedule.scheduleGenerated && (
        <ScheduleMode
          courseDescription={schedule.courseDescription}
          onCourseDescriptionChange={schedule.setCourseDescription}
          scheduleTerm={schedule.scheduleTerm}
          onScheduleTermChange={schedule.setScheduleTerm}
          scheduleStartDate={schedule.scheduleStartDate}
          onScheduleStartDateChange={schedule.setScheduleStartDate}
          scheduleWeeks={schedule.scheduleWeeks}
          onScheduleWeeksChange={schedule.setScheduleWeeks}
          scheduleTests={schedule.scheduleTests}
          onScheduleTestsChange={schedule.setScheduleTests}
          scheduleRows={schedule.scheduleRows}
          scheduleTopics={schedule.scheduleTopics}
          isGeneratingSchedule={schedule.isGeneratingSchedule}
          scheduleError={schedule.scheduleError}
          scheduleGenerated={schedule.scheduleGenerated}
          isGeneratingProjectPrompt={project.isGeneratingProjectPrompt}
          onGenerateSchedule={schedule.handleGenerateSchedule}
          onResetSchedule={schedule.resetSchedule}
          onExportScheduleCsv={handleExportScheduleCsv}
          onUseScheduleForProject={handleUseScheduleForProject}
        />
      )}

      {planningMode === "schedule" && schedule.scheduleGenerated && (
        <ScheduleMode
          courseDescription={schedule.courseDescription}
          onCourseDescriptionChange={schedule.setCourseDescription}
          scheduleTerm={schedule.scheduleTerm}
          onScheduleTermChange={schedule.setScheduleTerm}
          scheduleStartDate={schedule.scheduleStartDate}
          onScheduleStartDateChange={schedule.setScheduleStartDate}
          scheduleWeeks={schedule.scheduleWeeks}
          onScheduleWeeksChange={schedule.setScheduleWeeks}
          scheduleTests={schedule.scheduleTests}
          onScheduleTestsChange={schedule.setScheduleTests}
          scheduleRows={schedule.scheduleRows}
          scheduleTopics={schedule.scheduleTopics}
          isGeneratingSchedule={schedule.isGeneratingSchedule}
          scheduleError={schedule.scheduleError}
          scheduleGenerated={schedule.scheduleGenerated}
          isGeneratingProjectPrompt={project.isGeneratingProjectPrompt}
          onGenerateSchedule={schedule.handleGenerateSchedule}
          onResetSchedule={schedule.resetSchedule}
          onExportScheduleCsv={handleExportScheduleCsv}
          onUseScheduleForProject={handleUseScheduleForProject}
        />
      )}

      {planningMode === "project" && (
        <ProjectMode
          projectFileRef={project.projectFileRef}
          projectFileName={project.projectFileName}
          projectFileContent={project.projectFileContent}
          projectPrompt={project.projectPrompt}
          isGeneratingProjectPrompt={project.isGeneratingProjectPrompt}
          projectError={project.projectError}
          repoName={project.repoName}
          onRepoNameChange={project.setRepoName}
          repoPrivate={project.repoPrivate}
          onRepoPrivateChange={project.setRepoPrivate}
          repoOrg={project.repoOrg}
          onRepoOrgChange={project.setRepoOrg}
          repoTemplate={project.repoTemplate}
          onRepoTemplateChange={project.setRepoTemplate}
          repoOrgs={project.repoOrgs}
          creatingRepo={project.creatingRepo}
          createdRepo={project.createdRepo}
          createRepoError={project.createRepoError}
          onProjectFileChange={project.handleProjectFileChange}
          onGenerateProjectPrompt={project.handleGenerateProjectPrompt}
          onLoadRepoOrgs={project.loadRepoOrgs}
          onCreateRepo={project.handleCreateRepo}
        />
      )}

      {planningMode === "sync" && <GithubSyncPanel acronym={activeInstitution || undefined} />}

      {planningMode === "lecture" && <LecturePlanningTab />}
    </section>
  );
}
