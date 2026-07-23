"use client";

import { Button, Checkbox, MenuItem, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import type { PrMatch } from "../hooks/useMergePullRequests";

interface MergePullRequestsSectionProps {
  selectedReposSize: number;
  prTitleFilter: string;
  onPrTitleFilterChange: (value: string) => void;
  prAuthorFilter: string;
  onPrAuthorFilterChange: (value: string) => void;
  prBranchFilter: string;
  onPrBranchFilterChange: (value: string) => void;
  mergeMethod: "merge" | "squash" | "rebase";
  onMergeMethodChange: (method: "merge" | "squash" | "rebase") => void;
  prMatches: PrMatch[];
  onPrMatchesChange: (matches: PrMatch[]) => void;
  prPreviewing: boolean;
  prMerging: boolean;
  mergeConfirm: boolean;
  onSetMergeConfirm: (confirm: boolean) => void;
  mergeSummary: string | null;
  includedCount: number;
  onPreviewPrs: () => void;
  onCancelPreview: () => void;
  onMergePrs: () => void;
  onCancelMerge: () => void;
}

export function MergePullRequestsSection({
  selectedReposSize,
  prTitleFilter,
  onPrTitleFilterChange,
  prAuthorFilter,
  onPrAuthorFilterChange,
  prBranchFilter,
  onPrBranchFilterChange,
  mergeMethod,
  onMergeMethodChange,
  prMatches,
  onPrMatchesChange,
  prPreviewing,
  prMerging,
  mergeConfirm,
  onSetMergeConfirm,
  mergeSummary,
  includedCount,
  onPreviewPrs,
  onCancelPreview,
  onMergePrs,
  onCancelMerge,
}: MergePullRequestsSectionProps) {
  return (
    <div>
      <h3 style={{ margin: "0 0 12px" }}>Merge pull requests</h3>

      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <TextField
          size="small"
          label="Title contains"
          placeholder="e.g. fix"
          value={prTitleFilter}
          onChange={(e) => onPrTitleFilterChange(e.target.value)}
          disabled={prPreviewing || prMerging}
          sx={{ flex: 1, minWidth: 150 }}
        />
        <TextField
          size="small"
          label="Author contains"
          placeholder="e.g. copilot"
          value={prAuthorFilter}
          onChange={(e) => onPrAuthorFilterChange(e.target.value)}
          disabled={prPreviewing || prMerging}
          sx={{ flex: 1, minWidth: 150 }}
        />
        <TextField
          size="small"
          label="Branch contains"
          placeholder="e.g. main"
          value={prBranchFilter}
          onChange={(e) => onPrBranchFilterChange(e.target.value)}
          disabled={prPreviewing || prMerging}
          sx={{ flex: 1, minWidth: 150 }}
        />
        <TextField
          select
          size="small"
          label="Merge method"
          value={mergeMethod}
          onChange={(e) => onMergeMethodChange(e.target.value as "merge" | "squash" | "rebase")}
          disabled={prPreviewing || prMerging}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="merge">Merge</MenuItem>
          <MenuItem value="squash">Squash</MenuItem>
          <MenuItem value="rebase">Rebase</MenuItem>
        </TextField>
      </div>

      <p className={styles.fieldHint} style={{ marginBottom: 12 }}>
        Draft pull requests (for example from Copilot agents) are listed too - merging marks them ready for review first.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Button
          type="button"
          variant="outlined"
          size="small"
          disabled={prPreviewing || prMerging || selectedReposSize === 0}
          onClick={onPreviewPrs}
        >
          Preview open PRs
        </Button>
        {prPreviewing && (
          <Button type="button" variant="outlined" size="small" color="error" onClick={onCancelPreview}>
            Cancel
          </Button>
        )}
      </div>

      {prMatches.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              maxHeight: 300,
              overflowY: "auto",
              border: "1px solid var(--field-border)",
              borderRadius: 4,
              padding: 8,
            }}
          >
            {prMatches.map((match) => (
              <div
                key={`${match.repo}-${match.pr.number}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "0.85rem",
                  marginBottom: 8,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--field-border)",
                }}
              >
                <Checkbox
                  size="small"
                  checked={match.include}
                  onChange={(e) =>
                    onPrMatchesChange(
                      prMatches.map((m) =>
                        m.repo === match.repo && m.pr.number === match.pr.number
                          ? { ...m, include: e.target.checked }
                          : m
                      )
                    )
                  }
                  disabled={prMerging}
                />
                <span style={{ flex: 1, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                  {match.repo}
                </span>
                <a
                  href={match.pr.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "var(--accent-ink)",
                    textDecoration: "none",
                    fontWeight: 600,
                    flex: 2,
                  }}
                >
                  #{match.pr.number} {match.pr.title}
                </a>
                {match.pr.draft && (
                  <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`} style={{ whiteSpace: "nowrap" }}>
                    Draft
                  </span>
                )}
                {match.mergeOutcome === "merged" && (
                  <span className={`${styles.ghBadge} ${styles.ghBadgeMerged}`} style={{ whiteSpace: "nowrap" }}>
                    Merged
                  </span>
                )}
                {match.mergeOutcome === "failed" && (
                  <span
                    className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}
                    style={{ whiteSpace: "nowrap" }}
                    title={match.mergeError}
                  >
                    Merge failed
                  </span>
                )}
                {match.mergeOutcome === "failed" && match.mergeError && (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }} title={match.mergeError}>
                    {match.mergeError.split("\n")[0].slice(0, 60)}
                  </span>
                )}
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  {match.pr.user} ({match.pr.head} → {match.pr.base})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {prMatches.length === 0 && (
        <p className={styles.fieldHint}>
          {prPreviewing ? "Loading pull requests..." : "No matching open pull requests."}
        </p>
      )}

      {prMatches.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              type="button"
              variant="contained"
              size="small"
              color={mergeConfirm ? "error" : "primary"}
              disabled={prMerging || includedCount === 0}
              onClick={onMergePrs}
            >
              {mergeConfirm
                ? `Confirm merge ${includedCount} PR${includedCount !== 1 ? "s" : ""}`
                : `Merge ${includedCount} selected PR${includedCount !== 1 ? "s" : ""}`}
            </Button>
            {prMerging && (
              <Button type="button" variant="outlined" size="small" color="error" onClick={onCancelMerge}>
                Cancel
              </Button>
            )}
            {mergeConfirm && (
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => onSetMergeConfirm(false)}
                disabled={prMerging}
              >
                Cancel confirm
              </Button>
            )}
          </div>
          {mergeSummary && (
            <p className={styles.fieldHint} style={{ marginTop: 8 }}>
              {mergeSummary}
            </p>
          )}
        </>
      )}
    </div>
  );
}
