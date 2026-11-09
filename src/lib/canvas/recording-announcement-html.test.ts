import { describe, expect, it, vi } from "vitest";

vi.mock("../canvas-core", () => ({
  resolveCourse: vi.fn().mockResolvedValue({ courseId: "42", institution: {}, token: "token", baseUrl: "https://canvas.example" }),
  canvasError: vi.fn(),
  htmlToText: (html: string) => html.replace(/<[^>]*>/g, ""),
  textToHtml: vi.fn(),
}));
vi.mock("../canvas-fetch-response", () => ({
  canvasGet: vi.fn(),
  canvasRequest: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 7 }) }),
}));
import { canvasRequest } from "../canvas-fetch-response";
import { createAnnouncementFromSafeHtml } from "./announcements";

describe("recording announcement Canvas boundary", () => {
  it("posts the reviewed HTML, removing any active content at the server boundary", async () => {
    await createAnnouncementFromSafeHtml("https://canvas.example/courses/42", "Week", '<h2>Tasks</h2><p><strong>Read</strong></p><script>bad()</script>');
    const [, init] = vi.mocked(canvasRequest).mock.calls[0];
    const form = new URLSearchParams(init?.body as string);
    expect(form.get("message")).toBe("<h2>Tasks</h2><p><strong>Read</strong></p>");
    expect(form.get("title")).toBe("Week");
  });
});
