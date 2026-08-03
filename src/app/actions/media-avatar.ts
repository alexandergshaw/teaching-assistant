"use server";

import { requireOwner } from "@/lib/supabase/auth";

// ── HeyGen avatar video ──────────────────────────────────────────────────
// Split out of media.ts (which was pushing the 1000-line cap) with no
// behaviour change - every export below keeps its exact name, signature, and
// semantics from before the split.

/** Whether the HeyGen avatar API is configured (for the UI to gate buttons). */
export async function avatarConfiguredAction(): Promise<{ configured: boolean }> {
  try {
    await requireOwner();
    return { configured: !!process.env.HEYGEN_API_KEY?.trim() && !!process.env.HEYGEN_AVATAR_ID?.trim() };
  } catch {
    return { configured: false };
  }
}

/**
 * Start a HeyGen avatar video render of a narration script. Returns the job's
 * video id; poll getAvatarVideoStatusAction until it completes. Env:
 * HEYGEN_API_KEY, HEYGEN_AVATAR_ID, optional HEYGEN_VOICE_ID.
 */
export async function generateAvatarVideoAction(
  script: string
): Promise<{ videoId: string } | { error: string }> {
  try {
    await requireOwner();
    const key = process.env.HEYGEN_API_KEY?.trim();
    const avatarId = process.env.HEYGEN_AVATAR_ID?.trim();
    if (!key || !avatarId) return { error: "Avatar generation is not configured. Set HEYGEN_API_KEY and HEYGEN_AVATAR_ID (your avatar's id)." };
    const t = script.trim();
    if (!t) return { error: "Nothing to render." };
    if (t.length > 9000) return { error: "That script is too long for one avatar video (about 9,000 characters max). Trim the narration or split the deck." };
    const voiceId = process.env.HEYGEN_VOICE_ID?.trim();
    const res = await fetch("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        video_inputs: [
          {
            character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
            voice: voiceId ? { type: "text", input_text: t, voice_id: voiceId } : { type: "text", input_text: t },
          },
        ],
        dimension: { width: 1280, height: 720 },
      }),
    });
    const data = (await res.json().catch(() => null)) as { data?: { video_id?: string }; error?: { message?: string } } | null;
    if (!res.ok || !data?.data?.video_id) {
      return { error: `Avatar service error (HTTP ${res.status})${data?.error?.message ? `: ${data.error.message}` : ""}` };
    }
    return { videoId: data.data.video_id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the avatar video." };
  }
}

/** Poll a HeyGen render job. status: processing | completed | failed. */
export async function getAvatarVideoStatusAction(
  videoId: string
): Promise<{ status: string; videoUrl: string | null } | { error: string }> {
  try {
    await requireOwner();
    const key = process.env.HEYGEN_API_KEY?.trim();
    if (!key) return { error: "Avatar generation is not configured." };
    if (!videoId.trim()) return { error: "Missing video id." };
    const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
      headers: { "X-Api-Key": key },
    });
    const data = (await res.json().catch(() => null)) as { data?: { status?: string; video_url?: string | null; error?: { message?: string } | null } } | null;
    if (!res.ok || !data?.data?.status) return { error: `Avatar status error (HTTP ${res.status}).` };
    if (data.data.status === "failed") return { error: `Avatar render failed${data.data.error?.message ? `: ${data.data.error.message}` : ""}.` };
    return { status: data.data.status, videoUrl: data.data.video_url ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check the avatar video." };
  }
}
