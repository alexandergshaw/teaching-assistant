"use client";

import styles from "../../page.module.css";
import Button from "@mui/material/Button";

// A subtle pill that shows (and toggles) the published state of a module or item.
export function PublishToggle({
  published,
  disabled,
  onClick,
}: {
  published: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={published ? "contained" : "outlined"}
      size="small"
      className={`${styles.ccPublish} ${published ? styles.ccPublishOn : styles.ccPublishOff}`}
      onClick={onClick}
      disabled={disabled}
      title={published ? "Published — click to unpublish" : "Unpublished — click to publish"}
    >
      {published ? "Published" : "Unpublished"}
    </Button>
  );
}
