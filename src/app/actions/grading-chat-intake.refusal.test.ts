// CHAT-GRADING-DETAILED-DIAGNOSTICS WE, AC-20: every representative intake
// refusal carries a TYPED refusalClass (a frozen table) while its human-readable
// `reason` stays byte-identical to the literal the UI has always shown.
import { describe, it, expect, vi, beforeEach } from "vitest";

// The REAL requireAppOwner runs against a fake identity (no wholesale auth mock;
// see wholesale-auth-mock-population.structure.test.ts).
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(() => ({}) as never),
}));
vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});
vi.mock("@/lib/grade/extraction", () => ({
  ingestZipEntries: vi.fn(),
  extractCanvasEntries: vi.fn(),
  extractStudentEntries: vi.fn(),
}));
vi.mock("@/lib/grade/repo-content", () => ({ fetchGradableRepoContent: vi.fn() }));
vi.mock("@/lib/canvas-url", () => ({ detectCanvasUrlKind: vi.fn() }));
vi.mock("@/lib/upload-budget", async () => {
  const actual = await vi.importActual<typeof import("@/lib/upload-budget")>("@/lib/upload-budget");
  return { ...actual, checkFileWireBudget: vi.fn() };
});
vi.mock("@/lib/grade/single-file-entry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grade/single-file-entry")>("@/lib/grade/single-file-entry");
  return { ...actual, buildSingleFileEntry: vi.fn() };
});

import { createClient } from "@/lib/supabase/server";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { checkFileWireBudget } from "@/lib/upload-budget";
import { fetchGradableRepoContent } from "@/lib/grade/repo-content";
import { extractCanvasEntries } from "@/lib/grade/extraction";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import { buildSingleFileEntry } from "@/lib/grade/single-file-entry";
import { prepareChatSubmissionAction, prepareCompositeSubmissionAction } from "./grading-chat-intake";
import { INTAKE_REFUSAL_CLASSES, isIntakeRefusalClass } from "@/app/components/grading-chat/chatSubmissionIntake";

function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const OWNER_ROW: AppUserRow = {
  id: "u1",
  email: "m@example.com",
  displayName: null,
  status: "active",
  role: "owner",
  approvedAt: null,
  approvedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  statusChangedAt: null,
  statusChangedBy: null,
  roleGrantedBy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OWNER_EMAILS", "m@example.com");
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "u1", email: "m@example.com" } }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
    },
  } as never);
  vi.mocked(getAppUser).mockResolvedValue(OWNER_ROW);
  vi.mocked(checkFileWireBudget).mockReturnValue({ ok: true } as ReturnType<typeof checkFileWireBudget>);
  vi.mocked(detectCanvasUrlKind).mockReturnValue(null);
});

describe("prepareChatSubmissionAction - typed refusals (AC-20)", () => {
  it("no file", async () => {
    expect(await prepareChatSubmissionAction(form({ kind: "file" }))).toEqual({
      kind: "refused",
      reason: "No file was attached.",
      refusalClass: "no-file",
    });
  });

  it("over the wire budget keeps the budget's own words", async () => {
    vi.mocked(checkFileWireBudget).mockReturnValue({ ok: false, error: "BUDGET_WORDS" } as ReturnType<typeof checkFileWireBudget>);
    const out = await prepareChatSubmissionAction(form({ kind: "file", file: new File(["x"], "a.txt") }));
    expect(out).toEqual({ kind: "refused", reason: "BUDGET_WORDS", refusalClass: "over-wire-budget" });
  });

  it("unsupported type", async () => {
    const out = await prepareChatSubmissionAction(form({ kind: "file", file: new File(["x"], "a.exe") }));
    expect(out).toEqual({
      kind: "refused",
      reason: "This file type isn't supported for grading. Upload a text file, document, image, or a zip archive.",
      refusalClass: "unsupported-type",
    });
  });

  it("video: a valid container is pending, anything else is a bad format", async () => {
    const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0]);
    const ok = await prepareChatSubmissionAction(form({ kind: "file", file: new File([mp4], "a.mp4") }));
    const bad = await prepareChatSubmissionAction(form({ kind: "file", file: new File(["not a video at all"], "b.mp4") }));
    expect(ok.kind === "refused" && ok.refusalClass).toBe("video-pending");
    expect(bad.kind === "refused" && bad.refusalClass).toBe("video-bad-format");
  });

  it("unreadable single file", async () => {
    vi.mocked(buildSingleFileEntry).mockResolvedValue(null);
    const out = await prepareChatSubmissionAction(form({ kind: "file", file: new File(["x"], "a.txt") }));
    expect(out).toEqual({ kind: "refused", reason: "This file could not be read.", refusalClass: "unreadable-file" });
  });

  it("no url", async () => {
    expect(await prepareChatSubmissionAction(form({ kind: "url", url: "  " }))).toEqual({
      kind: "refused",
      reason: "No URL was provided.",
      refusalClass: "no-url",
    });
  });

  it("empty Canvas url", async () => {
    vi.mocked(detectCanvasUrlKind).mockReturnValue("assignment" as ReturnType<typeof detectCanvasUrlKind>);
    vi.mocked(extractCanvasEntries).mockResolvedValue({ entries: [], pointsPossible: null } as Awaited<ReturnType<typeof extractCanvasEntries>>);
    expect(await prepareChatSubmissionAction(form({ kind: "url", url: "https://c.example/courses/1/assignments/2" }))).toEqual({
      kind: "refused",
      reason: "Nothing to grade was found at this Canvas URL.",
      refusalClass: "canvas-empty",
    });
  });

  it("unreadable GitHub repo", async () => {
    vi.mocked(fetchGradableRepoContent).mockResolvedValue({ error: "gone" } as Awaited<ReturnType<typeof fetchGradableRepoContent>>);
    expect(await prepareChatSubmissionAction(form({ kind: "url", url: "https://github.com/octo/repo" }))).toEqual({
      kind: "refused",
      reason: "Could not read this GitHub repository: gone.",
      refusalClass: "github-unreadable",
    });
  });

  it("Drive folder", async () => {
    const out = await prepareChatSubmissionAction(form({ kind: "url", url: "https://drive.google.com/drive/folders/abc123" }));
    expect(out.kind === "refused" && out.refusalClass).toBe("drive-folder");
    expect(out.kind === "refused" && out.reason).toMatch(/^This is a Google Drive folder, which is not supported yet\./);
  });

  it("unsupported url", async () => {
    const out = await prepareChatSubmissionAction(form({ kind: "url", url: "https://example.com/page" }));
    expect(out.kind === "refused" && out.refusalClass).toBe("url-unsupported");
    expect(out.kind === "refused" && out.reason).toMatch(/Other web URLs are not supported yet\.$/);
  });

  it("unknown kind", async () => {
    expect(await prepareChatSubmissionAction(form({ kind: "nope" }))).toEqual({
      kind: "refused",
      reason: "This submission could not be read.",
      refusalClass: "unknown-kind",
    });
  });
});

describe("prepareCompositeSubmissionAction - typed refusals", () => {
  it("a bad part count is composite-parts", async () => {
    const out = await prepareCompositeSubmissionAction(form({ kind: "composite", student: "S", partCount: "0" }));
    expect(out.kind === "refused" && out.refusalClass).toBe("composite-parts");
  });

  it("a refused part carries its own class through, reason untouched", async () => {
    const out = await prepareCompositeSubmissionAction(
      form({ kind: "composite", student: "S", partCount: "1", "part.0.kind": "url", "part.0.url": "" })
    );
    expect(out).toEqual({ kind: "refused", reason: "No URL was provided.", refusalClass: "no-url" });
  });
});

describe("the closed vocabulary", () => {
  it("is exactly the frozen list and rejects anything else", () => {
    expect([...INTAKE_REFUSAL_CLASSES]).toEqual([
      "no-file", "over-wire-budget", "unsupported-type", "video-pending", "video-bad-format", "video-drive",
      "unreadable-file", "read-failed", "entry-too-large", "no-url", "canvas-empty", "canvas-failed",
      "github-unreadable", "drive-folder", "drive-sheets-slides", "drive-unsupported-type", "drive-failed",
      "url-unsupported", "composite-parts", "unknown-kind",
    ]);
    expect(isIntakeRefusalClass("Jane Smith")).toBe(false);
    expect(isIntakeRefusalClass(undefined)).toBe(false);
  });
});
