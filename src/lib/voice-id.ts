// Single source of truth for the user's narration voice ID (cloned or stock).
// When missing from localStorage (new browser, cleared storage), this resolver
// auto-adopts the account's cloned voice if available. The opt-out flag prevents
// re-adoption after the user explicitly stops using a voice.

import { listElevenVoicesAction } from "@/app/actions";

export const VOICE_ID_KEY = "ta-voice-id";
export const VOICE_OPTOUT_KEY = "ta-voice-optout";

export async function resolveVoiceId(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;

  const stored = localStorage.getItem(VOICE_ID_KEY);
  if (stored) return stored;

  if (localStorage.getItem(VOICE_OPTOUT_KEY) === "1") return undefined;

  try {
    const r = await listElevenVoicesAction();
    if ("error" in r) return undefined;

    const cloned = r.voices.find((v) => v.category === "cloned");
    if (cloned) {
      localStorage.setItem(VOICE_ID_KEY, cloned.voiceId);
      return cloned.voiceId;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function setVoiceId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOICE_ID_KEY, id);
  localStorage.removeItem(VOICE_OPTOUT_KEY);
}

export function clearVoiceId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(VOICE_ID_KEY);
  localStorage.setItem(VOICE_OPTOUT_KEY, "1");
}
