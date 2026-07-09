"use client";

import { useEffect, useState } from "react";
import {
  listMyOrgsAction,
  listOrgReposAction,
  generateStudentReposAction,
  listGithubReposAction,
  type StudentRepoResult,
} from "../actions";
import type { GithubRepo } from "@/lib/github";
import OrgManagementPanel from "./OrgManagementPanel";
import RepoDetail from "./RepoDetail";
import TabHeader from "./TabHeader";
import Typeahead from "./ui/Typeahead";
import { takeCourseHandoff } from "@/lib/course-handoff";
import { useVcCounts } from "./VcCounts";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import styles from "../page.module.css";

const VC_SUBTAB_KEY = "ta-vc-subtab";

/**
 * Version Control Integration: pick a GitHub org and a template repo within it,
 * paste a list of students, and generate one repo per student from the template
 * (the GitHub Classroom distribution pattern).
 */
export default function VersionControlTab() {
  const { total: vcAttention } = useVcCounts();
  const [orgs, setOrgs] = useState<string[]>([]);
  const [orgsState, setOrgsState] = useState<"loading" | "ready" | "unconfigured">("loading");
  const [selectedOrg, setSelectedOrg] = useState("");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [myRepos, setMyRepos] = useState<GithubRepo[]>([]);
  const [templateRepo, setTemplateRepo] = useState("");
  const [prefix, setPrefix] = useState("");
  const [studentsText, setStudentsText] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StudentRepoResult[] | null>(null);
  const [subTab, setSubTab] = useState<"orgs" | "repos">(() =>
    typeof window !== "undefined" && localStorage.getItem(VC_SUBTAB_KEY) === "repos" ? "repos" : "orgs"
  );
  // (Copilot repo creation was removed from the Orgs subtab.)

  const refreshOrgs = async () => {
    const r = await listMyOrgsAction();
    if (!("error" in r)) {
      setOrgs(r.orgs);
      setOrgsState("ready");
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(VC_SUBTAB_KEY, subTab);
  }, [subTab]);

  // Arriving from a course in the Courses hub: open the Repos subtab with the
  // course's GitHub org (and template repo) prefilled.
  useEffect(() => {
    const h = takeCourseHandoff("version-control");
    if (!h) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setSubTab("repos");
    if (h.githubOrg) setSelectedOrg(h.githubOrg);
    if (h.repo) setTemplateRepo(h.repo);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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
      const mr = await listGithubReposAction();
      if (cancelled) return;
      if (!("error" in mr)) {
        setMyRepos(mr.repos);
      }
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

  const externalTemplates = myRepos.filter((r) => r.isTemplate && !repos.some((o) => o.fullName === r.fullName));
  const mergedRepos = [...repos, ...externalTemplates];
  const templates = mergedRepos.filter((r) => r.isTemplate);
  const templateOptions = (templates.length > 0 ? templates : mergedRepos)
    .slice()
    .sort((a, b) => Number(b.isTemplate) - Number(a.isTemplate) || a.fullName.localeCompare(b.fullName));
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
      <div className={styles.card}>
        <TabHeader
          eyebrow="Version Control Integration"
          title="Repositories & organizations"
          subtitle="Generate per-student repos from a template, manage your organization's members and rules, and configure your own repositories."
        />
        <p style={{ color: "var(--text-secondary)" }}>
          GitHub isn&apos;t configured. Set the <code>GITHUB_TOKEN</code> environment variable (a token that owns the
          target organizations) to use Version Control Integration.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <TabHeader
        eyebrow="Version Control Integration"
        title="Repositories & organizations"
        subtitle="Generate per-student repos from a template, manage your organization's members and rules, and configure your own repositories."
      />

      <div className={styles.lessonInnerTabs} role="tablist" aria-label="Version control sections" style={{ marginBottom: 4 }}>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "orgs"}
          className={`${styles.lessonInnerTab}${subTab === "orgs" ? ` ${styles.lessonInnerTabActive}` : ""}`}
          onClick={() => setSubTab("orgs")}
        >
          <span className={styles.tabLabelWrap}>Orgs</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "repos"}
          className={`${styles.lessonInnerTab}${subTab === "repos" ? ` ${styles.lessonInnerTabActive}` : ""}`}
          onClick={() => setSubTab("repos")}
        >
          <span className={styles.tabLabelWrap}>
            Repos
            {vcAttention > 0 && <span className={styles.navBadge}>{vcAttention}</span>}
          </span>
        </button>
      </div>

      {subTab === "orgs" && (
        <>
          <div className={`${styles.ghPanel} ${styles.ghPanelStack}`}>
          <label className={styles.panelTitle}>Generate student repositories</label>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Pick an organization and a template repo, paste your roster, and generate one repository per student.
          </p>
          <div className={styles.field}>
            <label>Organization</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px" }}>
                <Typeahead
                  options={orgs.map((o) => ({ value: o, label: o }))}
                  value={selectedOrg}
                  onChange={(o) => setSelectedOrg(o)}
                  placeholder={orgsState === "loading" ? "Loading organizations..." : "Choose an organization..."}
                  disabled={busy || orgsState === "loading"}
                  loading={orgsState === "loading"}
                  noOptionsText="No organizations"
                />
              </div>
              <a href="https://github.com/settings/organizations" target="_blank" rel="noreferrer" style={{ fontSize: "0.82rem" }}>
                Your GitHub organizations
              </a>
              <a href="https://github.com/account/organizations/new" target="_blank" rel="noreferrer" style={{ fontSize: "0.82rem" }}>
                Create org on GitHub
              </a>
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => void refreshOrgs()}
                disabled={busy}
              >
                Refresh
              </Button>
            </div>
            {orgsState === "ready" && orgs.length === 0 && (
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
                Your token doesn&apos;t own any organizations. Create one on GitHub (link above), then hit Refresh.
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label>Template repository</label>
            <Typeahead
              options={templateOptions.map((r) => ({ value: r.fullName, label: `${r.fullName}${r.isTemplate ? " (template)" : ""}` }))}
              value={templateRepo}
              onChange={(name) => setTemplateRepo(name)}
              placeholder={reposLoading ? "Loading repositories..." : !selectedOrg ? "Choose an organization first" : "Choose a template repo..."}
              disabled={busy || !selectedOrg || reposLoading}
              loading={reposLoading}
              noOptionsText="No repositories"
            />
            {selectedOrg && !reposLoading && templates.length === 0 && mergedRepos.length > 0 && (
              <p style={{ fontSize: "0.8rem", color: "var(--warning)", marginTop: 4 }}>
                No template repositories found in this org. Mark a repo as a template (Settings → Template repository), or
                select one below — generation will fail if it isn&apos;t a template.
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="vc-prefix">Repository name prefix (optional)</label>
            <TextField
              id="vc-prefix"
              size="small"
              fullWidth
              placeholder="e.g. project1 — repos become project1-<student>"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="vc-students">Students (one per line)</label>
            <TextField
              id="vc-students"
              multiline
              minRows={8}
              fullWidth
              placeholder={"jsmith\nadoe\nmlee"}
              value={studentsText}
              onChange={(e) => setStudentsText(e.target.value)}
              disabled={busy}
              sx={{ fontFamily: "monospace" }}
            />
            <FormControlLabel
              sx={{ marginTop: 0.75 }}
              control={<Checkbox checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} disabled={busy} size="small" />}
              label="Private repositories"
            />
          </div>

          <div>
            <Button type="button" variant="contained" size="small" onClick={generate} disabled={busy || !selectedOrg || !templateRepo || students.length === 0}>
              {busy ? `Generating ${students.length} repo${students.length === 1 ? "" : "s"}…` : `Generate ${students.length || ""} repo${students.length === 1 ? "" : "s"}`.trim()}
            </Button>
          </div>

          {error && <p className={styles.error}>{error}</p>}
          </div>

          {results && (
            <div className={styles.ghPanel}>
              <label className={styles.panelTitle} style={{ display: "block", marginBottom: 4 }}>Results</label>
              {results.map((r) => (
                <div key={r.name} className={styles.ghRow}>
                  <div className={styles.ghRowTop}>
                    <span className={styles.ghRowTitle} style={{ fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.student} → <span className={styles.ghMetaMono}>{r.name}</span>
                    </span>
                    <div className={styles.ghBadges}>
                      {r.error ? (
                        <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>{r.error}</span>
                      ) : (
                        <>
                          <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>
                            <span className={styles.ghDot} />
                            Created
                          </span>
                          {r.htmlUrl && (
                            <a href={r.htmlUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.82rem" }}>
                              open
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedOrg && <OrgManagementPanel org={selectedOrg} repos={repos} />}
        </>
      )}

      {subTab === "repos" && <RepoDetail />}
    </div>
  );
}
