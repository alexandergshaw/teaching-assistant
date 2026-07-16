"use client";

import TabHeader from "./TabHeader";
import styles from "../page.module.css";

export default function MessageDraftsTab() {
  return (
    <section className={styles.card}>
      <TabHeader
        eyebrow="Drafts"
        title="Drafted messages"
        subtitle="AI-drafted replies and announcements awaiting review will appear here."
      />
      <div className={styles.emptyState}>
        No drafted messages yet. This is where message drafts will be collected for review and sending.
      </div>
    </section>
  );
}
