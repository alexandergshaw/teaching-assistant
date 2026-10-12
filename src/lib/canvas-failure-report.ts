/**
 * Builds the scrubbed diagnostic fields for a failed Canvas listing call
 * (docs/lms-connectivity-diagnostics-deep-scope.md, sections 4.4 and 4.5).
 *
 * Replaces the two private "describeAttemptedCanvasHost" helpers that used to
 * live in canvas-inbox.ts and repo-grades.ts.
 *
 * WHO SEES WHAT. The dialed host and the elapsed server time are shown to every
 * signed-in user (the host is the user's own configuration). The FINE transport
 * cause (connect-timeout, refused, certificate...) is OWNER-ONLY: for a
 * non-owner with a stored credential it would turn the picker into a port and
 * TLS scanner (SEC9), so a non-owner keeps today's flat message plus host.
 * HTTP-status causes come from app-composed text that every user already sees,
 * so they are not gated.
 *
 * NOTHING UNSCRUBBED CROSSES. The output carries only: a closed cause token, an
 * allowlisted code token, a phase enum, numbers, and a host. Never an
 * Error.message, URL, header or token (SEC4).
 */
import { resolveInstitutionByCode } from "@/lib/canvas-core";
import {
  CanvasTransportError,
  classifyNetworkFailure,
  describeFailureCause,
  sanitizeFailureCode,
  type CanvasFailurePhase,
} from "@/lib/canvas-network-failure";

export interface CanvasFailureDetail {
  /** Closed token: a CanvasFailureCause, or an http-* cause. */
  cause: string;
  /** Allowlisted error-code token, when transport captured one. */
  code?: string;
  phase?: CanvasFailurePhase;
  failedAfterMs?: number;
}

export interface CanvasFailureReport {
  error: string;
  attemptedHost: string | undefined;
  networkFailure?: CanvasFailureDetail;
  serverMs: number;
}

/**
 * PURE. Classify the app-composed HTTP-status text of canvasError()
 * (src/lib/canvas-core.ts). Returns undefined for any other text.
 */
export function classifyHttpCause(message: string): string | undefined {
  if (message.startsWith("Canvas rejected the request")) return "http-rejected";
  if (message.startsWith("Canvas could not find that resource")) return "http-404";
  const match = /\(HTTP (\d{3})\)/.exec(message);
  return match ? `http-${match[1]}` : undefined;
}

const HOST_SHAPE = /^[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/;

function safeHost(value: unknown): string | undefined {
  return typeof value === "string" && HOST_SHAPE.test(value) ? value : undefined;
}

/** The host this institution is configured to dial. Never throws: it runs on an
 * error path whose job is to explain a failure. */
async function resolveConfiguredHost(acronym: string): Promise<string | undefined> {
  try {
    const { baseUrl } = await resolveInstitutionByCode(acronym.trim().toUpperCase());
    return new URL(baseUrl).host || undefined;
  } catch {
    return undefined;
  }
}

export async function reportCanvasFailure(args: {
  err: unknown;
  acronym: string;
  isOwner: boolean;
  startedAtMs: number;
  fallbackMessage: string;
}): Promise<CanvasFailureReport> {
  const { err, acronym, isOwner, startedAtMs, fallbackMessage } = args;
  const base = err instanceof Error ? err.message : fallbackMessage;
  const failure = err instanceof CanvasTransportError ? err.failure : undefined;

  const carriedHost = safeHost(failure?.host);
  const host = carriedHost ?? (await resolveConfiguredHost(acronym));

  let detail: CanvasFailureDetail | undefined;
  let sentence = "";
  if (failure) {
    if (isOwner) {
      const cause = classifyNetworkFailure(failure);
      const code = sanitizeFailureCode(failure.code);
      sentence = ` ${describeFailureCause(cause)}`;
      detail = {
        cause,
        ...(code !== undefined ? { code } : {}),
        phase: failure.phase,
        failedAfterMs: failure.failedAfterMs,
      };
    }
  } else {
    const httpCause = classifyHttpCause(base);
    if (httpCause) detail = { cause: httpCause };
  }

  const text = `${base}${sentence}`;
  return {
    error: host ? `${text} (dialed ${host})` : text,
    attemptedHost: host,
    ...(detail ? { networkFailure: detail } : {}),
    serverMs: Math.max(0, Date.now() - startedAtMs),
  };
}
