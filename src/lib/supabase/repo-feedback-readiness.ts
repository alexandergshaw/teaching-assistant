import "server-only";

import { createPublicKey, verify } from "node:crypto";
import {
  feedbackProjectOrigin,
  REPO_FEEDBACK_MAX_OBSERVATION_AGE_MS,
  REPO_FEEDBACK_READINESS_POLICY,
  type RepoFeedbackReadiness,
} from "./repo-feedback-readiness-contract";

type TrustedPolicy = Readonly<{
  audience: string;
  origin: string;
  issuer: string;
  projectRef: string;
  observedAt: number;
  publicKeyPem: string;
}>;

// A deployment needs a reviewed trust entry and an independently signed
// observation. Never derive a trust entry or key from the attestation or env.
const TRUSTED_POLICIES: readonly TrustedPolicy[] = [];
const DOMAIN = "repo-feedback-readiness-v1";
const MAX_ATTESTATION_LENGTH = 4_096;

function decode(encoded: string) {
  const bytes = Buffer.from(encoded, "base64url");
  return bytes.toString("base64url") === encoded ? bytes : null;
}

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function evaluateRepoFeedbackReadiness({ attestation, audience, projectUrl, policies, now }: {
  attestation: string | undefined;
  audience: string | undefined;
  projectUrl: string | undefined;
  policies: readonly TrustedPolicy[];
  now: number;
}): RepoFeedbackReadiness | null {
  const origin = feedbackProjectOrigin(projectUrl);
  if (!origin || !audience || !attestation || attestation.length > MAX_ATTESTATION_LENGTH || !timestamp(now)) return null;
  const matching = policies.filter((entry) => entry.audience === audience);
  if (matching.length !== 1) return null;
  const [policy] = matching;
  if (policy.origin !== origin || policy.issuer !== `${origin}/auth/v1` || !/^[a-z0-9]{20}$/.test(policy.projectRef)) return null;

  const envelope = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(attestation);
  if (!envelope || envelope[0] !== attestation) return null;
  const [, encoded, encodedSignature] = envelope;
  try {
    const bytes = decode(encoded);
    const signature = decode(encodedSignature);
    const key = createPublicKey(policy.publicKeyPem);
    if (!bytes || signature?.length !== 64 || key.asymmetricKeyType !== "ed25519" ||
      !verify(null, Buffer.from(`${DOMAIN}.${encoded}`), key, signature)) return null;

    const json = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    const evidence = JSON.parse(json);
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) ||
      Object.keys(evidence).length !== 9 || JSON.stringify(evidence) !== json) return null;

    const { observedAt, issuedAt, expiresAt } = evidence;
    if (evidence.policy !== REPO_FEEDBACK_READINESS_POLICY || evidence.audience !== audience ||
      evidence.origin !== origin || evidence.issuer !== policy.issuer || evidence.projectRef !== policy.projectRef ||
      evidence.sessions_single_per_user !== false ||
      !timestamp(observedAt) || !timestamp(issuedAt) || !timestamp(expiresAt) ||
      // Each deployment pins a single observation. An older signed observation
      // cannot be replayed even if its signature and validity window still pass.
      observedAt !== policy.observedAt || observedAt > issuedAt || issuedAt > now ||
      expiresAt <= now || expiresAt - observedAt > REPO_FEEDBACK_MAX_OBSERVATION_AGE_MS) return null;

    return { origin, policy: REPO_FEEDBACK_READINESS_POLICY, expiresAt };
  } catch {
    return null;
  }
}

export function readRepoFeedbackReadiness(): RepoFeedbackReadiness | null {
  if (process.env.REPO_FEEDBACK_READINESS_ENABLED !== "true") return null;
  return evaluateRepoFeedbackReadiness({
    attestation: process.env.REPO_FEEDBACK_READINESS_ATTESTATION,
    audience: process.env.REPO_FEEDBACK_DEPLOYMENT_AUDIENCE,
    projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    policies: TRUSTED_POLICIES,
    now: Date.now(),
  });
}
