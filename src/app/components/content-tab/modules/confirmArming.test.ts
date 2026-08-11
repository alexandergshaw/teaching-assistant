import { describe, expect, it } from "vitest";
import { isConfirmArmed, selectionSignature } from "./confirmArming";

describe("selectionSignature", () => {
  it("is order-independent", () => {
    expect(selectionSignature(["A", "B"])).toBe(selectionSignature(["B", "A"]));
  });

  it("distinguishes {A,B} from {A,B,C} and from {C,D}", () => {
    const ab = selectionSignature(["A", "B"]);
    const abc = selectionSignature(["A", "B", "C"]);
    const cd = selectionSignature(["C", "D"]);
    expect(ab).not.toBe(abc);
    expect(ab).not.toBe(cd);
    expect(abc).not.toBe(cd);
  });

  it("distinguishes numeric 1,2 from 12 - the separator actually separates", () => {
    // Without a delimiter, ["1", "2"] and ["12"] would both join to "12".
    expect(selectionSignature([1, 2])).not.toBe(selectionSignature([12]));
  });
});

describe("isConfirmArmed", () => {
  it("is false when armedFor is null", () => {
    expect(isConfirmArmed(null, selectionSignature(["A", "B"]))).toBe(false);
  });

  it("is false when the signature changed - THE BUG: arm on {A,B}, selection becomes {C,D}", () => {
    const armedFor = selectionSignature(["A", "B"]);
    const current = selectionSignature(["C", "D"]);
    expect(isConfirmArmed(armedFor, current)).toBe(false);
  });

  it("is true on the unchanged selection, so the two-click flow still works", () => {
    const armedFor = selectionSignature(["A", "B"]);
    const current = selectionSignature(["A", "B"]);
    expect(isConfirmArmed(armedFor, current)).toBe(true);
  });

  it("is true again when the selection returns to the one it was armed for - deliberate, not a timer", () => {
    const armedFor = selectionSignature(["A", "B"]);
    // Selection changes away...
    const changed = selectionSignature(["C", "D"]);
    expect(isConfirmArmed(armedFor, changed)).toBe(false);
    // ...then back to exactly what it was armed for.
    const backAgain = selectionSignature(["A", "B"]);
    expect(isConfirmArmed(armedFor, backAgain)).toBe(true);
  });
});
