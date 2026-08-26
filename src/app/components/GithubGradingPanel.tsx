"use client";

import { useEffect, useRef, useState } from "react";
import {
  generateRubricFromRepoAction,
  gradeReposAction,
  dispatchTestsAction,
  getTestRunStatusAction,
  setupTestsWorkflowAction,
  listMyOrgsAction,
  listOrgReposAction,
  getRepoTreeAction,
  type GradeActionState,
  type TestSummary,
} from "../actions";
import { useLlmProvider } from "@/lib/llm-provider";
import GithubRepoPicker from "./GithubRepoPicker";
import GradingResults from "./GradingResults";
import FilePreviewModal, { type PreviewFile } from "./FilePreviewModal";
import Typeahead from "./ui/Typeahead";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import styles from "../page.module.css";
import { normalizeGradingFolder, describeGradingFolder } from "@/lib/github-grading-folder";
import { assignmentFoldersFromTree } from "@/lib/repo-assignment-folders";
import { useLmsAssignmentPull } from "./github-grading/useLmsAssignmentPull";
import LmsAssignmentPullSection from "./github-grading/LmsAssignmentPullSection";
import {
  describeGithubGradingTruncation,
  describeRestoredGithubGradingRun,
  loadStoredGithubGradingRun,
  persistGithubGradingRun,
} from "@/lib/github-grading-run-store";

type GradingRun = NonNullable<GradeActionState["run"]>;

type TestState = {
  status: "idle" | "running" | "done" | "error";
  ref?: string;
  since?: string;
  conclusion?: string | null;
  htmlUrl?: string;
  message?: string;
  summary?: TestSummary | null;
};

type QueueRow = { id: string; repoRef: string; branch: string; label: string; test: TestState };

const QUEUE_KEY = "ta-github-grading-queue";
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function TestStatusCell({ test }: { test: TestState }) {
  if (test.status === "idle") return <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>—</span>;
  if (test.status === "error")
    return <span style={{ color: "var(--danger)", fontSize: "0.82rem" }}>{test.message ?? "Error"}</span>;
  const ok = test.conclusion === "success";
  const failed = test.conclusion === "failure" || test.conclusion === "timed_out";
  const color = test.status === "running" ? "var(--accent)" : ok ? "var(--success)" : failed ? "var(--danger)" : "var(--text-secondary)";
  const base = test.status === "running" ? "Running…" : ok ? "Passed" : failed ? "Failed" : test.conclusion ?? "Done";
  const s = test.summary;
  const counts = s ? ` ${s.passed}/${s.tests}${s.skipped ? ` (+${s.skipped} skipped)` : ""}` : "";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
      <strong style={{ color }}>
        {base}
        {counts}
      </strong>
      {test.htmlUrl && (
        <a href={test.htmlUrl} target="_blank" rel="noreferrer">
          view
        </a>
      )}
    </span>
  );
}

/**
 * Queue several students' GitHub repos, grade them all against one rubric (one
 * results matrix with a row per student), and run each repo's unit tests via
 * GitHub Actions (workflow_dispatch) with live pass/fail status.
 */
export default function GithubGradingPanel() {
  const [provider] = useLlmProvider();
  const [queue, setQueue] = useState<QueueRow[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      const saved = JSON.parse(raw) as Array<{ id?: string; repoRef: string; branch?: string; label?: string }>;
      return saved.map((r) => ({ id: r.id ?? newId(), repoRef: r.repoRef, branch: r.branch ?? "", label: r.label ?? "", test: { status: "idle" as const } }));
    } catch {
      return [];
    }
  });
  // Add-to-queue inputs.
  const [pickRepo, setPickRepo] = useState("");
  const [pickBranch, setPickBranch] = useState("");
  const [pickLabel, setPickLabel] = useState("");
  // Import-from-org.
  const [orgs, setOrgs] = useState<string[]>([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [orgPrefix, setOrgPrefix] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  // Grading inputs.
  const [instructions, setInstructions] = useState("");
  const [rubric, setRubric] = useState("");
  const [rubricRepo, setRubricRepo] = useState("");
  const [rubricBranch, setRubricBranch] = useState("");
  const [workflowFile, setWorkflowFile] = useState("");
  // "Set up tests" workflow pusher.
  const [setupTemplate, setSetupTemplate] = useState("python");
  const [setupCommand, setSetupCommand] = useState("");
  const [setupNote, setSetupNote] = useState<string | null>(null);
  // R2.2 (docs/repo-grading-records-acceptance-criteria.md): the last
  // completed run persists under a `ta-` key exactly like the queue above
  // (QUEUE_KEY) does, and is restored here on mount - a single synchronous
  // read, matching the queue's own useState-initializer shape rather than an
  // effect (no setState-after-await needed for a value that is already known
  // at first render). `restoredGithubGradingRun` is read once and only used
  // to seed the states below; the live `run`/`lastGradedFolder`/`gradedAt`
  // triple is what the rest of this component reads and updates from here on.
  const [restoredGithubGradingRun] = useState(() => loadStoredGithubGradingRun());
  const [run, setRun] = useState<GradingRun | null>(restoredGithubGradingRun?.run ?? null);
  const [gradedAt, setGradedAt] = useState<string | null>(restoredGithubGradingRun?.gradedAt ?? null);
  // docs/folder-scoped-grading-completeness-acceptance-criteria.md C2: the
  // repos (by label/full name) whose folder ingest hit a cap during the last
  // run - persisted alongside the run itself (see github-grading-run-store.ts)
  // so a restored run does not silently drop this warning.
  const [truncatedRepos, setTruncatedRepos] = useState<string[]>(restoredGithubGradingRun?.truncatedRepos ?? []);
  // R2.5: true only until the next successful grading pass - flips false the
  // moment a fresh run replaces it, so the "restored" banner never lingers
  // on results the instructor just produced themselves.
  const [runIsRestored, setRunIsRestored] = useState<boolean>(restoredGithubGradingRun !== null);
  const [busy, setBusy] = useState<"" | "rubric" | "grade" | "setup">("");
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const aliveRef = useRef(true);
  // F1 (docs/grading-results-file-viewer-acceptance-criteria.md): the real
  // opener for GradingResults's per-file Preview button, which this panel
  // used to wire to a no-op (`onOpenPreview={() => {}}`, recorded as a known
  // defect at docs/REGRESSION.md:23278-23286). Modeled on page.tsx's own
  // handleOpenPreview/handleClosePreview - this panel is not reachable from
  // page.tsx's tree (it owns its own tab), so it needs its own copy of this
  // state rather than a prop threaded in from outside.
  const [selectedPreview, setSelectedPreview] = useState<PreviewFile | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);

  // Track mount so detached test-poll loops don't setState after unmount.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Load the orgs the token owns (for the import dropdown).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listMyOrgsAction();
      if (!cancelled && !("error" in r)) setOrgs(r.orgs);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // AC A's persisted grading-folder value and AC B (pull instructions/
  // rubric from a course assignment) both live in useLmsAssignmentPull.ts -
  // split out purely to keep this file under the project's 1000-line
  // ceiling (see that hook's own header comment for the persistence
  // contract, AC C1, it owns). `gradingFolder`/`updateUiState` are aliased
  // locally since the rest of this file (the AC A folder field below,
  // genRubric, gradeAll) already reads/writes them under these names.
  const pull = useLmsAssignmentPull({ instructions, rubric, setInstructions, setRubric });
  const gradingFolder = pull.gradingFolder;
  const updateUiState = pull.updateUiState;

  // ---- AC A: the common grading folder scoping the whole queue ----------
  const [folderOptions, setFolderOptions] = useState<string[]>([]);
  const [folderScanning, setFolderScanning] = useState(false);
  const [folderScanNote, setFolderScanNote] = useState<string | null>(null);
  // The folder actually used by the most recently COMPLETED run, captured at
  // grade time - kept separate from the live `gradingFolder` control so a
  // reader looking at a finished run's results always sees what that run was
  // actually scoped to (AC A5), even if the folder box has since been edited
  // for the next run.
  const [lastGradedFolder, setLastGradedFolder] = useState<string | null>(
    restoredGithubGradingRun?.lastGradedFolder ?? null
  );

  // Explicit only (AC A3): reads ONE queued repo's tree (the first queued
  // row - the same "first repo" precedent the Rubric field's own placeholder
  // text already uses below) and derives candidate folders from it. Never
  // wired to a queue-change effect, so adding ten repos fires zero tree
  // requests. A scan failure or an empty result (AC A6) leaves the
  // Autocomplete's freeSolo typing available regardless - the note below is
  // purely informational, never a gate on grading.
  const scanFolders = async () => {
    const target = queue[0];
    if (!target) {
      setFolderScanNote("Add a repository to the queue first, then scan it for folders.");
      return;
    }
    setFolderScanning(true);
    setFolderScanNote(null);
    const r = await getRepoTreeAction(target.repoRef, target.branch || undefined);
    setFolderScanning(false);
    if ("error" in r) {
      setFolderOptions([]);
      setFolderScanNote(`Could not scan "${target.repoRef}" for folders: ${r.error} Type a folder path instead.`);
      return;
    }
    const folders = assignmentFoldersFromTree(r.tree.map((entry) => entry.path));
    setFolderOptions(folders);
    setFolderScanNote(
      folders.length === 0
        ? `No candidate folders were found in "${target.repoRef}". Type a folder path instead.`
        : `Found ${folders.length} folder${folders.length === 1 ? "" : "s"} in "${target.repoRef}".`
    );
  };

  const persist = (rows: QueueRow[]) => {
    setQueue(rows);
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.map((r) => ({ id: r.id, repoRef: r.repoRef, branch: r.branch, label: r.label }))));
    } catch {
      /* ignore quota errors */
    }
  };

  const setTest = (id: string, patch: Partial<TestState>) =>
    setQueue((rows) => rows.map((r) => (r.id === id ? { ...r, test: { ...r.test, ...patch } } : r)));

  const onCopy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  };

  // F1: the real onOpenPreview handler - captures the clicked trigger for
  // focus restoration, decodes rawBase64 into a blob URL for PDFs/images
  // exactly as page.tsx's handleOpenPreview does, and leaves text files to
  // FilePreviewModal's plain <pre> path (no blob needed).
  const handleOpenPreview = (student: string, file: PreviewFile, trigger: HTMLElement) => {
    previewTriggerRef.current = trigger;
    setSelectedPreview({ ...file, student });
    if (file.rawBase64 && file.mimeType) {
      const byteChars = atob(file.rawBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: file.mimeType });
      setPreviewBlobUrl(URL.createObjectURL(blob));
    } else {
      setPreviewBlobUrl(null);
    }
  };

  const handleClosePreview = () => {
    setSelectedPreview(null);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
  };

  const addToQueue = () => {
    if (!pickRepo.trim()) return;
    persist([...queue, { id: newId(), repoRef: pickRepo.trim(), branch: pickBranch, label: pickLabel.trim(), test: { status: "idle" } }]);
    setPickRepo("");
    setPickBranch("");
    setPickLabel("");
  };

  const removeRow = (id: string) => persist(queue.filter((r) => r.id !== id));

  // Pull every repo in the chosen org (optionally by name prefix) into the queue,
  // deriving the student label from the part after the prefix (Classroom pattern).
  const importFromOrg = async () => {
    if (!selectedOrg) {
      setError("Choose an organization.");
      return;
    }
    setImporting(true);
    setError(null);
    setImportNote(null);
    const r = await listOrgReposAction(selectedOrg, orgPrefix.trim() || undefined);
    setImporting(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    const existing = new Set(queue.map((q) => q.repoRef.toLowerCase()));
    const prefix = orgPrefix.trim();
    const added: QueueRow[] = [];
    for (const repo of r.repos) {
      if (existing.has(repo.fullName.toLowerCase())) continue;
      const label =
        prefix && repo.name.toLowerCase().startsWith(prefix.toLowerCase())
          ? repo.name.slice(prefix.length).replace(/^[-_.]+/, "") || repo.name
          : repo.name;
      added.push({ id: newId(), repoRef: repo.fullName, branch: "", label, test: { status: "idle" } });
    }
    persist([...queue, ...added]);
    const skipped = r.repos.length - added.length;
    setImportNote(
      r.repos.length === 0
        ? "No repositories matched."
        : `Imported ${added.length} repo${added.length === 1 ? "" : "s"}${skipped > 0 ? `, skipped ${skipped} already queued` : ""}.`
    );
  };

  const genRubric = async () => {
    if (!rubricRepo.trim()) {
      setError("Choose a reference repository for the rubric.");
      return;
    }
    setBusy("rubric");
    setError(null);
    // AC A1: the common grading folder scopes the reference repo read too,
    // so a generated rubric reflects the same subset of code the grading run
    // itself will actually see. Blank reproduces today's whole-repo read.
    const r = await generateRubricFromRepoAction(rubricRepo.trim(), instructions, provider, rubricBranch || undefined, gradingFolder);
    setBusy("");
    if ("error" in r) setError(r.error);
    else setRubric(r.rubric);
  };

  const gradeAll = async () => {
    if (queue.length === 0) {
      setError("Add at least one repository to the queue.");
      return;
    }
    setBusy("grade");
    setError(null);
    setRun(null);
    setTruncatedRepos([]);
    // AC A1/A2: one common folder scopes every repo in the queue for this
    // run. Blank reproduces today's whole-repo read exactly.
    const r = await gradeReposAction(
      queue.map((q) => ({ repoRef: q.repoRef, branch: q.branch || undefined, label: q.label || undefined })),
      instructions,
      rubric,
      provider,
      gradingFolder
    );
    setBusy("");
    if ("error" in r) {
      setError(r.error);
      return;
    }
    const gradedAtIso = new Date().toISOString();
    const runTruncatedRepos = r.truncatedRepos ?? [];
    setRun(r.run);
    setRubric(r.rubric);
    // AC A5: captured separately from the live `gradingFolder` control so
    // these results always show what THIS run actually covered, even if the
    // folder box is edited afterward for the next run.
    setLastGradedFolder(gradingFolder);
    setGradedAt(gradedAtIso);
    // C2: which repos, if any, had their folder ingest hit a cap this run -
    // rendered below near the results (describeGithubGradingTruncation).
    setTruncatedRepos(runTruncatedRepos);
    // R2.5: this run was just produced, not restored - any earlier restored
    // banner must disappear now that it has been superseded.
    setRunIsRestored(false);
    // R2.2/R2.4: persist under the ta- key so a reload (or switching tabs and
    // back) does not discard the model spend that just produced these scores
    // and comments. Best-effort: a quota failure inside this call loses
    // persistence for this one run only - the results above are already in
    // React state regardless. truncatedRepos travels with it (C2) so a
    // restored run does not silently claim nothing was cut.
    persistGithubGradingRun({
      run: r.run,
      gradedAt: gradedAtIso,
      lastGradedFolder: gradingFolder,
      truncatedRepos: runTruncatedRepos,
    });
  };

  // Poll a dispatched run until it completes.
  const pollTest = (id: string, repoRef: string, ref: string, since: string) => {
    let attempts = 0;
    const tick = async () => {
      if (!aliveRef.current) return;
      attempts += 1;
      const r = await getTestRunStatusAction(repoRef, ref, since);
      if (!aliveRef.current) return;
      if ("error" in r) {
        setTest(id, { status: "error", message: r.error });
        return;
      }
      const found = r.run;
      if (found && found.status === "completed") {
        setTest(id, { status: "done", conclusion: found.conclusion, htmlUrl: found.htmlUrl, summary: r.summary });
        return;
      }
      if (found) setTest(id, { status: "running", htmlUrl: found.htmlUrl });
      if (attempts < 160) window.setTimeout(tick, found ? 5000 : 4000);
      else setTest(id, { status: "error", message: "Timed out waiting for the run." });
    };
    void tick();
  };

  const runTests = async (row: QueueRow) => {
    setTest(row.id, { status: "running", message: undefined, conclusion: undefined, htmlUrl: undefined });
    const r = await dispatchTestsAction(row.repoRef, row.branch || undefined, workflowFile.trim() || undefined);
    if ("error" in r) {
      setTest(row.id, { status: "error", message: r.error });
      return;
    }
    pollTest(row.id, row.repoRef, r.ref, r.since);
  };

  const runAllTests = () => {
    for (const row of queue) void runTests(row);
  };

  // Push a standard test workflow into every queued repo.
  const setupAll = async () => {
    if (queue.length === 0) return;
    setBusy("setup");
    setError(null);
    setSetupNote(null);
    let ok = 0;
    let failed = 0;
    for (const row of queue) {
      const r = await setupTestsWorkflowAction(row.repoRef, row.branch || undefined, setupTemplate, setupCommand);
      if ("error" in r) failed += 1;
      else ok += 1;
    }
    setBusy("");
    setSetupNote(`Added the test workflow to ${ok} repo${ok === 1 ? "" : "s"}${failed ? `, ${failed} failed (check token 'workflow' scope and access)` : ""}.`);
  };

  return (
    <>
      <p style={{ marginTop: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Queue students&apos; repositories, grade them all against one rubric, and run each repo&apos;s unit tests
        via GitHub Actions. Running tests needs a <code>workflow_dispatch</code> workflow in each repo.
      </p>

      {/* Add to queue */}
      <div className={styles.field}>
        <label>Add a student repository</label>
        <GithubRepoPicker value={pickRepo} onChange={setPickRepo} branch={pickBranch} onBranchChange={setPickBranch} disabled={!!busy} />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <TextField
            size="small"
            value={pickLabel}
            placeholder="Student name (optional)"
            onChange={(e) => setPickLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !(!pickRepo.trim())) {
                e.preventDefault();
                addToQueue();
              }
            }}
            sx={{ flex: "1 1 200px" }}
          />
          <Button type="button" variant="contained" size="small" onClick={addToQueue} disabled={!pickRepo.trim()}>
            Add to queue
          </Button>
        </div>
      </div>

      {orgs.length > 0 && (
        <div className={styles.field}>
          <label>Or import every repo from an organization</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}>
              <Typeahead
                options={orgs.map((o) => ({ value: o, label: o }))}
                value={selectedOrg}
                onChange={(v) => setSelectedOrg(v)}
                placeholder="Choose an organization…"
                disabled={importing}
              />
            </div>
            <TextField
              size="small"
              value={orgPrefix}
              placeholder="name prefix (optional, e.g. lab1-)"
              onChange={(e) => setOrgPrefix(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !(importing || !selectedOrg)) {
                  e.preventDefault();
                  void importFromOrg();
                }
              }}
              disabled={importing}
              sx={{ flex: "1 1 180px" }}
            />
            <Button type="button" variant="contained" size="small" onClick={importFromOrg} disabled={importing || !selectedOrg}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "6px 0 0" }}>
            With a prefix, the student label is taken from the rest of the repo name (e.g. <code>lab1-jsmith</code> → <code>jsmith</code>).
          </p>
          {importNote && <p style={{ fontSize: "0.8rem", color: "var(--success)", marginTop: 4 }}>{importNote}</p>}
        </div>
      )}

      {/* Queue table */}
      {queue.length > 0 && (
        <div className={styles.field}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <label style={{ margin: 0 }}>Queue ({queue.length})</label>
            <Button type="button" variant="contained" size="small" onClick={runAllTests}>
              Run all tests
            </Button>
          </div>
          <div style={{ border: "1px solid var(--field-border, #e2e8f0)", borderRadius: 8, marginTop: 6 }}>
            {queue.map((row, i) => (
              <div
                key={row.id}
                style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderTop: i === 0 ? "none" : "1px solid var(--border-soft)", flexWrap: "wrap" }}
              >
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.label || row.repoRef}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.repoRef}
                    {row.branch ? ` @ ${row.branch}` : ""}
                  </div>
                </div>
                <div style={{ flex: "0 0 auto" }}>
                  <TestStatusCell test={row.test} />
                </div>
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  onClick={() => void runTests(row)}
                  disabled={row.test.status === "running"}
                  sx={{ flexShrink: 0 }}
                >
                  {row.test.status === "running" ? "Running…" : "Run tests"}
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  onClick={() => removeRow(row.id)}
                  sx={{ flexShrink: 0 }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 6 }}>
            Workflow file to run (optional, applies to all):{" "}
            <TextField
              size="small"
              value={workflowFile}
              placeholder="e.g. tests.yml (defaults to the repo's first workflow)"
              onChange={(e) => setWorkflowFile(e.target.value)}
              sx={{ width: 240 }}
            />
          </p>

          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-soft)" }}>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 6px" }}>
              No <code>workflow_dispatch</code> workflow yet? Push a standard one (runs tests + uploads a JUnit
              report) into every queued repo. Needs the token&apos;s <code>workflow</code> scope.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <TextField
                select
                size="small"
                value={setupTemplate}
                onChange={(e) => setSetupTemplate(e.target.value)}
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="python">Python (pytest)</MenuItem>
                <MenuItem value="node">Node (npm test)</MenuItem>
                <MenuItem value="java">Java (Maven)</MenuItem>
                <MenuItem value="custom">Custom command</MenuItem>
              </TextField>
              {setupTemplate === "custom" && (
                <TextField
                  size="small"
                  value={setupCommand}
                  placeholder="test command, e.g. make test"
                  onChange={(e) => setSetupCommand(e.target.value)}
                  sx={{ flex: "1 1 200px" }}
                />
              )}
              <Button type="button" variant="contained" size="small" onClick={setupAll} disabled={busy === "setup"}>
                {busy === "setup" ? "Adding…" : "Add test workflow to all repos"}
              </Button>
            </div>
            {setupNote && <p style={{ fontSize: "0.8rem", color: "var(--success)", marginTop: 6 }}>{setupNote}</p>}
          </div>
        </div>
      )}

      {/* AC A: one common folder scopes grading for the whole queue. */}
      <div className={styles.field}>
        <label>Grading folder (applies to every repo in the queue)</label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>
            <Autocomplete
              freeSolo
              options={folderOptions}
              value={gradingFolder}
              onInputChange={(_, v) => updateUiState({ gradingFolder: v })}
              renderInput={(params) => (
                <TextField {...params} size="small" placeholder="e.g. week-3 (blank grades the whole repo)" />
              )}
              disabled={!!busy}
            />
          </div>
          <Button
            type="button"
            variant="outlined"
            size="small"
            onClick={() => void scanFolders()}
            disabled={!!busy || folderScanning}
            title={queue[0] ? `Scan "${queue[0].repoRef}" for candidate folders` : "Add a repository to the queue first"}
          >
            {folderScanning ? "Scanning…" : "Scan folders"}
          </Button>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 6 }}>
          {describeGradingFolder(normalizeGradingFolder(gradingFolder))}
        </p>
        {folderScanNote && <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 2 }}>{folderScanNote}</p>}
      </div>

      {/* AC B: pull instructions/rubric from a live Canvas assignment or a
          saved course export - split into LmsAssignmentPullSection.tsx /
          useLmsAssignmentPull.ts (the `pull` hook call above) purely to keep
          this file under the project's 1000-line ceiling. */}
      <LmsAssignmentPullSection
        pullCourseId={pull.pullCourseId}
        hubCourses={pull.hubCourses}
        hubCoursesState={pull.hubCoursesState}
        selectPullCourse={pull.selectPullCourse}
        pullCourse={pull.pullCourse}
        pullCourseSources={pull.pullCourseSources}
        pullSource={pull.pullSource}
        updateUiState={pull.updateUiState}
        selectedLiveAssignmentId={pull.selectedLiveAssignmentId}
        liveAssignments={pull.liveAssignments}
        liveAssignmentsLoading={pull.liveAssignmentsLoading}
        liveAssignmentsError={pull.liveAssignmentsError}
        pullFromLive={pull.pullFromLive}
        livePulling={pull.livePulling}
        livePullNote={pull.livePullNote}
        selectedExportAssignmentKey={pull.selectedExportAssignmentKey}
        exportAssignmentOptionList={pull.exportAssignmentOptionList}
        exportContentLoading={pull.exportContentLoading}
        exportContentError={pull.exportContentError}
        pullFromExport={pull.pullFromExport}
        exportPullNote={pull.exportPullNote}
        selectedExportRubricTitle={pull.selectedExportRubricTitle}
        exportRubricOptions={pull.exportRubricOptions}
        pullExportRubric={pull.pullExportRubric}
        exportRubricNote={pull.exportRubricNote}
      />

      {/* Rubric */}
      <div className={styles.field}>
        <label>Assignment instructions (optional)</label>
        <TextField
          multiline
          minRows={3}
          fullWidth
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="What the assignment asked for. Used to focus the rubric and grading."
        />
      </div>

      <div className={styles.field}>
        <label>Reference repo for the rubric (optional)</label>
        <GithubRepoPicker value={rubricRepo} onChange={setRubricRepo} branch={rubricBranch} onBranchChange={setRubricBranch} disabled={!!busy} />
        <Button type="button" variant="contained" size="small" sx={{ mt: 1 }} onClick={genRubric} disabled={!!busy || !rubricRepo.trim()}>
          {busy === "rubric" ? "Generating rubric…" : "Generate rubric from reference code"}
        </Button>
      </div>

      <div className={styles.field}>
        <label>Rubric (generated or pasted; auto-generated from the first repo if blank)</label>
        <TextField
          multiline
          minRows={8}
          fullWidth
          value={rubric}
          onChange={(e) => setRubric(e.target.value)}
          placeholder="Leave blank to auto-generate at grading time."
          sx={{ fontFamily: "monospace" }}
        />
      </div>

      <Button type="button" variant="contained" size="small" onClick={gradeAll} disabled={!!busy || queue.length === 0}>
        {busy === "grade" ? (
          <>
            <span className={styles.btnSpinner} aria-hidden="true" />
            Grading {queue.length} repo{queue.length === 1 ? "" : "s"}…
          </>
        ) : (
          `Grade all (${queue.length})`
        )}
      </Button>

      {busy === "grade" && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Grading In Progress</p>
            <p className={styles.loadingText}>
              Grading {queue.length} repositor{queue.length === 1 ? "y" : "ies"} against the rubric. This can take a
              moment while each repo is fetched and reviewed.
            </p>
          </div>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {run && run.results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {/* AC A5: ties the scope description to what THIS run actually
              covered, even if the folder box above has since been edited. */}
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 8px" }}>
            {describeGradingFolder(normalizeGradingFolder(lastGradedFolder ?? ""))}
          </p>
          {/* C2: named separately, never merged - see describeGithubGradingTruncation.
              Renders nothing when nothing was truncated. */}
          {(() => {
            const notice = describeGithubGradingTruncation(run.results, truncatedRepos);
            if (!notice) return null;
            return (
              <div style={{ margin: "0 0 10px" }}>
                {notice.ingestMessage && (
                  <p role="status" className={styles.fieldHint} style={{ margin: "0 0 4px" }}>
                    {notice.ingestMessage}
                  </p>
                )}
                {notice.submissionMessage && (
                  <p role="status" className={styles.fieldHint} style={{ margin: 0 }}>
                    {notice.submissionMessage}
                  </p>
                )}
              </div>
            );
          })()}
          <GradingResults
            run={run}
            canvasUrl=""
            copiedKey={copiedKey}
            onCopy={onCopy}
            onOpenPreview={handleOpenPreview}
            banner={
              // R2.5: a restored run must be obviously restored, not passed
              // off as fresh - an instructor who cannot tell the difference
              // may act on stale scores elsewhere believing they just
              // produced them.
              runIsRestored && gradedAt ? (
                <p role="status" className={styles.fieldHint} style={{ margin: "0 0 10px" }}>
                  {describeRestoredGithubGradingRun(gradedAt)}
                </p>
              ) : undefined
            }
          />
        </div>
      )}

      {selectedPreview && (
        <FilePreviewModal
          selectedPreview={selectedPreview}
          previewBlobUrl={previewBlobUrl}
          onClose={handleClosePreview}
          restoreFocusRef={previewTriggerRef}
        />
      )}
    </>
  );
}
