"use client";

import { useRef } from "react";
import styles from "../../page.module.css";
import { isPlainLeftClick } from "./tab-link";

export interface TabRailOption<T extends string> {
  id: T;
  label: string;
  /** Optional attention count, badged exactly the way the top strip already
   *  badges its own. Omit (or pass 0) for an item with nothing to report. */
  count?: number;
  /** Optional deep link (see tab-link.ts buildTabHref). When present the chip
   *  renders as an anchor so ctrl/cmd/shift/middle click opens a new browser tab. */
  href?: string;
}

/**
 * The ONE navigation level inside a merged top-level tab (D26).
 *
 * It replaces TabSectionSwitch, which named a concept the app no longer has: a
 * user never picks a "section" now, they pick a view, and the section follows
 * from which family that view belongs to (tab-rails.ts). The markup is the
 * same row of chips that switch rendered - and the same the Manual rail,
 * Workflows subnav and Tasks subnav all rendered before D26 deleted them -
 * because after the flattening this row IS all of those, and giving it a
 * second visual language would make one nav level read as several.
 *
 * Presentation only: it owns no state, and the item it renders as selected is
 * whatever useAppNavigation resolved from the URL/localStorage.
 *
 * KEYBOARD. Roving tabindex plus Left/Right/Home/End, the WAI-ARIA tablist
 * pattern. This is NOT decoration: TasksTab's own two-item tablist implemented
 * exactly this (its S12 accessibility pass added it), and folding those two
 * items into this rail would have silently dropped arrow-key movement for them
 * if this row did not carry it. Every other rail this replaces had all chips in
 * the tab order with no arrow keys, which was the non-conformant case; this
 * levels them all up rather than levelling Tasks down.
 */
export function TabRail<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  /** Names the group for screen readers, e.g. "Courses views". */
  ariaLabel: string;
  options: readonly TabRailOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  // Widened from HTMLButtonElement: an option with an href renders an anchor.
  const buttonRefs = useRef<Partial<Record<T, HTMLElement | null>>>({});

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const index = options.findIndex((option) => option.id === value);
    if (index < 0 || options.length === 0) return;
    let next: T;
    if (event.key === "ArrowRight") next = options[(index + 1) % options.length].id;
    else if (event.key === "ArrowLeft") next = options[(index - 1 + options.length) % options.length].id;
    else if (event.key === "Home") next = options[0].id;
    else if (event.key === "End") next = options[options.length - 1].id;
    else return;
    event.preventDefault();
    if (next !== value) onChange(next);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div className={styles.manualSubnav}>
      <div className={styles.lessonInnerTabs} role="tablist" aria-label={ariaLabel}>
        {options.map((option) => {
          const className = `${styles.lessonInnerTab}${option.id === value ? ` ${styles.lessonInnerTabActive}` : ""}`;
          const content = (
            <span className={styles.tabLabelWrap}>
              {option.label}
              {option.count !== undefined && option.count > 0 && (
                <span className={styles.navBadge}>{option.count}</span>
              )}
            </span>
          );
          // With an href the chip is a real anchor: ctrl/cmd/shift/middle click
          // opens that view in a new browser tab natively, while a plain left
          // click is intercepted and switches in-app as before.
          if (option.href !== undefined) {
            return (
              <a
                key={option.id}
                href={option.href}
                role="tab"
                ref={(el) => {
                  buttonRefs.current[option.id] = el;
                }}
                aria-selected={option.id === value}
                tabIndex={option.id === value ? 0 : -1}
                className={className}
                style={{ textDecoration: "none" }}
                onClick={(e) => {
                  if (!isPlainLeftClick(e)) return;
                  e.preventDefault();
                  onChange(option.id);
                }}
                onKeyDown={handleKeyDown}
              >
                {content}
              </a>
            );
          }
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              ref={(el) => {
                buttonRefs.current[option.id] = el;
              }}
              aria-selected={option.id === value}
              // Roving tabindex: exactly one chip is in the tab order, and the
              // arrow keys move between the rest.
              tabIndex={option.id === value ? 0 : -1}
              className={className}
              onClick={() => onChange(option.id)}
              onKeyDown={handleKeyDown}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
