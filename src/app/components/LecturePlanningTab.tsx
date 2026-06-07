"use client";

import { useRef, useState } from "react";
import { generateLecturePlansAction, generateCourseRubricFromZipAction, type AssignmentPlan } from "../actions";
import { parseGeneratedRubric } from "../utils/rubric";
import styles from "../page.module.css";
import LecturePlanPreviewModal from "./LecturePlanPreviewModal";

async function buildDocxFromPlainText(
  text: string,
  templateHeadings?: string[]
): Promise<ArrayBuffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const FONT = "Times New Roman";
  const COLOR = "000000";

  // Normalize heading text for robust matching (case, surrounding punctuation,
  // numbering prefixes, and whitespace are ignored).
  const normalizeHeading = (value: string) =>
    value
      .toLowerCase()
      .replace(/^[\d.)\s-]+/, "")
      .replace(/[:.\s]+$/, "")
      .replace(/\s+/g, " ")
      .trim();

  // When a template was supplied, ONLY lines that exactly match one of the
  // template's real headings may receive heading formatting. Body text is never
  // promoted to a heading, no matter how short or isolated it is.
  const hasTemplate = Array.isArray(templateHeadings) && templateHeadings.length > 0;
  const allowedHeadings = new Set((templateHeadings ?? []).map(normalizeHeading));

  const children: InstanceType<typeof Paragraph>[] = [];
  const lines = text.split("\n");
  let firstHeadingFound = false;

  // Detect whether the document uses markdown heading markers (# / ##). When it
  // does we trust those markers exclusively: a level-1 marker is the document
  // title and deeper markers are section headings.
  const hasMarkdownHeadings = lines.some((l) => /^#{1,6}\s+/.test(l.trim()));

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const markdownMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);

    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i >= lines.length - 1 || !lines[i + 1].trim();
    const isListItem = /^(\d+\.|[-•*])\s/.test(trimmed);

    let isHeading: boolean;
    let headingText = trimmed;
    let isTitleLevel = false;

    if (hasMarkdownHeadings) {
      isHeading = markdownMatch !== null;
      if (markdownMatch) {
        headingText = markdownMatch[2].trim();
        isTitleLevel = markdownMatch[1].length === 1;
      }
    } else if (hasTemplate) {
      isHeading = allowedHeadings.has(normalizeHeading(trimmed));
    } else {
      isHeading = trimmed.length < 80 && !isListItem && prevBlank && nextBlank;
    }

    if (isHeading) {
      const level =
        (hasMarkdownHeadings ? isTitleLevel : !firstHeadingFound)
          ? HeadingLevel.HEADING_1
          : HeadingLevel.HEADING_2;
      firstHeadingFound = true;
      children.push(new Paragraph({ children: [new TextRun({ text: headingText, font: FONT, color: COLOR, bold: true })], heading: level }));
    } else if (/^\d+\.\s+/.test(trimmed)) {
      children.push(new Paragraph({ children: [new TextRun({ text: trimmed.replace(/^\d+\.\s+/, ""), font: FONT, color: COLOR })], bullet: { level: 0 } }));
    } else if (/^[-•*]\s+/.test(trimmed)) {
      children.push(new Paragraph({ children: [new TextRun({ text: trimmed.slice(trimmed.indexOf(" ") + 1), font: FONT, color: COLOR })], bullet: { level: 0 } }));
    } else {
      children.push(new Paragraph({ children: [new TextRun({ text: trimmed, font: FONT, color: COLOR })] }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toArrayBuffer(doc);
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
  const introTemplateRef = useRef<HTMLInputElement>(null);
  const instructionsTemplateRef = useRef<HTMLInputElement>(null);

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
    const file = zipFileRef.current?.files?.[0];
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

      const introTemplateFile = introTemplateRef.current?.files?.[0];
      const instructionsTemplateFile = instructionsTemplateRef.current?.files?.[0];
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
        instructionsTemplateBase64
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
      const [{ default: PptxGenJS }, { default: JSZip }] = await Promise.all([
        import("pptxgenjs"),
        import("jszip"),
      ]);

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
          fontSize: 13, color: SUBTITLE_TEXT, align: "center",
          charSpacing: 2.5,
        });

        // Presentation title
        titleSlide.addText(plan.presentationTitle, {
          x: 0.5, y: 2.05, w: "90%", h: 2.0,
          fontSize: 42, bold: true, align: "center", color: WHITE,
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

      <div className={styles.field}>
        <label htmlFor="introTemplate">Module Intro Template (.docx, optional)</label>
        <div className={styles.fileField}>
          <input
            id="introTemplate"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ref={introTemplateRef}
          />
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
          />
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
