import type { SupabaseAuthObserver } from "@/context/supabase-auth-observer";
import { createBundleAuthority } from "./single-zip-authority";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Browser wiring for the owner-only session endpoint; no storage is opened here. */
export function createSingleZipBrowserAuthority(observer: SupabaseAuthObserver) {
  return createBundleAuthority(observer, async () => {
    const signal = AbortSignal.timeout(10_000);
    const response = await fetch("/api/single-zip-owner-session", { method: "POST", credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store", signal });
    if (!response.ok || response.redirected || response.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !response.body) return null;
    const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const item = await reader.read(); if (item.done) break;
        size += item.value.byteLength; if (size > 1024) return null; parts.push(item.value);
      }
      const json = JSON.parse(await new Blob(parts as BlobPart[]).text()) as Record<string, unknown>;
      if (Object.keys(json).length !== 2 || typeof json.accountId !== "string" || typeof json.sessionId !== "string" || !UUID.test(json.accountId) || !UUID.test(json.sessionId)) return null;
      return { accountId: json.accountId, sessionId: json.sessionId };
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  });
}
