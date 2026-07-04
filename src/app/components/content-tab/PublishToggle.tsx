"use client";

import styles from "../../page.module.css";

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
    <button
      type="button"
      className={`${styles.ccPublish} ${published ? styles.ccPublishOn : styles.ccPublishOff}`}
      onClick={onClick}
      disabled={disabled}
      title={published ? "Published — click to unpublish" : "Unpublished — click to publish"}
    >
      {published ? "Published" : "Unpublished"}
    </button>
  );
}
