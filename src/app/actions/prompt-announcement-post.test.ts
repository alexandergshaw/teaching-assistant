import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/canvas/announcements", () => ({
  createAnnouncementFromMarkdown: vi.fn(),
}));

import { createAnnouncementFromMarkdown } from "@/lib/canvas/announcements";
import { requireUser } from "@/lib/supabase/auth";
import { postPromptAnnouncementAction } from "./prompt-announcement-post";

beforeEach(() => {
  vi.mocked(createAnnouncementFromMarkdown).mockReset();
  vi.mocked(requireUser).mockReset();
  vi.mocked(requireUser).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
});

describe("AC-16: export shape", () => {
  it("the single export is `export async function` at column zero", () => {
    const source = readFileSync(join(process.cwd(), "src/app/actions/prompt-announcement-post.ts"), "utf8");
    const stripped = source.replace(/\/\*[^]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const exportLines = stripped.split("\n").filter((l) => /^export\b/.test(l.trim()));
    expect(exportLines.length).toBe(1);
    expect(exportLines[0].trim()).toMatch(/^export async function postPromptAnnouncementAction/);
  });
});

describe("postPromptAnnouncementAction", () => {
  it("passes all five arguments through to createAnnouncementFromMarkdown, including delayedPostAt", async () => {
    vi.mocked(createAnnouncementFromMarkdown).mockResolvedValue({
      id: 1,
      title: "T",
      message: "M",
      htmlUrl: null,
      author: null,
      postedAt: null,
      delayedPostAt: "2027-01-01T00:00:00.000Z",
    } as never);

    const result = await postPromptAnnouncementAction(
      "https://canvas.example/courses/1",
      "Title",
      "**Message**",
      "acr",
      "2027-01-01T00:00:00.000Z"
    );

    expect(createAnnouncementFromMarkdown).toHaveBeenCalledWith(
      "https://canvas.example/courses/1",
      "Title",
      "**Message**",
      "acr",
      "2027-01-01T00:00:00.000Z"
    );
    expect(result).toEqual({ announcement: expect.objectContaining({ id: 1 }) });
  });

  it("converts a thrown error into an error result", async () => {
    vi.mocked(createAnnouncementFromMarkdown).mockRejectedValue(new Error("boom"));
    const result = await postPromptAnnouncementAction("https://canvas.example/courses/1", "T", "M");
    expect(result).toEqual({ error: "boom" });
  });

  it("converts a requireUser rejection into an error result, never throws", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("not signed in"));
    const result = await postPromptAnnouncementAction("https://canvas.example/courses/1", "T", "M");
    expect(result).toEqual({ error: "not signed in" });
    expect(createAnnouncementFromMarkdown).not.toHaveBeenCalled();
  });
});
