import { expect, it, vi } from "vitest";
import { createAnnouncementLibraryController, importAnnouncementLibraryFiles } from "./announcement-library-controller";
import { deriveAnnouncementOutline } from "@/lib/announcement-outline";
import { buildSessionDiagnosticLog, formatSessionDiagnosticLogCsv, formatSessionDiagnosticLogJson, readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
it("production controller operations reach the session JSON/CSV log without bodies, labels, filenames or raw errors", async () => {
  vi.useFakeTimers(); resetSessionDiagnosticLogForTests("2026-01-01T00:00:00Z");
  const marker = "PRIVATE_BODY_LABEL_FILENAME_SECRET_123";
  const entry = { id: "one", courseId: "course", exemplarText: marker, label: marker, outline: deriveAnnouncementOutline(marker), createdAt: "2026-01-01" };
  const save = vi.fn().mockRejectedValueOnce(Error(marker)).mockResolvedValue({ ok: true, value: entry });
  const c = createAnnouncementLibraryController("course", { list: async () => ({ ok: true, value: [entry] }), save, remove: async () => ({ ok: true, value: undefined }) }, () => {}, { debounceMs: 10, uuid: () => "imported" });
  await c.load(); c.edit("one", "exemplarText", `${marker} updated`); await vi.advanceTimersByTimeAsync(10); await c.retry("one");
  await importAnnouncementLibraryFiles(c, [{ name: `${marker}.html`, size: 3, text: async () => marker }]); await c.remove("one");
  const state = readSessionDiagnosticLogState();
  expect(state.entries.map(e => e.operation)).toEqual(expect.arrayContaining(["announcement_library_load", "announcement_library_save", "announcement_library_retry", "announcement_library_import", "announcement_library_delete"]));
  const log = buildSessionDiagnosticLog(state, { currentInstitution: "", currentCourse: "", currentPage: "/", browser: "test" }, "2026-01-01T00:00:01Z");
  for (const exported of [formatSessionDiagnosticLogCsv(log), formatSessionDiagnosticLogJson(log)]) {
    expect(exported).not.toContain(marker); expect(exported).toContain("Announcement library save"); expect(exported).toContain("unavailable");
  }
  c.dispose(); vi.useRealTimers();
});
