/**
 * Stable content id for a rubric's text, moved out of rubric-bank.ts
 * (A39 wave 2, docs/a39-architecture.md section 5.2). rubric-bank.ts imports
 * getDbClient and the Supabase Database type; importing it into
 * src/lib/grade/engine.ts (which now stamps a run's rubricFingerprint at
 * every return site) would widen the engine's runtime import closure to
 * include a database client. This leaf keeps fingerprinting synchronous and
 * works in both browser uploads and server-side grading.
 *
 * rubric-bank.ts re-exports this function so every existing caller -
 * including its own upsert and rubric-bank.test.ts - is unchanged.
 */

import hash from "hash.js";
import { cleanText } from "@/lib/embedded/scaffold";

/** Stable content id for a rubric: hash of its whitespace-normalized text. */
export function rubricFingerprint(rubricText: string): string {
  const bytes = new TextEncoder().encode(cleanText(rubricText).toLowerCase());
  return hash.sha256().update(bytes).digest("hex");
}
