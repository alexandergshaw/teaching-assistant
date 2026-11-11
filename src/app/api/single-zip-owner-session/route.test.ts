import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), claims: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: mocks.owner }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims } }) }));
vi.mock("@/lib/supabase/repo-feedback-request", () => ({ isSameOriginFeedbackRequest: (request: Request, url: URL) => request.headers.get("origin") === url.origin, hasEmptyFeedbackBody: async (request: Request) => !request.body }));
import { POST } from "./route";

const account = "11111111-1111-4111-8111-111111111111", session = "22222222-2222-4222-8222-222222222222";
const request = (origin = "https://app.test", suffix = "") => new Request(`https://app.test/api/single-zip-owner-session${suffix}`, { method: "POST", headers: { origin } });
describe("ZIP staging owner verification", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue({ id: account }); mocks.claims.mockResolvedValue({ data: { claims: { sub: account, session_id: session, exp: Math.floor(Date.now() / 1000) + 60 } }, error: null }); });
  it("returns the verified owner's exact session without caching", async () => {
    const response = await POST(request()); expect(response.status).toBe(200); expect(await response.json()).toEqual({ accountId: account, sessionId: session }); expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects a non-owner and never consults claims", async () => {
    mocks.owner.mockRejectedValue(new Error("denied")); expect((await POST(request())).status).toBe(401); expect(mocks.claims).not.toHaveBeenCalled();
  });
  it.each([{ sub: "other", session_id: session, exp: 4e9 }, { sub: account, session_id: "bad", exp: 4e9 }, { sub: account, session_id: session, exp: 1 }])("rejects invalid or mismatched verified claims", async (claims) => {
    mocks.claims.mockResolvedValue({ data: { claims }, error: null }); expect((await POST(request())).status).toBe(401);
  });
  it("refuses cross-origin and query-bearing requests before authentication", async () => {
    expect((await POST(request("https://other.test"))).status).toBe(403); expect((await POST(request("https://app.test", "?x=1"))).status).toBe(400); expect(mocks.owner).not.toHaveBeenCalled();
  });
});
