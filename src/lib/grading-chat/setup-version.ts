import { createHash } from "node:crypto";
import { coerceFeedbackWordTarget } from "../grade/types";
import { isLengthDeductionThresholdWords } from "../grade/length-deduction-policy";

/** Server-side contract only. Persistence and atomic activation are separate. */
export type ChatSetup = Readonly<{
  instructions: string;
  rubric: string;
  provider: "gemini" | "other" | "embedded";
  harshness: "lenient" | "balanced" | "strict";
  feedbackWordTarget: number | null;
  applyNamingDeduction: boolean;
  applyLengthDeduction: boolean;
  lengthDeductionThresholdWords: number | null;
}>;

export type ChatSetupVersion = Readonly<{
  versionId: string;
  parentVersionId: string | null;
  fingerprint: string;
  setup: ChatSetup;
}>;

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// The ledger limits octet_length(setup::text), not JS string characters.
// PostgreSQL's jsonb text adds spaces after separators; reserve enough bytes
// for that representation rather than accepting data the ledger will reject.
const MAX_SETUP_JSON_BYTES = 200_000;

/** PostgreSQL jsonb rejects NUL and unpaired UTF-16 surrogate escapes. */
function isPostgresText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit === 0) return false;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function validSetup(setup: ChatSetup): boolean {
  return isPostgresText(setup.instructions)
    && isPostgresText(setup.rubric) && setup.rubric.trim().length > 0
    && ["gemini", "other", "embedded"].includes(setup.provider)
    && ["lenient", "balanced", "strict"].includes(setup.harshness)
    && (setup.feedbackWordTarget === null || coerceFeedbackWordTarget(setup.feedbackWordTarget) === setup.feedbackWordTarget)
    && typeof setup.applyNamingDeduction === "boolean" && typeof setup.applyLengthDeduction === "boolean"
    && (setup.applyLengthDeduction
      ? isLengthDeductionThresholdWords(setup.lengthDeductionThresholdWords)
      : setup.lengthDeductionThresholdWords === null);
}

/** Copies the fields in a fixed order so equivalent snapshots hash identically. */
export function createChatSetupVersion(versionId: string, parentVersionId: string | null, setup: ChatSetup): ChatSetupVersion | null {
  if (!UUID.test(versionId) || (parentVersionId !== null && !UUID.test(parentVersionId)) || !validSetup(setup)) return null;
  const snapshot: ChatSetup = Object.freeze({
    instructions: setup.instructions, rubric: setup.rubric, provider: setup.provider, harshness: setup.harshness,
    feedbackWordTarget: setup.feedbackWordTarget, applyNamingDeduction: setup.applyNamingDeduction,
    applyLengthDeduction: setup.applyLengthDeduction, lengthDeductionThresholdWords: setup.lengthDeductionThresholdWords,
  });
  // Eight flat fields add at most fifteen separator spaces in jsonb::text.
  if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") + 15 > MAX_SETUP_JSON_BYTES) return null;
  const fingerprint = createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex");
  return Object.freeze({ versionId, parentVersionId, fingerprint, setup: snapshot });
}

/** Application callers must enforce the same expected-current check atomically in storage. */
export function canActivateChatSetupVersion(currentVersionId: string | null, expectedVersionId: string | null, candidate: ChatSetupVersion): boolean {
  return currentVersionId === expectedVersionId && candidate.parentVersionId === currentVersionId
    && candidate.versionId !== currentVersionId;
}
