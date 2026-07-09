"use client";

import { useEffect, useState } from "react";
import {
  listMyOrgsAction,
  listOrgReposAction,
  generateStudentReposAction,
  listGithubReposAction,
  listCoursesAction,
  listCourseRosterAction,
  type StudentRepoResult,
} from "../actions";
import type { GithubRepo } from "@/lib/github";
import type { CanvasCourse } from "@/lib/canvas";
import OrgManagementPanel from "./OrgManagementPanel";
import RepoDetail from "./RepoDetail";
import TabHeader from "./TabHeader";
import Typeahead from "./ui/Typeahead";
import { takeCourseHandoff } from "@/lib/course-handoff";
import { useVcCounts } from "./VcCounts";
import { useInstitutionSelection } from "@/lib/institutions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import styles from "../page.module.css";

const VC_SUBTAB_KEY = "ta-vc-subtab";
const VC_ORG_KEY = "ta-vc-org";
const VC_TEMPLATE_KEY = "ta-vc-template";
const VC_PREFIX_KEY = "ta-vc-prefix";
const VC_STUDENTS_KEY = "ta-vc-students";
const VC_PRIVATE_KEY = "ta-vc-private";
const VC_ROSTER_FORMAT_KEY = "ta-vc-roster-format";

/**
 * Version Control Integration: pick a GitHub org and a template repo within it,
 * paste a list of students, and generate one repo per student from the template
 * (the GitHub Classroom distribution pattern).
 */
export default function VersionControlTab() {
  const { total: vcAttention } = useVcCounts();
  const { institutions, active: activeInstitution } = useInstitutionSelection();
  const [orgs, setOrgs] = useState<string[]>([]);
  const [orgsState, setOrgsState] = useState<"loading" | "ready" | "unconfigured">("loading");
  const [selectedOrg, setSelectedOrg] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(VC_ORG_KEY) ?? "" : ""));
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [myRepos, setMyRepos] = useState<GithubRepo[]>([]);
  const [templateRepo, setTemplateRepo] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(VC_TEMPLATE_KEY) ?? "" : ""));
  const [prefix, setPrefix] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(VC_PREFIX_KEY) ?? "" : ""));
  const [studentsText, setStudentsText] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(VC_STUDENTS_KEY) ?? "" : ""));
  const [isPrivate, setIsPrivate] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(VC_PRIVATE_KEY) !== "0" : true));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StudentRepoResult[] | null>(null);
  const [subTab, setSubTab] = useState<"orgs" | "repos">(() =>
    typeof window !== "undefined" && localStorage.getItem(VC_SUBTAB_KEY) === "repos" ? "repos" : "orgs"
  );
  // (Copilot repo creation was removed from the Orgs subtab.)
  const [rosterInstitution, setRosterInstitution] = useState("");
  const [rosterCourses, setRosterCourses] = useState<CanvasCourse[]>([]);
  const [rosterCoursesLoading, setRosterCoursesLoading] = useState(false);
  const [rosterCourseId, setRosterCourseId] = useState("");
  const [rosterFormat, setRosterFormat] = useState<"sortable" | "firstlast" | "login">(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(VC_ROSTER_FORMAT_KEY) : null;
    return v === "firstlast" || v === "login" ? v : "sortable";
  });
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterNote, setRosterNote] = useState<string | null>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(VC_ORG_KEY, selectedOrg);
    localStorage.setItem(VC_TEMPLATE_KEY, templateRepo);
    localStorage.setItem(VC_PREFIX_KEY, prefix);
    localStorage.setItem(VC_STUDENTS_KEY, studentsText);
    localStorage.setItem(VC_PRIVATE_KEY, isPrivate ? "1" : "0");
    localStorage.setItem(VC_ROSTER_FORMAT_KEY, rosterFormat);
  }, [selectedOrg, templateRepo, prefix, studentsText, isPrivate, rosterFormat]);

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

  useEffect(() => {
    let cancelled = false;
    const inst = rosterInstitution || activeInstitution;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!inst) {
      setRosterCourses([]);
      setRosterCourseId("");
      return;
    }
    setRosterCoursesLoading(true);
    (async () => {
      const r = await listCoursesAction(inst);
      if (cancelled) return;
      if (!("error" in r)) setRosterCourses(r.courses);
      setRosterCoursesLoading(false);
    })();
    setRosterCourseId("");
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [rosterInstitution, activeInstitution]);

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

  const handleInsertRoster = async () => {
    const inst = rosterInstitution || activeInstitution;
    if (!inst || !rosterCourseId) return;
    setRosterBusy(true);
    setRosterNote(null);
    const r = await listCourseRosterAction(inst, rosterCourseId);
    setRosterBusy(false);
    if ("error" in r) {
      setRosterNote(`Error: ${r.error}`);
      return;
    }
    const lines = r.students
      .map((s) => (rosterFormat === "login" ? s.loginId : rosterFormat === "firstlast" ? s.name : s.sortableName))
      .map((s) => s.trim())
      .filter(Boolean);
    const existing = studentsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set(existing.map((s) => s.toLowerCase()));
    const added = lines.filter((s) => !seen.has(s.toLowerCase()));
    setStudentsText([...existing, ...added].join("\n"));
    const skipped = lines.length - added.length;
    const courseName = rosterCourses.find((c) => c.id === rosterCourseId)?.name ?? "the course";
    setRosterNote(
      `Added ${added.length} student${added.length === 1 ? "" : "s"} from ${courseName}.` +
        (skipped > 0 ? ` ${skipped} already listed.` : "")
    );
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
              minRows={4}
              fullWidth
              placeholder={"jsmith\nadoe\nmlee"}
              value={studentsText}
              onChange={(e) => setStudentsText(e.target.value)}
              disabled={busy}
              sx={{ fontFamily: "monospace" }}
            />
            {institutions.length > 0 ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                <span className={styles.fieldHint} style={{ margin: 0 }}>Fill from a Canvas class:</span>
                {institutions.length > 1 && (
                  <TextField select size="small" label="Institution" value={rosterInstitution || activeInstitution} onChange={(e) => setRosterInstitution(e.target.value)} sx={{ minWidth: 120 }}>
                    {institutions.map((i) => (
                      <MenuItem key={i} value={i}>{i}</MenuItem>
                    ))}
                  </TextField>
                )}
                <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                  <Typeahead
                    options={rosterCourses.map((c) => ({ value: c.id, label: c.name }))}
                    value={rosterCourseId}
                    onChange={(v) => setRosterCourseId(v)}
                    placeholder={rosterCoursesLoading ? "Loading courses..." : "Choose a course..."}
                    disabled={rosterBusy || rosterCoursesLoading}
                    loading={rosterCoursesLoading}
                    noOptionsText="No courses"
                  />
                </div>
                <TextField select size="small" label="Name format" value={rosterFormat} onChange={(e) => setRosterFormat(e.target.value as "sortable" | "firstlast" | "login")} sx={{ minWidth: 150 }}>
                  <MenuItem value="sortable">Last, First</MenuItem>
                  <MenuItem value="firstlast">First Last</MenuItem>
                  <MenuItem value="login">Login ID</MenuItem>
                </TextField>
                <Button variant="outlined" size="small" disabled={rosterBusy || !rosterCourseId} onClick={handleInsertRoster}>
                  {rosterBusy ? "Loading..." : "Insert roster"}
                </Button>
              </div>
            ) : null}
            {rosterNote && (
              <p className={rosterNote.startsWith("Error") ? styles.error : styles.fieldHint} style={{ margin: "4px 0 0" }}>{rosterNote}</p>
            )}
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
