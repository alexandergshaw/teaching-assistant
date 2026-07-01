/**
 * Deterministic meeting-request detection for the Embedded Deterministic Engine.
 *
 * The LLM version decides whether the most recent message in a conversation is
 * asking the instructor to meet live. This is the rule-based counterpart: it
 * scans the latest message for meeting-intent language (video/phone calls, office
 * hours, "can we talk", scheduling phrases) with no model call. The same thread
 * always yields the same verdict.
 *
 * Costs are asymmetric and small: a false positive only highlights the scheduler,
 * a false negative just leaves it unset, so the classifier favors clear signals
 * over guesswork.
 */

export interface MeetingDetection {
  isMeetingRequest: boolean;
  /** 0..1 — how strongly the latest message reads as a request to meet live. */
  confidence: number;
}

// Phrases that, on their own, strongly indicate a request to meet synchronously.
const STRONG_SIGNALS: RegExp[] = [
  /\bzoom\b/i,
  /\bgoogle\s+meet\b/i,
  /\bg-?meet\b/i,
  /\b(?:microsoft\s+)?teams\s+(?:call|meeting)\b/i,
  /\bvideo\s+(?:call|chat|conference)\b/i,
  /\bphone\s+call\b/i,
  /\bhop\s+on\s+a\s+call\b/i,
  /\bjump\s+on\s+a\s+call\b/i,
  /\bget\s+on\s+a\s+call\b/i,
  /\bon\s+a\s+(?:quick\s+)?call\b/i,
  /\bgive\s+(?:you|me)\s+a\s+call\b/i,
  /\bcall\s+(?:you|me)\b/i,
  /\boffice\s+hours\b/i,
  /\bcan\s+we\s+(?:talk|chat|meet)\b/i,
  /\bcould\s+we\s+(?:talk|chat|meet)\b/i,
  /\bmeet\s+(?:with\s+you|up|in\s+person)\b/i,
  /\b(?:in[-\s]person|face[-\s]to[-\s]face)\b/i,
  /\bschedule\s+(?:a|some)?\s*(?:time|meeting|call|appointment)\b/i,
  /\bset\s+up\s+(?:a|some)?\s*(?:time|meeting|call)\b/i,
  /\bfind\s+a\s+time\b/i,
  /\bbook\s+(?:a|some)?\s*(?:time|meeting|appointment)\b/i,
  /\bappointment\b/i,
  /\bavailable\s+to\s+(?:meet|chat|talk)\b/i,
  /\bare\s+you\s+(?:free|available)\b/i,
  /\bwhen\s+are\s+you\s+(?:free|available)\b/i,
  /\bwhat(?:'s| is)\s+your\s+availability\b/i,
];

// Softer signals that only count as a request alongside an interrogative or a
// polite-request verb (so "our team meeting notes" does not read as a request).
const WEAK_SIGNALS: RegExp[] = [/\bmeet\b/i, /\bmeeting\b/i, /\btalk\b/i, /\bchat\b/i];

const REQUEST_CONTEXT = /\?|\b(?:can|could|would|should|may|let'?s|want to|would like|i'?d like|please)\b/i;

/**
 * Pull the most recent message out of a thread rendered as "author: body" blocks
 * joined by blank lines (the shape CanvasTab sends). Falls back to the whole text.
 */
function latestMessage(threadText: string): string {
  const blocks = threadText
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const last = blocks.length > 0 ? blocks[blocks.length - 1] : threadText.trim();
  // Drop a leading "Author Name:" label so it is not scanned as message content.
  return last.replace(/^[^:\n]{0,60}:\s*/, "");
}

export function detectMeetingRequestEmbedded(threadText: string): MeetingDetection {
  if (!threadText.trim()) return { isMeetingRequest: false, confidence: 0 };

  const message = latestMessage(threadText);
  const strong = STRONG_SIGNALS.filter((re) => re.test(message)).length;
  if (strong > 0) {
    return { isMeetingRequest: true, confidence: Math.min(0.95, 0.75 + 0.1 * strong) };
  }

  const hasWeak = WEAK_SIGNALS.some((re) => re.test(message));
  if (hasWeak && REQUEST_CONTEXT.test(message)) {
    return { isMeetingRequest: true, confidence: 0.55 };
  }

  return { isMeetingRequest: false, confidence: hasWeak ? 0.3 : 0.05 };
}
