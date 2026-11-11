import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), claims: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({ requireAppOwner: mocks.owner }));
vi.mock("./server", () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims } }) }));
import { verifySingleZipOwnerSession } from "./single-zip-owner-session";
const expected = { accountId: "owner", sessionId: "session" };
describe("exact owner session binding", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue({ id: "owner" }); mocks.claims.mockResolvedValue({ data: { claims: { sub: "owner", session_id: "session", exp: Math.floor(Date.now() / 1000) + 60 } }, error: null }); });
  it("accepts only the current owner and signed session", async () => expect(await verifySingleZipOwnerSession(expected)).toBe(true));
  it("refuses a different owner before inspecting claims", async () => { mocks.owner.mockResolvedValue({ id: "other" }); expect(await verifySingleZipOwnerSession(expected)).toBe(false); expect(mocks.claims).not.toHaveBeenCalled(); });
  it.each([{ sub: "owner", session_id: "other", exp: 4e9 }, { sub: "other", session_id: "session", exp: 4e9 }, { sub: "owner", session_id: "session", exp: 1 }])("refuses a mismatched or expired claim", async (claims) => { mocks.claims.mockResolvedValue({ data: { claims }, error: null }); expect(await verifySingleZipOwnerSession(expected)).toBe(false); });
});
