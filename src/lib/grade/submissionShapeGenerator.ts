/**
 * A44 (RULING 97): a deterministic generator of synthetic submission-zip
 * shapes, used by `utils.test.ts` and `collisionRefusal.test.ts` to run the
 * soundness/monotonicity sweeps (docs/a44-test-notes.md sections 1.4 and 2,
 * requirements R2/R14) against far more sets than any hand-written fixture
 * table could hold.
 *
 * This file IMPORTS NOTHING, deliberately. It is a plain, non-test leaf so
 * two test files can share it without one importing the other's
 * `*.test.ts` (which would re-run that file's `describe` blocks under the
 * wrong setup - docs/loop/traps-tests.md) - `src/lib/count-lines.ts` is this
 * repo's existing precedent for exactly that shape. Importing nothing also
 * means adding this leaf cannot move
 * `src/lib/module-graph/runtime-import-graph.test.ts`'s frozen import-trail
 * list, since a leaf with zero imports of its own contributes zero new
 * trails to anything that imports IT.
 *
 * Every constant, the PRNG, the per-file draw order and the seventeen shape
 * formulas below are transcribed verbatim from docs/a44-test-notes.md
 * section 0.8b, which pins the ONE thing the row-1 generator's published
 * spec left open: the `rnd()` CALL ORDER within a set. A frozen integer
 * whose generator lives outside the tree is not a frozen integer - see that
 * section for the measured case.
 */

export const STUDENTS = [
  "AlvarezMaria",
  "BrownTom",
  "ChenLi",
  "DavisAnn",
  "EvansJo",
  "FordKim",
  "GarciaLuz",
  "HallSam",
  "IvanovNik",
  "JonesPat",
  "KimDae",
  "LopezAna",
  "MurphyDev",
  "NguyenAn",
  "OkaforChi",
] as const;

export const STEMS = [
  "essay",
  "Essay Final",
  "Essay Draft",
  "Homework Final",
  "Homework Draft",
  "homework",
  "reflection",
  "Reflection Final",
  "report",
  "Report Draft",
  "paper",
  "Paper Final",
  "lab",
  "Lab Report",
  "midterm",
] as const;

export const EXTS = ["docx", "txt", "pdf", "md"] as const;

export const COMPONENTS = [
  "backend",
  "frontend",
  "docs",
  "src",
  "tests",
  "api",
  "web",
  "lib",
] as const;

export const DEFAULT_SEED = 20260927;
export const DEFAULT_SWEEP_N = 20000;

/** The eleven shapes docs/a44-test-notes.md carried from round 1, unchanged,
 *  plus the six added in round 2. Frozen AS A SET with its exact length -
 *  the headless.test.ts exact-set-size idiom - so a caller that drops one
 *  loses coverage visibly rather than silently (M-SWEEP d). */
export const SHAPE_NAMES = [
  "flat",
  "folder",
  "convention",
  "convention-resubmit",
  "folder-distinct-stems",
  "shared-wrapper-folder",
  "single-student-multi-folder-shared-filename",
  "nested-bulk-perstudent-folders",
  "mixed-perstudent-plus-shared-dropbox",
  "duplicate-folder-name",
  "folder-resubmit",
  "nested-perstudent-subdirs",
  "nested-shared-dropbox-subdirs",
  "flat-forgery",
  "flat-forgery-perpart",
  "conv-forgery",
  "crossstep-ambiguity",
] as const;

export type ShapeName = (typeof SHAPE_NAMES)[number];

export interface GeneratedFile {
  /** The path as it would appear inside `submissions`/the declared owner map. */
  path: string;
  /** The declared owner - GROUND TRUTH, never re-derived from the path by a
   *  consumer; recovered from `content`'s marker, never from the file name
   *  (the headline fixture has byte-identical names across owners). */
  owner: string;
  /** `<<M<setIndex>-<fileIndex>>> <declaredOwner>` - the content a consumer
   *  must recover a file's row by, never by file name. */
  content: string;
  /** Present (non-empty) only for the two shapes that cross a zip boundary. */
  zipChain: string[];
}

export type GeneratedSet = GeneratedFile[];

/** mulberry32, transcribed verbatim from docs/a44-test-notes.md 0.8b. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function rnd(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate `n` sets for `shape`, using ONE `rnd` stream created once before
 * set 0 (per docs/a44-test-notes.md 0.8b) - so the shapes drawn later in the
 * SHAPE_NAMES order are not reproducible in isolation from a fresh seed; a
 * caller wanting one shape's own numbers still calls this with that shape
 * alone and its own seed, which is what every consumer here does.
 *
 * Duplicate paths within a set are dropped; a set left with fewer than 2
 * distinct paths is skipped (recorded in the returned array's length, which
 * can therefore be below `n`).
 */
export function generateShape(shape: ShapeName, n: number, seed: number): GeneratedSet[] {
  const rnd = mulberry32(seed);
  const sets: GeneratedSet[] = [];

  for (let setIndex = 0; setIndex < n; setIndex += 1) {
    const size = 2 + Math.floor(rnd() * 5); // 2..6
    const pool = STUDENTS.slice() as string[];
    const owners: string[] = [];
    const files: GeneratedFile[] = [];
    const seenPaths = new Set<string>();
    let previousDir = "";
    let previousBaseKey = "";

    for (let i = 0; i < size; i += 1) {
      const rResub = rnd(); // always drawn, every shape, to keep the stream aligned

      let owner: string;
      if (shape === "single-student-multi-folder-shared-filename" && i > 0) {
        owner = owners[0];
      } else if (shape.endsWith("-resubmit") && i > 0 && rResub < 0.5) {
        owner = owners[i - 1];
      } else {
        const idx = Math.floor(rnd() * pool.length);
        owner = pool.splice(idx, 1)[0];
      }
      owners.push(owner);

      const stem = STEMS[Math.floor(rnd() * STEMS.length)];
      const ext = EXTS[Math.floor(rnd() * EXTS.length)];
      const comp = COMPONENTS[Math.floor(rnd() * COMPONENTS.length)];

      const { path, zipChain } = buildPath(shape, i, owner, owners, stem, ext, comp, previousDir, previousBaseKey);

      // Track the previous file's directory/base-key for the three forgery
      // shapes' next (odd-indexed) file, per 0.8b.
      const lastSlash = path.replace(/\\/g, "/").lastIndexOf("/");
      previousDir = lastSlash >= 0 ? path.slice(0, lastSlash).toLowerCase() : "";
      previousBaseKey = leafStemFallbackForGenerator(path);

      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
      files.push({ path, owner, content: `<<M${setIndex}-${i}>> ${owner}`, zipChain });
    }

    if (files.length >= 2) {
      sets.push(files);
    }
  }

  return sets;
}

/** A generator-side transcription of `leafStemFallback`'s own
 *  `/^([A-Za-z0-9]+)/`-then-`.trim()` logic, lower-cased - used ONLY to build
 *  the forgery shapes' crafted odd-indexed file, per 0.8b. Deliberately not
 *  imported from `utils.ts`, since this leaf imports nothing. */
function leafStemFallbackForGenerator(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const match = stem.match(/^([A-Za-z0-9]+)/);
  const fallback = (match?.[1] ?? stem).trim() || "unknown";
  return fallback.toLowerCase();
}

function buildPath(
  shape: ShapeName,
  i: number,
  owner: string,
  owners: string[],
  stem: string,
  ext: string,
  comp: string,
  previousDir: string,
  previousBaseKey: string
): { path: string; zipChain: string[] } {
  switch (shape) {
    case "flat":
      return { path: `${stem}.${ext}`, zipChain: [] };
    case "folder":
    case "folder-resubmit":
      return { path: `${owner}/${stem}.${ext}`, zipChain: [] };
    case "convention":
    case "convention-resubmit":
      return {
        path: `${owner.toLowerCase()}_2026-09-0${(i % 9) + 1}_120${i}00_${stem}.${ext}`,
        zipChain: [],
      };
    case "folder-distinct-stems":
      return { path: `${owner}/${owner}-work.${ext}`, zipChain: [] };
    case "shared-wrapper-folder":
      return { path: `Submissions/${stem}.${ext}`, zipChain: [] };
    case "single-student-multi-folder-shared-filename":
      return { path: `${comp}/config.${ext}`, zipChain: [] };
    case "nested-bulk-perstudent-folders":
      return { path: `bulk.zip/${owner}/${stem}.${ext}`, zipChain: ["bulk.zip"] };
    case "mixed-perstudent-plus-shared-dropbox":
    case "duplicate-folder-name": {
      const dirName = shape === "duplicate-folder-name" ? "JohnSmith" : "Shared";
      const dir = i < 2 ? dirName : owner;
      return { path: `${dir}/${stem}.${ext}`, zipChain: [] };
    }
    case "nested-perstudent-subdirs":
      return { path: `Submissions/${owner}/${comp}/${stem}.${ext}`, zipChain: [] };
    case "nested-shared-dropbox-subdirs": {
      const dir = i < 2 ? "Shared" : owner;
      return { path: `Submissions/${dir}/${comp}/${stem}.${ext}`, zipChain: [] };
    }
    case "flat-forgery": {
      if (i % 2 === 0) return { path: `${owner}/${stem}.${ext}`, zipChain: [] };
      return { path: ` ${previousDir.length}:${previousDir}${previousBaseKey}.${ext}`, zipChain: [] };
    }
    case "flat-forgery-perpart": {
      if (i % 2 === 0) return { path: `${owner}/${stem}.${ext}`, zipChain: [] };
      return {
        path: ` ${previousDir.length}:${previousDir}${previousBaseKey.length}:${previousBaseKey}.${ext}`,
        zipChain: [],
      };
    }
    case "conv-forgery": {
      if (i % 2 === 0) return { path: `${owner}/${stem}.${ext}`, zipChain: [] };
      return {
        path: `${previousDir.length}:${previousDir}${previousBaseKey.length}:${previousBaseKey}_2026-09-01_120000_x.${ext}`,
        zipChain: [],
      };
    }
    case "crossstep-ambiguity": {
      if (i % 2 === 0) {
        return { path: `${owner}.zip/${comp}/${stem}/main.py`, zipChain: [`${owner}.zip`] };
      }
      return { path: `${owners[i - 1]}/${comp}/${stem}.txt`, zipChain: [] };
    }
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}
