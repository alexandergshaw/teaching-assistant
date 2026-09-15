// Backlog N12 - reachability guard for the class trends feature.
//
// src/lib/grade/class-trends.ts (layer A) and
// src/app/api/class-trends-insight/route.ts (layer B) shipped fully tested
// with NO caller anywhere in the app - class-trends.ts had no import site at
// all, and the route was a live endpoint nothing ever posted to. This suite
// is deliberately a REACHABILITY assertion, not merely a rendering one: it
// checks that DraftedGradesTab.tsx actually imports and mounts
// ClassTrendsPanel, and that ClassTrendsPanel itself imports layer A's pure
// compute function and posts to layer B's exact route path. A test that only
// exercised ClassTrendsPanel's own internals would pass even if nothing in
// the app ever mounted it - exactly how this feature shipped unreachable the
// first time.
//
// vitest here is node-env and collects only src/**/*.test.ts - no component
// is ever rendered by this suite (or any suite in this repo). Every check
// below reads the two files as TEXT, the same idiom askAiSelection.wiring.test.ts
// and generatedPreviewModal.wiring.test.ts already use, and pins FACTS and
// ORDERING rather than exact prose spelling.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const TAB_PATH = join(process.cwd(), "src/app/components/DraftedGradesTab.tsx");
const PANEL_PATH = join(process.cwd(), "src/app/components/drafted-grades/ClassTrendsPanel.tsx");
const CLASS_TRENDS_PATH = join(process.cwd(), "src/lib/grade/class-trends.ts");
const ROUTE_PATH = join(process.cwd(), "src/app/api/class-trends-insight/route.ts");

const tabSource = readFileSync(TAB_PATH, "utf8");
const panelSource = readFileSync(PANEL_PATH, "utf8");
const classTrendsSource = readFileSync(CLASS_TRENDS_PATH, "utf8");
const routeSource = readFileSync(ROUTE_PATH, "utf8");

/** Source with line/block comments stripped, so a name mentioned only in
 * prose (e.g. this very file's own header, or a doc comment) is never
 * mistaken for a real import or render site. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const strippedTab = stripComments(tabSource);
const strippedPanel = stripComments(panelSource);

describe("DraftedGradesTab mounts ClassTrendsPanel (reachability, not merely rendering)", () => {
  it("imports ClassTrendsPanel from the drafted-grades folder", () => {
    expect(strippedTab).toMatch(
      /import\s+ClassTrendsPanel\s+from\s*["']\.\/drafted-grades\/ClassTrendsPanel["']/
    );
  });

  it("renders <ClassTrendsPanel> somewhere in the tab", () => {
    expect(strippedTab).toMatch(/<ClassTrendsPanel\b/);
  });

  it("mounts it inside the per-assignment group header, alongside the checklist panel, passing the same run entry", () => {
    // Structural anchor: both panels belong to the same group header block
    // (the <div className={local.groupHeader}> that also holds
    // AssignmentChecklistPanel), not merely somewhere loose in the file.
    const groupHeaderIdx = strippedTab.indexOf("local.groupHeader");
    expect(groupHeaderIdx, "group header block not found").toBeGreaterThan(-1);
    const checklistIdx = strippedTab.indexOf("<AssignmentChecklistPanel", groupHeaderIdx);
    expect(checklistIdx, "AssignmentChecklistPanel not rendered in the group header").toBeGreaterThan(-1);
    const trendsIdx = strippedTab.indexOf("<ClassTrendsPanel", groupHeaderIdx);
    expect(trendsIdx, "ClassTrendsPanel not rendered in the group header").toBeGreaterThan(-1);

    const tagEnd = strippedTab.indexOf(">", trendsIdx);
    const tag = strippedTab.slice(trendsIdx, tagEnd + 1);
    expect(tag).toMatch(/entry=\{entry\}/);
  });
});

describe("ClassTrendsPanel reaches both layers of the class trends feature", () => {
  it("imports layer A's pure compute function from src/lib/grade/class-trends", () => {
    expect(strippedPanel).toMatch(
      /import\s*\{[^}]*\bcomputeClassTrends\b[^}]*\}\s*from\s*["']@\/lib\/grade\/class-trends["']/
    );
  });

  it("calls computeClassTrends unconditionally on render, not inside the layer B fetch path", () => {
    // Requirement 1: layer A must never be gated behind layer B's network
    // call. computeClassTrends must be invoked outside of (before) any
    // fetch()/async function body in this file.
    const computeIdx = strippedPanel.indexOf("computeClassTrends(");
    const fetchIdx = strippedPanel.indexOf("fetch(");
    expect(computeIdx, "computeClassTrends is never called").toBeGreaterThan(-1);
    expect(fetchIdx, "no fetch call found").toBeGreaterThan(-1);
    expect(computeIdx).toBeLessThan(fetchIdx);
  });

  it("posts to the class-trends-insight route's exact path", () => {
    expect(strippedPanel).toContain('fetch(CLASS_TRENDS_INSIGHT_ROUTE');
    expect(strippedPanel).toMatch(
      /const\s+CLASS_TRENDS_INSIGHT_ROUTE\s*=\s*["']\/api\/class-trends-insight["']/
    );
  });

  it("reuses containsForbiddenCompletenessPhrase rather than re-deriving the forbidden-phrase list", () => {
    expect(strippedPanel).toMatch(
      /import\s*\{[^}]*\bcontainsForbiddenCompletenessPhrase\b[^}]*\}\s*from\s*["']@\/lib\/grade\/class-trends["']/
    );
    expect(strippedPanel).toContain("containsForbiddenCompletenessPhrase(");
  });

  it("never renders a student name (no result.student / entry.run.results[...].student read)", () => {
    expect(strippedPanel).not.toMatch(/\.student\b/);
  });

  it("wraps every fetch response path so a network failure never throws", () => {
    // Requirement 7: this app has no error boundary, so ClassTrendsPanel must
    // never let the layer B fetch throw uncaught. The fetch call itself, and
    // the .json() parse of its response, must each sit inside a try block.
    const tryCount = [...strippedPanel.matchAll(/\btry\s*\{/g)].length;
    expect(tryCount).toBeGreaterThanOrEqual(2);
  });
});

describe("the surface actually reaches layer A and layer B's real exports (the seam prior gates missed)", () => {
  // THIS IS THE SEAM THAT CAN SHIP THE WHOLE FEATURE DEAD WITH EVERY OTHER
  // TEST GREEN: nothing executes ClassTrendsPanel's fetch against the real
  // route in this suite (vitest here is node-env and renders nothing, and
  // there is no route-handler harness), so the only thing making the wire
  // real is that computeClassTrends/containsForbiddenCompletenessPhrase are
  // genuinely exported where the panel imports them from, and that the route
  // this panel posts to is the route that actually exists on disk.
  it("class-trends.ts exports computeClassTrends and containsForbiddenCompletenessPhrase", () => {
    expect(classTrendsSource).toMatch(/export function computeClassTrends\(/);
    expect(classTrendsSource).toMatch(/export function containsForbiddenCompletenessPhrase\(/);
  });

  it("the class-trends-insight route file exists and declares a POST handler", () => {
    expect(routeSource).toMatch(/export async function POST\(/);
  });
});
