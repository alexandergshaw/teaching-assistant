"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProviderToggle from "./ProviderToggle";
import { useSupabase } from "@/context/SupabaseProvider";
import { useInstitutions, writeInstitutions } from "@/lib/institutions";
import { checkInstitutionsAction } from "../actions";
import styles from "./TopBar.module.css";

type InstitutionStatus = { canvasConfigured: boolean; llmConfigured: boolean };

function InstitutionsSection({ open }: { open: boolean }) {
  const institutions = useInstitutions();
  const [newAcronym, setNewAcronym] = useState("");
  const [statuses, setStatuses] = useState<Record<string, InstitutionStatus>>({});

  // Check env configuration when the menu is open (await-first: no sync setState).
  useEffect(() => {
    if (!open || institutions.length === 0) return;
    let cancelled = false;
    (async () => {
      const result = await checkInstitutionsAction(institutions);
      if (cancelled || "error" in result) return;
      const map: Record<string, InstitutionStatus> = {};
      for (const s of result.statuses) {
        map[s.acronym] = { canvasConfigured: s.canvasConfigured, llmConfigured: s.llmConfigured };
      }
      setStatuses(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, institutions]);

  const addInstitution = () => {
    const code = newAcronym.trim().toUpperCase();
    if (!code || institutions.includes(code)) {
      setNewAcronym("");
      return;
    }
    writeInstitutions([...institutions, code]);
    setNewAcronym("");
  };

  return (
    <div className={styles.menuSection}>
      <span className={styles.menuLabel}>Institutions</span>
      <div className={styles.instAddRow}>
        <input
          type="text"
          className={styles.instInput}
          placeholder="Add acronym (e.g. MCC)"
          value={newAcronym}
          onChange={(e) => setNewAcronym(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addInstitution();
            }
          }}
        />
        <button
          type="button"
          className={styles.instAddBtn}
          onClick={addInstitution}
          disabled={!newAcronym.trim()}
        >
          Add
        </button>
      </div>
      {institutions.length === 0 ? (
        <span className={styles.menuHint}>
          None yet. Add a school acronym to use the Live Feed and Communications tabs.
        </span>
      ) : (
        <ul className={styles.instList}>
          {institutions.map((code) => {
            const st = statuses[code];
            return (
              <li key={code} className={styles.instItem}>
                <span className={styles.instCode}>{code}</span>
                <span
                  className={styles.instStatus}
                  title={
                    st
                      ? `Canvas ${st.canvasConfigured ? "configured" : "missing env"} · Grader ${st.llmConfigured ? "school" : "global"}`
                      : ""
                  }
                >
                  {st ? (st.canvasConfigured ? "Ready" : "Set env") : "…"}
                </span>
                <button
                  type="button"
                  className={styles.instRemove}
                  aria-label={`Remove ${code}`}
                  title="Remove"
                  onClick={() => writeInstitutions(institutions.filter((c) => c !== code))}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

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

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape while the menu is open. The effect only
  // wires/unwires listeners; state is updated from their callbacks, not the body.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.settings} ref={ref}>
      <button
        type="button"
        className={styles.settingsButton}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <GearIcon />
        Settings
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuSection}>
            <span className={styles.menuLabel}>LLM provider</span>
            <ProviderToggle />
          </div>
          <InstitutionsSection open={open} />
          <Link
            href="/account/integrations"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Integrations
          </Link>
          <Link
            href="/account/security"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Security
          </Link>
        </div>
      )}
    </div>
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
        <SettingsMenu />
        {user && (
          <button type="button" className={styles.signout} onClick={handleSignOut}>
            Sign out
          </button>
        )}
      </nav>
    </header>
  );
}
