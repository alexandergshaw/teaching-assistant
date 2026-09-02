"use client";

// docs/recording-controls-ux-acceptance-criteria.md CC17: extracted out of
// DiscussionReplyRow.tsx (which was pressing on the 1000-line ceiling before
// CC20's Redraft cluster - see that file's own header comment on
// recording-split.structure.test.ts's 1000-line gate). Holds the resource
// <ul>, per-resource Insert/Remove, and the retry-links error - everything
// DiscussionReplyRow.tsx used to render beneath the "Search for resources"
// button, unchanged in behaviour.
//
// Memo-safe by construction: every callback prop is expected to be a STABLE
// reference from the row (a useCallback there - see DiscussionReplyRow.tsx's
// own header comment on why its row-updater callbacks must be stable for
// React.memo to actually skip a re-render). This component is exported
// wrapped in memo() for the same reason DiscussionReplyRow.tsx is - the row
// re-renders on every keystroke in its own reply textarea, and that must not
// force this resource list to re-render too.

import { memo } from "react";
import { Button, IconButton } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import { CloseIcon } from "./discussion-icons";
import type { ReplyRow, ReplyResource } from "./discussion-capture";
import { RESOURCE_KIND_LABELS } from "@/lib/resource-kind";

export interface DiscussionReplyResourcesProps {
  /** For per-resource accessible names ("Insert the link X into the reply to
   *  Y", "Remove the link X from the reply to Y") - the row's own
   *  `row.author`, passed as a plain string so an unrelated row's own state
   *  changing never defeats this component's memo. */
  authorName: string;
  resourceState: ReplyRow["resourceState"];
  resourceError: ReplyRow["resourceError"];
  resources: ReplyResource[] | undefined;
  /** Already bound to this row's id by the caller - see
   *  DiscussionReplyRow.tsx's `handleRetryResources`. */
  onRetryResources: () => void;
  /** Already bound to this row's id by the caller - see
   *  DiscussionReplyRow.tsx's `handleInsertResource`. A MOVE, not a copy -
   *  see that function's own doc comment. */
  onInsertResource: (resource: ReplyResource) => void;
  /** Already bound to this row's id by the caller - see
   *  DiscussionReplyRow.tsx's `handleRemoveResource`. */
  onRemoveResource: (url: string) => void;
  /** F6: keyed by url - the focus target after a Remove button unmounts,
   *  registered by the row's own keyed ref map. */
  registerResourceRemoveRef: (url: string, el: HTMLButtonElement | null) => void;
}

function DiscussionReplyResourcesImpl({
  authorName,
  resourceState,
  resourceError,
  resources,
  onRetryResources,
  onInsertResource,
  onRemoveResource,
  registerResourceRemoveRef,
}: DiscussionReplyResourcesProps) {
  return (
    <>
      {/* docs/discussion-reply-resources-acceptance-criteria.md R10:
          resources render beneath the reply, never inside the textbox. */}
      {resourceState === "searching" && <p className={styles.fieldHint}>Finding resources…</p>}
      {/* CC11: the resource-search failure uses the row's own error-text
          idiom (panelStyles.replyErrorText), not styles.error - the same
          consolidation CC11 applies to the reply-draft failure beside it. */}
      {resourceState === "failed" && (
        <p className={panelStyles.replyErrorText}>
          {resourceError}{" "}
          <button type="button" className={styles.linkButton} onClick={onRetryResources}>
            Retry links
          </button>
        </p>
      )}
      {!!resources?.length && (
        <ul className={panelStyles.resourceList}>
          {resources.map((r) => (
            // D11 (AM25, "one styling authority per element"): the outer <li>
            // composes .resourceItem (a flex row) with .resourceItemStacked
            // (column override) for the badge/link/remove line over the note
            // beneath it. The inner row below reuses .resourceItem AGAIN,
            // unstacked, which is exactly the flex-row/center/gap-2/min-w-0
            // recipe that line needs - no new class, CC3's own rule against
            // a second styling authority satisfied by reusing the one that
            // already says this, rather than restating it as an inline style.
            <li key={r.url} className={`${panelStyles.resourceItem} ${panelStyles.resourceItemStacked}`}>
              <div className={panelStyles.resourceItem}>
                <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>{RESOURCE_KIND_LABELS[r.kind]}</span>
                {/* CC3: `minWidth: 0` is the one inline style CC3 itself
                    exempts (a residual on a flex child, not a layout job) -
                    without it the ellipsis rule on `.resourceItem a`
                    (DiscussionRepliesPanel.module.css) has nothing to clip
                    against inside a flex row. */}
                <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ minWidth: 0 }}>
                  {r.title}
                </a>
                {/* Resource-controls feature: one-click insert. A MOVE (see
                    onInsertResource's own doc comment) - this button and its
                    resource both disappear from this list the moment it is
                    clicked, which is what makes a second click on the SAME
                    resource structurally impossible rather than merely
                    discouraged. Text label, not icon-only: "Insert" has no
                    standard, instantly-recognizable glyph in this app's
                    existing icon set. */}
                <Button size="small" variant="text" style={{ minWidth: 0 }} aria-label={`Insert the link ${r.title} into the reply to ${authorName}`} onClick={() => onInsertResource(r)}>
                  Insert
                </Button>
                {/* F6: keyed by url, mirroring registerRemoveRef's row-scoped
                    pattern in DiscussionReplyRow.tsx - the focus target after
                    THIS button unmounts. CC14: gains a `title` alongside its
                    `aria-label` - every icon-only control on this surface
                    carries both. */}
                <IconButton
                  size="small"
                  ref={(el) => registerResourceRemoveRef(r.url, el)}
                  title={`Remove ${r.title}`}
                  aria-label={`Remove the link ${r.title} from the reply to ${authorName}`}
                  onClick={() => onRemoveResource(r.url)}
                >
                  <CloseIcon />
                </IconButton>
              </div>
              {/* F4 fix: `note` is the one piece of evidence the gathering
                  pass produced for why this resource fits THIS post (R3/AC
                  R0-5) - it was gathered, persisted and unit-tested but never
                  rendered, leaving the instructor's remove decision (R10) a
                  coin flip on the title alone. Reuses the existing fieldHint
                  style rather than adding a class. Never copied to the
                  clipboard - replyClipboardText deliberately excludes it
                  (R9b). `.fieldHint` already sets `margin: 0` (CC3: no
                  redundant inline restatement). */}
              {r.note && <p className={styles.fieldHint}>{r.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default memo(DiscussionReplyResourcesImpl);
