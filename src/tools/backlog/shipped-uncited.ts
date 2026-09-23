// The SHIPPED-BUT-UNCITED guard: flags a backlog row whose id was named in a
// commit that shipped real code, when the row's own text never records that
// commit's hash. See docs/backlog-reconciliation-2026-09-21.md section 6 for
// the incident this replaces (four rows in one day described unbuilt work
// that had already landed, one of them unnoticed for 48 commits) and section
// 6.3 for the dry run this implementation is measured against.
//
// Pure and git-free by design (Ruling: keep the git spawn isolated in
// git-commits.ts) so this file's tests never touch a real repository and
// cannot be made to depend on the clock or on how much history this
// checkout happens to hold.
//
// WHAT THIS DOES NOT DO. It does not judge whether a row's post-ship text is
// CORRECT, only whether a hash was recorded at all - and it does not look at
// commit bodies, only subjects (see `subjectNamesId`'s own comment for why).
// The reverse direction - a row claiming work that was never done - is out
// of scope; that is the residual register in the reconciliation report.

import type { BacklogItem } from "./types";

export interface WorkCommit {
  /** The commit's abbreviated hash, as `git log --format=%h` gives it. */
  hash: string;
  subject: string;
  /** Paths touched by the commit, as `git log --name-only` lists them - repo-root-relative, forward-slash. */
  files: string[];
}

export interface ShippedUncitedFlag {
  itemId: string;
  commit: WorkCommit;
}

// A commit that touches only these paths is backlog bookkeeping, not a
// ship: a row-count bump in docs/backlog.yml, a rendered docs/BACKLOG.md, an
// area registration, or the generated-text canary's own frozen count. Any
// commit path outside this list counts as WORK, regardless of the commit's
// conventional-commit type - `db747cc` is typed `docs(...)` in its subject
// and still carries sixteen source files (reconciliation report section
// 6.1, point 2), so the type is not trustworthy and is deliberately ignored.
const IGNORED_PATH_PREFIXES = ["docs/", ".claude/"];
const IGNORED_EXACT_PATHS = [
  "src/tools/backlog/backlog-file.structure.test.ts",
  "src/tools/backlog/areas.ts",
];

function isIgnoredPath(path: string): boolean {
  if (IGNORED_EXACT_PATHS.includes(path)) return true;
  return IGNORED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** A WORK commit touches at least one path that is not pure backlog bookkeeping. */
export function isWorkCommit(commit: WorkCommit): boolean {
  return commit.files.some((f) => !isIgnoredPath(f));
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-bounded, case-insensitive, SUBJECT only (reconciliation report
// section 6.3's last point: matching the body as well would catch A14, but
// it would also fire on casual cross-references like "unblocks A7" or
// "uses G2 for guard 2" that name a row without shipping it. The report
// recommends body matching only behind a trailer convention this repo does
// not have, so this checker deliberately misses the body-only case - A14's
// commit names it only in the body and this checker will not flag it.
function subjectNamesId(subject: string, id: string): boolean {
  const re = new RegExp(`(^|[^A-Za-z0-9-])${escapeForRegex(id)}([^A-Za-z0-9]|$)`, "i");
  return re.test(subject);
}

// Hashes are hex, 7-40 characters as git abbreviates or spells them out.
function extractHashTokens(text: string): string[] {
  return text.match(/\b[0-9a-f]{7,40}\b/gi) ?? [];
}

// A row citing a short hash must match a commit's long hash and vice versa -
// whichever token is shorter must be a prefix of the longer one.
function isPrefixEitherWay(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return longer.startsWith(shorter);
}

function rowCitesHash(item: BacklogItem, hash: string): boolean {
  const haystack = [item.title, item.from, item.note, item.instrument].join(" ");
  const tokens = extractHashTokens(haystack);
  const needle = hash.toLowerCase();
  return tokens.some((t) => isPrefixEitherWay(t.toLowerCase(), needle));
}

/**
 * Flags every (row, commit) pair where a WORK commit names the row's id in
 * its subject and the row's own text does not cite that commit's hash.
 *
 * A closed row cannot be flagged for the simple reason that it does not
 * appear in `items` at all - this repo deletes a row at closure (Ruling
 * BA-8) rather than marking it closed, so "do not flag a closed row" needs
 * no special-case code here: the caller only ever passes the live set.
 */
export function shippedButUncited(items: BacklogItem[], commits: WorkCommit[]): ShippedUncitedFlag[] {
  const workCommits = commits.filter(isWorkCommit);
  const flags: ShippedUncitedFlag[] = [];
  for (const item of items) {
    for (const commit of workCommits) {
      if (!subjectNamesId(commit.subject, item.id)) continue;
      if (rowCitesHash(item, commit.hash)) continue;
      flags.push({ itemId: item.id, commit });
    }
  }
  return flags;
}

export function formatShippedUncitedReason(flags: ShippedUncitedFlag[]): string {
  const lines = flags.map(
    (f) =>
      `${f.itemId} names ${f.commit.hash} ("${f.commit.subject}") in a commit that touches code, but the row's ` +
      `text does not cite that hash: update the row (its note or from field) to record the ship, or say the ` +
      `mention is unrelated.`,
  );
  return (
    "SHIPPED-BUT-UNCITED: the following backlog row(s) were named by a commit that shipped code, without " +
    "recording it:\n" +
    lines.join("\n")
  );
}
