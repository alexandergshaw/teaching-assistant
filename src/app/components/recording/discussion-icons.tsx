// AC16: the copy affordance swaps the ICON, not the text - "Copied" does not
// fit inside a size="small" IconButton's 30px circle without clipping, and
// the repo's idiom (AiChatWindow.tsx:477-484) is CopyIcon swapping to
// CheckIcon in the same box. Two glyphs, not one.
//
// Shape convention matches courses/icons.tsx exactly: viewBox="0 0 20 20",
// width/height 13, fill="currentColor", aria-hidden="true", focusable="false".
// There is no @mui/icons-material in this repo and one is not being added
// for two glyphs (trade-off 7 in the acceptance criteria). The paths below
// are the same ones AiChatWindow.tsx already draws for this exact concept
// (copy / check), reused rather than redrawn from scratch so the app's two
// "copy this text" affordances render identically.

export function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6A2.5 2.5 0 0 1 18 3.5v8A2.5 2.5 0 0 1 15.5 14h-6A2.5 2.5 0 0 1 7 11.5v-8Zm2.5-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6Z" />
      <path d="M2 7.5A2.5 2.5 0 0 1 4.5 5h.75a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-.75a.75.75 0 0 1 1.5 0v.75A2.5 2.5 0 0 1 10.5 18h-6A2.5 2.5 0 0 1 2 15.5v-8Z" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true" focusable="false">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
    </svg>
  );
}
