"use client";

import styles from "../../page.module.css";

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6A2.5 2.5 0 0 1 18 3.5v8A2.5 2.5 0 0 1 15.5 14h-6A2.5 2.5 0 0 1 7 11.5v-8Zm2.5-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6Z" />
      <path d="M2 7.5A2.5 2.5 0 0 1 4.5 5h.75a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-.75a.75.75 0 0 1 1.5 0v.75A2.5 2.5 0 0 1 10.5 18h-6A2.5 2.5 0 0 1 2 15.5v-8Z" />
    </svg>
  );
}

function LockClosedIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path fillRule="evenodd" d="M5.75 8V6a4.25 4.25 0 1 1 8.5 0v2h.25A2.75 2.75 0 0 1 17.25 10.75v5.5A2.75 2.75 0 0 1 14.5 19h-9A2.75 2.75 0 0 1 2.75 16.25v-5.5A2.75 2.75 0 0 1 5.5 8h.25Zm7 0V6a2.75 2.75 0 1 0-5.5 0v2h5.5Zm-4.25 3a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-.75 1.298v1.452a.75.75 0 0 1-1.5 0v-1.452A1.5 1.5 0 0 1 8.5 11Z" clipRule="evenodd" />
    </svg>
  );
}

function LockOpenIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path fillRule="evenodd" d="M7.25 8V6a2.75 2.75 0 0 1 5.164-1.31.75.75 0 0 0 1.323-.706A4.25 4.25 0 0 0 5.75 6v2H5.5a2.75 2.75 0 0 0-2.75 2.75v5.5A2.75 2.75 0 0 0 5.5 19h9a2.75 2.75 0 0 0 2.75-2.75v-5.5A2.75 2.75 0 0 0 14.5 8h-7.25Zm2.75 3a1.5 1.5 0 0 0-.75 2.798v1.452a.75.75 0 0 0 1.5 0v-1.452A1.5 1.5 0 0 0 10 11Z" clipRule="evenodd" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
    </svg>
  );
}

function NavTabLabel({ text, count }: { text: string; count: number }) {
  return (
    <span className={styles.tabLabelWrap}>
      {text}
      {count > 0 && <span className={styles.navBadge}>{count}</span>}
    </span>
  );
}

export { CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon, NavTabLabel };
