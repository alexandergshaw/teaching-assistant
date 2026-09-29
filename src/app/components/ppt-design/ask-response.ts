// Pure logic for the conversational deck-ask box (A43-C wave C2).
//
// Kept in a plain .ts leaf (not GeneratePanel.tsx/index.tsx) because vitest
// here is node-env and collects only src/**/*.test.ts - no component is ever
// rendered, so logic left inside a component could never be exercised by a
// test. This mirrors src/app/components/presentations/panel-logic.ts's
// request-body-builder + response-reducer split for the same route shape.
//
// Route contract (src/app/api/decks/ask/route.ts, parseAskBody/POST):
//   request body:  { instruction: string, slides: PptxSlide[] }
//   200 { status: "ok", slides: PptxSlide[] }        - op applied
//   200 { status: "refused", reason: string }         - op coerced null or
//                                                        applyDeckOperation
//                                                        refused; NOT success
//   504 { status: "error", error: string, partial: true } - deadline
//   502 { status: "error", error: string }             - model call failed
//   401 { status: "error", error: string }             - unauthenticated
//   400 { status: "error", error: string }             - bad request body

import type { PptxSlide } from "@/lib/pptx";

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------

export interface AskRequestBody {
  instruction: string;
  slides: PptxSlide[];
}

export function buildAskRequestBody(instruction: string, slides: PptxSlide[]): AskRequestBody {
  return { instruction, slides };
}

// ---------------------------------------------------------------------------
// Response -> UI-state reducer. Branches on BOTH the HTTP status and the JSON
// `status` field, per the route contract above - a refusal is a 200 that
// must NOT be treated as success, and every non-200/refused case surfaces a
// message rather than silently doing nothing.
// ---------------------------------------------------------------------------

export type AskOutcome =
  | { phase: "ok"; slides: PptxSlide[] }
  | { phase: "refused"; reason: string }
  | { phase: "error"; message: string; retryable: boolean };

interface ApiOkBody {
  status: "ok";
  slides: unknown;
}

interface ApiRefusedBody {
  status: "refused";
  reason: string;
}

interface ApiErrorBody {
  status: "error";
  error: string;
  partial?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOkBody(value: unknown): value is ApiOkBody {
  return isRecord(value) && value.status === "ok" && Array.isArray(value.slides);
}

function isRefusedBody(value: unknown): value is ApiRefusedBody {
  return isRecord(value) && value.status === "refused" && typeof value.reason === "string";
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return isRecord(value) && value.status === "error" && typeof value.error === "string";
}

const GENERIC_SIGNED_OUT = "You're signed out - sign in and try again.";
const GENERIC_TIMEOUT =
  "There was not enough time to finish that request. Nothing was changed - try again.";
const GENERIC_FAILED = "The AI could not process that request. Try again.";
const GENERIC_BAD_REQUEST = "That request could not be sent.";
const GENERIC_UNEXPECTED = "An unexpected error occurred.";

export function reduceAskResponse(httpStatus: number, body: unknown): AskOutcome {
  if (httpStatus === 200 && isOkBody(body)) {
    return { phase: "ok", slides: body.slides as PptxSlide[] };
  }
  if (httpStatus === 200 && isRefusedBody(body)) {
    return { phase: "refused", reason: body.reason };
  }

  const errorMessage = isErrorBody(body) ? body.error : null;

  if (httpStatus === 401) {
    return { phase: "error", message: errorMessage ?? GENERIC_SIGNED_OUT, retryable: true };
  }
  if (httpStatus === 504) {
    return { phase: "error", message: errorMessage ?? GENERIC_TIMEOUT, retryable: true };
  }
  if (httpStatus === 502) {
    return { phase: "error", message: errorMessage ?? GENERIC_FAILED, retryable: true };
  }
  if (httpStatus === 400) {
    return { phase: "error", message: errorMessage ?? GENERIC_BAD_REQUEST, retryable: false };
  }
  return { phase: "error", message: errorMessage ?? GENERIC_UNEXPECTED, retryable: true };
}
