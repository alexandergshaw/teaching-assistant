// REPLY-SECTION MARKER (A8 Wave A, docs/a8-scoring-architecture.md section 5.1).
// A line whose trimmed, lowercased text begins with "replies" or "reply
// section" AND carries no "(number [pts|points|%])" parenthetical. Both
// criterion matchers in rubric.ts REQUIRE such a parenthetical, so a marker can
// never be read as a criterion, and a legacy "Replies (10 pts):" line (which
// has one) is still a criterion, not a marker.
//
// This file is a dependency-free leaf on purpose: a "use client" component
// (ReplySectionInsertField) imports it directly, and rubric.ts reaches
// lib/supabase/server, which the client-boundary runtime-graph test forbids.
// Keep it free of imports. rubric.ts re-exports both names.
export const CANONICAL_REPLY_MARKER = "Reply section:";

const REPLY_MARKER_START = /^(?:replies|reply section)\b/;
const POINTS_PARENTHETICAL = /\(\s*\d+(?:\.\d+)?\s*(?:pts?|points?|%)?\s*\)/i;

export function isReplySectionMarker(line: string): boolean {
  const text = line.trim().toLowerCase();
  if (!REPLY_MARKER_START.test(text)) return false;
  return !POINTS_PARENTHETICAL.test(text);
}
