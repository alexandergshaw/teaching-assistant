"use client";

import Link from "next/link";
import TopBar from "../components/TopBar";
// No stylesheet of its own: this index reuses the shared settings-area
// stylesheet every sibling under /account/* already imports (Security,
// Integrations, Voice & Style, Diagnostics all point at this same file - see
// its own header comment), so the account area keeps reading as ONE surface
// instead of introducing a second visual language for just this page.
import styles from "./security/security.module.css";

interface AccountArea {
  href: string;
  name: string;
  description: string;
}

// One entry per page that actually exists under /account/*. Deliberately
// excludes /account/people: that screen is owner-only (a different wave is
// adding it, with its own entry point in the top navigation gated on an
// owner check) - listing it here for every signed-in account would offer a
// link most people cannot open.
const ACCOUNT_AREAS: AccountArea[] = [
  {
    href: "/account/integrations",
    name: "Integrations",
    description: "Connect Google Calendar for scheduling, and each school's Outlook mailbox to work with its inbox.",
  },
  {
    href: "/account/security",
    name: "Security",
    description: "Add, verify, and remove authenticator apps for two-factor sign-in.",
  },
  {
    href: "/account/voice-style",
    name: "Voice & Style",
    description: "Set the narration voice and writing style used in announcements, replies, and generated documents.",
  },
  {
    href: "/account/diagnostics",
    name: "Diagnostics",
    description: "Inspect a course's Canvas import jobs and cancel a stuck migration.",
  },
];

export default function AccountPage() {
  return (
    <>
      <TopBar />
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Account</h1>
          <p className={styles.subtitle}>Settings tied to your own sign-in. Choose an area below.</p>

          <nav aria-label="Account areas" className={styles.section}>
            <ul className={styles.factorList}>
              {ACCOUNT_AREAS.map((area) => (
                <li key={area.href}>
                  <Link href={area.href} className={styles.factor}>
                    <span className={styles.factorName}>{area.name}</span>
                    <span className={styles.rowDetail}>{area.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      </main>
    </>
  );
}
