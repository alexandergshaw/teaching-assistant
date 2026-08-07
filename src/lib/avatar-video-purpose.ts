// Avatar Studio's purpose catalogue and the pure brief composer that turns a
// prompt + optional course + optional purpose into the instruction text
// handed to the LLM (src/app/actions/media-likeness.ts's
// generateAvatarScriptAction). Kept a PURE module deliberately - no I/O, no
// Date, no randomness - so the thing that actually matters (does the course
// and the purpose genuinely reach the model, not just decorate a dropdown)
// is unit-testable in this repo's node-only vitest environment, which has no
// jsdom and cannot exercise the UI. See avatar-video-purpose.test.ts.
//
// Each purpose's `guidance` is what actually steers the model. It must stay
// SUBSTANTIVE and DISTINCT per purpose - a shared generic line ("make an
// avatar video for this purpose") would make the picker decorative, since
// every choice would produce the same script.

/** Every kind of avatar video the picker offers. `label` is what the
 * dropdown shows a human; `guidance` is the sentence(s) that steer the
 * model - never just the label restated. */
export const AVATAR_VIDEO_PURPOSES = [
  {
    value: "welcome",
    label: "Welcome video",
    guidance:
      "This is a welcome video introducing the course to students who have not met the instructor yet. Set a warm, encouraging tone, introduce yourself briefly, preview what the course covers and how it runs, and tell students what to do first (for example, where to find the syllabus and how to reach you).",
  },
  {
    value: "midterm",
    label: "Midterm check-in",
    guidance:
      "This is a midterm video, sent partway through the term. Acknowledge how the course has gone so far, remind students what the midterm covers and how to prepare for it, and offer a concrete study tip or two. Keep the tone reassuring rather than alarming, even if grades so far have been mixed.",
  },
  {
    value: "finals",
    label: "Finals prep",
    guidance:
      "This is a finals video, sent near the end of the term as students prepare for their final exam or project. Remind students exactly what the final covers, how it is weighted, and what resources - office hours, review sessions, practice materials - are available before it. Close by encouraging students to finish the course strong.",
  },
  {
    value: "explainer",
    label: "Explainer",
    guidance:
      "This is an explainer video walking students through a specific concept, tool, or process. Break the explanation into clear, ordered steps, define any term before relying on it, and end by checking that a student watching alone would be able to repeat the process themselves.",
  },
  {
    value: "assignment-briefing",
    label: "Assignment briefing",
    guidance:
      "This is an assignment briefing video introducing one specific assignment. State exactly what students must submit, the format and length expected, the due date, and the single most common way students lose points on this kind of assignment, so they can avoid it.",
  },
  {
    value: "announcement",
    label: "Announcement",
    guidance:
      "This is a short announcement video communicating a single piece of course news - a schedule change, a policy update, or a logistical heads-up. Lead with the news itself in the first sentence, state plainly what (if anything) students need to do in response, and keep it brief rather than recapping the whole course.",
  },
  {
    value: "weekly-recap",
    label: "Weekly recap",
    guidance:
      "This is a weekly recap video summarizing what happened in class this week and what is coming up next. Name the week's main topic, call out anything due soon, and preview next week so students can prepare before it starts.",
  },
] as const;

export type AvatarVideoPurpose = (typeof AVATAR_VIDEO_PURPOSES)[number]["value"];

/**
 * Compose the instruction text handed to the LLM for a script-generation
 * request. Every field is optional except `prompt` - the instructor's own
 * request always carries through verbatim - and an absent field is OMITTED
 * entirely rather than written as an empty "Course:" / "Purpose:" header or
 * a "(none)" line. That mirrors the reasoning at the top of
 * src/lib/course-facts.ts: a dangling empty header or a "(none)" line reads
 * to the model as a recorded fact ("this request has no course") when it
 * usually just means the field was not selected.
 *
 * `purpose` values not found in AVATAR_VIDEO_PURPOSES (including a stale
 * persisted value from before a purpose was renamed or removed) are treated
 * as no purpose at all, rather than leaking the raw string into the prompt.
 */
export function composeAvatarScriptBrief(input: {
  prompt: string;
  courseFacts: string | null;
  purpose: AvatarVideoPurpose | null;
}): string {
  const sections: string[] = [
    "Write a spoken-word script for a short AI-generated avatar video of a college instructor, speaking directly to camera.",
  ];

  const purposeEntry = AVATAR_VIDEO_PURPOSES.find((p) => p.value === input.purpose);
  if (purposeEntry) {
    sections.push(purposeEntry.guidance);
  }

  const trimmedFacts = input.courseFacts?.trim();
  if (trimmedFacts) {
    sections.push(`What the app knows about this course:\n${trimmedFacts}`);
  }

  sections.push(
    `The instructor's own request, which takes priority over anything above if the two conflict:\n${input.prompt}`
  );

  return sections.join("\n\n");
}
