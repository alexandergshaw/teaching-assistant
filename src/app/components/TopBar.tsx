"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import ProviderToggle from "./ProviderToggle";
import { useAccessibility } from "./AccessibilityProvider";
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
        <TextField
          size="small"
          placeholder="Add acronym (e.g. MCC)"
          value={newAcronym}
          onChange={(e) => setNewAcronym(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addInstitution();
            }
          }}
          sx={{ flex: 1 }}
        />
        <Button
          variant="outlined"
          size="small"
          onClick={addInstitution}
          disabled={!newAcronym.trim()}
        >
          Add
        </Button>
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
                <IconButton
                  size="small"
                  aria-label={`Remove ${code}`}
                  title="Remove"
                  onClick={() => writeInstitutions(institutions.filter((c) => c !== code))}
                >
                  ×
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Universal-access glyph (head + arms-out body), tinted by severity.
function AccessIcon({ color }: { color: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={color} aria-hidden="true" focusable="false">
      <circle cx="12" cy="4.2" r="2.1" />
      <path d="M21 8.6a1 1 0 0 1-.72 1.18l-4.28 1.07V21a1 1 0 1 1-2 0v-5h-2v5a1 1 0 1 1-2 0V10.85L3.72 9.78A1 1 0 1 1 4.28 7.86l5.06 1.27c.43.1.88.16 1.32.16h2.68c.44 0 .89-.06 1.32-.16l5.06-1.27A1 1 0 0 1 21 8.6Z" />
    </svg>
  );
}

// Persistent accessibility status: shows the current course's error/warning
// tally on every tab and opens the Accessibility Center on click. Hidden until a
// course is selected.
function AccessibilityPill() {
  const a11y = useAccessibility();
  if (!a11y.hasCourse) return null;
  const issues = a11y.errorCount + a11y.warningCount;
  const scanning = a11y.status === "scanning";
  const color = a11y.errorCount > 0 ? "#dc2626" : a11y.warningCount > 0 ? "#d97706" : "#16a34a";
  const label = scanning && issues === 0 ? "Scanning accessibility" : `${issues} accessibility issue${issues === 1 ? "" : "s"}`;
  return (
    <Button
      onClick={() => a11y.setCenterOpen(true)}
      title={label}
      aria-label={label}
      variant="outlined"
      size="small"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        height: 34,
        padding: "0 11px",
        borderRadius: 1.125,
        border: "1px solid var(--field-border, #cbd5e1)",
        background: "#fff",
        color: "#334155",
        fontSize: "0.85rem",
        fontWeight: 600,
        textTransform: "none",
        "&:hover": {
          backgroundColor: "#f8f9fa",
        },
      }}
    >
      <AccessIcon color={color} />
      {scanning && issues === 0 ? (
        <span style={{ color: "#94a3b8" }}>…</span>
      ) : issues > 0 ? (
        <span style={{ color }}>{issues}</span>
      ) : (
        <span style={{ color: "#16a34a" }}>OK</span>
      )}
    </Button>
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
      <Button
        variant="outlined"
        size="small"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        sx={{ textTransform: "none" }}
      >
        <GearIcon />
        Settings
      </Button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuSection}>
            <span className={styles.menuLabel}>LLM provider</span>
            <ProviderToggle />
          </div>
          <InstitutionsSection open={open} />
          <Link
            href="/knowledge"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Knowledge review
          </Link>
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
        <AccessibilityPill />
        <SettingsMenu />
        {user && (
          <Button variant="outlined" size="small" onClick={handleSignOut} sx={{ textTransform: "none" }}>
            Sign out
          </Button>
        )}
      </nav>
    </header>
  );
}
