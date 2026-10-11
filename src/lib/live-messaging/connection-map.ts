/**
 * Maps the existing checkInstitutionsAction result onto the
 * InstitutionConnectionMap that connected-institutions.ts filters by
 * (LIVE-LMS-STUDENT-MESSAGING W3). An institution is "connected" only when the
 * action reports Canvas configured for it; an error or a missing entry leaves
 * it out (so it is not offered as a target).
 */

import type { LmsConnectionStatus } from "../courses-table-helpers";
import type { InstitutionConnectionMap } from "./connected-institutions";

export type InstitutionCheckResult =
  | { statuses: ReadonlyArray<{ acronym: string; canvasConfigured: boolean }> }
  | { error: string };

export function connectionMapFromCheck(result: InstitutionCheckResult): InstitutionConnectionMap {
  if ("error" in result) return {};
  const out: Record<string, LmsConnectionStatus> = {};
  for (const s of result.statuses) {
    out[s.acronym] = s.canvasConfigured
      ? { kind: "connected", needsGrading: 0, unread: 0 }
      : { kind: "not-linked" };
  }
  return out;
}
