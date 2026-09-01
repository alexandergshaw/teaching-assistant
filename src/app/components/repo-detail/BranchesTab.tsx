"use client";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typeahead from "../ui/Typeahead";
import { submitOnEnter } from "../ui/submitOnEnter";
import styles from "../../page.module.css";

export function BranchesTab({
  branches,
  branch,
  defaultBranch,
  newBranch,
  setNewBranch,
  fromBranch,
  setFromBranch,
  branchBusy,
  branchMsg,
  forkOrg,
  setForkOrg,
  forkBusy,
  forkResult,
  forkMsg,
  handleCreateBranch,
  handleDeleteBranch,
  handleFork,
}: {
  branches: string[];
  branch: string;
  defaultBranch: string;
  newBranch: string;
  setNewBranch: (v: string) => void;
  fromBranch: string;
  setFromBranch: (v: string) => void;
  branchBusy: boolean;
  branchMsg: string | null;
  forkOrg: string;
  setForkOrg: (v: string) => void;
  forkBusy: boolean;
  forkResult: { fullName: string; htmlUrl: string } | null;
  forkMsg: string | null;
  handleCreateBranch: () => void;
  handleDeleteBranch: (b: string) => void;
  handleFork: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginTop: "var(--space-3)" }}>
      <div className={styles.ghPanel}>
        <label className={styles.panelTitle} style={{ display: "block", marginBottom: "var(--space-3)" }}>
          Fork this repository
        </label>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="Target org (optional, blank = your account)"
            value={forkOrg}
            onChange={(e) => setForkOrg(e.target.value)}
            onKeyDown={submitOnEnter(handleFork)}
            sx={{ maxWidth: 320 }}
          />
          <Button
            variant="contained"
            size="small"
            disabled={forkBusy}
            onClick={handleFork}
          >
            {forkBusy ? "Forking…" : "Fork"}
          </Button>
        </div>
        {forkMsg && (
          <p style={{ marginTop: "var(--space-2)", fontSize: "var(--font-size-md)", color: forkMsg.startsWith("Error:") ? "var(--danger)" : "var(--success)" }}>
            {forkMsg}
          </p>
        )}
        {forkResult && (
          <p style={{ marginTop: "var(--space-2)", fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
            Forked to{" "}
            <a href={forkResult.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)" }}>
              {forkResult.fullName}
            </a>
          </p>
        )}
      </div>

      <div className={styles.ghPanel}>
        <label className={styles.panelTitle} style={{ display: "block", marginBottom: "var(--space-3)" }}>
          Create a branch
        </label>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="new-branch-name"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={submitOnEnter(handleCreateBranch)}
          />
          <span style={{ paddingTop: "var(--space-2)" }}>from</span>
          <div style={{ minWidth: 200 }}>
            <Typeahead
              options={branches.map((b) => ({ value: b, label: b }))}
              value={fromBranch || branch || defaultBranch}
              onChange={(v) => setFromBranch(v)}
              placeholder="from branch"
            />
          </div>
          <Button
            variant="contained"
            size="small"
            disabled={branchBusy || !newBranch.trim()}
            onClick={handleCreateBranch}
          >
            Create
          </Button>
        </div>
      </div>

      <div className={styles.ghPanel}>
        <label className={styles.panelTitle} style={{ display: "block", marginBottom: "var(--space-3)" }}>
          Branches
        </label>
        <div>
          {branches.length === 0 ? (
            <p className={styles.fieldHint}>No branches found.</p>
          ) : (
            branches.map((b) => (
              <div key={b} className={styles.ghRow}>
                <div className={styles.ghRowTop}>
                  <div className={styles.ghRowTitle}>
                    <span className={`${styles.ghRowName} ${styles.ghMetaMono}`} style={{ fontSize: "var(--font-size-md)" }}>{b}</span>
                    {b === defaultBranch && (
                      <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`} style={{ marginLeft: "var(--space-2)" }}>default</span>
                    )}
                  </div>
                  <div className={styles.ghActions}>
                    <Button
                      variant="text"
                      size="small"
                      color="error"
                      disabled={branchBusy || b === defaultBranch}
                      onClick={() => handleDeleteBranch(b)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {branchMsg && (
          <p style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-md)", color: branchMsg.startsWith("Error:") ? "var(--danger)" : "var(--success)" }}>
            {branchMsg}
          </p>
        )}
      </div>
    </div>
  );
}
