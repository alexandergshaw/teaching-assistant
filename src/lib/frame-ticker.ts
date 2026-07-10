// A steady tick source for canvas-capture draw loops. requestAnimationFrame
// stops entirely and main-thread timers are throttled to ~1/s while the tab
// is hidden, which silently produces frame-less (audio-only) recordings -
// screen recordings are made precisely while this tab is hidden. Worker
// timers keep firing at full rate, so ticks come from a tiny inline worker.

export interface FrameTicker {
  stop: () => void;
}

export function startFrameTicker(fps: number, onTick: () => void): FrameTicker {
  const intervalMs = Math.max(1, Math.round(1000 / fps));
  try {
    const src = `let t = setInterval(() => postMessage(0), ${intervalMs}); onmessage = () => { clearInterval(t); close(); };`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => onTick();
    return {
      stop: () => {
        worker.postMessage(0);
        worker.terminate();
      },
    };
  } catch {
    const id = setInterval(onTick, intervalMs);
    return { stop: () => clearInterval(id) };
  }
}
