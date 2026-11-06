export const REPO_FEEDBACK_READINESS_PATH = "/auth/repo-feedback-readiness";
export const REPO_FEEDBACK_SESSION_PATH = "/auth/repo-feedback-session";
export const REPO_FEEDBACK_READINESS_POLICY = "repo-feedback-multi-session-v1";
export const REPO_FEEDBACK_MAX_OBSERVATION_AGE_MS = 60 * 60 * 1000;

export type RepoFeedbackReadiness = Readonly<{
  origin: string;
  policy: typeof REPO_FEEDBACK_READINESS_POLICY;
  expiresAt: number;
}>;

export function feedbackProjectOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const project = new URL(value);
    return project.protocol === "https:" && (value === project.origin || value === `${project.origin}/`)
      ? project.origin : null;
  } catch {
    return null;
  }
}
