"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ProviderToggle from "./ProviderToggle";
import { useSupabase } from "@/context/SupabaseProvider";
import styles from "./TopBar.module.css";

function LogoMark() {
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

export default function TopBar() {
  const { supabase, user } = useSupabase();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  };

  return (
    <header className={styles.bar}>
      <Link href="/" className={styles.brand}>
        <LogoMark />
        <span className={styles.name}>Teaching Assistant</span>
      </Link>
      <nav className={styles.actions}>
        <Link href="/account/security" className={styles.link}>
          Security
        </Link>
        <ProviderToggle />
        {user && (
          <button type="button" className={styles.signout} onClick={handleSignOut}>
            Sign out
          </button>
        )}
      </nav>
    </header>
  );
}
