"use client";

// Left-pane search box and hit panel of the Knowledge tab, extracted from
// KnowledgeTab.tsx (KNOWLEDGE-SWITCH-SPEED W1) as a pure render move to free
// room under the 1000-line ceiling. No behaviour lives here: the search
// string, the hits, the selection and the open handler are all owned by the
// parent and passed in.

import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import type { PageSearchHit } from "@/lib/knowledge-base";
import styles from "../../page.module.css";
import kbStyles from "../KnowledgeTab.module.css";

interface KnowledgeSearchPanelProps {
  active: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchHits: PageSearchHit[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onOpenHit: (id: string) => void;
}

export default function KnowledgeSearchPanel({
  active,
  search,
  onSearchChange,
  searchHits,
  selectedIds,
  onToggle,
  onOpenHit,
}: KnowledgeSearchPanelProps) {
  return (
    <>
      <TextField
        size="small"
        placeholder={`Search ${active} pages`}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        fullWidth
      />

      {/* K2: wrapped in .kbOverlayAnchor (this file's own class - see its
          doc comment in KnowledgeTab.module.css) so mounting/unmounting
          this panel as the search box is typed into never pushes the
          tree below. */}
      <div className={kbStyles.kbOverlayAnchor}>
        {search.trim() && (
          <div className={`${styles.kbSearchPanel} ${kbStyles.kbOverlayCard}`}>
            {searchHits.length === 0 ? (
              <p className={styles.kbTreeEmpty}>No pages match &ldquo;{search.trim()}&rdquo;.</p>
            ) : (
              searchHits.map((hit) => (
                <div key={hit.page.id} className={kbStyles.kbSearchHitRow}>
                  {/* K6: search used to render a hit panel with no
                      checkboxes at all, so "select the pages matching
                      X" was not expressible without opening each hit
                      from the tree. Wired to the SAME selection
                      toggle() every tree-row checkbox uses. */}
                  <Checkbox
                    size="small"
                    checked={selectedIds.has(hit.page.id)}
                    onChange={() => onToggle(hit.page.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${hit.page.title.trim() || "Untitled page"}`}
                    sx={{ padding: "var(--space-1)", flexShrink: 0 }}
                  />
                  <button
                    type="button"
                    className={`${styles.kbSearchHit} ${kbStyles.kbSearchHitButton}`}
                    onClick={() => onOpenHit(hit.page.id)}
                  >
                    <span className={styles.kbSearchHitTitle}>{hit.page.title.trim() || "Untitled page"}</span>
                    <span className={styles.kbSearchHitSnippet}>{hit.snippet || "No content."}</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
