// Persist a user-picked backup directory handle across sessions (IndexedDB),
// and write finished recordings into it. Chrome/Edge only; callers must
// handle null/unsupported gracefully.

export type DirHandle = FileSystemDirectoryHandle;

const DB = "ta-backup";
const STORE = "handles";
const KEY = "recordings-dir";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function backupSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickBackupDir(): Promise<DirHandle | null> {
  const w = window as unknown as { showDirectoryPicker?: (o?: { mode?: string }) => Promise<DirHandle> };
  if (!w.showDirectoryPicker) return null;
  const h = await w.showDirectoryPicker({ mode: "readwrite" });
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(h, KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  return h;
}

export async function loadBackupDir(): Promise<DirHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).get(KEY);
      rq.onsuccess = () => res((rq.result as DirHandle) ?? null);
      rq.onerror = () => rej(rq.error);
    });
  } catch {
    return null;
  }
}

export async function clearBackupDir(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function writeToBackupDir(handle: DirHandle, fileName: string, blob: Blob): Promise<void> {
  const h = handle as DirHandle & { queryPermission?: (o: { mode: string }) => Promise<string>; requestPermission?: (o: { mode: string }) => Promise<string> };
  if (h.queryPermission && (await h.queryPermission({ mode: "readwrite" })) !== "granted") {
    if (!h.requestPermission || (await h.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("Backup folder permission was not granted.");
  }
  const file = await handle.getFileHandle(fileName, { create: true });
  const w = await file.createWritable();
  await w.write(blob);
  await w.close();
}
