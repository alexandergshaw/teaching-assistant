// P9 (docs/l14-scope.md section 9): the detector's 40-case canary table.
// Ported verbatim in intent from the measured prototype `arch-l14/canary2.mjs`
// (L14 revision 1), which reported "cases 40 failures 0" against the real
// detector. Proven able to fail: a copy of this table with all 16 must-fire
// rows' expected raw count flipped from 1 to 0 reported 16 of 16 flipped
// cases RED (a first attempt at this proof used a text-substitution script
// that skipped the one FIRE row written as a multi-line array literal -
// "wrapped inline span" - leaving it unflipped and silently reporting 15 of
// 16; that row discriminates identically to the other 15 once actually
// flipped).
//
// This file owns P9 only - it never touches the filesystem, so it needs no
// timeout beyond vitest's default.

import { describe, expect, it } from "vitest";
import { findTestCommands, callCommands } from "./raw-invocation";

const VITEST_SCRIPTS = ["test", "test:watch"];
const BS = String.fromCharCode(92);
const BT = String.fromCharCode(96);
const FENCE = BT + BT + BT;
const A = "src/a.test.ts";
const B = "src/b.test.ts";

function multiCount(text: string, families: readonly ("vitest" | "npm-vitest")[] = ["vitest", "npm-vitest"]): number {
  return findTestCommands(text, VITEST_SCRIPTS).filter((h) => families.includes(h.family as "vitest" | "npm-vitest") && h.paths.length >= 2).length;
}

function wrapperMultiCount(text: string): number {
  return findTestCommands(text, VITEST_SCRIPTS).filter((h) => h.family === "wrapper" && h.paths.length >= 2).length;
}

// [name, text, expected raw (vitest + npm-vitest) multi-path hits, expected wrapper multi-path hits]
const CASES: [string, string, number, number][] = [
  // MUST FIRE (16)
  ["FIRE repro", "npx vitest run src/lib/no-emojis.test.ts src/does-not-exist.test.ts", 1, 0],
  ["FIRE dir+file", `${BT}npx vitest run src/app/components/grading-results/ ${A}${BT}`, 1, 0],
  ["FIRE shell continuation", `npx vitest run ${A} ${BS}\n               ${B}\nTest Files`, 1, 0],
  ["FIRE flags between", `npx vitest run -t "some name" ${A} ${B}`, 1, 0],
  ["FIRE elided", "npx vitest run .../a.test.ts .../b.test.ts", 1, 0],
  [
    "FIRE wrapped inline span",
    `(2 files) and ${BT}npx vitest run src/lib/no-emojis.test.ts\n  src/source-bytes.structure.test.ts${BT} (2 files)`,
    1,
    0,
  ],
  ["FIRE quoted positional", `npx vitest run "${A}" "${B}"`, 1, 0],
  ["FIRE npm test a b", `npm test ${A} ${B}`, 1, 0],
  ["FIRE npm test -- a b", `npm test -- ${A} ${B}`, 1, 0],
  ["FIRE npm run test -- a b", `npm run test -- ${A} ${B}`, 1, 0],
  ["FIRE npm t a b", `npm t ${A} ${B}`, 1, 0],
  ["FIRE npx vitest a b (no subcommand)", `npx vitest ${A} ${B}`, 1, 0],
  ["FIRE npx vitest --run a b", `npx vitest --run ${A} ${B}`, 1, 0],
  ["FIRE YAML folded scalar", `      - name: test\n        run: >\n          npx vitest run\n          ${A}\n          ${B}\n      - name: next`, 1, 0],
  ["FIRE fenced command, paths on following lines", `${FENCE}\nnpx vitest run\n  ${A}\n  ${B}\n${FENCE}`, 1, 0],
  ["FIRE PowerShell backtick continuation", `npx vitest run ${A} ${BT}\n  ${B}`, 1, 0],
  // WRAPPER, counted in its own family (2)
  ["WRAPPER counted separately", `npm run test:paths ${A} ${B}`, 0, 1],
  ["WRAPPER single", `npm run test:paths ${A}`, 0, 0],
  // MUST NOT FIRE (17)
  ["QUIET single", "npx vitest run src/lib/no-emojis.test.ts", 0, 0],
  ["QUIET single -t with slash in name", `npx vitest run ${A} -t "a/b c/d"`, 0, 0],
  ["QUIET unquoted multi-word -t", `npx vitest run ${A} -t renders the a/b table`, 0, 0],
  ["QUIET prose after command, no backticks", `ran npx vitest run ${A} and then ${B} was read by hand`, 0, 0],
  ["QUIET --exclude value", `npx vitest run ${A} --exclude src/legacy/x.test.ts`, 0, 0],
  ["QUIET --workspace value", `npx vitest run ${A} --workspace vitest.workspace/one.ts`, 0, 0],
  ["QUIET prose 'vitest run times'", "vitest run times grow with src/lib/ and src/app/", 0, 0],
  ["QUIET prose 'vitest runs'", "this project's vitest runs in the node environment with src/a and src/b", 0, 0],
  ["QUIET prose quoted", `a multi-path ${BT}vitest run${BT} silently drops ${A} ${B}`, 0, 0],
  ["QUIET placeholder", `${BT}npx vitest run <WS-2>${BT} and ${BT}npx vitest run <WS-3>${BT}`, 0, 0],
  ["QUIET two single runs one line", `${BT}npx vitest run ${A}${BT} and ${BT}npx vitest run ${B}${BT}`, 0, 0],
  ["QUIET bare", "npx vitest run", 0, 0],
  ["QUIET prose over", `${BT}npx vitest run${BT} over both guard files`, 0, 0],
  ["QUIET comment-wrapped single", `    // Ran ${BT}npx vitest run\n    // discussion-knowledge-context.test.ts${BT}: went RED`, 0, 0],
  ["QUIET quoted flag with slash", `npx vitest run --reporter=json "--outputFile.json=a/b.json" ${A}`, 0, 0],
  ["QUIET fenced single", `${FENCE}\nnpx vitest run ${A}\n${FENCE}`, 0, 0],
  ["QUIET npm test alone", `Capture ${BT}npm test${BT} totals as the baseline`, 0, 0],
];

describe("findTestCommands: the 40-case canary table (P9)", () => {
  it.each(CASES)("%s", (_name, text, wantRaw, wantWrapper) => {
    expect(multiCount(text)).toBe(wantRaw);
    expect(wrapperMultiCount(text)).toBe(wantWrapper);
  });

  it("has exactly 16 must-fire, 2 wrapper, and 17 must-not-fire text cases (35 of the 40)", () => {
    expect(CASES.length).toBe(35);
  });
});

describe("callCommands: argv-array spawns (S7, 5 of the 40 cases)", () => {
  const ARGV_CASES: [string, string, number][] = [
    ['spawnSync("npx", ["vitest", "run", "src/a.test.ts", "src/b.test.ts"], { stdio: "inherit" });', "fires on a literal argv array", 1],
    ['execSync("npx vitest run src/a.test.ts src/b.test.ts");', "fires on a single joined literal", 1],
    ['spawnSync("npx", ["vitest", "run", "src/a.test.ts"]);', "does not fire on a single path", 0],
    ['spawnSync("npm", ["run", "test:paths", "src/a.test.ts", "src/b.test.ts"]);', "does not fire on a wrapper spawn (own family)", 0],
    ["spawnSync(process.execPath, [vitestBin, ...argv], { stdio: \"inherit\", cwd: root });", "does not fire when there are no string-literal paths", 0],
  ];

  it.each(ARGV_CASES)("%s: %s", (src, _label, want) => {
    const hits = callCommands(src, VITEST_SCRIPTS).filter((h) => h.family !== "wrapper" && h.paths.length >= 2);
    expect(hits.length).toBe(want);
  });

  it("has exactly 5 argv-spawn cases, bringing the table to 40", () => {
    expect(ARGV_CASES.length).toBe(5);
  });
});
