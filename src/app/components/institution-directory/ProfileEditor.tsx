"use client";

import { Button, MenuItem, TextField } from "@mui/material";
import { useState } from "react";
import type { InstitutionDirectoryProfile, InstitutionDirectoryRecord } from "@/lib/institution-directory";
import { recordInstitutionDirectoryDiagnostic } from "@/lib/institution-directory-diagnostics";

export type DirectoryProfileInput = Omit<InstitutionDirectoryProfile, "lmsType"> & {
  lmsType: string;
  email: string; emailUrl: string; lmsUrl: string;
};

const EMPTY_PROFILE: DirectoryProfileInput = {
  acronym: "", fullName: "", email: "", emailClient: "", emailClientOtherName: "", emailUrl: "",
  lmsType: "", lmsOtherName: "", lmsUrl: "", facultyPortalUrl: "", websiteUrl: "", department: "",
};

function profileInput(record?: InstitutionDirectoryRecord): DirectoryProfileInput {
  if (!record) return EMPTY_PROFILE;
  return {
    ...record.profile,
    email: record.commonValues.email,
    emailUrl: record.commonValues.outlookUrl,
    lmsUrl: record.commonValues.lmsUrl,
    lmsType: record.commonValues.lmsType,
  };
}

export default function ProfileEditor({
  record,
  onSave,
  onCancel,
  busy,
  error,
  onDirtyChange,
}: {
  record?: InstitutionDirectoryRecord;
  onSave: (profile: DirectoryProfileInput) => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => profileInput(record));
  const update = (key: keyof DirectoryProfileInput, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onDirtyChange(JSON.stringify(next) !== JSON.stringify(profileInput(record)));
  };
  const field = (key: keyof DirectoryProfileInput, label: string, type = "text") => (
    <TextField
      key={key}
      label={label}
      type={type}
      size="small"
      value={draft[key]}
      onChange={(event) => update(key, event.target.value)}
      disabled={busy || (key === "acronym" && !!record)}
      fullWidth
    />
  );

  return (
    <form
      id="institution-profile-editor"
      aria-label={record ? `Edit ${record.profile.acronym}` : "Add institution"}
      onSubmit={(event) => { event.preventDefault(); onSave(draft); }}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-3)", marginBlock: "var(--space-3)" }}
    >
      {field("acronym", "Institution acronym")}
      {field("fullName", "Institution name")}
      {field("email", "Institution email", "email")}
      <TextField select size="small" label="Email client" value={draft.emailClient} onChange={(e) => update("emailClient", e.target.value)} disabled={busy}>
        <MenuItem value="">Not set</MenuItem><MenuItem value="outlook">Outlook</MenuItem><MenuItem value="gmail">Gmail</MenuItem><MenuItem value="other">Other</MenuItem>
      </TextField>
      {draft.emailClient === "other" && field("emailClientOtherName", "Email client name")}
      {field("emailUrl", "Email web URL", "url")}
      <TextField select size="small" label="LMS" value={draft.lmsType} onChange={(e) => update("lmsType", e.target.value)} disabled={busy}>
        <MenuItem value="">Not set</MenuItem><MenuItem value="canvas">Canvas</MenuItem><MenuItem value="blackboard">Blackboard</MenuItem><MenuItem value="moodle">Moodle</MenuItem><MenuItem value="brightspace">Brightspace</MenuItem><MenuItem value="other">Other</MenuItem>
        {draft.lmsType && !["canvas", "blackboard", "moodle", "brightspace", "other"].includes(draft.lmsType) &&
          <MenuItem value={draft.lmsType}>Saved LMS type: {draft.lmsType}</MenuItem>}
      </TextField>
      {draft.lmsType === "other" && field("lmsOtherName", "LMS name")}
      {field("lmsUrl", "LMS URL", "url")}
      {field("facultyPortalUrl", "Faculty portal URL", "url")}
      {field("websiteUrl", "Institution website URL", "url")}
      {field("department", "Department")}
      <p className="field-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
        In Bitwarden, save the institution login and set its Website URI to match one of these links. Open the matching link and use the Bitwarden browser extension to fill it. Set up and unlock the extension there; this app cannot see whether it is installed, unlocked, or signed in.
        {" "}<a href="https://bitwarden.com/help/getting-started-browserext/" target="_blank" rel="noopener noreferrer" onClick={() => recordInstitutionDirectoryDiagnostic("external-open", "success", "password-manager-help")}>Set up the Bitwarden extension</a>
        {" "}<a href="https://bitwarden.com/help/auto-fill-browser/" target="_blank" rel="noopener noreferrer" onClick={() => recordInstitutionDirectoryDiagnostic("external-open", "success", "password-manager-help")}>Use browser autofill</a>.
        This directory stores links only, never passwords or vault secrets.
      </p>
      {error && <p role="alert" style={{ color: "var(--danger)", gridColumn: "1 / -1" }}>{error}</p>}
      <div style={{ display: "flex", gap: "var(--space-2)", gridColumn: "1 / -1" }}>
        <Button type="submit" variant="contained" disabled={busy}>{busy ? "Saving…" : "Save institution"}</Button>
        <Button type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}
