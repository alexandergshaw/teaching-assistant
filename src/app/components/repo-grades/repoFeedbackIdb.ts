// Dark storage foundations. A future adapter must obtain fresh sign-in proof
// from trusted auth and apply each plan in the same IndexedDB readwrite
// transaction that read both rows. A plan says nothing about commit success.
import type { RepoGradeFeedbackDraft, RetainedRepoGradeResult, RetainedRepoGradeSource } from "./repoGradesCellEdits";
import type { PersistedRepoGradeCell } from "./repoGradesResultsStore";

const MAX_PAYLOAD_BYTES = 1024 * 1024;
const MAX_KEY_PART_CHARS = 1024;
const encoder = new TextEncoder();

type Target =
  | { kind: "current"; course: string }
  | { kind: "history"; course: string; generation: number; repo: string; folder: string };

type StorageKey =
  | readonly [account: string, kind: "current", course: string]
  | readonly [account: string, kind: "history", course: string, generation: number, repo: string, folder: string];

type SignInChallenge = Readonly<{ incarnation: symbol; epoch: symbol }>;
type VerifiedIdentity = Readonly<{ account: string; session: string }>;
type Lease = Readonly<{ signal: AbortSignal }>;

/** The verifier must validate a fresh explicit sign-in for this exact challenge.
 * Trusted auth must revoke the lease on session change or sign-out. Session
 * restoration and refreshed credentials cannot admit a lease. The storage
 * layer cannot authenticate the user. */
export function createRepoFeedbackAuthority(
  verifyExplicitSignIn: (challenge: SignInChallenge, proof: unknown) => VerifiedIdentity | null,
) {
  const incarnation = Symbol();
  let pending: SignInChallenge | undefined;
  let active: { identity: VerifiedIdentity; controller: AbortController; lease: Lease } | undefined;

  function revoke() {
    const previous = active;
    active = undefined;
    pending = undefined;
    previous?.controller.abort();
  }

  return {
    beginSignIn(): SignInChallenge {
      revoke();
      pending = Object.freeze({ incarnation, epoch: Symbol() });
      return pending;
    },
    admit(challenge: SignInChallenge, proof: unknown): Lease | null {
      if (!pending || challenge !== pending) return null;
      try {
        const verified = verifyExplicitSignIn(challenge, proof);
        if (!verified) return null;
        const { account, session } = verified;
        if (!keyPart(account) || !keyPart(session) || challenge !== pending) return null;
        pending = undefined;
        const controller = new AbortController();
        const lease = Object.freeze({ signal: controller.signal });
        active = { identity: { account, session }, controller, lease };
        return lease;
      } catch {
        return null;
      }
    },
    revoke,
    resolve(lease: Lease, target: Target): StorageKey | null {
      const authority = active;
      if (!authority || authority.lease !== lease || lease.signal.aborted) return null;
      const { course, kind } = target;
      if (!keyPart(course) || active !== authority) return null;
      const { account } = authority.identity;
      if (kind === "current") return [account, kind, course];
      if (kind !== "history") return null;
      const { generation, repo, folder } = target;
      if (!positiveInteger(generation) || !keyPart(repo) || !keyPart(folder, true) || active !== authority) return null;
      return [account, kind, course, generation, repo, folder];
    },
  };
}

function keyPart(value: unknown, allowEmpty = false): value is string {
  return typeof value === "string" && (allowEmpty || value.length > 0) && value.length <= MAX_KEY_PART_CHARS;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

type CurrentCell = { repo: string; folder: string; cell: PersistedRepoGradeCell };
type Payload = readonly CurrentCell[] | RetainedRepoGradeResult;
type MetaRow = { revision: number; discarded: boolean };
type DraftRow = { revision: number; payload: string };
type Snapshot =
  | { status: "missing"; revision: 0 }
  | { status: "discarded"; revision: number }
  | { status: "saved"; revision: number; value: Payload }
  | { status: "invalid_stored_data" };

// Only descriptor values enter the projection. Serialization never touches
// the original record or its getters, prototype, or proxy get traps.
function projectRecord<Required extends string, Optional extends string = never>(
  value: unknown,
  required: readonly Required[],
  optional: readonly Optional[] = [],
): (Record<Required, unknown> & Partial<Record<Optional, unknown>>) | null {
  if (!value || typeof value !== "object") return null;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const allowed = new Set<string>([...required, ...optional]);
  const projected: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
    projected[key] = descriptor.value;
  }
  if (!required.every((key) => Object.hasOwn(projected, key))) return null;
  return projected as Record<Required, unknown> & Partial<Record<Optional, unknown>>;
}

const feedbackFields = ["score", "comment", "strengths", "improvements", "resubmitNotice"] as const;
const sourceFields = [
  ...feedbackFields, "generatedScore", "generatedComment", "rubricAreas",
  "submissionTruncated", "mergeStatus", "mergeFoundOnBranch",
] as const;
const cellFields = [...sourceFields, "at", "postStatus", "postMessage"] as const;
const rubricFields = ["area", "score", "comment"] as const;
const mergeStatuses = [null, "merged", "not-merged", "no-submission", "unknown"];
const postStatuses = ["idle", "posted", "error", "skipped"];

/** Bound validation work before serializing a payload. The codec also checks
 * the actual UTF-8 size, including JSON escaping and field names. */
function payloadProjector() {
  let remaining = MAX_PAYLOAD_BYTES;
  const spend = (count: number) => (remaining -= count) >= 0;
  const str = (value: unknown): value is string => typeof value === "string" && spend(value.length + 2);
  const nullableString = (value: unknown) => value === null || str(value);

  function array<T>(value: unknown, item: (entry: unknown) => T | null): T[] | null {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 ||
      !spend(length) || Reflect.ownKeys(value).length !== length + 1) return null;
    const projected: T[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      const entry = item(descriptor.value);
      if (entry === null) return null;
      projected.push(entry);
    }
    return projected;
  }

  function feedback(value: unknown): RepoGradeFeedbackDraft | null {
    const fields = projectRecord(value, feedbackFields);
    return fields && feedbackFields.every((field) => str(fields[field])) ? fields as RepoGradeFeedbackDraft : null;
  }

  function projectSourceFields(fields: Record<typeof sourceFields[number], unknown>) {
    if (!feedbackFields.every((field) => str(fields[field])) ||
      !nullableString(fields.generatedScore) || !nullableString(fields.generatedComment) ||
      !nullableString(fields.mergeFoundOnBranch) || !mergeStatuses.includes(fields.mergeStatus as string | null) ||
      typeof fields.submissionTruncated !== "boolean") return false;
    const areas = array(fields.rubricAreas, (area) => {
      const entry = projectRecord(area, rubricFields);
      return entry && rubricFields.every((field) => str(entry[field])) ? entry : null;
    });
    if (!areas) return false;
    fields.rubricAreas = areas;
    return true;
  }

  function source(value: unknown): RetainedRepoGradeSource | null {
    const fields = projectRecord(value, sourceFields);
    return fields && projectSourceFields(fields) ? fields as RetainedRepoGradeSource : null;
  }

  function retained(value: unknown): RetainedRepoGradeResult | null {
    const fields = projectRecord(value, ["id", "source", "draft"]);
    if (!fields || !str(fields.id) ||
      (fields.id !== "legacy-conflict" && !/^local:[1-9]\d*$/.test(fields.id))) return null;
    const projectedSource = source(fields.source);
    const draft = fields.draft === null ? null : feedback(fields.draft);
    if (!projectedSource || (fields.draft !== null && draft === null)) return null;
    fields.source = projectedSource;
    fields.draft = draft;
    return fields as RetainedRepoGradeResult;
  }

  function cell(value: unknown): PersistedRepoGradeCell | null {
    const fields = projectRecord(value, cellFields, ["draftRevision", "retainedResults"]);
    if (!fields || !projectSourceFields(fields) ||
      !str(fields.at) || !postStatuses.includes(fields.postStatus as string) || !nullableString(fields.postMessage) ||
      (Object.hasOwn(fields, "draftRevision") && !positiveInteger(fields.draftRevision))) return null;
    if (Object.hasOwn(fields, "retainedResults")) {
      const ids = new Set<string>();
      const results = array(fields.retainedResults, (value) => {
        const result = retained(value);
        if (!result || ids.has(result.id)) return null;
        ids.add(result.id);
        return result;
      });
      if (!results) return null;
      fields.retainedResults = results;
    }
    return fields as PersistedRepoGradeCell;
  }

  return (kind: Target["kind"], value: unknown): Payload | null => {
    if (kind === "history") return retained(value);
    const addresses = new Set<string>();
    return array(value, (value) => {
      const entry = projectRecord(value, ["repo", "folder", "cell"]);
      if (!entry || !keyPart(entry.repo) || !keyPart(entry.folder, true) ||
        !spend(entry.repo.length + entry.folder.length + 4)) return null;
      const address = JSON.stringify([entry.repo, entry.folder]);
      if (addresses.has(address)) return null;
      const projectedCell = cell(entry.cell);
      if (!projectedCell) return null;
      addresses.add(address);
      entry.cell = projectedCell;
      return entry as CurrentCell;
    });
  };
}

function withinSize(payload: string): boolean {
  return payload.length <= MAX_PAYLOAD_BYTES && encoder.encode(payload).byteLength <= MAX_PAYLOAD_BYTES;
}

/** Rows are read by the adapter for one resolved key. Undefined is a missing row. */
export function readRepoFeedbackRows(kind: Target["kind"], meta: unknown, draft: unknown): Snapshot {
  try {
    if (kind !== "current" && kind !== "history") return { status: "invalid_stored_data" };
    if (meta === undefined && draft === undefined) return { status: "missing", revision: 0 };
    const metadata = projectRecord(meta, ["revision", "discarded"]);
    if (!metadata || !positiveInteger(metadata.revision)) return { status: "invalid_stored_data" };
    const { revision, discarded } = metadata;
    if (discarded === true && draft === undefined) return { status: "discarded", revision };
    const saved = projectRecord(draft, ["revision", "payload"]);
    if (discarded === false && saved?.revision === revision &&
      typeof saved.payload === "string" && withinSize(saved.payload)) {
      const value = payloadProjector()(kind, JSON.parse(saved.payload));
      if (value !== null) return { status: "saved", revision, value };
    }
  } catch {
    // Malformed data is distinct from an empty or discarded draft.
  }
  return { status: "invalid_stored_data" };
}

type Change = { type: "save"; value: unknown } | { type: "discard" };
type Plan =
  | { status: "ready"; meta: MetaRow; draft: DraftRow | null }
  | { status: "invalid_stored_data" | "invalid_payload" | "conflict" | "revision_exhausted" };

/** Compare both rows and plan both writes together. Null draft means delete the
 * payload, keeping the revision tombstone in metadata. Revision zero only
 * admits a genuinely missing pair. Recreating a draft requires a fresh CAS. */
export function planRepoFeedbackChange(
  kind: Target["kind"], meta: unknown, draft: unknown, expectedRevision: number, change: Change,
): Plan {
  const snapshot = readRepoFeedbackRows(kind, meta, draft);
  if (snapshot.status === "invalid_stored_data") return snapshot;
  if (snapshot.revision !== expectedRevision) return { status: "conflict" };
  if (snapshot.revision === Number.MAX_SAFE_INTEGER) return { status: "revision_exhausted" };
  const revision = snapshot.revision + 1;
  try {
    const fields = projectRecord(change, ["type"], ["value"]);
    if (fields?.type === "discard" && !Object.hasOwn(fields, "value")) {
      return { status: "ready", meta: { revision, discarded: true }, draft: null };
    }
    if (fields?.type === "save") {
      const value = payloadProjector()(kind, fields.value);
      if (value === null) return { status: "invalid_payload" };
      const payload = JSON.stringify(value);
      if (withinSize(payload)) return { status: "ready", meta: { revision, discarded: false }, draft: { revision, payload } };
    }
  } catch {
    // Only the bounded status is exposed when validation fails.
  }
  return { status: "invalid_payload" };
}
