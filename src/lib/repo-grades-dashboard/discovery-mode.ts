import "server-only";

export function repoGradeDiscoveryEnabled(): boolean {
  return process.env.REPO_GRADE_DISCOVERY_ENABLED === "true";
}
