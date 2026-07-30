"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import ProviderToggle from "./ProviderToggle";
import InstitutionSwitcher from "./InstitutionSwitcher";
import { useAccessibility } from "./AccessibilityProvider";
import { useSupabase } from "@/context/SupabaseProvider";
import {
  useInstitutions,
  writeInstitutions,
  useInstitutionSelection,
  validateNewInstitutionAcronym,
} from "@/lib/institutions";
import { confirmAndRemoveInstitution } from "@/lib/institution-removal";
import { useThemePreference } from "@/hooks/useThemePreference";
import { checkInstitutionsAction, getInstitutionDeletionImpactAction } from "../actions";
import styles from "./TopBar.module.css";

type InstitutionStatus = { canvasConfigured: boolean; llmConfigured: boolean };

// Always allows the removal through - the default when a page renders TopBar
// without wiring page.tsx's Knowledge-tab guard (every route except the main
// tabbed page.tsx: /knowledge, /account/*). Those routes never mount
// KnowledgeTab.tsx, so there is no unsaved edit there to protect.
const ALWAYS_ALLOW = () => true;

function InstitutionsSection({
  open,
  guardKbUnsavedEdits,
}: {
  open: boolean;
  guardKbUnsavedEdits: (code: string) => boolean;
}) {
  const institutions = useInstitutions();
  const [newAcronym, setNewAcronym] = useState("");
  const [statuses, setStatuses] = useState<Record<string, InstitutionStatus>>({});
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

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
    const result = validateNewInstitutionAcronym(newAcronym, institutions);
    if (!result.ok) {
      setNewAcronym("");
      return;
    }
    writeInstitutions([...institutions, result.code]);
    setNewAcronym("");
  };

  // Remove an institution (AC1-AC6 of the "delete institutions" feature).
  // Goes through the same confirmAndRemoveInstitution flow KnowledgeTab.tsx's
  // own picker uses (AC4) - it states the real page/tile counts before
  // anything happens (AC1/AC2) and never deletes a database row (AC3). The
  // Knowledge-tab guard is page.tsx's, since TopBar has no view of that
  // tab's own unsaved-edit state (AC6).
  const removeInstitution = async (code: string) => {
    setRemoveError(null);
    setRemovingCode(code);
    const result = await confirmAndRemoveInstitution(code, institutions, {
      fetchImpact: getInstitutionDeletionImpactAction,
      guardUnsavedEdits: () => guardKbUnsavedEdits(code),
    });
    setRemovingCode(null);
    if (!result.removed && result.reason === "error") {
      setRemoveError(result.message);
    }
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
      {removeError && <span className={styles.menuError}>{removeError}</span>}
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
                  disabled={removingCode === code}
                  onClick={() => void removeInstitution(code)}
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
    <svg width="17" height="17" viewBox="0 0 24 24" style={{ fill: color }} aria-hidden="true" focusable="false">
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
  const color = a11y.errorCount > 0 ? "var(--danger)" : a11y.warningCount > 0 ? "var(--warning)" : "var(--success)";
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
        background: "var(--field-background)",
        color: "var(--text-secondary)",
        fontSize: "0.85rem",
        fontWeight: 600,
        textTransform: "none",
        "&:hover": {
          backgroundColor: "var(--surface-subtle)",
        },
      }}
    >
      <AccessIcon color={color} />
      {scanning && issues === 0 ? (
        <span style={{ color: "var(--text-muted)" }}>…</span>
      ) : issues > 0 ? (
        <span style={{ color }}>{issues}</span>
      ) : (
        <span style={{ color: "var(--success)" }}>OK</span>
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

function AppearanceSection() {
  const { preference, setPreference } = useThemePreference();

  return (
    <div className={styles.menuSection}>
      <span className={styles.menuLabel}>Appearance</span>
      <div className={styles.themeRow}>
        <button
          type="button"
          className={`${styles.themeOption} ${preference === "light" ? styles.themeOptionActive : ""}`}
          onClick={() => setPreference("light")}
          aria-pressed={preference === "light"}
        >
          Light
        </button>
        <button
          type="button"
          className={`${styles.themeOption} ${preference === "dark" ? styles.themeOptionActive : ""}`}
          onClick={() => setPreference("dark")}
          aria-pressed={preference === "dark"}
        >
          Dark
        </button>
        <button
          type="button"
          className={`${styles.themeOption} ${preference === "system" ? styles.themeOptionActive : ""}`}
          onClick={() => setPreference("system")}
          aria-pressed={preference === "system"}
        >
          System
        </button>
      </div>
    </div>
  );
}

function SettingsMenu({ guardKbUnsavedEdits }: { guardKbUnsavedEdits: (code: string) => boolean }) {
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
          <AppearanceSection />
          <InstitutionsSection open={open} guardKbUnsavedEdits={guardKbUnsavedEdits} />
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
          <Link
            href="/account/voice-style"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Voice & Style
          </Link>
        </div>
      )}
    </div>
  );
}

export interface TopBarProps {
  /**
   * Called before removing an institution whose acronym matches the one
   * currently open in the Knowledge tab (AC5/AC6 of the "delete
   * institutions" feature) - lets page.tsx apply its own confirmDiscard()
   * guard for that tab's unsaved page edits, since TopBar has no view of
   * that state itself. Omitted (or on every route besides the main tabbed
   * page.tsx, which does not mount KnowledgeTab.tsx) removal always proceeds.
   */
  guardKbUnsavedEdits?: (code: string) => boolean;
}

export default function TopBar({ guardKbUnsavedEdits = ALWAYS_ALLOW }: TopBarProps = {}) {
  const { supabase, user } = useSupabase();
  const router = useRouter();
  const { institutions } = useInstitutionSelection();

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
        {institutions.length > 0 && <InstitutionSwitcher metric="both" />}
        <AccessibilityPill />
        <SettingsMenu guardKbUnsavedEdits={guardKbUnsavedEdits} />
        {user && (
          <Button variant="outlined" size="small" onClick={handleSignOut} sx={{ textTransform: "none" }}>
            Sign out
          </Button>
        )}
      </nav>
    </header>
  );
}
