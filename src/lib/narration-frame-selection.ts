const MAX_PROBES = 64;
const MAX_NOTES = 6;
const NOTE_MARGIN_SEC = 0.3;

export function narrationNoteTimes(text: string, durationSec: number): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(/(?<![\d:])(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)(?![\d:]|\.\d)/g)) {
    const minutes = Number(match[2]);
    if (match[1] && minutes >= 60) continue;
    const time = Number(match[1] ?? 0) * 3600 + minutes * 60 + Number(match[3]);
    if (time <= durationSec) found.add(time);
    if (found.size >= MAX_NOTES) break;
  }
  return [...found];
}

function evenlySpaced(end: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => count === 1 ? 0 : (end * index) / (count - 1));
}

export function narrationProbeTimes(durationSec: number): number[] {
  const end = Math.max(0, durationSec - 0.1);
  const count = Math.min(MAX_PROBES, Math.ceil(end / Math.max(0.5, Math.min(4, end / 12))) + 1);
  return evenlySpaced(end, count);
}

/** Highlight local changes such as a small reveal, with global motion as a secondary signal. */
export function narrationFrameChange(previous: Uint8ClampedArray, current: Uint8ClampedArray, width: number): number {
  const blockSize = 8;
  const height = Math.floor(current.length / (width * 4));
  let strongest = 0, total = 0;
  for (let row = 0; row < height; row += blockSize) {
    for (let column = 0; column < width; column += blockSize) {
      let changed = 0, count = 0;
      for (let y = row; y < Math.min(row + blockSize, height); y++) {
        for (let x = column; x < Math.min(column + blockSize, width); x++) {
          const p = (y * width + x) * 4;
          changed += Math.max(Math.abs(previous[p] - current[p]), Math.abs(previous[p + 1] - current[p + 1]), Math.abs(previous[p + 2] - current[p + 2]));
          count++;
        }
      }
      total += changed;
      strongest = Math.max(strongest, changed / (count * 255));
    }
  }
  return strongest * 0.65 + (total / (width * height * 255)) * 0.35;
}

type ScoredProbe = { timeSec: number; change: number };

export function selectNarrationFrameTimes(durationSec: number, limit: number, probes: ScoredProbe[], notes: number[]): number[] {
  const end = Math.max(0, durationSec - 0.1);
  const chosen: number[] = [];
  const insert = (time: number, separation: number) => {
    const bounded = Math.min(end, Math.max(0, time));
    if (chosen.length < limit && !chosen.some((existing) => Math.abs(existing - bounded) < separation)) chosen.push(bounded);
  };
  const noteBudget = Math.min(notes.length, Math.floor(limit / 3));
  const noteTimes = notes.slice(0, noteBudget);
  for (const time of evenlySpaced(end, Math.min(6, limit - noteBudget))) insert(time, 0.01);
  for (const time of noteTimes) insert(time + NOTE_MARGIN_SEC, 0.1);
  for (const time of noteTimes.slice(0, Math.floor(limit / 6))) insert(time - NOTE_MARGIN_SEC, 0.1);

  const separation = Math.max(0.15, end / Math.max(1, limit * 2));
  const ranked = probes.filter((probe) => probe.change >= 0.035).sort((a, b) => b.change - a.change || a.timeSec - b.timeSec);
  for (const probe of ranked) insert(probe.timeSec, separation);
  // Use a sparse cadence where there is little visual change. A static video
  // still needs context near the start, through the middle and near the end.
  for (const time of evenlySpaced(end, Math.min(limit, Math.ceil(end / 20) + 1))) insert(time, separation);
  return chosen.sort((a, b) => a - b);
}
