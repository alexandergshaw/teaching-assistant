/**
 * The per-institution connectivity probe
 * (docs/lms-connectivity-diagnostics-deep-scope.md, sections 4.9 and 7 AC-17/18).
 *
 * ONE read-only authenticated GET to /api/v1/users/self on a credential the
 * caller has ALREADY resolved, bounded to 10 seconds, with no retry. The result
 * says how far the request got (resolved, connected, secured, answered), what
 * the host replied, how long it took, and the runtime facts that decide whether
 * the pinnedLookup / autoSelectFamily defect (section 0.2) is live on this
 * deployment.
 *
 * NOTHING UNSCRUBBED LEAVES. The output carries a closed verdict, closed stage
 * names, a closed cause token, an allowlisted code token, numbers, the host
 * (host only - never a path, query or scheme) and two runtime facts. Never the
 * token, the base URL, a header or a response body. The owner-only gate and the
 * institution-CODE-only input live in the server action; this module takes a
 * credential and dials exactly its base URL, so it cannot be pointed anywhere
 * the credential does not already point.
 */
import net from "node:net";
import { canvasFetch } from "./canvas-fetch";
import {
  classifyNetworkFailure,
  describeFailureCause,
  sanitizeFailureCode,
  type CanvasFailureCause,
  type CanvasNetworkFailure,
} from "./canvas-network-failure";
import { classifyCanvasProbeOutcome } from "./lms-credential-probe-outcome";

/** The probe's bound. Same number as the E4 validation probe (E-REL2). */
export const CONNECTIVITY_PROBE_TIMEOUT_MS = 10_000;

export const CONNECTIVITY_VERDICTS = [
  "connected",
  "token-rejected",
  "not-canvas",
  "http-error",
  "refused-by-host-rules",
  "network",
] as const;

export type ConnectivityVerdict = (typeof CONNECTIVITY_VERDICTS)[number];

export type ConnectivityStage = "dns" | "connect" | "tls" | "http";

export interface ConnectivityRuntime {
  /** process.version, for example "v22.14.0". */
  node: string;
  /** net.getDefaultAutoSelectFamily(), or null when this Node does not expose it. */
  autoSelectFamily: boolean | null;
}

export interface ConnectivityProbeResult {
  institution: string;
  /** Host only (with a non-default port). Never a scheme, path or query. */
  host: string;
  source: "stored" | "env";
  verdict: ConnectivityVerdict;
  stagesReached: ConnectivityStage[];
  httpStatus?: number;
  latencyMs: number;
  /** Real time to the underlying failure, before the SEC9 padding. Network verdicts only. */
  failedAfterMs?: number;
  cause?: CanvasFailureCause;
  code?: string;
  /** "Likely meaning" copy. Never asserted as fact. */
  hint: string;
  runtime: ConnectivityRuntime;
}

/** The credential fields this module reads. Structurally satisfied by CanvasCredential. */
export interface ConnectivityProbeCredential {
  readonly institution: string;
  readonly baseUrl: string;
  readonly token: string;
  readonly source: "stored" | "env";
}

/** The runtime facts that decide whether the section 0.2 defect can be live. */
export function readConnectivityRuntime(): ConnectivityRuntime {
  let autoSelectFamily: boolean | null = null;
  try {
    const fn = (net as { getDefaultAutoSelectFamily?: () => boolean }).getDefaultAutoSelectFamily;
    if (typeof fn === "function") autoSelectFamily = fn();
  } catch {
    autoSelectFamily = null;
  }
  return { node: process.version, autoSelectFamily };
}

/** Stages reached for a transport failure, by the phase it failed in. PURE. */
export function stagesForPhase(phase: CanvasNetworkFailure["phase"]): ConnectivityStage[] {
  switch (phase) {
    case "dns":
      return [];
    case "connect":
      return ["dns"];
    case "tls":
      return ["dns", "connect"];
    case "request":
      return ["dns", "connect", "tls"];
    default:
      return ["dns", "connect", "tls", "http"];
  }
}

const ALL_STAGES: ConnectivityStage[] = ["dns", "connect", "tls", "http"];

const VERDICT_HINTS: Readonly<Record<Exclude<ConnectivityVerdict, "network">, string>> = {
  connected: "Likely meaning: this server can reach the host and the token is accepted.",
  "token-rejected": "Likely meaning: the host answered but refused this token; generate a new one.",
  "not-canvas": "Likely meaning: the host answered but does not look like Canvas; check the address.",
  "http-error": "Likely meaning: the host answered with an error status; it may be having a bad moment.",
  "refused-by-host-rules": "Likely meaning: this app refused to dial that address under its own host rules.",
};

/** Our own refusal text, stripped of anything URL- or token-shaped. PURE. */
function scrubReason(reason: string, token: string): string {
  let out = token ? reason.split(token).join("") : reason;
  out = out.replace(/[A-Za-z][A-Za-z0-9+.-]*:\/\/\S*/g, "").replace(/\s+/g, " ").trim();
  return out.slice(0, 200);
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "";
  }
}

/**
 * Probe one resolved credential. Never throws for a transport or host-rule
 * outcome (those are the result); a thrown canvasFetch bug is also folded into
 * a `network` verdict with cause `local-error` so the owner sees it.
 */
export async function probeCanvasConnectivity(
  credential: ConnectivityProbeCredential
): Promise<ConnectivityProbeResult> {
  const { institution, baseUrl, token, source } = credential;
  const host = hostOf(baseUrl);
  const runtime = readConnectivityRuntime();
  const base = { institution, host, source, runtime };
  const startedAt = Date.now();
  const elapsed = (): number => Math.max(0, Date.now() - startedAt);

  let result;
  try {
    result = await canvasFetch(
      `${baseUrl}/api/v1/users/self`,
      { timeoutMs: CONNECTIVITY_PROBE_TIMEOUT_MS },
      { token }
    );
  } catch {
    const cause: CanvasFailureCause = "local-error";
    return {
      ...base,
      verdict: "network",
      stagesReached: [],
      latencyMs: elapsed(),
      cause,
      hint: `Likely meaning: ${describeFailureCause(cause)}`,
    };
  }
  const latencyMs = elapsed();

  if (!result.ok && result.kind === "host-not-allowed") {
    const reason = scrubReason(result.reason, token);
    return {
      ...base,
      verdict: "refused-by-host-rules",
      stagesReached: [],
      latencyMs,
      hint: reason ? `${VERDICT_HINTS["refused-by-host-rules"]} ${reason}` : VERDICT_HINTS["refused-by-host-rules"],
    };
  }

  if (!result.ok) {
    const failure = result.failure;
    const cause = failure ? classifyNetworkFailure(failure) : "unknown-network";
    const code = failure ? sanitizeFailureCode(failure.code) : undefined;
    return {
      ...base,
      verdict: "network",
      stagesReached: failure ? stagesForPhase(failure.phase) : [],
      latencyMs,
      ...(failure ? { failedAfterMs: failure.failedAfterMs } : {}),
      cause,
      ...(code !== undefined ? { code } : {}),
      hint: `Likely meaning: ${describeFailureCause(cause)}`,
    };
  }

  const httpStatus = result.status;
  const outcome = classifyCanvasProbeOutcome({
    ok: true,
    status: result.status,
    bodyText: result.body.toString("utf8"),
  });
  let verdict: ConnectivityVerdict;
  if (outcome.kind === "verified") verdict = "connected";
  else if (outcome.kind === "rejected") verdict = "token-rejected";
  else if (httpStatus >= 200 && httpStatus < 300) verdict = "not-canvas";
  else verdict = "http-error";
  return {
    ...base,
    verdict,
    stagesReached: [...ALL_STAGES],
    httpStatus,
    latencyMs,
    hint: VERDICT_HINTS[verdict as Exclude<ConnectivityVerdict, "network">],
  };
}

/** What probeLmsConnectivityAction returns. Lives here, not in the "use server" file. */
export type ConnectivityActionResult =
  | { kind: "ok"; result: ConnectivityProbeResult }
  | { kind: "not-authorized" }
  | { kind: "invalid-input" }
  | { kind: "no-credential" };
