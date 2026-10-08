// ZIP-BOMB-CAPS W1 (docs/zip-bomb-caps-scope.md), instrument I9b: a cap
// refusal reaching prepareGradingRunAction must route to mode "refused"
// (a dead end that starts nothing). A message without the "Refused: " prefix
// would land in mode "whole-run", whose consumer re-runs the whole extraction
// and so re-extracts the bomb. Mocks the model seam and, for the guard, only the
// cookie client ("@/lib/supabase/server") and the account-row lookup
// ("@/lib/supabase/app-users") so the REAL requireAppOwner() executes against a
// fake owner identity (RULING 138: never mock "@/lib/supabase/auth" wholesale;
// idiom of grading.guard.test.ts / submission-repo.guard.test.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { createClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { ZIP_MAX_MEMBER_DECLARED_BYTES } from "@/lib/zip-caps";
import { formatMB } from "@/lib/upload-budget";
import { prepareGradingRunAction } from "./grading-incremental";

function ownerRow(): AppUserRow {
  return {
    id: "owner-1",
    email: "owner@example.com",
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
}

function fakeOwnerAuthClient() {
  return {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: "owner-1", email: "owner@example.com" } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(fakeOwnerAuthClient() as never);
  vi.mocked(getAppUser).mockResolvedValue(ownerRow());
  vi.mocked(ensureAppUser).mockResolvedValue(ownerRow());
});

function patchFirstEntryUncompressed(archive: Uint8Array, value: number): void {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let eocd = -1;
  for (let i = archive.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  const first = view.getUint32(eocd + 16, true);
  view.setUint32(first + 24, value, true);
}

async function bombFormData(): Promise<FormData> {
  const zip = new JSZip();
  zip.file("ada_1_2_essay.txt", "tiny", { createFolders: false });
  const bytes = await zip.generateAsync({ type: "uint8array" });
  patchFirstEntryUncompressed(bytes, 200 * 1024 * 1024);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const formData = new FormData();
  formData.set("studentSubmissions", new File([buffer], "submissions.zip", { type: "application/zip" }));
  formData.set("provider", "gemini");
  formData.set("rubric", "1. Correctness (10 pts)");
  formData.set("assignmentInstructions", "Write an essay.");
  return formData;
}

describe("prepareGradingRunAction - zip caps (I9b)", () => {
  it("routes a cap refusal to mode 'refused' with the limit in the reason, and never calls the model", async () => {
    const result = await prepareGradingRunAction(await bombFormData());
    expect(result.mode).toBe("refused");
    if (result.mode !== "refused") throw new Error("unreachable");
    expect(result.reason.startsWith("Refused: ")).toBe(true);
    expect(result.reason).toContain(formatMB(ZIP_MAX_MEMBER_DECLARED_BYTES));
    expect(vi.mocked(callLlm)).not.toHaveBeenCalled();
  });
});
