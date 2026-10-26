import Button from "@mui/material/Button";
import type { useChatFileRoles } from "./useChatFileRoles";
import type { ChatFileRole } from "./chatFileRoles";
const roles: readonly [ChatFileRole, string][] = [["unassigned", "Unassigned"], ["instructions", "Assignment instructions"], ["rubric", "Rubric"], ["combined", "Assignment and rubric"], ["submission", "Student submission / class ZIP"], ["exclude", "Exclude"]];
export function ChatFileRolePreview({ intake }: { intake: ReturnType<typeof useChatFileRoles> }) {
  if (!intake.pending) return intake.error ? <p role="alert">{intake.error}</p> : null;
  const submissions = intake.rows.some((row) => row.role === "submission" && row.file);
  return <section aria-label="Review file roles" aria-busy={intake.busy}>
    <h3>Review file roles before grading</h3>
    <p>Every file starts unassigned. Setup files stay out of student grading. No upload, extraction or grading starts until you confirm.</p>
    {intake.locked && <p>Current session setup will be reused. Start a New session to use different instructions or a rubric.</p>}
    <ol>{intake.rows.map((row) => <li key={row.id}>
      <p>{row.name} ({row.size} bytes): {row.status}</p>
      <label>Role for file {row.id}: {row.name} <select value={row.role} aria-describedby={row.error ? `file-role-error-${row.id}` : undefined} disabled={!row.file || (intake.busy && intake.phase !== "reading")} onChange={(event) => void intake.assign(row.id, event.target.value as ChatFileRole)}>
        {roles.map(([role, text]) => <option key={role} value={role} disabled={intake.locked && (role === "instructions" || role === "rubric" || role === "combined")}>{text}</option>)}
      </select></label>
      {row.error && <p id={`file-role-error-${row.id}`} role="alert">{row.error}</p>}
    </li>)}</ol>
    {(["instructions", "rubric"] as const).map((field) => {
      const source = intake.resolved.sources[field];
      return <div key={field}><p>{field === "instructions" ? "Assignment instructions" : "Rubric"} source: {source?.text !== undefined && intake.resolved.effective[field] === source.text ? source.name : "current draft / session"}</p>
        {source?.text !== undefined && <label>Use for {field} <select value={intake.choices[field]} disabled={intake.busy} onChange={(event) => intake.choose(field, event.target.value as "draft" | "file")}>
          <option value="draft">Keep current draft when present</option><option value="file">Replace with complete file text</option>
        </select></label>}
        <label>Resulting {field}<textarea readOnly value={intake.resolved.effective[field]} rows={3} /></label>
      </div>;
    })}
    {intake.resolved.generationNotice && <p>A blank rubric asks the existing grading service to generate one after confirmation.</p>}
    {intake.resolved.errors.map((message, index) => <p role="alert" key={index}>{message}</p>)}
    {intake.error && <p role="alert">{intake.error}</p>}
    <p role="status" aria-live="polite">File intake: {intake.phase}. Accepted or partial files will not be sent again on retry.</p>
    <Button size="small" disabled={intake.busy || intake.resolved.errors.length > 0 || !submissions} onClick={() => void intake.confirm()}>Confirm roles and grade</Button>
    <Button size="small" disabled={intake.busy || intake.resolved.errors.length > 0 || submissions || intake.locked} onClick={() => void intake.confirm(true)}>Use setup</Button>
    <Button size="small" onClick={intake.cancel}>Cancel file preview</Button>
  </section>;
}
