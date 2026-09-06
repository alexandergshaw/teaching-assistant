import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Mocks the two frozen contracts this module resolves credentials through:
 *   - getEffectiveIdentity (src/lib/supabase/effective-identity.ts) - a
 *     SIBLING wave's export, coded against by signature per this wave's
 *     brief. If that file does not exist on disk yet, `vi.mock`'s factory
 *     still fully replaces the module for this test run (vitest never reads
 *     the real file when a factory is supplied), so these tests do not
 *     depend on that wave having landed first - only `tsc --noEmit` does
 *     (see this change's own report).
 *   - getLmsCredentialSecret / recordLmsCredentialFailure
 *     (src/lib/lms-credentials.ts) - the already-shipped credential store.
 * Both are mocked at the module boundary rather than given a fake Supabase
 * client, matching E-ARCH6's own instruction for the 22 existing Canvas test
 * files: stub the identity/store boundary, let this module's own branching
 * logic run for real.
 */
vi.mock("./supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn(),
}));
vi.mock("./lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn(),
  recordLmsCredentialFailure: vi.fn(),
}));

import { resolveCanvasCredential, CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "./canvas-credentials";
import { getEffectiveIdentity } from "./supabase/effective-identity";
import { getLmsCredentialSecret, recordLmsCredentialFailure } from "./lms-credentials";

const mockGetEffectiveIdentity = vi.mocked(getEffectiveIdentity);
const mockGetLmsCredentialSecret = vi.mocked(getLmsCredentialSecret);
const mockRecordLmsCredentialFailure = vi.mocked(recordLmsCredentialFailure);

const OWNER_IDENTITY = { id: "owner-1", email: "owner@example.edu", role: "owner" as const, status: "active" as const };
const MEMBER_IDENTITY = {
  id: "member-1",
  email: "member@example.edu",
  role: "instructor" as const,
  status: "active" as const,
};

const ENV_KEYS = ["MCC_CANVAS_URL", "MCC_CANVAS_API_TOKEN", "ZZZ_CANVAS_URL", "ZZZ_CANVAS_API_TOKEN"];

function clearInstitutionEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

beforeEach(() => {
  vi.clearAllMocks();
  clearInstitutionEnv();
  mockRecordLmsCredentialFailure.mockResolvedValue(undefined);
});

afterEach(() => {
  clearInstitutionEnv();
  vi.useRealTimers();
});

describe("resolveCanvasCredential - stored branch (step 1, highest priority)", () => {
  it("returns the stored credential, both fields from that one row, when a row exists", async () => {
    mockGetEffectiveIdentity.mockResolvedValue(MEMBER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue({ baseUrl: "https://canvas.example.edu", token: "stored-token" });

    const result = await resolveCanvasCredential("zzz");

    expect(result).toEqual({
      source: "stored",
      institution: "ZZZ",
      baseUrl: "https://canvas.example.edu",
      token: "stored-token",
    });
  });

  it("resolves the identity from ambient state, never from a parameter (E-ARCH4)", async () => {
    mockGetEffectiveIdentity.mockResolvedValue(MEMBER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue({ baseUrl: "https://canvas.example.edu", token: "stored-token" });

    await resolveCanvasCredential("zzz");

    expect(mockGetEffectiveIdentity).toHaveBeenCalledTimes(1);
    expect(mockGetEffectiveIdentity).toHaveBeenCalledWith();
    expect(mockGetLmsCredentialSecret).toHaveBeenCalledWith(MEMBER_IDENTITY.id, "ZZZ");
  });

  it("normalizes the institution code (trim + uppercase) before every lookup", async () => {
    mockGetEffectiveIdentity.mockResolvedValue(MEMBER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue({ baseUrl: "https://canvas.example.edu", token: "t" });

    const result = await resolveCanvasCredential("  zzz  ");

    expect(mockGetLmsCredentialSecret).toHaveBeenCalledWith(MEMBER_IDENTITY.id, "ZZZ");
    expect(result.institution).toBe("ZZZ");
  });

  it("takes priority over the env fallback even for an owner identity", async () => {
    process.env.ZZZ_CANVAS_URL = "https://owner-env.example.edu";
    process.env.ZZZ_CANVAS_API_TOKEN = "owner-env-token";
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue({ baseUrl: "https://owner-stored.example.edu", token: "owner-stored-token" });

    const result = await resolveCanvasCredential("zzz");

    expect(result).toEqual({
      source: "stored",
      institution: "ZZZ",
      baseUrl: "https://owner-stored.example.edu",
      token: "owner-stored-token",
    });
  });

  it("never records a failure diagnostic when the stored row resolves", async () => {
    mockGetEffectiveIdentity.mockResolvedValue(MEMBER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue({ baseUrl: "https://canvas.example.edu", token: "t" });

    await resolveCanvasCredential("zzz");

    expect(mockRecordLmsCredentialFailure).not.toHaveBeenCalled();
  });
});

describe("resolveCanvasCredential - owner env fallback (step 2)", () => {
  it("returns the env-configured credential for an owner with no stored row", async () => {
    process.env.ZZZ_CANVAS_URL = "https://canvas.zzz.edu/";
    process.env.ZZZ_CANVAS_API_TOKEN = "  env-token  ";
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    const result = await resolveCanvasCredential("zzz");

    expect(result).toEqual({
      source: "env",
      institution: "ZZZ",
      baseUrl: "https://canvas.zzz.edu", // trailing slash trimmed
      token: "env-token", // whitespace trimmed
    });
  });

  it("E10 - reproduces canvas-core.ts's resolveInstitutionByCode result exactly for the preconfigured MCC host with only a token env var set", async () => {
    // canvas-core.ts's CANVAS_INSTITUTIONS hardcodes MCC -> canvas.mccneb.edu
    // so the owner's existing deployment resolves a base URL from just the
    // token env var, with no MCC_CANVAS_URL set at all. This is the exact
    // scenario E10 requires stay byte-identical after this migration.
    process.env.MCC_CANVAS_API_TOKEN = "owner-mcc-token";
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    const result = await resolveCanvasCredential("mcc");

    expect(result).toEqual({
      source: "env",
      institution: "MCC",
      baseUrl: "https://canvas.mccneb.edu",
      token: "owner-mcc-token",
    });
  });

  it("records an 'unreadable' diagnostic before falling through to the env branch", async () => {
    process.env.ZZZ_CANVAS_URL = "https://canvas.zzz.edu";
    process.env.ZZZ_CANVAS_API_TOKEN = "env-token";
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    await resolveCanvasCredential("zzz");

    expect(mockRecordLmsCredentialFailure).toHaveBeenCalledWith(OWNER_IDENTITY.id, "ZZZ", "unreadable");
  });
});

describe("resolveCanvasCredential - the one indistinguishable failure (E6/E7)", () => {
  it("throws CANVAS_CREDENTIAL_REQUIRED_MESSAGE for a completely unconfigured code, even for the owner", async () => {
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    await expect(resolveCanvasCredential("nope")).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  });

  it("throws the SAME message for a half-configured env (URL set, token missing)", async () => {
    process.env.ZZZ_CANVAS_URL = "https://canvas.zzz.edu";
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    await expect(resolveCanvasCredential("zzz")).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  });

  it("throws the SAME message for a half-configured env (token set, URL missing, no hardcoded host)", async () => {
    process.env.ZZZ_CANVAS_API_TOKEN = "env-token";
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    await expect(resolveCanvasCredential("zzz")).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  });

  it("throws the SAME message when the caller simply has no stored row and is not the owner", async () => {
    mockGetEffectiveIdentity.mockResolvedValue(MEMBER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    await expect(resolveCanvasCredential("zzz")).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  });

  it("throws literally the exported constant, so a catch-by-identity comparison at a UI surface actually matches", async () => {
    mockGetEffectiveIdentity.mockResolvedValue(MEMBER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    let caught: unknown;
    try {
      await resolveCanvasCredential("zzz");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  });
});

describe("resolveCanvasCredential - SEC13/E-REL4: the env fallback is gated on the IMPERSONATED identity's literal role", () => {
  it("a member's impersonated identity (role: instructor) never reaches the env branch, even when the owner's env is fully configured for that code", async () => {
    // Traces the exact scenario named in this change's report: a scheduled
    // workflow running as a member resolves an impersonated identity with
    // role "instructor". Even though the owner's env vars for this
    // institution are fully present, step 3 is refused and the member's own
    // run reaches only step 2 (their own row) - which does not exist here -
    // so it throws rather than ever touching the owner's token.
    process.env.ZZZ_CANVAS_URL = "https://owner-configured.example.edu";
    process.env.ZZZ_CANVAS_API_TOKEN = "owners-real-token";
    mockGetEffectiveIdentity.mockResolvedValue(MEMBER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    await expect(resolveCanvasCredential("zzz")).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
    // Never even attempted to read process.env under the member's identity in
    // a way that could leak the owner's token into a returned credential -
    // asserted by the outcome above rather than by inspecting env reads,
    // since the point is the RESULT never carries the owner's token.
  });

  it("treats an identity with no role at all (undefined) as non-owner - the literal-equality check, not a truthy check", async () => {
    process.env.ZZZ_CANVAS_URL = "https://owner-configured.example.edu";
    process.env.ZZZ_CANVAS_API_TOKEN = "owners-real-token";
    mockGetEffectiveIdentity.mockResolvedValue({ id: "no-role-1", email: "x@example.edu" });
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    await expect(resolveCanvasCredential("zzz")).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  });

  it("rejects a role value that merely contains the word owner-ish casing games - only the exact literal 'owner' string passes", async () => {
    process.env.ZZZ_CANVAS_URL = "https://owner-configured.example.edu";
    process.env.ZZZ_CANVAS_API_TOKEN = "owners-real-token";
    // @ts-expect-error - deliberately an invalid role value, proving the
    // check is `=== "owner"` and not a case-insensitive or substring match.
    mockGetEffectiveIdentity.mockResolvedValue({ id: "x", email: "x@example.edu", role: "Owner" });
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    await expect(resolveCanvasCredential("zzz")).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  });
});

describe("resolveCanvasCredential - E-REL1: the stored-credential read is bounded", () => {
  it("does not hang forever when the store never resolves - falls through within the 5s bound", async () => {
    vi.useFakeTimers();
    mockGetEffectiveIdentity.mockResolvedValue(MEMBER_IDENTITY);
    // A read that never settles - simulates the degraded-store case E-REL1
    // is about (postgrest-js retrying a timed-out select for up to ~39s).
    mockGetLmsCredentialSecret.mockReturnValue(new Promise(() => {}));

    const pending = resolveCanvasCredential("zzz");
    // Attach the rejection assertion IMMEDIATELY, in the same microtask the
    // promise was created in - Node flags a promise as an unhandled
    // rejection based on whether a handler was attached before the rejection
    // is observed, not merely before the test eventually awaits it. Awaiting
    // `expect(pending).rejects...` only after advancing the fake timers
    // (which is when the rejection actually happens) attaches the handler
    // too late and trips PromiseRejectionHandledWarning even though the test
    // itself still reports green.
    const assertion = expect(pending).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
    // Let the microtask queue drain once before advancing timers, so the
    // race's own promises are actually constructed and pending.
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_000);

    await assertion;
  });

  it("a timed-out read is NOT recorded as an 'unreadable' failure - the resolver cannot tell what actually happened", async () => {
    vi.useFakeTimers();
    mockGetEffectiveIdentity.mockResolvedValue(MEMBER_IDENTITY);
    mockGetLmsCredentialSecret.mockReturnValue(new Promise(() => {}));

    const pending = resolveCanvasCredential("zzz");
    // See the previous test for why the handler is attached before the
    // fake-timer advance rather than after.
    const settled = pending.catch(() => {});
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_000);
    await settled;

    expect(mockRecordLmsCredentialFailure).not.toHaveBeenCalled();
  });

  it("a healthy, fast read still reaches the owner env fallback normally (the timer does not fire early or block a resolved read)", async () => {
    vi.useFakeTimers();
    process.env.ZZZ_CANVAS_URL = "https://canvas.zzz.edu";
    process.env.ZZZ_CANVAS_API_TOKEN = "env-token";
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);

    const result = await resolveCanvasCredential("zzz");

    expect(result.source).toBe("env");
  });
});
