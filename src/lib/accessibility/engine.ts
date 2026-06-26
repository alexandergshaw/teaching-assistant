// Server-only accessibility engine: runs axe-core (WCAG 2.1 AA) against a Canvas
// HTML fragment inside jsdom, then layers the custom static rules on top.
// Imports jsdom + axe-core, so never import this from a client component.

import { JSDOM } from "jsdom";
import axe from "axe-core";
import type { Issue, Severity, FixKind } from "./types";
import { runCustomRules } from "./rules-custom";

// axe rule id -> how its issues are fixed in the UI.
const FIX_KIND: Record<string, FixKind> = {
  "image-alt": "ai-alt",
  "input-image-alt": "ai-alt",
  "area-alt": "ai-alt",
  "object-alt": "ai-alt",
  "svg-img-alt": "ai-alt",
  "role-img-alt": "ai-alt",
  "link-name": "ai-link",
  "heading-order": "auto",
  "empty-heading": "auto",
  "p-as-heading": "auto",
  "th-has-data-cells": "auto",
  "td-headers-attr": "auto",
  "scope-attr-valid": "auto",
  "table-fake-caption": "auto",
  "td-has-header": "auto",
  list: "auto",
  listitem: "auto",
  "definition-list": "auto",
  dlitem: "auto",
  "frame-title": "auto",
  "color-contrast": "edit",
  "html-has-lang": "auto",
  "html-lang-valid": "auto",
  "valid-lang": "auto",
};

function severityFromImpact(impact: string | null | undefined): Severity {
  if (impact === "critical" || impact === "serious") return "error";
  if (impact === "minor") return "suggestion";
  return "warning";
}

// Turn an axe tag list ("wcag111", "wcag143") into a criterion ("1.1.1").
function wcagFromTags(tags: string[]): string | undefined {
  for (const t of tags) {
    const m = t.match(/^wcag(\d)(\d)(\d+)$/);
    if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  }
  return undefined;
}

/**
 * Scan one HTML fragment and return its accessibility issues (axe + custom),
 * de-duplicated. Wraps the fragment in a minimal document so document-level
 * rules (lang, etc.) have something to work with.
 */
export async function scanHtml(html: string): Promise<Issue[]> {
  const dom = new JSDOM(`<!DOCTYPE html><html lang="en"><head><title>content</title></head><body>${html}</body></html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  const { window } = dom;
  const body = window.document.body;
  const issues: Issue[] = [];

  // ── axe-core (run inside the jsdom window) ──
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).eval(axe.source);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (window as any).axe.run(body, {
      // Include best-practice so structural checks UDOIT also does (heading-order,
      // empty-heading, p-as-heading) run, not just the strict WCAG ruleset.
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
      resultTypes: ["violations"],
      // Disable rules that need a full rendered page (noise on fragments) or that
      // can't work in jsdom. color-contrast is replaced by our inline-style rule.
      rules: {
        "color-contrast": { enabled: false },
        "page-has-heading-one": { enabled: false },
        region: { enabled: false },
        "landmark-one-main": { enabled: false },
        "landmark-complementary-is-top-level": { enabled: false },
        bypass: { enabled: false },
        "frame-tested": { enabled: false },
        "scrollable-region-focusable": { enabled: false },
        "meta-viewport": { enabled: false },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const v of result.violations as any[]) {
      for (const node of v.nodes) {
        const selector = Array.isArray(node.target) ? node.target.join(" ") : String(node.target);
        const snippet: string = node.html?.length > 200 ? `${node.html.slice(0, 200)}…` : node.html ?? "";
        issues.push({
          ruleId: v.id,
          severity: severityFromImpact(node.impact ?? v.impact),
          message: v.help,
          wcag: wcagFromTags(v.tags ?? []),
          help: v.description,
          locator: { selector, snippet },
          fixKind: FIX_KIND[v.id] ?? "edit",
        });
      }
    }
  } catch {
    // If axe fails to run for some content, fall back to custom rules only.
  }

  // ── custom static rules ──
  issues.push(...runCustomRules(body));

  dom.window.close();

  // De-dupe by rule + selector (axe and a custom rule can flag the same node).
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.ruleId}|${i.locator.selector}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
