import { useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { stageRepositoryBatchResult, emptyRepositoryEvidence, type RepositoryEvidenceState } from "./chatRepositoryBatch";
import { recordRepositoryBatchResult } from "./chatRepositoryDiagnostic";

export function ChatRepositoryEvidence({ evidence, onChange }: {
  evidence: RepositoryEvidenceState;
  onChange: (next: RepositoryEvidenceState) => void;
}) {
  const [draft, setDraft] = useState("");
  const stage = () => {
    const startedAtMs = performance.now();
    const next = stageRepositoryBatchResult(draft, evidence);
    onChange(next.state);
    recordRepositoryBatchResult(next, {
      startedAtMs, settledAtMs: performance.now(), at: new Date().toISOString(),
    });
    if (!next.state.error) setDraft("");
  };
  return (
    <details>
      <summary>Repository evidence ({evidence.lines.filter((line) => line.status === "accepted").length} staged)</summary>
      <p>Paste up to 40 GitHub links, one per line. The optional prefix Additional link: is supported.</p>
      <TextField label="Repository links" multiline minRows={2} maxRows={6} fullWidth size="small"
        value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Button size="small" disabled={!draft.trim()} onClick={stage}>Stage repository links</Button>
      <Button size="small" disabled={!evidence.lines.length && !evidence.error} onClick={() => onChange(emptyRepositoryEvidence())}>Clear repository evidence</Button>
      {evidence.error && <p role="alert">{evidence.error}</p>}
      <p role="status" aria-live="polite">
        {(["accepted", "duplicate", "rejected", "unresolved"] as const).map((status) => `${evidence.lines.filter((line) => line.status === status).length} ${status}`).join("; ")}
      </p>
      {evidence.lines.length > 0 && <>
        <p>Repository evidence staged locally. Confirm existing students and scopes below before fetching.</p>
        <ol style={{ maxHeight: "14rem", overflowY: "auto", overflowWrap: "anywhere" }}>
          {evidence.lines.map((line, index) => <li key={index}>
            <code>{line.original}</code> — {line.status}: {line.reason}
            <Button size="small" aria-label={`Remove repository input ${index + 1}`} onClick={() => onChange({ ...evidence, lines: evidence.lines.filter((_, i) => i !== index) })}>Remove</Button>
          </li>)}
        </ol>
      </>}
    </details>
  );
}
