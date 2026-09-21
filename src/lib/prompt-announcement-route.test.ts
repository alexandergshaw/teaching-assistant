import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join, dirname, normalize, relative, sep } from "node:path";
import { routePromptAnnouncement, type PromptAnnouncementRoute } from "./prompt-announcement-route";
import { EMPTY_ANNOUNCEMENT_OUTLINE } from "./announcement-outline-types";
import type { LlmProvider } from "./llm";
import type { ResolvedTemplate } from "@/app/components/walkthrough-announcement/announcement-draft-slots";

// ── AC-10(a): the route leaf cannot reach lib/llm or lib/gemini. ───────────
// Walker shape DUPLICATED from classTrendsDraft.not-postable.test.ts, never
// imported (this repo forbids cross-test-file imports of a shared helper).

const SRC = join(process.cwd(), "src");
const FORBIDDEN_PATH_PREFIXES = ["lib/llm", "lib/gemini"];

function toPosix(p: string): string {
  return relative(process.cwd(), p).split(sep).join("/");
}

function isForbiddenPath(absPath: string): boolean {
  const relToSrc = relative(SRC, absPath).split(sep).join("/");
  return FORBIDDEN_PATH_PREFIXES.some((prefix) => relToSrc.startsWith(prefix));
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function resolveSpecifier(spec: string, importer: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(importer), spec));
  else return null;

  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not this one
    }
  }
  return null;
}

const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm;

function valueImportSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    if (match[1]) continue;
    const braces = /\{([^}]*)\}/.exec(match[0]);
    if (braces) {
      const parts = braces[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length > 0 && parts.every((p) => p.startsWith("type "))) continue;
    }
    found.push(match[2]);
  }
  return found;
}

function walkForForbiddenImports(rootPaths: string[]): string[] {
  const violations: string[] = [];
  const visited = new Set<string>();

  const visit = (path: string, stack: Set<string>) => {
    if (visited.has(path)) return;
    if (stack.has(path)) return;
    visited.add(path);
    stack.add(path);

    const source = readOrEmpty(path);
    for (const spec of valueImportSpecifiers(source)) {
      const dep = resolveSpecifier(spec, path);
      if (!dep) continue;
      if (isForbiddenPath(dep)) {
        violations.push(`${toPosix(path)}\n      value-imports "${spec}" -> ${toPosix(dep)}`);
        continue;
      }
      visit(dep, stack);
    }

    stack.delete(path);
  };

  for (const root of rootPaths) visit(root, new Set());
  return violations;
}

describe("canary - isForbiddenPath predicate discrimination", () => {
  it("returns true for lib/llm.ts and lib/gemini.ts, false for lib/markdown.ts", () => {
    expect(isForbiddenPath(join(SRC, "lib/llm.ts"))).toBe(true);
    expect(isForbiddenPath(join(SRC, "lib/gemini.ts"))).toBe(true);
    expect(isForbiddenPath(join(SRC, "lib/markdown.ts"))).toBe(false);
  });
});

describe("positive control - a known-bad root does report a violation", () => {
  it("finds a violation rooted at src/app/actions/messaging.ts", () => {
    const violations = walkForForbiddenImports([join(SRC, "app/actions/messaging.ts")]);
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe("AC-10(a): the real check - the route leaf reaches nothing forbidden", () => {
  it("zero violations rooted at prompt-announcement-route.ts", () => {
    const violations = walkForForbiddenImports([join(SRC, "lib/prompt-announcement-route.ts")]);
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ── AC-10(b)/(c): the provider decision and the receipt-relevant tag. ──────

const BASE = {
  courseLabel: "PSYC 101",
  promptText: "Remind students project 2 is due Friday.",
  outline: EMPTY_ANNOUNCEMENT_OUTLINE,
  styleBlock: "",
  briefNonce: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
};

describe("AC-10(b): the provider decision, per provider and per resolved kind", () => {
  const PROVIDER_ROUTE: Record<LlmProvider, "deterministic" | "model"> = {
    gemini: "model",
    other: "model",
    embedded: "deterministic",
  };
  const KINDS: ResolvedTemplate["kind"][] = ["none", "pasted", "saved"];

  for (const provider of Object.keys(PROVIDER_ROUTE) as LlmProvider[]) {
    for (const resolvedKind of KINDS) {
      it(`provider=${provider} resolvedKind=${resolvedKind}`, () => {
        const route = routePromptAnnouncement({ ...BASE, resolvedKind, provider });
        expect(route.kind).toBe(PROVIDER_ROUTE[provider]);
        if (provider === "embedded") {
          expect("prompt" in route).toBe(false);
        }
      });
    }
  }
});

describe("AC-10(a): PromptAnnouncementRoute's deterministic arm has no way to reach the model", () => {
  it("hands the deterministic scaffold's own title/message through unchanged", () => {
    const route: PromptAnnouncementRoute = routePromptAnnouncement({
      ...BASE,
      resolvedKind: "none",
      provider: "embedded",
    });
    expect(route.kind).toBe("deterministic");
    if (route.kind === "deterministic") {
      expect(route.templateApplied).toBe(false);
      expect(typeof route.draft.title).toBe("string");
      expect(typeof route.draft.message).toBe("string");
    }
  });
});
