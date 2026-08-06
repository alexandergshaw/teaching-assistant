// jsonObjectSlice lives in its own dependency-free module (no imports at
// all) instead of src/app/actions/shared.ts because it is shared by both
// server actions AND plain "lib" modules that get imported from
// "use client" components (e.g. src/lib/textbook-recommendations.ts, pulled
// in by TextbookPhotoModal.tsx / RecommendTextbooksModal.tsx). shared.ts is
// a heavy action-support barrel that transitively imports "next/headers"
// (via src/app/actions/writing-style-block.ts -> src/lib/supabase/server.ts);
// importing jsonObjectSlice from that barrel anywhere reachable from client
// code drags the whole server-only chain into the browser bundle and fails
// the production build at compile time with:
//   "You're importing a module that depends on next/headers."
// Keeping this function here, with zero imports, guarantees it can never
// reintroduce that chain no matter what pulls it in.

/**
 * Extract the first JSON object from a text string, handling optional ```json fence.
 * Returns the substring from the first '{' to the last '}', or null if not found.
 */
export function jsonObjectSlice(text: string): string | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}
