import {
  type createRepoFeedbackAuthority,
  planRepoFeedbackChange,
  readRepoFeedbackRows,
} from "./repoFeedbackIdb";

const DB_NAME = "ta-repo-feedback-drafts";
const META = "meta";
const DRAFT = "draft";
const INCARNATION_KEY = "incarnation";
const INCARNATION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION_TIMEOUT_MS = 5_000;

type Authority = ReturnType<typeof createRepoFeedbackAuthority>;
type Lease = Parameters<Authority["resolve"]>[0];
type Target = Parameters<Authority["resolve"]>[1];
type StorageKey = NonNullable<ReturnType<Authority["resolve"]>>;
type Snapshot = ReturnType<typeof readRepoFeedbackRows>;
type Change = Parameters<typeof planRepoFeedbackChange>[4];
type PlanFailure = Exclude<ReturnType<typeof planRepoFeedbackChange>, { status: "ready" }>;
type Checkpoint = Readonly<{ revision: number }>;
type Failure = { status: "unauthorized" | "storage_error" | "invalid_stored_data" };
type LoadResult = Failure | (Exclude<Snapshot, { status: "invalid_stored_data" }> & { checkpoint: Checkpoint });
type ChangeResult = Failure | PlanFailure | { status: "unknown" } |
  { status: "committed"; checkpoint: Checkpoint };
type Mutation = { change: Change; expected: Checkpoint };
type Deadline = { signal: AbortSignal; expired: () => boolean };

function openDatabase(leaseSignal: AbortSignal, deadline: Deadline): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let abandoned = false;
    let upgrade: IDBTransaction | undefined;
    function releaseListeners() {
      leaseSignal.removeEventListener("abort", abandon);
      deadline.signal.removeEventListener("abort", abandon);
    }

    function abandon() {
      abandoned = true;
      releaseListeners();
      const activeUpgrade = upgrade;
      upgrade = undefined;
      try {
        activeUpgrade?.abort();
      } catch {
        // A schema-only upgrade may have finished before open reports back.
      }
      resolve(null);
    }

    const cannotOpen = () => abandoned || leaseSignal.aborted || deadline.expired();
    try {
      const request = globalThis.indexedDB.open(DB_NAME, 1);
      leaseSignal.addEventListener("abort", abandon, { once: true });
      deadline.signal.addEventListener("abort", abandon, { once: true });
      request.onblocked = request.onerror = abandon;
      request.onupgradeneeded = () => {
        const transaction = request.transaction!;
        upgrade = transaction;
        if (cannotOpen()) {
          abandon();
          return;
        }
        try {
          const db = request.result;
          db.createObjectStore(META).add(globalThis.crypto.randomUUID(), INCARNATION_KEY);
          db.createObjectStore(DRAFT);
        } catch {
          transaction.abort();
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        upgrade = undefined;
        if (cannotOpen()) {
          db.close();
          abandon();
        } else {
          releaseListeners();
          db.onversionchange = () => db.close();
          resolve(db);
        }
      };
      if (cannotOpen()) abandon();
    } catch {
      abandon();
    }
  });
}

/**
 * Dark browser adapter. Trusted auth owns one authority per app start,
 * verifies explicit sign-in for its challenge, and revokes on session change.
 * A lost mutation response requires a fresh load before deciding what to do.
 */
export function createRepoFeedbackIdbAdapter(authority: Authority, { timeoutMs = OPERATION_TIMEOUT_MS } = {}) {
  const operationTimeout = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs < OPERATION_TIMEOUT_MS
    ? timeoutMs : OPERATION_TIMEOUT_MS;
  const checkpoints = new WeakMap<Checkpoint, { lease: Lease; address: string; incarnation: string }>();

  function issueCheckpoint(lease: Lease, address: string, incarnation: string, revision: number): Checkpoint {
    const checkpoint = Object.freeze({ revision });
    checkpoints.set(checkpoint, { lease, address, incarnation });
    return checkpoint;
  }

  function run(lease: Lease, target: Target): Promise<LoadResult>;
  function run(lease: Lease, target: Target, mutation: Mutation): Promise<ChangeResult>;
  async function run(lease: Lease, target: Target, mutation?: Mutation): Promise<LoadResult | ChangeResult> {
    let key: StorageKey | null;
    try {
      key = authority.resolve(lease, target);
    } catch {
      return { status: "unauthorized" };
    }
    if (!key) return { status: "unauthorized" };

    const address = JSON.stringify(key);
    const expected = mutation && checkpoints.get(mutation.expected);
    if (mutation && (!expected || expected.lease !== lease || expected.address !== address)) {
      return { status: "conflict" };
    }

    // Recheck against a detached target so mutable caller input cannot retarget
    // an in-flight operation or run code during a lease check.
    const [, kind, course] = key;
    const resolvedTarget: Target = key[1] === "current"
      ? { kind: "current", course }
      : { kind: "history", course, generation: key[3], repo: key[4], folder: key[5] };
    const isAuthorized = () => authority.resolve(lease, resolvedTarget) !== null;
    const expiration = new AbortController();
    const expiresAt = performance.now() + operationTimeout;
    const deadline: Deadline = {
      signal: expiration.signal,
      expired: () => expiration.signal.aborted || performance.now() >= expiresAt,
    };
    const timer = setTimeout(() => expiration.abort(), operationTimeout);
    const db = await openDatabase(lease.signal, deadline);
    if (!isAuthorized() || !db || deadline.expired()) {
      clearTimeout(timer);
      db?.close();
      return { status: isAuthorized() ? "storage_error" : "unauthorized" };
    }

    return new Promise<LoadResult | ChangeResult>((resolve) => {
      let transaction: IDBTransaction;
      try {
        transaction = mutation
          ? db.transaction([META, DRAFT], "readwrite", { durability: "strict" })
          : db.transaction([META, DRAFT], "readonly");
      } catch {
        db.close();
        resolve({ status: "storage_error" });
        return;
      }

      let outcome: (() => LoadResult | ChangeResult) | undefined;
      let writeQueued = false;
      let failure: Failure | undefined;
      let draftRequest: IDBRequest<IDBCursorWithValue | null> | undefined;
      let finished = false;

      function abort(reason: Failure) {
        failure = reason;
        try {
          transaction.abort();
        } catch {
          // The transaction may already be committing. The terminal event
          // determines whether rollback is known.
        }
      }

      function revoke() {
        abort({ status: "unauthorized" });
      }

      function timeout() {
        const reason: Failure = { status: isAuthorized() ? "storage_error" : "unauthorized" };
        abort(reason);
        // The deadline cannot wait on another IndexedDB event. A dispatched
        // mutation may have committed, even when abort() no longer succeeds.
        finish(mutation ? { status: "unknown" } : reason);
      }

      function finish(result: LoadResult | ChangeResult) {
        if (finished) return;
        finished = true;
        transaction.onabort = transaction.oncomplete = transaction.onerror = null;
        if (draftRequest) draftRequest.onsuccess = null;
        lease.signal.removeEventListener("abort", revoke);
        deadline.signal.removeEventListener("abort", timeout);
        db!.close();
        resolve(result);
      }

      transaction.onerror = () => abort({ status: "storage_error" });
      transaction.onabort = () => finish(isAuthorized()
        ? failure ?? { status: "storage_error" }
        : { status: "unauthorized" });
      transaction.oncomplete = () => {
        if (deadline.expired()) timeout();
        else if (!isAuthorized()) finish({ status: writeQueued ? "unknown" : "unauthorized" });
        else if (failure || !outcome) finish({ status: writeQueued ? "unknown" : "storage_error" });
        else finish(outcome());
      };
      lease.signal.addEventListener("abort", revoke, { once: true });
      deadline.signal.addEventListener("abort", timeout, { once: true });

      try {
        if (deadline.expired()) {
          timeout();
          return;
        }
        if (!isAuthorized()) {
          revoke();
          return;
        }
        const meta = transaction.objectStore(META);
        const draft = transaction.objectStore(DRAFT);
        if (meta.keyPath !== null || meta.autoIncrement || draft.keyPath !== null || draft.autoIncrement) {
          abort({ status: "invalid_stored_data" });
          return;
        }
        const incarnationRequest = meta.get(INCARNATION_KEY);
        const rowKey = [...key];
        const metaRequest = meta.openCursor(rowKey);
        const readDraft = draft.openCursor(rowKey);
        draftRequest = readDraft;

        // Requests run in order in one transaction. Queue any writes in the
        // final request callback while IndexedDB still considers it active.
        readDraft.onsuccess = () => {
          try {
            if (deadline.expired()) {
              timeout();
              return;
            }
            if (!isAuthorized()) {
              revoke();
              return;
            }
            const incarnation: unknown = incarnationRequest.result;
            const metaCursor = metaRequest.result;
            const draftCursor = readDraft.result;
            const metaRow: unknown = metaCursor?.value;
            const draftRow: unknown = draftCursor?.value;
            if (typeof incarnation !== "string" || !INCARNATION_PATTERN.test(incarnation) ||
              (metaCursor && metaRow === undefined) || (draftCursor && draftRow === undefined)) {
              outcome = () => ({ status: "invalid_stored_data" });
              return;
            }
            if (!mutation || !expected) {
              const snapshot = readRepoFeedbackRows(kind, metaRow, draftRow);
              outcome = () => snapshot.status === "invalid_stored_data" ? snapshot : {
                ...snapshot, checkpoint: issueCheckpoint(lease, address, incarnation, snapshot.revision),
              };
              return;
            }
            if (expected.incarnation !== incarnation) {
              outcome = () => ({ status: "conflict" });
              return;
            }
            const plan = planRepoFeedbackChange(kind, metaRow, draftRow, mutation.expected.revision, mutation.change);
            if (deadline.expired()) {
              timeout();
              return;
            }
            if (!isAuthorized()) {
              revoke();
              return;
            }
            if (plan.status !== "ready") {
              outcome = () => plan;
              return;
            }
            meta.put(plan.meta, rowKey);
            writeQueued = true;
            if (plan.draft === null) draft.delete(rowKey);
            else draft.put(plan.draft, rowKey);
            outcome = () => ({
              status: "committed", checkpoint: issueCheckpoint(lease, address, incarnation, plan.meta.revision),
            });
          } catch {
            abort({ status: "storage_error" });
          }
        };
      } catch {
        abort({ status: "storage_error" });
      }
    }).finally(() => clearTimeout(timer));
  }

  return {
    load: (lease: Lease, target: Target) => run(lease, target),
    save: (lease: Lease, target: Target, expected: Checkpoint, value: unknown) =>
      run(lease, target, { expected, change: { type: "save", value } }),
    discard: (lease: Lease, target: Target, expected: Checkpoint) =>
      run(lease, target, { expected, change: { type: "discard" } }),
  };
}
