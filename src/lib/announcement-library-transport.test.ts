import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { saveAnnouncementLibraryEntry } from "./announcement-exemplars";
import { deriveAnnouncementOutline } from "./announcement-outline";
import { parseAnnouncementLibraryInput } from "./announcement-library-input";

describe("announcement library SDK transport", () => {
  it("sends valid large Unicode body and legacy snapshot by fixed-URL POST payload", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const courseId = "22222222-2222-4222-8222-222222222222";
    const body = "界".repeat(10_000);
    const legacy = "old界".repeat(30_000);
    const input = parseAnnouncementLibraryInput({ id, courseId, exemplarText: body, label: "New",
      expected: { exemplarText: legacy, label: " legacy " } });
    expect(input).not.toBeNull();
    const sdkFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).not.toContain(body);
      expect(init?.method).toBe("POST");
      return new Response(JSON.stringify([{
      id, user_id: "session-user", course_id: courseId, exemplar_text: body, label: "New",
      outline: deriveAnnouncementOutline(body), created_at: "2026-10-25T00:00:00Z",
    }]), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createClient<Database>("https://example.supabase.co", "test-service-key", {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: sdkFetch },
    });
    expect((await saveAnnouncementLibraryEntry(client, "session-user", input!)).ok).toBe(true);
    expect(sdkFetch).toHaveBeenCalledTimes(1);
    const [url, init] = sdkFetch.mock.calls[0];
    expect(String(url)).toBe("https://example.supabase.co/rest/v1/rpc/update_announcement_library_entry");
    expect(String(url).length).toBeLessThan(200);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      p_id: id, p_user_id: "session-user", p_course_id: courseId, p_exemplar_text: body, p_label: "New",
      p_outline: deriveAnnouncementOutline(body), p_expected_text: legacy, p_expected_label: " legacy ",
    });
  });
});
