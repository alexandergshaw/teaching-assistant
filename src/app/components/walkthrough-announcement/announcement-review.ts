/** Flag possible capture-process references for review without changing student-facing text. */
export function hasCaptureProcessReference(title: string, message: string): boolean {
  return /\b(?:during|in|from|through|after|before|our|my|this|the)\s+(?:(?:this|the|our|my)\s+)?(?:walkthrough|recording|screen[ -]shar(?:e|ing)|screen capture)\b/i.test(`${title}\n${message}`);
}
