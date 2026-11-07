/** Examples are server-validated members of the run's pinned folder cohort.
 * They identify the first observed issue, not every affected repository. */
export function readmeExampleLabel(reason: string | null, value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const { kind, repo, comparedRepo } = value as Record<string, unknown>;
  const valid = (name: unknown): name is string => typeof name === "string"
    && name.length <= 220 && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name);
  if (!valid(repo)) return "";
  if (reason === "missing-instruction-evidence" && (kind === "absent" || kind === "blank")) {
    return ` First observed example: ${repo} has ${kind === "blank" ? "a blank" : "no"} assignment README; other repositories may also be affected.`;
  }
  if (reason === "conflicting-instructions" && kind === "conflict" && valid(comparedRepo)) {
    return ` First observed example: ${repo} and ${comparedRepo} have different assignment instructions; other repositories may also be affected.`;
  }
  return "";
}
