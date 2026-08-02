import { createServiceClient } from "@/lib/supabase/server";
import { getUserStyle } from "@/lib/user-style";
import { PROMPT_PREFIX, RESPONSE_PREFIX } from "@/lib/writing-style-prompts";

/**
 * Get the writing style block to inject into LLM prompts.
 * Returns an empty string when there is no usable sample or lookup fails.
 */
export async function getWritingStyleBlock(userId: string): Promise<string> {
  try {
    const supabase = createServiceClient();
    const style = await getUserStyle(supabase, userId);
    if (!style?.writingSample) return "";

    const lines = style.writingSample.split("\n");
    let sample = lines
      .filter((line) => !line.startsWith(PROMPT_PREFIX))
      .map((line) =>
        line.startsWith(RESPONSE_PREFIX)
          ? line.slice(RESPONSE_PREFIX.length).trimStart()
          : line
      )
      .join("\n")
      .trim();

    if (!sample) return "";
    if (sample.length > 1500) sample = sample.slice(0, 1500) + "...";

    return `\n\nMATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE (tone, rhythm, vocabulary) shown in this sample:\n${sample}`;
  } catch {
    return "";
  }
}
