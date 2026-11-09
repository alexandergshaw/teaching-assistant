type RouteGuard = () => boolean;
const guards = new Set<RouteGuard>();

/** Register only while a recording announcement is mounted. */
export function registerRecordingRouteGuard(guard: RouteGuard): () => void {
  guards.add(guard);
  return () => { guards.delete(guard); };
}

/** Same-path navigation keeps the mounted announcement and needs no prompt. */
export function allowRecordingRouteChange(currentPath: string, destinationPath: string): boolean {
  if (currentPath === destinationPath) return true;
  for (const guard of guards) if (!guard()) return false;
  return true;
}

export function guardRecordingRouteNavigation(destination: string, event: { preventDefault(): void }): void {
  if (!allowRecordingRouteChange(window.location.pathname, destination)) event.preventDefault();
}
