"use client";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typeahead from "../ui/Typeahead";
import { submitOnEnter } from "../ui/submitOnEnter";
import type { GithubRepo } from "@/lib/github";
import styles from "../../page.module.css";

export function CreateRepoPanel({
  repos,
  createName,
  setCreateName,
  createDescription,
  setCreateDescription,
  createPrivate,
  setCreatePrivate,
  createTemplate,
  setCreateTemplate,
  createPrompt,
  setCreatePrompt,
  createBusy,
  createMsg,
  createResult,
  createFromTemplate,
  setCreateFromTemplate,
  templateSource,
  setTemplateSource,
  handleCreateRepo,
  handleCreateFromTemplate,
}: {
  repos: GithubRepo[];
  createName: string;
  setCreateName: (v: string) => void;
  createDescription: string;
  setCreateDescription: (v: string) => void;
  createPrivate: boolean;
  setCreatePrivate: (v: boolean) => void;
  createTemplate: boolean;
  setCreateTemplate: (v: boolean) => void;
  createPrompt: string;
  setCreatePrompt: (v: string) => void;
  createBusy: boolean;
  createMsg: string | null;
  createResult: { fullName: string; htmlUrl: string; issueUrl?: string; copilotNote?: string } | null;
  createFromTemplate: boolean;
  setCreateFromTemplate: (v: boolean) => void;
  templateSource: string;
  setTemplateSource: (v: string) => void;
  handleCreateRepo: () => void;
  handleCreateFromTemplate: () => void;
}) {
  return (
    <div className={`${styles.ghPanel} ${styles.ghPanelStack}`} style={{ marginTop: 8 }}>
      <TextField
        size="small"
        fullWidth
        placeholder="Repository name"
        value={createName}
        onChange={(e) => setCreateName(e.target.value)}
        onKeyDown={submitOnEnter(handleCreateRepo)}
      />
      <TextField
        size="small"
        fullWidth
        placeholder="Description (optional)"
        value={createDescription}
        onChange={(e) => setCreateDescription(e.target.value)}
        onKeyDown={submitOnEnter(handleCreateRepo)}
      />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <FormControlLabel
          control={<Checkbox size="small" checked={createPrivate} onChange={(e) => setCreatePrivate(e.target.checked)} />}
          label="Private"
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={createTemplate} onChange={(e) => setCreateTemplate(e.target.checked)} disabled={createFromTemplate} />}
          label="Template"
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={createFromTemplate} onChange={(e) => setCreateFromTemplate(e.target.checked)} />}
          label="Create from a template repo"
        />
      </div>
      {createFromTemplate ? (
        <div>
          <Typeahead
            options={repos.map((r) => ({ value: r.fullName, label: r.fullName, hint: r.isTemplate ? "template" : undefined }))}
            value={templateSource}
            onChange={(v) => setTemplateSource(v)}
            placeholder="Choose a source repository..."
            noOptionsText="No repositories"
          />
          {templateSource && !repos.find((r) => r.fullName === templateSource)?.isTemplate && (
            <p className={styles.fieldHint} style={{ color: "var(--warning)", marginTop: 4 }}>
              This repo isn&apos;t marked as a template yet — creating will mark it as a template first.
            </p>
          )}
        </div>
      ) : (
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={4}
          placeholder="GitHub Copilot prompt (optional)"
          value={createPrompt}
          onChange={(e) => setCreatePrompt(e.target.value)}
          sx={{ "& textarea": { fontFamily: "monospace", fontSize: "0.82rem" } }}
        />
      )}
      <Button
        variant="contained"
        size="small"
        disabled={createBusy || !createName.trim() || (createFromTemplate && !templateSource.trim())}
        onClick={createFromTemplate ? handleCreateFromTemplate : handleCreateRepo}
      >
        {createBusy
          ? "Creating..."
          : createFromTemplate
            ? "Create from template"
            : createPrompt.trim()
              ? "Create repo with Copilot prompt"
              : "Create repository"}
      </Button>
      {createMsg && (
        <p style={{ fontSize: "0.85rem", color: createMsg.startsWith("Error") ? "var(--danger)" : "var(--text-secondary)", marginTop: 4 }}>
          {createMsg}
        </p>
      )}
      {createResult && (
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 4 }}>
          <p style={{ margin: 0 }}>
            Created{" "}
            <a href={createResult.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)" }}>
              {createResult.fullName}
            </a>
          </p>
          {createResult.issueUrl && (
            <p style={{ margin: "4px 0 0" }}>
              Copilot is building it —{" "}
              <a href={createResult.issueUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)" }}>
                view the issue
              </a>
              .
            </p>
          )}
          {createResult.copilotNote && (
            <p style={{ margin: "4px 0 0", color: "var(--warning)" }}>{createResult.copilotNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
