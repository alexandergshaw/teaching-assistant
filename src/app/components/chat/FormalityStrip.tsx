"use client";

// Thin leaf for the FAB chat's formality control (CHATBOT-FORMALITY-SCALE W2).
// Lives outside AiChatWindow because that file sits near the 1000-line ceiling.
// Composes the house SegmentedToggle; independent of the response-mode strip.
import styles from "../../page.module.css";
import SegmentedToggle from "../ui/SegmentedToggle";
import type { ChatFormality } from "@/lib/chat/types";

export interface FormalityStripProps {
  value: ChatFormality;
  onChange: (next: ChatFormality) => void;
}

export default function FormalityStrip({ value, onChange }: FormalityStripProps) {
  return (
    <div className={styles.selectionChatContext}>
      <SegmentedToggle<ChatFormality>
        label="Formality"
        showLabel
        value={value}
        onChange={onChange}
        options={[
          { value: "casual", label: "Casual" },
          { value: "neutral", label: "Neutral" },
          { value: "formal", label: "Formal" },
        ]}
      />
    </div>
  );
}
