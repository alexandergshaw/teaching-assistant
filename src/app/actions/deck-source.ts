"use server";

// A43-S: server-side half of the manual deck path's source intake
// (docs/a43-scope.md section 6.1). extractTextFromBuffer/ingestRepo both pull
// jszip/officeparser/network code, so - same shape as extractPptxSlidesAction
// (src/app/actions/media.ts) - the browser posts a base64 payload (or a bare
// repo reference) here rather than importing those extractors client-side.
//
// Deliberately reuses the existing extractors rather than writing a second
// one: extractTextFromBuffer (src/lib/office-extract.ts) already dispatches
// on 50 extensions, and ingestRepoAction (src/app/actions/github.ts) already
// turns a repo reference into a bounded text digest. This file only wires
// their output into normalizeDeckSource (src/lib/decks/deck-source.ts), the
// shape src/app/components/ppt-design/index.tsx's ctx expects.

// requireUser, not the deprecated requireOwner alias: that alias is literally
// `return requireUser()` (auth.ts:451-453), so it reads as an ownership check and
// performs a signed-in check. Backlog row R2 exists to retire it, and new call
// sites make that row bigger. These actions are correctly user-scoped: a deck is
// built from material the caller supplies, per-user, with no owner-only resource.
import { requireUser } from "@/lib/supabase/auth";
import { extractTextFromBuffer } from "@/lib/office-extract";
import { checkWireBudget } from "@/lib/upload-budget";
import { ingestRepoAction } from "./github";
import { normalizeDeckSource, type DeckSourceResult } from "@/lib/decks/deck-source";

/** Extract deck source materials from a dropped file's base64 bytes. */
export async function extractDeckSourceFileAction(
  name: string,
  base64: string
): Promise<DeckSourceResult | { error: string }> {
  await requireUser();

  if (!base64) return { error: "Choose a source file." };

  const sizeCheck = checkWireBudget(base64.length, "That source file");
  if (!sizeCheck.ok) {
    return { error: sizeCheck.error ?? "That source file is too large to upload in one request." };
  }

  const buffer = Buffer.from(base64, "base64");
  let text: string | null;
  try {
    text = await extractTextFromBuffer(name, buffer);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read that file." };
  }

  if (!text || !text.trim()) {
    return { error: "Could not extract any text from that file." };
  }

  return normalizeDeckSource(name, buffer.byteLength, text);
}

/** Extract deck source materials from a repo reference (owner/name or a github.com URL). */
export async function extractDeckSourceRepoAction(repoRef: string): Promise<DeckSourceResult | { error: string }> {
  await requireUser();

  const trimmed = repoRef.trim();
  if (!trimmed) return { error: "Enter a repository as owner/name or a github.com URL." };

  const result = await ingestRepoAction(trimmed);
  if ("error" in result) return result;

  if (!result.digest.text.trim()) {
    return { error: "That repository has no readable source to use as materials." };
  }

  return normalizeDeckSource(result.digest.fullName, Buffer.byteLength(result.digest.text, "utf-8"), result.digest.text);
}
