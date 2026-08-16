// Durable repo-to-module associations
// (docs/durable-repo-module-associations-acceptance-criteria.md): the pure,
// client-safe coercer for the `course_hub.repo_module_pairing` jsonb column.
// This file is the ONLY place that knows the stored shape and how to turn
// untrusted jsonb into it defensively - mirrors coerceCourseProject
// (course-project.ts) and coerceWeeklyChecklist (weekly-checklist.ts): never
// throws, and any unknown/missing/malformed field falls back to the empty
// default rather than propagating garbage to a caller.
//
// SHAPE (the design settled in the AC doc, not renegotiable here): ONE tagged
// array, not two maps and not a folder-keyed record -
//   { v: 1, repoRef, branch, associations: [{ path, kind: "folder" | "file",
//     moduleId, boundAt }] }
// so a folder and a file inside it can both carry an association without a
// key-space collision ("module_08" the folder belongs to Module 8, but
// "module_08/extra-credit.md" the file belongs to Module 12), and each entry
// has room for the metadata a durable record wants (`boundAt`).
//
// AC3 - THE MOST IMPORTANT RULE THIS FILE SUPPORTS BUT DOES NOT ITSELF
// ENFORCE: a stale association (naming a folder/file path or module id that
// is not present right now) is preserved here, unmodified - this coercer
// never drops an entry for being "currently invalid". Computing which
// entries are ACTIVE right now is a read-time concern for the caller
// (useRepoPairing.ts), reusing repo-module-mapping.ts's own
// `filterRepoModuleOverrides` as the activation filter (that function's
// existing behaviour is exactly "is this path/moduleId pair currently real",
// which is what "active" means - see that file's own header for why it
// changes ROLE rather than being duplicated here). This coercer only
// enforces STRUCTURAL validity (right shape, right types, bounded size) -
// never real-world validity, which changes with every branch switch and this
// module has no way to know about.
//
// Pure: no I/O, no React, no Supabase - safe to import from a client
// component (courses.types.ts's own "ZERO runtime code" header explains why
// that file only ever `import type`s this one).

import {
  filterRepoModuleOverrides,
  type RepoModuleMappingModule,
  type RepoModuleOverrideMap,
} from "@/lib/repo-module-mapping";

/** Which kind of repo tree entry an association names - a folder association
 * covers every file inside it that has no association of its own (AC2's
 * "defaults to showing the association inherited from its folder"); a file
 * association overrides that inheritance for one specific file. */
export type RepoAssociationKind = "folder" | "file";

/** One durable folder-or-file-to-module association. */
export interface RepoModuleAssociation {
  /** The repo tree path this association names, e.g.
   * "assignments/module_08" (a folder) or
   * "assignments/module_08/README.md" (a file) - the same path strings
   * RepoFolderNode.path / RepoFolderFile.path (repo-folder-tree.ts) produce. */
  path: string;
  kind: RepoAssociationKind;
  /** Stringified course module id - the same `String(m.id)` shape
   * RepoModuleOverrideMap already uses (repo-module-mapping.ts). */
  moduleId: string;
  /** ISO timestamp of when this association was made (or last changed) -
   * informational only, never read for activation. */
  boundAt: string;
}

/** The full stored shape of `course_hub.repo_module_pairing`. `v: 1` is a
 * format tag, not a course-content version - `coerceRepoModulePairing`
 * degrades ANY value with a different (or missing) `v` to the empty default
 * rather than guessing how to read an unknown format, so a future format
 * change can detect and refuse today's shape instead of silently
 * misinterpreting it. */
export interface RepoModulePairing {
  v: 1;
  /** "owner/name", or "" for "no repo paired yet" - same string
   * listGithubReposAction's `fullName` and getRepoTreeAction's `repoRef`
   * both use. */
  repoRef: string;
  /** "" means "use the repo's default branch" - same convention
   * repoPairingState.ts's PairedRepoSelection already used for the
   * (superseded) localStorage version of this same choice. */
  branch: string;
  associations: RepoModuleAssociation[];
}

// Bounds, mirroring course-project.ts's own MAX_MILESTONES/MAX_TOOLS
// reasoning: the whole column is selected on every course list read, so an
// unbounded association list would make listing courses progressively
// slower for everyone. Generous relative to any repo this app has actually
// measured (the reference repo has 16 assignment folders and 36 files total,
// docs/repo-pairing-in-modules-acceptance-criteria.md).
const MAX_ASSOCIATIONS = 1000;
const MAX_PATH_LEN = 1000;
const MAX_REPO_REF_LEN = 300;
const MAX_BRANCH_LEN = 300;
const MAX_MODULE_ID_LEN = 200;

export function emptyRepoModulePairing(): RepoModulePairing {
  return { v: 1, repoRef: "", branch: "", associations: [] };
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Stringifies a module id the same way repo-module-mapping.ts's
 * RepoModuleOverrideMap already does (`String(m.id)`), so a numeric Canvas
 * module id round-trips through jsonb (which has no separate integer-key
 * concept) without a type mismatch against `modules.map(m => String(m.id))`
 * comparisons downstream. */
function moduleIdString(value: unknown, max: number): string {
  if (typeof value === "string") return value.slice(0, max);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * Defensive coercion for the `repo_module_pairing` jsonb: never throws, and
 * any unknown/missing/malformed field falls back to the empty default rather
 * than propagating garbage to callers. Tolerates the column being entirely
 * absent (AC10 - `raw === undefined`, e.g. a migration that has not applied
 * yet) by reading it exactly like "unpaired", the same degrade-gracefully
 * contract coerceCourseProject/coerceWeeklyChecklist already have for their
 * own columns.
 *
 * A malformed ASSOCIATION is dropped rather than defaulted - inventing a
 * path or a module id would silently fabricate an instructor decision that
 * was never made, which is worse than the association simply being absent.
 * A duplicate (same `kind` + `path`) is collapsed to its LAST occurrence
 * (rather than its first, unlike coerceCourseProject's milestone dedupe) so
 * that hand-edited or replayed jsonb resolves to whatever the array's own
 * tail says, matching how `setAssociation` itself upserts (see
 * useRepoPairing.ts) - the newest entry for a path+kind pair wins. A file
 * association and a folder association that share the same PATH STRING
 * coexist without colliding, because they are keyed on kind+path together,
 * not path alone - this is the whole reason the stored shape is one tagged
 * array rather than two separate path-keyed maps (see this file's header).
 */
export function coerceRepoModulePairing(raw: unknown): RepoModulePairing {
  const defaults = emptyRepoModulePairing();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;

  const obj = raw as Record<string, unknown>;
  if (obj.v !== 1) return defaults;

  const repoRef = str(obj.repoRef, MAX_REPO_REF_LEN);
  const branch = str(obj.branch, MAX_BRANCH_LEN);

  const byKey = new Map<string, RepoModuleAssociation>();
  if (Array.isArray(obj.associations)) {
    for (const entry of obj.associations) {
      if (byKey.size >= MAX_ASSOCIATIONS) break;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const a = entry as Record<string, unknown>;

      const path = str(a.path, MAX_PATH_LEN).trim();
      if (!path) continue;

      const kind: RepoAssociationKind | null = a.kind === "folder" || a.kind === "file" ? a.kind : null;
      if (!kind) continue;

      const moduleId = moduleIdString(a.moduleId, MAX_MODULE_ID_LEN);
      if (!moduleId) continue;

      const boundAt = str(a.boundAt, 64);

      byKey.set(`${kind}:${path}`, { path, kind, moduleId, boundAt });
    }
  }

  return { v: 1, repoRef, branch, associations: Array.from(byKey.values()) };
}

// ---------------------------------------------------------------------------
// AC3/AC4/AC5 activation - the read-time "which stored associations are real
// right now" computation.
// ---------------------------------------------------------------------------

/** folderPath/filePath -> the still-associations that ARE active, split by
 * kind so the folder half can be fed straight into
 * repo-module-mapping.ts's `applyRepoModuleOverrides` (AC3/AC4) exactly as
 * before, and `inactive` is every association currently naming a path or
 * module id that is not real right now (AC6) - a VIEW only, never a
 * mutation of the association list a caller passed in. */
export interface ActiveRepoAssociations {
  folderOverrides: RepoModuleOverrideMap;
  fileOverrides: RepoModuleOverrideMap;
  /** Same objects as the input array, a subset - never copies, never
   * dropped from storage. Order matches the input. */
  inactive: readonly RepoModuleAssociation[];
}

function overrideMapForKind(
  associations: readonly RepoModuleAssociation[],
  kind: RepoAssociationKind
): RepoModuleOverrideMap {
  const map: Record<string, string> = {};
  for (const a of associations) if (a.kind === kind) map[a.path] = a.moduleId;
  return map;
}

/**
 * AC3 - THE MOST IMPORTANT FUNCTION IN THIS FILE, and it REVERSES the
 * pre-durable localStorage rule (repoPairingState.ts's own former
 * `persistRepoModuleOverrides`, which wrote a FILTERED map straight back to
 * storage - meaning a branch switch that made a folder momentarily absent
 * deleted its association for every device, permanently). This function
 * never drops anything: `associations` is returned unmodified, in full,
 * through `inactive` for whatever did not validate.
 *
 * `active = path is present AND moduleId is present`, computed by reusing
 * repo-module-mapping.ts's `filterRepoModuleOverrides` UNMODIFIED (AC4 - it
 * changes ROLE here, from "the persistence filter" to "the activation
 * filter", but its behaviour and its same-reference-when-nothing-dropped
 * optimisation are untouched) once per kind, against the two disjoint path
 * namespaces (folder paths never collide with file paths inside them, since
 * a file path always carries the folder's path as a strict prefix plus a
 * filename). The folder half is exactly what AC4 already fed into
 * `applyRepoModuleOverrides`, so every one of that function's four pairing
 * states and every downstream consumer stays byte-identical (AC3's own
 * closing sentence).
 *
 * `presentFolderPaths`/`presentFilePaths` should be the CALLER's cached
 * "last successfully loaded tree" set (AC5), not the live, possibly-empty
 * set mid-fetch - see useRepoPairing.ts's own `readyFolderPaths`/
 * `readyFilePaths` state for why a transient empty tree must never reach
 * this function as if it were real.
 */
export function activateRepoModulePairing(
  associations: readonly RepoModuleAssociation[],
  presentFolderPaths: readonly string[],
  presentFilePaths: readonly string[],
  modules: readonly RepoModuleMappingModule[]
): ActiveRepoAssociations {
  const folderOverrides = filterRepoModuleOverrides(
    overrideMapForKind(associations, "folder"),
    presentFolderPaths,
    modules
  );
  const fileOverrides = filterRepoModuleOverrides(overrideMapForKind(associations, "file"), presentFilePaths, modules);

  const inactive = associations.filter((a) => {
    const active = a.kind === "folder" ? folderOverrides : fileOverrides;
    return active[a.path] !== a.moduleId;
  });

  return { folderOverrides, fileOverrides, inactive };
}

/**
 * Upsert-or-remove ONE association by its (kind, path) key (AC2/AC3's
 * "deletion happens only on explicit action"): `moduleId: null` is the one
 * explicit-delete path (mirrors "setting the select back to Auto"); any
 * other value replaces whatever was stored for that exact kind+path,
 * refreshing `boundAt`. Every OTHER association - including every currently
 * inactive one - passes through untouched, which is what makes this safe to
 * call from a component that only ever sees the currently-visible (active)
 * folders/files: it edits the ONE entry the instructor actually touched,
 * never rebuilds the array from an already-filtered view. Pure - returns a
 * new array, never mutates `associations`.
 */
export function upsertRepoModuleAssociation(
  associations: readonly RepoModuleAssociation[],
  path: string,
  kind: RepoAssociationKind,
  moduleId: string | null,
  boundAt: string
): RepoModuleAssociation[] {
  const withoutThis = associations.filter((a) => !(a.kind === kind && a.path === path));
  if (moduleId === null) return withoutThis;
  return [...withoutThis, { path, kind, moduleId, boundAt }];
}
