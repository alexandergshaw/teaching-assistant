"use client";

// Bulk bar row for scanning the current selection for visualizer coverage
// and, per its two halves, linking already-covered concepts into a Canvas
// module or creating pages for the missing ones in the visualizer's own
// GitHub repo (docs/visualizer-coverage-from-selection-acceptance-criteria.md,
// Contract 4). Visual/structural sibling of DownloadSelectionSection.tsx
// (read its WHOLE header comment before this was written) - the SAME
// aria-disabled + visible aria-describedby-linked reason idiom for a
// permanently unavailable control, the SAME native `disabled` for the
// transient busy state only, and the SAME "activation always calls the
// handler" rule: onClick below never guards itself - useVisualizerCoverage's
// own scan/link/create each make that decision, exactly as that file's
// header comment (and DownloadSelectionSection's) require.
//
// RENDERS NO MODAL, DIALOG, POPOVER OR FIXED-POSITION OVERLAY (D4) - this row
// lives inside ModulesView's sticky, backdrop-filtered header, which IS the
// containing block for `position: fixed` descendants (see
// GeneratedPreviewModal.tsx's own header comment, and
// generatedPreviewModal.wiring.test.ts, which fails any header-rendered
// component containing `styles.previewBackdrop`). Nothing here needs one:
// the two-click confirmation for `link`/`create` is reported both through
// `setNote` (the hook - kept as a secondary channel) AND, now, through this
// row's OWN locally-rendered `role="status" aria-live="polite"` banner below
// (blocker 1(b), see docs/visualizer-coverage-from-selection-acceptance-
// criteria.md's verified-findings pass) - `setNote`'s own rendered location
// (ContentTab.tsx) sits outside this row's sticky header and outside any
// aria-live region, so a user scrolled into the module list, or a
// screen-reader user, could see/hear a click succeed while never seeing/
// hearing what it armed. The banner here is colocated with the button and IS
// aria-live, and the button's own label ALSO swaps on `linkArmed`/
// `createArmed` (see below) - three independent, redundant signals for the
// one confirmation this repo relies on before an LLM commits to an external
// repo it does not own.
//
// THE CREATE CONTROL NAMES THE EXTERNAL REPO IN ITS OWN LABEL, ALWAYS
// VISIBLE - never only in a `title` tooltip, which does not surface on
// keyboard focus (the same rule DownloadSelectionSection's own header
// comment states for its unavailable-reason text). Creating a page is an
// LLM-authored write into a repository this project does not own, and the
// AC this row implements requires that fact be stated PLAINLY BEFORE the
// click, not discoverable only from the result. useVisualizerCoverage's own
// confirmation note (fired on the first, arming click) restates it a second
// time, in case the always-visible label alone is missed.
//
// THE MODULE-TARGET SELECT PERSISTS NOTHING (no `ta-` localStorage key) - see
// useVisualizerCoverage.ts's own header comment on `moduleChoice` for the
// full reasoning (it mirrors useLmsGeneration's own un-persisted
// postModuleChoice); this row just renders whatever the hook already
// decided.
//
// THIS IS THE ONE GROUP WHOSE TIER CHANGES AT RUNTIME (docs/bulk-bar-
// reorganization-acceptance-criteria.md section 3b/D1). Everything below is
// wrapped in <BulkBarGroup> using the "visualizerCoverage" entry from
// BULK_BAR_GROUPS (bulkBarGroupCatalog.ts) - read-only before a scan (just
// the Scan button), fan-out-write and then destructive after one, once Link
// and/or Create become offerable, because both already carry a two-click
// confirm-arm for a write this app cannot undo from here. This file makes NO
// tier/collapse/open DECISION of its own - groupTier/mayCollapse/groupOpen
// (all pure functions in ./bulkBarGroups) are the only place that happens.
// This file's own job is only to supply the two inputs those functions need
// that it alone has: `facts` (the bulk bar's shared fact bag, computed once
// in ModulesView and threaded through unmodified - this row never derives
// its own competing visible/tier gate from `coverage`/`busy` directly) and
// `runtime` (this group's OWN busy/armed/hasUnavailableReason signals,
// derived below from props this row already receives from its own hook -
// `useVisualizerCoverage` IS this group's "own hook" D1 refers to, so no
// extra prop is needed for `runtime`). `groupsState` is the single
// useBulkBarGroups(courseUrl) instance ModulesView owns (section 3b/D3 -
// called exactly once, never per-group), threaded down so this row's
// <BulkBarGroup> reads/writes the SAME persisted open/closed map every
// other group shares.
//
// AC2's heading is now BulkBarGroup's own summary/heading (group.label,
// "Visualizer coverage", from the catalog) - the old `.bulkLabel` span that
// used to open this row's JSX is deleted rather than duplicated.
import { Button, MenuItem, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import { BulkBarGroup } from "./BulkBarGroup";
import { groupById, type BulkBarFacts, type BulkBarGroupRuntime } from "./bulkBarGroups";
import type { BulkBarGroupsApi } from "./useBulkBarGroups";
import { conceptsForCreate, type VisualizerCoverageBusy } from "./useVisualizerCoverage";
import type { SelectionCoverage } from "@/lib/visualizer/selection-coverage";

export interface VisualizerCoverageSectionProps {
  busy: VisualizerCoverageBusy;
  coverage: SelectionCoverage | null;
  onScan: () => void;
  onLink: () => void;
  onCreate: () => void;
  moduleChoice: string;
  onModuleChoiceChange: (v: string) => void;
  moduleOptions: Array<{ id: number; name: string }>;
  /** Why the Link control cannot be used right now, or null when it can -
   * from useVisualizerCoverage's own computeLinkUnavailableReason. A reason
   * STRING rather than a plain boolean, on purpose: the hook, not this
   * component, owns the decision of WHY a control might be unavailable - see
   * this file's own header comment and DownloadSelectionSection's. */
  linkUnavailableReason: string | null;
  /** Same as linkUnavailableReason, for the Create control. */
  createUnavailableReason: string | null;
  /** Blocker 1(a)/(c): true from the arming click until `onLink` either
   * commits or is superseded - swaps this row's own button label AND drives
   * the locally-rendered, aria-live confirmation banner below (blocker
   * 1(b) - see this file's own header comment on why that banner, not just
   * `setNote`, is what makes the confirmation actually visible). */
  linkArmed: boolean;
  /** Same as linkArmed, for `onCreate`. */
  createArmed: boolean;
  /** The bulk bar's shared fact bag (docs/bulk-bar-reorganization-
   * acceptance-criteria.md section 3b/D1), computed ONCE in ModulesView and
   * threaded, unmodified, into this group's <BulkBarGroup> - see this
   * file's own header comment. This row reads none of its fields directly;
   * it only forwards the object to groupTier/mayCollapse/groupOpen. */
  facts: BulkBarFacts;
  /** The single useBulkBarGroups(courseUrl) instance ModulesView owns
   * (section 3b/D3), threaded down so this row's <BulkBarGroup> shares the
   * one persisted open/closed map with every other group instead of racing
   * its own. */
  groupsState: BulkBarGroupsApi;
}

/** Assigns a stable DOM id to each DISTINCT reason among the two controls -
 * mirrors DownloadSelectionSection's own `reasonIds`, so two controls
 * unavailable for the identical reason share one rendered hint instead of
 * repeating the sentence. */
function reasonIds(reasons: Array<string | null>): Map<string, string> {
  const unique = [...new Set(reasons.filter((reason): reason is string => reason !== null))];
  return new Map(unique.map((reason, index) => [reason, `visualizer-coverage-reason-${index}`]));
}

export function VisualizerCoverageSection({
  busy,
  coverage,
  onScan,
  onLink,
  onCreate,
  moduleChoice,
  onModuleChoiceChange,
  moduleOptions,
  linkUnavailableReason,
  createUnavailableReason,
  linkArmed,
  createArmed,
  facts,
  groupsState,
}: VisualizerCoverageSectionProps) {
  const unavailableSx = { color: "var(--text-secondary)", borderColor: "var(--text-secondary)" } as const;

  const coveredCount = coverage?.covered.length ?? 0;
  // Reuses the hook's OWN routing function rather than a second, locally
  // hand-rolled filter - the same "no-match" split `create()` itself acts
  // on, so this row's displayed count can never drift from what a click
  // would actually send (D2's own "swap defect" concern, applied to display
  // as well as to dispatch).
  const creatableGaps = coverage ? conceptsForCreate(coverage) : [];
  const notCreatableCount = (coverage?.gaps.length ?? 0) - creatableGaps.length;

  // Both follow-up controls are only worth rendering once a scan has
  // actually reported the corresponding half - before that, `coverage` is
  // null (or empty) and both would just repeat what the Scan button's own
  // hint already says. Their OWN unavailable-reason text still handles every
  // other refusal (no target resolved, every gap topic-not-creatable, an
  // export-sourced course) once they do render.
  const showLink = coverage !== null && coveredCount > 0;
  // NIT 15: gated on actually-creatable gaps, not on "any gap at all" - a
  // scan whose every gap matched a not-creatable topic must never render a
  // "Create 0 pages…" button. The explanation of why is a SEPARATE
  // condition below, so it still renders even when the button itself does
  // not (see `showNotCreatableHint`).
  const showCreate = creatableGaps.length > 0;
  const showNotCreatableHint = coverage !== null && notCreatableCount > 0;

  // SHOULD-FIX 9: only the reasons belonging to a control that IS rendered
  // ever get an id/hint span - before any scan (or once a scan clears both
  // halves), neither showLink nor showCreate is true, so `ids` is empty and
  // no hint text or dangling aria-describedby is rendered for a control that
  // is not on screen.
  const ids = reasonIds([showLink ? linkUnavailableReason : null, showCreate ? createUnavailableReason : null]);

  const moduleLabel = moduleOptions.find((m) => String(m.id) === moduleChoice)?.name ?? moduleChoice;

  // D1's three force-open signals, derived from THIS group's own hook
  // output (already threaded above as props) rather than from a second,
  // freshly-invented source - `busy`/`linkArmed`/`createArmed` are exactly
  // the props useVisualizerCoverage already returns, and `ids` (just above)
  // is already the SAME "is a shown control's reason non-null" computation
  // this row uses to decide whether to render a hint span at all, reused
  // here rather than re-derived a second way.
  const runtime: BulkBarGroupRuntime = {
    busy: busy !== "",
    armed: linkArmed || createArmed,
    hasUnavailableReason: ids.size > 0,
  };

  return (
    <BulkBarGroup group={groupById("visualizerCoverage")} facts={facts} runtime={runtime} state={groupsState}>
      <div className={styles.bulkRow}>
        <Button
          variant="outlined"
          size="small"
          onClick={onScan}
          disabled={busy !== ""}
          title="Scan the selected modules/items for concepts a student would understand better from an interactive visual, and check each against the visualizer app - nothing is written anywhere"
        >
          {busy === "scan" ? "Scanning…" : "Scan for visualizer coverage"}
        </Button>

        {showLink && (
          <>
            <TextField
              select
              size="small"
              label="Link into module"
              value={moduleChoice}
              onChange={(e) => onModuleChoiceChange(e.target.value)}
              disabled={busy !== ""}
              sx={{ minWidth: 200 }}
            >
              {moduleOptions.map((m) => (
                <MenuItem key={m.id} value={String(m.id)}>
                  {m.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              size="small"
              onClick={onLink}
              disabled={busy !== ""}
              aria-disabled={linkUnavailableReason ? "true" : undefined}
              aria-describedby={linkUnavailableReason ? ids.get(linkUnavailableReason) : undefined}
              sx={linkUnavailableReason ? unavailableSx : undefined}
              title={
                linkUnavailableReason
                  ? undefined
                  : "Insert links to these already-covered concepts as external-URL items in the chosen Canvas module"
              }
            >
              {busy === "link"
                ? "Linking…"
                : linkArmed
                  ? `Confirm: insert up to ${coveredCount} link${coveredCount === 1 ? "" : "s"} into "${moduleLabel}"`
                  : `Link ${coveredCount} covered concept${coveredCount === 1 ? "" : "s"} into module`}
            </Button>
          </>
        )}

        {/* Blocker 1(b): a local, aria-live confirmation - colocated with the
            button inside this row (which itself lives in ModulesView's sticky
            header), so a user scrolled into the module list, or a
            screen-reader user, still sees/hears what the arming click just
            armed. Independent of (and in addition to) the button label swap
            above and the hook's own `setNote` message. */}
        {linkArmed && (
          <span role="status" aria-live="polite" className={styles.bulkHint}>
            Click &quot;Link&quot; again to confirm: insert up to {coveredCount} link{coveredCount === 1 ? "" : "s"} into
            &quot;{moduleLabel}&quot;. Nothing has been written yet.
          </span>
        )}

        {showCreate && (
          <Button
            variant="outlined"
            size="small"
            onClick={onCreate}
            disabled={busy !== ""}
            aria-disabled={createUnavailableReason ? "true" : undefined}
            aria-describedby={createUnavailableReason ? ids.get(createUnavailableReason) : undefined}
            sx={createUnavailableReason ? unavailableSx : undefined}
            title={
              createUnavailableReason
                ? undefined
                : "Commits new pages to the visualizer app's own GitHub repository - a separate repo this project does not own"
            }
          >
            {busy === "create"
              ? "Creating…"
              : createArmed
                ? `Confirm: commit ${creatableGaps.length} page${creatableGaps.length === 1 ? "" : "s"} to the visualizer's GitHub repo`
                : `Create ${creatableGaps.length} page${creatableGaps.length === 1 ? "" : "s"} in the visualizer's GitHub repo`}
          </Button>
        )}

        {createArmed && (
          <span role="status" aria-live="polite" className={styles.bulkHint}>
            Click &quot;Create&quot; again to confirm: commit {creatableGaps.length} new page
            {creatableGaps.length === 1 ? "" : "s"} to the visualizer app&apos;s own GitHub repository (not this
            project&apos;s repo, and not Canvas). This writes outside this project and cannot be undone from here.
          </span>
        )}

        {[...ids.entries()].map(([reason, id]) => (
          <span key={id} id={id} className={styles.bulkHint}>
            {reason}
          </span>
        ))}

        {showNotCreatableHint && (
          <span className={styles.bulkHint}>
            {notCreatableCount} missing concept{notCreatableCount === 1 ? "" : "s"} matched a visualizer topic that
            cannot receive a new page, so {notCreatableCount === 1 ? "it isn't" : "they aren't"} offered above.
          </span>
        )}

        {/* SHOULD-FIX 3 / A5: name WHICH concepts were found, not only counts -
            covered concepts link to the visualizer page that already covers
            them, gap concepts render as plain text (there is nothing to link
            to yet). Without this, an instructor arms/confirms a write (blocker
            1) for a set of concepts they were never shown by name. */}
        {coverage !== null && coverage.covered.length > 0 && (
          <span className={styles.bulkHint}>
            Already covered:{" "}
            {coverage.covered.map((c, i) => (
              <span key={c.url}>
                {i > 0 ? ", " : ""}
                <a href={c.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)" }}>
                  {c.label || c.concept}
                </a>
              </span>
            ))}
          </span>
        )}

        {coverage !== null && coverage.gaps.length > 0 && (
          <span className={styles.bulkHint}>Missing: {coverage.gaps.map((g) => g.concept).join(", ")}</span>
        )}

        <span className={styles.bulkHint}>
          Scanning is read-only - nothing is written to Canvas, to Supabase Storage, or to the course tile. Linking
          writes only to this Canvas course. Creating writes new pages directly to the visualizer app&apos;s own,
          separate GitHub repository - never to Canvas and never to this project&apos;s own repo.
        </span>
      </div>
    </BulkBarGroup>
  );
}
