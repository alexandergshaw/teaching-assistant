// N15a Wave 1 (docs/n15-one-upload-per-student-scope.md section 3): the guard
// and entry-build contract of gradingOneUploadAction. Uses the MOCK-THE-CLIENT
// idiom grading.guard.test.ts uses (mock "@/lib/supabase/server" and
// "@/lib/supabase/app-users" so the REAL requireAppOwner() runs) - never a
// wholesale mock of "@/lib/supabase/auth", which would stub the guard away and
// grow the shrink-only wholesale-auth-mock canary.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(() => ({}) as never),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

vi.mock("@/lib/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gemini")>();
  return { ...actual, getGeminiInterRequestDelayMs: () => 4000 };
});

vi.mock("@/lib/grade/single-file-entry", () => ({
  classifyGradingUpload: vi.fn(),
  buildSingleFileEntry: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";
import { classifyGradingUpload, buildSingleFileEntry } from "@/lib/grade/single-file-entry";
import { VIDEO_BATCH_MESSAGE } from "@/lib/grade/video-grading";
import { gradingOneUploadAction } from "./grading-one-upload";

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
      getUser: () => Promise.resolve({ data: { user: { id: userId, email } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
      },
    },
  };
}

function formWith(overrides: { instructions?: string; file?: File | null } = {}): FormData {
  const fd = new FormData();
  fd.set("assignmentInstructions", overrides.instructions ?? "Grade it.");
  fd.set("provider", "gemini");
  const file = overrides.file === undefined ? new File(["scan bytes"], "scan.jpg") : overrides.file;
  if (file) fd.set("upload", file);
  return fd;
}

function asRole(role: "owner" | "instructor"): void {
  vi.mocked(createClient).mockResolvedValue(makeFakeAuthClient("u1", "m@example.com") as never);
  vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ email: "m@example.com", status: "active", role }));
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(getAppUser).mockReset();
  vi.mocked(classifyGradingUpload).mockReset().mockReturnValue("single");
  vi.mocked(buildSingleFileEntry)
    .mockReset()
    .mockResolvedValue({ student: "scan", content: "x", mergedFileCount: 1, submittedFiles: [] });
});

describe("gradingOneUploadAction - guard", () => {
  it("rejects an active, signed-in non-owner and never builds an entry", async () => {
    asRole("instructor");
    await expect(gradingOneUploadAction(formWith())).rejects.toThrow(OWNER_ONLY_MESSAGE);
    expect(buildSingleFileEntry).not.toHaveBeenCalled();
  });
});

describe("gradingOneUploadAction - as the owner", () => {
  beforeEach(() => asRole("owner"));

  it("returns the built entry and the server's inter-request delay", async () => {
    const result = await gradingOneUploadAction(formWith());
    expect(result).toEqual({
      ok: true,
      entry: { student: "scan", content: "x", mergedFileCount: 1, submittedFiles: [] },
      interRequestDelayMs: 4000,
    });
  });

  it("a typed label wins: marks the build labelled and becomes the student", async () => {
    const fd = formWith();
    fd.set("label", "  Ada Lovelace  ");
    const result = await gradingOneUploadAction(fd);
    expect(vi.mocked(buildSingleFileEntry).mock.calls[0][3]).toBe(true);
    expect(result.ok && result.entry.student).toBe("Ada Lovelace");
    expect(result.ok && result.entry.studentNameSource).toBe("filename");
  });

  it("a blank label leaves the build unlabelled and the inferred name untouched", async () => {
    const fd = formWith();
    fd.set("label", "   ");
    const result = await gradingOneUploadAction(fd);
    expect(vi.mocked(buildSingleFileEntry).mock.calls[0][3]).toBe(false);
    expect(result.ok && result.entry.student).toBe("scan");
  });

  it("refuses blank instructions with the byte-identical whole-run message, before building", async () => {
    const result = await gradingOneUploadAction(formWith({ instructions: "   " }));
    expect(result).toEqual({ ok: false, reason: "Please provide assignment instructions." });
    expect(buildSingleFileEntry).not.toHaveBeenCalled();
  });

  it("refuses a missing file", async () => {
    const result = await gradingOneUploadAction(formWith({ file: null }));
    expect(result.ok).toBe(false);
    expect(buildSingleFileEntry).not.toHaveBeenCalled();
  });

  it("refuses a zip, a video and an unsupported type without building", async () => {
    vi.mocked(classifyGradingUpload).mockReturnValueOnce("zip");
    const zip = await gradingOneUploadAction(formWith());
    expect(zip.ok).toBe(false);

    vi.mocked(classifyGradingUpload).mockReturnValueOnce("video");
    const video = await gradingOneUploadAction(formWith());
    expect(video).toEqual({ ok: false, reason: VIDEO_BATCH_MESSAGE });

    vi.mocked(classifyGradingUpload).mockReturnValueOnce("unsupported");
    const other = await gradingOneUploadAction(formWith());
    expect(other.ok).toBe(false);

    expect(buildSingleFileEntry).not.toHaveBeenCalled();
  });

  it("refuses a file whose text cannot be read", async () => {
    vi.mocked(buildSingleFileEntry).mockResolvedValueOnce(null);
    const result = await gradingOneUploadAction(formWith());
    expect(result.ok).toBe(false);
  });

  it("turns a builder throw into a refusal instead of a crash", async () => {
    vi.mocked(buildSingleFileEntry).mockRejectedValueOnce(new Error("corrupt"));
    const result = await gradingOneUploadAction(formWith());
    expect(result).toEqual({ ok: false, reason: "corrupt" });
  });
});
