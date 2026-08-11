// A promise cache keyed by an arbitrary string key (here, a storage object
// path), so concurrent callers asking for the same expensive async value
// share one in-flight load instead of starting a second.
//
// Extracted rather than written fresh: this exact shape - a
// `Map<string, Promise<T>>`, populated with the in-flight promise BEFORE it
// settles so concurrent callers hit the cache instead of racing a second
// load, with the entry evicted on rejection so a retry after a transient
// failure isn't stuck replaying the same error forever - already exists
// twice in this repo: `WorkflowsTab.tsx`'s `courseExportCacheRef` (a
// component-local `useRef`, tied to that component's own course-row lookup)
// and `useCourseImportActions.ts`'s module-level `cartridgeCache`. Both cache
// the exact same value this package also needs (a parsed
// `CartridgeCourseData`, keyed by the export file's storage path) via the
// exact same downloadCourseZipBlob + parseCartridgeBlob pair. Neither is
// importable as-is (one is a React ref inside a component, the other is
// private to its own hook module), so this is the shared, source-agnostic
// version rather than a third hand-rolled copy.

export class KeyedPromiseCache<T> {
  private readonly entries = new Map<string, Promise<T>>();

  /**
   * Returns the cached promise for `key` if one is in flight or already
   * resolved; otherwise calls `load()`, caches the resulting promise
   * immediately (before it settles, so a concurrent caller in the same tick
   * still hits the cache), and returns it.
   *
   * On rejection, the entry is evicted so the NEXT call to `get` with the
   * same key retries `load()` fresh rather than replaying the same failure
   * forever. The eviction only removes the entry if it is still the exact
   * promise that failed - a newer entry for the same key (from an
   * intervening eviction + reload) is never clobbered by a late rejection of
   * an older one.
   */
  get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached) return cached;
    const promise = load();
    this.entries.set(key, promise);
    promise.catch(() => {
      if (this.entries.get(key) === promise) this.entries.delete(key);
    });
    return promise;
  }

  /** True when `key` currently has an entry (in flight or resolved). */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Number of entries currently cached (in flight or resolved). */
  get size(): number {
    return this.entries.size;
  }

  /** Drops every cached entry. Test/debug hook - production callers rely on
   * per-key eviction-on-failure instead. */
  clear(): void {
    this.entries.clear();
  }
}
