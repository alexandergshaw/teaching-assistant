"use client";

// Thin leaf for the FAB chat's response-mode control (ASK-AI-VOICE-TOGGLE W2).
// Lives outside AiChatWindow because that file sits near the 1000-line ceiling.
// Composes the house SegmentedToggle; never MUI ToggleButtonGroup.
import Link from "next/link";
import styles from "../../page.module.css";
import SegmentedToggle from "../ui/SegmentedToggle";
import type { ChatResponseMode } from "@/lib/chat/types";

export interface ResponseModeStripProps {
  value: ChatResponseMode;
  onChange: (next: ChatResponseMode) => void;
  /** The voice option cannot be produced (no writing sample, or embedded engine). */
  voiceDisabled: boolean;
  /** When voice is disabled because no sample exists, show the settings link. */
  showSampleLink?: boolean;
}

export default function ResponseModeStrip({
  value,
  onChange,
  voiceDisabled,
  showSampleLink = false,
}: ResponseModeStripProps) {
  return (
    <div className={styles.selectionChatContext}>
      <SegmentedToggle<ChatResponseMode>
        label="Response style"
        showLabel
        value={voiceDisabled ? "informational" : value}
        onChange={onChange}
        options={[
          { value: "voice", label: "In my voice", disabled: voiceDisabled },
          { value: "informational", label: "Just answer me" },
        ]}
      />
      {voiceDisabled && showSampleLink && (
        <div className={`${styles.toneStatusChip} ${styles.toneStatusChipMuted}`}>
          <Link href="/account/voice-style" className={styles.toneStatusChipLink}>
            Add a writing sample to draft in your voice
          </Link>
        </div>
      )}
    </div>
  );
}
