"use client";

import { useState, useEffect, useRef } from "react";
import { Button, TextField, MenuItem, FormControlLabel, Checkbox } from "@mui/material";
import Typeahead from "./ui/Typeahead";
import { setupStudentRepoAction, listCourseHubAction, type ClassroomRowResult } from "../actions";
import type { Course as HubCourse } from "@/lib/supabase/courses";
import styles from "../page.module.css";
import type { RepoPermission } from "@/lib/github";

export interface ClassroomWizardProps {
  orgs: string[];
  orgsLoading: boolean;
  org: string;
  onOrgChange: (org: string) => void;
  templateOptions: Array<{ value: string; label: string }>;
  reposLoading: boolean;
  templateRepo: string;
  onTemplateChange: (v: string) => void;
  prefix: string;
  onPrefixChange: (v: string) => void;
  isPrivate: boolean;
  onPrivateChange: (v: boolean) => void;
}

// "Student" or "Student | github-username" (pipe-separated so commas in
// names like "Last, First" never masquerade as usernames).
function parseRosterLines(text: string): Array<{ student: string; username: string }> {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((row) => {
      const idx = row.lastIndexOf("|");
      if (idx === -1) return { student: row, username: "" };
      return { student: row.slice(0, idx).trim(), username: row.slice(idx + 1).trim().replace(/^@/, "") };
    });
}

function slugPreview(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function ClassroomWizard({
  orgs,
  orgsLoading,
  org,
  onOrgChange,
  templateOptions,
  reposLoading,
  templateRepo,
  onTemplateChange,
  prefix,
  onPrefixChange,
  isPrivate,
  onPrivateChange,
}: ClassroomWizardProps) {
  const [roster, setRoster] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ta-classroom-roster") || "";
    }
    return "";
  });
  const [permission, setPermission] = useState<RepoPermission>("push");
  const [hubCourses, setHubCourses] = useState<HubCourse[]>([]);
  const [hubCourseId, setHubCourseId] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [rowResults, setRowResults] = useState<Record<number, ClassroomRowResult | { error: string }>>({});
  const cancelRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ta-classroom-roster", roster);
    }
  }, [roster]);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const result = await listCourseHubAction();
        if ("courses" in result) {
          setHubCourses(result.courses);
        }
      } catch {
        // Ignore errors
      }
    };
    loadCourses();
  }, []);

  const handleRun = async () => {
    const rows = parseRosterLines(roster);
    if (!rows.length || !org || !templateRepo) return;
    setRunning(true);
    cancelRef.current = false;
    setRowResults({});
    for (let i = 0; i < rows.length; i++) {
      if (cancelRef.current) break;
      setProgress(`Setting up ${i + 1} of ${rows.length}: ${rows[i].student || rows[i].username}`);
      const r = await setupStudentRepoAction(
        org,
        templateRepo,
        prefix,
        rows[i].student,
        rows[i].username,
        isPrivate,
        permission
      );
      setRowResults((prev) => ({ ...prev, [i]: r }));
    }
    setProgress(null);
    setRunning(false);
  };

  const rows = parseRosterLines(roster);

  return (
    <>
      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <p className={styles.adaptPanelTitle}>
            <span className={styles.adaptPanelStep}>1</span> Class list
          </p>
          <p className={styles.adaptPanelSubtitle}>
            One student per line: &quot;Student&quot; or &quot;Student | github-username&quot;. The student text names
            the repo; the username receives the invite. You can add usernames later and re-run safely.
          </p>
        </div>
        {hubCourses.some((c) => (c.roster ?? "").trim()) && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className={styles.fieldHint} style={{ margin: 0 }}>
              Fill students from a course tile:
            </span>
            <div style={{ flex: "1 1 220px", minWidth: 180 }}>
              <Typeahead
                options={hubCourses
                  .filter((c) => (c.roster ?? "").trim())
                  .map((c) => ({
                    value: c.id,
                    label: `${c.name}${c.courseCode ? ` (${c.courseCode})` : ""}`,
                  }))}
                value={hubCourseId}
                onChange={setHubCourseId}
                placeholder="Choose a course..."
                noOptionsText="No rosters"
              />
            </div>
            <Button
              variant="outlined"
              size="small"
              disabled={!hubCourseId || running}
              onClick={() => {
                const c = hubCourses.find((x) => x.id === hubCourseId);
                if (!c) return;
                const lines = (c.roster ?? "")
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const existing = roster
                  .split(/\n+/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                const seen = new Set(existing.map((s) => s.toLowerCase()));
                setRoster([...existing, ...lines.filter((l) => !seen.has(l.toLowerCase()))].join("\n"));
              }}
            >
              Insert roster
            </Button>
          </div>
        )}
        <TextField
          multiline
          minRows={5}
          fullWidth
          placeholder={"Smith, John | jsmith-gh\nDoe, Alice"}
          value={roster}
          onChange={(e) => setRoster(e.target.value)}
          disabled={running}
          sx={{ fontFamily: "monospace" }}
        />
        {rows.length > 0 && (
          <p className={styles.fieldHint}>
            {rows.length} student{rows.length === 1 ? "" : "s"} - {rows.filter((r) => r.username).length} with
            usernames. First repo: <span className={styles.ghMetaMono}>
              {(prefix ? slugPreview(prefix) + "-" : "") + (slugPreview(rows[0].student || rows[0].username) || "student")}
            </span>
          </p>
        )}
      </div>

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <p className={styles.adaptPanelTitle}>
            <span className={styles.adaptPanelStep}>2</span> Repository setup
          </p>
          <p className={styles.adaptPanelSubtitle}>
            Where the repos are created and what they start from.
          </p>
        </div>
        <div className={styles.adaptFieldGrid2}>
          <div className={styles.field}>
            <label>Organization</label>
            <Typeahead
              options={orgs.map((o) => ({ value: o, label: o }))}
              value={org}
              onChange={onOrgChange}
              placeholder={orgsLoading ? "Loading organizations..." : "Choose an organization..."}
              disabled={running || orgsLoading}
              loading={orgsLoading}
              noOptionsText="No organizations"
            />
          </div>
          <div className={styles.field}>
            <label>Template repository</label>
            <Typeahead
              options={templateOptions}
              value={templateRepo}
              onChange={onTemplateChange}
              placeholder={
                reposLoading ? "Loading repositories..." : !org ? "Choose an organization first" : "Choose a template repo..."
              }
              disabled={running || !org || reposLoading}
              loading={reposLoading}
              noOptionsText="No repositories"
            />
          </div>
        </div>
        <div className={styles.adaptFieldGrid2}>
          <div className={styles.field}>
            <label>Repo name prefix (optional)</label>
            <TextField
              size="small"
              value={prefix}
              onChange={(e) => onPrefixChange(e.target.value)}
              placeholder="e.g. project1 - repos become project1-<student>"
              disabled={running}
              fullWidth
            />
          </div>
          <div className={styles.field}>
            <label>Options</label>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <FormControlLabel
                control={<Checkbox checked={isPrivate} onChange={(e) => onPrivateChange(e.target.checked)} disabled={running} />}
                label="Private"
              />
              <TextField
                select
                label="Student access"
                value={permission}
                onChange={(e) => setPermission(e.target.value as RepoPermission)}
                disabled={running}
                size="small"
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="push">Write (push)</MenuItem>
                <MenuItem value="pull">Read only</MenuItem>
                <MenuItem value="maintain">Maintain</MenuItem>
              </TextField>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <p className={styles.adaptPanelTitle}>
            <span className={styles.adaptPanelStep}>3</span> Create & invite
          </p>
          <p className={styles.adaptPanelSubtitle}>
            Creates each repo from the template and invites the student as an outside collaborator on it - never an org
            member. Rows that already exist are skipped, so re-running is safe.
          </p>
        </div>
        <div className={styles.ghActions}>
          <Button
            variant="contained"
            size="small"
            disabled={running || !org || !templateRepo || parseRosterLines(roster).length === 0}
            onClick={() => void handleRun()}
          >
            {running ? progress ?? "Working..." : `Create repos & invite (${parseRosterLines(roster).length})`}
          </Button>
          {running && (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              Cancel
            </Button>
          )}
        </div>
        {parseRosterLines(roster).map((row, i) => {
          const res = rowResults[i];
          if (!res) return null;
          return (
            <div key={i} className={styles.ghRow}>
              <div className={styles.ghRowTop}>
                <span className={styles.ghRowTitle} style={{ fontSize: "0.88rem" }}>
                  {row.student || row.username} {"error" in res ? null : <span className={styles.ghMetaMono}> {res.repo}</span>}
                </span>
                <div className={styles.ghBadges}>
                  {"error" in res ? (
                    <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>{res.error}</span>
                  ) : (
                    <>
                      {res.created === "created" && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Created</span>}
                      {res.created === "existed" && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Already existed</span>}
                      {res.created === "failed" && (
                        <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>{res.createError ?? "Create failed"}</span>
                      )}
                      {res.invited && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Invited</span>}
                      {res.inviteError && <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>{res.inviteError}</span>}
                      {!row.username && res.created !== "failed" && (
                        <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`}>No username yet</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {Object.keys(rowResults).length > 0 && !running && (
          <p className={styles.fieldHint}>
            Students accept their invitation by email or at github.com/notifications. They are outside collaborators -
            each can only see their own repository.
          </p>
        )}
      </div>
    </>
  );
}
