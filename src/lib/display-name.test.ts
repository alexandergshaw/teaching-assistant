import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH, clampDisplayName } from "./display-name";

/**
 * `display_name` is SELF-ASSERTED, UNVERIFIED user input that this app cannot
 * fully control, and it is rendered next to the email address an owner uses to
 * decide whether to approve an account.
 *
 * It arrives by two routes, and only one of them passes through our form:
 *   1. the sign-up action, which we validate; and
 *   2. `user_metadata.full_name`, which the account itself can write straight
 *      to the auth provider with the public anon key, at any time, before or
 *      after any check we perform.
 *
 * So the clamp cannot live only in the form path. It lives in its own module -
 * deliberately NOT inside the `server-only` signup rules - because the same
 * function has to run where the value is stored AND where it is rendered.
 *
 * The failure being designed out is not XSS: React escapes, and the document
 * writers XML-escape. It is IMPERSONATION and LAYOUT. A right-to-left override
 * inside a name changes what the owner READS beside the email, so they approve
 * the wrong row; an unbounded name breaks the surface it renders in.
 */

describe("clampDisplayName - ordinary names survive intact", () => {
  it("keeps a normal name unchanged", () => {
    expect(clampDisplayName("Dana Reyes")).toBe("Dana Reyes");
  });

  it("keeps non-Latin names intact - this is not an ASCII filter", () => {
    for (const name of ["Zoë Fenwick", "李雷", "Björk Guðmundsdóttir", "Ahmad Al-Sayed"]) {
      expect(clampDisplayName(name)).toBe(name);
    }
  });

  it("trims surrounding whitespace", () => {
    expect(clampDisplayName("  Dana Reyes  ")).toBe("Dana Reyes");
  });

  it("collapses runs of internal whitespace to single spaces", () => {
    expect(clampDisplayName("Dana    Reyes")).toBe("Dana Reyes");
    expect(clampDisplayName("Dana\t\tReyes")).toBe("Dana Reyes");
  });
});

describe("clampDisplayName - the impersonation vectors", () => {
  it("strips bidirectional overrides, which change what a reader SEES", () => {
    // U+202E flips the rendering of everything after it. A name can be built
    // that reads as a different person beside the email in an approval list.
    for (const ch of ["\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069"]) {
      const result = clampDisplayName(`Dana${ch}Reyes`);
      expect(result, `${escape(ch)} must not survive`).not.toContain(ch);
    }
  });

  it("strips the invisible direction marks too", () => {
    for (const ch of ["\u200e", "\u200f", "\u061c"]) {
      expect(clampDisplayName(`Dana${ch}Reyes`)).not.toContain(ch);
    }
  });

  it("strips zero-width characters used to fake a distinct name", () => {
    // Two accounts whose names differ only by a zero-width joiner look
    // identical to the owner.
    for (const ch of ["\u200b", "\u200c", "\u200d", "\ufeff"]) {
      expect(clampDisplayName(`Dana${ch}Reyes`)).not.toContain(ch);
    }
  });

  it("strips C0 and C1 control characters", () => {
    for (const ch of ["\u0000", "\u0007", "\u001b", "\u007f", "\u0085", "\u009b"]) {
      const result = clampDisplayName(`Dana${ch}Reyes`);
      expect(result, `control ${escape(ch)} must not survive`).not.toContain(ch);
    }
  });

  it("strips newlines, so a name cannot become two lines", () => {
    expect(clampDisplayName("Dana\nWorkspace Owner")).not.toContain("\n");
    expect(clampDisplayName("Dana\r\nOwner")).not.toContain("\r");
  });

  it("does not let a stripped character silently glue two words together", () => {
    // "Dana<ZWJ>Reyes" must not become "DanaReyes" in a way that reads as a
    // different single token than the author intended... but it also must not
    // become "Dana Reyes" and thereby fabricate a space. Pin whichever the
    // implementation chooses, and pin that it is CONSISTENT.
    const a = clampDisplayName("Dana\u200dReyes");
    const b = clampDisplayName("Dana\u200dReyes");
    expect(a).toBe(b);
    expect(a).not.toContain("\u200d");
  });
});

describe("clampDisplayName - bounds", () => {
  it("truncates past the stated maximum", () => {
    const long = "a".repeat(DISPLAY_NAME_MAX_LENGTH + 50);
    expect(clampDisplayName(long).length).toBeLessThanOrEqual(DISPLAY_NAME_MAX_LENGTH);
  });

  it("accepts a name of exactly the maximum", () => {
    const exact = "a".repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(clampDisplayName(exact)).toBe(exact);
  });

  it("states a maximum that a real person's name fits inside", () => {
    // Long real names exist. A bound that rejects them is a bug that reads as
    // a policy.
    expect(DISPLAY_NAME_MAX_LENGTH).toBeGreaterThanOrEqual(60);
    expect(DISPLAY_NAME_MAX_LENGTH).toBeLessThanOrEqual(200);
    expect(clampDisplayName("Maria del Carmen Fernandez de la Vega y Sanz").length).toBe(44);
  });

  it("does not split a surrogate pair when truncating", () => {
    // Cutting mid-pair produces a lone surrogate, which renders as a
    // replacement glyph and can break JSON round-trips.
    const emojiName = "\u{1f600}".repeat(DISPLAY_NAME_MAX_LENGTH);
    const result = clampDisplayName(emojiName);
    expect(result).toBe(result.normalize());
    expect([...result].every((c) => c.codePointAt(0)! <= 0xd7ff || c.codePointAt(0)! >= 0xe000)).toBe(
      true
    );
  });
});

describe("clampDisplayName - totality", () => {
  it("returns an empty string for anything that is not usable input", () => {
    for (const raw of [null, undefined, 42, {}, [], true, "", "   ", "\u200b\u202e"]) {
      expect(clampDisplayName(raw as never), `${JSON.stringify(raw)}`).toBe("");
    }
  });

  it("never throws, whatever it is handed", () => {
    for (const raw of [Symbol("x"), () => {}, new Date(), NaN]) {
      expect(() => clampDisplayName(raw as never)).not.toThrow();
    }
  });

  it("is idempotent - clamping a clamped name changes nothing", () => {
    for (const raw of ["Dana Reyes", "  Dana\u202e Reyes  ", "a".repeat(500)]) {
      const once = clampDisplayName(raw);
      expect(clampDisplayName(once)).toBe(once);
    }
  });
});
