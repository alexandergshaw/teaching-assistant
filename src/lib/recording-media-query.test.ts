import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { listRecordingMediaFiles } from "./recording-files";

function fake(pages: Array<Array<Record<string, unknown>>>, failure = false) {
  const calls: Array<[string, ...unknown[]]> = [];
  let n = 0;
  const client = { from(table: string) { calls.push(["from", table]); return {
    select(...a: unknown[]) { calls.push(["select", ...a]); return this; },
    eq(...a: unknown[]) { calls.push(["eq", ...a]); return this; },
    or(...a: unknown[]) { calls.push(["or", ...a]); return this; },
    order(...a: unknown[]) { calls.push(["order", ...a]); return this; },
    range(...a: unknown[]) { calls.push(["range", ...a]); return Promise.resolve({ data: pages[n++] ?? [], error: failure ? { message: "read failed" } : null }); },
  }; } };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}
function row(id: string, mime: string, ext = "webm") { return { id, name: id, kind: "file", mime_type: mime, size_bytes: 1, duration_sec: null, storage_path: `owner/${id}.${ext}`, source: null, origin: null, workflow_name: null, workflow_id: null, workflow_run_id: null, created_at: "2026-01-01" }; }
describe("paginated recording media query", () => {
  it("loads later pages, filters generic non-media, and scopes requests to owner", async () => {
    const first = Array.from({length: 200}, (_, i) => row(`doc-${i}`, "application/octet-stream", "pdf"));
    const {client, calls} = fake([first, [row("later", "video/mp4", "mp4")]]);
    const result = await listRecordingMediaFiles(client, "owner");
    expect(result.files.map(f => f.id)).toEqual(["later"]);
    expect(result.truncated).toBe(false);
    expect(calls.filter(c => c[0] === "range")).toEqual([["range", 0, 199], ["range", 200, 399]]);
    const query = String(calls.find(c => c[0] === "or")?.[1]);
    expect(query).toContain("mime_type.ilike.application/octet-stream%");
    expect(query).toContain("mime_type.ilike.binary/octet-stream%");
    expect(query).toContain("mime_type.ilike.application/ogg%");
    expect(calls.filter(c => c[0] === "eq")).toEqual([["eq", "user_id", "owner"], ["eq", "user_id", "owner"]]);
  });
  it("reports incomplete results at the bounded page limit", async () => {
    const page = Array.from({length: 200}, (_, i) => row(`file-${i}`, "video/webm"));
    const {client, calls} = fake(Array.from({length: 10}, () => page));
    expect((await listRecordingMediaFiles(client, "owner")).truncated).toBe(true);
    expect(calls.filter(c => c[0] === "range")).toHaveLength(10);
  });
  it("surfaces query errors", async () => { await expect(listRecordingMediaFiles(fake([], true).client, "owner")).rejects.toThrow("read failed"); });
});
