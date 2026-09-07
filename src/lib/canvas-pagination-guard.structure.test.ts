import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every Link-header follow must be origin-checked, and until this test existed
 * nothing enforced that.
 *
 * WHY THIS FILE EXISTS, in one paragraph of real history. Wave 4 of the
 * per-user-credentials work guarded every `parseNextLink` follow it could find
 * and recorded in docs/REGRESSION.md entry 403c that "every such follow now
 * passes through assertCanvasSuppliedUrlIsSameOrigin". That was FALSE when it
 * was written. Ten follows were capped but never origin-checked - seven in
 * canvas/listings.ts, two in canvas/grading-queue.ts, one in canvas/inbox.ts -
 * and they were found only because two agents happened to trip over them
 * independently while migrating transport. An ELEVENTH, in canvas/submissions.ts,
 * survived even the sweep that found those ten, because that file mentions the
 * guard four times already - all of them for attachment URLs - so a file-level
 * check passed it. **That is why this test counts CALL SITES, not files.**
 *
 * WHAT AN UNGUARDED FOLLOW ACTUALLY COSTS. `parseNextLink` returns whatever URL
 * the remote host put in its `Link: rel="next"` header. These loops dial that
 * URL carrying this app's bearer token. `canvasFetch` does not close the hole:
 * its refusal list covers special-purpose addresses (loopback, private,
 * link-local), NOT an ordinary public host, so a Canvas instance that had been
 * compromised - or was never the real thing - collects the credential by
 * answering page one with a rel="next" pointing anywhere it likes. The page cap
 * bounds how many pages are fetched; it does nothing about WHERE they are
 * fetched from.
 *
 * TWO RULES MAKE THIS ACCURATE:
 *
 * 1. THE DEFINITIONS ARE NOT CALLS. Two modules DEFINE a `parseNextLink` -
 *    canvas-core.ts and canvas/pagination.ts - and both are pure parsers that
 *    dial nothing. A line declaring the function is skipped; only call sites
 *    are checked.
 * 2. THE GUARD MAY NOT BE ON THE VERY NEXT LINE. Three different shapes ship
 *    today and all are correct: the common ternary on the following line, a
 *    try/catch block in canvas-modules/rubrics.ts that converts a refusal into
 *    a typed result, and canvas/announcements.ts's version with a four-line
 *    comment in between. So the window is generous. It is deliberately a
 *    PROXIMITY check rather than a dataflow analysis - see the limits below.
 *
 * WHAT THIS TEST DOES NOT PROVE, stated so nobody mistakes it for more than it
 * is. It cannot tell that the value actually DIALLED is the guard's return
 * value rather than the raw candidate - that distinction is load-bearing (the
 * guard resolves a relative Link header against the base, so for a relative
 * candidate the two differ, and dialling the input would pass the check and
 * then fetch something else) and it is covered by per-file unit tests, not
 * here. A file could satisfy this test and still dial the wrong string. What
 * this catches is the failure that actually happened eleven times: a follow
 * with no guard anywhere near it.
 */

const ROOT = join(process.cwd(), "src", "lib");

/** How many lines after a `parseNextLink(` call site may pass before the guard
 * must appear. Sized against the widest correct shape that ships today
 * (announcements.ts, whose guard sits four comment lines after the call), with
 * room to spare - a guard further away than this is far enough that a reader
 * would not see the two together either. */
const GUARD_WINDOW_LINES = 12;

const CALL_MARKER = "parseNextLink(";
const GUARD_MARKER = "assertCanvasSuppliedUrlIsSameOrigin";
/** A line that DECLARES the parser rather than calling it. */
const DEFINITION_MARKER = "function parseNextLink(";

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsFiles(full, out);
      continue;
    }
    if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
    if (entry.includes(".test.")) continue;
    out.push(full);
  }
  return out;
}

interface CallSite {
  file: string;
  line: number;
  text: string;
  guarded: boolean;
}

function findCallSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const file of collectTsFiles(ROOT)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.includes(CALL_MARKER)) continue;
      if (line.includes(DEFINITION_MARKER)) continue;
      const window = lines.slice(i, i + GUARD_WINDOW_LINES + 1).join("\n");
      sites.push({
        file: relative(process.cwd(), file).split("\\").join("/"),
        line: i + 1,
        text: line.trim(),
        guarded: window.includes(GUARD_MARKER),
      });
    }
  }
  return sites;
}

describe("Canvas pagination: every Link-header follow is origin-checked", () => {
  it("finds call sites at all, so a rename cannot make this test vacuously pass", () => {
    // The guard on the guard. If parseNextLink is ever renamed, every check
    // below would pass over an empty list and report nothing wrong. This repo
    // has shipped a tautological test before; this line is the cost of not
    // doing it again.
    const sites = findCallSites();
    expect(sites.length).toBeGreaterThan(5);
  });

  it("never dials a remote-supplied next link without assertCanvasSuppliedUrlIsSameOrigin nearby", () => {
    const unguarded = findCallSites().filter((s) => !s.guarded);

    const detail = unguarded.map((s) => `${s.file}:${s.line}  ${s.text}`).join("\n");
    expect(
      unguarded,
      unguarded.length === 0
        ? ""
        : [
            "",
            "A Link-header follow is dialled without a same-origin guard within",
            `${GUARD_WINDOW_LINES} lines. The URL comes from the REMOTE HOST and the request`,
            "carries this app's bearer token, so an unguarded follow hands the",
            "credential to whatever origin that host names. canvasFetch does not",
            "stop this - it refuses special-purpose addresses, not ordinary public",
            "hosts.",
            "",
            "Fix by passing the candidate through the guard and dialling the",
            "guard's RETURN value, never the input:",
            "",
            '  const rawNext = parseNextLink(response.headers.get("link"));',
            "  next = rawNext ? assertCanvasSuppliedUrlIsSameOrigin(rawNext, baseUrl) : null;",
            "",
            detail,
            "",
          ].join("\n")
    ).toEqual([]);
  });

  it("treats the two pure parsers as definitions, not as follows", () => {
    // Both canvas-core.ts and canvas/pagination.ts export a parseNextLink.
    // Neither dials anything, so neither needs a guard - and if this
    // exemption ever stopped working, the test above would go permanently red
    // on two files that are correct, which is how a structural test gets
    // deleted rather than fixed.
    const sites = findCallSites();
    const definitions = sites.filter(
      (s) => s.file.endsWith("canvas-core.ts") || s.file.endsWith("canvas/pagination.ts")
    );
    expect(definitions).toEqual([]);
  });
});
