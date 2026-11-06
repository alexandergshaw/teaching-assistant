import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateRepoFeedbackReadiness, readRepoFeedbackReadiness } from "./repo-feedback-readiness";
import { REPO_FEEDBACK_MAX_OBSERVATION_AGE_MS, REPO_FEEDBACK_READINESS_POLICY } from "../repo-feedback-readiness-contract";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const NOW = 1_800_000_000_000;
const policy = {
  audience: "test-deployment-2026-11-05",
  projectRef: "abcdefghijklmnopqrst",
  origin: "https://abcdefghijklmnopqrst.supabase.co",
  issuer: "https://abcdefghijklmnopqrst.supabase.co/auth/v1",
  observedAt: NOW - 10_000,
  publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
};
const evidence = {
  policy: REPO_FEEDBACK_READINESS_POLICY,
  audience: policy.audience,
  projectRef: policy.projectRef,
  origin: policy.origin,
  issuer: policy.issuer,
  sessions_single_per_user: false,
  observedAt: policy.observedAt,
  issuedAt: NOW - 5_000,
  expiresAt: NOW + 20_000,
};

function signed(overrides: Record<string, unknown> = {}, key = privateKey) {
  const encoded = Buffer.from(JSON.stringify({ ...evidence, ...overrides })).toString("base64url");
  const signature = sign(null, Buffer.from(`repo-feedback-readiness-v1.${encoded}`), key);
  return `v1.${encoded}.${signature.toString("base64url")}`;
}

const inputs = { now: NOW, audience: policy.audience, projectUrl: policy.origin, policies: [policy] };

afterEach(() => vi.unstubAllEnvs());

describe("feedback readiness trust policy", () => {
  it("exposes only the readiness contract after verifying a signed exact observation", () => {
    expect(evaluateRepoFeedbackReadiness({ ...inputs, attestation: signed() })).toEqual({
      origin: policy.origin, policy: evidence.policy, expiresAt: evidence.expiresAt,
    });
  });

  it.each([
    ["wrong project ref", { projectRef: "zyxwvutsrqponmlkjihg" }],
    ["wrong project origin", { origin: "https://other.example" }],
    ["wrong issuer", { issuer: `${policy.issuer}/` }],
    ["wrong audience", { audience: "old-deployment" }],
    ["wrong policy", { policy: "old-policy" }],
    ["single session on", { sessions_single_per_user: true }],
    ["string false", { sessions_single_per_user: "false" }],
    ["missing setting", { sessions_single_per_user: undefined }],
    ["expiry boundary", { expiresAt: NOW }],
    ["future issuance", { issuedAt: NOW + 1 }],
    ["issuance before observation", { issuedAt: policy.observedAt - 1 }],
    ["expiry past observation age", { expiresAt: policy.observedAt + REPO_FEEDBACK_MAX_OBSERVATION_AGE_MS + 1 }],
    ["rollback to an older valid signed observation", { observedAt: policy.observedAt - 1 }],
  ])("denies %s even with a valid signature", (_reason, overrides) => {
    expect(evaluateRepoFeedbackReadiness({ ...inputs, attestation: signed(overrides) })).toBeNull();
  });

  it("denies future and stale observations even if their exact timestamp is pinned", () => {
    for (const observedAt of [NOW + 1, NOW - REPO_FEEDBACK_MAX_OBSERVATION_AGE_MS]) {
      expect(evaluateRepoFeedbackReadiness({
        ...inputs,
        policies: [{ ...policy, observedAt }],
        attestation: signed({ observedAt, issuedAt: observedAt, expiresAt: NOW + 100 }),
      })).toBeNull();
    }
  });

  it("denies the wrong key, unexpected envelope and ambiguous registry", () => {
    const attestation = signed();
    const wrongKey = generateKeyPairSync("ed25519").privateKey;
    expect(evaluateRepoFeedbackReadiness({ ...inputs, attestation: signed({}, wrongKey) })).toBeNull();
    expect(evaluateRepoFeedbackReadiness({ ...inputs, attestation: attestation.replace("v1.", "v2.") })).toBeNull();
    expect(evaluateRepoFeedbackReadiness({ ...inputs, attestation, policies: [policy, policy] })).toBeNull();
  });

  it("denies mismatched runtime project, issuer or deployment even when the signature matches", () => {
    for (const override of [
      { projectUrl: "http://abcdefghijklmnopqrst.supabase.co" },
      { projectUrl: `${policy.origin}/?x=1` },
      { projectUrl: "https://other.example" },
      { audience: "other-deployment" },
      { policies: [{ ...policy, issuer: "https://other.example/auth/v1" }] },
    ]) {
      expect(evaluateRepoFeedbackReadiness({ ...inputs, ...override, attestation: signed() })).toBeNull();
    }
  });

  it("keeps production entry point closed with env enable, supplied key and test environment", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("REPO_FEEDBACK_READINESS_ENABLED", "true");
    vi.stubEnv("REPO_FEEDBACK_DEPLOYMENT_AUDIENCE", policy.audience);
    vi.stubEnv("REPO_FEEDBACK_READINESS_PUBLIC_KEY", policy.publicKeyPem);
    vi.stubEnv("REPO_FEEDBACK_READINESS_ATTESTATION", signed());
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", policy.origin);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    try {
      expect(readRepoFeedbackReadiness()).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
