"use client";

import { useRef, useState } from "react";
import { generateAssignmentSlidesAction } from "../actions";
import styles from "../page.module.css";

type AssignmentResult = {
  name: string;
  pptxBase64: string;
  error?: string;
};

type ProgressEntry = {
  name: string;
  status: "pending" | "processing" | "done" | "error";
  message?: string;
};

// Code file extensions to extract comments from
const CODE_EXTENSIONS = new Set([
  "py", "js", "ts", "jsx", "tsx", "java", "c", "cpp", "cc", "h", "hpp",
  "cs", "go", "rb", "rs", "swift", "kt", "scala", "php", "r",
]);

// Test file patterns
function isTestFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.includes("test") ||
    lower.includes("spec") ||
    lower.endsWith("_test.py") ||
    lower.endsWith(".test.js") ||
    lower.endsWith(".spec.ts")
  );
}

function isDocFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".rst");
}

function extractComments(content: string, ext: string): string {
  const lines = content.split("\n").slice(0, 200);
  const commentLines: string[] = [];

  const singleLinePrefix = ["py", "rb", "r", "sh", "bash"].includes(ext) ? "#" : "//";
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (inBlockComment) {
      commentLines.push(trimmed.replace(/\*?\/$/, "").trim());
      if (trimmed.includes("*/")) inBlockComment = false;
    } else if (trimmed.startsWith("/*")) {
      inBlockComment = true;
      commentLines.push(trimmed.slice(2).trim());
      if (trimmed.includes("*/")) inBlockComment = false;
    } else if (trimmed.startsWith(singleLinePrefix)) {
      commentLines.push(trimmed.slice(singleLinePrefix.length).trim());
    }
  }

  return commentLines
    .filter((l) => l.length > 0)
    .slice(0, 80)
    .join("\n");
}

function buildAssignmentContext(
  files: Record<string, string>,
  folderPrefix: string
): string {
  const parts: string[] = [];

  // Sort: README first, then other md/txt, then test files, then code files
  const fileEntries = Object.entries(files).filter(([path]) =>
    path.startsWith(folderPrefix)
  );

  const readmeFiles = fileEntries.filter(([p]) => /readme/i.test(p.split("/").pop() ?? ""));
  const docFiles = fileEntries.filter(
    ([p]) => isDocFile(p) && !/readme/i.test(p.split("/").pop() ?? "")
  );
  const testFiles = fileEntries.filter(([p]) => isTestFile(p.split("/").pop() ?? ""));
  const codeFiles = fileEntries.filter(([p]) => {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    return CODE_EXTENSIONS.has(ext) && !isTestFile(p.split("/").pop() ?? "");
  });

  for (const [path, content] of readmeFiles) {
    const name = path.split("/").pop() ?? path;
    parts.push(`=== ${name} ===\n${content.slice(0, 4000)}`);
  }

  for (const [path, content] of docFiles.slice(0, 3)) {
    const name = path.split("/").pop() ?? path;
    parts.push(`=== ${name} ===\n${content.slice(0, 2000)}`);
  }

  for (const [path, content] of testFiles.slice(0, 4)) {
    const name = path.split("/").pop() ?? path;
    parts.push(`=== TEST: ${name} ===\n${content.slice(0, 2000)}`);
  }

  for (const [path, content] of codeFiles.slice(0, 4)) {
    const name = path.split("/").pop() ?? path;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const comments = extractComments(content, ext);
    if (comments) {
      parts.push(`=== COMMENTS FROM ${name} ===\n${comments}`);
    }
  }

  return parts.join("\n\n");
}

export default function LecturePlanningTab() {
  const [lectureDuration, setLectureDuration] = useState(60);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please upload a zip file of your codebase.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Please upload a .zip file.");
      return;
    }
    if (lectureDuration < 1) {
      setError("Please enter a valid lecture duration.");
      return;
    }

    setError(null);
    setProgress([]);
    setIsGenerating(true);

    try {
      const [{ default: JSZip }, { default: PptxGenJS }] = await Promise.all([
        import("jszip"),
        import("pptxgenjs"),
      ]);

      // Load the uploaded zip
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Read all text files into a map: path → content
      const fileContents: Record<string, string> = {};
      const readPromises: Promise<void>[] = [];

      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;
        const lowerPath = relativePath.toLowerCase();
        const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
        const isReadable =
          isDocFile(lowerPath) ||
          isTestFile(relativePath.split("/").pop() ?? "") ||
          CODE_EXTENSIONS.has(ext);

        if (isReadable) {
          readPromises.push(
            zipEntry.async("string").then((content) => {
              fileContents[relativePath] = content;
            }).catch(() => {
              // Skip unreadable files
            })
          );
        }
      });

      await Promise.all(readPromises);

      // Identify top-level assignment folders
      const folderSet = new Set<string>();
      for (const path of Object.keys(fileContents)) {
        const parts = path.split("/");
        if (parts.length >= 2) {
          folderSet.add(parts[0] + "/");
        }
      }

      // If no subdirectories found, treat root as a single assignment
      let assignmentFolders: string[] = [...folderSet].sort();
      if (assignmentFolders.length === 0) {
        assignmentFolders = [""];
      }

      // Filter out folders that contain no useful files
      assignmentFolders = assignmentFolders.filter((folder) => {
        const folderFiles = Object.keys(fileContents).filter((p) =>
          p.startsWith(folder)
        );
        return folderFiles.length > 0;
      });

      if (assignmentFolders.length === 0) {
        setError("No assignment folders with readable files found in the zip.");
        setIsGenerating(false);
        return;
      }

      // Initialize progress entries
      const initialProgress: ProgressEntry[] = assignmentFolders.map((folder) => ({
        name: folder === "" ? "Root" : folder.replace(/\/$/, ""),
        status: "pending",
      }));
      setProgress(initialProgress);

      const results: AssignmentResult[] = [];

      for (let i = 0; i < assignmentFolders.length; i++) {
        const folder = assignmentFolders[i];
        const assignmentName = folder === "" ? file.name.replace(/\.zip$/i, "") : folder.replace(/\/$/, "");

        // Mark as processing
        setProgress((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: "processing" };
          return next;
        });

        const context = buildAssignmentContext(fileContents, folder);
        const result = await generateAssignmentSlidesAction(
          assignmentName,
          context,
          lectureDuration
        );

        if ("error" in result) {
          setProgress((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], status: "error", message: result.error };
            return next;
          });
          results.push({ name: assignmentName, pptxBase64: "", error: result.error });
          continue;
        }

        // Build the PPTX
        const prs = new PptxGenJS();
        prs.layout = "LAYOUT_WIDE";

        const titleSlide = prs.addSlide();
        titleSlide.addText(result.presentationTitle, {
          x: 0.5, y: 2.2, w: "90%", h: 1.8,
          fontSize: 40, bold: true, align: "center", color: "1a1a2e",
        });

        for (const slide of result.slides) {
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

        const pptxData = await prs.write({ outputType: "base64" }) as string;

        setProgress((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: "done" };
          return next;
        });

        results.push({ name: assignmentName, pptxBase64: pptxData });
      }

      // Bundle all PPTs into a single zip
      const outputZip = new JSZip();
      for (const r of results) {
        if (!r.error && r.pptxBase64) {
          const safeName = r.name.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
          outputZip.file(`${safeName}.pptx`, r.pptxBase64, { base64: true });
        }
      }

      const blob = await outputZip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const zipBaseName = file.name.replace(/\.zip$/i, "");
      a.download = `${zipBaseName}_lectures.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const successCount = progress.filter((p) => p.status === "done").length;
  const errorCount = progress.filter((p) => p.status === "error").length;
  const isComplete = progress.length > 0 && !isGenerating;

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h1>Lecture Planning</h1>
        <p>
          Upload a zip of your course codebase. The AI will inspect each assignment folder —
          reading README files, documentation, tests, and code comments — and generate a
          tailored PowerPoint lecture for each assignment, bundled into a single zip.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="lectureDuration">Lecture Duration (minutes)</label>
        <input
          id="lectureDuration"
          type="number"
          min={1}
          max={300}
          className={styles.textInput}
          style={{ maxWidth: 180 }}
          value={lectureDuration}
          onChange={(e) => setLectureDuration(Math.max(1, Number(e.target.value)))}
          disabled={isGenerating}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="codezipUpload">Codebase Zip</label>
        <div className={styles.fileField}>
          <input
            id="codezipUpload"
            type="file"
            accept=".zip"
            ref={fileRef}
            disabled={isGenerating}
          />
          <p>
            Upload a .zip of your course repository. Each top-level folder is treated as
            a separate assignment. README files, markdown docs, unit tests, and code
            comments are used as context.
          </p>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button
        type="button"
        className={styles.submitButton}
        onClick={handleGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? "Generating…" : "Generate Lectures"}
      </button>

      {progress.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {isComplete && (
            <p style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {successCount} lecture{successCount !== 1 ? "s" : ""} generated
              {errorCount > 0 ? `, ${errorCount} failed` : ""}.
              {successCount > 0 ? " Your download should start automatically." : ""}
            </p>
          )}
          {progress.map((entry) => (
            <div key={entry.name} className={styles.loadingState}>
              {entry.status === "processing" && (
                <div className={styles.spinner} aria-hidden="true" />
              )}
              {entry.status === "done" && (
                <span style={{ color: "#16a34a", fontWeight: 700, marginTop: 2, lineHeight: 1 }}>✓</span>
              )}
              {entry.status === "error" && (
                <span style={{ color: "#dc2626", fontWeight: 700, marginTop: 2, lineHeight: 1 }}>✗</span>
              )}
              {entry.status === "pending" && (
                <span style={{ width: 16, height: 16, display: "inline-block", marginTop: 2 }} />
              )}
              <div>
                <p className={styles.loadingTitle}>{entry.name}</p>
                {entry.status === "processing" && (
                  <p className={styles.loadingText}>Generating slides…</p>
                )}
                {entry.status === "error" && entry.message && (
                  <p className={styles.loadingText} style={{ color: "#dc2626" }}>{entry.message}</p>
                )}
                {entry.status === "done" && (
                  <p className={styles.loadingText}>Slides ready</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
