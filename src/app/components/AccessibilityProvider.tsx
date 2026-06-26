"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useInstitutionSelection } from "@/lib/institutions";
import {
  scanCourseAccessibilityAction,
  scanItemAccessibilityAction,
  scanCourseFilesAccessibilityAction,
  getLinkValidationAction,
  startLinkValidationAction,
} from "../actions";
import type { AccessibleItemType, Issue, ItemScan } from "@/lib/accessibility/types";
import { countsOf } from "@/lib/accessibility/types";
import type { BrokenLink } from "@/lib/canvas-modules";
import AccessibilityCenter from "./AccessibilityCenter";

const CONTENT_URL_KEY = "ta-content-course-url";

export type ScanStatus = "idle" | "scanning" | "done" | "error";
export type LinkStatus = "idle" | "running" | "done" | "error";

// One item's broken-link issues, grouped for merging into the item view.
type LinkGroup = { type: AccessibleItemType; id: string; title: string; issues: Issue[] };

const LINK_REASON: Record<string, string> = {
  unpublished_item: "links to an unpublished item",
  missing_item: "links to a deleted item",
  missing_file: "links to a missing file",
  course_mismatch: "points to a different course",
  unreachable: "is unreachable",
  broken_link: "is broken",
  deleted: "links to deleted content",
};

function mapBrokenLinks(links: BrokenLink[]): Record<string, LinkGroup> {
  const out: Record<string, LinkGroup> = {};
  for (const l of links) {
    const key = `${l.itemType}:${l.itemId}`;
    const reason = LINK_REASON[l.reason] ?? `is invalid (${l.reason})`;
    const issue: Issue = {
      ruleId: "broken-link",
      severity: "error",
      message: `Link ${reason}: ${l.url}`,
      help: l.linkText ? `Link text: "${l.linkText}"` : undefined,
      locator: { selector: "", snippet: l.url },
      fixKind: "edit",
    };
    (out[key] ??= { type: l.itemType, id: l.itemId, title: l.itemTitle, issues: [] }).issues.push(issue);
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  /** Course Link Validator: status + trigger a fresh run. */
  linkStatus: LinkStatus;
  checkLinks: () => void;
  /** Office-file (docx/pptx) image-alt scan: status + trigger. */
  fileStatus: LinkStatus;
  scanFiles: () => void;
  /** Replace a file's issues after its alt text is edited. */
  setFileScan: (id: string, title: string, issues: Issue[]) => void;
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
  linkStatus: "idle",
  checkLinks: () => {},
  fileStatus: "idle",
  scanFiles: () => {},
  setFileScan: () => {},
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
  const [linkGroups, setLinkGroups] = useState<Record<string, LinkGroup>>({});
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("idle");
  const [fileItems, setFileItems] = useState<Record<string, ItemScan>>({});
  const [fileStatus, setFileStatus] = useState<LinkStatus>("idle");
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
    setLinkGroups({});
    setLinkStatus("idle");
    setFileItems({});
    setFileStatus("idle");
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
    // Pick up any already-completed link-validation run (a free GET, no new job).
    const lv = await getLinkValidationAction(url, inst || undefined);
    if (!("error" in lv) && lv.state === "completed") {
      setLinkGroups(mapBrokenLinks(lv.links));
      setLinkStatus("done");
    }
  }, []);

  const resetScan = useCallback(() => {
    setItems({});
    setStatus("idle");
    setError(undefined);
    setLinkGroups({});
    setLinkStatus("idle");
    setFileItems({});
    setFileStatus("idle");
  }, []);

  // Scan the course's Office files for missing image alt text (downloads files).
  const scanFiles = useCallback(async () => {
    if (!hasCourseId(courseUrl)) return;
    setFileStatus("running");
    const result = await scanCourseFilesAccessibilityAction(courseUrl, institution || undefined);
    if ("error" in result) {
      setFileStatus("error");
      return;
    }
    const map: Record<string, ItemScan> = {};
    for (const it of result.items) map[itemKey(it.type, it.id)] = it;
    setFileItems(map);
    setFileStatus("done");
  }, [courseUrl, institution]);

  // Start a fresh link-validation run and poll until it completes (~2 min cap).
  const checkLinks = useCallback(async () => {
    if (!hasCourseId(courseUrl)) return;
    setLinkStatus("running");
    const started = await startLinkValidationAction(courseUrl, institution || undefined);
    if ("error" in started) {
      setLinkStatus("error");
      return;
    }
    for (let i = 0; i < 40; i += 1) {
      await sleep(3000);
      const lv = await getLinkValidationAction(courseUrl, institution || undefined);
      if ("error" in lv) continue;
      if (lv.state === "completed") {
        setLinkGroups(mapBrokenLinks(lv.links));
        setLinkStatus("done");
        return;
      }
      if (lv.state === "errored") {
        setLinkStatus("error");
        return;
      }
    }
    setLinkStatus("done");
  }, [courseUrl, institution]);

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
      const key = itemKey(type, id);
      // Optimistically drop this item's broken links (the user likely just fixed
      // one); a "Recheck links" run restores any that are still broken.
      setLinkGroups((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      const result = await scanItemAccessibilityAction(courseUrl, type, id, institution || undefined);
      if ("error" in result) return;
      setItems((prev) => ({ ...prev, [key]: result.item }));
    },
    [courseUrl, institution]
  );

  const rescanAll = useCallback(() => {
    if (!hasCourseId(courseUrl)) return;
    scannedSig.current = `${institution}|${courseUrl}`;
    void runScan(courseUrl, institution);
  }, [courseUrl, institution, runScan]);

  // Update one file's issues after its alt text is edited (the office alt editor
  // already knows the new state, so no re-download is needed).
  const setFileScan = useCallback((id: string, title: string, issues: Issue[]) => {
    setFileItems((prev) => {
      const c = countsOf(issues);
      return {
        ...prev,
        [`file:${id}`]: { type: "file", id, title, fingerprint: prev[`file:${id}`]?.fingerprint ?? "", errorCount: c.errorCount, warningCount: c.warningCount, suggestionCount: c.suggestionCount, issues },
      };
    });
  }, []);

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
    // Merge HTML-scan issues with file (office image-alt) and broken-link issues
    // per item, recomputing counts.
    const merged: Record<string, ItemScan> = {};
    for (const [k, it] of Object.entries(items)) merged[k] = { ...it, issues: [...it.issues] };
    for (const [k, it] of Object.entries(fileItems)) merged[k] = { ...it, issues: [...it.issues] };
    for (const [k, g] of Object.entries(linkGroups)) {
      if (merged[k]) merged[k].issues.push(...g.issues);
      else merged[k] = { type: g.type, id: g.id, title: g.title, fingerprint: "", errorCount: 0, warningCount: 0, suggestionCount: 0, issues: [...g.issues] };
    }
    let errorCount = 0;
    let warningCount = 0;
    let suggestionCount = 0;
    let flaggedItems = 0;
    for (const it of Object.values(merged)) {
      const c = countsOf(it.issues);
      it.errorCount = c.errorCount;
      it.warningCount = c.warningCount;
      it.suggestionCount = c.suggestionCount;
      errorCount += c.errorCount;
      warningCount += c.warningCount;
      suggestionCount += c.suggestionCount;
      if (c.errorCount + c.warningCount > 0) flaggedItems += 1;
    }
    return {
      status,
      error,
      courseUrl,
      acronym: institution || undefined,
      hasCourse: hasCourseId(courseUrl),
      items: merged,
      errorCount,
      warningCount,
      suggestionCount,
      flaggedItems,
      getItem: (type, id) => merged[itemKey(type, id)],
      rescanItem,
      rescanAll,
      linkStatus,
      checkLinks: () => void checkLinks(),
      fileStatus,
      scanFiles: () => void scanFiles(),
      setFileScan,
      centerOpen,
      setCenterOpen,
    };
  }, [items, fileItems, linkGroups, status, error, courseUrl, institution, linkStatus, fileStatus, rescanItem, rescanAll, checkLinks, scanFiles, setFileScan, centerOpen]);

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
