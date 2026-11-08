/** A reset invalidates old owners so their late completion cannot unlock new work. */
export interface IntakeFence { busy: boolean; generation: number }
export function claimIntake(fence: IntakeFence): number | null {
  if (fence.busy) return null;
  fence.busy = true;
  return ++fence.generation;
}
export function releaseIntake(fence: IntakeFence, token: number): boolean {
  if (fence.generation !== token) return false;
  fence.busy = false;
  return true;
}
export function resetIntake(fence: IntakeFence): void {
  fence.generation++;
  fence.busy = false;
}
