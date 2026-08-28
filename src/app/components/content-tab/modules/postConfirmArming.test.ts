import { describe, expect, it } from "vitest";
import { isConfirmArmed, mayPostCommit, postArmSignature } from "./postConfirmArming";

const fields = (over: Partial<Parameters<typeof postArmSignature>[0]> = {}) => ({
  kindId: "announcements",
  artifactId: "artifact-1",
  moduleChoice: "",
  newModuleName: "",
  ...over,
});

describe("postArmSignature", () => {
  it("is stable for the same fields", () => {
    expect(postArmSignature(fields())).toBe(postArmSignature(fields()));
  });

  it("changes when the artifact id changes - AC 12c / the version-switch invalidation case", () => {
    // Sabotage target 2: if the signature builder ever dropped artifactId,
    // this pair would collapse to the same string and this test goes red.
    const a = postArmSignature(fields({ artifactId: "v1" }));
    const b = postArmSignature(fields({ artifactId: "v2" }));
    expect(a).not.toBe(b);
    expect(isConfirmArmed(a, b)).toBe(false);
  });

  it("changes when the kindId changes", () => {
    expect(postArmSignature(fields({ kindId: "announcements" }))).not.toBe(
      postArmSignature(fields({ kindId: "introDiscussion" })),
    );
  });

  it("changes when moduleChoice or newModuleName change", () => {
    const base = postArmSignature(fields());
    expect(postArmSignature(fields({ moduleChoice: "42" }))).not.toBe(base);
    expect(postArmSignature(fields({ newModuleName: "Week 3" }))).not.toBe(base);
  });

  it("does not collide across a field boundary - the reason a plain delimiter join is unsafe (AC 12a)", () => {
    // Sabotage target 4: if the builder joined fields with a space (or any
    // single fixed delimiter) instead of JSON.stringify, a value containing
    // that delimiter could shift where one field ends and the next begins.
    // These two tuples would collide under a naive `fields.join(" ")`:
    //   ["a b", "c", "", ""].join(" ")  === "a b c  "
    //   ["a", "b c", "", ""].join(" ")  === "a b c  "
    const first = postArmSignature({ kindId: "a b", artifactId: "c", moduleChoice: "", newModuleName: "" });
    const second = postArmSignature({ kindId: "a", artifactId: "b c", moduleChoice: "", newModuleName: "" });
    expect(first).not.toBe(second);

    // A second pair, shifting the boundary between moduleChoice and
    // newModuleName instead of kindId and artifactId, so the collision proof
    // does not depend on which two fields happen to be adjacent.
    const third = postArmSignature({ kindId: "k", artifactId: "id", moduleChoice: "x y", newModuleName: "z" });
    const fourth = postArmSignature({ kindId: "k", artifactId: "id", moduleChoice: "x", newModuleName: "y z" });
    expect(third).not.toBe(fourth);
  });

  it("does not exclude the module-target fields for a kind that has none today - future-proofing per AC 12a-sig", () => {
    const withoutTarget = postArmSignature(fields({ moduleChoice: "" }));
    const withTarget = postArmSignature(fields({ moduleChoice: "7" }));
    expect(withoutTarget).not.toBe(withTarget);
  });
});

describe("isConfirmArmed (reused verbatim from confirmArming.ts)", () => {
  it("arms on the exact signature it was armed for and invalidates on any change", () => {
    const armedFor = postArmSignature(fields());
    expect(isConfirmArmed(armedFor, postArmSignature(fields()))).toBe(true);
    expect(isConfirmArmed(armedFor, postArmSignature(fields({ artifactId: "other" })))).toBe(false);
  });

  it("is false while nothing is armed", () => {
    expect(isConfirmArmed(null, postArmSignature(fields()))).toBe(false);
  });
});

describe("mayPostCommit", () => {
  it("is true only when unavailable is clear, not dirty, and armed", () => {
    expect(mayPostCommit(null, false, true)).toBe(true);
    expect(mayPostCommit(undefined, false, true)).toBe(true);
  });

  it("is false when posting is unavailable, even if armed and clean", () => {
    expect(mayPostCommit("No live Canvas connection.", false, true)).toBe(false);
  });

  it("is false while dirty, even if armed and available - AC 12b, the Gap 2b fix", () => {
    expect(mayPostCommit(null, true, true)).toBe(false);
  });

  it("is false when not armed, even if available and clean - a first click must not post (AC 12d's double-post case)", () => {
    // Sabotage target 3 is about the .tsx explicitly clearing the arm after
    // a successful post; this test pins the other half of that guarantee -
    // that an UNARMED click can never itself be read as permission to
    // commit, so a caller that forgets to re-check `armed` after disarming
    // cannot accidentally let a second click through.
    expect(mayPostCommit(null, false, false)).toBe(false);
  });

  it("is false when every condition but one fails", () => {
    expect(mayPostCommit("reason", true, false)).toBe(false);
  });
});
