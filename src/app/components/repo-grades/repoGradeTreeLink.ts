// Repo Grades view - A5: "for the links that are generated on the repo
// grading screen, link them out to the branch and folder specified that were
// just graded" (the owner's request). Owner decision (Ruling A5-5): repoint
// the ONE existing row link (RepoGradesGrid.tsx's `<a href={row.htmlUrl}>`)
// at the currently selected folder on the branch recorded at scan time -
// never a per-cell link.
//
// Pure, no I/O - matches this directory's own one-file-several-related-
// exports convention (repoGradeScoreDisplay.ts, repoGradePostScore.ts,
// repoGradeStudentName.ts), none of which exports a single default.

import { ALL_FOLDERS } from "./repoGradesFolderSelection";

// Duplicated from src/lib/github.files.ts:6 (`encodePath`,
// `path.split("/").map(encodeURIComponent).join("/")`), which is unexported
// and lives in a server-only module: src/app/actions/repo-grades.ts:3-6
// states plainly that src/lib/github*.ts reads process.env.GITHUB_TOKEN and
// nothing client-side may import it directly, and RepoGradesGrid.tsx (this
// file's one caller) is "use client". This directory already duplicates a
// one-line, unexported, pure expression twice for the identical reason -
// repoGradesRows.ts:43-56's naturalCompare (itself copied from
// repo-assignment-folders.ts:58, citing repo-student-bindings.ts:82) and
// repoGradesFolderSelection.ts:73-84's SECOND copy of that same comparator -
// so a third home is not warranted for one line; a third real consumer would
// be the trigger to extract, not this chunk.
const encodeFolderSegments = (folder: string): string => folder.split("/").map(encodeURIComponent).join("/");

/**
 * The row link's href (Ruling A5-2/A5-5): the currently selected folder's
 * tree URL on the branch `defaultBranch` recorded at scan time
 * (RepoFolderRow.defaultBranch / RepoGradeRow.defaultBranch), or `htmlUrl`
 * unchanged - exactly today's behaviour - when there is no single folder to
 * point at yet:
 *   - `selectedFolder === ALL_FOLDERS`: no one folder is in view (Ruling
 *     A5-5's "one gap, stated rather than hidden").
 *   - `selectedFolder === ""`: defensive only - resolveSelectedFolder
 *     (repoGradesFolderSelection.ts:179-184) never actually returns a bare
 *     empty string, but this avoids ever building a URL with a dangling
 *     trailing slash if that ever changed.
 *
 * Returns `null` - never a same-origin relative URL - when `htmlUrl` is
 * empty (Ruling A5-3: mapRepo sets `htmlUrl: r.html_url ?? ""`
 * (src/lib/github.repos.ts:92), and `${""}/tree/main/week-1` would resolve
 * to `/tree/main/week-1`, a URL that navigates INSIDE this app rather than
 * to GitHub - worse than today's `href=""` no-op). The render site
 * (RepoGradesGrid.tsx) treats `null` as "render the repo name as plain text,
 * not inside an `<a>`".
 */
export function buildRepoGradeRowLinkHref(htmlUrl: string, branch: string, selectedFolder: string): string | null {
  if (htmlUrl === "") return null;
  if (selectedFolder === ALL_FOLDERS || selectedFolder === "") return htmlUrl;
  return `${htmlUrl}/tree/${encodeURIComponent(branch)}/${encodeFolderSegments(selectedFolder)}`;
}

/**
 * The link's accessible name (Ruling A5-6): `aria-label` AND `title` on the
 * `<a>`, never the visible row text (which stays `row.repo` unchanged from
 * today). Every cell in this grid is `white-space: nowrap` inside a
 * horizontally-scrolling wrapper (repo-grades.module.css:33-39/:21-22), and
 * the branch is the SAME string on every one of a course's up to 1000 rows
 * (github.repos.ts:90,139-147) - appending it to the visible text would
 * widen an already-scrolling column with a thousand repetitions of one word.
 * WCAG 2.5.3 Label-in-Name still holds because the visible text (`repo`) is
 * a prefix of this accessible name.
 *
 * Only ever called by the render site when a specific folder is selected
 * (Ruling A5-9): in the ALL_FOLDERS view the href pins no branch, so stating
 * one in the accessible name would be false.
 */
export function buildRepoGradeRowLinkText(repo: string, branch: string): string {
  return `${repo} @ ${branch}`;
}
