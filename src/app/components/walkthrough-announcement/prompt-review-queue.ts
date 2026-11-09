/** Consume only the request displayed by the event handler. */
export function takeDisplayedRequest<T>(queue: T[], displayed: T | null): T | undefined {
  if (displayed === null || queue[0] !== displayed) return undefined;
  return queue.shift();
}
