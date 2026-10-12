/**
 * Pure, import-free leaf for the Canvas transport failure classification
 * (docs/lms-connectivity-diagnostics-deep-scope.md, sections 3 and 4.2).
 *
 * WHY THIS EXISTS. `canvasFetch` used to discard every network error and
 * report only "Canvas did not respond." That made a refused port, a DNS miss,
 * a firewall drop, a bad certificate and a local fault all look identical.
 * Transport now records three RAW FACTS - `phase`, `code`, `name` - and this
 * leaf maps them onto a closed set of causes. Nothing else crosses: no
 * `Error.message`, URL, header or token can enter a fact (the SEC4 rule that
 * the thrown text is a fixed literal still holds; the cause rides typed
 * fields).
 *
 * No imports on purpose: client-safe, and a source-text test can pin that
 * independently of the server graph. The error class lives here, not in
 * canvas-core.ts, because many tests partially mock canvas-core and an
 * `instanceof` against a symbol from a partially mocked module would throw.
 */

/** The stage a request had reached when it failed. */
export type CanvasFailurePhase = "dns" | "connect" | "tls" | "request" | "body";

/** The raw facts transport records. Never a message. */
export interface CanvasNetworkFacts {
  readonly phase: CanvasFailurePhase;
  /** Allowlisted error-code token, or absent. */
  readonly code?: string;
  /** Allowlisted error-name token, or absent. */
  readonly name?: string;
}

/** What an unreachable result carries: facts plus timing and the dialed host. */
export interface CanvasNetworkFailure extends CanvasNetworkFacts {
  /** Milliseconds from the call start to the REAL failure, before padding. */
  readonly failedAfterMs: number;
  /** Host (with a non-default port) of the URL dialed this hop; never path/query. */
  readonly host: string;
}

export const CANVAS_FAILURE_CAUSES = [
  "dns-unresolved",
  "dns-timeout",
  "connect-refused",
  "connect-unreachable",
  "connect-timeout",
  "tls-handshake-timeout",
  "tls-certificate",
  "tls-protocol",
  "response-timeout",
  "connection-reset",
  "response-oversize",
  "local-error",
  "unknown-network",
] as const;

export type CanvasFailureCause = (typeof CANVAS_FAILURE_CAUSES)[number];

const CODE_TOKEN = /^[A-Z][A-Z0-9_]{2,39}$/;
const NAME_TOKEN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** The whole scrub for a code: kept only if it is a plain upper-case token. */
export function sanitizeFailureCode(code: unknown): string | undefined {
  return typeof code === "string" && CODE_TOKEN.test(code) ? code : undefined;
}

function sanitizeFailureName(name: unknown): string | undefined {
  return typeof name === "string" && NAME_TOKEN.test(name) ? name : undefined;
}

/** Facts from a thrown value. Reads ONLY `.name` and `.code`; never `.message`. */
export function factsFromError(err: unknown, phase: CanvasFailurePhase): CanvasNetworkFacts {
  let rawCode: unknown;
  let rawName: unknown;
  if (typeof err === "object" && err !== null) {
    rawCode = (err as { code?: unknown }).code;
    rawName = (err as { name?: unknown }).name;
  }
  const code = sanitizeFailureCode(rawCode);
  const name = sanitizeFailureName(rawName);
  return {
    phase,
    ...(code !== undefined ? { code } : {}),
    ...(name !== undefined ? { name } : {}),
  };
}

const CERT_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/** PURE. Map facts onto exactly one member of the closed cause set. */
export function classifyNetworkFailure(facts: CanvasNetworkFacts): CanvasFailureCause {
  const { phase, code, name } = facts;

  if (code !== undefined && (CERT_CODES.has(code) || code.startsWith("UNABLE_TO_GET_ISSUER_CERT"))) {
    return "tls-certificate";
  }
  if (code === "EPROTO" || (code !== undefined && code.startsWith("ERR_SSL_"))) {
    return "tls-protocol";
  }
  if (code === "BYTE_CAP") {
    return "response-oversize";
  }

  // A timeout of whichever stage was in flight. Node raises the same
  // AbortError / ABORT_ERR for all three socket stages, so the phase is the
  // only thing that tells them apart.
  if (name === "AbortError" || code === "ABORT_ERR" || name === "DeadlineExceeded") {
    if (phase === "dns") return "dns-timeout";
    if (phase === "connect") return "connect-timeout";
    if (phase === "tls") return "tls-handshake-timeout";
    return "response-timeout";
  }

  if (phase === "dns") {
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "EAI_NONAME") return "dns-unresolved";
    if (code === "EAI_AGAIN") return "dns-timeout";
  }

  if (code === "ECONNREFUSED") return "connect-refused";
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "EADDRNOTAVAIL") {
    return "connect-unreachable";
  }
  if (code === "ETIMEDOUT") {
    return phase === "connect" ? "connect-timeout" : "connection-reset";
  }
  if (code === "ECONNRESET" || code === "EPIPE" || code === "ERR_STREAM_PREMATURE_CLOSE") {
    return "connection-reset";
  }

  if (name === "TypeError" || name === "RangeError" || (code !== undefined && code.startsWith("ERR_"))) {
    return "local-error";
  }
  return "unknown-network";
}

/**
 * Owner-facing sentence per cause. Each is appended after the fixed
 * "Canvas did not respond. " text, and `classifyChatSeamFailure` must still
 * read the result as "no response", so none of these may contain the words
 * that function tests earlier in its chain (time-out spellings, deadline,
 * aborted, limit, too many, too large, exceed, oversize, budget,
 * unsupported, could not read, collision). The behavioural pin is the
 * table-driven test in canvas-network-failure.test.ts.
 */
const CAUSE_COPY: Readonly<Record<CanvasFailureCause, string>> = {
  "dns-unresolved": "The server could not find that host name.",
  "dns-timeout": "The name lookup for that host never answered.",
  "connect-refused": "The host is reachable but nothing is listening on that port.",
  "connect-unreachable": "There is no network route from this server to that host.",
  "connect-timeout": "The host never answered the connection attempt; a firewall may be dropping this server.",
  "tls-handshake-timeout": "The connection opened but the secure handshake never finished.",
  "tls-certificate": "The host presented a certificate this server does not accept.",
  "tls-protocol": "The host did not speak a secure web protocol on that port.",
  "response-timeout": "The host accepted the request and never replied.",
  "connection-reset": "The host closed the connection part way through.",
  "response-oversize": "The host sent a much larger reply than this app reads.",
  "local-error": "This server could not make the request.",
  "unknown-network": "The connection failed for a reason this app does not recognise.",
};

/** PURE. Owner-facing copy for a cause. No raw code is appended: a code such as
 * ETIMEDOUT would itself trip the time-out branch of classifyChatSeamFailure. */
export function describeFailureCause(cause: CanvasFailureCause): string {
  return CAUSE_COPY[cause];
}

/** The fixed text every unreachable result is thrown with. Byte-identical to the original. */
export const CANVAS_DID_NOT_RESPOND = "Canvas did not respond.";

/** Thrown for an unreachable result. `message` is the fixed literal; the cause rides `.failure`. */
export class CanvasTransportError extends Error {
  readonly failure: CanvasNetworkFailure | undefined;
  constructor(message: string, failure?: CanvasNetworkFailure) {
    super(message);
    this.failure = failure;
  }
}
