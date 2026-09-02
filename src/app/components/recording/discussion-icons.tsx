// AC16: the copy affordance swaps the ICON, not the text - "Copied" does not
// fit inside a size="small" IconButton's 30px circle without clipping, and
// the repo's idiom (AiChatWindow.tsx:477-484) is CopyIcon swapping to
// CheckIcon in the same box. Two glyphs, not one.
//
// Shape convention: viewBox="0 0 20 20", fill="currentColor",
// aria-hidden="true", focusable="false". Rendered at 20x20 (AM11, the
// aesthetics pass's icon-box pinning: "20px in toolbars and buttons" - every
// glyph here sits inside a Button's startIcon or a size="small" IconButton).
// This was 13x13 before that pass. AM23 (mid-wave amendment) resolves the
// ambiguity AM11 left open for a control that is both inside an IconButton
// and inside a dense row (16px vs 20px): the rule is 16px, and courses/
// icons.tsx WAS changed to 16px in this same diff. This file is AM23's one
// named exception, staying at 20px, because this cluster contains the copy
// control this repo has already shipped once as "working, correct and
// effectively invisible" - a deliberate visibility fix, not drift. There is
// no @mui/icons-material in this repo and one is not being added for two
// glyphs (trade-off 7 in the
// acceptance criteria). The paths below are the same ones AiChatWindow.tsx
// already draws for this exact concept (copy / check), reused rather than
// redrawn from scratch so the app's two "copy this text" affordances render
// identically in shape (now differing only in the pinned size).

export function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6A2.5 2.5 0 0 1 18 3.5v8A2.5 2.5 0 0 1 15.5 14h-6A2.5 2.5 0 0 1 7 11.5v-8Zm2.5-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6Z" />
      <path d="M2 7.5A2.5 2.5 0 0 1 4.5 5h.75a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-.75a.75.75 0 0 1 1.5 0v.75A2.5 2.5 0 0 1 10.5 18h-6A2.5 2.5 0 0 1 2 15.5v-8Z" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
    </svg>
  );
}

// Reply width UX pass (docs, scratchpad note "reply-width-ux.md" section 5b):
// Move up / Move down convert from labelled Buttons to icon-only IconButtons
// to decongest the header-bar action cluster and let "Copy reply" go first.
// Same shape convention as the two icons above.

export function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M10 3a.75.75 0 0 1 .53.22l5 5a.75.75 0 1 1-1.06 1.06L10.75 5.56V16.25a.75.75 0 0 1-1.5 0V5.56L5.53 9.28a.75.75 0 0 1-1.06-1.06l5-5A.75.75 0 0 1 10 3Z" />
    </svg>
  );
}

export function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M10 17a.75.75 0 0 1-.53-.22l-5-5a.75.75 0 1 1 1.06-1.06l3.72 3.72V3.75a.75.75 0 0 1 1.5 0v10.69l3.72-3.72a.75.75 0 1 1 1.06 1.06l-5 5A.75.75 0 0 1 10 17Z" />
    </svg>
  );
}

// D5 (docs/aesthetics-pass-acceptance-criteria.md section 4b): the per-row
// overflow menu trigger - Remove, plus D1's manual "handled" toggle and D9's
// skip toggle, move behind this. Same 20px shape convention as the rest of
// this file (this cluster is AM23's one named 20px exception - see this
// file's own header).

export function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="4" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="16" cy="10" r="1.6" />
    </svg>
  );
}

// docs/discussion-reply-resources-acceptance-criteria.md R10: one-click
// remove per resource link.

export function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22Z" />
    </svg>
  );
}
