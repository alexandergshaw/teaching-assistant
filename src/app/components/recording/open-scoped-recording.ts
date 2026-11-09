/** Open a loaded resource only while its owner, selection, and request are current. */
export async function openScopedRecording<T>(load: () => Promise<T>, isCurrent: () => boolean, open: (item: T) => void, discard: (item: T) => void): Promise<boolean> {
  const item = await load();
  if (!isCurrent()) { discard(item); return false; }
  open(item);
  return true;
}
