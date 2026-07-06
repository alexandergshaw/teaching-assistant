"use client";

import { useEffect, useState } from "react";
import {
  listMyOrgsAction,
  listOrgReposAction,
  generateStudentReposAction,
  createCopilotRepoAction,
  type StudentRepoResult,
} from "../actions";
import type { GithubRepo } from "@/lib/github";
import OrgManagementPanel from "./OrgManagementPanel";
import RepoSettingsPanel from "./RepoSettingsPanel";
import styles from "../page.module.css";

/**
 * Version Control Integration: pick a GitHub org and a template repo within it,
 * paste a list of students, and generate one repo per student from the template
 * (the GitHub Classroom distribution pattern).
 */
export default function VersionControlTab() {
  const [orgs, setOrgs] = useState<string[]>([]);
  const [orgsState, setOrgsState] = useState<"loading" | "ready" | "unconfigured">("loading");
  const [selectedOrg, setSelectedOrg] = useState("");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [templateRepo, setTemplateRepo] = useState("");
  const [prefix, setPrefix] = useState("");
  const [studentsText, setStudentsText] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StudentRepoResult[] | null>(null);
  // Create a repo with a Copilot prompt in the selected org.
  const [copilotName, setCopilotName] = useState("");
  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [copilotPrivate, setCopilotPrivate] = useState(true);
  const [copilotTemplate, setCopilotTemplate] = useState(true);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotResult, setCopilotResult] = useState<{ fullName: string; htmlUrl: string } | null>(null);
  const [copilotError, setCopilotError] = useState<string | null>(null);

  const refreshOrgs = async () => {
    const r = await listMyOrgsAction();
    if (!("error" in r)) {
      setOrgs(r.orgs);
      setOrgsState("ready");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listMyOrgsAction();
      if (cancelled) return;
      if ("error" in r) {
        setOrgsState("unconfigured");
        return;
      }
      setOrgs(r.orgs);
      setOrgsState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the chosen org's repos for the template dropdown. Client-only fetch
  // effect, so the set-state-in-effect rule is suppressed here.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!selectedOrg) {
      setRepos([]);
      setTemplateRepo("");
      return;
    }
    let cancelled = false;
    setReposLoading(true);
    (async () => {
      const r = await listOrgReposAction(selectedOrg);
      if (cancelled) return;
      setReposLoading(false);
      if (!("error" in r)) setRepos(r.repos);
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedOrg]);

  const templates = repos.filter((r) => r.isTemplate);
  const templateOptions = templates.length > 0 ? templates : repos;
  const students = studentsText
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const generate = async () => {
    if (!selectedOrg) {
      setError("Choose an organization.");
      return;
    }
    if (!templateRepo) {
      setError("Choose a template repository.");
      return;
    }
    if (students.length === 0) {
      setError("Add at least one student.");
      return;
    }
    setBusy(true);
    setError(null);
    setResults(null);
    const r = await generateStudentReposAction(selectedOrg, templateRepo, prefix, students, isPrivate);
    setBusy(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setResults(r.results);
  };

  const createWithCopilot = async () => {
    if (!selectedOrg) {
      setCopilotError("Choose an organization first.");
      return;
    }
    if (!copilotName.trim()) {
      setCopilotError("Enter a repository name.");
      return;
    }
    if (!copilotPrompt.trim()) {
      setCopilotError("Paste a Copilot prompt to seed the repo with.");
      return;
    }
    setCopilotBusy(true);
    setCopilotError(null);
    setCopilotResult(null);
    const r = await createCopilotRepoAction(copilotName.trim(), copilotPrompt, copilotPrivate, selectedOrg, copilotTemplate);
    setCopilotBusy(false);
    if ("error" in r) {
      setCopilotError(r.error);
      return;
    }
    setCopilotResult(r);
    // Reload the org's repos so a newly-created template shows in the dropdown.
    const repos = await listOrgReposAction(selectedOrg);
    if (!("error" in repos)) setRepos(repos.repos);
  };

  if (orgsState === "unconfigured") {
    return (
      <div className={styles.form}>
        <p style={{ color: "var(--text-secondary)" }}>
          GitHub isn&apos;t configured. Set the <code>GITHUB_TOKEN</code> environment variable (a token that owns the
          target organizations) to use Version Control Integration.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary, #0f172a)" }}>Version Control Integration</h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>
          Generate one repository per student from a template repo in your class organization.
        </p>
      </div>

      <div className={styles.field}>
        <label>Organization</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            disabled={busy || orgsState === "loading"}
            className={styles.textInput}
            style={{ flex: "1 1 220px" }}
          >
            <option value="">{orgsState === "loading" ? "Loading organizations…" : "Choose an organization…"}</option>
            {orgs.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <a href="https://github.com/account/organizations/new" target="_blank" rel="noreferrer" style={{ fontSize: "0.82rem" }}>
            Create org on GitHub
          </a>
          <button
            type="button"
            onClick={() => void refreshOrgs()}
            disabled={busy}
            style={{ border: "1px solid var(--field-border, #cbd5e1)", background: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: "0.8rem", color: "#334155", cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>
        {orgsState === "ready" && orgs.length === 0 && (
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
            Your token doesn&apos;t own any organizations. Create one on GitHub (link above), then hit Refresh.
          </p>
        )}
      </div>

      <div className={styles.field} style={{ border: "1px solid var(--field-border, #e2e8f0)", borderRadius: 10, padding: 12 }}>
        <label>Create a repo with a Copilot prompt{selectedOrg ? ` in ${selectedOrg}` : ""}</label>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 8px" }}>
          Creates a repo in the selected org and commits the prompt to <code>.github/copilot-instructions.md</code>. Mark it a
          template to use it as the source above.
        </p>
        <input
          type="text"
          className={styles.textInput}
          placeholder="Repository name"
          value={copilotName}
          onChange={(e) => setCopilotName(e.target.value)}
          disabled={copilotBusy}
        />
        <textarea
          className={styles.textInput}
          rows={6}
          placeholder="Paste the GitHub Copilot prompt to seed the repo with…"
          value={copilotPrompt}
          onChange={(e) => setCopilotPrompt(e.target.value)}
          disabled={copilotBusy}
          style={{ marginTop: 8, fontFamily: "monospace", fontSize: "0.85rem" }}
        />
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={copilotPrivate} onChange={(e) => setCopilotPrivate(e.target.checked)} disabled={copilotBusy} />
            Private
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={copilotTemplate} onChange={(e) => setCopilotTemplate(e.target.checked)} disabled={copilotBusy} />
            Template
          </label>
          <button type="button" className={styles.submitButton} onClick={createWithCopilot} disabled={copilotBusy || !selectedOrg}>
            {copilotBusy ? "Creating…" : "Create repo"}
          </button>
        </div>
        {copilotError && <p className={styles.error}>{copilotError}</p>}
        {copilotResult && (
          <p style={{ fontSize: "0.85rem", marginTop: 8 }}>
            Created{" "}
            <a href={copilotResult.htmlUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
              {copilotResult.fullName}
            </a>
            {copilotTemplate ? " — now selectable as a template below." : "."}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label>Template repository</label>
        <select
          value={templateRepo}
          onChange={(e) => setTemplateRepo(e.target.value)}
          disabled={busy || !selectedOrg || reposLoading}
          className={styles.textInput}
        >
          <option value="">{reposLoading ? "Loading repositories…" : !selectedOrg ? "Choose an organization first" : "Choose a template repo…"}</option>
          {templateOptions.map((r) => (
            <option key={r.fullName} value={r.name}>
              {r.name}
              {r.isTemplate ? " (template)" : ""}
            </option>
          ))}
        </select>
        {selectedOrg && !reposLoading && templates.length === 0 && repos.length > 0 && (
          <p style={{ fontSize: "0.8rem", color: "#d97706", marginTop: 4 }}>
            No template repositories found in this org. Mark a repo as a template (Settings → Template repository), or
            select one below — generation will fail if it isn&apos;t a template.
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="vc-prefix">Repository name prefix (optional)</label>
        <input
          id="vc-prefix"
          type="text"
          className={styles.textInput}
          placeholder="e.g. project1 — repos become project1-<student>"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="vc-students">Students (one per line)</label>
        <textarea
          id="vc-students"
          className={styles.textInput}
          rows={8}
          placeholder={"jsmith\nadoe\nmlee"}
          value={studentsText}
          onChange={(e) => setStudentsText(e.target.value)}
          disabled={busy}
          style={{ fontFamily: "monospace" }}
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 6 }}>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} disabled={busy} />
          Private repositories
        </label>
      </div>

      <button type="button" className={styles.submitButton} onClick={generate} disabled={busy || !selectedOrg || !templateRepo || students.length === 0}>
        {busy ? `Generating ${students.length} repo${students.length === 1 ? "" : "s"}…` : `Generate ${students.length || ""} repo${students.length === 1 ? "" : "s"}`.trim()}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {results && (
        <div className={styles.field}>
          <label>Results</label>
          <div style={{ border: "1px solid var(--field-border, #e2e8f0)", borderRadius: 8 }}>
            {results.map((r, i) => (
              <div
                key={r.name}
                style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 10px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}
              >
                <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.student} → <code>{r.name}</code>
                </span>
                {r.error ? (
                  <span style={{ color: "#dc2626", fontSize: "0.82rem" }}>{r.error}</span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
                    <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: "#16a34a" }} />
                    <strong style={{ color: "#16a34a" }}>Created</strong>
                    {r.htmlUrl && (
                      <a href={r.htmlUrl} target="_blank" rel="noreferrer">
                        open
                      </a>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedOrg && <OrgManagementPanel org={selectedOrg} repos={repos} />}

      <RepoSettingsPanel />
    </div>
  );
}
