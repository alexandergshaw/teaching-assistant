// RULING 125: closes a live gap in resolveNarrationVoiceId
// (src/app/actions/media-voice.ts), the internal helper synthesizeNarrationAction
// and synthesizeLongNarrationAction use to pick which ElevenLabs voice narrates
// a request. Its env fallback (step 3 of "voiceIdOverride -> user_style.voice_id
// -> process.env.ELEVENLABS_VOICE_ID -> stock") had no check on the CALLING
// identity: any active signed-in account with no stored voice of their own,
// calling either action through its plain requireUser() guard, got narration
// synthesized in ELEVENLABS_VOICE_ID - the owner's own cloned voice
// (src/lib/supabase/auth.ts:295 names "the cloned voice/avatar" as owner-private
// alongside Canvas and GITHUB_TOKEN).
//
// This is NOT a guard swap (both actions correctly stay requireUser() - a
// non-owner with their OWN stored voice, or an explicit override, must keep
// working). The fix is containment AT THE READ SITE, the same shape
// resolveCanvasCredential uses (src/lib/canvas-credentials.ts:220 - the env
// fallback is gated on `identity.role === "owner"`): resolveNarrationVoiceId
// now takes the caller's role and only consults ELEVENLABS_VOICE_ID when it is
// literally "owner". Everyone else - and an owner with nothing configured -
// falls through to the pre-existing hard-coded stock voice id
// ("21m00Tcm4TlvDq8ikWAM"), unchanged from before this ruling.
//
// Executes the REAL guard and the REAL resolver: mocks the client
// ("@/lib/supabase/server") and the app-users lookup ("@/lib/supabase/app-users"),
// the idiom in src/lib/supabase/auth.test.ts:19-30, grading.guard.test.ts and
// visualizer.guard.test.ts - never a module mock of "@/lib/supabase/auth"
// itself, which would replace requireUser() with a stub and never run it.
// createServiceClient is mocked to a minimal fake `user_style` table reader so
// getUserStyle's own Supabase call resolves deterministically per test,
// without a real database. global.fetch is stubbed (tests here are
// network-blocked - vitest.setup.ts throws on any real fetch) so the
// ElevenLabs TTS call itself never reaches the network; only the voice id it
// was called with is asserted.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { requireAppOwner } from "@/lib/supabase/auth";
import { synthesizeNarrationAction, synthesizeLongNarrationAction } from "./media-voice";

const STOCK_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const OWNER_ENV_VOICE_ID = "owner-cloned-voice-id";

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

/** Minimal fake of the `user_style` table read getUserStyle performs:
 * `.from("user_style").select(...).eq("user_id", userId).maybeSingle()`.
 * `storedVoiceId` of `null` reproduces "no row for this caller" (the case
 * that must fall through to the env/stock steps). */
function makeFakeServiceClient(storedVoiceId: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: storedVoiceId
                ? {
                    voice_id: storedVoiceId,
                    voice_sample_path: null,
                    voice_sample_name: null,
                    writing_sample: null,
                  }
                : null,
              error: null,
            }),
        }),
      }),
    }),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

/** The voice id ElevenLabs' TTS endpoint was actually called with, read off
 * the URL path (`.../text-to-speech/{voiceId}`) fetchMock captured. */
function calledVoiceId(): string {
  const url = fetchMock.mock.calls[0]?.[0] as string;
  return url.split("/text-to-speech/")[1];
}

function mockSession(role: "owner" | "instructor", storedVoiceId: string | null) {
  vi.mocked(createClient).mockResolvedValue(makeFakeAuthClient("u1", "person@example.com") as never);
  vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "active", role }));
  vi.mocked(createServiceClient).mockReturnValue(makeFakeServiceClient(storedVoiceId) as never);
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createServiceClient).mockReset();
  vi.mocked(getAppUser).mockReset();
  vi.mocked(ensureAppUser).mockReset();
  vi.mocked(ensureAppUser).mockResolvedValue(fakeAppUserRow());

  vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  vi.stubEnv("ELEVENLABS_VOICE_ID", OWNER_ENV_VOICE_ID);

  fetchMock = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(0),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RULING 125 - resolveNarrationVoiceId's env fallback is owner-only", () => {
  it("REGRESSION GUARD (was RED before the fix): an active non-owner with no stored voice must NOT receive the owner's env-configured cloned voice", async () => {
    mockSession("instructor", null);

    const result = await synthesizeNarrationAction("Hello class.");

    expect("error" in result).toBe(false);
    expect(calledVoiceId()).not.toBe(OWNER_ENV_VOICE_ID);
    expect(calledVoiceId()).toBe(STOCK_VOICE_ID);
  });

  it("same gap, same non-vacuity, at synthesizeLongNarrationAction's call site", async () => {
    mockSession("instructor", null);

    const result = await synthesizeLongNarrationAction("Hello class, welcome back.");

    expect("error" in result).toBe(false);
    expect(calledVoiceId()).not.toBe(OWNER_ENV_VOICE_ID);
    expect(calledVoiceId()).toBe(STOCK_VOICE_ID);
  });

  it("POSITIVE CONTROL 1: an owner with no stored voice must STILL get the env-configured cloned voice", async () => {
    mockSession("owner", null);

    const result = await synthesizeNarrationAction("Hello class.");

    expect("error" in result).toBe(false);
    expect(calledVoiceId()).toBe(OWNER_ENV_VOICE_ID);
  });

  it("POSITIVE CONTROL 2: a non-owner with their OWN stored voice must still get theirs, never the owner's env voice", async () => {
    mockSession("instructor", "member-own-voice-id");

    const result = await synthesizeNarrationAction("Hello class.");

    expect("error" in result).toBe(false);
    expect(calledVoiceId()).toBe("member-own-voice-id");
  });

  it("POSITIVE CONTROL 3: an explicit override wins for a non-owner, exactly as before", async () => {
    mockSession("instructor", null);

    const result = await synthesizeNarrationAction("Hello class.", "override-voice-id");

    expect("error" in result).toBe(false);
    expect(calledVoiceId()).toBe("override-voice-id");
  });

  it("POSITIVE CONTROL 3b: an explicit override wins for an owner too, exactly as before", async () => {
    mockSession("owner", null);

    const result = await synthesizeNarrationAction("Hello class.", "override-voice-id");

    expect("error" in result).toBe(false);
    expect(calledVoiceId()).toBe("override-voice-id");
  });

  it("PC3-equivalent non-vacuity check: the same non-owner session the tests above admit into requireUser() is refused by requireAppOwner() - proves this suite exercises a real active/instructor identity, not a mis-built fake", async () => {
    mockSession("instructor", null);
    await expect(requireAppOwner()).rejects.toThrow();
  });
});
