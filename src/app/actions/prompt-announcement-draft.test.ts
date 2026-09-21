import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, dirname, normalize, relative, sep } from "node:path";
import { scanRuntimeEdges } from "@/lib/module-graph/runtime-import-graph";

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

// FIX 1's instrument needs a fixed, known writing-style block so the
// expected request it computes (via routePromptAnnouncement, called
// directly) matches what the production action actually sends - never the
// composer itself, only the route leaf one level up.
vi.mock("./writing-style-block", () => ({
  getWritingStyleBlock: vi.fn().mockResolvedValue(""),
}));

import { callLlm } from "@/lib/llm";
import { requireUser } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./writing-style-block";
import { draftPromptAnnouncementAction } from "./prompt-announcement-draft";
import { routePromptAnnouncement } from "@/lib/prompt-announcement-route";
import {
  BRIEF_NONCE_PATTERN,
  PROMPT_ANNOUNCEMENT_MAX_CHARS,
  promptAnnouncementMaxOutputTokens,
} from "@/lib/prompt-announcement-prompt";
import { EMPTY_ANNOUNCEMENT_OUTLINE, type AnnouncementOutline } from "@/lib/announcement-outline-types";
import type { PromptAnnouncementDraftRequest } from "@/lib/prompt-announcement-types";
import { scaffoldAnnouncement } from "@/lib/embedded/communication";
import type { LlmProvider } from "@/lib/llm";
import type { ResolvedTemplate } from "@/app/components/walkthrough-announcement/announcement-draft-slots";

function baseRequest(overrides: Partial<PromptAnnouncementDraftRequest> = {}): PromptAnnouncementDraftRequest {
  return {
    promptText: "Remind students project 2 is due Friday.",
    courseLabel: "PSYC 101",
    resolvedTemplate: { kind: "none" },
    outline: EMPTY_ANNOUNCEMENT_OUTLINE,
    provider: "gemini",
    ...overrides,
  };
}

function jsonResponse(title: string, message: string) {
  return { ok: true as const, text: JSON.stringify({ title, message }) };
}

/** LlmPart is a union ({text} | {inlineData}); every call in this file sends
 * a plain text part, so this narrows without a runtime check cluttering
 * every call site. */
function partText(part: { text: string } | { inlineData: { mimeType: string; data: string } }): string {
  return "text" in part ? part.text : "";
}

beforeEach(() => {
  vi.mocked(callLlm).mockReset();
  vi.mocked(requireUser).mockReset();
  vi.mocked(requireUser).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  vi.mocked(getWritingStyleBlock).mockReset();
  vi.mocked(getWritingStyleBlock).mockResolvedValue("");
});

// ── AC-1(a): the file exports the action, alone. AC-16: column-zero async
// export, checked directly (the shipped instruments also cover this). ─────

describe("AC-16: export shape", () => {
  it("every export line is `export async function` at column zero", () => {
    const source = readFileSync(join(process.cwd(), "src/app/actions/prompt-announcement-draft.ts"), "utf8");
    const stripped = source
      .replace(/\/\*[^]*?\*\//g, "")
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    const exportLines = stripped.split("\n").filter((l) => /^export\b/.test(l.trim()));
    expect(exportLines.length).toBe(1);
    for (const line of exportLines) {
      expect(line.trim()).toMatch(/^export async function draftPromptAnnouncementAction/);
    }
  });
});

// ── AC-10(d): the embedded provider reaches NO MODEL CALL, at the ACTION. ──

describe("AC-10(d): embedded reaches no model call, at the live action", () => {
  const ROUTE: Record<LlmProvider, "called" | "not-called"> = {
    gemini: "called",
    other: "called",
    embedded: "not-called",
  };
  const KINDS: ResolvedTemplate["kind"][] = ["none", "pasted", "saved"];

  for (const provider of Object.keys(ROUTE) as LlmProvider[]) {
    for (const kind of KINDS) {
      it(`provider=${provider} kind=${kind}`, async () => {
        vi.mocked(callLlm).mockClear();
        vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "M"));
        const resolvedTemplate: ResolvedTemplate =
          kind === "saved" ? { kind: "saved", exemplarId: "ex-1", label: "Week 3" } : { kind };
        const result = await draftPromptAnnouncementAction(baseRequest({ provider, resolvedTemplate }));
        if (ROUTE[provider] === "called") {
          expect(callLlm).toHaveBeenCalledTimes(1);
        } else {
          expect(callLlm).not.toHaveBeenCalled();
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.templateApplied).toBe(false);
            const scaffold = scaffoldAnnouncement("Remind students project 2 is due Friday.");
            expect(result.message).toBe(scaffold.message);
          }
        }
      });
    }
  }
});

describe("AC-10(e): the action's own source text does not mention the model client directly", () => {
  it("contains routePromptAnnouncement, not @/lib/llm or callLlm", () => {
    const source = readFileSync(join(process.cwd(), "src/app/actions/prompt-announcement-draft.ts"), "utf8");
    const stripped = source.replace(/\/\*[^]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    expect(stripped).toContain("routePromptAnnouncement");
    expect(stripped).not.toContain("@/lib/llm");
    expect(stripped).not.toContain("callLlm");
  });

  it("positive control: prompt-announcement-model-call.ts DOES contain callLlm", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/prompt-announcement-model-call.ts"), "utf8");
    expect(source).toContain("callLlm");
  });
});

// ── AC-6n(iv): fresh nonce per call, at the action. ─────────────────────────

describe("AC-6n(iv): the action generates a fresh nonce per call", () => {
  function extractNonce(text: string): string | null {
    const m = text.match(/<<<BEGIN INSTRUCTOR BRIEF ([0-9a-f]{32})>>>/);
    return m ? m[1] : null;
  }

  it("two successive calls yield two different, valid nonces", async () => {
    vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "M"));
    await draftPromptAnnouncementAction(baseRequest());
    await draftPromptAnnouncementAction(baseRequest());
    expect(callLlm).toHaveBeenCalledTimes(2);
    const call0 = vi.mocked(callLlm).mock.calls[0][0];
    const call1 = vi.mocked(callLlm).mock.calls[1][0];
    const n0 = extractNonce(partText(call0.contents[0].parts[0]));
    const n1 = extractNonce(partText(call1.contents[0].parts[0]));
    expect(n0).not.toBeNull();
    expect(n1).not.toBeNull();
    expect(n0).toMatch(BRIEF_NONCE_PATTERN);
    expect(n1).toMatch(BRIEF_NONCE_PATTERN);
    expect(n0).not.toBe(n1);
  });
});

// ── AC-5(h): the action threads request.outline into the composer,
// unmodified - measured at the captured prompt text. ───────────────────────

describe("AC-5(h): the action threads request.outline into the composer, unmodified", () => {
  const OUTLINE_A: AnnouncementOutline = {
    sections: [{ index: 1, heading: "This week", break: "heading", listKind: null, sentenceRange: [2, 4] }],
    hasGreeting: true,
    hasSignOff: true,
    dueDateSectionIndex: null,
    todoSectionIndex: null,
    hasLinks: false,
  };
  const OUTLINE_B: AnnouncementOutline = {
    sections: [
      { index: 1, heading: null, break: "paragraph-break", listKind: "unordered", sentenceRange: [1, 1] },
      { index: 2, heading: "Due this week", break: "heading", listKind: "ordered", sentenceRange: [3, 6] },
    ],
    hasGreeting: true,
    hasSignOff: true,
    dueDateSectionIndex: 2,
    todoSectionIndex: 1,
    hasLinks: true,
  };

  it("two calls differing only in outline produce captured prompts whose only difference is the rendered outline", async () => {
    const FIXED_NONCE = "ffffffffffffffffffffffffffffffff";
    const spy = vi.spyOn(await import("@/lib/prompt-announcement-prompt"), "newBriefNonce").mockReturnValue(FIXED_NONCE);
    vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "M"));

    await draftPromptAnnouncementAction(
      baseRequest({ resolvedTemplate: { kind: "pasted" }, outline: OUTLINE_A })
    );
    await draftPromptAnnouncementAction(
      baseRequest({ resolvedTemplate: { kind: "pasted" }, outline: OUTLINE_B })
    );
    spy.mockRestore();

    expect(callLlm).toHaveBeenCalledTimes(2);
    const textA = partText(vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0]);
    const textB = partText(vi.mocked(callLlm).mock.calls[1][0].contents[0].parts[0]);

    const { renderOutlineBlock } = await import("@/lib/walkthrough-announcement-prompt");
    const renderA = renderOutlineBlock(OUTLINE_A);
    const renderB = renderOutlineBlock(OUTLINE_B);

    expect(textA).not.toBe(textB);
    expect(textA.split(renderA).length - 1).toBe(1);
    expect(textA).not.toContain(renderB);
    expect(textB.split(renderB).length - 1).toBe(1);
    expect(textB).not.toContain(renderA);

    const MARK = "<<OUTLINE REGION>>";
    expect(textA.replace(renderA, MARK)).toBe(textB.replace(renderB, MARK));
  });

  // FIX 5 (docs/a21-instrument-notes.md disposal): the "M21 check" that
  // previously lived here was `expect(true).toBe(true)` - it can never fail
  // and was deleted rather than kept as a placebo. The real M21 kill is the
  // test immediately above ("two calls differing only in outline..."): a
  // mutant that substitutes EMPTY_ANNOUNCEMENT_OUTLINE for request.outline
  // makes both captured texts identical, which fails that test's
  // `expect(textA).not.toBe(textB)`. The FIX1 describe block below (kind =
  // "saved") also kills the narrower M21s variant (outline replaced with the
  // empty outline for the `saved` kind only).
});

// ── FIX 1: the "fourth one-layer-up instance" - a CHANGE OF KIND. Captures
// the ENTIRE request handed to callLlm (production path, @/lib/llm mocked)
// and deep-equals it against what routePromptAnnouncement produces for args
// derived from the SAME request, with the nonce spied, getWritingStyleBlock
// mocked, and all three template kinds crossed. One assertion covers prompt
// text AND generationConfig; two more pin result.resolvedTemplate and
// result.templateApplied. Kills: M21s, M22, M23, M24, M25/M27 (via the
// deep-equal, non-empty outline + distinctive courseLabel/styleBlock so a
// dropped or substituted value is visible) and R1 (via the maxOutputTokens
// assertion computed independently of route.ts's own internal choice of
// helper - a comparison that goes through routePromptAnnouncement itself
// cannot catch a mutation inside routePromptAnnouncement, since both sides
// of that comparison would run the same mutated code). ─────────────────────

describe("FIX1: the captured callLlm request deep-equals routePromptAnnouncement's derived output", () => {
  const FIXED_NONCE = "abcdefabcdefabcdefabcdefabcdefab";
  const STYLE_BLOCK = "\n\nMATCH THE INSTRUCTOR'S WRITING STYLE:\nA fixture sample.";
  const COURSE_LABEL = "CHEM 200";
  // Non-empty and distinct per-section, so a substitution with
  // EMPTY_ANNOUNCEMENT_OUTLINE (M21s) or a dropped styleBlock/courseLabel
  // (M25/M27) changes the composed prompt text.
  const OUTLINE: AnnouncementOutline = {
    sections: [{ index: 1, heading: "This week", break: "heading", listKind: null, sentenceRange: [1, 3] }],
    hasGreeting: true,
    hasSignOff: true,
    dueDateSectionIndex: null,
    todoSectionIndex: null,
    hasLinks: false,
  };

  const ROWS: { resolvedTemplate: ResolvedTemplate; resolvedKind: ResolvedTemplate["kind"] }[] = [
    { resolvedTemplate: { kind: "none" }, resolvedKind: "none" },
    { resolvedTemplate: { kind: "pasted" }, resolvedKind: "pasted" },
    { resolvedTemplate: { kind: "saved", exemplarId: "ex-1", label: "Week 3" }, resolvedKind: "saved" },
  ];

  for (const { resolvedTemplate, resolvedKind } of ROWS) {
    it(`kind=${resolvedKind}: deep-equals the routed request; resolvedTemplate/templateApplied echo through`, async () => {
      vi.mocked(getWritingStyleBlock).mockResolvedValue(STYLE_BLOCK);
      const nonceSpy = vi
        .spyOn(await import("@/lib/prompt-announcement-prompt"), "newBriefNonce")
        .mockReturnValue(FIXED_NONCE);
      vi.mocked(callLlm).mockClear();
      vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "M"));

      const request = baseRequest({
        resolvedTemplate,
        outline: OUTLINE,
        provider: "gemini",
        courseLabel: COURSE_LABEL,
      });
      const result = await draftPromptAnnouncementAction(request);
      nonceSpy.mockRestore();

      expect(callLlm).toHaveBeenCalledTimes(1);
      const actualArg = vi.mocked(callLlm).mock.calls[0][0];

      const expectedRoute = routePromptAnnouncement({
        courseLabel: request.courseLabel,
        promptText: request.promptText,
        outline: request.outline,
        resolvedKind,
        styleBlock: STYLE_BLOCK,
        briefNonce: FIXED_NONCE,
        provider: "gemini",
      });
      expect(expectedRoute.kind).toBe("model"); // anchor: gemini never routes deterministic.
      if (expectedRoute.kind !== "model") throw new Error("unreachable");

      expect(actualArg).toEqual({
        contents: [{ role: "user", parts: [{ text: expectedRoute.prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: expectedRoute.maxOutputTokens },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.resolvedTemplate).toEqual(request.resolvedTemplate);
        expect(result.templateApplied).toBe(expectedRoute.templateApplied);
      }
    });
  }

  it("R1: generationConfig.maxOutputTokens matches promptAnnouncementMaxOutputTokens (the floored helper), computed independently of route.ts's own internals - EMPTY_ANNOUNCEMENT_OUTLINE is where the floor actually bites", async () => {
    vi.mocked(getWritingStyleBlock).mockResolvedValue(STYLE_BLOCK);
    const nonceSpy = vi
      .spyOn(await import("@/lib/prompt-announcement-prompt"), "newBriefNonce")
      .mockReturnValue(FIXED_NONCE);
    vi.mocked(callLlm).mockClear();
    vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "M"));

    const request = baseRequest({
      resolvedTemplate: { kind: "none" },
      outline: EMPTY_ANNOUNCEMENT_OUTLINE,
      provider: "gemini",
      courseLabel: COURSE_LABEL,
    });
    await draftPromptAnnouncementAction(request);
    nonceSpy.mockRestore();

    expect(callLlm).toHaveBeenCalledTimes(1);
    const actualArg = vi.mocked(callLlm).mock.calls[0][0];
    // Definedness is itself part of what R1 protects: a missing
    // generationConfig means no token floor was ever applied at all. Assert
    // it first (no non-null assertion, no cast) so a mutation that drops
    // generationConfig entirely fails loudly here, then narrow via the
    // control-flow guard below - never `!` or `as`.
    const { generationConfig } = actualArg;
    expect(generationConfig).toBeDefined();
    if (!generationConfig) throw new Error("unreachable - generationConfig asserted defined above");
    expect(generationConfig.maxOutputTokens).toBe(promptAnnouncementMaxOutputTokens(EMPTY_ANNOUNCEMENT_OUTLINE));
  });
});

// ── AC-22: the live endpoint validates length itself. ───────────────────────

describe("AC-22: the action validates prompt length itself", () => {
  it("(i) over-cap rejects with no model call", async () => {
    vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "M"));
    const result = await draftPromptAnnouncementAction(
      baseRequest({ promptText: "x".repeat(PROMPT_ANNOUNCEMENT_MAX_CHARS + 1) })
    );
    expect(result.ok).toBe(false);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("(ii) exactly at the cap is accepted (boundary control)", async () => {
    vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "M"));
    const result = await draftPromptAnnouncementAction(
      baseRequest({ promptText: "x".repeat(PROMPT_ANNOUNCEMENT_MAX_CHARS) })
    );
    expect(result.ok).toBe(true);
    expect(callLlm).toHaveBeenCalledTimes(1);
  });

  it("(iii) empty and whitespace-only briefs are rejected with no model call", async () => {
    vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "M"));
    for (const promptText of ["", "   \n\t "]) {
      vi.mocked(callLlm).mockClear();
      const result = await draftPromptAnnouncementAction(baseRequest({ promptText }));
      expect(result.ok).toBe(false);
      expect(callLlm).not.toHaveBeenCalled();
    }
  });
});

// ── AC-24: an off-union provider or resolvedKind is rejected, not executed. ─

describe("AC-24: off-union wire values are rejected, not executed", () => {
  it("an off-union provider does not reach the model and returns an error, never throws", async () => {
    vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "M"));
    const result = await draftPromptAnnouncementAction(
      baseRequest({ provider: "garbage" as unknown as LlmProvider })
    );
    expect(result.ok).toBe(false);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("an off-union resolvedTemplate.kind returns an error result instead of throwing", async () => {
    vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "M"));
    await expect(
      draftPromptAnnouncementAction(
        baseRequest({ resolvedTemplate: { kind: "house" } as unknown as ResolvedTemplate })
      )
    ).resolves.toEqual(expect.objectContaining({ ok: false }));
    expect(callLlm).not.toHaveBeenCalled();
  });
});

// ── AC-8: leverage removal test - no unpermitted URL survives. ──────────────

describe("AC-8: no unpermitted URL survives, and no permitted one is stripped", () => {
  it("row 1: no input carries the URL -> stripped from the returned message", async () => {
    vi.mocked(callLlm).mockResolvedValue(
      jsonResponse("T", "Visit https://not-in-any-input.example/x for more info.")
    );
    const result = await draftPromptAnnouncementAction(baseRequest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).not.toContain("https://not-in-any-input.example/x");
  });

  it("row 2 (control): the same URL IS in promptText -> survives", async () => {
    const url = "https://course.example/syllabus";
    vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", `Visit ${url} for more info.`));
    const result = await draftPromptAnnouncementAction(baseRequest({ promptText: `See ${url} for details.` }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toContain(url);
  });

  it("row 3: a mailto: target survives untouched", async () => {
    vi.mocked(callLlm).mockResolvedValue(jsonResponse("T", "Email mailto:prof@example.edu with questions."));
    const result = await draftPromptAnnouncementAction(baseRequest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toContain("mailto:prof@example.edu");
  });
});

// ── AC-9a: the draft action reaches no Canvas capability. DERIVED forbidden
// set, DUPLICATED walker shape, never imported. ────────────────────────────

const SRC = join(process.cwd(), "src");

function toPosix(p: string): string {
  return relative(process.cwd(), p).split(sep).join("/");
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

// FIX 4 (docs/a21-instrument-notes.md disposal): this walker used to extract
// import specifiers with a hand-rolled regex matching only
// `from "..."` (double-quoted, static import/export). That regex is BLIND to
// `await import(...)`, a bare `import "spec";` side-effect import, and a
// single-quoted specifier - see the "FIX4" describe block below, which
// proves all three were invisible to it. Reused instead: A23's
// `scanRuntimeEdges` (src/lib/module-graph/runtime-import-graph.ts), which
// extracts edges by parsing with the TypeScript compiler's own parser
// (`ts.createSourceFile`) rather than inferring import intent from a line's
// spelling - the same class fix A23 already made repo-wide.
function valueImportSpecifiers(source: string, fileName: string): string[] {
  return scanRuntimeEdges(source, fileName).edges.map((edge) => edge.specifier);
}

function deriveCanvasForbiddenFiles(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (["node_modules", ".git", ".next"].includes(entry)) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !entry.includes(".test.")) {
        const text = readOrEmpty(full);
        if (/api\/v1/.test(text)) out.add(full);
      }
    }
  };
  walk(SRC);
  return out;
}

function walkForForbiddenFiles(rootPaths: string[], forbidden: Set<string>, extraForbiddenPrefixes: string[] = []): string[] {
  const violations: string[] = [];
  const visited = new Set<string>();

  const isForbidden = (p: string) => {
    if (forbidden.has(p)) return true;
    const relToSrc = relative(SRC, p).split(sep).join("/");
    return extraForbiddenPrefixes.some((prefix) => relToSrc.startsWith(prefix));
  };

  const visit = (path: string, stack: Set<string>) => {
    if (visited.has(path)) return;
    if (stack.has(path)) return;
    visited.add(path);
    stack.add(path);
    const source = readOrEmpty(path);
    for (const spec of valueImportSpecifiers(source, path)) {
      const dep = resolveSpecifier(spec, path);
      if (!dep) continue;
      if (isForbidden(dep)) {
        violations.push(`${toPosix(path)} -> ${toPosix(dep)}`);
        continue;
      }
      visit(dep, stack);
    }
    stack.delete(path);
  };

  for (const root of rootPaths) visit(root, new Set());
  return violations;
}

describe("FIX4: the import walker sees forms the old regex-based extractor missed", () => {
  const OLD_IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm;
  function oldValueImportSpecifiers(source: string): string[] {
    const found: string[] = [];
    for (const match of source.matchAll(OLD_IMPORT_RE)) {
      if (match[1]) continue;
      found.push(match[2]);
    }
    return found;
  }

  const CASES: { name: string; source: string; specifier: string }[] = [
    {
      name: "await import(...) - a dynamic import",
      source: 'async function f() { const m = await import("@/lib/canvas/announcements"); return m; }',
      specifier: "@/lib/canvas/announcements",
    },
    {
      name: 'bare import "spec"; - a side-effect import with no clause',
      source: 'import "@/lib/canvas/announcements";',
      specifier: "@/lib/canvas/announcements",
    },
    {
      name: "single-quoted specifier on an otherwise ordinary static import",
      source: "import { createAnnouncementFromMarkdown } from '@/lib/canvas/announcements';",
      specifier: "@/lib/canvas/announcements",
    },
  ];

  for (const { name, source, specifier } of CASES) {
    it(`${name}: invisible to the old regex, visible to scanRuntimeEdges`, () => {
      expect(oldValueImportSpecifiers(source)).not.toContain(specifier);
      expect(valueImportSpecifiers(source, "synthetic.ts")).toContain(specifier);
    });
  }
});

describe("AC-9a/9b: the draft action and its pure leaf reach no Canvas capability", () => {
  const forbidden = deriveCanvasForbiddenFiles();

  it("the derived forbidden set is non-empty and contains a known Canvas file", () => {
    expect(forbidden.size).toBeGreaterThanOrEqual(30);
    expect(forbidden.has(join(SRC, "lib/canvas/announcements.ts"))).toBe(true);
  });

  it("positive control: announcements-panel.tsx legitimately reports a violation", () => {
    const violations = walkForForbiddenFiles(
      [join(SRC, "app/components/canvas-tab/announcements-panel.tsx")],
      forbidden
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("(a) zero violations rooted at the draft action", () => {
    const violations = walkForForbiddenFiles([join(SRC, "app/actions/prompt-announcement-draft.ts")], forbidden);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("(b) the pure draft leaf reaches no Canvas capability AND cannot import any action at all", () => {
    const violations = walkForForbiddenFiles(
      [join(SRC, "app/components/canvas-tab/promptAnnouncementDraft.ts")],
      forbidden,
      ["app/actions"]
    );
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
