// Icon set for the FAB's quick-actions menu (AiChatFab.tsx /
// FabQuickActionsMenu.tsx). AM11-consistent: 20px box, stroke 1.5,
// throughout - the F5 fix in this pass. Before this fix the dial mixed three
// construction styles (pure solid fills, all-stroke, and stroke/fill
// hybrids) in one column, which read as visually unresolved before any
// glyph was even identified; every icon below is stroke-only now, matching
// RecordingGradingIcon (the one icon that was already AM11-consistent).
//
// LiveClassIcon and ChecklistIcon are NOT here - each is the exported icon
// of the component it visually belongs to (live-class/LiveClassWindow.tsx,
// courses/WeeklyChecklistOverviewModal.tsx) and is fixed in place there,
// same construction-style rule, so the menu and that surface's own header
// never show two different glyphs for the same feature.

// A single, unmistakably one-bubble chat icon - kept distinguishable at
// 20px from RecordingToolsIcon's camera-body-plus-lens shape below (the
// two used to be a filled chat bubble vs. a two-bubble "discussions" glyph
// that were confusable at this size; the merge in F4 removed the
// discussions-specific icon entirely, so that particular confusable pair no
// longer exists).
export function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// An open eye - "can this be read", distinct from every other icon in this
// menu (none of which is about reading/legibility). Both the outline and
// the pupil are stroke now (the pupil used to be a filled dot, the one
// hybrid construction this icon had).
export function LegibilityProbeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// F4: replaces the three separate recording-variant icons (Discussions,
// Announcement, Grading) that used to occupy three of the dial's seven
// slots. A video-camera glyph (body + lens flap) reads as "recording tools"
// without borrowing ChatIcon's speech bubble or LegibilityProbeIcon's eye,
// and is unambiguous at 20px since neither of its two shapes is a bubble or
// a circle-with-lines.
export function RecordingToolsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path
        d="M15 9.5l6-3v11l-6-3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// The FAB's own trigger glyph, replacing MUI's default `Add` ("+") mark
// (F5): a "+" promises "create something new", and nothing in this menu
// creates anything - AM17 exempts brand marks like LogoMark from the icon
// system, but `Add` was never a brand mark, just an unexamined default. A
// sparkle instead reads as "quick actions / assistant", matching the
// AI-adjacent nature of every entry in the menu it opens. 24px (AM11's
// header tier) - the trigger's SIZE was never the flagged violation, only
// its glyph.
export function MenuTriggerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
