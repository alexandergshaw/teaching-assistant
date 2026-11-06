import "server-only";

import { getGeminiModel } from "@/lib/gemini";
import type { RepoGradeProfile } from "./profile";

// Bump when the repo evaluator changes in a way that can change grades.
const GRADER_VERSION = "repo-grader-v1";

export type RepoGraderIdentity = Pick<RepoGradeProfile, "provider" | "model" | "graderVersion">;

export function getRepoGraderIdentity(provider: RepoGraderIdentity["provider"]): RepoGraderIdentity {
  return {
    provider,
    model: provider === "gemini" ? getGeminiModel() : "embedded-deterministic",
    graderVersion: GRADER_VERSION,
  };
}
