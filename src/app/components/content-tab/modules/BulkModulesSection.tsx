"use client";

import { Button, MenuItem, TextField } from "@mui/material";
import type { CanvasAddableContent, CanvasRubric } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import type { EditableQuestion } from "../types";
import { LIVE_CONTENT_SOURCE, gateOperation, type ContentSourceContext } from "../contentSourceGating";

export interface BulkModulesSectionProps {
  opBusy: boolean;
  /** Which Course Content source is active - see contentSourceGating.ts.
   * Optional, defaulted to LIVE_CONTENT_SOURCE so every existing call site
   * (none of which pass this yet) is unaffected. */
  sourceContext?: ContentSourceContext;
  bulkPublishModules: (published: boolean) => void;
  bulkDeleteModules: () => void;
  confirmDeleteModules: boolean;
  bulkAddType: string;
  setBulkAddType: (v: string) => void;
  bulkAddPattern: string;
  setBulkAddPattern: (v: string) => void;
  bulkAddSubType: string;
  setBulkAddSubType: (v: string) => void;
  bulkAiBusy: boolean;
  bulkAddFileContent: string;
  setBulkAddFileContent: (v: string) => void;
  bulkAddFileId: number | "";
  setBulkAddFileId: (v: number | "") => void;
  bulkAddToModules: () => void;
  targets: CanvasAddableContent | null;
  ensureTargets: () => void;
  bulkAddFileFormat: "docx" | "pptx";
  setBulkAddFileFormat: (v: "docx" | "pptx") => void;
  bulkFileOptions: () => Array<{ value: string; label: string }>;
  bulkAddDue: string;
  setBulkAddDue: (v: string) => void;
  bulkAddStaggerOffset: number;
  setBulkAddStaggerOffset: (v: number) => void;
  bulkAddStaggerUnit: "weeks" | "days";
  setBulkAddStaggerUnit: (v: "weeks" | "days") => void;
  bulkAddPoints: string;
  setBulkAddPoints: (v: string) => void;
  bulkAddRubricId: number | "";
  setBulkAddRubricId: (v: number | "") => void;
  rubrics: CanvasRubric[];
  bulkAddDescription: string;
  setBulkAddDescription: (v: string) => void;
  bulkAddQuestions: EditableQuestion[];
  setBulkAddQuestions: (v: EditableQuestion[]) => void;
  setBulkQuestionsOpen: (v: boolean) => void;
  /** Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
   * wave R2): captures `event.currentTarget` synchronously, alongside (never
   * instead of) `setBulkQuestionsOpen` above. This bar's own BulkQuestionsModal
   * instance is driven by an independent state variable from BulkItemsSection's
   * (useBulkModuleActions.ts's bulkQuestionsOpen vs useBulkItemActions.ts's
   * bulkItemsQuestionsOpen), so it is its own single-opener dialog. */
  onModuleQuestionsTrigger: (trigger: HTMLElement) => void;
  bulkAiPrompt: string;
  setBulkAiPrompt: (v: string) => void;
  bulkAiGenerate: () => void;
}

// Bulk bar section shown when one or more modules are selected: whole-module
// publish/unpublish/delete, and "Add to each" — one new (optionally AI
// generated) item per selected module.
export function BulkModulesSection({
  opBusy,
  sourceContext,
  bulkPublishModules,
  bulkDeleteModules,
  confirmDeleteModules,
  bulkAddType,
  setBulkAddType,
  bulkAddPattern,
  setBulkAddPattern,
  bulkAddSubType,
  setBulkAddSubType,
  bulkAiBusy,
  bulkAddFileContent,
  setBulkAddFileContent,
  bulkAddFileId,
  setBulkAddFileId,
  bulkAddToModules,
  targets,
  ensureTargets,
  bulkAddFileFormat,
  setBulkAddFileFormat,
  bulkFileOptions,
  bulkAddDue,
  setBulkAddDue,
  bulkAddStaggerOffset,
  setBulkAddStaggerOffset,
  bulkAddStaggerUnit,
  setBulkAddStaggerUnit,
  bulkAddPoints,
  setBulkAddPoints,
  bulkAddRubricId,
  setBulkAddRubricId,
  rubrics,
  bulkAddDescription,
  setBulkAddDescription,
  bulkAddQuestions,
  setBulkAddQuestions,
  setBulkQuestionsOpen,
  onModuleQuestionsTrigger,
  bulkAiPrompt,
  setBulkAiPrompt,
  bulkAiGenerate,
}: BulkModulesSectionProps) {
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  // GATED AS ONE UNIT - same reasoning as BulkItemsSection: publish/delete
  // write to the selected modules directly, and "Add to each" (including its
  // AI-drafting sub-step) ends the same way AddItemRow's does, by creating a
  // Canvas item in each selected module. Unreachable today for the same
  // reason BulkItemsSection is (entry 263's Limits) - `selectedModules` is a
  // bare `Set<number>` with no source discrimination at all yet.
  const sectionGate = gateOperation(ctx, "modules");
  if (!sectionGate.allowed) {
    return (
      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Modules</span>
        <span className={styles.bulkHint}>{sectionGate.reason}</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Modules</span>
        <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublishModules(true)}>
          Publish
        </Button>
        <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublishModules(false)}>
          Unpublish
        </Button>
        <Button
          variant="outlined"
          size="small"
          color="error"
          disabled={opBusy}
          onClick={bulkDeleteModules}
          title="Delete the selected modules"
        >
          {confirmDeleteModules ? "Confirm delete" : "Delete"}
        </Button>
      </div>
      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Add to each</span>
        <TextField
          select
          size="small"
          value={bulkAddType}
          onChange={(e) => {
            const t = e.target.value;
            setBulkAddType(t);
          }}
          aria-label="Type of item to add to each selected module"
        >
          <MenuItem value="Assignment">Assignment</MenuItem>
          <MenuItem value="Quiz">Quiz</MenuItem>
          <MenuItem value="Discussion">Discussion</MenuItem>
          <MenuItem value="Page">Page</MenuItem>
          <MenuItem value="File">File</MenuItem>
          <MenuItem value="SubHeader">Text header</MenuItem>
        </TextField>
        <TextField
          size="small"
          sx={{ flex: "1 1 200px", minWidth: 170 }}
          placeholder={
            bulkAddType === "File"
              ? "File name pattern (for an AI-generated file)"
              : "Name pattern, e.g. {module} - Homework"
          }
          value={bulkAddPattern}
          onChange={(e) => setBulkAddPattern(e.target.value)}
          aria-label="Name pattern for the new items"
        />
        {bulkAddType === "Assignment" && (
          <TextField
            select
            size="small"
            sx={{ minWidth: 170 }}
            value={bulkAddSubType}
            onChange={(e) => setBulkAddSubType(e.target.value)}
            aria-label="Submission type for the new assignments"
          >
            <MenuItem value="online_text_entry">Text entry</MenuItem>
            <MenuItem value="online_upload">File upload</MenuItem>
            <MenuItem value="online_url">Website URL</MenuItem>
            <MenuItem value="on_paper">On paper</MenuItem>
            <MenuItem value="none">No submission</MenuItem>
          </TextField>
        )}
        <Button
          variant="contained"
          size="small"
          disabled={
            opBusy ||
            bulkAiBusy ||
            (bulkAddType === "File"
              ? (bulkAddFileContent.trim() === "" && bulkAddFileId === "") ||
                (bulkAddFileContent.trim() !== "" && !bulkAddPattern.trim())
              : !bulkAddPattern.trim())
          }
          onClick={bulkAddToModules}
          title="Add one new item to each selected module"
        >
          Add
        </Button>
        <span className={styles.bulkHint}>
          {"{module}"} = module name, {"{n}"} = week/module number from the title (e.g. &quot;Week 5&quot; -&gt; 5). New items are unpublished.
        </span>
      </div>
      {bulkAddType === "File" && (
        <div className={styles.bulkRow}>
          <span className={styles.bulkLabel}>File</span>
          <span className={styles.bulkField}>
            <span className={styles.bulkFieldLabel}>New file</span>
            <TextField
              select
              size="small"
              value={bulkAddFileFormat}
              onChange={(e) => setBulkAddFileFormat(e.target.value === "pptx" ? "pptx" : "docx")}
              aria-label="Format of the generated file"
            >
              <MenuItem value="docx">Word (.docx)</MenuItem>
              <MenuItem value="pptx">PowerPoint (.pptx)</MenuItem>
            </TextField>
          </span>
          <TextField
            select
            size="small"
            sx={{ flex: "1 1 200px", maxWidth: 300 }}
            value={bulkAddFileId}
            disabled={opBusy || bulkAddFileContent.trim() !== ""}
            onChange={(e) => setBulkAddFileId(e.target.value === "" ? "" : Number(e.target.value))}
            aria-label="Existing file to add to each module"
            slotProps={{ select: { onOpen: () => ensureTargets() } }}
          >
            <MenuItem value="">{bulkFileOptions().length === 0 ? (targets ? "No files available" : "Loading files…") : "or pick existing file…"}</MenuItem>
            {bulkFileOptions().map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          {bulkAddFileContent.trim() !== "" && (
            <Button variant="outlined" size="small" onClick={() => setBulkAddFileContent("")}>
              Discard AI file
            </Button>
          )}
          <span className={styles.bulkHint}>
            Add an existing course file to every selected module, or generate a new{" "}
            {bulkAddFileFormat === "pptx" ? "PowerPoint deck" : "Word document"} with AI below
            (built into a branded {bulkAddFileFormat === "pptx" ? ".pptx" : ".docx"} named with the pattern).
          </span>
        </div>
      )}
      {["Assignment", "Quiz", "Discussion"].includes(bulkAddType) && (
        <div className={styles.bulkRow}>
          <span className={styles.bulkLabel}>Details</span>
          <span className={styles.bulkField}>
            <span className={styles.bulkFieldLabel}>Due</span>
            <TextField
              type="datetime-local"
              size="small"
              sx={{ width: 188 }}
              value={bulkAddDue}
              onChange={(e) => setBulkAddDue(e.target.value)}
              aria-label="First due date for the new items"
              slotProps={{ htmlInput: { } }}
            />
          </span>
          <span className={styles.bulkField}>
            <span className={styles.bulkFieldLabel}>then every</span>
            <TextField
              type="number"
              size="small"
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ width: 52 }}
              value={bulkAddStaggerOffset}
              onChange={(e) => setBulkAddStaggerOffset(Number(e.target.value))}
              aria-label="Stagger interval between modules"
            />
            <TextField
              select
              size="small"
              value={bulkAddStaggerUnit}
              onChange={(e) => setBulkAddStaggerUnit(e.target.value === "days" ? "days" : "weeks")}
              aria-label="Stagger interval unit"
            >
              <MenuItem value="weeks">weeks</MenuItem>
              <MenuItem value="days">days</MenuItem>
            </TextField>
          </span>
          {["Assignment", "Quiz"].includes(bulkAddType) && (
            <span className={styles.bulkField}>
              <TextField
                type="number"
                size="small"
                sx={{ width: 74 }}
                placeholder="points"
                value={bulkAddPoints}
                onChange={(e) => setBulkAddPoints(e.target.value)}
                aria-label="Points for the new items"
              />
            </span>
          )}
          {bulkAddType === "Assignment" && (
            <span className={styles.bulkField}>
              <TextField
                select
                size="small"
                sx={{ maxWidth: 170 }}
                value={bulkAddRubricId}
                disabled={rubrics.length === 0}
                onChange={(e) => setBulkAddRubricId(e.target.value === "" ? "" : Number(e.target.value))}
                aria-label="Rubric for the new items"
              >
                <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</MenuItem>
                {rubrics.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.title}
                  </MenuItem>
                ))}
              </TextField>
            </span>
          )}
          <span className={styles.bulkHint}>
            Optional. Due date, points, and rubric are written to every item created above; the
            stagger pushes each later module&apos;s due date out by the interval (0 = same date).
          </span>
        </div>
      )}
      {["Assignment", "Quiz", "Discussion", "Page", "File"].includes(bulkAddType) && (
        <div className={styles.bulkRow}>
          <span className={styles.bulkLabel}>
            {bulkAddType === "Page"
              ? "Body"
              : bulkAddType === "File"
                ? bulkAddFileFormat === "pptx"
                  ? "Slides"
                  : "File content"
                : "Description"}
          </span>
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={bulkAddType === "File" ? bulkAddFileContent : bulkAddDescription}
            onChange={(e) =>
              bulkAddType === "File"
                ? setBulkAddFileContent(e.target.value)
                : setBulkAddDescription(e.target.value)
            }
            placeholder={
              bulkAddType === "Page"
                ? "Page body (HTML allowed) — written to every new page"
                : bulkAddType === "File"
                  ? bulkAddFileFormat === "pptx"
                    ? "Slides — # Presentation title, then ## Slide title with - bullets. Generate with AI below or write them here; built into a .pptx. Leave empty to use the picked file"
                    : "Document text (use # Title, ## Section, - bullets) — generate with AI below or write it here; built into a .docx. Leave empty to use the picked file"
                  : "Description (HTML allowed) — written to every new item"
            }
            slotProps={{ htmlInput: { spellCheck: true } }}
            aria-label={bulkAddType === "File" ? "File content for the new files" : "Description for the new items"}
            size="small"
          />
        </div>
      )}
      {bulkAddType === "Quiz" && (
        <div className={styles.bulkRow}>
          <span className={styles.bulkLabel}>Questions</span>
          <Button
            variant="outlined"
            size="small"
            onClick={(e) => {
              onModuleQuestionsTrigger(e.currentTarget);
              setBulkQuestionsOpen(true);
            }}
          >
            Edit questions{bulkAddQuestions.length > 0 ? ` (${bulkAddQuestions.length})` : ""}
          </Button>
          {bulkAddQuestions.length > 0 && (
            <Button variant="outlined" size="small" onClick={() => setBulkAddQuestions([])}>
              Clear
            </Button>
          )}
          <span className={styles.bulkHint}>
            Composed once here and created in every new quiz.
          </span>
        </div>
      )}
      {bulkAddType !== "SubHeader" && (
        <div className={styles.bulkRow}>
          <span className={styles.bulkLabel}>AI</span>
          <TextField
            size="small"
            sx={{ flex: "1 1 260px", minWidth: 200 }}
            placeholder={
              bulkAddType === "File"
                ? bulkAddFileFormat === "pptx"
                  ? "Describe the deck to generate, e.g. an intro to photosynthesis"
                  : "Describe the document to generate, e.g. a one-page study guide on photosynthesis"
                : `Describe the ${bulkAddType.toLowerCase()} content to generate`
            }
            value={bulkAiPrompt}
            onChange={(e) => setBulkAiPrompt(e.target.value)}
            aria-label="AI prompt for the new content"
          />
          <Button
            variant="outlined"
            size="small"
            disabled={bulkAiBusy || opBusy || !bulkAiPrompt.trim()}
            onClick={() => bulkAiGenerate()}
          >
            {bulkAiBusy ? "Generating…" : "Generate with AI"}
          </Button>
          <span className={styles.bulkHint}>
            {bulkAddType === "File"
              ? bulkAddFileFormat === "pptx"
                ? "Generates the slides above; review them, then Add to build a branded .pptx for every module."
                : "Generates the document text above; review it, then Add to build a branded .docx for every module."
              : "Fills the description/body above with generated HTML; review it, then Add."}
          </span>
        </div>
      )}
    </>
  );
}
