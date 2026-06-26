"use client";

import { useEffect, useState } from "react";
import { listMyOrgsAction, listOrgReposAction, generateStudentReposAction, type StudentRepoResult } from "../actions";
import type { GithubRepo } from "@/lib/github";
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
        <select
          value={selectedOrg}
          onChange={(e) => setSelectedOrg(e.target.value)}
          disabled={busy || orgsState === "loading"}
          className={styles.textInput}
        >
          <option value="">{orgsState === "loading" ? "Loading organizations…" : "Choose an organization…"}</option>
          {orgs.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {orgsState === "ready" && orgs.length === 0 && (
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
            Your token doesn&apos;t own any organizations. Create one on GitHub first, then it will appear here.
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
    </div>
  );
}
