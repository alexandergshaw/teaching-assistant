import "server-only";

export function repoGradeDiscoveryEnabled(): boolean {
  // A GitHub redirect can bypass the discovery request budget.
  return false;
}
