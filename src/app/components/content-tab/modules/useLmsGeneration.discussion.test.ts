// Findings 1, 2, 4 and M5 of the step-10 fixer round
// (docs/intro-discussion-from-modules-acceptance-criteria.md) - split out of
// useLmsGeneration.test.ts (a sibling file, split ONLY to keep that file
// under this repo's 1000-line ceiling; W9's own precedent). Source-text
// guards for defects a rendered-component test would catch instantly but
// this node-env suite cannot (vitest here is node-env and renders no
// component - see useLmsGeneration.test.ts's own header comment for the
// same limit).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useLmsGeneration.ts");
const hookSource = readFileSync(HOOK_PATH, "utf8");

/** Same brace-depth scan as useLmsGeneration.test.ts's own `payloadOf` - kept
 * as a small local duplicate rather than exported from that file, since
 * nothing outside a test needs it. See that file's own doc comment for the
 * sabotage this guards against (a call site renamed/deleted out from under
 * the marker string). */
function payloadOf(marker: string): string {
  const at = hookSource.indexOf(marker);
  if (at === -1) throw new Error(`call site not found - marker moved or was deleted: ${marker}`);
  const braceStart = hookSource.indexOf("{", at);
  let depth = 0;
  for (let i = braceStart; i < hookSource.length; i += 1) {
    if (hookSource[i] === "{") depth += 1;
    else if (hookSource[i] === "}") {
      depth -= 1;
      if (depth === 0) return hookSource.slice(braceStart, i + 1);
    }
  }
  throw new Error(`unterminated object literal for marker: ${marker}`);
}

describe("post() discussion-deadline computation (Findings 1/2/4 - source-text guards)", () => {
  it("Finding 1: never gates the discussion-deadline computation on a literal introDiscussion string - must read the same registry the server reads", () => {
    // The literal defect shape: `kindId === "introDiscussion"` used to gate
    // this block directly. isDiscussionKind (lmsGenerationDiscussion.ts)
    // replaces it - this fails if that literal check is ever reintroduced.
    expect(hookSource).not.toMatch(/kindId === "introDiscussion"/);
    expect(hookSource).toMatch(/isDiscussionKind|resolveDiscussionDeadlinesForClientPost/);
  });

  it("Finding 2: never falls back to an empty-string module name that would fabricate a false 'no week number' reason", () => {
    // The literal defect shape: `modules.find(...)?.name ?? ""` fed an empty
    // string into describeMissingDeadlines whenever the lookup missed,
    // producing the lie `The module name "" carries no week number...` even
    // though the real module very likely has one.
    expect(hookSource).not.toMatch(/modules\.find\([^)]*\)\?\.name\s*\?\?\s*""/);
  });

  it("Finding 4: consolidates onto planIntroDiscussionPost via the extracted helper - the old inline template is gone", () => {
    expect(hookSource).not.toMatch(/Initial post due \$\{formatDeadlineForPrompt/);
    expect(hookSource).not.toMatch(/^import \{\s*planIntroDiscussionDeadlines,/m);
  });
});

describe("M5: postGeneratedArtifactAction's payload reachability guard", () => {
  // M5 (fix): the sibling guard in useLmsGeneration.test.ts existed for
  // `acronym` but not for `discussionDeadlines` (the timezone fix, D3/AC14i)
  // or `useDiscussionCheckpoints` (the frozen contract's checkbox) - exactly
  // the bug class this guard exists to catch (a threaded field that never
  // reaches the call) could recur here with every other gate green, because
  // vitest never renders the component that actually calls `post()`.
  it("includes discussionDeadlines and useDiscussionCheckpoints", () => {
    // MARKER UPDATED (step-10c review, D1): this call site used to read
    // `await postGeneratedArtifactAction({` directly - it is now
    // `await runGenerationCall(() => postGeneratedArtifactAction({`, wrapped
    // so a REJECTED Server Action call no longer leaves the tab-wide
    // setBusy(true) stuck (see lmsGenerationSafeCall.ts's own header). Same
    // precedent as useLmsGeneration.test.ts's own generateFromSelectionAction
    // marker update for the identical Job 2 fix.
    const payload = payloadOf("postGeneratedArtifactAction({");
    expect(payload).toMatch(/\bdiscussionDeadlines\b/);
    expect(payload).toMatch(/\buseDiscussionCheckpoints\b/);
  });
});
