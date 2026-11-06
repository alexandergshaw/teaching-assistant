export async function verifyAdapter(modules) {
  const { createRepoFeedbackAuthority } = modules["./repoFeedbackIdb"];
  const { createRepoFeedbackIdbAdapter } = modules["./repoFeedbackIdbAdapter"];
  const name = "ta-repo-feedback-drafts";
  const current = course => ({ kind: "current", course });
  const assert = (condition, label) => { if (!condition) throw Error(label); };
  const equal = (actual, expected, label) => assert(JSON.stringify(actual) === JSON.stringify(expected), label);
  const status = (result, expected) => {
    equal(result.status, expected, "expected " + expected + " received " + result.status);
    return result;
  };
  const start = (account = "teacher-a", timeoutMs) => {
    const proof = Symbol();
    const authority = createRepoFeedbackAuthority((challenge, input) =>
      challenge === trustedChallenge && input === proof ? { account, session: "session-a" } : null,
    );
    const adapter = createRepoFeedbackIdbAdapter(authority, { timeoutMs });
    let trustedChallenge;
    function signIn() {
      trustedChallenge = authority.beginSignIn();
      return authority.admit(trustedChallenge, proof);
    }
    return { authority, adapter, lease: signIn(), signIn };
  };
  const feedback = { score: "19", comment: "detailed", strengths: "clear", improvements: "edge cases", resubmitNotice: "yes" };
  const source = { ...feedback, generatedScore: "18", generatedComment: "model", rubricAreas: [{ area: "Output", score: "4", comment: "works" }], submissionTruncated: true, mergeStatus: "merged", mergeFoundOnBranch: "feature" };
  const retained = { id: "local:1", source, draft: { ...feedback, comment: "edited history" } };
  const value = [{ repo: "org/repo", folder: "", cell: { ...source, at: "2026-11-05", postStatus: "error", postMessage: "interrupted", draftRevision: 2, retainedResults: [retained] } }];
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const deleteDatabase = () => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error("adapter leaked a connection"));
  });
  async function rawWrite(write) {
    const db = await open();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["meta", "draft"], "readwrite");
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
        write(tx.objectStore("meta"), tx.objectStore("draft"));
      });
    } finally {
      db.close();
    }
  }

  const first = start();
  const second = start();
  const { adapter, authority, lease } = first;
  const target = current("course:one");
  status(await second.adapter.load(lease, target), "unauthorized");
  const zeroA = status(await adapter.load(lease, target), "missing").checkpoint;
  const zeroB = status(await second.adapter.load(second.lease, target), "missing").checkpoint;
  status(await adapter.save(lease, current("course:two"), zeroA, value), "conflict");
  let completed = 0;
  const originalTransaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = originalTransaction.apply(this, args);
    if (tx.mode === "readwrite") tx.addEventListener("complete", () => completed++);
    return tx;
  };
  const race = await Promise.all([
    adapter.save(lease, target, zeroA, value),
    second.adapter.save(second.lease, target, zeroB, value),
  ]);
  IDBDatabase.prototype.transaction = originalTransaction;
  equal(race.map(x => x.status).sort(), ["committed", "conflict"], "cross-connection CAS");
  equal(completed, 2, "responses wait for native completion");
  const saved = status(await adapter.load(lease, target), "saved");
  equal(saved.revision, 1, "CAS revision");
  equal(saved.value, value, "full current payload");

  const history = { kind: "history", course: target.course, generation: 1, repo: "org/repo", folder: "" };
  const h0 = status(await adapter.load(lease, history), "missing").checkpoint;
  status(await adapter.save(lease, history, h0, retained), "committed");
  equal(status(await adapter.load(lease, history), "saved").value, retained, "full history payload");
  status(await adapter.load(lease, { ...history, generation: 2 }), "missing");
  status(await adapter.load(lease, { ...history, folder: "next" }), "missing");
  status(await adapter.load(lease, { ...history, repo: "org/other" }), "missing");
  const other = start("teacher-b");
  status(await other.adapter.load(other.lease, target), "missing");
  const tomb = status(await adapter.discard(lease, target, saved.checkpoint), "committed").checkpoint;
  equal(tomb.revision, 2, "discard tombstone revision");
  status(await second.adapter.save(second.lease, target, zeroB, value), "conflict");
  status(await adapter.load(lease, target), "discarded");
  const recreated = status(await adapter.save(lease, target, tomb, value), "committed").checkpoint;

  // Fail the second request asynchronously through native IndexedDB.
  const originalPut = IDBObjectStore.prototype.put;
  let metaWritten = false;
  IDBObjectStore.prototype.put = function (data, key) {
    if (this.name === "draft") return this.add(data, key);
    const request = originalPut.call(this, data, key);
    request.addEventListener("success", () => { metaWritten = true; });
    return request;
  };
  status(await adapter.save(lease, target, recreated, []), "storage_error");
  IDBObjectStore.prototype.put = originalPut;
  assert(metaWritten, "first native write succeeded before second failed");
  const restored = status(await adapter.load(lease, target), "saved");
  equal(restored.revision, recreated.revision, "rolled back metadata");
  equal(restored.value, value, "rolled back payload");

  // Revoke the lease after the first request succeeds but before commit.
  IDBObjectStore.prototype.put = function (data, key) {
    const request = originalPut.call(this, data, key);
    if (this.name === "meta") request.addEventListener("success", () => authority.revoke());
    return request;
  };
  status(await adapter.save(lease, target, restored.checkpoint, []), "unauthorized");
  IDBObjectStore.prototype.put = originalPut;
  const freshLease = first.signIn();
  const afterRevoke = status(await adapter.load(freshLease, target), "saved");
  equal(afterRevoke.value, value, "revocation rolls back native transaction");
  equal(afterRevoke.revision, restored.revision, "revocation rolls back revision");
  status(await adapter.save(freshLease, target, restored.checkpoint, []), "conflict");

  // Simulate losing response authority in the native complete event before
  // the adapter can acknowledge the committed mutation.
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = originalTransaction.apply(this, args);
    if (tx.mode === "readwrite") tx.addEventListener("complete", () => authority.revoke());
    return tx;
  };
  status(await adapter.save(freshLease, target, afterRevoke.checkpoint, []), "unknown");
  IDBDatabase.prototype.transaction = originalTransaction;
  const newestLease = first.signIn();
  const afterUnknown = status(await adapter.load(newestLease, target), "saved");
  equal(afterUnknown.revision, afterRevoke.revision + 1, "unknown can mean committed");
  equal(afterUnknown.value, [], "fresh load reconciles unknown response");

  const storageKey = ["teacher-a", "current", target.course];
  await rawWrite((_meta, draft) => draft.put(undefined, storageKey));
  status(await adapter.load(newestLease, target), "invalid_stored_data");
  status(await adapter.save(newestLease, target, afterUnknown.checkpoint, value), "invalid_stored_data");
  await rawWrite((_meta, draft) => draft.put({ revision: afterUnknown.revision - 1, payload: "[]" }, storageKey));
  status(await adapter.load(newestLease, target), "invalid_stored_data");
  status(await adapter.discard(newestLease, target, afterUnknown.checkpoint), "invalid_stored_data");

  const absent = current("absent");
  const preDelete = status(await adapter.load(newestLease, absent), "missing").checkpoint;
  await deleteDatabase();
  status(await adapter.save(newestLease, absent, preDelete, value), "conflict");
  const postDelete = status(await adapter.load(newestLease, absent), "missing").checkpoint;
  status(await adapter.save(newestLease, absent, postDelete, value), "committed");
  await rawWrite(meta => meta.delete("incarnation"));
  status(await adapter.load(newestLease, absent), "invalid_stored_data");
  await deleteDatabase();

  await verifyDeadlines();
  return "PASS_NATIVE_INDEXEDDB actual adapter: admission, full fields, isolation, concurrent CAS, completion, discard, second request rollback, revocation, unknown response, corruption, incarnation and open/transaction deadlines";

  async function verifyDeadlines() {
    const timeoutMs = 350;
    const short = start("teacher-a", timeoutMs);
    const normal = start();
    const deadlineTarget = current("deadline");
    status(await normal.adapter.load(normal.lease, deadlineTarget), "missing");

    // A delete blocked by another connection queues later opens without
    // delivering a blocked event to those later requests.
    const blocker = await open();
    const deletion = indexedDB.deleteDatabase(name);
    await new Promise((resolve) => deletion.addEventListener("blocked", resolve, { once: true }));
    const deleted = new Promise((resolve, reject) => {
      deletion.onsuccess = resolve;
      deletion.onerror = () => reject(deletion.error);
    });
    // Queue an ordinary open first so the timed-out request later succeeds
    // against an existing schema and must close its own unused connection.
    const recreate = normal.adapter.load(normal.lease, deadlineTarget);
    const originalOpen = IDBFactory.prototype.open;
    const originalClose = IDBDatabase.prototype.close;
    const closed = new WeakSet();
    const used = new WeakSet();
    let lateRequest;
    IDBFactory.prototype.open = function (...args) {
      lateRequest = originalOpen.apply(this, args);
      return lateRequest;
    };
    IDBDatabase.prototype.close = function () {
      closed.add(this);
      return originalClose.call(this);
    };
    IDBDatabase.prototype.transaction = function (...args) {
      used.add(this);
      return originalTransaction.apply(this, args);
    };
    const timedOpen = short.adapter.load(short.lease, deadlineTarget);
    IDBFactory.prototype.open = originalOpen;
    let gotBlocked = false;
    lateRequest.addEventListener("blocked", () => { gotBlocked = true; });
    const lateConnection = new Promise((resolve, reject) => {
      lateRequest.addEventListener("success", () => resolve(lateRequest.result), { once: true });
      lateRequest.addEventListener("error", () => reject(lateRequest.error), { once: true });
    });
    status(await timedOpen, "storage_error");
    assert(lateRequest.readyState === "pending" && !gotBlocked, "open deadline settles before queue unblocks");
    blocker.close();
    await deleted;
    status(await recreate, "missing");
    const openedAfterTimeout = await lateConnection;
    assert(closed.has(openedAfterTimeout), "late native connection was closed");
    assert(!used.has(openedAfterTimeout), "late native connection did not dispatch a data transaction");
    IDBDatabase.prototype.close = originalClose;
    IDBDatabase.prototype.transaction = originalTransaction;

    const initial = status(await short.adapter.load(short.lease, deadlineTarget), "missing");
    const holdingConnection = await open();
    const holdingTransaction = holdingConnection.transaction(["meta", "draft"], "readwrite");
    const holderDone = new Promise((resolve, reject) => {
      holdingTransaction.oncomplete = resolve;
      holdingTransaction.onabort = () => reject(holdingTransaction.error);
    });
    let released = false;
    const store = holdingTransaction.objectStore("meta");
    function holdTransaction() {
      const request = store.get("incarnation");
      request.onsuccess = () => {
        if (!released) holdTransaction();
      };
    }
    holdTransaction();
    let queuedTransaction;
    let queuedAbort;
    IDBDatabase.prototype.transaction = function (...args) {
      queuedTransaction = originalTransaction.apply(this, args);
      queuedAbort = new Promise((resolve) => queuedTransaction.addEventListener("abort", resolve, { once: true }));
      return queuedTransaction;
    };
    const queuedResult = await short.adapter.save(short.lease, deadlineTarget, initial.checkpoint, value);
    assert(queuedTransaction, "deadline raced a dispatched transaction");
    status(queuedResult, "unknown");
    IDBDatabase.prototype.transaction = originalTransaction;
    released = true;
    await holderDone;
    await queuedAbort;
    holdingConnection.close();
    status(await short.adapter.load(short.lease, deadlineTarget), "missing");

    // A native commit can already be durable while the complete acknowledgement
    // is delayed. Suppress delivery to the adapter until after the deadline.
    let didCommit = false;
    let acknowledge;
    let delayed;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = originalTransaction.apply(this, args);
      Object.defineProperty(tx, "oncomplete", {
        get: () => acknowledge,
        set: (handler) => { acknowledge = handler; },
      });
      tx.addEventListener("complete", (event) => {
        didCommit = true;
        delayed = new Promise((resolve) => setTimeout(() => {
          acknowledge?.call(tx, event);
          resolve();
        }, timeoutMs * 2));
      });
      return tx;
    };
    status(await short.adapter.save(short.lease, deadlineTarget, initial.checkpoint, value), "unknown");
    assert(didCommit && acknowledge === null, "deadline detached the lost acknowledgement");
    IDBDatabase.prototype.transaction = originalTransaction;
    await delayed;
    const committedLate = status(await normal.adapter.load(normal.lease, deadlineTarget), "saved");
    equal(committedLate.value, value, "fresh load reconciles a commit after acknowledgement timed out");
    await deleteDatabase();
  }
}
