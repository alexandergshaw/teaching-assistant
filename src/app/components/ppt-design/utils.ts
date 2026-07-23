import type { DeckTheme } from "@/lib/decks/types";

export function gradientPng(t: DeckTheme): string | undefined {
  if (t.backgroundKind === "classic" || t.backgroundKind !== "gradient" || typeof document === "undefined") return undefined;
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const ctx = c.getContext("2d");
  if (!ctx) return undefined;
  const rad = (t.gradientAngle * Math.PI) / 180;
  const x = Math.cos(rad);
  const y = Math.sin(rad);
  const g = ctx.createLinearGradient(
    640 - x * 640,
    360 - y * 360,
    640 + x * 640,
    360 + y * 360
  );
  g.addColorStop(0, t.backgroundColor);
  g.addColorStop(1, t.backgroundColor2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  return c.toDataURL("image/png");
}
