import { useState } from "react";
import Button from "@mui/material/Button";
import type { GradeRow, RowEdit, FeedbackField } from "./gradingResultsHelpers";
import type { RepositoryWorkflowAdapter } from "../grading-chat/chatRepositoryWorkflow";
import { repositoryEditSignature, type RepositoryFieldSelection } from "./repositoryProposalEdits";

export function RepositoryProposalReview({ row, edit, adapter, onAccepted }: {
  row: GradeRow; edit: RowEdit; adapter: RepositoryWorkflowAdapter;
  onAccepted: (edit: RowEdit, scoreChanged: boolean) => void;
}) {
  const [selection, setSelection] = useState<RepositoryFieldSelection>({});
  const [ack, setAck] = useState({ signature: "", value: false });
  const [error, setError] = useState<string | null>(null);
  const source = adapter.sourceFor(row.student), state = adapter.stateFor(row.student);
  if (!source && !state) return null;
  const proposal = state?.proposal, conflict = !!state && repositoryEditSignature(edit) !== state.comparisonSignature;
  const acknowledge = !!source && ack.signature === source.signature && ack.value;
  const choose = (name: string, checked: boolean) => setSelection((previous) => ({ ...previous,
    criteria: checked ? [...(previous.criteria ?? []), name] : previous.criteria?.filter((item) => item !== name) }));
  const accept = () => {
    if (!state || !window.confirm("Apply only the selected repository proposal fields to this student's current row?")) return;
    const result = adapter.accept(row.student, edit, state.comparisonSignature, selection);
    if (!result.ok) setError(result.error);
    else { onAccepted(result.edit, result.scoreChanged); setError(null); setSelection({}); }
  };
  return <details>
    <summary>Repository grade proposal</summary>
    <p>Proposal and independent review verify the pinned sources again. Code is not executed and grades are not posted.</p>
    {source?.error && <p role="alert">{source.error}</p>}
    {source?.partial && <label><input type="checkbox" checked={acknowledge} onChange={(event) => setAck({ signature: source.signature, value: event.target.checked })} />I acknowledge partial coverage for this evidence revision. Missing evidence is not an automatic deduction.</label>}
    <Button size="small" disabled={adapter.busy || !source || (source.partial && !acknowledge) || (!!state && !state.stale && (state.status === "proposed" || state.status === "reviewed" || state.status === "accepted")) || (!!state && !state.stale && state.proposeAttempts >= 2)} onClick={() => void adapter.propose(row.student, edit, acknowledge)}>Propose targeted update</Button>
    {state && <>
      <p role="status">Proposal state: {state.status}. Proposal attempts: {state.proposeAttempts}/2; independent review attempts: {state.reviewAttempts}/2.</p>
      {(state.error || error) && <p role="alert">{error ?? state.error}</p>}
      {state.proposeAttempts >= 2 && <p>Refresh the confirmed evidence to begin a new proposal revision.</p>}
      {conflict && <p role="alert">Instructor edits changed since this comparison. They remain unchanged. Refresh the comparison before review or acceptance.</p>}
      <Button size="small" disabled={adapter.busy || state.stale || state.status === "accepted"} onClick={() => { adapter.compare(row.student, edit); setSelection({}); setError(null); }}>Refresh comparison with current edits</Button>
      {proposal && <>
        <table><caption>Original machine, current instructor and proposed values</caption>
          <thead><tr><th>Apply</th><th>Field</th><th>Original machine</th><th>Current instructor</th><th>Proposed</th></tr></thead>
          <tbody>
            {proposal.proposed.rubricAreas.map((area) => <tr key={area.area}>
              <td><input aria-label={`Apply ${area.area}`} type="checkbox" checked={selection.criteria?.includes(area.area) ?? false} onChange={(event) => choose(area.area, event.target.checked)} /></td>
              <th>{area.area}</th><td>{proposal.prior.rubricAreas.find((item) => item.area === area.area)?.score}</td><td>{edit.areas[area.area]?.score ?? row.rubricAreas.find((item) => item.area === area.area)?.score}</td><td>{area.score}<p>{area.comment || "Missing rationale"}</p></td>
            </tr>)}
            <tr><td><input aria-label="Apply proposed total" type="checkbox" checked={!!selection.total} onChange={(event) => setSelection((previous) => ({ ...previous, total: event.target.checked }))} /></td><th>Total</th><td>{proposal.prior.totalScore}</td><td>{edit.total}</td><td>{proposal.proposed.totalScore}</td></tr>
            {(["strengths", "improvements", "resubmitNotice"] as FeedbackField[]).map((field) => <tr key={field}><td><input aria-label={`Apply ${field}`} type="checkbox" checked={selection.feedback?.includes(field) ?? false} onChange={(event) => setSelection((previous) => ({ ...previous, feedback: event.target.checked ? [...(previous.feedback ?? []), field] : previous.feedback?.filter((item) => item !== field) }))} /></td><th>{field}</th><td>{proposal.prior[field]}</td><td>{edit[field]}</td><td>{proposal.proposed[field]}</td></tr>)}
          </tbody>
        </table>
        <Button size="small" disabled={adapter.busy || !state.entryDigest || conflict || state.stale || state.reviewAttempts >= 2 || state.review?.status === "completed" || state.status === "accepted"} onClick={() => void adapter.review(row.student, edit)}>Run independent review</Button>
        {state.review && <div><p>Independent review: {state.review.status}. A completed review does not accept changes.</p><ul>{state.review.findings.map((finding, index) => <li key={index}>{finding.category}: {finding.explanation} ({finding.evidenceFileIds.join(", ")})</li>)}</ul></div>}
        <Button size="small" disabled={adapter.busy || !state.entryDigest || conflict || state.stale || state.review?.status !== "completed" || state.status === "accepted" || (!selection.total && !selection.criteria?.length && !selection.feedback?.length)} onClick={accept}>Confirm selected fields</Button>
      </>}
      <Button size="small" disabled={adapter.busy} onClick={() => adapter.dismiss(row.student)}>Dismiss proposal details</Button>
    </>}
  </details>;
}
