// Repo pairing in Modules - AC3 and AC4
// (docs/repo-pairing-in-modules-acceptance-criteria.md): a pure module that
// maps a paired repo's assignment folders onto a course's modules. Read the
// acceptance doc's "What the real data says, and what it rules out" section
// before touching this file - every rule below exists because of a MEASURED
// fact about the instructor's actual archive, not a hypothetical.
//
// THE RULE, in priority order (AC3):
//   1. NUMBER FIRST. `extractModuleNumber` (src/lib/workflows/module-value.ts:68)
//      runs on both the folder's own leaf name and every module's name.
//      Equal, non-null numbers pair, and that pairing is CONFIRMED - unless
//      it collides (see below), in which case it is surfaced as ambiguous,
//      never silently resolved.
//   2. Token overlap (`matchTokens`, content-tab/utils.ts:368) applies ONLY
//      when a folder's leaf name yields no number at all, and it only ever
//      produces a SUGGESTION - never confirmed.
//   3. A title match NEVER overrides a number match, and NEVER upgrades a
//      suggestion to confirmed. A folder that has a number commits to the
//      number rule alone: if no module shares that number, the folder is
//      UNBOUND, full stop - it does not fall back to token matching. Falling
//      back would reintroduce exactly the failure this file exists to
//      prevent.
//
// WHY the asymmetry is load-bearing, not stylistic: measured against the
// instructor's real Blackboard archive and real repo
// (docs/repo-pairing-in-modules-acceptance-criteria.md, "What the real data
// says"), the two sides' titles actively DISAGREE at the very numbers that
// pair correctly. Course module 08 is "Midterm Assessment"; repo folder
// module_08's README is "Object Modeling Assignment". Course module 11 is
// "Object-Oriented Programming II"; repo folder module_11's README is "Data
// Logging Application". Token/title similarity would confidently produce the
// WRONG pairing in both cases - the two-digit number is the only trustworthy
// join. This is exactly the asymmetry `selectModuleForWeek`
// (src/lib/announcement-module-content.ts:58) already encodes for a sibling
// problem (matching a course module to a calendar week): when any module
// carries a number, match on the number and never fall back to a positional
// or name-similarity guess. This file adopts that rule for repo folders.
//
// BRIDGING extractModuleNumber to the repo's actual folder names, WITHOUT a
// second number parser: `extractModuleNumber`'s pattern
// (`/(?:module|week)\s*0*(\d+)/i`) tolerates whitespace and zero-padding
// between the "module"/"week" token and the digits ("Module 07", "Module07",
// "Week 7"), but the repo's real folder names use an UNDERSCORE instead
// ("module_08" - see the acceptance doc's measured shape,
// `^assignments/module_(\d{2})/$`), which that pattern does not match as
// written: `extractModuleNumber("module_08")` returns null. Rather than
// writing a second, competing number-extraction regex, `folderNumberSource`
// below only rewrites path-style delimiters (`_` and `-`) to spaces before
// handing the string to `extractModuleNumber` - "module_08" becomes
// "module 08". Every actual decision (which digits, zero-padding tolerance,
// and the full-number-not-substring rule that keeps "Module 17" from
// matching 7) still comes from `extractModuleNumber` alone. `matchTokens`
// needs no equivalent bridge - it already treats every non-alphanumeric run,
// underscores included, as a token boundary.
//
// TOKEN SCORING vs `bestModuleIdFor`: `bestModuleIdFor`
// (content-tab/utils.ts:384) was exported for this file to reuse, and its
// exact scoring formula is reused here (+1 per shared token longer than two
// characters, +2 per shared numeric token) via the same `matchTokens`
// tokenizer, so a repo folder's suggestion score agrees with anywhere else
// in the app that scores a name against a module list. `bestModuleIdFor`
// itself is NOT called directly, for two reasons specific to this file:
// (a) it takes `CanvasModule[]` - a live-Canvas-shaped type carrying
// `published`/`itemsCount`/`items` fields this pure, source-agnostic mapper
// has no business depending on; and (b) it collapses a tie to whichever
// module it saw first, which is exactly the silent-guess AC3 forbids - "a
// folder's token score ties across modules" must surface as ambiguous, not
// resolve to an arbitrary winner. `tokenCandidates` below reimplements the
// identical formula but returns every module tied for the top score.
//
// RESULT SHAPE mirrors the four-state confidence vocabulary
// `RepoBindingState` already established (src/lib/repo-student-bindings.ts:44)
// - confirmed / suggested / ambiguous / unbound - so a reviewer who already
// knows that vocabulary from the repo-student pairing feature reads this one
// for free. Ambiguity is SURFACED, never resolved: this file recognizes TWO
// distinct ambiguity shapes and reports both explicitly -
//   - MODULE-side: one folder, multiple modules tied (either a token-score
//     tie, or - a degenerate but handled case - more than one course module
//     sharing the same extracted number).
//   - FOLDER-side: two or more folders extracting the SAME number, all
//     wanting the one module that number identifies. Every such folder comes
//     back "ambiguous" with the contested module in `candidates` and the
//     other folders named in `competingFolders`, per AC3's "if two folders
//     both claim module 3 ... that is ambiguous and both candidates are
//     reported."
// Unmapped folders and unmapped modules are both reported at the top level
// (AC3): a folder is unmapped when its state is "unbound"; a module is
// unmapped when it never appears as a candidate for ANY folder, at any
// state - an instructor needs to see repo module_17 pairing with nothing,
// and course module "Start Here" (no number, no folder's tokens reach it)
// having no folder, exactly as symmetrically as a matched pair.
//
// OVERRIDES (AC4): `applyRepoModuleOverrides` overlays an instructor's
// explicit folder-to-module choice onto an inferred result, forcing that
// folder to "confirmed" regardless of what inference produced - mirroring
// `repoGradesAssignmentMapping.ts`'s `applyRepoGradeAssignmentMapping`.
// `filterRepoModuleOverrides` is the restore-time filter that drops an
// override naming a folder or module that no longer exists, mirroring that
// same file's `filterRepoGradeAssignmentMapping` (:98) and
// `repoGradesUiState.ts`'s `loadSelectedRepoIds` (:120) - a stale override is
// dropped, never resurrected. Unlike `repoGradesAssignmentMapping.ts`'s
// mapping (where a wrong inference posts a real grade with no undo, so that
// feature requires 100% explicit choice), an auto-suggestion here is
// acceptable on its own because selecting repo content is non-destructive -
// see AC4's own header. Overrides exist so the instructor can CORRECT a
// wrong or ambiguous inference, not because inference is unsafe to show.
//
// Pure: folders and modules in, a mapping out. No React, no network, no
// localStorage - persistence of the override map is a later wave's job; this
// file only makes the override structure serializable
// (`RepoModuleOverrideMap` is a plain `Record<string, string>`, JSON-safe).
//
// vitest here is node-env and collects only `src/**/*.test.ts` - no
// component is ever rendered by this suite. That is not a limitation for
// this file: it has no component to render, by design (see
// contentSourceGating.ts's header for the same house shape).

import { extractModuleNumber } from "@/lib/workflows/module-value";
import { matchTokens } from "@/app/components/content-tab/utils";

/** One course module, as needed by the mapper. A subset of `CanvasModule`
 * (src/lib/canvas-modules/types.ts:25) - only `id` and `name` are read here,
 * so callers never need to fabricate `published`/`itemsCount`/`items` just
 * to call a pure matching function. */
export interface RepoModuleMappingModule {
  id: string | number;
  name: string;
}

/** The same four-state vocabulary as `RepoBindingState`
 * (src/lib/repo-student-bindings.ts:44): confirmed (exactly one answer,
 * reached via the number rule), suggested (exactly one answer, reached via
 * the token-overlap fallback - never upgraded to confirmed), ambiguous (more
 * than one plausible answer, of either ambiguity shape described in the
 * header comment), unbound (no answer at all). */
export type RepoModulePairingState = "confirmed" | "suggested" | "ambiguous" | "unbound";

/** Which rule produced this pairing's state - independent of the state
 * itself, so "why" is answered even for an unbound or ambiguous result
 * ("number" means the folder had a number and rule 1 ran, whatever its
 * outcome; "token" means the folder had no number and rule 2 ran;
 * "override" means an instructor override replaced whatever rule 1 or 2
 * produced). */
export type RepoModuleMatchedBy = "number" | "token" | "override";

export interface RepoModuleCandidate {
  moduleId: string | number;
  moduleName: string;
}

export interface RepoFolderPairing {
  /** The folder's full tree path, e.g. "assignments/module_08" - the same
   * stable identifier `repoModuleKey` (content-tab/utils.ts:166) expects. */
  folderPath: string;
  state: RepoModulePairingState;
  /** The single paired module - populated only when state is "confirmed" or
   * "suggested" (there is exactly one answer). Null for "ambiguous" (no
   * single answer to give) and "unbound" (no answer at all) - mirrors
   * `RepoBindingSuggestion.student`'s same null convention. */
  module: RepoModuleCandidate | null;
  /** Every module this folder could plausibly pair with under the winning
   * rule: for a number match, every module sharing that number (normally
   * one); for a token match, every module tied for the top score. Populated
   * even when state is "confirmed" or "suggested" (a one-element array), so
   * a caller never needs a second field to see what was considered. Empty
   * for "unbound". */
  candidates: RepoModuleCandidate[];
  matchedBy: RepoModuleMatchedBy;
  /** Other folder paths that extracted the SAME module number as this one -
   * the folder-side ambiguity shape (AC3: "two folders both claim module
   * 3"). Non-empty only when `state` is "ambiguous" AND that ambiguity came
   * from a folder collision rather than a module-side or token-score tie. */
  competingFolders: readonly string[];
  /** True when an explicit instructor override (`applyRepoModuleOverrides`)
   * decided this pairing, replacing whatever inference produced. */
  overridden: boolean;
}

export interface RepoModuleMappingResult {
  /** One entry per input folder path, in input order. */
  pairings: RepoFolderPairing[];
  /** Convenience view: the subset of `pairings` with state "unbound" - same
   * objects, not copies. */
  unmappedFolders: RepoFolderPairing[];
  /** Course modules that no folder's pairing named as a candidate, at any
   * state. Never dropped silently (AC3) - an instructor needs to see e.g.
   * "Start Here" has no folder even trying to claim it. */
  unmappedModules: RepoModuleMappingModule[];
}

/** folderPath -> module id (stringified - see the header's serializability
 * note). Mirrors `RepoGradeAssignmentMap`
 * (repoGradesAssignmentMapping.ts:43)'s shape exactly: a plain JSON-safe
 * record, one entry per overridden folder. */
export type RepoModuleOverrideMap = Readonly<Record<string, string>>;

export const EMPTY_REPO_MODULE_OVERRIDES: RepoModuleOverrideMap = {};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** The folder's own display name for matching: its last non-empty path
 * segment. The repo side carries no topic anywhere in its paths (measured -
 * see header), so the leaf segment ("module_08") is the only name a folder
 * has to offer either the number rule or the token-overlap fallback. */
function folderLeafName(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

/** Rewrites path-style delimiters to spaces so `extractModuleNumber`'s
 * whitespace-tolerant pattern can see the number in "module_08" - see the
 * header comment's "BRIDGING" section for why this is not a second parser. */
function folderNumberSource(leafName: string): string {
  return leafName.replace(/[_-]+/g, " ");
}

/** Every module tied for the top token-overlap score against `leafName`, by
 * the identical formula `bestModuleIdFor` (content-tab/utils.ts:384) uses -
 * see the header's "TOKEN SCORING" section for why this file reimplements
 * the formula over `matchTokens` rather than calling `bestModuleIdFor`
 * itself. Returns [] when nothing scores above zero. */
function tokenCandidates(
  leafName: string,
  modules: readonly RepoModuleMappingModule[]
): RepoModuleCandidate[] {
  const folderTokens = matchTokens(leafName);
  const folderNums = folderTokens.filter((t) => /^\d+$/.test(t));

  let bestScore = 0;
  const scored: Array<{ module: RepoModuleMappingModule; score: number }> = [];
  for (const m of modules) {
    const modTokens = matchTokens(m.name);
    const modNums = modTokens.filter((t) => /^\d+$/.test(t));
    let score = 0;
    for (const t of folderTokens) if (t.length > 2 && modTokens.includes(t)) score += 1;
    for (const n of folderNums) if (modNums.includes(n)) score += 2;
    if (score > 0) {
      scored.push({ module: m, score });
      if (score > bestScore) bestScore = score;
    }
  }

  if (bestScore === 0) return [];
  return scored
    .filter((s) => s.score === bestScore)
    .map((s) => ({ moduleId: s.module.id, moduleName: s.module.name }));
}

/** Modules absent from every pairing's `module` and `candidates` - see
 * `RepoModuleMappingResult.unmappedModules`'s own comment. */
function computeUnmappedModules(
  pairings: readonly RepoFolderPairing[],
  modules: readonly RepoModuleMappingModule[]
): RepoModuleMappingModule[] {
  const referenced = new Set<string>();
  for (const p of pairings) {
    if (p.module) referenced.add(String(p.module.moduleId));
    for (const c of p.candidates) referenced.add(String(c.moduleId));
  }
  return modules.filter((m) => !referenced.has(String(m.id)));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps repo assignment-folder paths onto course modules, per the rule
 * described in this file's header. Pure - no I/O, no mutation of either
 * input, order of `pairings` matches `folderPaths`.
 */
export function mapRepoFoldersToModules(
  folderPaths: readonly string[],
  modules: readonly RepoModuleMappingModule[]
): RepoModuleMappingResult {
  const leafNames = folderPaths.map(folderLeafName);
  const folderNumbers = leafNames.map((leaf) => extractModuleNumber(folderNumberSource(leaf)));

  // Tally which folders claim which number, so a folder-side collision (two
  // folders, one number) can be surfaced exactly like a module-side tie.
  const foldersByNumber = new Map<number, string[]>();
  folderPaths.forEach((path, i) => {
    const n = folderNumbers[i];
    if (n === null) return;
    const list = foldersByNumber.get(n);
    if (list) list.push(path);
    else foldersByNumber.set(n, [path]);
  });

  const modulesByNumber = new Map<number, RepoModuleMappingModule[]>();
  for (const m of modules) {
    const n = extractModuleNumber(m.name);
    if (n === null) continue;
    const list = modulesByNumber.get(n);
    if (list) list.push(m);
    else modulesByNumber.set(n, [m]);
  }

  const pairings: RepoFolderPairing[] = folderPaths.map((path, i) => {
    const number = folderNumbers[i];

    if (number !== null) {
      // Rule 1: number first. Never falls back to rule 2, whatever happens.
      const moduleMatches = modulesByNumber.get(number) ?? [];
      const candidates = moduleMatches.map((m) => ({ moduleId: m.id, moduleName: m.name }));
      const collidingFolders = (foldersByNumber.get(number) ?? []).filter((p) => p !== path);

      if (candidates.length === 0) {
        return {
          folderPath: path,
          state: "unbound",
          module: null,
          candidates: [],
          matchedBy: "number",
          competingFolders: [],
          overridden: false,
        };
      }
      if (candidates.length === 1 && collidingFolders.length === 0) {
        return {
          folderPath: path,
          state: "confirmed",
          module: candidates[0],
          candidates,
          matchedBy: "number",
          competingFolders: [],
          overridden: false,
        };
      }
      // More than one module shares this number, and/or another folder also
      // claims it - either way there is more than one plausible answer.
      return {
        folderPath: path,
        state: "ambiguous",
        module: null,
        candidates,
        matchedBy: "number",
        competingFolders: candidates.length === 1 ? collidingFolders : [],
        overridden: false,
      };
    }

    // Rule 2: no number at all - token overlap, suggestion only, never
    // confirmed (rule 3).
    const candidates = tokenCandidates(leafNames[i], modules);
    if (candidates.length === 0) {
      return {
        folderPath: path,
        state: "unbound",
        module: null,
        candidates: [],
        matchedBy: "token",
        competingFolders: [],
        overridden: false,
      };
    }
    if (candidates.length === 1) {
      return {
        folderPath: path,
        state: "suggested",
        module: candidates[0],
        candidates,
        matchedBy: "token",
        competingFolders: [],
        overridden: false,
      };
    }
    return {
      folderPath: path,
      state: "ambiguous",
      module: null,
      candidates,
      matchedBy: "token",
      competingFolders: [],
      overridden: false,
    };
  });

  return {
    pairings,
    unmappedFolders: pairings.filter((p) => p.state === "unbound"),
    unmappedModules: computeUnmappedModules(pairings, modules),
  };
}

/**
 * Overlays instructor overrides onto an inferred result (AC4): a folder
 * named in `overrides` is forced to "confirmed" against the named module,
 * replacing whatever `mapRepoFoldersToModules` produced for it, however
 * confident or ambiguous that was. Mirrors
 * `applyRepoGradeAssignmentMapping` (repoGradesAssignmentMapping.ts:79).
 * Never mutates `result`. An override naming a module id not present in
 * `modules` is left un-applied (defensive - `filterRepoModuleOverrides`
 * should already have dropped it before it reaches here; this function does
 * not itself resurrect a dangling override into a confirmed pairing).
 */
export function applyRepoModuleOverrides(
  result: RepoModuleMappingResult,
  overrides: RepoModuleOverrideMap,
  modules: readonly RepoModuleMappingModule[]
): RepoModuleMappingResult {
  if (Object.keys(overrides).length === 0) return result;

  const moduleById = new Map(modules.map((m) => [String(m.id), m] as const));

  const pairings = result.pairings.map((pairing) => {
    const overrideModuleId = overrides[pairing.folderPath];
    if (overrideModuleId === undefined) return pairing;
    const target = moduleById.get(overrideModuleId);
    if (!target) return pairing;
    return {
      ...pairing,
      state: "confirmed" as const,
      module: { moduleId: target.id, moduleName: target.name },
      matchedBy: "override" as const,
      competingFolders: [],
      overridden: true,
    };
  });

  return {
    pairings,
    unmappedFolders: pairings.filter((p) => p.state === "unbound"),
    unmappedModules: computeUnmappedModules(pairings, modules),
  };
}

/**
 * The restore-time filter AC4 requires: drops any override entry whose
 * folder path is not among `folderPaths`, or whose module id is not among
 * `modules` - either condition alone is enough to drop the entry. Mirrors
 * `filterRepoGradeAssignmentMapping` (repoGradesAssignmentMapping.ts:98) and
 * `loadSelectedRepoIds` (repoGradesUiState.ts:120): a stored pairing naming a
 * folder or module that no longer exists is dropped, never resurrected. Pure,
 * order-independent, never mutates `overrides`. Returns the SAME reference
 * when nothing was dropped, so a caller can skip a redundant persistence
 * write, matching the same optimization in `filterRepoGradeAssignmentMapping`.
 */
export function filterRepoModuleOverrides(
  overrides: RepoModuleOverrideMap,
  folderPaths: readonly string[],
  modules: readonly RepoModuleMappingModule[]
): RepoModuleOverrideMap {
  const validFolders = new Set(folderPaths);
  const validModuleIds = new Set(modules.map((m) => String(m.id)));
  const next: Record<string, string> = {};
  let changed = false;
  for (const [folderPath, moduleId] of Object.entries(overrides)) {
    if (validFolders.has(folderPath) && validModuleIds.has(moduleId)) {
      next[folderPath] = moduleId;
    } else {
      changed = true;
    }
  }
  return changed ? next : overrides;
}
