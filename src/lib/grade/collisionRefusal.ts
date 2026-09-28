import { parseSubmissionFileName, a44DecodeKey, a44ContainerRelativeDir } from "./utils";

/**
 * A44 wave 2, RULING 87's REFINED amnesty (the unrefined form was withdrawn
 * as unsound - docs/BACKLOG.md's A44 row): when a run's parse would collide
 * two or more distinct students onto one identity key, REFUSE rather than
 * silently blend them - UNLESS every file in the colliding group sits inside
 * one shared, non-empty folder AND the run's stem-fallback-reaching
 * population shows 2 or more distinct container-relative directories
 * elsewhere (the run gate). A colliding group is folder-homogeneous by
 * construction under RULE K - equal identity keys decode to equal
 * `[dir, stem]` tuples - so "the group's folder" is always well-defined when
 * it has one at all.
 */

interface CollidingGroup {
  /** The colliding files' shared identity key. */
  key: string;
  /** The shared display (student name) they would have collapsed onto. */
  display: string;
  /** Every colliding path, in the order `submissions` iterated them. */
  paths: string[];
}

export type CollisionRefusalDecision =
  | { status: "ok" }
  | { status: "no-folder-signal"; group: CollidingGroup }
  | { status: "flat-collision-in-foldered-run"; group: CollidingGroup };

/**
 * Decide whether a run's parse would silently blend two or more distinct
 * students onto one graded row. Computed over `submissions`/`zipParents`
 * alone - the same inputs `groupSubmissionsByStudent` receives - with NO
 * `inferredLookup`, so this predicate is defined purely by ground-truth
 * paths, never by a model guess (docs/a44-test-notes.md R2's instrument is
 * built the same way).
 */
export function decideCollisionRefusal(
  submissions: Record<string, string>,
  zipParents: Record<string, string[]> | undefined
): CollisionRefusalDecision {
  const groups = new Map<string, { display: string; paths: string[] }>();
  const distinctFolders = new Set<string>();

  for (const filePath of Object.keys(submissions)) {
    const zipChain = zipParents?.[filePath] ?? [];
    const parsed = parseSubmissionFileName(filePath, undefined, zipChain);
    if (!parsed.reachedStemFallback) continue;

    // The amnesty's run gate counts DISTINCT container-relative directories
    // among the fallback-reaching population - recovered from the identity
    // KEY's own arity (two decoded parts = `[dir, stem]`), never by
    // re-deriving the directory from the raw path a second time.
    const decoded = a44DecodeKey(parsed.studentKey);
    if (decoded && decoded.length === 2) {
      distinctFolders.add(decoded[0]);
    }

    const existing = groups.get(parsed.studentKey);
    if (existing) {
      existing.paths.push(filePath);
    } else {
      groups.set(parsed.studentKey, { display: parsed.studentDisplay, paths: [filePath] });
    }
  }

  // Walked in identity-KEY order - same discipline as groupSubmissionsByStudent's
  // own terminal pass - so which colliding group is reported first is a
  // function of the file set alone, never of iteration order.
  const sortedKeys = Array.from(groups.keys()).sort();
  for (const key of sortedKeys) {
    const group = groups.get(key);
    if (!group || group.paths.length < 2) continue;

    const decoded = a44DecodeKey(key);
    const hasFolder = decoded !== null && decoded.length === 2;
    if (hasFolder && distinctFolders.size >= 2) {
      continue; // RULING 87's refined amnesty: the run gate is open and this
      // group's own folder makes it distinguishable from any other student's.
    }

    const collidingGroup: CollidingGroup = { key, display: group.display, paths: group.paths };
    if (distinctFolders.size >= 2) {
      return { status: "flat-collision-in-foldered-run", group: collidingGroup };
    }
    return { status: "no-folder-signal", group: collidingGroup };
  }

  return { status: "ok" };
}

const MAX_LISTED_PATHS = 5;

function formatPathList(paths: string[]): string {
  const sorted = [...paths].sort();
  const shown = sorted.slice(0, MAX_LISTED_PATHS).join(", ");
  const more = sorted.length > MAX_LISTED_PATHS ? ", ..." : "";
  return `${shown}${more}`;
}

/**
 * `group`'s container-relative directory, case-preserving, for the copy
 * only - recovered from the raw path via `a44ContainerRelativeDir`, NEVER
 * from the (lower-cased) decoded key. This is the ONE caller
 * `a44ContainerRelativeDir` has in this wave; if a later revision of the
 * refusal copy stops naming a folder, this function (and the export) has no
 * caller left and must be inlined/removed rather than kept as a dead export
 * (docs/a44-waves.md 6.3's stated condition).
 */
function folderForCopy(group: CollidingGroup, zipParents: Record<string, string[]> | undefined): string {
  const firstPath = [...group.paths].sort()[0];
  return a44ContainerRelativeDir(firstPath, zipParents?.[firstPath] ?? []);
}

function buildRefusalMessage(
  decision: { status: "no-folder-signal" | "flat-collision-in-foldered-run"; group: CollidingGroup },
  zipParents: Record<string, string[]> | undefined
): string {
  const { group } = decision;
  const folder = folderForCopy(group, zipParents);
  const folderClause = folder ? ` in folder "${folder}"` : "";
  const closing =
    decision.status === "no-folder-signal"
      ? "This archive has no other student folders, so the folder name is not enough to tell these apart."
      : "Other files in this archive have their own student folders, but these do not, so the folder name is not enough to tell these apart.";

  return (
    `Refused: ${group.paths.length} files${folderClause} resolve to the same student name "${group.display}", ` +
    `so they would have been graded together as one row: ${formatPathList(group.paths)}. ${closing} ` +
    `Put each student's files in their own folder inside the zip, or rename each file to studentname_date_time_filename, then upload again. No grades were produced.`
  );
}

/**
 * The emitted `error` string for a refusal, or `null` on `"ok"`. A
 * `default`-less exhaustive `switch` (precedent: `submission-zip-intake.ts`'s
 * `describeZipIntakeDecision`) so a future refusal variant added to
 * `CollisionRefusalDecision` with no case here fails `npx tsc --noEmit`
 * rather than shipping silently through vitest.
 */
export function describeCollisionRefusal(
  decision: CollisionRefusalDecision,
  zipParents: Record<string, string[]> | undefined
): string | null {
  switch (decision.status) {
    case "ok":
      return null;
    case "no-folder-signal":
    case "flat-collision-in-foldered-run":
      return buildRefusalMessage(decision, zipParents);
  }
}
