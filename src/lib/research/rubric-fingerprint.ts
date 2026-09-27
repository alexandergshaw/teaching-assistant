/**
 * Stable content id for a rubric's text, moved out of rubric-bank.ts
 * (A39 wave 2, docs/a39-architecture.md section 5.2). rubric-bank.ts imports
 * getDbClient and the Supabase Database type; importing it into
 * src/lib/grade/engine.ts (which now stamps a run's rubricFingerprint at
 * every return site) would widen the engine's runtime import closure to
 * include a database client. This leaf depends on nothing but node:crypto
 * and the text-cleaning helper, so engine.ts can import it directly.
 *
 * rubric-bank.ts re-exports this function so every existing caller -
 * including its own upsert and rubric-bank.test.ts - is unchanged.
 */

import { createHash } from "node:crypto";
import { cleanText } from "@/lib/embedded/scaffold";

/** Stable content id for a rubric: hash of its whitespace-normalized text. */
export function rubricFingerprint(rubricText: string): string {
  return createHash("sha256").update(cleanText(rubricText).toLowerCase()).digest("hex");
}
