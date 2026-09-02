// docs/recording-controls-ux-acceptance-criteria.md section 7: VideoModeSection.tsx:152
// "Remove audio" cloned segAudio, deleted the targeted key off the clone,
// then discarded the clone without ever calling setSegAudio - so the click
// revoked the object URL (a real side effect) but state never changed, and
// the audio player plus the "Remove audio" button both kept rendering as if
// nothing happened. This is the pure state transition, extracted so the fix
// is provable without rendering anything: the caller is responsible for the
// URL.revokeObjectURL side effect and for calling setSegAudio(the result).
export function removeSegmentAudio<T>(
  segAudio: Record<number, T>,
  index: number
): Record<number, T> {
  const next = { ...segAudio };
  delete next[index];
  return next;
}
