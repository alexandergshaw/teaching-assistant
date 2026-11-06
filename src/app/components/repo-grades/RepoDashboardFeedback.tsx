"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Accordion, AccordionDetails, AccordionSummary, List, ListItem } from "@mui/material";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import FeedbackExpandModal from "../grading-results/FeedbackExpandModal";
import RowFeedbackBoxes from "../grading-results/RowFeedbackBoxes";
import {
  copyAllFeedbackText,
  FEEDBACK_FIELDS,
  FEEDBACK_FIELD_META,
  formatFeedback,
  OVERALL_FEEDBACK_META,
  type FeedbackBoxesEdit,
  type FeedbackField,
} from "../grading-results/gradingResultsHelpers";
import {
  applyRepoGradeFeedbackFieldEdit, defaultRepoGradeCellEdit, EMPTY_REPO_GRADE_CELL_EDITS,
  type RepoGradeCellEdit, type RepoGradeCellEditsByRepo, type RepoGradeFeedbackDraft, type RetainedRepoGradeResult,
} from "./repoGradesCellEdits";
import { copyRepoFeedback, type RepoFeedbackCopyTarget } from "./repoFeedbackClipboard";
import { loadRepoGradeCells, persistRepoGradeCells } from "./repoGradesUiState";
import type { UseRepoGradesGradingActionsResult } from "./useRepoGradesGradingActions";
import styles from "./repo-grades-dashboard.module.css";

function useFeedbackCopy(version: string, isAvailable?: () => boolean, source?: RetainedRepoGradeResult["source"]) {
  const [identity, setIdentity] = useState({ version, source });
  const [status, setStatus] = useState<{ key: string; success: boolean } | null>(null);
  const lifetime = useRef<{ identity: typeof identity } | null>(null);
  const invalidated = useRef<typeof identity | null>(null);
  const latestRequest = useRef<object | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (identity.version !== version || identity.source !== source) {
    setIdentity({ version, source });
    setStatus(null);
  }

  useLayoutEffect(() => {
    lifetime.current = { identity };
    return () => {
      lifetime.current = null;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [identity]);

  const isActive = () => lifetime.current?.identity === identity && (isAvailable?.() ?? true);
  const invalidateCopy = () => {
    invalidated.current = identity;
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus(null);
  };

  const copy = async (key: string, value: string, target: RepoFeedbackCopyTarget) => {
    const mount = lifetime.current;
    const matchesContent = () => isActive() && lifetime.current === mount && invalidated.current !== identity;
    if (!matchesContent()) return;
    const request = {};
    latestRequest.current = request;
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus(null);
    const isCurrent = () => matchesContent() && latestRequest.current === request;
    const result = await copyRepoFeedback(() => navigator.clipboard, target, value, isCurrent);
    if (!isCurrent()) return;
    const success = result.outcome === "success";
    setStatus({ key, success });
    if (success) timer.current = setTimeout(() => setStatus(null), 1500);
  };

  return { copy, isActive, invalidateCopy, copiedKey: status?.success ? status.key : null, failed: status?.success === false };
}

function CopyStatus({ copied, failed }: { copied: boolean; failed: boolean }) {
  return (
    <p role="status">
      {copied ? "Copied" : failed ? "Could not copy to the clipboard. Select the feedback text to copy it manually." : ""}
    </p>
  );
}

export function FeedbackDisclosure({ title, label, expanded, onExpand, children, compact = false }: {
  title: string;
  label?: string;
  compact?: boolean;
  expanded?: boolean;
  onExpand?: (expanded: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Accordion disableGutters elevation={0} expanded={expanded}
      onChange={(_, next) => onExpand?.(next)}
      slotProps={{ transition: { timeout: 0 } }}
      sx={compact ? { width: "100%", bgcolor: "transparent", "&::before": { display: "none" } } : undefined}>
      <AccordionSummary id={`${id}-summary`} aria-controls={`${id}-content`} aria-label={label ?? title}
        expandIcon={<span className={styles.feedbackChevron} aria-hidden="true" />}
        sx={compact ? { px: 0, minHeight: 28, "& .MuiAccordionSummary-content": { my: 0 } } : undefined}>
        {title}
      </AccordionSummary>
      <AccordionDetails sx={compact ? { px: 0, pt: 1 } : undefined}>{children}</AccordionDetails>
    </Accordion>
  );
}

export function RepoResultFeedback({ repo, folder, source, feedback, rubric }: {
  repo: string;
  folder: string;
  source: string;
  feedback: FeedbackBoxesEdit;
  rubric: readonly Readonly<RepoGradeCellEdit["rubricAreas"][number]>[];
}) {
  const hasComment = Object.values(feedback).some((value) => value.trim() !== "");
  const target = `${source} feedback for ${repo}, ${folder || "repository root"}`;
  const { copy, copiedKey, failed } = useFeedbackCopy(JSON.stringify([target, feedback]));
  if (!hasComment && rubric.length === 0) return null;
  return (
    <>
      {hasComment && (
        <Button type="button" size="small" aria-label={`Copy ${target}`}
          onClick={() => void copy("all", copyAllFeedbackText(feedback), "all")}>
          {copiedKey === "all" ? "Copied" : "Copy feedback"}
        </Button>
      )}
      <FeedbackDisclosure title="Rubric and comments" label={`Breakdown and ${target}`}>
        {rubric.length > 0 && (
          <List dense>
            {rubric.map((area, index) => (
              <ListItem sx={{ display: "list-item" }} key={index}>
                {area.area} {area.score || "Score unavailable"}
                {area.comment && <p className={styles.feedbackText}>{area.comment}</p>}
              </ListItem>
            ))}
          </List>
        )}
        {feedback.overall && (
          <>
            <p className={styles.feedbackText}>{feedback.overall}</p>
            <Button type="button" size="small" aria-label={`Copy overall ${target}`}
              onClick={() => void copy("overall", formatFeedback(feedback.overall), "overall")}>
              {copiedKey === "overall" ? "Copied" : "Copy overall feedback"}
            </Button>
          </>
        )}
        {FEEDBACK_FIELDS.map((field) => feedback[field] && (
          <div key={field}>
            <p>{FEEDBACK_FIELD_META[field].fieldLabel}</p>
            <p className={styles.feedbackText}>{feedback[field]}</p>
            <Button type="button" size="small" aria-label={`Copy ${FEEDBACK_FIELD_META[field].descriptorLower} from ${target}`}
              onClick={() => void copy(field, formatFeedback(feedback[field]), field)}>
              {copiedKey === field ? "Copied" : `Copy ${FEEDBACK_FIELD_META[field].fieldLabel}`}
            </Button>
          </div>
        ))}
      </FeedbackDisclosure>
      {hasComment && <CopyStatus copied={copiedKey !== null} failed={failed} />}
    </>
  );
}

type LocalFeedbackProps = {
  repo: string;
  folder: string;
  edit: RepoGradeCellEdit;
  onScoreChange: (score: string) => void;
  onFeedbackChange: (field: FeedbackField, value: string) => void;
  isAvailable?: () => boolean;
};

type DashboardFeedbackProps = LocalFeedbackProps & {
  accountId: string;
  courseId: string;
  isCurrentCellScope: () => boolean;
  onRetainedDraftChange: UseRepoGradesGradingActionsResult["handleRetainedDraftChange"];
};

export function RepoDashboardFeedback(props: DashboardFeedbackProps) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const isAvailable = () => props.isCurrentCellScope() && openRef.current;
  return (
    <FeedbackDisclosure title="Score and feedback"
      label={`Score and feedback for ${props.repo}, ${props.folder || "repository root"}`}
      expanded={open} onExpand={(next) => { openRef.current = next; setOpen(next); }}>
      {open && (
        <>
          <LocalFeedback {...props} isAvailable={isAvailable} />
          {props.edit.retainedResults?.map((result, index) => (
            <RetainedFeedback key={result.id} result={result} ordinal={index + 1}
              accountId={props.accountId} courseId={props.courseId} repo={props.repo} folder={props.folder}
              isAvailable={isAvailable} onDraftChange={props.onRetainedDraftChange} />
          ))}
        </>
      )}
    </FeedbackDisclosure>
  );
}

function LocalFeedback({ repo, folder, edit, onScoreChange, onFeedbackChange, isAvailable }: LocalFeedbackProps) {
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
  ]), isAvailable);
  const label = folder || "Repository root";

  return (
    <div className={styles.feedback}>
      <TextField label="Score" size="small" value={edit.score}
        slotProps={{ htmlInput: { "aria-label": `${label} score for ${repo}`, inputMode: "decimal" } }}
        onChange={(event) => onScoreChange(event.target.value)} />
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
        <List dense>
          {edit.rubricAreas.map((area, index) => (
            <ListItem sx={{ display: "list-item" }} key={index}>
              {area.area} {area.score}
              <p className={styles.feedbackText}>{area.comment}</p>
            </ListItem>
          ))}
        </List>
      )}
    </div>
  );
}

type RetainedFeedbackProps = {
  accountId: string;
  courseId: string;
  repo: string;
  folder: string;
  ordinal: number;
  result: RetainedRepoGradeResult;
  isAvailable: () => boolean;
  onDraftChange: UseRepoGradesGradingActionsResult["handleRetainedDraftChange"];
};

function RetainedFeedback(props: RetainedFeedbackProps) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const label = `Retained result ${props.ordinal} for ${props.folder || "repository root"}`;
  const isAvailable = () => props.isAvailable() && openRef.current;
  return (
    <FeedbackDisclosure title={`Retained generated result ${props.ordinal}`} label={`${label} in ${props.repo}`}
      expanded={open} onExpand={(next) => { openRef.current = next; setOpen(next); }}>
      {open && <RetainedDraft {...props} label={label} isAvailable={isAvailable} />}
    </FeedbackDisclosure>
  );
}

function RetainedDraft({ accountId, courseId, repo, folder, result, label, isAvailable, onDraftChange }:
  RetainedFeedbackProps & { label: string }) {
  const [expandedField, setExpandedField] = useState<keyof FeedbackBoxesEdit | null>(null);
  const expandTrigger = useRef<HTMLButtonElement | null>(null);
  const { id, source, draft } = result;
  const current = draft ?? source;
  const { score, comment, strengths, improvements, resubmitNotice } = current;
  const feedback = { overall: comment, strengths, improvements, resubmitNotice };
  const { copy, copiedKey, failed, isActive, invalidateCopy } = useFeedbackCopy(
    JSON.stringify([accountId, courseId, repo, folder, id, score, comment, strengths, improvements, resubmitNotice]),
    isAvailable,
    source,
  );

  const change = (field: keyof RepoGradeFeedbackDraft, value: string) => {
    if (!isActive() || current[field] === value) return;
    invalidateCopy();
    onDraftChange(repo, folder, result, field, value);
  };
  const changeFeedback = (field: keyof FeedbackBoxesEdit, value: string) =>
    change(field === "overall" ? "comment" : field, value);
  const expand = (field: keyof FeedbackBoxesEdit, trigger: HTMLButtonElement) => {
    if (!isActive()) return;
    expandTrigger.current = trigger;
    setExpandedField(field);
  };
  return (
    <section className={styles.feedback} aria-label={`${label} draft for ${repo}`}>
      <p>Edits here belong to this retained result. Your current grading draft is separate.</p>
      <TextField label="Score" size="small" value={score}
        slotProps={{ htmlInput: { "aria-label": `${label} score for ${repo}`, inputMode: "decimal" } }}
        onChange={(event) => change("score", event.target.value)} />
      <TextField label="Overall feedback" size="small" multiline minRows={2} fullWidth value={comment}
        slotProps={{ htmlInput: { "aria-label": `${label} overall feedback for ${repo}` } }}
        onChange={(event) => changeFeedback("overall", event.target.value)} />
      <Button type="button" size="small" aria-label={`Copy ${label} overall feedback for ${repo}`}
        onClick={() => copy("overall", formatFeedback(comment || OVERALL_FEEDBACK_META.emptyCopyFallback), "overall")}>
        {copiedKey === "overall" ? "Copied" : "Copy overall feedback"}
      </Button>
      <Button type="button" size="small" aria-label={`Expand ${label} overall feedback for ${repo}`}
        onClick={(event) => expand("overall", event.currentTarget)}>Expand overall feedback</Button>
      <RowFeedbackBoxes student={repo} namePrefix={label} keepCopyLabel
        edit={feedback} copiedKey={copiedKey} onCopy={copy} onChangeField={changeFeedback} onExpand={expand} />
      <CopyStatus copied={copiedKey !== null} failed={failed} />
      {expandedField && (
        <FeedbackExpandModal student={repo} namePrefix={label} field={expandedField} edit={feedback}
          onChange={changeFeedback} onClose={() => setExpandedField(null)} restoreFocusRef={expandTrigger} />
      )}
      <FeedbackDisclosure title="Original generated feedback">
        <p>Original generated score {source.generatedScore ?? source.score}</p>
        <p className={styles.feedbackText}>{source.comment}</p>
        {FEEDBACK_FIELDS.map((field) => source[field] && (
          <div key={field}>
            <p>{FEEDBACK_FIELD_META[field].fieldLabel}</p>
            <p className={styles.feedbackText}>{source[field]}</p>
          </div>
        ))}
        {source.rubricAreas.length > 0 && <List dense>{source.rubricAreas.map((area, index) => (
          <ListItem sx={{ display: "list-item" }} key={index}>{area.area} {area.score}<p className={styles.feedbackText}>{area.comment}</p></ListItem>
        ))}</List>}
      </FeedbackDisclosure>
    </section>
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

export function RepoDashboardHistoricalFeedback({ row, draftScope, sessionDraft, onDraftChange }: {
  draftScope?: string;
  sessionDraft?: HistoricalFeedbackDraft;
  onDraftChange?: (draft: HistoricalFeedbackDraft) => void;
  row: {
    repo: string;
    folder: string;
    feedback: string | null;
    score?: number | null;
    feedback_sections?: Omit<FeedbackBoxesEdit, "overall"> & { rawScore: string } | null;
    feedback_retention?: keyof typeof RETENTION_LABELS | null;
    rubric?: readonly Readonly<RepoGradeCellEdit["rubricAreas"][number]>[] | null;
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
  const copyLabel = sections ? "Copy all historical feedback" : "Copy retained overall feedback";
  const targetName = `${repo}, ${folder || "repository root"}`;
  return (
    <FeedbackDisclosure title="Historical feedback" label={`Historical feedback for ${targetName}`}
      onExpand={(expanded) => { if (expanded) setOpened(true); }}>
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
            <Button type="button" size="small" aria-label={`Copy historical ${meta.descriptorLower} for ${targetName}`}
              onClick={() => copy(field, formatFeedback(sections[field] || meta.emptyCopyFallback), field)}>
              {copiedKey === field ? "Copied" : `Copy ${meta.fieldLabel}`}
            </Button>
          </div>
        );
      })}
      {(sections || overall) ? (
        <>
          <Button
            type="button"
            size="small"
            aria-label={`${copyLabel} for ${targetName}`}
            onClick={() => copy("all", copyAllFeedbackText({
              overall, strengths: sections?.strengths ?? "", improvements: sections?.improvements ?? "",
              resubmitNotice: sections?.resubmitNotice ?? "",
            }), "all")}
          >
            {copiedKey === "all" ? "Copied" : copyLabel}
          </Button>
          <CopyStatus copied={copiedKey !== null} failed={failed} />
        </>
      ) : <p>No overall feedback was retained.</p>}
      {!!rubric?.length && <List dense>{rubric.map((area, index) => (
        <ListItem sx={{ display: "list-item" }} key={index}>{area.area} {area.score}<p className={styles.feedbackText}>{area.comment}</p></ListItem>
      ))}</List>}
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
        rubricAreas: rubric?.map((area) => ({ ...area })) ?? [],
      }} />}
    </FeedbackDisclosure>
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
      ) : <Button type="button" size="small" onClick={() => setDraft(seed)}>Start instructor draft</Button>}
    </section>
  );
}
