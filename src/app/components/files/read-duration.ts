// Read a video File's duration by loading it into an off-DOM <video> element
// - pulled out of FilesTab.tsx (kept that component under this project's
// 1000-line cap). Uses the DOM but touches no React state - a mechanical
// relocation, no behavior change.
import { ensureFiniteDuration } from "@/lib/caption-burn";

export async function readDuration(file: File): Promise<number | null> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.addEventListener("loadedmetadata", () => res(), { once: true });
      v.addEventListener("error", () => rej(new Error("metadata failed")), { once: true });
    });
    const dur = await ensureFiniteDuration(v);
    return Number.isFinite(dur) && dur > 0 ? dur : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
