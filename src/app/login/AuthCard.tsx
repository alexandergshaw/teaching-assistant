"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./login.module.css";

/**
 * The shared brand mark shown at the top of every screen under /login
 * (docs/multi-user-login-acceptance-criteria.md B7). Extracted unchanged
 * from the pre-existing sign-in page so every screen this feature adds
 * looks like the same product, not a bolt-on.
 */
export function LogoMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 3 1.5 8 12 13l8.5-4.05V14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 10.5V15c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

interface AuthCardProps {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  /**
   * Rendered below the card body inside the existing `.footnote` treatment -
   * the same "secondary action, separated by a rule" pattern the pre-existing
   * MFA step already used for "Back to sign in". Every screen under /login
   * uses this same slot for its one way-forward link (B5: "never the current
   * dead-end sentence").
   */
  footnote?: ReactNode;
}

/**
 * The shared brand/card chrome for every unauthenticated screen under
 * /login (docs/multi-user-login-acceptance-criteria.md B7): the sign-in
 * card, the sign-up form, forgot-password, reset-password, and every
 * state-explanation screen (pending/suspended/unavailable/check-email/
 * link-invalid) all render inside this same shell, importing the same
 * login.module.css - no new design vocabulary, per B7.
 */
export default function AuthCard({ title, subtitle, children, footnote }: AuthCardProps) {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <LogoMark />
          <span className={styles.brandName}>Teaching Assistant</span>
        </div>

        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}

        {children}

        {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
      </section>
    </main>
  );
}

/**
 * A form/screen-level error, rendered in a `role="alert"` region with focus
 * moved to it on failure (see the assignment's Accessibility section) so a
 * screen-reader user hears it without having to go looking for it. There is
 * no focus-on-error precedent elsewhere in this repo to copy, so this is
 * written once here and reused by every screen under /login rather than
 * reimplemented per form.
 *
 * `tabIndex={-1}` is required for a non-interactive element's `.focus()`
 * call to do anything at all - without it the browser simply ignores the
 * call, and it looks correct in the source while doing nothing at runtime.
 */
export function AuthAlert({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) {
      ref.current?.focus();
    }
  }, [message]);

  if (!message) {
    return null;
  }

  return (
    <p ref={ref} role="alert" tabIndex={-1} className={styles.error}>
      {message}
    </p>
  );
}

/**
 * Formats an already-validated `next` path as the query-string suffix for a
 * link between two /login screens (e.g. "sign in" <-> "create an account"),
 * or "" when it is the default ("/") and so not worth carrying. This does
 * not itself make the destination trustworthy - the receiving screen
 * re-validates the value again through `safeNextPath` before using it for
 * anything (see the acceptance criteria's "re-validate `next` on every
 * read" rule) - it only avoids re-deriving the same "is this the default"
 * check in four separate files.
 */
export function nextLinkSuffix(nextPath: string): string {
  return nextPath && nextPath !== "/" ? `?next=${encodeURIComponent(nextPath)}` : "";
}
