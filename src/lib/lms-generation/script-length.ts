// The one source of truth for the lecture-script kind's requested length
// (docs/lms-script-generation-acceptance-criteria.md, S7/S12/S13). A leaf
// with no imports at all, so BOTH sides can use it without either depending
// on the other: the client owns the select that offers these options and the
// localStorage value behind it, and the server action resolves whatever
// arrives on the wire through the SAME function rather than trusting it.
//
// WHY A FIXED OPTION LIST AND NOT A FREE-TEXT NUMBER FIELD:
// generateLectureScriptAction accepts a targetMinutes only inside the range
// src/lib/lecture-script-bounds.ts defines (1-30 today) and REFUSES anything
// outside it. Every option below is inside that range, so this UI can never
// produce a refusal the instructor did not cause.
//
// `resolveScriptMinutes` re-checks MEMBERSHIP rather than merely range: a
// stored "7" would pass the action's own bounds, but is not an option this UI
// ever offered, so it is a stale or hand-edited value. Resolving it to the
// default keeps the select from rendering with nothing selected.
//
// HISTORY, because it explains why this file exists at all: the action used
// to answer an out-of-range value by silently substituting 5 rather than
// refusing, and steps.media.ts passed 50 - so that workflow step produced
// 5-minute scripts while its run form said "Default 50". This file was
// written to route around that. The action has since been fixed to refuse
// (see lecture-script-bounds.ts), so the routing-around is now belt and
// braces rather than the only defence - which is why it stays.

/** The lecture lengths the Generate group's select offers, in minutes and in
 * the order they appear. Every value is inside generateLectureScriptAction's
 * own 1-30 accepted range - see this file's header comment. */
export const SCRIPT_LENGTH_OPTIONS: readonly number[] = [5, 10, 15, 20, 30];

/** What an instructor gets without touching the select, and what any
 * unrecognised value resolves to. 15 minutes sits mid-range and matches the
 * length of a single module's worth of material. */
export const DEFAULT_SCRIPT_MINUTES = 15;

/**
 * Coerce anything - a number off the wire, a string read back out of
 * localStorage, null, undefined, or a value from a build that offered
 * different options - to one of SCRIPT_LENGTH_OPTIONS.
 *
 * Membership, not range: see this file's header comment for why a merely
 * in-range value is still replaced by the default. Numeric strings are
 * accepted because localStorage only ever returns strings, so the client's
 * read-on-init path and the server's wire-value path can share one function
 * instead of each writing their own half-equivalent parse.
 */
export function resolveScriptMinutes(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SCRIPT_MINUTES;
  return SCRIPT_LENGTH_OPTIONS.includes(value) ? value : DEFAULT_SCRIPT_MINUTES;
}
