import styles from "../page.module.css";

/** The standard heading for a top-level tab: an accent eyebrow, a title, and an
 *  optional subtitle. Renders the existing `.header` structure so every tab looks
 *  consistent. */
export default function TabHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className={styles.header}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}
