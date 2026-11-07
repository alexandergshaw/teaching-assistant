/**
 * A session-scoped index of persisted submission identities.
 *
 * Labels are presentation, not identity: more than one submission may have
 * the same label. Only a complete, owner-authorized session snapshot may be
 * passed here; this helper neither authorizes access nor creates IDs.
 */
export interface ChatSubmissionIdentity {
  readonly sessionId: string;
  readonly itemId: string;
  readonly ordinal: number;
  readonly label: string;
}

export type LegacyLabelLookup =
  | { readonly kind: "matched"; readonly itemId: string }
  | { readonly kind: "not-found" | "ambiguous" };

export type ChatSubmissionIdentityIndex =
  | { readonly kind: "refused"; readonly reason: "incomplete-snapshot" | "invalid-snapshot" }
  | {
      readonly kind: "ready";
      readonly sessionId: string;
      readonly items: readonly ChatSubmissionIdentity[];
      readonly findById: (itemId: string) => ChatSubmissionIdentity | undefined;
      readonly findByOrdinal: (ordinal: number) => ChatSubmissionIdentity | undefined;
      readonly findUniqueLegacyLabel: (label: string) => LegacyLabelLookup;
    };

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_ORDINAL = 2_147_483_647;

/** Refuses inconsistent or partial input rather than resolving a wrong row. */
export function indexChatSubmissionIdentities(
  sessionId: string,
  items: readonly ChatSubmissionIdentity[],
  snapshotComplete: boolean,
): ChatSubmissionIdentityIndex {
  if (!snapshotComplete) return { kind: "refused", reason: "incomplete-snapshot" };
  if (typeof sessionId !== "string" || !UUID.test(sessionId) || !Array.isArray(items)) {
    return { kind: "refused", reason: "invalid-snapshot" };
  }

  const session = sessionId.toLowerCase();
  const byId = new Map<string, ChatSubmissionIdentity>();
  const byOrdinal = new Map<number, ChatSubmissionIdentity>();
  const labels = new Map<string, string[]>();
  const copied: ChatSubmissionIdentity[] = [];
  for (const item of items) {
    if (!item || typeof item.sessionId !== "string" || item.sessionId.toLowerCase() !== session ||
        typeof item.itemId !== "string" || !UUID.test(item.itemId) ||
        !Number.isSafeInteger(item.ordinal) || item.ordinal < 0 || item.ordinal > MAX_ORDINAL ||
        typeof item.label !== "string" || item.label.length > 512) {
      return { kind: "refused", reason: "invalid-snapshot" };
    }
    const id = item.itemId.toLowerCase();
    if (byId.has(id) || byOrdinal.has(item.ordinal)) return { kind: "refused", reason: "invalid-snapshot" };
    const entry = Object.freeze({ sessionId: session, itemId: id, ordinal: item.ordinal, label: item.label });
    copied.push(entry);
    byId.set(id, entry);
    byOrdinal.set(entry.ordinal, entry);
    const matches = labels.get(entry.label) ?? [];
    matches.push(id);
    labels.set(entry.label, matches);
  }

  return Object.freeze({
    kind: "ready" as const,
    sessionId: session,
    items: Object.freeze(copied.sort((a, b) => a.ordinal - b.ordinal)),
    findById: (itemId: string) => typeof itemId === "string" ? byId.get(itemId.toLowerCase()) : undefined,
    findByOrdinal: (ordinal: number) => byOrdinal.get(ordinal),
    findUniqueLegacyLabel: (label: string): LegacyLabelLookup => {
      const matches = labels.get(label);
      if (!matches?.length) return { kind: "not-found" };
      return matches.length === 1 ? { kind: "matched", itemId: matches[0] } : { kind: "ambiguous" };
    },
  });
}
