"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "@mui/material";
import styles from "../../page.module.css";
import { writeClipboardText } from "../ui/clipboard";
import { visuallyHidden } from "../ui/visuallyHidden";
import { CopyIcon, CheckIcon } from "./icons";

const COPY_RESET_MS = 1500;

/**
 * Per-row copy-to-clipboard control for a course's instructor email. A leaf:
 * it writes only its own `email` prop, so each row copies its own address.
 * Rendered in the email cell's EditableCell `actions` slot, hence the
 * stopPropagation (the display cell opens the inline editor on click).
 */
export default function EmailCopyButton({ email, label }: { email: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (email.trim() === "") return null;

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await writeClipboardText(email);
      setFailed(false);
      setCopied(true);
    } catch {
      setCopied(false);
      setFailed(true);
    }
    timerRef.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, COPY_RESET_MS);
  };

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Copy email for ${label}`}
        title={copied ? "Copied" : "Copy email"}
        onClick={copy}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </IconButton>
      {failed ? <span className={styles.fieldHint}>Copy failed</span> : null}
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {copied ? `Copied email for ${label}` : ""}
      </span>
    </>
  );
}
