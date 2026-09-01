"use client";

import type { ChangeEvent, RefObject } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import styles from "../../page.module.css";

interface ProjectModeProps {
  projectFileRef: RefObject<HTMLInputElement | null>;
  projectFileName: string | null;
  projectFileContent: string | null;
  projectPrompt: string | null;
  isGeneratingProjectPrompt: boolean;
  projectError: string | null;
  repoName: string;
  onRepoNameChange: (value: string) => void;
  repoPrivate: boolean;
  onRepoPrivateChange: (value: boolean) => void;
  repoOrg: string;
  onRepoOrgChange: (value: string) => void;
  repoTemplate: boolean;
  onRepoTemplateChange: (value: boolean) => void;
  repoOrgs: string[];
  creatingRepo: boolean;
  createdRepo: { fullName: string; htmlUrl: string } | null;
  createRepoError: string | null;
  onProjectFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onGenerateProjectPrompt: () => Promise<void>;
  onLoadRepoOrgs: () => Promise<void>;
  onCreateRepo: () => Promise<void>;
}

export default function ProjectMode({
  projectFileRef,
  projectFileName,
  projectPrompt,
  isGeneratingProjectPrompt,
  projectError,
  repoName,
  onRepoNameChange,
  repoPrivate,
  onRepoPrivateChange,
  repoOrg,
  onRepoOrgChange,
  repoTemplate,
  onRepoTemplateChange,
  repoOrgs,
  creatingRepo,
  createdRepo,
  createRepoError,
  onProjectFileChange,
  onGenerateProjectPrompt,
  onLoadRepoOrgs,
  onCreateRepo,
}: ProjectModeProps) {
  return (
    <>
      <div className={styles.field}>
        <label htmlFor="projectFile">Upload Schedule File</label>
        <div className={styles.fileField}>
          <input
            id="projectFile"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            ref={projectFileRef}
            onChange={onProjectFileChange}
          />
          <p>Upload a CSV or text file containing your course schedule (topics and assignments).</p>
          {projectFileName && <p>Selected: {projectFileName}</p>}
        </div>
      </div>
      {projectError && <p className={styles.error}>{projectError}</p>}
      <Button
        variant="contained"
        size="small"
        onClick={onGenerateProjectPrompt}
        disabled={isGeneratingProjectPrompt || !projectFileName}
      >
        {isGeneratingProjectPrompt ? "Generating prompt…" : "Generate Copilot Prompt"}
      </Button>
      {projectPrompt && (
        <div className={styles.field}>
          <label>GitHub Copilot Prompt</label>
          <p style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)", marginBottom: "var(--space-2)" }}>
            Copy the prompt below and paste it into GitHub Copilot (Agent mode) to scaffold a project covering all schedule topics.
          </p>
          <TextField
            value={projectPrompt}
            multiline
            minRows={20}
            size="small"
            fullWidth
            slotProps={{ htmlInput: { readOnly: true } }}
            sx={{ fontFamily: "monospace", fontSize: "var(--font-size-md)" }}
          />
          <Button
            variant="contained"
            size="small"
            style={{ marginTop: "var(--space-2)" }}
            onClick={() => void navigator.clipboard.writeText(projectPrompt)}
          >
            Copy to Clipboard
          </Button>

          <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--border-soft)" }}>
            <label>Or create a GitHub repo with this prompt</label>
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", margin: "var(--space-1) 0 var(--space-2)" }}>
              Creates the repo and commits the prompt to <code>.github/copilot-instructions.md</code>, ready to open in Copilot Agent mode.
            </p>

            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
              <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Owner</span>
              <TextField
                select
                size="small"
                value={repoOrg}
                onChange={(e) => onRepoOrgChange(e.target.value)}
                disabled={creatingRepo}
                sx={{ flex: "1 1 200px" }}
              >
                <MenuItem value="">Your personal account</MenuItem>
                {repoOrgs.map((o) => (
                  <MenuItem key={o} value={o}>
                    {o} (organization)
                  </MenuItem>
                ))}
              </TextField>
              <a href="https://github.com/account/organizations/new" target="_blank" rel="noreferrer" style={{ fontSize: "var(--font-size-sm)" }}>
                Create org on GitHub
              </a>
              <Button
                size="small"
                variant="outlined"
                onClick={() => void onLoadRepoOrgs()}
                disabled={creatingRepo}
              >
                Refresh
              </Button>
            </div>

            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
              <TextField
                type="text"
                size="small"
                value={repoName}
                placeholder={projectFileName ? projectFileName.replace(/\.[^.]+$/, "") : "course-project"}
                onChange={(e) => onRepoNameChange(e.target.value)}
                disabled={creatingRepo}
                sx={{ flex: "1 1 220px" }}
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={repoPrivate} onChange={(e) => onRepoPrivateChange(e.target.checked)} disabled={creatingRepo} />}
                label="Private"
                sx={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={repoTemplate} onChange={(e) => onRepoTemplateChange(e.target.checked)} disabled={creatingRepo} />}
                label="Template"
                title="Mark as a template so the Version Control Integration tab can generate one repo per student from it"
                sx={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}
              />
              <Button variant="contained" size="small" onClick={onCreateRepo} disabled={creatingRepo}>
                {creatingRepo ? "Creating repo…" : "Create GitHub repo"}
              </Button>
            </div>
            {createRepoError && <p className={styles.error}>{createRepoError}</p>}
            {createdRepo && (
              <p style={{ fontSize: "var(--font-size-md)", marginTop: "var(--space-2)" }}>
                Created{" "}
                <a href={createdRepo.htmlUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                  {createdRepo.fullName}
                </a>
                {repoTemplate ? " — use it in Version Control Integration to generate student repos." : "."}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
