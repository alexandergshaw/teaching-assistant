"use client";

import { Tab, Tabs } from "@mui/material";
import styles from "../../page.module.css";
import { isPlainLeftClick } from "./tab-link";
import { subtabSx } from "./subtab-style";

export interface TabRailOption<T extends string> {
  id: T;
  label: string;
  count?: number;
  href?: string;
}

const selectionKeys = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

export function TabRail<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: readonly TabRailOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className={styles.manualSubnav}>
      <Tabs
        aria-label={ariaLabel}
        value={options.some((option) => option.id === value) ? value : false}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={subtabSx}
        slotProps={{
          list: {
            onKeyDown: (event) => {
              // MUI moves focus before calling the list slot handler.
              if (!event.defaultPrevented || !selectionKeys.has(event.key)) return;
              if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
              const list = event.currentTarget;
              const focused = list.ownerDocument.activeElement;
              if (!list.contains(focused)) return;
              const next = options.find((option) => option.id === focused?.getAttribute("data-rail-tab"));
              if (next && next.id !== value) onChange(next.id);
            },
          },
        }}
      >
        {options.map((option) => {
          const label = (
            <span className={styles.tabLabelWrap}>
              {option.label}
              {option.count !== undefined && option.count > 0 && (
                <span className={styles.navBadge}>{option.count}</span>
              )}
            </span>
          );
          return option.href === undefined ? (
            <Tab key={option.id} value={option.id} label={label} data-rail-tab={option.id} disableRipple onClick={() => onChange(option.id)} />
          ) : (
            <Tab
              key={option.id}
              value={option.id}
              data-rail-tab={option.id}
              label={label}
              disableRipple
              component="a"
              href={option.href}
              onClick={(event) => {
                if (!isPlainLeftClick(event)) return;
                event.preventDefault();
                onChange(option.id);
              }}
              onKeyDown={(event) => {
                if (event.key !== " " || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                event.preventDefault();
                event.currentTarget.click();
              }}
            />
          );
        })}
      </Tabs>
    </div>
  );
}
