/**
 * A decision seam for a future instructor-reviewed archive preview. It does
 * not extract, persist, or dispatch anything: the caller must bind member IDs
 * to one immutable archive and collect the instructor's assignments.
 */
export interface ReviewArchiveMember {
  readonly id: string;
  readonly path: string;
  readonly readable: boolean;
}

export interface ReviewArchiveAssignment {
  readonly memberId: string;
  readonly studentKey: string;
  readonly studentLabel: string;
}

export type ArchiveReviewPlan =
  | { readonly ok: false; readonly reason: string }
  | { readonly ok: true; readonly admitted: readonly ReviewedArchiveGroup[]; readonly blocked: readonly ReviewedArchiveGroup[] };

export interface ReviewedArchiveGroup {
  readonly studentKey: string;
  readonly studentLabel: string;
  readonly memberIds: readonly string[];
}

/** Every member must have exactly one reviewed identity before a plan exists. */
export function planReviewedArchive(members: readonly ReviewArchiveMember[], assignments: readonly ReviewArchiveAssignment[]): ArchiveReviewPlan {
  if (!Array.isArray(members) || !Array.isArray(assignments) || !members.length || members.length !== assignments.length) return { ok: false, reason: "Review every archive member before continuing." };
  const byId = new Map<string, ReviewArchiveMember>();
  for (const member of members) {
    if (typeof member?.id !== "string" || typeof member.path !== "string" || typeof member.readable !== "boolean" || !member.id.trim() || !member.path.trim() || byId.has(member.id)) return { ok: false, reason: "The archive member list is invalid." };
    byId.set(member.id, member);
  }
  const seen = new Set<string>();
  const labels = new Map<string, string>();
  const groups = new Map<string, { studentKey: string; studentLabel: string; memberIds: string[]; incomplete: boolean }>();
  for (const assignment of assignments) {
    if (typeof assignment?.memberId !== "string" || typeof assignment.studentKey !== "string" || typeof assignment.studentLabel !== "string") return { ok: false, reason: "Each archive member needs exactly one student assignment." };
    const member = byId.get(assignment.memberId);
    const studentKey = assignment.studentKey.trim();
    const studentLabel = assignment.studentLabel.trim();
    if (!member || seen.has(assignment.memberId) || !studentKey || !studentLabel) return { ok: false, reason: "Each archive member needs exactly one student assignment." };
    const normalizedKey = studentKey.normalize("NFKC").toLocaleLowerCase("en-US");
    const normalizedLabel = studentLabel.normalize("NFKC").toLocaleLowerCase("en-US");
    const labelOwner = labels.get(normalizedLabel);
    const existing = groups.get(normalizedKey);
    if ((labelOwner && labelOwner !== normalizedKey) || (existing && (existing.studentKey !== studentKey || existing.studentLabel !== studentLabel))) return { ok: false, reason: "Student identities and labels must be unambiguous." };
    labels.set(normalizedLabel, normalizedKey);
    seen.add(member.id);
    const group = existing ?? { studentKey, studentLabel, memberIds: [] as string[], incomplete: false };
    group.memberIds.push(member.id);
    group.incomplete ||= !member.readable;
    groups.set(normalizedKey, group);
  }
  const admitted: ReviewedArchiveGroup[] = [], blocked: ReviewedArchiveGroup[] = [];
  for (const group of groups.values()) {
    const result = { studentKey: group.studentKey, studentLabel: group.studentLabel, memberIds: group.memberIds };
    (group.incomplete ? blocked : admitted).push(result);
  }
  return { ok: true, admitted, blocked };
}
