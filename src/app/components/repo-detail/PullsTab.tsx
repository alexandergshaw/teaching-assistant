"use client";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import Typeahead from "../ui/Typeahead";
import { submitOnEnter } from "../ui/submitOnEnter";
import type { PullRequestReviewInfo } from "@/lib/github";
import type { usePullsTab } from "./usePullsTab";
import styles from "../../page.module.css";

// The effective (latest) review per reviewer, ignoring plain comments.
function latestReviews(list: PullRequestReviewInfo[]): PullRequestReviewInfo[] {
  const byUser = new Map<string, PullRequestReviewInfo>();
  for (const rv of list) {
    if (rv.state === "COMMENTED" || rv.state === "PENDING") continue;
    byUser.set(rv.user, rv);
  }
  return [...byUser.values()];
}

// Colour a unified-diff line by its leading marker.
function diffLineClass(line: string): string {
  return line.startsWith("@@")
    ? styles.prDiffHunk
    : line.startsWith("+")
      ? styles.prDiffAdd
      : line.startsWith("-")
        ? styles.prDiffDel
        : styles.prDiffCtx;
}

type PullsTabState = ReturnType<typeof usePullsTab>;

export function PullsTab({
  branch,
  branches,
  defaultBranch,
  attentionPrs,
  pullsTab,
}: {
  branch: string;
  branches: string[];
  defaultBranch: string;
  attentionPrs: number;
  pullsTab: PullsTabState;
}) {
  const {
    prState,
    setPrState,
    pulls,
    pullsState,
    pullsError,
    prTitle,
    setPrTitle,
    prHead,
    setPrHead,
    prBase,
    setPrBase,
    prBody,
    setPrBody,
    prBusy,
    prMsg,
    mergeMethod,
    setMergeMethod,
    mergingPr,
    reviewsByPr,
    expandedPr,
    filesByPr,
    filesLoadingPr,
    reviewingPr,
    approveMergingPr,
    handleCreatePr,
    handleMerge,
    handleApproveAndMerge,
    handleReviewPr,
    togglePrFiles,
  } = pullsTab;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
      <details className={styles.adaptDisclosure} style={{ marginTop: 0 }}>
        <summary>Open a pull request</summary>
        <div className={styles.adaptDisclosureBody}>
        <TextField
          size="small"
          fullWidth
          placeholder="Title"
          value={prTitle}
          onChange={(e) => setPrTitle(e.target.value)}
          onKeyDown={submitOnEnter(handleCreatePr)}
          disabled={prBusy}
          sx={{ marginBottom: 1 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 1, flexWrap: "wrap" }}>
          <div style={{ minWidth: 180 }}>
            <Typeahead
              options={branches.map((b) => ({ value: b, label: b }))}
              value={prHead || branch}
              onChange={(v) => setPrHead(v)}
              placeholder="head (compare)"
            />
          </div>
          <span style={{ fontSize: "0.9rem" }}>into</span>
          <div style={{ minWidth: 180 }}>
            <Typeahead
              options={branches.map((b) => ({ value: b, label: b }))}
              value={prBase || defaultBranch}
              onChange={(v) => setPrBase(v)}
              placeholder="base"
            />
          </div>
        </div>
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={3}
          placeholder="Description (optional)"
          value={prBody}
          onChange={(e) => setPrBody(e.target.value)}
          disabled={prBusy}
          sx={{ marginBottom: 1 }}
        />
        <Button
          variant="contained"
          size="small"
          disabled={prBusy || !prTitle.trim()}
          onClick={handleCreatePr}
        >
          {prBusy ? "Opening..." : "Create pull request"}
        </Button>
        </div>
      </details>

      {prMsg && (
        <p
          style={{
            margin: 0,
            fontSize: "0.85rem",
            color: prMsg.startsWith("Error") ? "var(--danger)" : "var(--success)",
          }}
        >
          {prMsg}
        </p>
      )}

      <div className={styles.ghPanel}>
        <div className={styles.ghPanelHead}>
          <label className={styles.panelTitle}>
            Pull requests
            {attentionPrs > 0 && <span className={styles.navBadge} style={{ marginLeft: 8 }}>{attentionPrs}</span>}
          </label>
          <TextField
            select
            size="small"
            value={prState}
            onChange={(e) => setPrState(e.target.value as "open" | "closed" | "all")}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="open">Open</MenuItem>
            <MenuItem value="closed">Closed</MenuItem>
            <MenuItem value="all">All</MenuItem>
          </TextField>
        </div>

        {pullsState === "loading" && (
          <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
            <CircularProgress size={24} />
          </div>
        )}
        {pullsState === "error" && <p className={styles.error}>{pullsError}</p>}
        {pullsState === "idle" && pulls.length === 0 && (
          <p className={styles.fieldHint}>No pull requests.</p>
        )}
        {pullsState === "idle" &&
          pulls.map((p) => {
            const reviews = latestReviews(reviewsByPr[p.number] ?? []);
            const approvedBy = reviews.filter((rv) => rv.state === "APPROVED").map((rv) => rv.user);
            const changesBy = reviews.filter((rv) => rv.state === "CHANGES_REQUESTED").map((rv) => rv.user);
            const isOpen = p.state.toLowerCase() === "open";
            const files = filesByPr[p.number];
            return (
              <div key={p.number} id={`pr-row-${p.number}`} className={styles.ghRow}>
                <div className={styles.ghRowTop}>
                  <div className={styles.ghRowTitle}>
                    <div>
                      <a href={p.htmlUrl} target="_blank" rel="noreferrer" className={styles.ghRowNum}>
                        #{p.number}
                      </a>
                      <span style={{ marginLeft: 8 }} className={styles.ghRowName}>{p.title}</span>
                    </div>
                    <div className={`${styles.ghMeta} ${styles.ghMetaMono}`} style={{ marginTop: 4 }}>
                      {p.head} → {p.base}
                      {p.user ? ` · ${p.user}` : ""}
                    </div>
                    <div className={styles.ghBadges} style={{ marginTop: 8 }}>
                      <span className={`${styles.ghBadge} ${p.draft ? styles.ghBadgeNeutral : isOpen ? styles.ghBadgeSuccess : styles.ghBadgeNeutral}`}>
                        {p.draft ? "Draft" : isOpen ? "Open" : "Closed"}
                      </span>
                      {approvedBy.length > 0 && (
                        <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>
                          <span className={styles.ghDot} />
                          Approved by {approvedBy.join(", ")}
                        </span>
                      )}
                      {changesBy.length > 0 && (
                        <span className={`${styles.ghBadge} ${styles.ghBadgeWarning}`}>
                          <span className={styles.ghDot} />
                          Changes requested by {changesBy.join(", ")}
                        </span>
                      )}
                      {isOpen && !p.draft && approvedBy.length === 0 && changesBy.length === 0 && (
                        <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>No reviews yet</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.ghActions}>
                    <Button variant="text" size="small" onClick={() => togglePrFiles(p.number)}>
                      {expandedPr === p.number ? "Hide changes" : "View changes"}
                    </Button>
                    {isOpen && !p.draft && (
                      <>
                        <Button
                          variant="outlined"
                          size="small"
                          color="success"
                          disabled={reviewingPr === p.number || approveMergingPr === p.number}
                          onClick={() => handleReviewPr(p.number, "APPROVE")}
                        >
                          {reviewingPr === p.number ? "Working..." : "Approve"}
                        </Button>
                        <Button
                          variant="text"
                          size="small"
                          color="warning"
                          disabled={reviewingPr === p.number || approveMergingPr === p.number}
                          onClick={() => handleReviewPr(p.number, "REQUEST_CHANGES")}
                        >
                          Request changes
                        </Button>
                        <TextField
                          select
                          size="small"
                          value={mergeMethod[p.number] ?? "merge"}
                          onChange={(e) =>
                            setMergeMethod((m) => ({ ...m, [p.number]: e.target.value as "merge" | "squash" | "rebase" }))
                          }
                          sx={{ minWidth: 100 }}
                        >
                          <MenuItem value="merge">Merge</MenuItem>
                          <MenuItem value="squash">Squash</MenuItem>
                          <MenuItem value="rebase">Rebase</MenuItem>
                        </TextField>
                        <Button
                          variant="contained"
                          size="small"
                          color="success"
                          disabled={approveMergingPr === p.number || mergingPr === p.number || reviewingPr === p.number}
                          onClick={() => handleApproveAndMerge(p.number)}
                        >
                          {approveMergingPr === p.number ? "Working..." : "Approve & merge"}
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={mergingPr === p.number || approveMergingPr === p.number}
                          onClick={() => handleMerge(p.number)}
                        >
                          {mergingPr === p.number ? "Merging..." : "Merge"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {expandedPr === p.number && (
                  <div style={{ marginTop: 10 }}>
                    {filesLoadingPr === p.number && (
                      <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
                        <CircularProgress size={20} />
                      </div>
                    )}
                    {files && files.length === 0 && <p className={styles.fieldHint}>No file changes.</p>}
                    {files &&
                      files.map((f) => (
                        <div key={f.filename} className={styles.prFile}>
                          <div className={styles.prFileHead}>
                            <span className={styles.prFileName}>{f.filename}</span>
                            <span className={styles.prFileStat}>
                              <span style={{ color: "var(--success)" }}>+{f.additions}</span>{" "}
                              <span style={{ color: "var(--danger)" }}>-{f.deletions}</span>{" "}
                              <span style={{ color: "var(--text-secondary)" }}>{f.status}</span>
                            </span>
                          </div>
                          {f.patch ? (
                            <pre className={styles.prDiff}>
                              {f.patch.split("\n").map((line, i) => (
                                <div key={i} className={diffLineClass(line)}>
                                  {line || " "}
                                </div>
                              ))}
                            </pre>
                          ) : (
                            <p className={styles.fieldHint} style={{ margin: "6px 10px" }}>
                              No inline diff (binary or too large).
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
