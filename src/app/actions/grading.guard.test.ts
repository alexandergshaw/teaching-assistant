// R2 wave 1, sub-wave 7 (docs/r2-wave1-subwaves.md section 4, row SW7): the 20
// requireOwner() call sites in grading.ts (19 distinct action exports -
// draftZerosForMissingAction alone has two). Re-derived rather than
// inherited (the plan predicted ~2 restrictive / ~18 permissive) - this file
// is 3 restrictive / 16 permissive (17 call sites):
//
//   RESTRICTIVE (moved to requireAppOwner()):
//   - gradeAction and gradeOneSubmissionAction both reach canvasWorkToEntry
//     (src/lib/grade/extraction.ts), which calls fetchGradableRepoContent
//     when a submission's link looks like a GitHub repo - that function
//     imports getRepo/getRepoTree/getFileText/listCommits directly from
//     "../github" (src/lib/grade/repo-content.ts:19), the same uncontained
//     GitHub-PAT path RULING 108's grading-incremental.ts precedent traces
//     (action-guard-coverage-github-cohort.test.ts's GITHUB_FILES comment).
//   - runSubmissionCodeAction relays code execution through
//     src/lib/code-runner.ts's PISTON_API_KEY/PISTON_API_URL/WANDBOX_API_URL,
//     read directly from process.env with no per-caller containment (no
//     stored-credential lookup analogous to resolveCanvasCredential) - the
//     same "shared server secret" shape requireAppOwner()'s own doc comment
//     names GitHub for (src/lib/supabase/auth.ts:369-375), just a different
//     secret. The production file's own comment at that call site already
//     called this out: "relays code execution through the server's sandbox
//     credentials."
//
//   PERMISSIVE (stay requireUser(), each with a GITHUB_NOT_OWNER_ONLY entry
//   in action-guard-coverage-github-cohort.test.ts): every Canvas-reaching
//   permissive action here is contained by resolveInstitution /
//   resolveInstitutionByCode -> resolveCanvasCredential
//   (src/lib/canvas-credentials.ts:189), which reads the CALLING identity's
//   own stored credential first and only falls through to the owner's env
//   pair when that identity's own role is "owner" - the same containment
//   SW5/SW6 established. The rest touch only Supabase rows scoped to the
//   caller's own user.id, or only the LLM.
//
// This file has NO sibling *.test.ts that already hosts an executing guard
// for grading.ts (grading-checklist.test.ts, grading.budget.test.ts and
// grading.collisionRefusal.test.ts all module-mock "@/lib/supabase/auth"
// wholesale, stubbing the guard away - fixed in this same wave to mock the
// correct guard name per action, not converted into executing hosts). This
// *.guard.test.ts is the new executing-guard host: mocks the client
// ("@/lib/supabase/server") and the app-users lookup
// ("@/lib/supabase/app-users"), the idiom in
// src/lib/supabase/auth.test.ts:19-30 and github.test.ts - never a module
// mock of "@/lib/supabase/auth" itself, which would replace the guard with a
// stub and never run it.
//
// Every other import grading.ts makes is module-mocked so each action's own
// guard is the only thing under test: none of Canvas, GitHub, the LLM, the
// code-runner sandbox, or Supabase's service-role drafts table is ever
// reached for real. The three restrictive sites' own sensitive dependency
// (runSubmittedCode / fetchSubmissionDetail+canvasWorkToEntry / the Canvas
// metadata calls gradeAction would otherwise make) is asserted NOT called,
// proving the guard fires before any of it - not merely that the return
// value happens to match.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(() => ({}) as never),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

vi.mock("@/lib/grading-drafts", () => ({
  findPendingGradingDraftForWorkflow: vi.fn(),
  createGradingDraft: vi.fn(),
  listPendingGradingDrafts: vi.fn(),
  getGradingDraft: vi.fn(),
  markGradingDraftReviewed: vi.fn(),
  deleteGradingDraft: vi.fn(),
  updateGradingDraft: vi.fn(),
}));

vi.mock("@/lib/canvas", () => ({
  fetchCanvasWork: vi.fn(),
  canvasWorkToZipBase64: vi.fn(),
  fetchCanvasMeta: vi.fn(),
  fetchAssignmentPointsPossible: vi.fn(),
  getSpeedGraderUrl: vi.fn(),
  postCanvasGrades: vi.fn(),
  fetchSubmissionDetail: vi.fn(),
  listAssignmentNonSubmitters: vi.fn(),
  listAssignmentBriefsWithDue: vi.fn(),
}));

vi.mock("@/lib/canvas-core", () => ({
  resolveInstitution: vi.fn(),
}));

vi.mock("@/lib/grade", () => ({
  gradeSubmissions: vi.fn(),
  gradeCanvasUrl: vi.fn(),
  synthesizeFullCreditChecklist: vi.fn(),
  deriveFullCreditChecklist: vi.fn(),
  generateSampleAnswer: vi.fn(),
  extractStudentEntries: vi.fn(),
  extractCanvasEntries: vi.fn(),
  generateRubric: vi.fn(),
  gradeEntries: vi.fn(),
  canvasWorkToEntry: vi.fn(),
}));

vi.mock("@/lib/code-runner", () => ({
  runSubmittedCode: vi.fn(),
  attachCodeRuns: vi.fn(),
}));

vi.mock("@/lib/embedded-grader", () => ({
  buildEmbeddedRubric: vi.fn(),
  gradeEntriesEmbedded: vi.fn(),
  renderRubricText: vi.fn(),
  buildDiscussionRubric: vi.fn(),
  gradeDiscussion: vi.fn(),
  renderDiscussionRubric: vi.fn(),
}));

vi.mock("@/lib/research/rubric-bank", () => ({
  rememberRubric: vi.fn(),
}));

vi.mock("@/lib/grading-engine", () => ({
  gradeViaGradingEngine: vi.fn(),
  detectRubricSource: vi.fn(),
}));

vi.mock("@/lib/grade-zeros", () => ({
  buildZeroGradingEntry: vi.fn(),
}));

vi.mock("@/lib/grade/postable", () => ({
  checkRowPostability: vi.fn(),
}));

vi.mock("./grading-run-mapping", () => ({
  gradingApiToRun: vi.fn(),
}));

vi.mock("@/lib/upload-budget", () => ({
  checkFileWireBudget: vi.fn(),
}));

vi.mock("@/lib/grade/single-file-entry", () => ({
  classifyGradingUpload: vi.fn(),
  buildSingleFileEntry: vi.fn(),
}));

vi.mock("./grading-missing-submissions", () => ({
  parseCourseIdFromCanvasUrl: vi.fn(),
  parseSingleAssignmentId: vi.fn(),
  selectPastDueZeroableAssignmentIds: vi.fn(),
}));

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { requireAppOwner, OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";
import {
  findPendingGradingDraftForWorkflow,
  createGradingDraft,
  listPendingGradingDrafts,
  getGradingDraft,
  markGradingDraftReviewed,
  deleteGradingDraft,
  updateGradingDraft,
} from "@/lib/grading-drafts";
import {
  fetchCanvasMeta,
  postCanvasGrades,
  fetchSubmissionDetail,
  listAssignmentBriefsWithDue,
} from "@/lib/canvas";
import { resolveInstitution } from "@/lib/canvas-core";
import { deriveFullCreditChecklist, generateSampleAnswer, synthesizeFullCreditChecklist, canvasWorkToEntry } from "@/lib/grade";
import { runSubmittedCode } from "@/lib/code-runner";
import {
  parseCourseIdFromCanvasUrl,
  selectPastDueZeroableAssignmentIds,
} from "./grading-missing-submissions";
import {
  findPendingGradingDraftForWorkflowAction,
  fetchCanvasMetaAction,
  postCanvasGradesAction,
  saveGradingDraftAction,
  listMissingSubmissionsAction,
  draftZerosForMissingAction,
  listPendingGradingDraftsAction,
  getGradingDraftAction,
  markGradingDraftReviewedAction,
  deleteGradingDraftAction,
  updateGradingDraftPayloadAction,
  deriveAssignmentChecklistAction,
  postGradingDraftAction,
  runSubmissionCodeAction,
  pullSubmissionAction,
  gradeOneSubmissionAction,
  generateModelAnswerAction,
  gradeAction,
  generateFullCreditChecklistAction,
} from "./grading";

function fakeAppUserRow(overrides: Partial<AppUserRow> = {}): AppUserRow {
  return {
    id: "u1",
    email: "person@example.com",
    displayName: null,
    status: "active",
    role: "instructor",
    approvedAt: null,
    approvedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    statusChangedAt: null,
    statusChangedBy: null,
    roleGrantedBy: null,
    ...overrides,
  };
}

function makeFakeAuthClient(userId: string, email: string) {
  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: userId, email } },
          error: null,
        }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({
            data: { currentLevel: "aal1", nextLevel: "aal1" },
            error: null,
          }),
      },
    },
  };
}

const FAKE_SUBMISSION = {
  student: "A Student",
  userId: 1,
  text: "",
  files: [],
  url: "https://canvas.test/courses/1/assignments/2/submissions/1",
  canvasUrl: "https://canvas.test/courses/1/assignments/2",
  assignmentName: "Assignment",
  pointsPossible: 10,
} as never;

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createServiceClient).mockReset();
  vi.mocked(getAppUser).mockReset();
  vi.mocked(ensureAppUser).mockReset();
  vi.mocked(ensureAppUser).mockResolvedValue(fakeAppUserRow());
  vi.mocked(createClient).mockResolvedValue(makeFakeAuthClient("u1", "m@example.com") as never);
  vi.mocked(createServiceClient).mockReturnValue({} as never);
  vi.mocked(getAppUser).mockResolvedValue(
    fakeAppUserRow({ email: "m@example.com", status: "active", role: "instructor" })
  );

  vi.mocked(findPendingGradingDraftForWorkflow).mockReset().mockResolvedValue(null);
  vi.mocked(createGradingDraft).mockReset().mockResolvedValue({ id: "draft-1" } as never);
  vi.mocked(listPendingGradingDrafts).mockReset().mockResolvedValue([]);
  vi.mocked(getGradingDraft).mockReset().mockResolvedValue(null);
  vi.mocked(markGradingDraftReviewed).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(deleteGradingDraft).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(updateGradingDraft).mockReset().mockResolvedValue(undefined as never);

  vi.mocked(fetchCanvasMeta).mockReset().mockResolvedValue({ description: "", rubricText: "", linkedFileIds: [] });
  vi.mocked(postCanvasGrades).mockReset().mockResolvedValue({ posted: 0, failures: [], skipped: [] });
  vi.mocked(fetchSubmissionDetail).mockReset().mockResolvedValue(FAKE_SUBMISSION);
  vi.mocked(listAssignmentBriefsWithDue).mockReset().mockResolvedValue([]);
  vi.mocked(resolveInstitution).mockReset().mockResolvedValue({
    baseUrl: "https://canvas.test",
    token: "t",
    institution: { code: "TEST" },
  } as never);
  vi.mocked(parseCourseIdFromCanvasUrl).mockReset().mockReturnValue("1");
  vi.mocked(selectPastDueZeroableAssignmentIds).mockReset().mockReturnValue([]);

  vi.mocked(deriveFullCreditChecklist).mockReset().mockResolvedValue({ items: [] });
  vi.mocked(generateSampleAnswer).mockReset().mockResolvedValue("a sample answer");
  vi.mocked(synthesizeFullCreditChecklist).mockReset().mockResolvedValue([]);
  vi.mocked(canvasWorkToEntry).mockReset().mockResolvedValue({} as never);

  vi.mocked(runSubmittedCode).mockReset().mockResolvedValue(null);
});

const OWNER_ONLY_ERROR = { error: OWNER_ONLY_MESSAGE };

describe("grading.ts restrictive sites - R2 SW7 guard swap", () => {
  it("runSubmissionCodeAction rejects an active, signed-in non-owner with the owner-only message and never reaches the sandbox credentials - the guard actually runs, not a mocked stub", async () => {
    await expect(runSubmissionCodeAction([])).rejects.toThrow(OWNER_ONLY_MESSAGE);
    expect(runSubmittedCode).not.toHaveBeenCalled();
  });

  it("gradeOneSubmissionAction rejects an active, signed-in non-owner with the owner-only message and never reaches Canvas or canvasWorkToEntry's GitHub-PAT path", async () => {
    const result = await gradeOneSubmissionAction("ABC123", "1", "2", 3);
    expect(result).toEqual(OWNER_ONLY_ERROR);
    expect(fetchSubmissionDetail).not.toHaveBeenCalled();
    expect(canvasWorkToEntry).not.toHaveBeenCalled();
  });

  it("gradeAction rejects an active, signed-in non-owner with the owner-only message and never reaches Canvas, even with a canvasUrl supplied", async () => {
    const fd = new FormData();
    fd.set("canvasUrl", "https://canvas.test/courses/1/assignments/2");
    fd.set("provider", "gemini");
    const result = await gradeAction({ run: null, error: null }, fd);
    expect(result).toEqual({ run: null, error: OWNER_ONLY_MESSAGE });
    expect(fetchCanvasMeta).not.toHaveBeenCalled();
  });
});

describe("grading.ts permissive sites stay requireUser()", () => {
  it("findPendingGradingDraftForWorkflowAction admits an active, signed-in non-owner", async () => {
    const result = await findPendingGradingDraftForWorkflowAction("wf-1", "repos");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("fetchCanvasMetaAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await fetchCanvasMetaAction("https://canvas.test/courses/1/assignments/2");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("postCanvasGradesAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await postCanvasGradesAction("https://canvas.test/courses/1/assignments/2", []);
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("saveGradingDraftAction admits an active, signed-in non-owner", async () => {
    const result = await saveGradingDraftAction("summary", { runs: [] });
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listMissingSubmissionsAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listMissingSubmissionsAction({ courseUrl: "https://canvas.test/courses/1" });
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("draftZerosForMissingAction admits an active, signed-in non-owner at both of its two requireUser() call sites - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await draftZerosForMissingAction({ courseUrl: "https://canvas.test/courses/1" });
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listPendingGradingDraftsAction admits an active, signed-in non-owner", async () => {
    const result = await listPendingGradingDraftsAction();
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("getGradingDraftAction admits an active, signed-in non-owner", async () => {
    const result = await getGradingDraftAction("draft-1");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("markGradingDraftReviewedAction admits an active, signed-in non-owner", async () => {
    const result = await markGradingDraftReviewedAction("draft-1");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("deleteGradingDraftAction admits an active, signed-in non-owner", async () => {
    const result = await deleteGradingDraftAction("draft-1");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("updateGradingDraftPayloadAction admits an active, signed-in non-owner", async () => {
    const result = await updateGradingDraftPayloadAction("draft-1", { runs: [] });
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("deriveAssignmentChecklistAction admits an active, signed-in non-owner - calls only the LLM path", async () => {
    const result = await deriveAssignmentChecklistAction("Write a binary search tree.", "Correctness (100%)");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("postGradingDraftAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await postGradingDraftAction("draft-1");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("pullSubmissionAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await pullSubmissionAction("ABC123", "1", "2", 3);
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
    expect(fetchSubmissionDetail).toHaveBeenCalled();
  });

  it("generateModelAnswerAction admits an active, signed-in non-owner - calls only the LLM path", async () => {
    const result = await generateModelAnswerAction("Write a binary search tree.", "Correctness (100%)");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("generateFullCreditChecklistAction admits an active, signed-in non-owner - calls only the LLM path", async () => {
    const result = await generateFullCreditChecklistAction("Write a binary search tree.", "Correctness (100%)");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  // The direction this migration has not exercised until now (RULING 83's
  // permissive exception): a permissive site's own executing test must show
  // it would go RED if the site were later wrongly tightened to
  // requireAppOwner(). Rather than editing production source from inside a
  // test, this proves it directly - the SAME mocked session (active/
  // instructor, i.e. not owner) that every test above shows these 16 actions
  // admit is shown here to be refused by the real requireAppOwner(), which is
  // exactly what each of them would call if this file were ever edited to
  // move it into that guard. The sub-wave's own report separately records the
  // literal sabotage-and-restore (swap requireUser() to requireAppOwner() at
  // three permissive sites structurally different from each other, rerun
  // this file's admit tests, observe them go red, then restore).
  it("the same non-owner session all 16 permissive actions admit is refused by requireAppOwner() - proves the permissive/restrictive distinction is real, not vacuous", async () => {
    await expect(requireAppOwner()).rejects.toThrow(OWNER_ONLY_MESSAGE);
  });
});
