export interface ReviewScope { snapshotKey: string; name: string }
export interface PackageReview extends ReviewScope { login: string; fingerprint: string; snapshotId?: string; templateDigest?: string | null }
export interface ReconciliationIntent { login: string; name: string; fingerprint: string }

/** snapshotKey is transient exact serialized input, never persisted. */
export function finishPackageReview(captured: ReviewScope, current: ReviewScope, login: string, fingerprint: string): PackageReview | null {
  return captured.snapshotKey === current.snapshotKey && captured.name === current.name ? { ...captured, login, fingerprint } : null;
}
export function reviewIsCurrent(review: PackageReview | null, current: ReviewScope): boolean {
  return !!review && review.snapshotKey === current.snapshotKey && review.name === current.name;
}
export function readReconciliationIntent(raw: string | null, login: string): ReconciliationIntent | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("login" in value) || value.login !== login || !("name" in value) || typeof value.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value.name) || !("fingerprint" in value) || typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.fingerprint)) return null;
    return { login, name: value.name, fingerprint: value.fingerprint };
  } catch { return null; }
}
export function canReconcile(intent: ReconciliationIntent, login: string, fingerprint: string, name: string): boolean {
  return intent.login === login && intent.fingerprint === fingerprint && intent.name === name;
}
/** A refused persistence write prevents egress; a lost response leaves the intent. */
export async function persistThenPublish<T>(intent: ReconciliationIntent, persist: (text: string) => void, send: () => Promise<T>): Promise<T> {
  persist(JSON.stringify({ login: intent.login, name: intent.name, fingerprint: intent.fingerprint }));
  return send();
}

/** Acquire a synchronous single-flight lock before invoking work that may await. */
export async function runSingleFlight(lock: { current: boolean }, operation: () => Promise<unknown>): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  try {
    await operation();
    return true;
  } finally {
    lock.current = false;
  }
}
