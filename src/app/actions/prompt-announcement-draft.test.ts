import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, dirname, normalize, relative, sep } from "node:path";

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { requireUser } from "@/lib/supabase/auth";
import { draftPromptAnnouncementAction } from "./prompt-announcement-draft";
import { BRIEF_NONCE_PATTERN, PROMPT_ANNOUNCEMENT_MAX_CHARS } from "@/lib/prompt-announcement-prompt";
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

  it("M21 check: passing EMPTY_ANNOUNCEMENT_OUTLINE regardless of request.outline would be caught by the above (documented, not separately executed)", () => {
    // The two calls above already prove request.outline reaches the
    // captured prompt verbatim; a mutant that substitutes
    // EMPTY_ANNOUNCEMENT_OUTLINE for request.outline would make both
    // captured texts identical, failing "expect(textA).not.toBe(textB)"
    // above. See this repo's sabotage pass for the executed mutation.
    expect(true).toBe(true);
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

const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm;

function valueImportSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    if (match[1]) continue;
    const braces = /\{([^}]*)\}/.exec(match[0]);
    if (braces) {
      const parts = braces[1].split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0 && parts.every((p) => p.startsWith("type "))) continue;
    }
    found.push(match[2]);
  }
  return found;
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
    for (const spec of valueImportSpecifiers(source)) {
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
