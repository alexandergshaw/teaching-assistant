// Pure builders for the per-operation `detail` bag recorded on the session
// diagnostic log (docs/chat-grading-detailed-diagnostics-scope.md 4.1-4.2, WB).
//
// PII-SAFE BY CONSTRUCTION. Every parameter is a number, a boolean, a member of
// a closed union, or one of exactly two re-validated tokens (`model`, from the
// server diagnostic, and `rubricFp`, an instructor-content hash). There is NO
// string-typed parameter that could carry a student name, file name, submission
// text, prompt, URL or error message; a structure pin in the test file reads
// this file's source to keep it that way. The log's own write path re-validates
// every pair again (sanitizeSessionDiagnosticDetail), but that regex cannot tell
// a lowercase name from a token, so this construction is the real control.
//
// Imports are TYPE-ONLY plus the import-free failure leaf, so this module can
// never reach browser-only or server-only state.

import type { GradeFailureClass } from "@/lib/grade/grade-failure";
import { isGradeFailureClass } from "@/lib/grade/grade-failure";
import { GRADE_ITEM_DIAGNOSTIC_KEYS } from "@/lib/grade/grade-item-diagnostic";

export type ChatDetailBag = Record<string, number | boolean | string>;

export type GradeTrigger = "first" | "retry" | "regrade";
export type GradeLinkState = "none" | "ok" | "failed" | "flagged";
export type GradeCodeState = "none" | "ran" | "failed" | "needs-input";

const MODEL_TOKEN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
// A CLOSED list of provider finish reasons; anything else is recorded as
// "other", so a provider/enum-shaped string can never carry free text.
const FINISH_REASONS: readonly string[] = [
  "stop",
  "max_tokens",
  "safety",
  "recitation",
  "language",
  "other",
  "blocklist",
  "prohibited_content",
  "spii",
  "malformed_function_call",
  "image_safety",
  "finish_reason_unspecified",
];
const RUBRIC_FP = /^[0-9a-f]{12}$/;

function count(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  const rounded = Math.round(value);
  return rounded <= 1e12 ? rounded : undefined;
}

function putCount(bag: ChatDetailBag, key: string, value: unknown): void {
  const c = count(value);
  if (c !== undefined) bag[key] = c;
}

function putBool(bag: ChatDetailBag, key: string, value: unknown): void {
  if (typeof value === "boolean") bag[key] = value;
}

/** Client-side signals for one grade dispatch. Numbers, booleans and closed unions only. */
export interface GradeItemClientSignals {
  /** 1-based row number. */
  item?: number;
  attempt?: number;
  trigger?: GradeTrigger;
  waitMs?: number;
  inflight?: number;
  queued?: number;
  httpStatus?: number;
  /** Client-measured round trip, used only to derive netMs. */
  clientMs?: number;
  areas?: number;
  areasExpected?: number;
  scored?: boolean;
  splitAsked?: boolean;
  hasPraise?: boolean;
  hasAdvice?: boolean;
  truncated?: boolean;
  contentChars?: number;
  files?: number;
  visualFiles?: number;
  wireKb?: number;
  video?: boolean;
  windowed?: boolean;
  link?: GradeLinkState;
  code?: GradeCodeState;
  /** Client-assigned failure class (transport lost / request refused). */
  failure?: GradeFailureClass;
  /** First 12 hex characters of the rubric fingerprint; dropped if it is not. */
  rubricFp?: string;
}

const TRIGGERS: readonly string[] = ["first", "retry", "regrade"];
const LINK_STATES: readonly string[] = ["none", "ok", "failed", "flagged"];
const CODE_STATES: readonly string[] = ["none", "ran", "failed", "needs-input"];

/** Project the server `diagnostic` (an UNTRUSTED parsed body: unknown) onto the
 * whitelisted keys, re-validating each. A malformed or future body degrades to
 * an empty object, never an exception. */
export function readServerDiagnostic(raw: unknown): ChatDetailBag {
  const out: ChatDetailBag = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const record = raw as Record<string, unknown>;
  for (const key of GRADE_ITEM_DIAGNOSTIC_KEYS) {
    const value = record[key];
    if (key === "model") {
      if (typeof value === "string" && MODEL_TOKEN.test(value)) out.model = value;
    } else if (key === "finishReason") {
      if (typeof value === "string") {
        const lowered = value.toLowerCase();
        out.finishReason = FINISH_REASONS.includes(lowered) ? lowered : "other";
      }
    } else if (key === "failure") {
      if (isGradeFailureClass(value)) out.failure = value;
    } else {
      putCount(out, key, value);
    }
  }
  return out;
}

/** The class as a log-safe token. */
export function failureToken(failure: string): string {
  return failure.replace(/ /g, "-");
}

/** Build the `grade_item` detail bag. Server keys are present only when the
 * server reported them; `netMs` only when both timings exist. A failure the
 * server classified wins over none; a client-assigned class fills the gap. */
export function buildGradeItemDetail(client: GradeItemClientSignals, serverDiagnostic?: unknown): ChatDetailBag {
  const bag: ChatDetailBag = {};
  putCount(bag, "item", client.item);
  putCount(bag, "attempt", client.attempt);
  if (client.trigger !== undefined && TRIGGERS.includes(client.trigger)) bag.trigger = client.trigger;
  putCount(bag, "waitMs", client.waitMs);
  putCount(bag, "inflight", client.inflight);
  putCount(bag, "queued", client.queued);
  putCount(bag, "httpStatus", client.httpStatus);
  putCount(bag, "areas", client.areas);
  putCount(bag, "areasExpected", client.areasExpected);
  putBool(bag, "scored", client.scored);
  putBool(bag, "splitAsked", client.splitAsked);
  putBool(bag, "hasPraise", client.hasPraise);
  putBool(bag, "hasAdvice", client.hasAdvice);
  putBool(bag, "truncated", client.truncated);
  putCount(bag, "contentChars", client.contentChars);
  putCount(bag, "files", client.files);
  putCount(bag, "visualFiles", client.visualFiles);
  putCount(bag, "wireKb", client.wireKb);
  putBool(bag, "video", client.video);
  putBool(bag, "windowed", client.windowed);
  if (client.link !== undefined && LINK_STATES.includes(client.link)) bag.link = client.link;
  if (client.code !== undefined && CODE_STATES.includes(client.code)) bag.code = client.code;
  if (typeof client.rubricFp === "string" && RUBRIC_FP.test(client.rubricFp)) bag.rubricFp = client.rubricFp;

  const server = readServerDiagnostic(serverDiagnostic);
  Object.assign(bag, server);
  if (bag.failure === undefined && client.failure !== undefined && isGradeFailureClass(client.failure)) {
    bag.failure = client.failure;
  }
  // A failure class contains spaces ("model quota"), which the log's string rule
  // rejects; the stored token is the class with spaces turned to dashes.
  if (typeof bag.failure === "string") bag.failure = failureToken(bag.failure);
  const clientMs = count(client.clientMs);
  const serverMs = typeof server.serverMs === "number" ? server.serverMs : undefined;
  if (clientMs !== undefined && serverMs !== undefined) bag.netMs = Math.max(0, clientMs - serverMs);
  return bag;
}

/** Settings in force for a run (resolve_header). Closed unions and counts only. */
export interface ResolveHeaderSignals {
  harshness?: "lenient" | "balanced" | "strict";
  wordTarget?: number;
  nameDeduct?: number;
  lengthDeduct?: number;
  splitOn?: boolean;
  rubricSource?: "typed" | "generated";
  rubricChars?: number;
  instructionsChars?: number;
  criteria?: number;
  concurrency?: number;
  cap?: number;
  rubricFp?: string;
}

export function buildResolveHeaderDetail(s: ResolveHeaderSignals): ChatDetailBag {
  const bag: ChatDetailBag = {};
  if (s.harshness === "lenient" || s.harshness === "balanced" || s.harshness === "strict") bag.harshness = s.harshness;
  putCount(bag, "wordTarget", s.wordTarget);
  putCount(bag, "nameDeduct", s.nameDeduct);
  putCount(bag, "lengthDeduct", s.lengthDeduct);
  putBool(bag, "splitOn", s.splitOn);
  if (s.rubricSource === "typed" || s.rubricSource === "generated") bag.rubricSource = s.rubricSource;
  putCount(bag, "rubricChars", s.rubricChars);
  putCount(bag, "instructionsChars", s.instructionsChars);
  putCount(bag, "criteria", s.criteria);
  putCount(bag, "concurrency", s.concurrency);
  putCount(bag, "cap", s.cap);
  if (typeof s.rubricFp === "string" && RUBRIC_FP.test(s.rubricFp)) bag.rubricFp = s.rubricFp;
  return bag;
}

export type IntakeInputKind = "text" | "file" | "url" | "composite" | "zip-storage" | "file-storage" | "video-storage";
export type IntakeTransport = "body" | "storage" | "video";
export type IntakeStage = "gate" | "upload" | "prepare" | "reset" | "empty" | "session-pin";
export type IntakeExt = "zip" | "pdf" | "image" | "text" | "other";

/** Intake facts for prepare_submission. Never a name, file name or URL. */
export interface PrepareSubmissionSignals {
  inputKind?: IntakeInputKind;
  transport?: IntakeTransport;
  stage?: IntakeStage;
  sizeKb?: number;
  ext?: IntakeExt;
  parts?: number;
  urlKind?: "canvas" | "other";
  entries?: number;
  chars?: number;
  files?: number;
  namesFilename?: number;
  namesInferred?: number;
  namesUnresolved?: number;
  found?: number;
  emitted?: number;
  skipped?: number;
  failedFiles?: number;
  markers?: number;
}

const INPUT_KINDS: readonly string[] = ["text", "file", "url", "composite", "zip-storage", "file-storage", "video-storage"];
const TRANSPORTS: readonly string[] = ["body", "storage", "video"];
const STAGES: readonly string[] = ["gate", "upload", "prepare", "reset", "empty", "session-pin"];
const EXTS: readonly string[] = ["zip", "pdf", "image", "text", "other"];

export function buildPrepareSubmissionDetail(s: PrepareSubmissionSignals): ChatDetailBag {
  const bag: ChatDetailBag = {};
  if (s.inputKind !== undefined && INPUT_KINDS.includes(s.inputKind)) bag.inputKind = s.inputKind;
  if (s.transport !== undefined && TRANSPORTS.includes(s.transport)) bag.transport = s.transport;
  if (s.stage !== undefined && STAGES.includes(s.stage)) bag.stage = s.stage;
  putCount(bag, "sizeKb", s.sizeKb);
  if (s.ext !== undefined && EXTS.includes(s.ext)) bag.ext = s.ext;
  putCount(bag, "parts", s.parts);
  if (s.urlKind === "canvas" || s.urlKind === "other") bag.urlKind = s.urlKind;
  putCount(bag, "entries", s.entries);
  putCount(bag, "chars", s.chars);
  putCount(bag, "files", s.files);
  putCount(bag, "namesFilename", s.namesFilename);
  putCount(bag, "namesInferred", s.namesInferred);
  putCount(bag, "namesUnresolved", s.namesUnresolved);
  putCount(bag, "found", s.found);
  putCount(bag, "emitted", s.emitted);
  putCount(bag, "skipped", s.skipped);
  putCount(bag, "failedFiles", s.failedFiles);
  putCount(bag, "markers", s.markers);
  return bag;
}
