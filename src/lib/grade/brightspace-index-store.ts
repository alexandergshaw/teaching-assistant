import type { BundleLease, createBundleAuthority } from "./single-zip-authority";
type Access = { authority: ReturnType<typeof createBundleAuthority>; lease: BundleLease };
const DATABASE = "grading-chat-brightspace-index-v1";
type StoredIndex = { account: string; sourceDigest: string; indexDigest: string; bytes: Uint8Array };
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("indexes", { keyPath: ["account", "sourceDigest"] });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Index storage is unavailable."));
    request.onblocked = () => reject(new Error("Index storage is blocked."));
  });
}
function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("Index storage failed.")); });
}
function authorized(access: Access): string {
  const account = access.authority.resolve(access.lease); if (!account) throw new Error("A verified owner session is required."); return account;
}
function fenced(transaction: IDBTransaction, access: Access, account: string): Promise<void> {
  if (authorized(access) !== account) throw new Error("The signed-in session changed.");
  const abort = () => { try { transaction.abort(); } catch { /* Completed transactions are checked again below. */ } };
  access.lease.signal.addEventListener("abort", abort, { once: true });
  return finished(transaction).then(() => { if (authorized(access) !== account) throw new Error("The signed-in session changed."); }).finally(() => access.lease.signal.removeEventListener("abort", abort));
}
function get<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), (value) => value.toString(16).padStart(2, "0")).join("");
}

/** Store and read back the exact bounded index before any related grading dispatch. */
export async function preserveBrightspaceIndex(access: Access, sourceDigest: string, bytes: Uint8Array, current: () => boolean): Promise<string> {
  const account = authorized(access);
  if (!account || !/^[a-f0-9]{64}$/.test(sourceDigest) || bytes.byteLength > 1024 * 1024 || !current()) throw new Error("The index cannot be safely stored for this session.");
  const indexDigest = await digest(bytes); if (!current()) throw new Error("The session changed before index storage.");
  const db = await open();
  try {
    if (!current()) throw new Error("The session changed before index storage.");
    const write = db.transaction("indexes", "readwrite"), written = fenced(write, access, account), store = write.objectStore("indexes");
    const existing = await get<StoredIndex | undefined>(store.get([account, sourceDigest]));
    if (existing && existing.indexDigest !== indexDigest) { write.abort(); await written.catch(() => {}); throw new Error("The saved index conflicts with this archive."); }
    if (!existing) store.add({ account, sourceDigest, indexDigest, bytes: bytes.slice() } satisfies StoredIndex); await written;
    if (!current()) throw new Error("The session changed before index verification.");
    const read = db.transaction("indexes", "readonly"), readDone = fenced(read, access, account);
    const saved = await get<StoredIndex | undefined>(read.objectStore("indexes").get([account, sourceDigest])); await readDone;
    if (!current() || !saved || saved.account !== account || saved.sourceDigest !== sourceDigest || saved.indexDigest !== indexDigest || !(saved.bytes instanceof Uint8Array) || saved.bytes.length !== bytes.length || await digest(saved.bytes) !== indexDigest) throw new Error("The saved index could not be verified.");
    if (!current()) throw new Error("The session changed after index verification.");
    return indexDigest;
  } finally { db.close(); }
}

/** Read and verify only the authenticated owner's retained index. */
export async function readStoredBrightspaceIndex(access: Access, sourceDigest: string): Promise<Uint8Array | null> {
  const account = authorized(access); if (!/^[a-f0-9]{64}$/.test(sourceDigest)) throw new Error("Invalid source identifier.");
  const db = await open();
  try {
    const transaction = db.transaction("indexes", "readonly"), complete = fenced(transaction, access, account);
    const saved = await get<StoredIndex | undefined>(transaction.objectStore("indexes").get([account, sourceDigest])); await complete;
    if (!saved) return null;
    if (saved.account !== account || saved.sourceDigest !== sourceDigest || !(saved.bytes instanceof Uint8Array) || saved.bytes.length > 1024 * 1024 || await digest(saved.bytes) !== saved.indexDigest || authorized(access) !== account) throw new Error("The saved index could not be verified.");
    return saved.bytes.slice();
  } finally { db.close(); }
}

/** Remove only the authenticated owner's retained index. */
export async function deleteStoredBrightspaceIndex(access: Access, sourceDigest: string): Promise<void> {
  const account = authorized(access); if (!/^[a-f0-9]{64}$/.test(sourceDigest)) throw new Error("Invalid source identifier.");
  const db = await open();
  try { const transaction = db.transaction("indexes", "readwrite"), complete = fenced(transaction, access, account); transaction.objectStore("indexes").delete([account, sourceDigest]); await complete; }
  finally { db.close(); }
}
