import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const owner = vi.hoisted(() => vi.fn());
const getClaims = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: owner }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims } }) }));
import { requireArchiveReviewPrincipal } from "./archive-review-principal";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const claims = () => ({ sub: OWNER, session_id: SESSION, role: "authenticated", aud: "authenticated", is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 60 });

beforeEach(() => { owner.mockReset().mockResolvedValue({ id: OWNER }); getClaims.mockReset().mockResolvedValue({ data: { claims: claims() }, error: null }); });

describe("verified archive review principal", () => {
  it("derives the owner and session from verified server auth", async () => {
    expect(await requireArchiveReviewPrincipal()).toEqual({ ownerId: OWNER, authSessionId: SESSION });
    expect(owner).toHaveBeenCalledOnce();
    expect(getClaims).toHaveBeenCalledOnce();
  });

  it("rejects unverifiable, cross-account, anonymous, expired or sessionless claims", async () => {
    for (const change of [{ sub: SESSION }, { session_id: "" }, { is_anonymous: true }, { exp: 1 }, { role: "anon" }, { aud: "other" }]) {
      getClaims.mockResolvedValueOnce({ data: { claims: { ...claims(), ...change } }, error: null });
      await expect(requireArchiveReviewPrincipal()).rejects.toThrow("unavailable");
    }
    getClaims.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    await expect(requireArchiveReviewPrincipal()).rejects.toThrow("unavailable");
    owner.mockRejectedValueOnce(new Error("denied"));
    await expect(requireArchiveReviewPrincipal()).rejects.toThrow("denied");
  });
});
