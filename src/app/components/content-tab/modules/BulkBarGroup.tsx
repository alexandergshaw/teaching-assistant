"use client";

// The single renderer for all thirteen bulk-bar groups
// (docs/bulk-bar-reorganization-acceptance-criteria.md, AC2/AC3, section
// 3b/D1-D3 - the FINAL contract). Every tier/collapse/open decision is
// delegated to ./bulkBarGroups's own pure functions (groupTier, mayCollapse,
// groupOpen) - this component decides nothing about consequence itself, it
// only renders what those functions return.
//
// AC2, the accessibility fix and the space fix as ONE change: every group,
// collapsible or not, is a real `role="group"` with `aria-labelledby`
// pointing at its own heading, so a screen reader announces a named group
// instead of a flat run of context-free control labels ("Set", "Apply",
// "Move").
//
// HARD RULE (section 3b/D3): NEVER gate the body on `open`. A native
// `<details>` hides its content without unmounting it - the browser does
// that, not React - so `{open && children}` here would be pure regression:
// it would unmount every control in a collapsed group, and a control that
// never mounts never writes its persisted default. `children` below is
// ALWAYS rendered; only the `<details>` element's own `open` attribute
// (native, browser-handled, mirrored from `groupOpen`'s result) controls
// visibility for the collapsible case.
//
// This component is instantiated 13+ times, once per group. The
// open/closed STATE is owned by useBulkBarGroups.ts, called ONCE from
// ModulesView - this component only ever READS that state through the
// `state` prop (`BulkBarGroupsApi`) and writes to it via `setOpen` on the
// native `onToggle` event. It never calls useBulkBarGroups itself.
//
// AC5: MUI is for CONTROLS. `<details>`/`<summary>`/`<section>` here are
// layout, not controls, which is not a conflict with AC5 - section 3b/D2
// states this explicitly so a later reviewer does not re-raise it.
//
// `group.consequenceTag`, when non-null, renders as ALWAYS-VISIBLE text
// inside the heading - never a `title` attribute. Constraint E3 forbids
// converting any reason or disclosure into a tooltip: a `title` is
// unreachable by keyboard and unannounced to a screen reader, which is
// exactly backwards for the highest-consequence groups (this tag is only
// ever populated on a group that can reach fan-out-write or destructive -
// see auditGroupModel's I5 in ./bulkBarGroups).
//
// The CSS classes referenced below (`bulkGroup`, `bulkGroupBody`,
// `bulkGroupStatic`, `bulkGroupHeading`, `bulkGroupTag`, `bulkGroupFanOut`,
// `bulkGroupDanger`) are all defined in page.module.css (the "Bulk bar
// groups" section) and pinned present there by bulkBarCss.test.ts's
// SURVIVING_CLASSES list, so a rename on either side now fails a test
// instead of silently rendering an unstyled group.
import type { ReactNode, SyntheticEvent } from "react";
import styles from "../../../page.module.css";
import {
  groupOpen,
  groupTier,
  mayCollapse,
  type BulkBarFacts,
  type BulkBarGroupDef,
  type BulkBarGroupRuntime,
} from "./bulkBarGroups";
import type { BulkBarGroupsApi } from "./useBulkBarGroups";

export interface BulkBarGroupProps {
  group: BulkBarGroupDef;
  facts: BulkBarFacts;
  runtime: BulkBarGroupRuntime;
  state: BulkBarGroupsApi;
  children: ReactNode;
  /**
   * Step-10 finding 4 (fixer round) - DECISION, recorded here because this
   * is the one component instantiated once per group and is therefore the
   * only place that can either fix or reproduce the bug.
   *
   * The bug: `runtime.busy` used to always render a `role="status"
   * aria-live="polite"` span in the heading below. Several call sites feed
   * this component the SAME shared boolean for MULTIPLE groups at once -
   * BulkItemsSection.tsx passes one section-wide `opBusy` to five of its six
   * groups, BulkModulesSection.tsx passes it to its "modules" group - so one
   * bulk publish/delete/move set that ONE flag true and this component
   * announced "Working..." from every one of those group headings
   * simultaneously: six-plus identical announcements for one operation.
   *
   * Rejected: "give it only to the group that owns the in-flight operation."
   * `opBusy` is a literal `useState(false)` owned by ModulesView itself and
   * shared across BOTH bulk sections (see that file's own comment on it) -
   * it does not carry WHICH group's button was clicked, only "some Canvas
   * write is in flight somewhere in this bar." Inventing an owner id would
   * mean widening BulkBarGroupRuntime (bulkBarGroups.ts, owned by a sibling
   * wave) or threading a new signal through both bulk-action hooks - out of
   * this file's reach and not worth a cross-file contract change for what
   * the simpler option below already fixes.
   *
   * Chosen: ONE status region for the whole bar. ModulesView.tsx renders a
   * single `role="status" aria-live="polite"` span, keyed off ONLY `opBusy`
   * (see the SECOND fixer round note below for why it is ONLY that flag,
   * not OR-ed with anything else), right next to the bar's count-and-Clear
   * line. Every group whose `runtime.busy` is driven purely by that shared
   * flag passes `announceBusy={false}` here -
   * it still shows the plain "Working..." text in its own heading (useful
   * context: which group's controls are currently disabled), it just stops
   * wrapping that text in a SECOND live region that would re-announce the
   * same fact the bar-level one already spoke.
   *
   * Two groups keep `announceBusy` at its default (true) on purpose, because
   * their OWN `runtime.busy` is a signal nobody else in the bar shares:
   * BulkItemsSection's "content" group reacts to `descSharedState ===
   * "loading"` (a description fetch that fires on SELECTION CHANGE, not user
   * action - D6's own note on why this group is never collapsible either),
   * and BulkModulesSection's "addToEach" group reacts to `bulkAiBusy` (its
   * own AI-drafting sub-step). Suppressing those two entirely would silence
   * a real, group-specific announcement.
   *
   * SECOND fixer round (step-10 finding 4, confirmation review): the first
   * pass above fixed the SIX-way duplication but left a smaller version of
   * the same bug - `runtime.busy` for both of these two groups was still the
   * shared `opBusy` OR-ed with the group's own signal, so an unrelated bulk
   * write elsewhere in the bar (`opBusy` true, the group's own signal false)
   * still made the group's heading re-announce the exact fact the bar-level
   * region had just spoken: up to THREE live regions for one write (the
   * bar-level region, plus "content" or "addToEach", plus - for a mixed
   * module+item selection doing a Canvas write - the other section's group
   * too). The fix is at the CALL SITE, not here: `staticRuntime(opBusy ||
   * descSharedState === "loading")` in BulkItemsSection.tsx and `busy: opBusy
   * || bulkAiBusy` in BulkModulesSection.tsx each dropped the `opBusy` term,
   * so `runtime.busy` for these two groups now carries ONLY the fact they
   * alone own. Every fact in the bar now announces from exactly one region:
   * `opBusy` from the bar-level region alone, `descSharedState === "loading"`
   * from "content" alone, `bulkAiBusy` from "addToEach" alone.
   */
  announceBusy?: boolean;
}

function joinClassNames(...names: Array<string | false | undefined>): string {
  return names.filter((name): name is string => Boolean(name)).join(" ");
}

export function BulkBarGroup({ group, facts, runtime, state, children, announceBusy = true }: BulkBarGroupProps) {
  const collapsible = mayCollapse(group, facts);
  const open = groupOpen(group, facts, runtime, state.isOpen(group.id));
  const tier = groupTier(group, facts);
  const headingId = `bulkGroup-heading-${group.id}`;

  // Tier-driven visual weight, per AC1: a fan-out-write group and a
  // destructive group are not the same weight as each other or as anything
  // read-only/reversible-write. Applied on the group's own outer element so
  // it colors the whole group, not just its heading.
  const tierClassName =
    tier === "destructive" ? styles.bulkGroupDanger : tier === "fan-out-write" ? styles.bulkGroupFanOut : undefined;

  const heading = (
    <span id={headingId} className={styles.bulkGroupHeading}>
      {group.label}
      {group.consequenceTag !== null && (
        <span className={styles.bulkGroupTag}> {group.consequenceTag}</span>
      )}
      {runtime.busy && announceBusy && (
        <span role="status" aria-live="polite">
          {" "}
          Working...
        </span>
      )}
      {/* Finding 4's suppressed case: still visible (context for which
          group's controls are currently disabled), just not a second live
          region duplicating the one bar-level announcement ModulesView.tsx
          renders for the shared opBusy signal - see the announceBusy prop's
          own doc comment above. */}
      {runtime.busy && !announceBusy && <span> Working...</span>}
    </span>
  );

  // Step-10 finding 5 (fixer round): this used to branch on `collapsible`
  // between a <section> (not collapsible) and a <details> (collapsible) -
  // two DIFFERENT element types. The visualizer coverage group's own tier
  // is read-only before a scan and destructive after (D1's own header
  // comment), so `mayCollapse` flips from true to false the instant a scan
  // returns - and the instant it does, React reconciles <details> ->
  // <section>: a different host element, so the WHOLE subtree unmounts and
  // remounts. The user's focus (on the Scan button they just pressed) is
  // lost to <body>, guaranteed on every scan. `groupOpen` (./bulkBarGroups)
  // already returns `true` unconditionally whenever `!collapsible`, so
  // `open` needs no ternary here - a non-collapsible group is simply always
  // open by construction.
  //
  // FIX: always render <details>, never <section>. React keeps the SAME
  // host node across a collapsible <-> non-collapsible transition (same
  // element type; only classes/attributes change), so nothing unmounts and
  // focus survives. Semantics are preserved through the SUMMARY, not the
  // element type: a non-collapsible group's <summary> is pulled out of the
  // tab order (`tabIndex={-1}`), its click is prevented (native <details>
  // toggles on a summary click regardless of any CSS `cursor`), and its
  // `onToggle` forces `open` back to `true` synchronously should anything
  // else manage to close it - belt-and-suspenders over the CSS-only
  // affordance removal page.module.css's `.bulkGroupStatic > summary` rule
  // provides (finding 7 - see that rule's own comment for why the OLD
  // `.bulkGroupHeading` padding/cursor lived on the wrong element).
  return (
    <details
      role="group"
      aria-labelledby={headingId}
      className={joinClassNames(
        collapsible ? styles.adaptDisclosure : styles.bulkGroupStatic,
        collapsible ? styles.bulkGroup : undefined,
        tierClassName
      )}
      open={open}
      onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => {
        if (!collapsible) {
          if (!event.currentTarget.open) event.currentTarget.open = true;
          return;
        }
        state.setOpen(group.id, event.currentTarget.open);
      }}
    >
      <summary
        tabIndex={collapsible ? undefined : -1}
        onClick={collapsible ? undefined : (event) => event.preventDefault()}
      >
        {heading}
      </summary>
      <div className={joinClassNames(collapsible ? styles.adaptDisclosureBody : undefined, styles.bulkGroupBody)}>
        {children}
      </div>
    </details>
  );
}
