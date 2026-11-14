"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Accordion, AccordionDetails, AccordionSummary, List, ListItem } from "@mui/material";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import FeedbackExpandModal from "../grading-results/FeedbackExpandModal";
import RowFeedbackBoxes from "../grading-results/RowFeedbackBoxes";
import { visuallyHidden } from "../ui/visuallyHidden";
import {
  copyAllFeedbackText,
  FEEDBACK_FIELDS,
  FEEDBACK_FIELD_META,
  formatFeedback,
  OVERALL_FEEDBACK_META,
  type FeedbackBoxesEdit,
  type FeedbackField,
} from "../grading-results/gradingResultsHelpers";
import type { RepoGradeCellEdit, RepoGradeFeedbackDraft, RetainedRepoGradeResult } from "./repoGradesCellEdits";
import { copyRepoFeedback, type RepoFeedbackCopyTarget } from "./repoFeedbackClipboard";
import type { UseRepoGradesGradingActionsResult } from "./useRepoGradesGradingActions";
import styles from "./repo-grades-dashboard.module.css";
import { repoGradeCopyAllText } from "./repoGradeCopyAll";
import type { RubricScore } from "./rubricAlignment";

export function useFeedbackCopy(version: string, isAvailable?: () => boolean, source?: RetainedRepoGradeResult["source"]) {
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

export function CopyStatus({ copied, failed, compact = false }: { copied: boolean; failed: boolean; compact?: boolean }) {
  return (
    <p role="status" style={compact && !failed ? visuallyHidden : undefined}>
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
        sx={compact ? { pl: 0, pr: 0.5, minHeight: 28, "& .MuiAccordionSummary-content": { my: 0 } } : undefined}>
        {title}
      </AccordionSummary>
      <AccordionDetails sx={compact ? { px: 0, pt: 1 } : undefined}>{children}</AccordionDetails>
    </Accordion>
  );
}

export function RepoResultCopy({ repo, folder, source, feedback, distinguishSource, retainedSource, rubric = [] }: {
  repo: string;
  folder: string;
  source: "browser" | "saved" | "retained";
  feedback: FeedbackBoxesEdit;
  distinguishSource: boolean;
  retainedSource?: RetainedRepoGradeResult["source"];
  rubric?: readonly RubricScore[];
}) {
  const label = distinguishSource ? `Copy ${source} feedback` : "Copy feedback";
  const { copy, copiedKey, failed } = useFeedbackCopy(JSON.stringify([repo, folder, source, feedback, rubric]), undefined, retainedSource);
  const text = repoGradeCopyAllText(feedback, rubric);
  if (!text) return null;
  return (
    <>
      <Button type="button" size="small" variant="outlined"
        aria-label={`${copiedKey === "all" ? "Copied" : label}: ${repo}, ${folder || "repository root"}`}
        onClick={() => void copy("all", text, "all")}>
        {copiedKey === "all" ? "Copied" : label}
      </Button>
      <CopyStatus copied={copiedKey !== null} failed={failed} compact />
    </>
  );
}

export function RepoResultFeedback({ repo, folder, source, feedback, rubric, hideCopyAll = false, disableCopy = false }: {
  repo: string;
  folder: string;
  source: string;
  feedback: FeedbackBoxesEdit;
  rubric: readonly Readonly<RepoGradeCellEdit["rubricAreas"][number]>[];
  hideCopyAll?: boolean;
  disableCopy?: boolean;
}) {
  const hasComment = Object.values(feedback).some((value) => value.trim() !== "");
  const target = `${source} feedback for ${repo}, ${folder || "repository root"}`;
  const { copy, copiedKey, failed } = useFeedbackCopy(JSON.stringify([target, feedback]));
  if (!hasComment && rubric.length === 0) return null;
  return (
    <>
      {hasComment && !hideCopyAll && !disableCopy && (
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
            {!disableCopy && <Button type="button" size="small" aria-label={`Copy overall ${target}`}
              onClick={() => void copy("overall", formatFeedback(feedback.overall), "overall")}>
              {copiedKey === "overall" ? "Copied" : "Copy overall feedback"}
            </Button>}
          </>
        )}
        {FEEDBACK_FIELDS.map((field) => feedback[field] && (
          <div key={field}>
            <p>{FEEDBACK_FIELD_META[field].fieldLabel}</p>
            <p className={styles.feedbackText}>{feedback[field]}</p>
            {!disableCopy && <Button type="button" size="small" aria-label={`Copy ${FEEDBACK_FIELD_META[field].descriptorLower} from ${target}`}
              onClick={() => void copy(field, formatFeedback(feedback[field]), field)}>
              {copiedKey === field ? "Copied" : `Copy ${FEEDBACK_FIELD_META[field].fieldLabel}`}
            </Button>}
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
