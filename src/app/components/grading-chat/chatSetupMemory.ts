// GRADING-CHAT smoothing W1 (R2): the chat's scoped setup memory. Wraps the
// shared rubric-memory leaf under ONE key owned by this surface, scoped by the
// Canvas URL the chat knows. It never touches the two older global slots the
// panel reads once at start, and it never claims the requested scope on a
// last-used fallback (describeRubricOrigin names the scope it really came from).
//
// Do not copy the shared leaf's prose about other surfaces' keys into this
// directory: the key canary scans raw source and would count them.
import {
  describeRubricOrigin,
  loadRubricMemory,
  saveRubricMemory,
  type LoadedRubricMemory,
} from "@/lib/grade/rubric-memory";
import { parseCanvasUrl } from "@/lib/canvas-url";

export const CHAT_RUBRIC_MEMORY_KEY = "ta-grading-chat-rubric-memory";

/** "" (nothing known yet) for a blank or non-Canvas url, else "canvas:" + the trimmed url. */
export function deriveChatScope(canvasUrl: string): string {
  const trimmed = canvasUrl.trim();
  if (!trimmed || !parseCanvasUrl(trimmed)) return "";
  return "canvas:" + trimmed;
}

export function saveChatSetupMemory(
  scope: string,
  entry: { rubric: string; instructions?: string },
): void {
  saveRubricMemory(CHAT_RUBRIC_MEMORY_KEY, scope, entry);
}

export function loadChatSetupMemory(scope: string): LoadedRubricMemory | null {
  return loadRubricMemory(CHAT_RUBRIC_MEMORY_KEY, scope);
}

export function describeChatSetupOrigin(loaded: LoadedRubricMemory, requestedScope: string): string {
  return describeRubricOrigin(loaded, requestedScope);
}
