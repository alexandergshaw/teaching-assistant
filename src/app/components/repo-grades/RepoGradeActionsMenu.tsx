"use client";

import { useId, useState, type ReactNode, type Ref } from "react";
import { IconButton, Menu, SvgIcon } from "@mui/material";
import styles from "./repo-grades.module.css";

export default function RepoGradeActionsMenu({ label, triggerRef, onClose, children }: {
  label: string;
  triggerRef?: Ref<HTMLButtonElement>;
  onClose?: () => void;
  children: (close: (afterExit?: () => void) => void) => ReactNode;
}) {
  const triggerId = useId();
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [afterExit, setAfterExit] = useState<(() => void) | undefined>();
  const open = anchor !== null;

  const close = (onExited?: () => void) => {
    setAfterExit(() => onExited);
    setAnchor(null);
    onClose?.();
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        id={triggerId}
        type="button"
        size="small"
        className={styles.actionTrigger}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <SvgIcon fontSize="small">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </SvgIcon>
      </IconButton>
      <Menu
        open={open}
        anchorEl={anchor}
        onClose={() => close()}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          list: { id: menuId, "aria-labelledby": triggerId, dense: true },
          transition: { onExited: afterExit },
          paper: { sx: { maxWidth: "min(24rem, calc(100vw - 32px))", "& .MuiMenuItem-root": { whiteSpace: "normal" } } },
        }}
      >
        {children(close)}
      </Menu>
    </>
  );
}
