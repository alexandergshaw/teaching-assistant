import { useState } from "react";
import Button from "@mui/material/Button";
import type { RepositoryEvidenceState } from "./chatRepositoryBatch";
import type { RepositorySessionStudent } from "./continuousRepositoryAdapter";
import { stagedItemId, studentKeyId } from "./chatRepositoryProposals";
import type { useChatRepositoryProposals } from "./useChatRepositoryProposals";

export function ChatRepositoryMappings({ evidence, students, proposals }: {
  evidence: RepositoryEvidenceState; students: readonly RepositorySessionStudent[];
  proposals: ReturnType<typeof useChatRepositoryProposals>;
}) {
  const [choices, setChoices] = useState<Record<string, { studentId: string; ref: string; path: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const accepted = evidence.lines.filter((line) => line.status === "accepted");
  if (!accepted.length) return null;
  const choiceFor = (line: typeof accepted[number]) => {
    const id = stagedItemId(line), confirmed = proposals.mappings.find((mapping) => mapping.stagedItemId === id);
    return choices[id] ?? { studentId: confirmed ? studentKeyId(confirmed.studentKey) : "", ref: confirmed?.scope.requestedRef ?? line.requested?.ref ?? "", path: confirmed?.scope.requestedPath ?? line.requested?.subpath ?? "" };
  };
  const confirm = () => {
    const selected = accepted.map((line) => ({ id: stagedItemId(line), ...choiceFor(line) }));
    setError(proposals.confirm(selected) ? null : "Select existing students and confirm the exact ref/path split. No evidence was fetched.");
  };
  return <section aria-label="Confirm repository sources">
    <p>Choose each existing session student and source scope, then confirm the selected mappings together. Confirmation does not fetch or grade. Each fetch handles one student and at most three sources.</p>
    <p>Repository links use the current default branch. Commit links use the exact commit snapshot. Assignment-era submission timing is unknown.</p>
    <ol style={{ maxHeight: "22rem", overflowY: "auto", overflowWrap: "anywhere" }}>
      {accepted.map((line) => {
        const id = stagedItemId(line);
        const choice = choiceFor(line);
        const update = (patch: Partial<typeof choice>) => setChoices((previous) => ({
          ...Object.fromEntries(Object.entries(previous).filter(([key]) => accepted.some((item) => stagedItemId(item) === key))),
          [id]: { ...choice, ...patch },
        }));
        const confirmed = proposals.mappings.find((mapping) => mapping.stagedItemId === id);
        return <li key={id}>
          <p><code>{line.original}</code> ({line.scope})</p>
          <label>Existing session student <select value={choice.studentId} onChange={(event) => {
            update({ studentId: event.target.value });
            if (!event.target.value) proposals.confirm([{ id, studentId: "" }]);
          }}>
            <option value="">Unresolved; no fetch</option>
            {students.map((student) => <option key={studentKeyId(student.key)} value={studentKeyId(student.key)}>
              {student.label} / source {student.key.sourceIndex + 1}: {student.sourceCue}
            </option>)}
          </select></label>
          {(line.scope === "tree" || line.scope === "blob") && <>
            <label>Confirmed full branch, tag or SHA <input value={choice.ref} disabled={proposals.busy} onChange={(event) => update({ ref: event.target.value })} /></label>
            <label>Confirmed path within that ref <input value={choice.path} disabled={proposals.busy} onChange={(event) => update({ path: event.target.value })} /></label>
            <p>The ref and path together must reproduce the original URL suffix, including slash-containing branches.</p>
          </>}
          {confirmed && <p>Confirmed for {students.find((student) => studentKeyId(student.key) === studentKeyId(confirmed.studentKey))?.label}; ref {confirmed.scope.requestedRef ?? "current default"}; path {confirmed.scope.requestedPath || "whole repository"}.</p>}
        </li>;
      })}
    </ol>
    <Button size="small" disabled={!students.length} onClick={confirm}>Confirm selected student and source mappings</Button>
    <Button size="small" disabled={proposals.busy || !proposals.nextBatch.length} onClick={() => void proposals.collectAll()}>Read next {proposals.nextBatch.length} confirmed students</Button>
    <p>Next read: {proposals.nextBatch.map((id) => students.find((student) => studentKeyId(student.key) === id)?.label).join(", ") || "none"}. {proposals.remainingAfterBatch} additional students remain after this batch.</p>
    <p>The batch reads one student at a time, with separate success or failure below. No grading starts.</p>
    {error && <p role="alert">{error}</p>}
    {students.filter((student) => proposals.mappings.some((mapping) => studentKeyId(mapping.studentKey) === studentKeyId(student.key))).map((student) => {
      const id = studentKeyId(student.key);
      const collection = proposals.collections.get(id);
      const count = proposals.mappings.filter((mapping) => studentKeyId(mapping.studentKey) === id).length;
      return <div key={id}>
        <p>{student.label}: {count} confirmed sources. Original submission: {student.sourceCue}</p>
        <Button size="small" disabled={proposals.busy || count > 3 || collection?.status === "collected" || proposals.exhausted.has(id)} onClick={() => void proposals.collect(id)}>Fetch confirmed evidence for {student.label}</Button>
        {(collection?.status === "collected" || collection?.status === "failed") && <Button size="small" disabled={proposals.busy} onClick={() => void proposals.collect(id, true)}>Start new evidence revision and fetch</Button>}
        {proposals.exhausted.has(id) && <p role="status">{proposals.exhausted.get(id)}</p>}
        {collection?.status === "needs_collection" && <p role="status">Sources changed. Read the newly confirmed sources; any previous evidence remains below until replacement succeeds.</p>}
        {collection?.status === "pending" && <p role="status">Fetching confirmed immutable evidence.</p>}
        {collection?.status === "failed" && <p role="alert">{collection.error}</p>}
        {collection?.response?.evidence.map(({ manifest }) => <div key={manifest.originalUrl}>
          <p><code>{manifest.originalUrl}</code>: immutable commit <code>{manifest.commitSha}</code>; {manifest.files.length} included files; {manifest.coverage.omitted.length} listed omissions.</p>
          <p>Collected at: <time dateTime={manifest.collectedAt}>{manifest.collectedAt}</time>.</p>
          <ul>{manifest.files.map((file) => <li key={file.id}><code>{file.path}</code>: {file.bytes} bytes; truncated: {String(file.truncated)}.</li>)}</ul>
          <p>Coverage: {manifest.coverage.complete ? "complete for confirmed scope" : "partial"}; tree truncated: {String(manifest.coverage.treeTruncated)}; unenumerated material: {String(manifest.coverage.unenumerated)}. Submission timing unknown.</p>
          <ul>{manifest.coverage.omitted.map((omission, index) => <li key={index}>{omission.path}: {omission.reason}</li>)}</ul>
        </div>)}
      </div>;
    })}
    <p>Evidence collection preserves existing grades and edits. Open Repository grade proposal in the matching result row to propose, independently review and explicitly accept selected fields.</p>
  </section>;
}
