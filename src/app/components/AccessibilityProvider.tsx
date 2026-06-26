"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useInstitutionSelection } from "@/lib/institutions";
import type { AccessibleItemType, Issue, ItemScan } from "@/lib/accessibility/types";
import { countsOf } from "@/lib/accessibility/types";
import type { BrokenLink, AccessibilityItemRef } from "@/lib/canvas-modules";
import AccessibilityCenter from "./AccessibilityCenter";

// Scans run through a route handler (not server actions) so they never block the
// course-content fetches — Next serializes server actions, route handlers don't.
async function a11yApi<T>(op: string, payload: Record<string, unknown>): Promise<T | { error: string }> {
  try {
    const res = await fetch("/api/accessibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, ...payload }),
    });
    // The route always replies JSON; anything else (an auth redirect to the login
    // page, a 500 error page) means the request didn't reach it — surface a clean
    // message instead of letting JSON.parse throw "Unexpected token '<'".
    if (!res.headers.get("content-type")?.includes("application/json")) {
      return { error: res.status === 401 || res.status === 403 ? "Your session expired — sign in again." : `Accessibility scan failed (HTTP ${res.status}).` };
    }
    return (await res.json()) as T | { error: string };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

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
  const [centerOpen, setCenterOpen] = useState(false);
  const scannedSig = useRef<string>("");
  const scanRunId = useRef(0);

  // The content tab dispatches this when the loaded course changes.
  useEffect(() => {
    const onCourseChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ courseUrl?: string }>).detail;
      setCourseUrl(detail?.courseUrl ?? localStorage.getItem(CONTENT_URL_KEY) ?? "");
    };
    window.addEventListener("ta-course-changed", onCourseChanged);
    return () => window.removeEventListener("ta-course-changed", onCourseChanged);
  }, []);

  const mergeItems = (incoming: ItemScan[]) =>
    setItems((prev) => {
      const next = { ...prev };
      for (const it of incoming) next[itemKey(it.type, it.id)] = it;
      return next;
    });

  const runScan = useCallback(async (url: string, inst: string) => {
    const runId = ++scanRunId.current;
    const aborted = () => scanRunId.current !== runId;
    const acronym = inst || undefined;
    setStatus("scanning");
    setItems({}); // clear the previous course's results while the new scan runs
    setLinkGroups({});
    setLinkStatus("idle");
    setError(undefined);

    // 1) Cheap lists (HTML items + files) and cached results — no downloads yet.
    const [list, filesResp] = await Promise.all([
      a11yApi<{ items: AccessibilityItemRef[]; cached: ItemScan[] }>("list-items", { courseUrl: url, acronym }),
      a11yApi<{ files: Array<{ id: number; title: string; kind: string; fingerprint: string }> }>("list-files", { courseUrl: url, acronym }),
    ]);
    if (aborted()) return;
    if ("error" in list) {
      setStatus("error");
      setError(list.error);
      return;
    }

    // 2) Seed cached (unchanged) items immediately; collect what needs scanning.
    const cachedByKey = new Map(list.cached.map((c) => [itemKey(c.type, c.id), c]));
    const seed: Record<string, ItemScan> = {};
    const toScan: Array<{ type: AccessibleItemType; id: string }> = [];
    for (const r of list.items) {
      const cached = cachedByKey.get(itemKey(r.type, r.id));
      if (cached && cached.fingerprint === r.fingerprint) seed[itemKey(r.type, r.id)] = cached;
      else toScan.push({ type: r.type, id: r.id });
    }
    const fileRefs = "error" in filesResp ? [] : filesResp.files;
    const filesToScan: typeof fileRefs = [];
    for (const f of fileRefs) {
      const cached = cachedByKey.get(`file:${f.id}`);
      if (cached && cached.fingerprint === f.fingerprint) seed[`file:${f.id}`] = cached;
      else filesToScan.push(f);
    }
    setItems(seed);

    // 3) Scan changed HTML items in small batches; badges fill in as each returns.
    for (let i = 0; i < toScan.length; i += 6) {
      if (aborted()) return;
      const res = await a11yApi<{ items: ItemScan[] }>("scan-batch", { courseUrl: url, acronym, items: toScan.slice(i, i + 6) });
      if (aborted()) return;
      if (!("error" in res)) mergeItems(res.items);
    }

    // 4) Scan changed files (downloads — smaller batches).
    for (let i = 0; i < filesToScan.length; i += 3) {
      if (aborted()) return;
      const res = await a11yApi<{ items: ItemScan[] }>("scan-files-batch", { courseUrl: url, acronym, files: filesToScan.slice(i, i + 3) });
      if (aborted()) return;
      if (!("error" in res)) mergeItems(res.items);
    }
    if (aborted()) return;
    setStatus("done");

    // 5) Pick up any already-completed link-validation run (a free GET, no new job).
    const lv = await a11yApi<{ state: string; links: BrokenLink[] }>("links-get", { courseUrl: url, acronym });
    if (!aborted() && !("error" in lv) && lv.state === "completed") {
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
  }, []);

  // Start a fresh link-validation run and poll until it completes (~2 min cap).
  const checkLinks = useCallback(async () => {
    if (!hasCourseId(courseUrl)) return;
    setLinkStatus("running");
    const started = await a11yApi<{ ok: true }>("links-start", { courseUrl, acronym: institution || undefined });
    if ("error" in started) {
      setLinkStatus("error");
      return;
    }
    for (let i = 0; i < 40; i += 1) {
      await sleep(3000);
      const lv = await a11yApi<{ state: string; links: BrokenLink[] }>("links-get", { courseUrl, acronym: institution || undefined });
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
      const result = await a11yApi<{ item: ItemScan }>("scan-item", { courseUrl, type, id, acronym: institution || undefined });
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
    setItems((prev) => {
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
    // Merge per-item scan issues (HTML pages + files) with broken-link issues,
    // recomputing counts.
    const merged: Record<string, ItemScan> = {};
    for (const [k, it] of Object.entries(items)) merged[k] = { ...it, issues: [...it.issues] };
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
      setFileScan,
      centerOpen,
      setCenterOpen,
    };
  }, [items, linkGroups, status, error, courseUrl, institution, linkStatus, rescanItem, rescanAll, checkLinks, setFileScan, centerOpen]);

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
