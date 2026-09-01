// Line-counting helper shared by every *.structure.test.ts file-size-ceiling
// gate (currently src/file-size-ceiling.structure.test.ts and
// src/app/components/recording/recording-split.structure.test.ts).
//
// Matches PowerShell's `@(Get-Content <file>).Count` - the measurement this
// project's own convention (AGENTS.md, docs/DEV_LOOP.md) mandates, and NOT
// plain `content.split("\n").length`. The two disagree by exactly one for
// any file ending in a trailing newline (almost every file in this repo):
// split("\n") counts the empty string after the final newline as an extra
// "line", Get-Content does not. Proven while building the repo-wide gate:
// with split("\n").length, src/app/actions/canvas-inbox.ts - measured at
// exactly 1000 by Get-Content and described elsewhere as "at the wall, with
// zero headroom" - came out to 1001 and failed a gate it is not actually
// over. Counting the Get-Content way keeps every gate's numbers consistent
// with the numbers a human (or another agent) gets by running the mandated
// measurement command directly.
//
// Plain TypeScript, not a *.test.ts file: importing a helper from another
// *.test.ts file re-runs that file's own describe/it blocks a second time
// under the importing file's run (a recorded trap in this repo). A leaf
// module like this one has no describe blocks to re-run, so both gates can
// share it with no such risk, and a future gate can too.
export function countLines(content: string): number {
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length;
}
