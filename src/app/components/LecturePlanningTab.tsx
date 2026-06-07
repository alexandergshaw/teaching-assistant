"use client";

import { useEffect, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { generateLecturePlansAction, generateCourseRubricFromZipAction, type AssignmentPlan } from "../actions";
import { listCourseNamesAction, saveLecturePlanFilesAction } from "../courseActions";
import { parseGeneratedRubric } from "../utils/rubric";
import { buildExternalResourcesDocx } from "../utils/external-resources-docx";
import styles from "../page.module.css";
import LecturePlanPreviewModal from "./LecturePlanPreviewModal";

async function buildDocxFromPlainText(text: string): Promise<ArrayBuffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const FONT = "Times New Roman";
  const COLOR = "000000";

  const children: InstanceType<typeof Paragraph>[] = [];
  const lines = text.split("\n");
  let firstHeadingFound = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i >= lines.length - 1 || !lines[i + 1].trim();
    const isListItem = /^(\d+\.|[-•*])\s/.test(trimmed);
    const isHeading = trimmed.length < 80 && !isListItem && prevBlank && nextBlank;

    if (isHeading) {
      const level = !firstHeadingFound ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
      firstHeadingFound = true;
      children.push(new Paragraph({ children: [new TextRun({ text: trimmed, font: FONT, color: COLOR, bold: true })], heading: level }));
    } else if (/^\d+\.\s+/.test(trimmed)) {
      children.push(new Paragraph({ children: [new TextRun({ text: trimmed.replace(/^\d+\.\s+/, ""), font: FONT, color: COLOR })], bullet: { level: 0 } }));
    } else if (/^[-•*]\s+/.test(trimmed)) {
      children.push(new Paragraph({ children: [new TextRun({ text: trimmed.slice(trimmed.indexOf(" ") + 1), font: FONT, color: COLOR })], bullet: { level: 0 } }));
    } else {
      // Bold a leading "Label:" pattern if the paragraph starts with one.
      const labelMatch = trimmed.match(/^([A-Za-z][^:\n]{1,59}):\s+([\s\S]+)/);
      if (labelMatch) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: labelMatch[1] + ":", font: FONT, color: COLOR, bold: true }),
            new TextRun({ text: " " + labelMatch[2], font: FONT, color: COLOR }),
          ],
        }));
      } else {
        children.push(new Paragraph({ children: [new TextRun({ text: trimmed, font: FONT, color: COLOR })] }));
      }
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toArrayBuffer(doc);
}

export type LecturePlanFileKind =
  | "lecture"
  | "module_introduction"
  | "assignment_instructions";

export interface BuiltLecturePlanFile {
  kind: LecturePlanFileKind;
  title: string;
  fileName: string;
  data: ArrayBuffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Builds the downloadable artifacts (PowerPoint lecture plus optional module
 * introduction and assignment instruction documents) for each assignment plan.
 * Shared by the ZIP download and the database persistence paths so both produce
 * identical files.
 */
async function buildLecturePlanFiles(plans: AssignmentPlan[]): Promise<BuiltLecturePlanFile[]> {
  const { default: PptxGenJS } = await import("pptxgenjs");

  // Professional color palette
  const NAVY = "1a2744";
  const ACCENT = "2563eb";
  const WHITE = "ffffff";
  const LIGHT_BG = "f4f6fb";
  const BODY_TEXT = "1e293b";
  const SUBTITLE_TEXT = "94a3b8";

  const files: BuiltLecturePlanFile[] = [];

  for (const plan of plans) {
    const prs = new PptxGenJS();
    prs.layout = "LAYOUT_WIDE";

    // ── Title slide ──────────────────────────────────────────────
    const titleSlide = prs.addSlide();
    titleSlide.background = { fill: NAVY };

    // Decorative accent bar across the middle-bottom
    titleSlide.addShape(prs.ShapeType.rect, {
      x: 0, y: 4.6, w: "100%", h: 0.12,
      fill: { color: ACCENT },
      line: { color: ACCENT, width: 0 },
    });

    // Left-edge accent stripe
    titleSlide.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: 0.18, h: "100%",
      fill: { color: ACCENT },
      line: { color: ACCENT, width: 0 },
    });

    // Assignment name (subtle label above title)
    titleSlide.addText(plan.assignmentName.toUpperCase(), {
      x: 0.5, y: 1.6, w: "90%", h: 0.45,
      fontSize: 13, color: SUBTITLE_TEXT, align: "left",
      charSpacing: 2.5,
    });

    // Presentation title
    titleSlide.addText(plan.presentationTitle, {
      x: 0.5, y: 2.05, w: "90%", h: 2.0,
      fontSize: 42, bold: true, align: "left", color: WHITE,
      lineSpacingMultiple: 1.1,
    });

    // ── Content slides ───────────────────────────────────────────
    for (const slide of plan.slides) {
      const s = prs.addSlide();
      s.background = { fill: LIGHT_BG };

      // Header bar
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 0, w: "100%", h: 1.35,
        fill: { color: NAVY },
        line: { color: NAVY, width: 0 },
      });

      // Accent strip below header
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 1.35, w: "100%", h: 0.07,
        fill: { color: ACCENT },
        line: { color: ACCENT, width: 0 },
      });

      // Left-edge accent stripe (continues into content)
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 1.42, w: 0.12, h: 5.33,
        fill: { color: ACCENT },
        line: { color: ACCENT, width: 0 },
      });

      // Slide title in header
      s.addText(slide.title, {
        x: 0.4, y: 0.12, w: "92%", h: 1.11,
        fontSize: 26, bold: true, color: WHITE,
        valign: "middle",
      });

      // Bullet content
      if (slide.bullets.length > 0) {
        s.addText(
          slide.bullets.map((b) => ({
            text: b,
            options: {
              bullet: { type: "bullet" },
              paraSpaceBefore: 10,
              color: BODY_TEXT,
              fontSize: 18,
            },
          })),
          {
            x: 0.45, y: 1.6, w: "91%", h: 5.0,
            valign: "top",
            lineSpacingMultiple: 1.2,
          }
        );
      }
    }

    const pptxData = await prs.write({ outputType: "arraybuffer" }) as ArrayBuffer;
    const safeName = plan.assignmentName.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
    files.push({
      kind: "lecture",
      title: plan.presentationTitle || plan.assignmentName,
      fileName: `${safeName}.pptx`,
      data: pptxData,
    });
    if (plan.moduleIntroduction) {
      files.push({
        kind: "module_introduction",
        title: `${plan.assignmentName} Module Introduction`,
        fileName: `${safeName}_module_intro.docx`,
        data: await buildDocxFromPlainText(plan.moduleIntroduction),
      });
    }
    if (plan.assignmentInstructions) {
      files.push({
        kind: "assignment_instructions",
        title: `${plan.assignmentName} Instructions`,
        fileName: `${safeName}_assignment_instructions.docx`,
        data: await buildDocxFromPlainText(plan.assignmentInstructions),
      });
    }
  }

  return files;
}

export default function LecturePlanningTab() {
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

  // Course selection + database persistence state
  const [courseOptions, setCourseOptions] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; title: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await listCourseNamesAction();
      if (!active || "error" in result) return;
      setCourseOptions(result.courses);
    })();
    return () => {
      active = false;
    };
  }, []);

  const persistLecturePlans = async (
    plans: AssignmentPlan[],
    courseId: string,
    zipBase64: string,
    zipFileName: string
  ) => {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const built = await buildLecturePlanFiles(plans);
      const files = built.map((f) => ({
        kind: f.kind,
        title: f.title,
        fileName: f.fileName,
        base64: arrayBufferToBase64(f.data),
      }));
      const result = await saveLecturePlanFilesAction({
        courseId,
        codebaseZipBase64: zipBase64,
        codebaseZipFileName: zipFileName,
        files,
      });
      if ("error" in result) {
        setSaveStatus("error");
        setSaveError(result.error);
      } else {
        setSaveStatus("saved");
      }
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Failed to save lecture files.");
    }
  };

  const handleGenerate = async () => {
    const file = zipFileRef.current?.files?.[0];
    if (!file) {
      setError("Please select a zip file of your course repository.");
      return;
    }

    if (!selectedCourse) {
      setError("Please select a course to save the generated files to.");
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
    setSaveStatus("idle");
    setSaveError(null);

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

      const result = await generateLecturePlansAction(base64, minutes);

      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }

      setPlans(result);
      setStatus("done");

      // Persist the submitted repository zip and the generated files to the
      // selected course so they appear in the Course Library tab.
      await persistLecturePlans(result, selectedCourse.id, base64, file.name);
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
      const { default: PptxGenJS } = await import("pptxgenjs");

      const outputZip = new JSZip();

      // Professional color palette
      const NAVY = "1a2744";
      const ACCENT = "2563eb";
      const WHITE = "ffffff";
      const LIGHT_BG = "f4f6fb";
      const BODY_TEXT = "1e293b";
      const SUBTITLE_TEXT = "94a3b8";

      for (const plan of plans) {
        const prs = new PptxGenJS();
        prs.layout = "LAYOUT_WIDE";

        // ── Title slide ──────────────────────────────────────────────
        const titleSlide = prs.addSlide();
        titleSlide.background = { fill: NAVY };

        // Decorative accent bar across the middle-bottom
        titleSlide.addShape(prs.ShapeType.rect, {
          x: 0, y: 4.6, w: "100%", h: 0.12,
          fill: { color: ACCENT },
          line: { color: ACCENT, width: 0 },
        });

        // Left-edge accent stripe
        titleSlide.addShape(prs.ShapeType.rect, {
          x: 0, y: 0, w: 0.18, h: "100%",
          fill: { color: ACCENT },
          line: { color: ACCENT, width: 0 },
        });

        // Assignment name (subtle label above title)
        titleSlide.addText(plan.assignmentName.toUpperCase(), {
          x: 0.5, y: 1.6, w: "90%", h: 0.45,
          fontSize: 13, color: SUBTITLE_TEXT, align: "left",
          charSpacing: 2.5,
        });

        // Presentation title
        titleSlide.addText(plan.presentationTitle, {
          x: 0.5, y: 2.05, w: "90%", h: 2.0,
          fontSize: 42, bold: true, align: "left", color: WHITE,
          lineSpacingMultiple: 1.1,
        });

        // ── Content slides ───────────────────────────────────────────
        for (const slide of plan.slides) {
          const s = prs.addSlide();
          s.background = { fill: LIGHT_BG };

          // Header bar
          s.addShape(prs.ShapeType.rect, {
            x: 0, y: 0, w: "100%", h: 1.35,
            fill: { color: NAVY },
            line: { color: NAVY, width: 0 },
          });

          // Accent strip below header
          s.addShape(prs.ShapeType.rect, {
            x: 0, y: 1.35, w: "100%", h: 0.07,
            fill: { color: ACCENT },
            line: { color: ACCENT, width: 0 },
          });

          // Left-edge accent stripe (continues into content)
          s.addShape(prs.ShapeType.rect, {
            x: 0, y: 1.42, w: 0.12, h: 5.33,
            fill: { color: ACCENT },
            line: { color: ACCENT, width: 0 },
          });

          // Slide title in header
          s.addText(slide.title, {
            x: 0.4, y: 0.12, w: "92%", h: 1.11,
            fontSize: 26, bold: true, color: WHITE,
            valign: "middle",
          });

          // Bullet content
          if (slide.bullets.length > 0) {
            s.addText(
              slide.bullets.map((b) => ({
                text: b,
                options: {
                  bullet: { type: "bullet" },
                  paraSpaceBefore: 10,
                  color: BODY_TEXT,
                  fontSize: 18,
                },
              })),
              {
                x: 0.45, y: 1.6, w: "91%", h: 5.0,
                valign: "top",
                lineSpacingMultiple: 1.2,
              }
            );
          }
        }

        const pptxData = await prs.write({ outputType: "arraybuffer" }) as ArrayBuffer;
        const safeName = plan.assignmentName.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
        outputZip.file(`${safeName}.pptx`, pptxData);
        if (plan.moduleIntroduction) {
          outputZip.file(`${safeName}_module_intro.docx`, await buildDocxFromPlainText(plan.moduleIntroduction));
        }
        if (plan.assignmentInstructions) {
          outputZip.file(`${safeName}_assignment_instructions.docx`, await buildDocxFromPlainText(plan.assignmentInstructions));
        }
        if (plan.externalResources && plan.externalResources.length > 0) {
          outputZip.file(`${safeName}_external_resources.docx`, await buildExternalResourcesDocx(plan.assignmentName, plan.externalResources));
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
    const file = zipFileRef.current?.files?.[0];
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

      const result = await generateCourseRubricFromZipAction(base64);

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
        <label htmlFor="lectureCourse">Course</label>
        <Autocomplete
          id="lectureCourse"
          options={courseOptions}
          getOptionLabel={(option) => option.title}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          value={selectedCourse}
          onChange={(_, value) => setSelectedCourse(value)}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Select a course"
              size="small"
            />
          )}
          sx={{ maxWidth: 360 }}
        />
        <p>
          Generated lecture files are saved to the selected course and listed in the
          Course Library tab. Create a course on the New Build Courses tab if the list is empty.
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
          />
          <p>
            Upload a zip of your template repository. The zip must contain an{" "}
            <code>assignments</code> folder (or similar) with one subfolder per assignment.
            Each subfolder should include the README, any unit tests, and assignment source files.
            Maximum upload size: ~7 MB zip.
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

      {saveStatus === "saving" && (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 12 }}>
          Saving files to the Course Library…
        </p>
      )}
      {saveStatus === "saved" && (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 12 }}>
          Saved to the Course Library{selectedCourse ? ` under "${selectedCourse.title}"` : ""}.
        </p>
      )}
      {saveStatus === "error" && saveError && (
        <p className={styles.error}>Could not save to the Course Library: {saveError}</p>
      )}

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
              if (plan.externalResources && plan.externalResources.length > 0) badges.push("Resources");
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
            Generate a universal grading rubric derived from all assignment instructions in the uploaded zip.
            This rubric can be copied and pasted into the Grading tab.
          </p>
        </div>

        {rubricError && <p className={styles.error}>{rubricError}</p>}

        <button
          type="button"
          className={styles.submitButton}
          onClick={handleGenerateRubric}
          disabled={rubricStatus === "loading"}
          style={{ marginBottom: 16 }}
        >
          {rubricStatus === "loading" ? "Generating Rubric…" : "Generate Course Rubric"}
        </button>

        {rubricStatus === "done" && generatedRubric && (() => {
          const rows = parseGeneratedRubric(generatedRubric);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                  Generated rubric — applies to all assignments
                </span>
                <button
                  type="button"
                  className={styles.downloadButton}
                  onClick={handleCopyRubric}
                >
                  {rubricCopied ? "Copied!" : "Copy Rubric"}
                </button>
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
