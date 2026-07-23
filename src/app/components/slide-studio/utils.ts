function drawSlideCard(ctx: CanvasRenderingContext2D, w: number, h: number, slide: { slide: number; title: string; text: string }) {
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#64748b";
  ctx.font = `500 ${Math.round(h * 0.03)}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Slide ${slide.slide}`, Math.round(w * 0.06), Math.round(h * 0.06));
  ctx.fillStyle = "#f8fafc";
  ctx.font = `700 ${Math.round(h * 0.06)}px system-ui, sans-serif`;
  wrapText(ctx, slide.title, Math.round(w * 0.06), Math.round(h * 0.13), Math.round(w * 0.88), Math.round(h * 0.075), 2);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = `400 ${Math.round(h * 0.038)}px system-ui, sans-serif`;
  const body = slide.text.split("\n").slice(1).join("  ");
  wrapText(ctx, body, Math.round(w * 0.06), Math.round(h * 0.32), Math.round(w * 0.88), Math.round(h * 0.055), 9);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(lines === maxLines - 1 && words.length ? `${line}...` : line, x, y + lines * lineHeight);
      lines += 1;
      line = word;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

export { drawSlideCard, wrapText };
