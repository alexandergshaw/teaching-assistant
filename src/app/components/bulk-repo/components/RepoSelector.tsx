"use client";

import { Checkbox, FormControlLabel, Button, TextField } from "@mui/material";
import styles from "../../../page.module.css";

interface RepoSelectorProps {
  filterText: string;
  onFilterChange: (text: string) => void;
  shown: string[];
  selectedRepos: Set<string>;
  allShownSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onToggleRepo: (repo: string, checked: boolean) => void;
  onRemoveRepo: (repo: string) => void;
}

export function RepoSelector({
  filterText,
  onFilterChange,
  shown,
  selectedRepos,
  allShownSelected,
  onSelectAll,
  onClear,
  onToggleRepo,
  onRemoveRepo,
}: RepoSelectorProps) {
  return (
    <div>
      <h3 style={{ margin: "0 0 12px" }}>Select repositories</h3>
      <TextField
        size="small"
        fullWidth
        label="Filter repositories"
        placeholder="Type to filter..."
        value={filterText}
        onChange={(e) => onFilterChange(e.target.value)}
        sx={{ mb: 1.5 }}
      />

      <div style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "center" }}>
        <Button size="small" variant="text" onClick={onSelectAll} disabled={shown.length === 0}>
          {allShownSelected ? "Clear all shown" : "Select all shown"}
        </Button>
        {selectedRepos.size > 0 && (
          <Button size="small" variant="text" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>

      <div
        style={{
          maxHeight: 240,
          overflowY: "auto",
          border: "1px solid var(--field-border)",
          borderRadius: 4,
          padding: 8,
        }}
      >
        {shown.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>No repositories match.</p>
        ) : (
          shown.map((repo) => (
            <FormControlLabel
              key={repo}
              sx={{ display: "flex", marginBottom: 0.5 }}
              control={
                <Checkbox
                  size="small"
                  checked={selectedRepos.has(repo)}
                  onChange={(e) => onToggleRepo(repo, e.target.checked)}
                />
              }
              label={<span style={{ fontSize: "0.85rem", fontFamily: "monospace" }}>{repo}</span>}
            />
          ))
        )}
      </div>

      {selectedRepos.size > 0 && (
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: 6, color: "var(--text-primary)" }}>
            Selected repositories ({selectedRepos.size})
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[...selectedRepos].sort().map((repo) => {
              const displayName = repo.includes("/") ? repo.split("/")[1] : repo;
              return (
                <span
                  key={repo}
                  className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, paddingRight: 4 }}
                  title={repo}
                >
                  {displayName}
                  <button
                    type="button"
                    aria-label={`Remove ${repo}`}
                    onClick={() => onRemoveRepo(repo)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 16,
                      height: 16,
                      padding: 0,
                      border: "none",
                      background: "none",
                      color: "inherit",
                      cursor: "pointer",
                      fontSize: "1rem",
                      lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {selectedRepos.size === 0 && (
        <p className={styles.fieldHint} style={{ marginTop: 8 }}>
          No repositories selected.
        </p>
      )}
    </div>
  );
}
