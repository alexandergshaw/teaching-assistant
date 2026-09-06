// Behavioural coverage for the per-user Canvas credential server actions
// (./lms-actions.ts). requireUser, the lms-credentials store, and the
// network-touching probe are all mocked; validateLmsBaseUrl,
// normalizeLmsBaseUrl, mayAttemptLmsCredentialSave and buildLmsCredentialRows
// are left REAL - each is a pure function with its own dedicated test suite,
// and exercising them for real here proves this file wires them together
// correctly rather than merely proving it calls a mock the way it was told
// to (the same choice src/app/account/people/actions.test.ts makes for
// canPerformAccountAction).
//
// Every test that exercises SEC9's rate limit uses its OWN, otherwise-unused
// user id: the fake attempt store below is module-scope state that persists
// across every `it` in this file, so a shared id across tests would let one
// test's attempts count against another's assertions.
//
// @/lib/lms-credential-save-attempts is mocked with a real in-memory
// implementation (not a bare vi.fn() stub) rather than driving the rate limit
// through a fake Supabase client here - that fuller fake belongs to
// lms-credential-save-attempts.test.ts, which owns proving the store's own
// contract (bounded, non-retrying, fails closed on a read error). This
// file's job is only to prove lms-actions.ts WIRES that store and the real
// mayAttemptLmsCredentialSave together correctly - allow/deny across the
// shared budget, and that a store failure is refused rather than let through
// - so a minimal fake that behaves like the real store on the happy path (and
// can be made to fail on command) is all it needs.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/lms-credentials", () => ({
  listLmsCredentials: vi.fn(),
  saveLmsCredential: vi.fn(),
  deleteLmsCredential: vi.fn(),
  getLmsCredentialSecret: vi.fn(),
  touchLmsCredentialUsed: vi.fn(),
  recordLmsCredentialFailure: vi.fn(),
}));

vi.mock("@/lib/lms-credential-probe", () => ({
  probeLmsCredential: vi.fn(),
}));

vi.mock("@/lib/lms-credential-save-attempts", () => {
  // A minimal, genuinely-filtering fake of the real store - see this file's
  // header for why a fuller Supabase-client fake is not duplicated here.
  const attemptsByUser = new Map<string, number[]>();
  let forceReadFailure = false;
  let forceRecordFailure = false;
  return {
    __attemptsByUser: attemptsByUser,
    __setForceReadFailure: (value: boolean) => {
      forceReadFailure = value;
    },
    __setForceRecordFailure: (value: boolean) => {
      forceRecordFailure = value;
    },
    getRecentLmsCredentialSaveAttempts: vi.fn(async (userId: string, sinceMs: number) => {
      if (forceReadFailure) return null;
      return (attemptsByUser.get(userId) ?? []).filter((t) => t >= sinceMs);
    }),
    recordLmsCredentialSaveAttempt: vi.fn(async (userId: string, nowMs: number, retentionMs: number) => {
      if (forceRecordFailure) {
        throw new Error("simulated write failure");
      }
      const history = (attemptsByUser.get(userId) ?? []).filter((t) => t >= nowMs - retentionMs);
      history.push(nowMs);
      attemptsByUser.set(userId, history);
    }),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { requireUser, type AuthorizedUser } from "@/lib/supabase/auth";
import {
  listLmsCredentials,
  saveLmsCredential,
  deleteLmsCredential,
  getLmsCredentialSecret,
  touchLmsCredentialUsed,
  recordLmsCredentialFailure,
} from "@/lib/lms-credentials";
import { probeLmsCredential } from "@/lib/lms-credential-probe";
import * as lmsCredentialSaveAttempts from "@/lib/lms-credential-save-attempts";
import { revalidatePath } from "next/cache";
import {
  saveLmsCredentialAction,
  checkLmsCredentialConnectionAction,
  deleteLmsCredentialAction,
  listLmsCredentialRowsAction,
} from "./lms-actions";

const mockRequireUser = vi.mocked(requireUser);
const mockListLmsCredentials = vi.mocked(listLmsCredentials);
const mockSaveLmsCredential = vi.mocked(saveLmsCredential);
const mockDeleteLmsCredential = vi.mocked(deleteLmsCredential);
const mockGetLmsCredentialSecret = vi.mocked(getLmsCredentialSecret);
const mockTouchLmsCredentialUsed = vi.mocked(touchLmsCredentialUsed);
const mockRecordLmsCredentialFailure = vi.mocked(recordLmsCredentialFailure);
const mockProbeLmsCredential = vi.mocked(probeLmsCredential);

// Cast through unknown: these two helpers exist only on the mock factory
// above, not on the real module's exported type surface.
const setForceReadFailure = (
  lmsCredentialSaveAttempts as unknown as { __setForceReadFailure: (value: boolean) => void }
).__setForceReadFailure;
const setForceRecordFailure = (
  lmsCredentialSaveAttempts as unknown as { __setForceRecordFailure: (value: boolean) => void }
).__setForceRecordFailure;

function actor(id: string): AuthorizedUser {
  return { id, email: `${id}@example.edu`, role: "instructor", status: "active" };
}

beforeEach(() => {
  vi.clearAllMocks();
  setForceReadFailure(false);
  setForceRecordFailure(false);
});

describe("every action requires an authenticated caller", () => {
  it("saveLmsCredentialAction returns not-authorized when requireUser throws", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("not signed in"));
    const result = await saveLmsCredentialAction({
      institution: "MCC",
      baseUrl: "https://canvas.example.edu",
      token: "1~abc",
    });
    expect(result).toEqual({ kind: "not-authorized" });
    expect(mockProbeLmsCredential).not.toHaveBeenCalled();
  });

  it("checkLmsCredentialConnectionAction returns not-authorized when requireUser throws", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("not signed in"));
    expect(await checkLmsCredentialConnectionAction("MCC")).toEqual({ kind: "not-authorized" });
  });

  it("deleteLmsCredentialAction returns not-authorized when requireUser throws", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("not signed in"));
    expect(await deleteLmsCredentialAction("MCC")).toEqual({ kind: "not-authorized" });
  });

  it("listLmsCredentialRowsAction returns not-authorized when requireUser throws", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("not signed in"));
    expect(await listLmsCredentialRowsAction()).toEqual({ kind: "not-authorized" });
  });
});

describe("saveLmsCredentialAction - our own code's refusals, before any network call", () => {
  beforeEach(() => {
    mockRequireUser.mockResolvedValue(actor("save-shape-user"));
  });

  it("refuses a blank institution without ever probing", async () => {
    const result = await saveLmsCredentialAction({ institution: "  ", baseUrl: "https://canvas.example.edu", token: "1~abc" });
    expect(result).toEqual({ kind: "invalid-input", reason: "Enter an institution code." });
    expect(mockProbeLmsCredential).not.toHaveBeenCalled();
  });

  it("refuses a blank token without ever probing", async () => {
    const result = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "   " });
    expect(result).toEqual({ kind: "invalid-input", reason: "Paste the Canvas access token you copied." });
    expect(mockProbeLmsCredential).not.toHaveBeenCalled();
  });

  it("refuses a loopback base URL via the real validateLmsBaseUrl, without ever probing", async () => {
    const result = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://127.0.0.1", token: "1~abc" });
    expect(result.kind).toBe("host-not-allowed");
    expect(mockProbeLmsCredential).not.toHaveBeenCalled();
  });

  it("refuses a non-https base URL via the real validateLmsBaseUrl, without ever probing", async () => {
    const result = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "http://canvas.example.edu", token: "1~abc" });
    expect(result.kind).toBe("host-not-allowed");
    expect(mockProbeLmsCredential).not.toHaveBeenCalled();
  });

  it("does not consume a rate-limit slot for a shape refusal - five real probes still succeed after five shape refusals", async () => {
    const id = "save-shape-does-not-count-user";
    mockRequireUser.mockResolvedValue(actor(id));
    for (let i = 0; i < 10; i++) {
      await saveLmsCredentialAction({ institution: "", baseUrl: "https://canvas.example.edu", token: "1~abc" });
    }
    mockProbeLmsCredential.mockResolvedValue({ kind: "unreachable" });
    const result = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "1~abc" });
    expect(result).toEqual({ kind: "unreachable" });
  });
});

describe("saveLmsCredentialAction - SEC9's rate limit", () => {
  it("allows five attempts and refuses the sixth within the window", async () => {
    const id = "save-rate-limit-user";
    mockRequireUser.mockResolvedValue(actor(id));
    mockProbeLmsCredential.mockResolvedValue({ kind: "unreachable" });

    for (let i = 0; i < 5; i++) {
      const result = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "1~abc" });
      expect(result).toEqual({ kind: "unreachable" });
    }

    const sixth = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "1~abc" });
    expect(sixth).toEqual({ kind: "rate-limited" });
    expect(mockProbeLmsCredential).toHaveBeenCalledTimes(5);
  });
});

describe("saveLmsCredentialAction / checkLmsCredentialConnectionAction - the rate limit fails CLOSED", () => {
  // These prove the WIRING in lms-actions.ts, not the store's own contract
  // (that lives in lms-credential-save-attempts.test.ts): a store failure -
  // in either direction it can fail - must be refused, never silently
  // allowed through to the network probe.
  it("save: refuses and never probes when the attempt history cannot be read", async () => {
    const id = `save-read-fails-${Math.random()}`;
    mockRequireUser.mockResolvedValue(actor(id));
    setForceReadFailure(true);

    const result = await saveLmsCredentialAction({
      institution: "MCC",
      baseUrl: "https://canvas.example.edu",
      token: "1~abc",
    });

    expect(result).toEqual({ kind: "rate-limited" });
    expect(mockProbeLmsCredential).not.toHaveBeenCalled();
  });

  it("save: refuses and never probes when a permitted attempt cannot be durably recorded", async () => {
    const id = `save-record-fails-${Math.random()}`;
    mockRequireUser.mockResolvedValue(actor(id));
    setForceRecordFailure(true);

    const result = await saveLmsCredentialAction({
      institution: "MCC",
      baseUrl: "https://canvas.example.edu",
      token: "1~abc",
    });

    expect(result).toEqual({ kind: "rate-limited" });
    expect(mockProbeLmsCredential).not.toHaveBeenCalled();
  });

  it("check-connection: refuses and never reads the stored secret when the attempt history cannot be read", async () => {
    const id = `check-read-fails-${Math.random()}`;
    mockRequireUser.mockResolvedValue(actor(id));
    setForceReadFailure(true);

    expect(await checkLmsCredentialConnectionAction("MCC")).toEqual({ kind: "rate-limited" });
    expect(mockGetLmsCredentialSecret).not.toHaveBeenCalled();
  });

  it("a healthy save after a forced read failure is cleared succeeds again - the failure does not permanently wedge this user", async () => {
    const id = `save-recovers-${Math.random()}`;
    mockRequireUser.mockResolvedValue(actor(id));
    mockProbeLmsCredential.mockResolvedValue({ kind: "unreachable" });

    setForceReadFailure(true);
    expect(
      await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "1~abc" })
    ).toEqual({ kind: "rate-limited" });

    setForceReadFailure(false);
    expect(
      await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "1~abc" })
    ).toEqual({ kind: "unreachable" });
  });
});

describe("saveLmsCredentialAction - the probe outcome, and never storing an unverified token", () => {
  beforeEach(() => {
    mockRequireUser.mockResolvedValue(actor(`save-outcome-${Math.random()}`));
  });

  it("rejected: does not call saveLmsCredential", async () => {
    mockProbeLmsCredential.mockResolvedValueOnce({ kind: "rejected" });
    const result = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "1~abc" });
    expect(result).toEqual({ kind: "rejected" });
    expect(mockSaveLmsCredential).not.toHaveBeenCalled();
  });

  it("not-canvas: does not call saveLmsCredential", async () => {
    mockProbeLmsCredential.mockResolvedValueOnce({ kind: "not-canvas" });
    const result = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "1~abc" });
    expect(result).toEqual({ kind: "not-canvas" });
    expect(mockSaveLmsCredential).not.toHaveBeenCalled();
  });

  it("host-not-allowed from the probe (a redirect refusal): reason passes through verbatim", async () => {
    mockProbeLmsCredential.mockResolvedValueOnce({
      kind: "host-not-allowed",
      reason: "That host redirected to a different host. The stored credential is only ever sent to the host you registered.",
    });
    const result = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "1~abc" });
    expect(result).toEqual({
      kind: "host-not-allowed",
      reason: "That host redirected to a different host. The stored credential is only ever sent to the host you registered.",
    });
    expect(mockSaveLmsCredential).not.toHaveBeenCalled();
  });

  it("unreachable: does not call saveLmsCredential", async () => {
    mockProbeLmsCredential.mockResolvedValueOnce({ kind: "unreachable" });
    const result = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "1~abc" });
    expect(result).toEqual({ kind: "unreachable" });
    expect(mockSaveLmsCredential).not.toHaveBeenCalled();
  });

  it("verified: saves with the normalized institution/base URL and the probe's own Canvas identity, then revalidates", async () => {
    mockProbeLmsCredential.mockResolvedValueOnce({ kind: "verified", canvasUserId: "42", canvasUserName: "Ada Lovelace" });
    const id = `save-verified-${Math.random()}`;
    mockRequireUser.mockResolvedValue(actor(id));

    const result = await saveLmsCredentialAction({
      institution: "  mcc  ",
      baseUrl: "https://Canvas.Example.edu/",
      token: "1~abc",
    });

    expect(result).toEqual({ kind: "verified" });
    expect(mockSaveLmsCredential).toHaveBeenCalledWith({
      userId: id,
      institution: "MCC",
      baseUrl: "https://canvas.example.edu",
      token: "1~abc",
      canvasUserId: "42",
      canvasUserName: "Ada Lovelace",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/account/integrations");
  });

  it("save-failed: the probe succeeded but the store threw - never worded like a Canvas-facing failure", async () => {
    mockProbeLmsCredential.mockResolvedValueOnce({ kind: "verified", canvasUserId: "42", canvasUserName: null });
    mockSaveLmsCredential.mockRejectedValueOnce(new Error("db exploded"));
    const result = await saveLmsCredentialAction({ institution: "MCC", baseUrl: "https://canvas.example.edu", token: "1~abc" });
    expect(result).toEqual({ kind: "save-failed" });
  });
});

describe("checkLmsCredentialConnectionAction", () => {
  beforeEach(() => {
    mockRequireUser.mockResolvedValue(actor(`check-${Math.random()}`));
  });

  it("refuses a blank institution", async () => {
    expect(await checkLmsCredentialConnectionAction("  ")).toEqual({
      kind: "invalid-input",
      reason: "Enter an institution code.",
    });
    expect(mockGetLmsCredentialSecret).not.toHaveBeenCalled();
  });

  it("reports not-found when there is no decryptable stored secret", async () => {
    mockGetLmsCredentialSecret.mockResolvedValueOnce(null);
    expect(await checkLmsCredentialConnectionAction("MCC")).toEqual({ kind: "not-found" });
    expect(mockProbeLmsCredential).not.toHaveBeenCalled();
  });

  it("verified: stamps last_used_at, does not touch the failure diagnostic", async () => {
    const id = `check-verified-${Math.random()}`;
    mockRequireUser.mockResolvedValue(actor(id));
    mockGetLmsCredentialSecret.mockResolvedValueOnce({ baseUrl: "https://canvas.example.edu", token: "1~abc" });
    mockProbeLmsCredential.mockResolvedValueOnce({ kind: "verified", canvasUserId: "42", canvasUserName: "Ada Lovelace" });

    const result = await checkLmsCredentialConnectionAction("mcc");

    expect(result).toEqual({ kind: "verified" });
    expect(mockTouchLmsCredentialUsed).toHaveBeenCalledWith(id, "MCC");
    expect(mockRecordLmsCredentialFailure).not.toHaveBeenCalled();
  });

  it("rejected: records the 'rejected' diagnostic", async () => {
    const id = `check-rejected-${Math.random()}`;
    mockRequireUser.mockResolvedValue(actor(id));
    mockGetLmsCredentialSecret.mockResolvedValueOnce({ baseUrl: "https://canvas.example.edu", token: "1~abc" });
    mockProbeLmsCredential.mockResolvedValueOnce({ kind: "rejected" });

    expect(await checkLmsCredentialConnectionAction("MCC")).toEqual({ kind: "rejected" });
    expect(mockRecordLmsCredentialFailure).toHaveBeenCalledWith(id, "MCC", "rejected");
    expect(mockTouchLmsCredentialUsed).not.toHaveBeenCalled();
  });

  it("unreachable: records the 'host_unreachable' diagnostic", async () => {
    const id = `check-unreachable-${Math.random()}`;
    mockRequireUser.mockResolvedValue(actor(id));
    mockGetLmsCredentialSecret.mockResolvedValueOnce({ baseUrl: "https://canvas.example.edu", token: "1~abc" });
    mockProbeLmsCredential.mockResolvedValueOnce({ kind: "unreachable" });

    expect(await checkLmsCredentialConnectionAction("MCC")).toEqual({ kind: "unreachable" });
    expect(mockRecordLmsCredentialFailure).toHaveBeenCalledWith(id, "MCC", "host_unreachable");
  });

  it("not-canvas: renders accurately but records no diagnostic - the enum has no faithful value for it", async () => {
    mockGetLmsCredentialSecret.mockResolvedValueOnce({ baseUrl: "https://canvas.example.edu", token: "1~abc" });
    mockProbeLmsCredential.mockResolvedValueOnce({ kind: "not-canvas" });

    expect(await checkLmsCredentialConnectionAction("MCC")).toEqual({ kind: "not-canvas" });
    expect(mockRecordLmsCredentialFailure).not.toHaveBeenCalled();
  });

  it("host-not-allowed: renders the reason verbatim and records no diagnostic", async () => {
    mockGetLmsCredentialSecret.mockResolvedValueOnce({ baseUrl: "https://canvas.example.edu", token: "1~abc" });
    mockProbeLmsCredential.mockResolvedValueOnce({
      kind: "host-not-allowed",
      reason: "That host resolved to a private or reserved address and cannot be used.",
    });

    expect(await checkLmsCredentialConnectionAction("MCC")).toEqual({
      kind: "host-not-allowed",
      reason: "That host resolved to a private or reserved address and cannot be used.",
    });
    expect(mockRecordLmsCredentialFailure).not.toHaveBeenCalled();
  });

  it("shares SEC9's rate limit with saveLmsCredentialAction's budget - the sixth check-connection attempt in the window is refused", async () => {
    const id = "check-rate-limit-user";
    mockRequireUser.mockResolvedValue(actor(id));
    mockGetLmsCredentialSecret.mockResolvedValue({ baseUrl: "https://canvas.example.edu", token: "1~abc" });
    mockProbeLmsCredential.mockResolvedValue({ kind: "unreachable" });

    for (let i = 0; i < 5; i++) {
      expect(await checkLmsCredentialConnectionAction("MCC")).toEqual({ kind: "unreachable" });
    }
    expect(await checkLmsCredentialConnectionAction("MCC")).toEqual({ kind: "rate-limited" });
  });
});

describe("deleteLmsCredentialAction", () => {
  beforeEach(() => {
    mockRequireUser.mockResolvedValue(actor(`delete-${Math.random()}`));
  });

  it("refuses a blank institution", async () => {
    expect(await deleteLmsCredentialAction("   ")).toEqual({ kind: "failed" });
    expect(mockDeleteLmsCredential).not.toHaveBeenCalled();
  });

  it("deletes the normalized institution and revalidates on success", async () => {
    const id = `delete-ok-${Math.random()}`;
    mockRequireUser.mockResolvedValue(actor(id));
    const result = await deleteLmsCredentialAction("  mcc ");
    expect(result).toEqual({ kind: "ok" });
    expect(mockDeleteLmsCredential).toHaveBeenCalledWith(id, "MCC");
    expect(revalidatePath).toHaveBeenCalledWith("/account/integrations");
  });

  it("reports failed, never throwing, when the store throws", async () => {
    mockDeleteLmsCredential.mockRejectedValueOnce(new Error("db exploded"));
    expect(await deleteLmsCredentialAction("MCC")).toEqual({ kind: "failed" });
  });
});

describe("listLmsCredentialRowsAction", () => {
  it("maps stored summaries into rows via the real view builder", async () => {
    mockRequireUser.mockResolvedValue(actor("list-user"));
    mockListLmsCredentials.mockResolvedValueOnce([
      {
        institution: "MCC",
        baseUrl: "https://canvas.example.edu",
        tokenLastFour: "1a2b",
        canvasUserId: "42",
        canvasUserName: "Ada Lovelace",
        lastVerifiedAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: null,
        lastFailureAt: null,
        lastFailureKind: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const result = await listLmsCredentialRowsAction();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      source: "stored",
      institution: "MCC",
      identityLabel: "Ada Lovelace",
      host: "canvas.example.edu",
      lastUsed: { kind: "never" },
      needsReentry: false,
    });
  });

  it("reports failed, never throwing, when the store throws", async () => {
    mockRequireUser.mockResolvedValue(actor("list-fail-user"));
    mockListLmsCredentials.mockRejectedValueOnce(new Error("db exploded"));
    expect(await listLmsCredentialRowsAction()).toEqual({ kind: "failed" });
  });
});
