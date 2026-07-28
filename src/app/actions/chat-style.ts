"use server";

// Status reporting for the FAB chat's writing-tone chip
// (AiChatWindow.tsx / AiChatFab.tsx). Deliberately its own file rather than
// another export on shared.ts: this is the only server call the chat UI
// makes for display purposes, and it has no other caller.

import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./shared";

export interface ChatToneStatus {
  /** True when a non-empty writing-style block would be fed to the model. */
  active: boolean;
}

/**
 * Report whether the FAB/selection chat (`/api/ai-chat`) is actually
 * injecting the instructor's writing tone right now.
 *
 * This calls the exact same `getWritingStyleBlock` the route calls and
 * reports "active" only when it comes back non-empty — there is no second,
 * independent notion of "has a sample" here, so the chip can never claim
 * the tone is applied when the route silently sent nothing (and vice
 * versa). An anonymous session or a failed lookup both resolve to
 * `{ active: false }` rather than throwing.
 */
export async function getChatToneStatusAction(): Promise<ChatToneStatus> {
  try {
    const user = await requireOwner();
    const styleBlock = await getWritingStyleBlock(user.id);
    return { active: styleBlock.length > 0 };
  } catch {
    return { active: false };
  }
}
