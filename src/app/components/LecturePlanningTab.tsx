"use client";

import { useRef, useState } from "react";
import { generateLecturePlansAction, type AssignmentPlan } from "../actions";
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
  const zipFileRef = useRef<HTMLInputElement>(null);

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

      for (const plan of plans) {
        const prs = new PptxGenJS();
        prs.layout = "LAYOUT_WIDE";

        const titleSlide = prs.addSlide();
        titleSlide.addText(plan.presentationTitle, {
          x: 0.5, y: 2.2, w: "90%", h: 1.8,
          fontSize: 40, bold: true, align: "center", color: "1a1a2e",
        });

        for (const slide of plan.slides) {
          const s = prs.addSlide();
          s.addText(slide.title, {
            x: 0.5, y: 0.3, w: "90%", h: 1,
            fontSize: 28, bold: true, color: "1a1a2e",
          });
          if (slide.bullets.length > 0) {
            s.addText(
              slide.bullets.map((b) => ({ text: b, options: { bullet: true, paraSpaceBefore: 8 } })),
              { x: 0.5, y: 1.55, w: "90%", h: 4, fontSize: 18, color: "2d2d2d", valign: "top" }
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
    </section>
  );
}
