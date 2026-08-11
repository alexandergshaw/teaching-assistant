// Picks which focus-ring CSS custom property a slide fill needs, for slide
// theme backgrounds a user can set to ANY colour (GeneratePanel.tsx's
// per-template "solid"/"gradient" deck themes - see src/lib/decks/types.ts).
// A static "classic navy = on-navy ring" map is not enough there, because
// backgroundColor/backgroundColor2 are arbitrary user-picked hex values that
// can land anywhere from near-black to near-white.
//
// Pure and dependency-free (no MUI/React import) so it stays safe to use from
// a client component and to unit-test in isolation.

/** Parses a "#rgb" or "#rrggbb" hex colour into 0-255 channels. Returns null
 * for anything else (a CSS variable, an invalid string, ...) so callers can
 * fall back to a safe default rather than doing NaN colour math. */
function parseHexColor(value: string): { r: number; g: number; b: number } | null {
  const trimmed = value.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  const long = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (!long) return null;
  const n = parseInt(long[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** sRGB 0-255 channel -> linear-light channel (WCAG 2.x definition). */
function linearizeChannel(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an {r,g,b} (0-255) colour. */
function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * linearizeChannel(rgb.r) + 0.7152 * linearizeChannel(rgb.g) + 0.0722 * linearizeChannel(rgb.b);
}

/** WCAG contrast ratio between two relative luminances (already 0-1). */
function contrastRatio(lumA: number, lumB: number): number {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * True when `hex` is dark enough that white contrasts against it better than
 * black does - the standard, symmetric way to classify a colour as "dark"
 * without picking an arbitrary luminance cutoff. Unparseable input (a CSS
 * gradient string, a var(), ...) returns false, matching the behaviour an
 * un-styled element already has (falls through to the default ring).
 */
function isDarkFill(hex: string): boolean {
  const rgb = parseHexColor(hex);
  if (!rgb) return false;
  const lum = relativeLuminance(rgb);
  return contrastRatio(lum, 1) > contrastRatio(lum, 0);
}

/**
 * Whether a slide fill made up of `hexColors` (one colour for a solid fill,
 * two for a gradient's stops) needs the fixed, always-light on-navy focus
 * ring rather than the theme-aware default. True if ANY of the supplied
 * colours is dark: a gradient's controls can sit anywhere along it, and
 * using the stronger ring on a light stretch is a harmless over-correction,
 * while using the weak ring on a dark stretch is the WCAG failure this
 * exists to prevent.
 */
export function needsOnNavyFocusRing(hexColors: string[]): boolean {
  return hexColors.some((hex) => isDarkFill(hex));
}
