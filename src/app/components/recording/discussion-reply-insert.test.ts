import { describe, it, expect } from "vitest";
import { appendResourceToReply, replyAlreadyHasResource } from "./discussion-reply-insert";

const RESOURCE_A = { title: "MDN: Array.prototype.map()", url: "https://developer.mozilla.org/map" };
const RESOURCE_B = { title: "Second resource", url: "https://example.com/2" };

describe("appendResourceToReply", () => {
  it("an empty reply becomes just the resource line, no leading blank line", () => {
    expect(appendResourceToReply("", RESOURCE_A)).toBe(
      "MDN: Array.prototype.map() - https://developer.mozilla.org/map"
    );
  });

  it("a whitespace-only reply is treated as empty - no leading blank lines before the resource line", () => {
    expect(appendResourceToReply("   \n  ", RESOURCE_A)).toBe(
      "MDN: Array.prototype.map() - https://developer.mozilla.org/map"
    );
  });

  it("a non-empty reply gets the resource appended after a blank-line separator, mirroring replyClipboardText's own 'Title - url' convention", () => {
    expect(appendResourceToReply("Great point about closures.", RESOURCE_A)).toBe(
      "Great point about closures.\n\nMDN: Array.prototype.map() - https://developer.mozilla.org/map"
    );
  });

  it("trims trailing whitespace on the existing reply before separating, so it never doubles a blank line", () => {
    expect(appendResourceToReply("Great point.   \n\n", RESOURCE_A)).toBe(
      "Great point.\n\nMDN: Array.prototype.map() - https://developer.mozilla.org/map"
    );
  });

  it("never touches text BEFORE the append point - the entire prior string survives as an exact prefix", () => {
    const before = "Every word of this instructor-written reply, verbatim.";
    const after = appendResourceToReply(before, RESOURCE_A);
    expect(after.startsWith(before)).toBe(true);
  });

  it("the second-click concern: inserting a SECOND resource appends after the first, never replacing or duplicating it", () => {
    const once = appendResourceToReply("Great point about closures.", RESOURCE_A);
    const twice = appendResourceToReply(once, RESOURCE_B);
    expect(twice).toBe(
      "Great point about closures.\n\nMDN: Array.prototype.map() - https://developer.mozilla.org/map\n\nSecond resource - https://example.com/2"
    );
    // The first resource's own line survives exactly once - not duplicated,
    // not overwritten.
    expect(twice.split("MDN: Array.prototype.map()").length - 1).toBe(1);
  });

  it("SABOTAGE CHECK: appending is not idempotent on a repeated call with the SAME resource - the function itself does not dedupe, by design (dedup is the caller's job, via removing the resource from the suggestion list after one insert - see useDiscussionReplies.ts's insertResource)", () => {
    const once = appendResourceToReply("Reply text.", RESOURCE_A);
    const calledAgain = appendResourceToReply(once, RESOURCE_A);
    // Proves this pure function has no built-in duplicate guard - if it did,
    // this assertion would fail, and the mutated version (with a guard
    // removed) would also fail differently, giving this test real bite in
    // both directions.
    expect(calledAgain.split(RESOURCE_A.url).length - 1).toBe(2);
  });
});

// FIX 2 (review pass): appendResourceToReply itself deliberately has no
// dedupe guard (see the sabotage-check test above) - by design, dedup is the
// CALLER's job. `replyAlreadyHasResource` is that guard, called by
// useDiscussionReplies.ts's insertResource immediately before it decides
// whether to call appendResourceToReply at all. Covered here rather than at
// the hook level because vitest in this repo is node-env and renders no
// hook (see this file's own header, and useReplyRows.ts's for the same
// discipline) - this pure predicate is the actual decision logic, and the
// hook is a thin, untestable-here wrapper around it.
describe("replyAlreadyHasResource", () => {
  it("DUPLICATE-INSERT CASE: true once the reply already contains the resource's URL - the second-pass remount scenario FIX 2 defends against", () => {
    const reply = appendResourceToReply("Great point.", RESOURCE_A);
    expect(replyAlreadyHasResource(reply, RESOURCE_A)).toBe(true);
  });

  it("false for a reply that has never had this resource inserted", () => {
    expect(replyAlreadyHasResource("Great point about closures.", RESOURCE_A)).toBe(false);
  });

  it("false for an empty reply", () => {
    expect(replyAlreadyHasResource("", RESOURCE_A)).toBe(false);
  });

  it("a DIFFERENT resource's URL present does not mark THIS resource as already-inserted", () => {
    const reply = appendResourceToReply("Great point.", RESOURCE_B);
    expect(replyAlreadyHasResource(reply, RESOURCE_A)).toBe(false);
  });

  it("MANUAL-DELETE-THEN-REINSERT CASE: false again once the instructor deletes the inserted line by hand - re-insertion must not be blocked by stale state, since none is kept; the live text is the only source of truth", () => {
    const withResource = appendResourceToReply("Great point.", RESOURCE_A);
    expect(replyAlreadyHasResource(withResource, RESOURCE_A)).toBe(true);
    // The instructor manually deletes the inserted line, leaving only their
    // own original text - exactly what editReply would persist for a
    // hand-edited textarea.
    const afterManualDelete = "Great point.";
    expect(replyAlreadyHasResource(afterManualDelete, RESOURCE_A)).toBe(false);
  });

  it("SABOTAGE CHECK: matches on the URL substring specifically, not on the whole formatted line - a reply containing only the bare URL (no title) still counts as already-inserted", () => {
    // Proves the check is not accidentally keyed off appendResourceToReply's
    // own "title - url" formatting, which would make it fragile to a title
    // edit; the URL alone is the identity FIX 2 cares about duplicating.
    expect(replyAlreadyHasResource(`See ${RESOURCE_A.url} for details.`, RESOURCE_A)).toBe(true);
  });
});
