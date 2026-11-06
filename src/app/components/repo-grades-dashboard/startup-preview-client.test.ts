import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewRepoGradeStartupPlanAction } from "@/app/actions/repo-grades-dashboard";
import * as diagnostics from "@/lib/session-diagnostic-log";
import { loadRepoGradesStartupPreview } from "./startup-preview-client";

vi.mock("@/app/actions/repo-grades-dashboard", () => ({ previewRepoGradeStartupPlanAction: vi.fn() }));

const courseId = "private-course-id";
const accountId = "private-account-id";
type Preview = Extract<Awaited<ReturnType<typeof previewRepoGradeStartupPlanAction>>, { status: "preview" }>;
const preview = {
  status: "preview",
  discovery: { status: "scanned", enumerationComplete: true, incompleteSources: 0 },
  history: "complete",
  targetCount: 10_001,
  targets: [{
    repo: "private/repository", folder: "private-folder", sourceRef: "private-ref", commit: "private-sha",
    state: { status: "succeeded" },
  }],
} satisfies Preview;

const entry = {
  at: expect.any(String), surface: "grading", operation: "repo_grades_startup_preview",
  label: "repo_grades_startup_preview", course: "", institution: "", error: "",
  durationMs: expect.any(Number),
};

describe("startup plan preview diagnostics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    diagnostics.resetSessionDiagnosticLogForTests("2026-11-05T12:00:00.000Z");
  });

  it("records the round-trip duration and capped counts without logging the displayed targets", async () => {
    vi.mocked(previewRepoGradeStartupPlanAction).mockResolvedValue(preview);
    const clock = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(135);
    try {
      await expect(loadRepoGradesStartupPreview(courseId, accountId)).resolves.toEqual(preview);
      expect(previewRepoGradeStartupPlanAction).toHaveBeenCalledExactlyOnceWith(courseId, accountId);
      expect(diagnostics.readSessionDiagnosticLogState().entries).toEqual([{
        ...entry,
        outcome: "success",
        durationMs: 35,
        detail: { discoveryOutcome: "complete", historyOutcome: "complete", targetCount: 10_000, incompleteSourceCount: 0 },
      }]);
    } finally {
      clock.mockRestore();
    }
  });

  it.each([
    { complete: true, incompleteSources: 0, history: "unknown", cause: "unknown", discoveryOutcome: "complete" },
    { complete: true, incompleteSources: 2, history: "unknown", cause: "incomplete", discoveryOutcome: "incomplete" },
    { complete: false, incompleteSources: 2, history: "not-read", cause: "incomplete", discoveryOutcome: "incomplete" },
  ] as const)("reports $cause with discovery $discoveryOutcome and history $history", async ({
    complete, incompleteSources, history, cause, discoveryOutcome,
  }) => {
    vi.mocked(previewRepoGradeStartupPlanAction).mockResolvedValue({
      ...preview,
      discovery: { status: "scanned", enumerationComplete: complete, incompleteSources },
      history,
      targetCount: 0,
      targets: [],
    });
    await loadRepoGradesStartupPreview(courseId, accountId);
    expect(diagnostics.readSessionDiagnosticLogState().entries).toEqual([{
      ...entry,
      outcome: "failure",
      cause,
      detail: { discoveryOutcome, historyOutcome: history, targetCount: 0, incompleteSourceCount: incompleteSources },
    }]);
  });

  it.each([
    { discovery: { status: "not-configured" } },
    { discovery: { status: "blocked", reason: "rate-limited" } },
  ] as const)("records $discovery.status without a source count or the discovery reason", async ({ discovery }) => {
    vi.mocked(previewRepoGradeStartupPlanAction).mockResolvedValue({
      ...preview, discovery, history: "not-read", targetCount: 0, targets: [],
    });
    await loadRepoGradesStartupPreview(courseId, accountId);
    expect(diagnostics.readSessionDiagnosticLogState().entries).toEqual([{
      ...entry,
      outcome: "failure",
      cause: discovery.status,
      detail: { discoveryOutcome: discovery.status, historyOutcome: "not-read", targetCount: 0 },
    }]);
  });

  it.each([
    ["discovery-disabled", "disabled"],
    ["course-unavailable", "unavailable"],
    ["request-failed", "request-failed"],
  ] as const)("records %s without inventing phase outcomes", async (status, cause) => {
    if (status === "request-failed") {
      vi.mocked(previewRepoGradeStartupPlanAction).mockRejectedValue(new Error("private upstream response"));
    } else {
      vi.mocked(previewRepoGradeStartupPlanAction).mockResolvedValue({ status });
    }
    await expect(loadRepoGradesStartupPreview(courseId, accountId)).resolves.toEqual({
      status: status === "request-failed" ? "course-unavailable" : status,
    });
    expect(diagnostics.readSessionDiagnosticLogState().entries).toEqual([{ ...entry, outcome: "failure", cause }]);
  });

  it("returns the preview even if recording fails", async () => {
    vi.mocked(previewRepoGradeStartupPlanAction).mockResolvedValue(preview);
    const writer = vi.spyOn(diagnostics, "recordSessionDiagnosticEntry").mockImplementation(() => { throw new Error("writer failed"); });
    try {
      await expect(loadRepoGradesStartupPreview(courseId, accountId)).resolves.toEqual(preview);
      expect(writer).toHaveBeenCalledOnce();
    } finally {
      writer.mockRestore();
    }
  });
});
