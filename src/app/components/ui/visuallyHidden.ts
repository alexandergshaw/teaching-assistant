import type { CSSProperties } from "react";

// docs/recording-controls-ux-acceptance-criteria.md CC12: lifted from
// DiscussionRepliesPanel.tsx:89-99 (a second copy lives at
// DiscussionReplyRow.tsx:90). There is no .srOnly class in this repo - this
// inline clip-rect object is the app's own idiom (StagePanel.tsx:539-562).
export const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};
