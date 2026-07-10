"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  fetchCanvasMetaAction,
  type GradeActionState,
  type TestGeminiState,
} from "../actions";
import type { PreviewFile } from "./FilePreviewModal";
import type { CanvasQueueItem } from "@/lib/canvas";
import { parseGeneratedRubric } from "../utils/rubric";
import { useLlmProvider } from "@/lib/llm-provider";
import { useInstitutionCounts } from "./InstitutionCounts";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import { submitOnEnter } from "./ui/submitOnEnter";
import LiveFeedPanel from "./LiveFeedPanel";
import GradingResults from "./GradingResults";
import GithubGradingPanel from "./GithubGradingPanel";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import styles from "../page.module.css";

type GradingMode = "zip" | "canvas" | "livefeed" | "github";

type GradingTabProps = {
  formAction: (payload: FormData) => void;
  pending: boolean;
  state: GradeActionState;
  testState: TestGeminiState;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
  onOpenPreview: (student: string, file: PreviewFile) => void;
};

export default function GradingTab({
  formAction,
  pending,
  state,
  testState,
  copiedKey,
  onCopy,
  onOpenPreview,
}: GradingTabProps) {
  const [selectedProvider] = useLlmProvider();
  const { refresh: refreshCounts, totalNeedsGrading } = useInstitutionCounts();
  // Grade-in-context: which Live Feed row is being graded, a signal to refetch
  // the queue after posting, and a ref to scroll the results into view.
  const [gradingTarget, setGradingTarget] = useState<{
    title: string;
    courseName: string;
    key: string;
  } | null>(null);
  const [queueRefreshSignal, setQueueRefreshSignal] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<GradingMode>(() => {
    if (typeof window === "undefined") return "zip";
    const saved = localStorage.getItem("ta-grading-source");
    return saved === "canvas" || saved === "livefeed" || saved === "github" ? saved : "zip";
  });
  const [canvasUrl, setCanvasUrl] = useState("");
  const [canvasRetrieved, setCanvasRetrieved] = useState(false);
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [rubric, setRubric] = useState("");

  const [canvasMeta, setCanvasMeta] = useState<{ status: "idle" | "loading" | "done" | "error"; message: string }>({ status: "idle", message: "" });

  const selectSource = (next: GradingMode) => {
    setSource(next);
    if (typeof window !== "undefined") localStorage.setItem("ta-grading-source", next);
  };

  const canvasUrlKind = detectCanvasUrlKind(canvasUrl);
  const graderLabel =
    selectedProvider === "other"
      ? "deterministic grader (against your CSV/JSON rubric)"
      : selectedProvider === "embedded"
        ? "embedded deterministic engine (rule-based checks, no AI; the rubric is used if present, otherwise generated from the instructions)"
        : "AI grader";

  // Retrieve the assignment/discussion description + rubric from Canvas and show
  // them as read-only fields. Triggered by the button below the URL.
  const handleRetrieveCanvas = async () => {
    const url = canvasUrl.trim();
    if (!url || !detectCanvasUrlKind(url)) {
      setCanvasMeta({ status: "error", message: "Enter a valid Canvas discussion or assignment URL first." });
      return;
    }
    setCanvasMeta({ status: "loading", message: "Retrieving details from Canvas…" });

    const result = await fetchCanvasMetaAction(url);
    if ("error" in result) {
      setCanvasMeta({ status: "error", message: result.error });
      return;
    }

    setAssignmentInstructions(result.description);
    setRubric(result.rubricText);
    setCanvasRetrieved(true);

    const parts: string[] = [];
    if (result.description) parts.push("instructions");
    if (result.rubricText) parts.push("rubric");
    const base = parts.length
      ? `Retrieved ${parts.join(" + ")} from Canvas.`
      : "Retrieved from Canvas.";
    const noRubric = result.rubricText
      ? ""
      : " No rubric was found in Canvas; none will be synthesized. Grading uses the assignment instructions only (attach a rubric in Canvas for per-criterion scoring).";
    const caveat =
      selectedProvider === "other" && result.rubricText
        ? " Note: the deterministic grader needs a check-based CSV/JSON rubric; this Canvas rubric may not map to automated checks."
        : "";
    setCanvasMeta({ status: "done", message: base + noRubric + caveat });
  };

  const run = state.run;

  // Live Feed "Auto Grade": grade a queue row through the very same pipeline as
  // the Single Assignment form. Set canvasUrl so a later "Post grades" targets
  // this assignment, then dispatch the grade action with the row's context.
  const handleAutoGrade = (row: CanvasQueueItem) => {
    setCanvasUrl(row.canvasUrl);
    setGradingTarget({ title: row.title, courseName: row.courseName, key: `${row.kind}-${row.id}` });
    const fd = new FormData();
    fd.set("canvasUrl", row.canvasUrl);
    fd.set("assignmentInstructions", row.description || row.title);
    fd.set("rubric", row.rubricText);
    fd.set("provider", selectedProvider);
    fd.set("institution", row.institution);
    formAction(fd);
  };

  // Scroll the results into view when a new grading run arrives (so Auto Grade
  // from the tall queue lands you on the results instead of leaving you scrolled up).
  useEffect(() => {
    if (run && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [run]);

  const handleAssignmentInstructionsChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setAssignmentInstructions(e.target.value);

  const handleRubricChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setRubric(e.target.value);

  const showContextFields = source === "zip" || canvasRetrieved;

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="grade-source">Grade from</label>
        <TextField
          select
          size="small"
          id="grade-source"
          value={source}
          onChange={(e) => selectSource(e.target.value as GradingMode)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="zip">Upload ZIP</MenuItem>
          <MenuItem value="canvas">Single Assignment</MenuItem>
          <MenuItem value="livefeed">Live Feed{totalNeedsGrading > 0 ? ` (${totalNeedsGrading})` : ""}</MenuItem>
          <MenuItem value="github">GitHub Repo</MenuItem>
        </TextField>
      </div>

      {pending && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Grading In Progress</p>
            <p className={styles.loadingText}>
              {selectedProvider === "gemini"
                ? "Reviewing submissions now. This can take a moment for larger archives."
                : "Running the grading checks now. This usually only takes a moment."}
            </p>
          </div>
        </div>
      )}

      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}

      {source === "github" ? (
        <GithubGradingPanel />
      ) : source === "livefeed" ? (
        <LiveFeedPanel
          provider={selectedProvider}
          pending={pending}
          run={run}
          gradingRowKey={gradingTarget?.key ?? null}
          refreshSignal={queueRefreshSignal}
          canvasUrl={canvasUrl}
          copiedKey={copiedKey}
          onCopy={onCopy}
          onOpenPreview={onOpenPreview}
          onAutoGrade={handleAutoGrade}
          onPosted={() => {
            refreshCounts();
            setQueueRefreshSignal((n) => n + 1);
          }}
        />
      ) : (
      <form className={styles.form} action={formAction}>
        <input type="hidden" name="provider" value={selectedProvider} />
        {source === "zip" ? (
          <div className={styles.field}>
            <label htmlFor="student-submissions">Student Submissions</label>
            <div className={styles.fileField}>
              <input
                id="student-submissions"
                name="studentSubmissions"
                type="file"
                accept=".zip,application/zip"
              />
              <p>Upload a zip archive that contains the student submissions.</p>
            </div>
          </div>
        ) : (
          <div className={styles.field}>
            <label htmlFor="canvas-url">Canvas URL</label>
            <TextField
              size="small"
              fullWidth
              id="canvas-url"
              name="canvasUrl"
              type="url"
              required
              placeholder="Paste a discussion or assignment link (.../discussion_topics/… or .../assignments/…)"
              value={canvasUrl}
              onChange={(e) => {
                setCanvasUrl(e.target.value);
                setCanvasRetrieved(false);
                setCanvasMeta({ status: "idle", message: "" });
              }}
              onKeyDown={submitOnEnter(handleRetrieveCanvas)}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={handleRetrieveCanvas}
              disabled={canvasMeta.status === "loading" || !canvasUrlKind}
              sx={{ alignSelf: "flex-start" }}
            >
              {canvasMeta.status === "loading" ? "Retrieving…" : "Retrieve from Canvas"}
            </Button>
            <p className={styles.fieldHint}>
              {canvasUrlKind === "discussion"
                ? `Detected: discussion board. Each student's posts and replies are pulled via the Canvas API and graded with the ${graderLabel}.`
                : canvasUrlKind === "assignment"
                  ? `Detected: assignment. Each student's submission text and uploaded files are pulled via the Canvas API and graded with the ${graderLabel}.`
                  : canvasUrl.trim()
                    ? "Unrecognized Canvas URL. Expecting a link like .../courses/123/discussion_topics/456 or .../courses/123/assignments/456."
                    : `Paste a Canvas discussion or assignment link, then retrieve it. The type is detected automatically and graded with the ${graderLabel}.`}
            </p>
            {canvasMeta.status !== "idle" && (
              <p
                className={styles.fieldHint}
                style={{ color: canvasMeta.status === "error" ? "var(--error, #b91c1c)" : undefined }}
              >
                {canvasMeta.message}
              </p>
            )}
          </div>
        )}

        {showContextFields && (
          <>
            <div className={styles.field}>
              <label htmlFor="assignment-instructions">Assignment Instructions</label>
              <TextField
                multiline
                minRows={10}
                fullWidth
                id="assignment-instructions"
                name="assignmentInstructions"
                slotProps={{ input: { readOnly: source === "canvas" } }}
                value={assignmentInstructions}
                onChange={handleAssignmentInstructionsChange}
                placeholder="Paste the assignment brief, requirements, and any special directions."
              />
            </div>

            {(source === "zip" || rubric.trim()) && (
              <div className={styles.field}>
                <label htmlFor="rubric">Rubric</label>
                <TextField
                  multiline
                  minRows={10}
                  fullWidth
                  id="rubric"
                  name="rubric"
                  slotProps={{ input: { readOnly: source === "canvas" } }}
                  value={rubric}
                  onChange={handleRubricChange}
                  placeholder="Paste the grading rubric, expectations, and scoring guidance."
                />
              </div>
            )}
          </>
        )}

        {selectedProvider === "other" && (
          <div className={styles.field}>
            <label htmlFor="rubric-file">Rubric file (CSV/JSON)</label>
            <input
              id="rubric-file"
              name="rubricFile"
              type="file"
              accept=".csv,.json,application/json,text/csv"
            />
            <p>
              Upload a check-based rubric for the deterministic grader (for example the
              rubric.csv produced by Course materials), or paste one in the Rubric box above.
            </p>
          </div>
        )}

        <Button
          variant="contained"
          size="small"
          type="submit"
          disabled={pending || (source === "canvas" && !canvasRetrieved)}
        >
          {pending ? (
            <>
              <span className={styles.btnSpinner} aria-hidden="true" />
              Grading...
            </>
          ) : (
            "Start Review"
          )}
        </Button>
      </form>
      )}

      {testState.result && (
        <p style={{ marginTop: "0.5rem", color: "green" }}>Gemini responded: {testState.result}</p>
      )}
      {testState.error && (
        <p style={{ marginTop: "0.5rem", color: "red" }}>Gemini error: {testState.error}</p>
      )}

      {source !== "livefeed" && run && run.results.length === 0 && (
        <p className={styles.emptyState}>
          {source === "zip"
            ? "No supported submission files were found in the zip archive."
            : "Nothing left to grade here. Every submission has already been graded, or no one has submitted yet."}
        </p>
      )}

      {state.generatedRubric && (() => {
        const rows = parseGeneratedRubric(state.generatedRubric);
        return (
          <details className={styles.generatedRubricCard}>
            <summary>Rubric was auto-generated from assignment instructions</summary>
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
              <pre className={styles.generatedRubricBody}>{state.generatedRubric}</pre>
            )}
          </details>
        );
      })()}

      {state.warnings && state.warnings.length > 0 && (
        <section className={styles.checklistCard}>
          <h2>Grading Notes</h2>
          <ul>
            {state.warnings.map((item, index) => (
              <li key={`grading-warning-${index + 1}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {source !== "livefeed" && run && run.results.length > 0 && (
        <GradingResults
          run={run}
          canvasUrl={canvasUrl}
          copiedKey={copiedKey}
          onCopy={onCopy}
          onOpenPreview={onOpenPreview}
          onPosted={() => {
            refreshCounts();
            setQueueRefreshSignal((n) => n + 1);
          }}
          sectionRef={resultsRef}
          banner={
            gradingTarget ? (
              <div className={styles.gradingBanner}>
                Grading <strong>{gradingTarget.title}</strong>
                {gradingTarget.courseName ? ` — ${gradingTarget.courseName}` : ""}
              </div>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
