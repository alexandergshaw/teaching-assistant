export class GithubReadLimitError extends Error {
  constructor(public readonly kind: "byte-cap" | "deadline" | "redirect" | "invalid-response") { super(kind); }
}
export type GithubBoundedReadContext = { deadline: number; remainingBytes: number; controller: AbortController; dispose: () => void };
export function createGithubBoundedReadContext(deadline: number, remainingBytes: number): GithubBoundedReadContext {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
  return { deadline, remainingBytes, controller, dispose: () => clearTimeout(timer) };
}
export function checkGithubReadDeadline(context: GithubBoundedReadContext): void {
  if (context.remainingBytes <= 0) throw new GithubReadLimitError("byte-cap");
  if (Date.now() >= context.deadline || context.controller.signal.aborted) throw new GithubReadLimitError("deadline");
}
export async function readBoundedResponse(response: Response, context: GithubBoundedReadContext, cap: number): Promise<string> {
  checkGithubReadDeadline(context);
  const limit = Math.min(cap, context.remainingBytes);
  const length = response.headers.get("content-length");
  if (length && Number(length) > limit) { await response.body?.cancel(); throw new GithubReadLimitError("byte-cap"); }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let count = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  context.controller.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      checkGithubReadDeadline(context);
      const { value, done } = await reader.read();
      checkGithubReadDeadline(context);
      if (done) break;
      context.remainingBytes -= value.byteLength; count += value.byteLength;
      if (count > limit || context.remainingBytes < 0) { await reader.cancel(); throw new GithubReadLimitError("byte-cap"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(count); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new GithubReadLimitError("invalid-response"); }
  } finally { context.controller.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}