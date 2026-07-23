"use client";

import type { RefObject } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import styles from "../../page.module.css";
import SyllabusTemplateLibrary from "../SyllabusTemplateLibrary";
import FinalizedSyllabusLibrary from "../FinalizedSyllabusLibrary";
import GithubRepoPicker from "../GithubRepoPicker";
import { RichTextSectionEditor } from "../RichTextSectionEditor";
import { spansToPlainText } from "../RichTextEditor";
import type { AdaptSection } from "./types";
import { LS_KEYS } from "./types";

type PickedTemplate = { id: string; name: string; fileName: string; base64: string } | null;

interface SyllabusModeProps {
  adaptSyllabusRef: RefObject<HTMLInputElement | null>;
  adaptZipRef: RefObject<HTMLInputElement | null>;
  textbookImagesRef: RefObject<HTMLInputElement | null>;
  pickedTemplate: PickedTemplate;
  onPickedTemplateChange: (template: PickedTemplate) => void;
  adaptSyllabusName: string;
  adaptTextbookText: string;
  onAdaptTextbookTextChange: (value: string) => void;
  adaptSections: AdaptSection[] | null;
  adaptStatus: "idle" | "analyzing" | "building";
  adaptError: string | null;
  adaptCourseName: string;
  onAdaptCourseNameChange: (value: string) => void;
  adaptCourseCode: string;
  onAdaptCourseCodeChange: (value: string) => void;
  adaptInstructorName: string;
  onAdaptInstructorNameChange: (value: string) => void;
  adaptInstructorEmail: string;
  onAdaptInstructorEmailChange: (value: string) => void;
  adaptDescription: string;
  onAdaptDescriptionChange: (value: string) => void;
  adaptStartDate: string;
  onAdaptStartDateChange: (value: string) => void;
  adaptMeetingDays: string;
  onAdaptMeetingDaysChange: (value: string) => void;
  adaptMeetingTimes: string;
  onAdaptMeetingTimesChange: (value: string) => void;
  adaptLocation: string;
  onAdaptLocationChange: (value: string) => void;
  adaptRegenKey: string | null;
  adaptRepo: string;
  onAdaptRepoChange: (value: string) => void;
  adaptBranch: string;
  onAdaptBranchChange: (value: string) => void;
  onJumpToNextField: () => void;
  onUpdateSection: (key: string, patch: Partial<AdaptSection>) => void;
  onDeleteSection: (key: string) => void;
  onAddSectionAfter: (key: string) => void;
  onAnalyzeSyllabus: () => Promise<void>;
  onRegenerateAdaptSection: (section: AdaptSection) => Promise<void>;
  onBuildAdaptedSyllabus: () => Promise<void>;
  saveBusy: boolean;
  saveNote: { kind: "error" | "success"; text: string } | null;
  savedReloadToken: number;
  savingCourse: boolean;
  placeCourseUrl: string;
  onPlaceCourseUrlChange: (value: string) => void;
  placeModules: Array<{ id: number; name: string }> | null;
  placeModuleId: number | "";
  onPlaceModuleIdChange: (id: number | "") => void;
  placePosition: string;
  onPlacePositionChange: (value: string) => void;
  placeBusy: "idle" | "loading" | "adding";
  placeNote: { kind: "error" | "success"; text: string } | null;
  onLoadPlaceModules: () => Promise<void>;
  onAddToModule: () => Promise<void>;
  onSaveFinalized: (name: string) => Promise<void>;
  onSaveAsCourse: () => Promise<void>;
}

export default function SyllabusMode({
  adaptSyllabusRef,
  adaptZipRef,
  textbookImagesRef,
  pickedTemplate,
  onPickedTemplateChange,
  adaptSyllabusName,
  adaptTextbookText,
  onAdaptTextbookTextChange,
  adaptSections,
  adaptStatus,
  adaptError,
  adaptCourseName,
  onAdaptCourseNameChange,
  adaptCourseCode,
  onAdaptCourseCodeChange,
  adaptInstructorName,
  onAdaptInstructorNameChange,
  adaptInstructorEmail,
  onAdaptInstructorEmailChange,
  adaptDescription,
  onAdaptDescriptionChange,
  adaptStartDate,
  onAdaptStartDateChange,
  adaptMeetingDays,
  onAdaptMeetingDaysChange,
  adaptMeetingTimes,
  onAdaptMeetingTimesChange,
  adaptLocation,
  onAdaptLocationChange,
  adaptRegenKey,
  adaptRepo,
  onAdaptRepoChange,
  adaptBranch,
  onAdaptBranchChange,
  onJumpToNextField,
  onUpdateSection,
  onDeleteSection,
  onAddSectionAfter,
  onAnalyzeSyllabus,
  onRegenerateAdaptSection,
  onBuildAdaptedSyllabus,
  saveBusy,
  saveNote,
  savedReloadToken,
  savingCourse,
  placeCourseUrl,
  onPlaceCourseUrlChange,
  placeModules,
  placeModuleId,
  onPlaceModuleIdChange,
  placePosition,
  onPlacePositionChange,
  placeBusy,
  placeNote,
  onLoadPlaceModules,
  onAddToModule,
  onSaveFinalized,
  onSaveAsCourse,
}: SyllabusModeProps) {
  return (
    <>
      <p className={styles.adaptIntro}>
        Upload a previous offering&apos;s syllabus and (optionally) a zip of the course&apos;s codebase.
        The AI finds the class-specific parts that need your input, you confirm or edit them, and the new
        syllabus is written back into the original Word file — so its formatting matches exactly.
      </p>

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <p className={styles.adaptPanelTitle}>
            <span className={styles.adaptPanelStep}>1</span> Start from a base
          </p>
          <p className={styles.adaptPanelSubtitle}>
            Reuse a saved template or upload a former syllabus. Its exact formatting is preserved — only class-specific text changes.
          </p>
        </div>

        <div className={styles.field}>
          <label>Syllabus template</label>
          <SyllabusTemplateLibrary
            activeTemplateId={pickedTemplate?.id ?? null}
            onUse={(t) => {
              onPickedTemplateChange(t);
              if (adaptSyllabusRef.current) adaptSyllabusRef.current.value = "";
            }}
          />
          {pickedTemplate && (
            <p className={styles.adaptTemplateNote}>
              Using template: <strong>{pickedTemplate.name}</strong>{" "}
              <button type="button" className={styles.linkButton} onClick={() => onPickedTemplateChange(null)}>
                clear
              </button>
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="adaptSyllabusFile">Or upload a former syllabus (.docx)</label>
          <div className={styles.fileField}>
            <input
              id="adaptSyllabusFile"
              type="file"
              accept=".docx"
              ref={adaptSyllabusRef}
              onChange={() => {
                if (adaptSyllabusRef.current?.files?.[0]) onPickedTemplateChange(null);
              }}
            />
            <p>Word .docx only. The new syllabus keeps its exact formatting; only class-specific text changes.</p>
          </div>
        </div>
      </div>

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <p className={styles.adaptPanelTitle}>
            <span className={styles.adaptPanelStep}>2</span> Course details
          </p>
          <p className={styles.adaptPanelSubtitle}>
            All optional — but the more you fill in, the less you&apos;ll need to edit afterward.
          </p>
        </div>

        <div className={styles.adaptFieldGrid2}>
          <TextField
            id="adaptCourseName"
            label="Course name"
            type="text"
            size="small"
            fullWidth
            placeholder="e.g. Database Management"
            value={adaptCourseName}
            onChange={(e) => {
              onAdaptCourseNameChange(e.target.value);
              localStorage.setItem(LS_KEYS.adaptCourseName, e.target.value);
            }}
          />
          <TextField
            id="adaptCourseCode"
            label="Course code"
            type="text"
            size="small"
            fullWidth
            placeholder="e.g. BIT270"
            value={adaptCourseCode}
            onChange={(e) => {
              onAdaptCourseCodeChange(e.target.value);
              localStorage.setItem(LS_KEYS.adaptCourseCode, e.target.value);
            }}
          />
        </div>

        <div className={styles.adaptFieldGrid2}>
          <TextField
            id="adaptInstructorName"
            label="Instructor name"
            type="text"
            size="small"
            fullWidth
            placeholder="e.g. Alex Shaw"
            value={adaptInstructorName}
            onChange={(e) => {
              onAdaptInstructorNameChange(e.target.value);
              localStorage.setItem(LS_KEYS.adaptInstructorName, e.target.value);
            }}
          />
          <TextField
            id="adaptInstructorEmail"
            label="Instructor email"
            type="email"
            size="small"
            fullWidth
            placeholder="e.g. shaw@university.edu"
            value={adaptInstructorEmail}
            onChange={(e) => {
              onAdaptInstructorEmailChange(e.target.value);
              localStorage.setItem(LS_KEYS.adaptInstructorEmail, e.target.value);
            }}
          />
        </div>

        <TextField
          id="adaptDescription"
          label="Official course description"
          multiline
          minRows={4}
          size="small"
          fullWidth
          placeholder="Paste the official catalog description — used verbatim for the course description section."
          value={adaptDescription}
          onChange={(e) => {
            onAdaptDescriptionChange(e.target.value);
            localStorage.setItem(LS_KEYS.adaptDescription, e.target.value);
          }}
        />

        <div className={styles.field}>
          <TextField
            id="adaptStartDate"
            label="Course start date"
            type="date"
            size="small"
            fullWidth
            value={adaptStartDate}
            onChange={(e) => {
              onAdaptStartDateChange(e.target.value);
              localStorage.setItem(LS_KEYS.adaptStartDate, e.target.value);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <p className={styles.fieldHint}>
            Include the year — used to compute the schedule. Not assumed from the old syllabus.
          </p>
        </div>

        <div className={styles.adaptFieldGrid3}>
          <TextField
            id="adaptMeetingDays"
            label="Meeting days"
            type="text"
            size="small"
            fullWidth
            placeholder="e.g. Mon / Wed / Fri"
            value={adaptMeetingDays}
            onChange={(e) => {
              onAdaptMeetingDaysChange(e.target.value);
              localStorage.setItem(LS_KEYS.adaptMeetingDays, e.target.value);
            }}
          />
          <TextField
            id="adaptMeetingTimes"
            label="Meeting times"
            type="text"
            size="small"
            fullWidth
            placeholder="e.g. 9:00–10:15am"
            value={adaptMeetingTimes}
            onChange={(e) => {
              onAdaptMeetingTimesChange(e.target.value);
              localStorage.setItem(LS_KEYS.adaptMeetingTimes, e.target.value);
            }}
          />
          <TextField
            id="adaptLocation"
            label="Meeting location"
            type="text"
            size="small"
            fullWidth
            placeholder="e.g. Room 204, Science Hall"
            value={adaptLocation}
            onChange={(e) => {
              onAdaptLocationChange(e.target.value);
              localStorage.setItem(LS_KEYS.adaptLocation, e.target.value);
            }}
          />
        </div>
      </div>

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <p className={styles.adaptPanelTitle}>
            <span className={styles.adaptPanelStep}>3</span> Supporting materials
          </p>
          <p className={styles.adaptPanelSubtitle}>
            Optional. Give the AI the textbook details and the course codebase so its suggestions are accurate and class-specific.
          </p>
        </div>

        <div className={styles.field}>
          <label htmlFor="adaptTextbookImages">Textbook / required materials</label>
          <div className={styles.fileField}>
            <input id="adaptTextbookImages" type="file" accept="image/*" multiple ref={textbookImagesRef} />
            <p>Upload one or more screenshots of the textbook / required-materials details; the AI reads them and fills the syllabus textbook section.</p>
          </div>
          <TextField
            id="adaptTextbookText"
            label="...or paste the details as text"
            multiline
            minRows={3}
            size="small"
            fullWidth
            placeholder="Paste or type the textbook / required-materials details; combined with any screenshot above."
            value={adaptTextbookText}
            onChange={(e) => {
              onAdaptTextbookTextChange(e.target.value);
              localStorage.setItem(LS_KEYS.adaptTextbookText, e.target.value);
            }}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="adaptZipFile">Course codebase</label>
          <div className={styles.fileField}>
            <input id="adaptZipFile" type="file" accept=".zip" ref={adaptZipRef} disabled={!!adaptRepo.trim()} />
            <p>A zip of the course&apos;s codebase so the AI can suggest accurate, class-specific values.</p>
          </div>
          <p className={styles.fieldHint} style={{ marginTop: 8 }}>or select one of your GitHub repositories:</p>
          <GithubRepoPicker value={adaptRepo} onChange={onAdaptRepoChange} disabled={adaptStatus === "analyzing"} branch={adaptBranch} onBranchChange={onAdaptBranchChange} />
        </div>
      </div>

      {adaptError && !adaptSections && <p className={styles.error}>{adaptError}</p>}

      {adaptStatus === "analyzing" && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <div>
            <p className={styles.loadingTitle}>Analyzing your syllabus...</p>
            <p className={styles.loadingText}>
              Reading the document, scanning any codebase you provided, and drafting the class-specific fields. This can take a moment.
            </p>
          </div>
        </div>
      )}

      <Button
        variant="contained"
        size="small"
        onClick={onAnalyzeSyllabus}
        disabled={adaptStatus !== "idle"}
      >
        {adaptStatus === "analyzing" ? "Analyzing..." : adaptSections ? "Re-analyze" : "Analyze syllabus"}
      </Button>

      {adaptSections && adaptSections.length > 0 && (
        <>
          <div className={styles.adaptSectionsHeader}>
            <p className={styles.adaptSectionsHeading}>
              {adaptSections.length} section{adaptSections.length === 1 ? "" : "s"} — edit, regenerate with AI, add, or delete any of them
            </p>
            {adaptSections.some((s) => s.isField) && (
              <Button variant="outlined" size="small" onClick={onJumpToNextField}>
                Jump to next field ({adaptSections.filter((s) => s.isField).length})
              </Button>
            )}
          </div>

          <RichTextSectionEditor
            bordered
            maxHeight="65vh"
            onChange={(key, spans) => onUpdateSection(key, { spans })}
            sections={adaptSections.map((s) => ({
              key: s.key,
              id: s.isField ? `syllabus-field-${s.key}` : undefined,
              spans: s.spans,
              changed: s.isField || spansToPlainText(s.spans) !== s.original,
              placeholder: "(empty section)",
              label: s.isField ? s.label : undefined,
              ariaLabel: s.isField ? s.label : "Syllabus section",
              actions: [
                {
                  key: "ai",
                  label: adaptRegenKey === s.key ? "..." : "AI",
                  title: "Regenerate this section with AI",
                  tone: "accent",
                  onClick: () => onRegenerateAdaptSection(s),
                  disabled: adaptRegenKey !== null,
                  style: { opacity: adaptRegenKey !== null && adaptRegenKey !== s.key ? 0.5 : 1 },
                },
                {
                  key: "add",
                  label: "+",
                  title: "Add a section below",
                  onClick: () => onAddSectionAfter(s.key),
                },
                {
                  key: "del",
                  label: "×",
                  title: "Delete this section",
                  tone: "danger",
                  onClick: () => onDeleteSection(s.key),
                },
              ],
            }))}
          />

          <div className={styles.adaptActionBar}>
            <Button
              variant="contained"
              size="small"
              onClick={onBuildAdaptedSyllabus}
              disabled={adaptStatus !== "idle"}
            >
              {adaptStatus === "building" ? "Building..." : "Download adapted syllabus (.docx)"}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => onSaveFinalized((adaptCourseCode.trim() && adaptCourseName.trim()) ? `${adaptCourseCode.trim()} ${adaptCourseName.trim()}` : adaptSyllabusName.replace(/\.docx$/i, "") || "Syllabus")}
              disabled={saveBusy || adaptStatus !== "idle"}
            >
              {saveBusy ? "Saving..." : "Save to library"}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={onSaveAsCourse}
              disabled={savingCourse || adaptStatus !== "idle"}
              title="Save this syllabus and create a Course pre-filled from these fields"
            >
              {savingCourse ? "Saving..." : "Save as course"}
            </Button>
          </div>

          {saveNote && (
            <p className={saveNote.kind === "error" ? styles.error : styles.fieldHint}>{saveNote.text}</p>
          )}
          {adaptError && <p className={styles.error}>{adaptError}</p>}

          <details className={styles.adaptDisclosure}>
            <summary>Add to a Canvas module</summary>
            <div className={styles.adaptDisclosureBody}>
              <div className={styles.adaptRow}>
                <div className={styles.field} style={{ flex: "1 1 280px", margin: 0 }}>
                  <TextField
                    id="placeCourseUrl"
                    label="Course URL"
                    type="text"
                    size="small"
                    fullWidth
                    placeholder="https://canvas.../courses/123"
                    value={placeCourseUrl}
                    onChange={(e) => onPlaceCourseUrlChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !(placeBusy !== "idle")) {
                        e.preventDefault();
                        void onLoadPlaceModules();
                      }
                    }}
                  />
                </div>
                <Button variant="contained" size="small" onClick={onLoadPlaceModules} disabled={placeBusy !== "idle"}>
                  {placeBusy === "loading" ? "Loading..." : "Load modules"}
                </Button>
              </div>
              {placeModules && (
                <div className={styles.adaptRow}>
                  <div className={styles.field} style={{ flex: "1 1 240px", margin: 0 }}>
                    <TextField
                      id="placeModule"
                      label="Module"
                      select
                      size="small"
                      fullWidth
                      value={placeModuleId}
                      onChange={(e) => onPlaceModuleIdChange(Number(e.target.value))}
                    >
                      {placeModules.length === 0 && <MenuItem value="">No modules in this course</MenuItem>}
                      {placeModules.map((m) => (
                        <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                      ))}
                    </TextField>
                  </div>
                  <div className={styles.field} style={{ width: 110, margin: 0 }}>
                    <TextField
                      id="placePosition"
                      label="Position"
                      type="number"
                      size="small"
                      fullWidth
                      slotProps={{ htmlInput: { min: 1 } }}
                      placeholder="End"
                      value={placePosition}
                      onChange={(e) => onPlacePositionChange(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={onAddToModule}
                    disabled={placeBusy !== "idle" || placeModuleId === ""}
                  >
                    {placeBusy === "adding" ? "Adding..." : "Add to module"}
                  </Button>
                </div>
              )}
              {placeNote && (
                <p className={placeNote.kind === "error" ? styles.error : styles.fieldHint} style={{ marginTop: 8 }}>
                  {placeNote.text}
                </p>
              )}
            </div>
          </details>
        </>
      )}

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <p className={styles.adaptPanelTitle}>Finalized syllabi</p>
          <p className={styles.adaptPanelSubtitle}>
            Your saved, completed syllabi. Download or remove them any time — use &ldquo;Save to library&rdquo; above to add the one you just built.
          </p>
        </div>
        <FinalizedSyllabusLibrary reloadToken={savedReloadToken} />
      </div>
    </>
  );
}
