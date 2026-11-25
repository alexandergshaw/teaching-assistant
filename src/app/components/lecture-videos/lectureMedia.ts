import { ensureFiniteDuration } from "@/lib/caption-burn";
import type { LectureAudio, LecturePart } from "./lectureProject";

export async function withBlobUrl<T>(blob: Blob, read: (url: string) => Promise<T>): Promise<T> {
  const url = URL.createObjectURL(blob);
  try {
    return await read(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function videoDuration(file: File): Promise<number> {
  return withBlobUrl(file, async (url) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error("Reading video metadata timed out.")), 10000);
        function finish(error?: Error) {
          clearTimeout(timer);
          video.onloadedmetadata = null;
          video.onerror = null;
          if (error) reject(error);
          else resolve();
        }
        video.onloadedmetadata = () => finish();
        video.onerror = () => finish(new Error("This browser cannot read the video."));
        video.src = url;
      });
      if (!video.videoWidth) throw new Error("Choose a file that contains video.");
      return await ensureFiniteDuration(video);
    } finally {
      video.removeAttribute("src");
      video.load();
    }
  });
}

export async function partFromVideo(source: File): Promise<LecturePart> {
  return {
    id: crypto.randomUUID(),
    title: source.name.replace(/\.[^.]+$/, ""),
    focus: "",
    source,
    duration: await videoDuration(source),
    cues: [],
    audioMode: "cues",
    watchUrl: "",
  };
}

export async function audioFromBlob(blob: Blob, name: string): Promise<LectureAudio> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    if (!(audio.duration > 0)) throw new Error("The audio clip is empty.");
    return { blob, name, duration: audio.duration };
  } finally {
    await context.close();
  }
}

export function readBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function audioFromBase64(base64: string, mimeType: string): Promise<LectureAudio> {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return audioFromBlob(new Blob([bytes], { type: mimeType }), "ElevenLabs voice");
}
