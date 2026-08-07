"use client";

import { Button, TextField, MenuItem } from "@mui/material";
import styles from "../../page.module.css";
import { FILES_FILTER_KIND_OPTIONS, type FilesFilterKind } from "./filter-sort";

interface FilterToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: "newest" | "oldest" | "name" | "largest";
  onSortChange: (value: "newest" | "oldest" | "name" | "largest") => void;
  filterKind: FilesFilterKind;
  onFilterKindChange: (value: FilesFilterKind) => void;
  filterWorkflow: "all" | "workflow";
  onFilterWorkflowChange: (value: "all" | "workflow") => void;
  groupBy: "flat" | "grouped";
  onGroupByChange: (value: "flat" | "grouped") => void;
  onUploadChange: (files: FileList | null) => void;
  onCopyClick: () => void;
  onRefresh: () => void;
  canCopy: boolean;
  isRefreshing: boolean;
}

export function FilterToolbar({
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  filterKind,
  onFilterKindChange,
  filterWorkflow,
  onFilterWorkflowChange,
  groupBy,
  onGroupByChange,
  onUploadChange,
  onCopyClick,
  onRefresh,
  canCopy,
  isRefreshing,
}: FilterToolbarProps) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
      <label className={styles.downloadButton} style={{ cursor: "pointer" }}>
        Upload files
        <input
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            onUploadChange(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <Button
        variant="outlined"
        size="small"
        onClick={onCopyClick}
        disabled={!canCopy}
        title="Copy a page or file from another Canvas course into this course"
      >
        Copy from another course
      </Button>
      <Button
        variant="outlined"
        size="small"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        Refresh
      </Button>
      <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          size="small"
          type="search"
          placeholder="Search files by name..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          sx={{ flex: "1 1 200px", maxWidth: 300 }}
        />
        <TextField
          select
          size="small"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as "newest" | "oldest" | "name" | "largest")}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="newest">Newest</MenuItem>
          <MenuItem value="oldest">Oldest</MenuItem>
          <MenuItem value="name">Name</MenuItem>
          <MenuItem value="largest">Largest</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          value={filterKind}
          onChange={(e) => onFilterKindChange(e.target.value as FilesFilterKind)}
          sx={{ minWidth: 140 }}
        >
          {FILES_FILTER_KIND_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={filterWorkflow}
          onChange={(e) => onFilterWorkflowChange(e.target.value as "all" | "workflow")}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="all">All files</MenuItem>
          <MenuItem value="workflow">From workflows</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          value={groupBy}
          onChange={(e) => onGroupByChange(e.target.value as "flat" | "grouped")}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="flat">Flat view</MenuItem>
          <MenuItem value="grouped">Group by workflow</MenuItem>
        </TextField>
      </div>
    </div>
  );
}
