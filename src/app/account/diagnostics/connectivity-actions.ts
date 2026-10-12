"use server";

// Owner-only on-demand LMS connectivity probe
// (docs/lms-connectivity-diagnostics-deep-scope.md, section 4.9, W3).
//
// requireAppOwner() (never the deprecated owner alias, which only checks sign-in)
// is the FIRST statement in the export's own body - the guard-coverage ratchet
// scans each export's text for it, and a non-owner gets { kind: "not-authorized" }
// with nothing dialed and nothing read.
//
// The input is an institution CODE, never a URL: the probe can only dial the
// host the owner's own credential already points at, so it is not a port
// scanner. ONE institution per call; the client loops, so no single call can
// approach the 60 s platform cap (about 5 s credential read + 10 s probe).
// No database write, no rate limiter (owner-only, owner hosts).

import { requireAppOwner } from "@/lib/supabase/auth";
import { resolveCanvasCredential } from "@/lib/canvas-credentials";
import { probeCanvasConnectivity, type ConnectivityActionResult } from "@/lib/canvas-connectivity-probe";

const INSTITUTION_CODE = /^[A-Z][A-Z0-9]{0,31}$/;

export async function probeLmsConnectivityAction(institutionInput: string): Promise<ConnectivityActionResult> {
  try {
    await requireAppOwner();
  } catch {
    return { kind: "not-authorized" };
  }

  const code = typeof institutionInput === "string" ? institutionInput.trim().toUpperCase() : "";
  if (!INSTITUTION_CODE.test(code)) {
    return { kind: "invalid-input" };
  }

  let credential;
  try {
    credential = await resolveCanvasCredential(code);
  } catch {
    // The single no-detail message rule (E6/E7): unknown, half-configured and
    // uncredentialed all look the same.
    return { kind: "no-credential" };
  }

  return { kind: "ok", result: await probeCanvasConnectivity(credential) };
}
