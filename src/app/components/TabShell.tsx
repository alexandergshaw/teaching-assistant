import TabHeader from "./TabHeader";
import styles from "../page.module.css";

/** Shared root container for a top-level tab surface: the standard card
 *  section with the TabHeader on top. */
export default function TabShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.card}>
      <TabHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}
