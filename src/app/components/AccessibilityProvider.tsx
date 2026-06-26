"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useInstitutionSelection } from "@/lib/institutions";
import { scanCourseAccessibilityAction, scanItemAccessibilityAction } from "../actions";
import type { AccessibleItemType, ItemScan } from "@/lib/accessibility/types";
import AccessibilityCenter from "./AccessibilityCenter";

const CONTENT_URL_KEY = "ta-content-course-url";

export type ScanStatus = "idle" | "scanning" | "done" | "error";

export interface AccessibilityValue {
  status: ScanStatus;
  error?: string;
  /** The active course URL and institution code, for remediation fetch/save. */
  courseUrl: string;
  acronym?: string;
  /** Whether a course is selected (so the pill knows to appear). */
  hasCourse: boolean;
  /** Scanned items keyed by `${type}:${id}`. */
  items: Record<string, ItemScan>;
  errorCount: number;
  warningCount: number;
  suggestionCount: number;
  /** Number of items with at least one error or warning. */
  flaggedItems: number;
  getItem: (type: AccessibleItemType, id: string) => ItemScan | undefined;
  rescanItem: (type: AccessibleItemType, id: string) => Promise<void>;
  rescanAll: () => void;
  centerOpen: boolean;
  setCenterOpen: (open: boolean) => void;
}

const DEFAULT: AccessibilityValue = {
  status: "idle",
  courseUrl: "",
  hasCourse: false,
  items: {},
  errorCount: 0,
  warningCount: 0,
  suggestionCount: 0,
  flaggedItems: 0,
  getItem: () => undefined,
  rescanItem: async () => {},
  rescanAll: () => {},
  centerOpen: false,
  setCenterOpen: () => {},
};

const AccessibilityContext = createContext<AccessibilityValue | null>(null);

const itemKey = (type: AccessibleItemType, id: string) => `${type}:${id}`;
const hasCourseId = (url: string) => /\/courses\/\d+/.test(url);

/**
 * Global accessibility state: tracks the active LMS course (from the content
 * tab), auto-scans it in the background when it changes (cache-first server-side),
 * and exposes the results to the TopBar pill, row badges, and the center. Mounted
 * high in the tree (layout) so it persists across tab switches — same pattern as
 * InstitutionCountsProvider.
 */
export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const { active: institution } = useInstitutionSelection();
  const [courseUrl, setCourseUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(CONTENT_URL_KEY) ?? "" : ""
  );
  const [items, setItems] = useState<Record<string, ItemScan>>({});
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [error, setError] = useState<string | undefined>();
  const [centerOpen, setCenterOpen] = useState(false);
  const scannedSig = useRef<string>("");

  // The content tab dispatches this when the loaded course changes.
  useEffect(() => {
    const onCourseChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ courseUrl?: string }>).detail;
      setCourseUrl(detail?.courseUrl ?? localStorage.getItem(CONTENT_URL_KEY) ?? "");
    };
    window.addEventListener("ta-course-changed", onCourseChanged);
    return () => window.removeEventListener("ta-course-changed", onCourseChanged);
  }, []);

  const runScan = useCallback(async (url: string, inst: string) => {
    setStatus("scanning");
    setItems({}); // clear the previous course's results while the new scan runs
    setError(undefined);
    const result = await scanCourseAccessibilityAction(url, inst || undefined);
    if ("error" in result) {
      setStatus("error");
      setError(result.error);
      return;
    }
    const map: Record<string, ItemScan> = {};
    for (const it of result.items) map[itemKey(it.type, it.id)] = it;
    setItems(map);
    setStatus("done");
  }, []);

  const resetScan = useCallback(() => {
    setItems({});
    setStatus("idle");
    setError(undefined);
  }, []);

  // Auto-scan when the (course, institution) pair changes. The reset/scan helpers
  // update state, which is intentional here (client-only background scan), so the
  // set-state-in-effect rule is suppressed for this effect.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!hasCourseId(courseUrl)) {
      scannedSig.current = "";
      resetScan();
      return;
    }
    const sig = `${institution}|${courseUrl}`;
    if (sig === scannedSig.current) return;
    scannedSig.current = sig;
    void runScan(courseUrl, institution);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [courseUrl, institution, runScan, resetScan]);

  const rescanItem = useCallback(
    async (type: AccessibleItemType, id: string) => {
      if (!hasCourseId(courseUrl)) return;
      const result = await scanItemAccessibilityAction(courseUrl, type, id, institution || undefined);
      if ("error" in result) return;
      setItems((prev) => ({ ...prev, [itemKey(type, id)]: result.item }));
    },
    [courseUrl, institution]
  );

  const rescanAll = useCallback(() => {
    if (!hasCourseId(courseUrl)) return;
    scannedSig.current = `${institution}|${courseUrl}`;
    void runScan(courseUrl, institution);
  }, [courseUrl, institution, runScan]);

  // Editors dispatch this after saving an item, so its badge updates without a
  // full course re-scan.
  useEffect(() => {
    const onSaved = (e: Event) => {
      const d = (e as CustomEvent<{ type?: AccessibleItemType; id?: string }>).detail;
      if (d?.type && d?.id) void rescanItem(d.type, d.id);
    };
    window.addEventListener("ta-content-saved", onSaved);
    return () => window.removeEventListener("ta-content-saved", onSaved);
  }, [rescanItem]);

  const value = useMemo<AccessibilityValue>(() => {
    let errorCount = 0;
    let warningCount = 0;
    let suggestionCount = 0;
    let flaggedItems = 0;
    for (const it of Object.values(items)) {
      errorCount += it.errorCount;
      warningCount += it.warningCount;
      suggestionCount += it.suggestionCount;
      if (it.errorCount + it.warningCount > 0) flaggedItems += 1;
    }
    return {
      status,
      error,
      courseUrl,
      acronym: institution || undefined,
      hasCourse: hasCourseId(courseUrl),
      items,
      errorCount,
      warningCount,
      suggestionCount,
      flaggedItems,
      getItem: (type, id) => items[itemKey(type, id)],
      rescanItem,
      rescanAll,
      centerOpen,
      setCenterOpen,
    };
  }, [items, status, error, courseUrl, institution, rescanItem, rescanAll, centerOpen]);

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
      <AccessibilityCenter />
    </AccessibilityContext.Provider>
  );
}

/** Read accessibility state. Safe defaults when no provider is mounted. */
export function useAccessibility(): AccessibilityValue {
  return useContext(AccessibilityContext) ?? DEFAULT;
}
