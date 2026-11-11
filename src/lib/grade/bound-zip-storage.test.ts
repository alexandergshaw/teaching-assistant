import { afterEach, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: create }));
import { boundZipStorage } from "./bound-zip-storage";
const expected = { accountId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222" };
const token = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
const client = (accessToken: string) => ({ auth: { getSession: async () => ({ data: { session: { access_token: accessToken } }, error: null }) } }) as never;
afterEach(() => { vi.unstubAllEnvs(); create.mockReset(); });
it("pins a matching token and stops returning it after cancellation", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  create.mockReturnValue({ storage: { from: vi.fn() } }); let current = true;
  const jwt = token({ sub: expected.accountId, session_id: expected.sessionId, exp: Date.now() / 1000 + 600 });
  let liveToken = jwt; const liveClient = { auth: { getSession: async () => ({ data: { session: { access_token: liveToken } }, error: null }) } } as never;
  expect(await boundZipStorage(liveClient, expected, () => current)).not.toBeNull();
  const callback = create.mock.calls[0][2].accessToken as () => Promise<string | null>;
  liveToken = token({ sub: expected.accountId, session_id: "different-session", exp: Date.now() / 1000 + 600 });
  expect(await callback()).toBe(jwt); current = false; expect(await callback()).toBeNull();
});
it("refuses mismatched, expired and malformed tokens before constructing storage", async () => {
  for (const jwt of [token({ sub: "other", session_id: expected.sessionId, exp: Date.now() / 1000 + 600 }), token({ sub: expected.accountId, session_id: "other", exp: Date.now() / 1000 + 600 }), token({ sub: expected.accountId, session_id: expected.sessionId, exp: 1 }), "bad"]) expect(await boundZipStorage(client(jwt), expected, () => true)).toBeNull();
  expect(create).not.toHaveBeenCalled();
});
