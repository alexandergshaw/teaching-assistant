import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/app/actions/powerpoint-template-library", () => ({ getPowerPointTemplateLibraryAction: vi.fn(), reusePowerPointTemplateLibraryAction: vi.fn() }));
import { createServiceClient } from "@/lib/supabase/server";
import { getPowerPointTemplateLibraryAction, reusePowerPointTemplateLibraryAction } from "@/app/actions/powerpoint-template-library";
import { loadRepositoryTemplate } from "./repository-template-source";

const sourceId = "11111111-1111-1111-1111-111111111111";
const libraryId = "22222222-2222-2222-2222-222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createServiceClient).mockImplementation(() => {
    const filters: Record<string, string> = {};
    const query = { select: () => query, eq: (key: string, value: string) => { filters[key] = value; return query; }, maybeSingle: async () => ({ data: filters.user_id === "owner" && filters.id === sourceId ? { id: sourceId, file_name: "template.pptx", content: Buffer.from("authorized original").toString("base64") } : null, error: null }) };
    return { from: (name: string) => { expect(name).toBe("deck_template_files"); return query; } } as never;
  });
});
describe("server-owned original template resolution", () => {
  it("loads raw source bytes using the authenticated owner's ownership filter", async () => {
    const choice = { kind: "raw", sourceFileId: sourceId, name: "Template" } as const;
    expect(await loadRepositoryTemplate("owner", choice)).toEqual(Buffer.from("authorized original"));
    await expect(loadRepositoryTemplate("other-user", choice)).rejects.toThrow();
    expect(await loadRepositoryTemplate("owner", { kind: "own" })).toBeUndefined();
  });
  it("uses the same library resolution as download and refuses changed or inaccessible sources", async () => {
    const choice = { kind: "library", libraryId, sourceFileId: sourceId, name: "Library" } as const;
    vi.mocked(getPowerPointTemplateLibraryAction).mockResolvedValue({ library: { id: libraryId, sourceFileId: sourceId, name: "Library", updatedAt: "now" } } as never);
    vi.mocked(reusePowerPointTemplateLibraryAction).mockResolvedValue({ sourceFileId: sourceId });
    expect(await loadRepositoryTemplate("owner", choice)).toEqual(Buffer.from("authorized original"));
    vi.mocked(reusePowerPointTemplateLibraryAction).mockResolvedValue({ sourceFileId: "33333333-3333-3333-3333-333333333333" });
    await expect(loadRepositoryTemplate("owner", choice)).rejects.toThrow("TEMPLATE_SELECTION");
    vi.mocked(reusePowerPointTemplateLibraryAction).mockResolvedValue({ error: "unavailable" } as never);
    await expect(loadRepositoryTemplate("owner", choice)).rejects.toThrow("TEMPLATE_SELECTION");
  });
});
