import { beforeEach, describe, expect, it, vi } from "vitest";

// Targeted-mock idiom (live-messaging-enrollments.test.ts): the client and the
// app-users lookup are mocked so the REAL requireAppOwner runs. The auth module
// is never module-mocked. canvasFetch is mocked: no real socket.
const canvasFetch = vi.fn();
const resolveCanvasCredential = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(() => ({}) as never),
}));
vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});
vi.mock("@/lib/canvas-credentials", () => ({
  resolveCanvasCredential: (code: string) => resolveCanvasCredential(code),
}));
vi.mock("@/lib/canvas-fetch", () => ({
  canvasFetch: (...args: unknown[]) => canvasFetch(...args),
}));

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { probeLmsConnectivityAction } from "./connectivity-actions";

function row(role: "owner" | "instructor"): AppUserRow {
  return {
    id: "u1",
    email: "m@example.com",
    displayName: null,
    status: "active",
    role,
    approvedAt: null,
    approvedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    statusChangedAt: null,
    statusChangedBy: null,
    roleGrantedBy: null,
  };
}

function fakeAuthClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "u1", email: "m@example.com" } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
      },
    },
  };
}

const CREDENTIAL = {
  source: "env" as const,
  institution: "RIZE",
  baseUrl: "https://rize.example.edu",
  token: "1234~abcdefghij",
};

beforeEach(() => {
  vi.mocked(createClient).mockReset().mockResolvedValue(fakeAuthClient() as never);
  vi.mocked(createServiceClient).mockReset().mockReturnValue({} as never);
  vi.mocked(getAppUser).mockReset().mockResolvedValue(row("owner"));
  canvasFetch.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {},
    body: Buffer.from(JSON.stringify({ id: 1 })),
  });
  resolveCanvasCredential.mockReset().mockResolvedValue(CREDENTIAL);
});

describe("probeLmsConnectivityAction", () => {
  it("refuses a non-owner and dials nothing", async () => {
    vi.mocked(getAppUser).mockResolvedValue(row("instructor"));
    const result = await probeLmsConnectivityAction("RIZE");
    expect(result).toEqual({ kind: "not-authorized" });
    expect(canvasFetch).not.toHaveBeenCalled();
    expect(resolveCanvasCredential).not.toHaveBeenCalled();
  });

  it("probes for the owner and returns a scrubbed result", async () => {
    const result = await probeLmsConnectivityAction(" rize ");
    expect(resolveCanvasCredential).toHaveBeenCalledWith("RIZE");
    expect(canvasFetch).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.result.verdict).toBe("connected");
    expect(result.result.host).toBe("rize.example.edu");
    expect(result.result.runtime.node.startsWith("v")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL.token);
    expect(JSON.stringify(result)).not.toContain("https://");
  });

  it.each(["https://evil.example.com", "evil.example.com", "RI ZE", "", "A".repeat(40), "RIZE/../x", "1RIZE"])(
    "rejects non-code input without resolving or dialing: %s",
    async (input) => {
      const result = await probeLmsConnectivityAction(input);
      expect(result).toEqual({ kind: "invalid-input" });
      expect(resolveCanvasCredential).not.toHaveBeenCalled();
      expect(canvasFetch).not.toHaveBeenCalled();
    }
  );

  it("returns one no-detail result when the credential cannot be resolved", async () => {
    resolveCanvasCredential.mockRejectedValue(new Error("Canvas API token is not configured for RIZE."));
    const result = await probeLmsConnectivityAction("RIZE");
    expect(result).toEqual({ kind: "no-credential" });
    expect(canvasFetch).not.toHaveBeenCalled();
  });
});
