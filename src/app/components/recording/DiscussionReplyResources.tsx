"use client";

// docs/recording-controls-ux-acceptance-criteria.md CC17: extracted out of
// DiscussionReplyRow.tsx (which was pressing on the 1000-line ceiling before
// CC20's Redraft cluster - see that file's own header comment on
// recording-split.structure.test.ts's 1000-line gate). Holds the search-terms
// chip row, the "Search for resources" button, the resource <ul>, per-resource
// Insert/Remove, and the retry-links error.
//
// docs/reply-resource-concepts-acceptance-criteria.md RC6: the "Search for
// resources" button and its `.ghActions` row MOVED here from
// DiscussionReplyRow.tsx, so the chip row (the terms the search actually
// used) sits directly above the button that dispatches the next one, and
// everything this component renders - chips, button, "Finding resources…"
// hint, retry-links error, the explanatory lines, then the list - lives
// beneath the reply in one block, unchanged in behaviour otherwise.
//
// Memo-safe by construction: every callback prop is expected to be a STABLE
// reference from the row (a useCallback there - see DiscussionReplyRow.tsx's
// own header comment on why its row-updater callbacks must be stable for
// React.memo to actually skip a re-render). This component is exported
// wrapped in memo() for the same reason DiscussionReplyRow.tsx is - the row
// re-renders on every keystroke in its own reply textarea, and that must not
// force this resource list to re-render too.

import { Fragment, memo } from "react";
import { Button, IconButton } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import { CloseIcon } from "./discussion-icons";
import type { ReplyRow, ReplyResource } from "./discussion-capture";
import { RESOURCE_KIND_LABELS } from "@/lib/resource-kind";
import { visuallyHidden } from "../ui/visuallyHidden";
// F7 fix (fixer pass, RC4/RC7): the "; " concepts joiner is owned by
// discussion-serialization.ts, not restated here - see that file's own
// comment on `CONCEPT_JOINER`. This use is a COMPARISON (against
// `resourceQuery`), not a rendering, so a drifted literal here would not
// fail loudly - it would make `showStaleQuery` permanently right or
// permanently wrong.
import { CONCEPT_JOINER } from "./discussion-serialization";

// RC6: the chip row's own explanation, read in the reading flow (not via
// `aria-describedby` on a non-focusable span, which assistive tech ignores -
// see the chip row's own comment below) and echoed as a `title` for pointer
// users.
const SEARCH_TERMS_HINT = "Resource searches use these terms from the drafted reply. Editing the reply clears them.";

export interface DiscussionReplyResourcesProps {
  /** For per-resource accessible names ("Insert the link X into the reply to
   *  Y", "Remove the link X from the reply to Y") - the row's own
   *  `row.author`, passed as a plain string so an unrelated row's own state
   *  changing never defeats this component's memo. */
  authorName: string;
  resourceState: ReplyRow["resourceState"];
  resourceError: ReplyRow["resourceError"];
  resources: ReplyResource[] | undefined;
  /** RC3/RC6: the one-to-three noun phrases the drafting model named for
   *  THIS generated reply - `undefined`/`[]` when a hand edit cleared them
   *  or none were ever drafted. Rendered as the chip row whenever non-empty,
   *  in every `resourceState`. */
  concepts: ReplyRow["concepts"];
  /** RC3/RC6: the exact text the LAST resource search sent - drives the
   *  "Links below came from an earlier search for: ..." explanatory line. */
  resourceQuery: ReplyRow["resourceQuery"];
  /** RC3/RC6: which base the LAST search used - `"concepts"`, `"post"` or
   *  `"post-reply"`. Together with `concepts` this decides which (if any) of
   *  the three explanatory lines applies; the three are mutually exclusive
   *  by construction on this field. */
  resourceQuerySource: ReplyRow["resourceQuerySource"];
  /** RC6: dispatches this row's targeted resource search - already bound to
   *  this row's id by the caller (`useCallback(() => onSearchRow(row.id),
   *  [onSearchRow, row.id])`, mirroring `onRetryResources` below). */
  onSearch: () => void;
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
  concepts,
  resourceQuery,
  resourceQuerySource,
  onSearch,
  onRetryResources,
  onInsertResource,
  onRemoveResource,
  registerResourceRemoveRef,
}: DiscussionReplyResourcesProps) {
  const searching = resourceState === "searching";
  const hasConcepts = !!concepts?.length;
  const hasResources = !!resources?.length;
  // RC6: the three explanatory lines, mutually exclusive by construction on
  // `resourceQuerySource` (a row's last search recorded exactly one source)
  // and never shown while a search is in flight - the "Finding resources…"
  // hint below already covers that case.
  const showClearedByEdit = !hasConcepts && resourceQuerySource === "concepts";
  // F2 fix (fixer pass): a prose-sourced search (`"post"`/`"post-reply"`)
  // used to only disclose itself when the row also had no concepts. That
  // left a silent gap: a row can carry concepts (the newest drafted reply)
  // while its LAST search still recorded a prose source with no resources
  // yet - the chip row's own hint claims "searches use these terms", which
  // was untrue for that search. The predicate now fires for ANY prose
  // source except the one case the stale-query line (below) already covers
  // on its own - a prose search that already returned resources under
  // concepts that have since diverged - so the fallback is always disclosed
  // exactly once.
  const sourceIsProse = resourceQuerySource === "post" || resourceQuerySource === "post-reply";
  const showNoTermsDrawn = sourceIsProse && !(hasConcepts && hasResources);
  const showStaleQuery = hasConcepts && hasResources && !!resourceQuery && resourceQuery !== (concepts ?? []).join(CONCEPT_JOINER);

  return (
    <>
      {/* RC6: the search-terms chip row - renders whenever the row has
          concepts, in every resourceState. `title` serves a pointer user;
          the actual description assistive tech reads is the visually-hidden
          span LAST in this same container, in the normal reading flow -
          `aria-describedby` on a non-focusable span is ignored by assistive
          tech, so it is deliberately not used here (see
          ui/visuallyHidden.ts's own comment for the same reasoning applied
          elsewhere in this feature). */}
      {hasConcepts && (
        <span className={styles.ghBadges} title={SEARCH_TERMS_HINT}>
          <span className={styles.ghMeta}>Search terms:</span>
          {(concepts ?? []).map((term) => (
            <Fragment key={term}>
              <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>{term}</span>
              {/* Visually-hidden separator so a screen reader does not run
                  adjacent chip text together as one word. */}
              <span style={visuallyHidden}>, </span>
            </Fragment>
          ))}
          <span style={visuallyHidden}>{SEARCH_TERMS_HINT}</span>
        </span>
      )}

      {/* Resource-controls feature: per-row targeted search, sharing this
          component's own resourceState rendering for its pending/failed
          feedback. Disabled while already searching. CC3: the wrapping
          `.ghActions` div is the "flex: none" authority that replaces the
          old inline `alignSelf: "flex-start"` on the button itself. */}
      <div className={styles.ghActions}>
        <Button
          size="small"
          variant="text"
          style={{ minWidth: 0 }}
          disabled={searching}
          aria-label={`Search for resources for the reply to ${authorName}`}
          onClick={onSearch}
        >
          Search for resources
        </Button>
      </div>

      {/* docs/discussion-reply-resources-acceptance-criteria.md R10:
          resources render beneath the reply, never inside the textbox. */}
      {searching && <p className={styles.fieldHint}>Finding resources…</p>}
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
      {/* RC6: at most one of these three fires, and never while `searching`
          (the hint above already covers that case). */}
      {!searching && showClearedByEdit && (
        <p className={styles.fieldHint}>Search terms cleared - the next search uses your edited reply.</p>
      )}
      {!searching && showNoTermsDrawn && (
        <p className={styles.fieldHint}>
          {resourceQuerySource === "post"
            ? "Searched the post text - no terms were drawn from the reply."
            : "Searched the post and your reply - no terms were drawn from the reply."}
        </p>
      )}
      {/* F3b fix (fixer pass): "a search for" not "an earlier search for" -
          with F3a's whitespace-collapse fix this line can fire for the
          CURRENT search's own concepts (a redraft with the resources
          ingredient off, or a mangled-term mismatch), not only a stale one,
          so "earlier" was no longer always true. */}
      {!searching && showStaleQuery && <p className={styles.fieldHint}>{`Links below came from a search for: ${resourceQuery}`}</p>}
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
