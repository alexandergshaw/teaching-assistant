import { expect, it } from "vitest";
import { containsEmoji, emojiGraphemes, isSingleEmoji } from "./announcement-emoji";
it("keeps composed emoji, flags and keycaps intact in the fallback", () => {
  const family = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb);
  const flag = String.fromCodePoint(0x1f1fa, 0x1f1f8);
  const keycap = String.fromCodePoint(0x31, 0xfe0f, 0x20e3);
  expect(emojiGraphemes(family + flag + keycap, true)).toEqual([family, flag, keycap]);
  for (const value of [family, flag, keycap]) expect(isSingleEmoji(value)).toBe(true);
  expect(isSingleEmoji(family + flag)).toBe(false);
});

it("preserves text-default symbols unless explicitly presented as emoji", () => {
  const copyright = String.fromCodePoint(0x00a9), registered = String.fromCodePoint(0x00ae), trademark = String.fromCodePoint(0x2122), emojiStyle = String.fromCodePoint(0xfe0f);
  for (const symbol of [copyright, registered, trademark]) {
    expect(containsEmoji(symbol)).toBe(false);
    expect(containsEmoji(symbol + emojiStyle)).toBe(true);
  }
});
