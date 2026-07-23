"use client";

import { ReactNode } from "react";
import TabHeader from "./TabHeader";
import styles from "../page.module.css";

/** Shared root container for a top-level tab surface: the standard card
 *  section, with an optional subnav rendered above it and an optional
 *  TabHeader (eyebrow + title) rendered on top of the card content. */
export default function TabShell({
  children,
  subnav,
  eyebrow,
  title,
  subtitle,
}: {
  children: ReactNode;
  subnav?: ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <>
      {subnav}
      <section className={styles.card}>
        {eyebrow !== undefined && title !== undefined ? (
          <TabHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        ) : null}
        {children}
      </section>
    </>
  );
}
