"use client";

// The folder picker anchored to a workflow's "Folder" button.
//
// One combined filter-and-create field over the existing folder list: typing
// narrows the list, and a name that does not exist yet offers to create it.
// This is the same shape as a label picker in other tools, and it means filing
// a workflow into an existing folder and into a brand new one are the same
// gesture rather than two different commands.

import { useMemo, useState } from "react";
import { Popover, TextField, MenuList, MenuItem, ListItemText, Divider } from "@mui/material";

interface FolderPickerProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  /** Every folder that currently exists, in display order. */
  folders: string[];
  /** The folder this workflow is in now, or "" when unfiled. */
  current: string;
  onPick: (folder: string) => void;
  onClose: () => void;
}

export default function FolderPicker({
  anchorEl,
  open,
  folders,
  current,
  onPick,
  onClose,
}: FolderPickerProps) {
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const matches = useMemo(
    () => folders.filter((f) => f.toLowerCase().includes(trimmed.toLowerCase())),
    [folders, trimmed]
  );
  // Only offer to create when the typed name is not already a folder -
  // otherwise the same name would appear twice, once as a match and once as a
  // "create" row that silently does nothing new.
  const canCreate = trimmed !== "" && !folders.some((f) => f.toLowerCase() === trimmed.toLowerCase());

  const choose = (folder: string) => {
    setQuery("");
    onPick(folder);
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={() => {
        setQuery("");
        onClose();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{ paper: { sx: { width: 240, paddingTop: 1 } } }}
    >
      <div style={{ padding: "0 var(--space-2) var(--space-2)" }}>
        <TextField
          autoFocus
          size="small"
          fullWidth
          placeholder="Find or create a folder"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter commits the obvious choice: the new folder when the name is
            // new, otherwise the single remaining match. With several matches
            // there is no obvious choice, so Enter does nothing.
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (canCreate) choose(trimmed);
            else if (matches.length === 1) choose(matches[0]);
          }}
        />
      </div>

      <MenuList dense sx={{ maxHeight: 260, overflowY: "auto", paddingTop: 0 }}>
        {canCreate && (
          <MenuItem onClick={() => choose(trimmed)}>
            <ListItemText
              primary={`Create "${trimmed}"`}
              slotProps={{ primary: { style: { fontWeight: 600 } } }}
            />
          </MenuItem>
        )}

        {matches.map((folder) => (
          <MenuItem key={folder} selected={folder === current} onClick={() => choose(folder)}>
            <ListItemText primary={folder} />
            {folder === current && (
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>Current</span>
            )}
          </MenuItem>
        ))}

        {!canCreate && matches.length === 0 && (
          <MenuItem disabled>
            <ListItemText
              primary={folders.length === 0 ? "No folders yet" : "No folder matches"}
            />
          </MenuItem>
        )}

        {current !== "" && [
          <Divider key="divider" sx={{ marginY: 0.5 }} />,
          <MenuItem key="remove" onClick={() => choose("")}>
            <ListItemText primary="Remove from folder" />
          </MenuItem>,
        ]}
      </MenuList>
    </Popover>
  );
}
