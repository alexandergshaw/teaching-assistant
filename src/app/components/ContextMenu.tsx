"use client";

import { useState, useCallback, useEffect } from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";

interface AnchorPos {
  mouseX: number;
  mouseY: number;
}

/**
 * Global right-click context menu.
 * Dispatches a custom "open-ai-chat" event when the user selects that option.
 */
export default function ContextMenu() {
  const [anchor, setAnchor] = useState<AnchorPos | null>(null);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setAnchor({ mouseX: e.clientX, mouseY: e.clientY });
  }, []);

  const handleClose = useCallback(() => {
    setAnchor(null);
  }, []);

  const handleOpenAiChat = useCallback(() => {
    handleClose();
    window.dispatchEvent(new CustomEvent("open-ai-chat"));
  }, [handleClose]);

  useEffect(() => {
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, [handleContextMenu]);

  return (
    <Menu
      open={anchor !== null}
      onClose={handleClose}
      anchorReference="anchorPosition"
      anchorPosition={
        anchor !== null
          ? { top: anchor.mouseY, left: anchor.mouseX }
          : undefined
      }
    >
      <MenuItem onClick={handleOpenAiChat}>
        <ListItemIcon>
          <ChatMenuIcon />
        </ListItemIcon>
        <ListItemText>Open AI Chat</ListItemText>
      </MenuItem>
    </Menu>
  );
}

function ChatMenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  );
}
