export function createTakeOperationLock() {
  let held = false;
  return {
    acquire: () => { if (held) return false; held = true; return true; },
    release: () => { held = false; },
    isHeld: () => held,
  };
}

export function acquireExclusive(lock: ReturnType<typeof createTakeOperationLock>, other: ReturnType<typeof createTakeOperationLock>): boolean {
  return !other.isHeld() && lock.acquire();
}
