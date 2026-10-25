import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseUrlState, buildUrlSearch, type UrlNavState } from "@/app/url-state";
import { buildInstitutionDirectoryDiagnostic } from "@/lib/institution-directory-diagnostics";
import { recordSessionDiagnosticEntry, readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests, buildSessionDiagnosticLog, formatSessionDiagnosticLogJson, formatSessionDiagnosticLogCsv } from "@/lib/session-diagnostic-log";

const panel = readFileSync(new URL("./InstitutionDirectoryTab.tsx", import.meta.url), "utf8");

describe("institution directory delivery seams", () => {
  it("round-trips the bookmarked Institutions destination", () => {
    const parsed = parseUrlState("?tab=courses&coursesSection=institutions");
    expect(parsed.coursesSection).toBe("institutions");
    expect(parseUrlState(buildUrlSearch(parsed as UrlNavState)).coursesSection).toBe("institutions");
  });

  it("remounts drafts and pending state for a different authenticated account and editor row", () => {
    expect(panel).toContain("client.auth.onAuthStateChange");
    expect(panel).toContain('<InstitutionDirectoryPanel key={account} />');
    expect(panel).toContain('key={`${editor?.profile.acronym ?? "new"}:${editorVersion}`}');
    expect(panel).toContain('account === "signed-out"');
    expect(panel).toContain("subscription.unsubscribe()");
  });

  it("keeps column management outside the empty-record branch and guards all editor switches", () => {
    expect(panel).toContain('{state.records.length === 0 && <p>No institutions yet.');
    expect(panel).not.toContain('state.records.length === 0 ?');
    expect(panel).toContain('onClick={() => openEditor(null)}');
    expect(panel.match(/onClick=\{\(\) => openEditor\(record\)\}/g)).toHaveLength(2);
    expect(panel).toContain('Save and continue');
    expect(panel).toContain('Discard changes');
    expect(panel).toContain('draftNavigation.stay');
  });

  it("distinguishes unset and unsafe saved LMS destinations without an active link", () => {
    expect(panel).toContain("LMS link not set");
    expect(panel).toContain("LMS link unavailable");
    expect(panel).toContain('lms.kind === "open" ? <a href={lms.href}');
    expect(panel).toContain('rel="noopener noreferrer"');
  });

  it.each(["success", "failure"] as const)("stores and exports %s directory events through the real session store", (outcome) => {
    resetSessionDiagnosticLogForTests("2026-10-25T00:00:00.000Z");
    recordSessionDiagnosticEntry(buildInstitutionDirectoryDiagnostic({
      at: "2026-10-25T00:00:01.000Z", operation: "list", outcome, target: "directory",
      ...(outcome === "failure" ? { reason: "unavailable" as const } : {}),
      metrics: { durationMs: 12, institutionCount: 0, columnCount: 2 },
    }));
    const state = readSessionDiagnosticLogState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ surface: "courses", operation: "institution_directory_list", outcome, detail: { target: "directory", institutionCount: 0, columnCount: 2 } });
    const log = buildSessionDiagnosticLog(state, { currentInstitution: "", currentCourse: "", currentPage: "/", browser: "test" }, "2026-10-25T00:00:02.000Z");
    expect(JSON.parse(formatSessionDiagnosticLogJson(log)).entries[0].outcome).toBe(outcome);
    expect(formatSessionDiagnosticLogCsv(log)).toContain(`Institutions,Load institution directory,,,${outcome}`);
    const exported = JSON.parse(formatSessionDiagnosticLogJson(log));
    expect(exported.coverage.instrumented.find((row: { surface: string }) => row.surface === "courses")?.covers).toContain("no institution labels, email addresses, destinations, custom values or credentials");
  });
});
