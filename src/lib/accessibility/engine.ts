// Accessibility engine. Parses a Canvas HTML fragment with node-html-parser (a
// pure-JS parser — no jsdom/browser, so it runs reliably in any server runtime
// and stays light) and runs the static rule set. WCAG 2.1 AA oriented.

import { parse } from "node-html-parser";
import type { Issue } from "./types";
import { runRules } from "./rules-custom";

/** Scan one HTML fragment and return its accessibility issues, de-duplicated. */
export async function scanHtml(html: string): Promise<Issue[]> {
  let issues: Issue[];
  try {
    const root = parse(html, { comment: false });
    issues = runRules(root);
  } catch {
    return []; // never let one bad fragment fail the whole scan
  }

  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.ruleId}|${i.locator.selector}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
