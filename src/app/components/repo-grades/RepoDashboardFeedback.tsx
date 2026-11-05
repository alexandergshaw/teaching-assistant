"use client";

import { useLayoutEffect, useRef, useState } from "react";
import FeedbackExpandModal from "../grading-results/FeedbackExpandModal";
import RowFeedbackBoxes from "../grading-results/RowFeedbackBoxes";
import {
  copyAllFeedbackText,
  FEEDBACK_FIELDS,
  FEEDBACK_FIELD_META,
  formatFeedback,
  type FeedbackBoxesEdit,
  type FeedbackField,
} from "../grading-results/gradingResultsHelpers";
import {
  applyRepoGradeFeedbackFieldEdit, defaultRepoGradeCellEdit, EMPTY_REPO_GRADE_CELL_EDITS,
  type RepoGradeCellEdit, type RepoGradeCellEditsByRepo,
} from "./repoGradesCellEdits";
import { copyRepoFeedback, type RepoFeedbackCopyTarget } from "./repoFeedbackClipboard";
import { loadRepoGradeCells, persistRepoGradeCells } from "./repoGradesUiState";
import styles from "./repo-grades-dashboard.module.css";

function useFeedbackCopy(version: string) {
  const [previousVersion, setPreviousVersion] = useState(version);
  const [status, setStatus] = useState<{ key: string; success: boolean } | null>(null);
  const lifetime = useRef<object | null>(null);
  const latestRequest = useRef<object | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (previousVersion !== version) {
    setPreviousVersion(version);
    setStatus(null);
  }

  useLayoutEffect(() => {
    lifetime.current = {};
    return () => {
      lifetime.current = null;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [version]);

  const copy = async (key: string, value: string, target: RepoFeedbackCopyTarget) => {
    const scope = lifetime.current;
    const request = {};
    latestRequest.current = request;
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus(null);
    const isCurrent = () => scope !== null && lifetime.current === scope;
    const result = await copyRepoFeedback(() => navigator.clipboard, target, value, isCurrent);
    if (!isCurrent() || latestRequest.current !== request) return;
    const success = result.outcome === "success";
    setStatus({ key, success });
    if (success) timer.current = setTimeout(() => setStatus(null), 1500);
  };

  return { copy, copiedKey: status?.success ? status.key : null, failed: status?.success === false };
}

function CopyStatus({ copied, failed }: { copied: boolean; failed: boolean }) {
  return (
    <p role="status">
      {copied ? "Copied" : failed ? "Could not copy to the clipboard. Select the feedback text to copy it manually." : ""}
    </p>
  );
}

type LocalFeedbackProps = {
  repo: string;
  folder: string;
  edit: RepoGradeCellEdit;
  onScoreChange: (score: string) => void;
  onFeedbackChange: (field: FeedbackField, value: string) => void;
};

export function RepoDashboardFeedback(props: LocalFeedbackProps) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary aria-label={`Score and feedback for ${props.repo}, ${props.folder || "repository root"}`}>
        Score and feedback
      </summary>
      {open && <LocalFeedback {...props} />}
    </details>
  );
}

function LocalFeedback({ repo, folder, edit, onScoreChange, onFeedbackChange }: LocalFeedbackProps) {
  const [expandedField, setExpandedField] = useState<FeedbackField | null>(null);
  const expandTrigger = useRef<HTMLButtonElement | null>(null);
  const feedback: FeedbackBoxesEdit = {
    overall: edit.comment,
    strengths: edit.strengths,
    improvements: edit.improvements,
    resubmitNotice: edit.resubmitNotice,
  };
  const { copy, copiedKey, failed } = useFeedbackCopy(JSON.stringify([
    feedback, edit.score, edit.generatedScore, edit.generatedComment, edit.rubricAreas,
  ]));
  const label = folder || "Repository root";

  return (
    <div className={styles.feedback}>
      <label>
        Score
        <input aria-label={`${label} score for ${repo}`} inputMode="decimal" value={edit.score}
          onChange={(event) => onScoreChange(event.target.value)} />
      </label>
      {edit.generatedScore !== null && (
        <p>{edit.score === edit.generatedScore && edit.comment === edit.generatedComment
          ? "Generated result in this browser"
          : "Instructor draft based on a generated result"}</p>
      )}
      {edit.generatedScore === null && <p>Browser draft</p>}
      {feedback.overall !== "" && <p className={styles.feedbackText}>{feedback.overall}</p>}
      <RowFeedbackBoxes
        student={repo}
        namePrefix={label}
        keepCopyLabel
        edit={feedback}
        copiedKey={copiedKey}
        onCopy={copy}
        onChangeField={onFeedbackChange}
        onExpand={(field, trigger) => {
          expandTrigger.current = trigger;
          setExpandedField(field);
        }}
      />
      <CopyStatus copied={copiedKey !== null} failed={failed} />
      {expandedField && (
        <FeedbackExpandModal student={repo} namePrefix={label} field={expandedField} edit={feedback}
          onChange={onFeedbackChange} onClose={() => setExpandedField(null)} restoreFocusRef={expandTrigger} />
      )}
      {edit.rubricAreas.length > 0 && (
        <ul>
          {edit.rubricAreas.map((area, index) => (
            <li key={index}>
              {area.area} {area.score}
              <p className={styles.feedbackText}>{area.comment}</p>
            </li>
          ))}
        </ul>
      )}
      {edit.conflictingGrade && (
        <RepoDashboardHistoricalFeedback
          conflict
          row={{
            repo, folder, feedback: edit.conflictingGrade.comment ?? "",
            feedback_sections: {
              rawScore: edit.conflictingGrade.generatedScore ?? "",
              strengths: edit.conflictingGrade.strengths ?? "",
              improvements: edit.conflictingGrade.improvements ?? "",
              resubmitNotice: edit.conflictingGrade.resubmitNotice ?? "",
            },
            rubric: edit.conflictingGrade.rubricAreas,
          }}
        />
      )}
    </div>
  );
}

const RETENTION_LABELS = {
  overall: "overall feedback",
  strengths: "What Went Well",
  improvements: "What Could Be Better",
  resubmitNotice: "Resubmission Note",
  rawScore: "original generated score",
  rubric: "rubric feedback",
};

export type HistoricalFeedbackDraft = { edit: RepoGradeCellEdit; notice: string | null; saved: RepoGradeCellEditsByRepo };

export function RepoDashboardHistoricalFeedback({ row, draftScope, sessionDraft, onDraftChange, conflict }: {
  draftScope?: string;
  sessionDraft?: HistoricalFeedbackDraft;
  onDraftChange?: (draft: HistoricalFeedbackDraft) => void;
  conflict?: boolean;
  row: {
    repo: string;
    folder: string;
    feedback: string | null;
    score?: number | null;
    feedback_sections?: Omit<FeedbackBoxesEdit, "overall"> & { rawScore: string } | null;
    feedback_retention?: keyof typeof RETENTION_LABELS | null;
    rubric?: RepoGradeCellEdit["rubricAreas"] | null;
  };
}) {
  const { repo, folder, feedback, feedback_sections: sections, feedback_retention: retention, rubric } = row;
  const overall = feedback ?? "";
  const { copy, copiedKey, failed } = useFeedbackCopy(JSON.stringify([feedback, sections]));
  const [opened, setOpened] = useState(false);
  if (retention) {
    return <p>Feedback could not be saved because {RETENTION_LABELS[retention]} exceeded the storage limit.</p>;
  }
  if (feedback === null && !sections && !rubric?.length) return null;
  const sourceLabel = conflict ? "generated" : "historical";
  const copyLabel = sections ? `Copy all ${sourceLabel} feedback` : "Copy retained overall feedback";
  const targetName = `${repo}, ${folder || "repository root"}`;
  return (
    <details onToggle={(event) => { if (event.currentTarget.open) setOpened(true); }}>
      <summary aria-label={`${conflict ? "Separate generated result" : "Historical feedback"} for ${targetName}`}>
        {conflict ? "Generated result kept separately" : "Historical feedback"}
      </summary>
      {conflict && <p>Your instructor edits are still the current draft.</p>}
      {sections ? <p>Original generated score {sections.rawScore}</p> : (
        <p>Individual feedback sections are unavailable in this saved evaluation. Overall and rubric feedback may have been shortened or had links removed.</p>
      )}
      {overall && <p className={styles.feedbackText}>{overall}</p>}
      {sections && FEEDBACK_FIELDS.map((field) => {
        const meta = FEEDBACK_FIELD_META[field];
        return (
          <div key={field}>
            <p>{meta.fieldLabel}</p>
            <p className={styles.feedbackText}>{sections[field]}</p>
            <button type="button" aria-label={`Copy ${sourceLabel} ${meta.descriptorLower} for ${targetName}`}
              onClick={() => copy(field, formatFeedback(sections[field] || meta.emptyCopyFallback), field)}>
              {copiedKey === field ? "Copied" : `Copy ${meta.fieldLabel}`}
            </button>
          </div>
        );
      })}
      {(sections || overall) ? (
        <>
          <button
            type="button"
            aria-label={`${copyLabel} for ${targetName}`}
            onClick={() => copy("all", copyAllFeedbackText({
              overall, strengths: sections?.strengths ?? "", improvements: sections?.improvements ?? "",
              resubmitNotice: sections?.resubmitNotice ?? "",
            }), "all")}
          >
            {copiedKey === "all" ? "Copied" : copyLabel}
          </button>
          <CopyStatus copied={copiedKey !== null} failed={failed} />
        </>
      ) : <p>No overall feedback was retained.</p>}
      {!!rubric?.length && <ul>{rubric.map((area, index) => (
        <li key={index}>{area.area} {area.score}<p className={styles.feedbackText}>{area.comment}</p></li>
      ))}</ul>}
      {opened && draftScope && <HistoricalDraft scope={draftScope} repo={repo} folder={folder}
        sessionDraft={sessionDraft} onDraftChange={onDraftChange} seed={{
        ...defaultRepoGradeCellEdit(),
        score: sections?.rawScore ?? (row.score == null ? "" : String(row.score)),
        comment: overall,
        generatedScore: sections?.rawScore ?? null,
        generatedComment: feedback,
        strengths: sections?.strengths ?? "",
        improvements: sections?.improvements ?? "",
        resubmitNotice: sections?.resubmitNotice ?? "",
        rubricAreas: rubric ?? [],
      }} />}
    </details>
  );
}

function HistoricalDraft({ scope, repo, folder, seed, sessionDraft, onDraftChange }: {
  scope: string;
  repo: string;
  folder: string;
  seed: RepoGradeCellEdit;
  sessionDraft?: HistoricalFeedbackDraft;
  onDraftChange?: (draft: HistoricalFeedbackDraft) => void;
}) {
  const [restored] = useState(() => sessionDraft ? null : loadRepoGradeCells(scope, "history"));
  const [draft, setDraft] = useState<RepoGradeCellEdit | null>(() => sessionDraft?.edit ?? restored?.edits[repo]?.[folder] ?? null);
  const [saveNotice, setSaveNotice] = useState<string | null>(sessionDraft?.notice ?? null);
  const [saved, setSaved] = useState(sessionDraft?.saved ?? restored?.edits ?? EMPTY_REPO_GRADE_CELL_EDITS);

  const save = (next: RepoGradeCellEdit) => {
    setDraft(next);
    const edits = { [repo]: { [folder]: next } };
    const notice = persistRepoGradeCells(scope, edits, "history", saved);
    const nextSaved = notice ? saved : edits;
    setSaved(nextSaved);
    setSaveNotice(notice);
    onDraftChange?.({ edit: next, notice, saved: nextSaved });
  };

  return (
    <section aria-label={`Instructor draft for historical evaluation of ${repo}, ${folder || "repository root"}`}>
      {restored?.notice && <p role="status">{restored.notice}</p>}
      {saveNotice && <p role="status">{saveNotice}</p>}
      {draft ? (
        <>
          <p>Instructor draft for this saved evaluation</p>
          <LocalFeedback repo={repo} folder={folder} edit={draft}
            onScoreChange={(score) => save({ ...draft, score })}
            onFeedbackChange={(field, value) => save(applyRepoGradeFeedbackFieldEdit(draft, field, value))}
          />
        </>
      ) : <button type="button" onClick={() => setDraft(seed)}>Start instructor draft</button>}
    </section>
  );
}
