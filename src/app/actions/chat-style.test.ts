import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    getWritingStyleBlock: vi.fn(),
  };
});

import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./shared";
import { getChatToneStatusAction } from "./chat-style";

describe("getChatToneStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports active when getWritingStyleBlock returns a non-empty block", async () => {
    vi.mocked(requireOwner).mockResolvedValueOnce({ id: "owner-1", email: "owner@example.com" });
    vi.mocked(getWritingStyleBlock).mockResolvedValueOnce("\n\nMATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE...");

    const result = await getChatToneStatusAction();

    expect(result).toEqual({ active: true });
    expect(getWritingStyleBlock).toHaveBeenCalledWith("owner-1");
  });

  it("reports inactive when getWritingStyleBlock returns an empty block (no usable sample)", async () => {
    vi.mocked(requireOwner).mockResolvedValueOnce({ id: "owner-1", email: "owner@example.com" });
    vi.mocked(getWritingStyleBlock).mockResolvedValueOnce("");

    const result = await getChatToneStatusAction();

    expect(result).toEqual({ active: false });
  });

  it("reports inactive without throwing for an anonymous session (requireOwner rejects)", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authenticated"));

    const result = await getChatToneStatusAction();

    expect(result).toEqual({ active: false });
    expect(getWritingStyleBlock).not.toHaveBeenCalled();
  });

  it("reports inactive without throwing when getWritingStyleBlock itself rejects", async () => {
    vi.mocked(requireOwner).mockResolvedValueOnce({ id: "owner-1", email: "owner@example.com" });
    vi.mocked(getWritingStyleBlock).mockRejectedValueOnce(new Error("DB unreachable"));

    const result = await getChatToneStatusAction();

    expect(result).toEqual({ active: false });
  });
});
