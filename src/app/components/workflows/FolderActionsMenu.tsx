"use client";

// The per-folder actions control in the workflow sidebar: rename, reorder, and
// delete. Self-contained so the sidebar only has to say what each action does,
// not how it is presented.

import { useState } from "react";
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from "@mui/material";

interface FolderActionsMenuProps {
  folder: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: (next: string) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}

export default function FolderActionsMenu({
  folder,
  canMoveUp,
  canMoveDown,
  onRename,
  onMove,
  onRemove,
}: FolderActionsMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder);

  const close = () => setAnchorEl(null);

  const commitRename = () => {
    const next = draft.trim();
    setRenaming(false);
    if (next && next !== folder) onRename(next);
  };

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Actions for folder ${folder}`}
        title="Folder actions"
        onClick={(e) => {
          e.stopPropagation();
          setAnchorEl(e.currentTarget);
        }}
        sx={{ padding: "var(--space-1)", color: "var(--text-secondary)" }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="3" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="11" r="1.2" fill="currentColor" />
        </svg>
      </IconButton>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        <MenuItem
          dense
          onClick={() => {
            setDraft(folder);
            setRenaming(true);
            close();
          }}
        >
          <ListItemText primary="Rename" />
        </MenuItem>
        <MenuItem
          dense
          disabled={!canMoveUp}
          onClick={() => {
            onMove("up");
            close();
          }}
        >
          <ListItemText primary="Move up" />
        </MenuItem>
        <MenuItem
          dense
          disabled={!canMoveDown}
          onClick={() => {
            onMove("down");
            close();
          }}
        >
          <ListItemText primary="Move down" />
        </MenuItem>
        <MenuItem
          dense
          onClick={() => {
            onRemove();
            close();
          }}
        >
          {/* Deleting a folder unfiles its workflows; it never deletes them.
              The label says so, so the action does not read as destructive. */}
          <ListItemText primary="Delete folder (keeps workflows)" />
        </MenuItem>
      </Menu>

      <Dialog open={renaming} onClose={() => setRenaming(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: "var(--font-size-lg)" }}>Rename folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Folder name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              }
            }}
            helperText="Renaming onto an existing folder merges the two."
            sx={{ marginTop: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setRenaming(false)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={draft.trim() === "" || draft.trim() === folder}
            onClick={commitRename}
            sx={{ textTransform: "none" }}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
