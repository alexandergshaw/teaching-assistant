// D6: an attended run must persist its run report exactly like a scheduled
// one does. The root cause was structural, not a logic bug: buildAttendedStepHelpers
// never set StepRunHelpers.saveRunReport at all (the field simply stayed
// undefined), which left the guard at runWorkflowUnattended's own
// saveRunReport call site (server-runner.ts, and now useWorkflowRun.ts too -
// see its own D6 comment) permanently false on this path. These tests pin
// that the field is now actually a callable function when a user/session is
// present (and still null when signed out, matching every other closure this
// factory builds) - reverting the saveRunReport block added to
// buildAttendedStepHelpers makes every "is a function" assertion below fail.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAttendedStepHelpers } from "./attended-step-helpers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

vi.mock("@/lib/recording-files", () => ({
  saveRecordingFile: vi.fn(async () => ({})),
  listRecordingFiles: vi.fn(async () => []),
  downloadRecordingFile: vi.fn(async () => new Blob()),
  extForFile: vi.fn(() => "bin"),
}));

vi.mock("@/lib/course-files", () => ({
  uploadCourseZip: vi.fn(),
  uploadCourseZipChunked: vi.fn(),
  uploadCourseFile: vi.fn(),
  removeCourseZip: vi.fn(),
  removeCourseZipObjects: vi.fn(),
}));

vi.mock("@/lib/institution-fields", () => ({ loadInstitutionFields: vi.fn() }));
vi.mock("@/lib/common-resources", () => ({ loadCommonResources: vi.fn() }));
vi.mock("@/lib/llm-provider", () => ({ getStoredProvider: () => "gemini" }));
vi.mock("./load-course-materials-attended", () => ({ loadCourseMaterialsAttended: vi.fn() }));
vi.mock("@/app/actions", () => ({
  appendCourseMaterialFileAction: vi.fn(),
  appendCourseCastletopFileAction: vi.fn(),
  appendCourseExportFileAction: vi.fn(),
}));

import { saveRecordingFile } from "@/lib/recording-files";

const fakeUser = { id: "user-1" } as User;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeSupabase = {} as SupabaseClient<any, "public", any>;

describe("buildAttendedStepHelpers - D6 saveRunReport", () => {
  beforeEach(() => {
    vi.mocked(saveRecordingFile).mockClear();
  });

  it("sets saveRunReport to a callable function when a user/session is present (was previously always undefined)", () => {
    const helpers = buildAttendedStepHelpers({
      user: fakeUser,
      supabase: fakeSupabase,
      activeInstitution: "MCC",
      workflowId: "wf-1",
      workflowName: "Course Build",
      workflowRunId: "run-1",
      loadCourseExportData: async () => null,
    });
    expect(typeof helpers.saveRunReport).toBe("function");
  });

  it("saveRunReport saves a Markdown file via saveRecordingFile with the same shape the unattended runner uses", async () => {
    const helpers = buildAttendedStepHelpers({
      user: fakeUser,
      supabase: fakeSupabase,
      activeInstitution: "MCC",
      workflowId: "wf-1",
      workflowName: "Course Build",
      workflowRunId: "run-1",
      loadCourseExportData: async () => null,
    });
    await helpers.saveRunReport!("Course Build report", "# Course Build\n\nbody");
    expect(saveRecordingFile).toHaveBeenCalledTimes(1);
    const [supabaseArg, userIdArg, blobArg, meta] = vi.mocked(saveRecordingFile).mock.calls[0];
    expect(supabaseArg).toBe(fakeSupabase);
    expect(userIdArg).toBe("user-1");
    expect(blobArg).toBeInstanceOf(Blob);
    expect(meta).toMatchObject({
      name: "Course Build report",
      kind: "file",
      mimeType: "text/markdown",
      fileExt: "md",
      source: "workflow",
      origin: "manual",
      workflowName: "Course Build",
      workflowId: "wf-1",
      workflowRunId: "run-1",
    });
  });

  it("is null when signed out (no user/session), matching every other closure this factory builds", () => {
    const helpers = buildAttendedStepHelpers({
      user: null,
      supabase: null,
      activeInstitution: null,
      workflowId: "wf-1",
      workflowName: "Course Build",
      workflowRunId: "run-1",
      loadCourseExportData: async () => null,
    });
    expect(helpers.saveRunReport).toBeNull();
  });
});
