"use client";

import { useEffect, useRef, useState } from "react";
import { generateLecturePlansAction, generateCourseRubricFromZipAction, generateCourseMaterialsAction, type AssignmentPlan } from "../actions";
import { parseGeneratedRubric } from "../utils/rubric";
import { saveFile, loadFile, deleteFile } from "../../lib/file-persistence";
import { getStoredProvider, useLlmProvider } from "@/lib/llm-provider";
import { buildSlidesPptx } from "@/lib/pptx";
import styles from "../page.module.css";
import LecturePlanPreviewModal from "./LecturePlanPreviewModal";

const ZIP_FILE_KEY = "lecture-planning-zip";
const INTRO_TEMPLATE_KEY = "lecture-planning-intro-template";
const INSTRUCTIONS_TEMPLATE_KEY = "lecture-planning-instructions-template";

// Decode a base64 payload (e.g. the Course Engine materials zip) and download it.
function downloadBase64File(base64: string, fileName: string, mimeType: string) {
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArray], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function buildDocxFromPlainText(
  text: string,
  templateHeadings?: string[]
): Promise<ArrayBuffer> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    ExternalHyperlink,
    Footer,
    PageNumber,
    AlignmentType,
    BorderStyle,
    LevelFormat,
  } = await import("docx");

  // Professional, branded document palette (matches the app + slide decks).
  const FONT = "Calibri";
  const BODY = "1F2937"; // near-black slate for body copy
  const NAVY = "1A2744"; // brand navy for the title + section headings
  const ACCENT = "2563EB"; // link blue
  const RULE = "D1D5DB"; // light divider under section headings
  const MUTED = "6B7280"; // footer / secondary text

  const URL_RE = /(https?:\/\/[^\s)]+)/g;

  type Run = InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>;

  // Split a string into runs, turning bare URLs into real, styled hyperlinks.
  const runsFromText = (content: string, bold = false): Run[] => {
    const runs: Run[] = [];
    for (const part of content.split(URL_RE)) {
      if (!part) continue;
      if (/^https?:\/\//.test(part)) {
        runs.push(
          new ExternalHyperlink({
            link: part,
            children: [new TextRun({ text: part, font: FONT, color: ACCENT, underline: {} })],
          })
        );
      } else {
        runs.push(new TextRun({ text: part, font: FONT, color: BODY, bold }));
      }
    }
    return runs;
  };

  // Normalize heading text for robust matching (case, surrounding punctuation,
  // numbering prefixes, and whitespace are ignored).
  const normalizeHeading = (value: string) =>
    value
      .toLowerCase()
      .replace(/^[\d.)\s-]+/, "")
      .replace(/[:.\s]+$/, "")
      .replace(/\s+/g, " ")
      .trim();

  const hasTemplate = Array.isArray(templateHeadings) && templateHeadings.length > 0;
  const allowedHeadings = new Set((templateHeadings ?? []).map(normalizeHeading));

  // When a line begins with a short "Label:" prefix, bold the label and leave
  // the remainder normal (with hyperlinks detected throughout).
  const buildLabeledRuns = (content: string): Run[] => {
    const labelMatch = content.match(/^([^:\n]{1,80}:)(\s[\s\S]*)?$/);
    if (labelMatch) {
      const runs: Run[] = [new TextRun({ text: labelMatch[1], font: FONT, color: BODY, bold: true })];
      if (labelMatch[2]) runs.push(...runsFromText(labelMatch[2]));
      return runs;
    }
    return runsFromText(content);
  };

  const children: InstanceType<typeof Paragraph>[] = [];
  // Each contiguous run of "1. 2. 3." items gets its own numbering instance so
  // numbering restarts per section instead of running on across the document.
  type DocOptions = ConstructorParameters<typeof Document>[0];
  type NumberingConfig = NonNullable<DocOptions["numbering"]>["config"][number];
  const numberingConfigs: NumberingConfig[] = [];
  let orderedGroups = 0;
  let currentOrderedRef: string | null = null;
  let prevWasOrdered = false;

  const lines = text.split("\n");
  let firstHeadingFound = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const markdownMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i >= lines.length - 1 || !lines[i + 1].trim();
    const isListItem = /^(\d+\.|[-•*])\s/.test(trimmed);

    let isHeading: boolean;
    let headingText = trimmed;
    let markdownIsTitle = false;

    if (markdownMatch) {
      isHeading = true;
      headingText = markdownMatch[2].trim();
      markdownIsTitle = markdownMatch[1].length === 1;
    } else if (hasTemplate) {
      isHeading = allowedHeadings.has(normalizeHeading(trimmed));
    } else {
      isHeading = trimmed.length < 80 && !isListItem && prevBlank && nextBlank;
    }

    if (isHeading) {
      prevWasOrdered = false;
      const isTitle = markdownMatch ? markdownIsTitle : !firstHeadingFound;
      firstHeadingFound = true;
      if (isTitle) {
        // Document title: large navy heading with a navy rule beneath it.
        children.push(
          new Paragraph({
            children: [new TextRun({ text: headingText, font: FONT, color: NAVY, bold: true, size: 36 })],
            spacing: { after: 200 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 6, color: NAVY } },
          })
        );
      } else {
        // Section heading: navy small-caps with a light divider underneath.
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: headingText, font: FONT, color: NAVY, bold: true, size: 24, allCaps: true }),
            ],
            spacing: { before: 320, after: 120 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 4, color: RULE } },
          })
        );
      }
    } else if (/^\d+\.\s+/.test(trimmed)) {
      if (!prevWasOrdered) {
        orderedGroups += 1;
        currentOrderedRef = `ordered-${orderedGroups}`;
        numberingConfigs.push({
          reference: currentOrderedRef,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 460, hanging: 260 } } },
            },
          ],
        });
      }
      prevWasOrdered = true;
      children.push(
        new Paragraph({
          children: buildLabeledRuns(trimmed.replace(/^\d+\.\s+/, "")),
          numbering: { reference: currentOrderedRef as string, level: 0 },
          spacing: { after: 80 },
        })
      );
    } else if (/^[-•*]\s+/.test(trimmed)) {
      prevWasOrdered = false;
      children.push(
        new Paragraph({
          children: buildLabeledRuns(trimmed.slice(trimmed.indexOf(" ") + 1)),
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
    } else {
      prevWasOrdered = false;
      children.push(new Paragraph({ children: buildLabeledRuns(trimmed) }));
    }
  }

  const doc = new Document({
    // App-wide professional defaults: clean body font, comfortable line spacing.
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: BODY },
          paragraph: { spacing: { after: 140, line: 276 } },
        },
      },
    },
    numbering: { config: numberingConfigs },
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toArrayBuffer(doc);
}

export default function LecturePlanningTab() {
  const [provider] = useLlmProvider();
  const [lectureDuration, setLectureDuration] = useState("50");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<AssignmentPlan[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<AssignmentPlan | null>(null);
  const [rubricStatus, setRubricStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [rubricError, setRubricError] = useState<string | null>(null);
  const [generatedRubric, setGeneratedRubric] = useState<string | null>(null);
  const [rubricCopied, setRubricCopied] = useState(false);
  const zipFileRef = useRef<HTMLInputElement>(null);
  const introTemplateRef = useRef<HTMLInputElement>(null);
  const instructionsTemplateRef = useRef<HTMLInputElement>(null);

  // Files are persisted to IndexedDB so that uploads survive page refreshes.
  // Browsers do not allow programmatically setting a file input's value, so the
  // restored files are tracked in state and used directly by the handlers.
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [introTemplateFile, setIntroTemplateFile] = useState<File | null>(null);
  const [instructionsTemplateFile, setInstructionsTemplateFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [zip, intro, instructions] = await Promise.all([
        loadFile(ZIP_FILE_KEY),
        loadFile(INTRO_TEMPLATE_KEY),
        loadFile(INSTRUCTIONS_TEMPLATE_KEY),
      ]);
      if (cancelled) return;
      if (zip) setZipFile(zip);
      if (intro) setIntroTemplateFile(intro);
      if (instructions) setInstructionsTemplateFile(instructions);
    })().catch(() => {
      // Restoring persisted files is best-effort; ignore failures.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileChange = (
    file: File | null,
    key: string,
    setFile: (file: File | null) => void
  ) => {
    setFile(file);
    if (file) {
      saveFile(key, file).catch(() => {});
    } else {
      deleteFile(key).catch(() => {});
    }
  };

  const handleClearFile = (
    key: string,
    setFile: (file: File | null) => void,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    deleteFile(key).catch(() => {});
  };

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleGenerate = async () => {
    const file = zipFile;
    if (!file) {
      setError("Please select a zip file of your course repository.");
      return;
    }

    const minutes = parseInt(lectureDuration, 10);
    if (isNaN(minutes) || minutes < 1) {
      setError("Please enter a valid lecture duration in minutes.");
      return;
    }

    setStatus("loading");
    setError(null);
    setPlans([]);

    try {
      const base64 = await readFileAsBase64(file);

      // Course Engine path: it returns a finished course-materials.zip from the
      // project, so download it directly and skip the per-assignment preview.
      // The package also includes rubric.csv, so surface it in the rubric panel
      // from this single call (avoids a second /materials request).
      if (getStoredProvider() === "other") {
        const materials = await generateCourseMaterialsAction(base64);
        if ("error" in materials) {
          setError(materials.error);
          setStatus("error");
          return;
        }
        downloadBase64File(materials.base64, materials.fileName, materials.mimeType);
        if (materials.rubricCsv) {
          setGeneratedRubric(materials.rubricCsv);
          setRubricStatus("done");
          setRubricError(null);
        }
        setStatus("done");
        return;
      }

      const introTemplateBase64 = introTemplateFile
        ? await readFileAsBase64(introTemplateFile)
        : undefined;
      const instructionsTemplateBase64 = instructionsTemplateFile
        ? await readFileAsBase64(instructionsTemplateFile)
        : undefined;

      const result = await generateLecturePlansAction(
        base64,
        minutes,
        introTemplateBase64,
        instructionsTemplateBase64,
        getStoredProvider()
      );

      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }

      setPlans(result);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
      setStatus("error");
    }
  };

  const handleDownloadAll = async () => {
    if (plans.length === 0) return;
    setIsDownloading(true);
    try {
      const { default: JSZip } = await import("jszip");

      const outputZip = new JSZip();

      for (const plan of plans) {
        const pptxData = await buildSlidesPptx({
          presentationTitle: plan.presentationTitle,
          slides: plan.slides,
          subtitle: plan.assignmentName,
        });
        const weekLabel = `Week ${plan.weekNumber}`;
        outputZip.file(`${weekLabel} Slides.pptx`, pptxData);
        if (plan.moduleIntroduction) {
          outputZip.file(`${weekLabel} Introduction.docx`, await buildDocxFromPlainText(plan.moduleIntroduction, plan.introTemplateHeadings));
        }
        if (plan.assignmentInstructions) {
          outputZip.file(`${weekLabel} Assignment Instructions.docx`, await buildDocxFromPlainText(plan.assignmentInstructions, plan.instructionsTemplateHeadings));
        }
      }

      const blob = await outputZip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lecture_plans.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleGenerateRubric = async () => {
    const file = zipFile;
    if (!file) {
      setRubricError("Please select a zip file of your course repository.");
      setRubricStatus("idle");
      return;
    }

    setRubricStatus("loading");
    setRubricError(null);
    setGeneratedRubric(null);
    setRubricCopied(false);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await generateCourseRubricFromZipAction(base64, getStoredProvider());

      if (typeof result === "object" && "error" in result) {
        setRubricError(result.error);
        setRubricStatus("error");
        return;
      }

      setGeneratedRubric(result);
      setRubricStatus("done");
    } catch (err) {
      setRubricError(err instanceof Error ? err.message : "Rubric generation failed. Please try again.");
      setRubricStatus("error");
    }
  };

  const handleCopyRubric = async () => {
    if (!generatedRubric) return;
    try {
      await navigator.clipboard.writeText(generatedRubric);
      setRubricCopied(true);
      setTimeout(() => setRubricCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const handleDownloadRubricCsv = () => {
    if (!generatedRubric) return;
    const rows = parseGeneratedRubric(generatedRubric);
    let csv: string;
    if (rows) {
      // Gemini text rubric: serialize the parsed rows to CSV.
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = ["Criterion,Weight,Performance Levels"];
      for (const row of rows) {
        const weight = row.weight.endsWith("%") ? row.weight : `${row.weight}%`;
        const levels = row.subcategories.length > 0
          ? row.subcategories.map((s) => `${s.label}: ${s.description}`).join(" | ")
          : row.description;
        lines.push([esc(row.area), esc(weight), esc(levels)].join(","));
      }
      csv = lines.join("\r\n");
    } else {
      // Course Engine path: generatedRubric is already rubric.csv — download as-is.
      csv = generatedRubric;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rubric.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h1>Lecture Planning</h1>
        <p>
          Upload a zip of your template course repository and generate a tailored PowerPoint
          lecture for each assignment — ready to teach the concepts students need to succeed.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="lectureDuration">Lecture Duration (minutes)</label>
        <input
          id="lectureDuration"
          type="number"
          min={1}
          max={300}
          value={lectureDuration}
          onChange={(e) => setLectureDuration(e.target.value)}
          placeholder="e.g. 50"
          style={{ maxWidth: 160 }}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="repoZip">Course Repository (.zip)</label>
        <div className={styles.fileField}>
          <input
            id="repoZip"
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            ref={zipFileRef}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null, ZIP_FILE_KEY, setZipFile)}
          />
          {zipFile && (
            <p className={styles.savedFileNote}>
              Saved: <strong>{zipFile.name}</strong>
              <button
                type="button"
                className={styles.clearFileButton}
                onClick={() => handleClearFile(ZIP_FILE_KEY, setZipFile, zipFileRef)}
              >
                Remove
              </button>
            </p>
          )}
          <p>
            Upload a zip of your template repository. The zip must contain an{" "}
            <code>assignments</code> folder (or similar) with one subfolder per assignment.
            Each subfolder should include the README, any unit tests, and assignment source files.
            Maximum upload size: ~7 MB zip.
          </p>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="introTemplate">Module Intro Template (.docx, optional)</label>
        <div className={styles.fileField}>
          <input
            id="introTemplate"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ref={introTemplateRef}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null, INTRO_TEMPLATE_KEY, setIntroTemplateFile)}
          />
          {introTemplateFile && (
            <p className={styles.savedFileNote}>
              Saved: <strong>{introTemplateFile.name}</strong>
              <button
                type="button"
                className={styles.clearFileButton}
                onClick={() => handleClearFile(INTRO_TEMPLATE_KEY, setIntroTemplateFile, introTemplateRef)}
              >
                Remove
              </button>
            </p>
          )}
          <p>
            Optional. Upload a .docx whose structure, headings, and formatting the generated
            module intro documents must follow exactly. Leave empty to use the default layout.
          </p>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="instructionsTemplate">Assignment Instructions Template (.docx, optional)</label>
        <div className={styles.fileField}>
          <input
            id="instructionsTemplate"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ref={instructionsTemplateRef}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null, INSTRUCTIONS_TEMPLATE_KEY, setInstructionsTemplateFile)}
          />
          {instructionsTemplateFile && (
            <p className={styles.savedFileNote}>
              Saved: <strong>{instructionsTemplateFile.name}</strong>
              <button
                type="button"
                className={styles.clearFileButton}
                onClick={() => handleClearFile(INSTRUCTIONS_TEMPLATE_KEY, setInstructionsTemplateFile, instructionsTemplateRef)}
              >
                Remove
              </button>
            </p>
          )}
          <p>
            Optional. Upload a .docx whose structure, headings, and formatting the generated
            assignment instruction documents must follow exactly. Leave empty to use the default layout.
          </p>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button
        type="button"
        className={styles.submitButton}
        onClick={handleGenerate}
        disabled={status === "loading"}
      >
        {status === "loading" ? "Generating…" : "Generate Lecture Plans"}
      </button>

      {status === "done" && plans.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <p style={{ margin: 0, fontWeight: 600, color: "var(--text-primary)" }}>
              Generated {plans.length} lecture plan{plans.length !== 1 ? "s" : ""}
            </p>
            <button
              type="button"
              className={styles.submitButton}
              onClick={handleDownloadAll}
              disabled={isDownloading}
              style={{ width: "auto", padding: "10px 24px" }}
            >
              {isDownloading ? "Building ZIP…" : "Download All as ZIP"}
            </button>
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {plans.map((plan) => {
              const badges: string[] = [];
              badges.push(`${plan.slides.length + 1} slide${plan.slides.length !== 0 ? "s" : ""}`);
              if (plan.moduleIntroduction) badges.push("Module Intro");
              if (plan.assignmentInstructions) badges.push("Instructions");
              return (
                <li
                  key={plan.assignmentName}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPlan(plan)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedPlan(plan); }}
                  style={{
                    background: "var(--field-background)",
                    border: "1px solid var(--field-border)",
                    borderRadius: 10,
                    padding: "14px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {plan.presentationTitle}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                    {plan.assignmentName}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                    {badges.map((badge) => (
                      <span
                        key={badge}
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: "color-mix(in srgb, var(--accent) 12%, transparent 88%)",
                          color: "var(--accent)",
                          border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent 75%)",
                        }}
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selectedPlan && (
        <LecturePlanPreviewModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
        />
      )}

      <div style={{ borderTop: "1px solid var(--field-border)", marginTop: 32, paddingTop: 28 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Course-Wide Rubric
          </h2>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            {provider === "other"
              ? "The grading rubric is produced together with the lecture package above — generate it there and it will appear here. It can be copied and pasted into the Grading tab."
              : "Generate a universal grading rubric derived from all assignment instructions in the uploaded zip. This rubric can be copied and pasted into the Grading tab."}
          </p>
        </div>

        {rubricError && <p className={styles.error}>{rubricError}</p>}

        {provider !== "other" && (
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleGenerateRubric}
            disabled={rubricStatus === "loading"}
            style={{ marginBottom: 16 }}
          >
            {rubricStatus === "loading" ? "Generating Rubric…" : "Generate Course Rubric"}
          </button>
        )}

        {rubricStatus === "done" && generatedRubric && (() => {
          const rows = parseGeneratedRubric(generatedRubric);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                  Generated rubric — applies to all assignments
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className={styles.downloadButton}
                    onClick={handleCopyRubric}
                  >
                    {rubricCopied ? "Copied!" : "Copy Rubric"}
                  </button>
                  <button
                    type="button"
                    className={styles.downloadButton}
                    onClick={handleDownloadRubricCsv}
                  >
                    Download CSV
                  </button>
                </div>
              </div>
              {rows ? (
                <table className={styles.generatedRubricTable}>
                  <thead>
                    <tr>
                      <th>Criterion</th>
                      <th>Weight</th>
                      <th>Performance Levels</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.area}>
                        <td>{row.area}</td>
                        <td>{row.weight.endsWith("%") ? row.weight : `${row.weight}%`}</td>
                        <td>
                          {row.subcategories.length > 0 ? (
                            <ul className={styles.rubricSubcategoryList}>
                              {row.subcategories.map((sub) => (
                                <li key={sub.label}><strong>{sub.label}:</strong> {sub.description}</li>
                              ))}
                            </ul>
                          ) : row.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <pre className={styles.generatedRubricBody}>{generatedRubric}</pre>
              )}
            </div>
          );
        })()}
      </div>
    </section>
  );
}
