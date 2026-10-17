import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/app-users", async original => ({ ...await original<typeof import("@/lib/supabase/app-users")>(), getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() }));
vi.mock("@/lib/presentations/repository-publish", () => ({ publisherLogin: vi.fn(), publishSnapshot: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/supabase/app-users";
import { publisherLogin, publishSnapshot } from "@/lib/presentations/repository-publish";
import { getPresentationPublisherAction, publishPresentationRepositoryAction } from "./presentation-repository";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "owner@example.test" } }, error: null }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) } } } as never);
  vi.mocked(getAppUser).mockResolvedValue({ id: "u1", email: "owner@example.test", role: "instructor", status: "active" } as never);
});
describe("owner-private snapshot actions", () => {
  it("runs the real owner guard before rendering or GitHub egress", async () => {
    expect(await getPresentationPublisherAction()).toHaveProperty("error");
    expect(await publishPresentationRepositoryAction(null, "deck", "owner")).toHaveProperty("error");
    expect(publisherLogin).not.toHaveBeenCalled();
    expect(publishSnapshot).not.toHaveBeenCalled();
  });
  it("allows owner account review and validates inputs before publication", async () => {
    vi.mocked(getAppUser).mockResolvedValue({ id: "u1", email: "owner@example.test", role: "owner", status: "active" } as never);
    vi.mocked(publisherLogin).mockResolvedValue("owner");
    expect(await getPresentationPublisherAction()).toEqual({ login: "owner" });
    expect(await publishPresentationRepositoryAction({ templateSelected: true }, "deck", "owner")).toHaveProperty("error");
    expect(publishSnapshot).not.toHaveBeenCalled();
  });
});
