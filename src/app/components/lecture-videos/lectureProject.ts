export type LectureAudio = {
  blob: Blob;
  duration: number;
  name: string;
};

export type LectureCue = {
  id: string;
  start: string;
  end: string;
  text: string;
  audio?: LectureAudio;
};

export type LecturePart = {
  id: string;
  title: string;
  focus: string;
  source: File;
  duration: number;
  cues: LectureCue[];
  audioMode: "cues" | "take";
  take?: LectureAudio;
  output?: Blob;
  watchUrl: string;
};

export type LectureMaterial = {
  id: string;
  name: string;
  text: string;
  truncated: boolean;
};

export type LectureProject = {
  title: string;
  materials: string;
  materialFiles: LectureMaterial[];
  guidance: string;
  sample: string;
  voice?: { id: string; name: string };
  parts: LecturePart[];
  selectedId: string | null;
  announcementTitle: string;
  announcementBody: string;
  resourceUrl: string;
  starterUrl: string;
};

export function emptyProject(): LectureProject {
  return {
    title: "",
    materials: "",
    materialFiles: [],
    guidance: "",
    sample: "",
    parts: [],
    selectedId: null,
    announcementTitle: "",
    announcementBody: "",
    resourceUrl: "",
    starterUrl: "",
  };
}

type StoredProject = { revision: number; project: LectureProject };

export class LectureSaveConflict extends Error {}

function decodeProject(stored?: StoredProject | LectureProject): StoredProject {
  if (stored && "revision" in stored) {
    return { revision: stored.revision, project: { ...emptyProject(), ...stored.project } };
  }
  return { revision: 0, project: { ...emptyProject(), ...stored } };
}

function openProjectDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("teaching-assistant-lecture-videos", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLectureProject(account: string): Promise<StoredProject> {
  const db = await openProjectDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("projects").objectStore("projects").get(account);
      request.onsuccess = () => resolve(decodeProject(request.result));
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveLectureProject(account: string, project: LectureProject, revision: number): Promise<number> {
  const db = await openProjectDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("projects", "readwrite");
      const store = transaction.objectStore("projects");
      const request = store.get(account);
      const next = revision + 1;
      request.onsuccess = () => {
        if (decodeProject(request.result).revision !== revision) {
          reject(new LectureSaveConflict("Another tab has saved changes to this lecture."));
          transaction.abort();
          return;
        }
        store.put({ revision: next, project }, account);
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export function partName(part: LecturePart, index: number): string {
  return part.title.trim() || `Part ${index + 1}`;
}

export function materialContext(project: LectureProject): string {
  return [project.materials.trim(), ...project.materialFiles.map((file) => `${file.name}\n${file.text}`)]
    .filter(Boolean)
    .join("\n\n");
}

export function assignCues(part: LecturePart, cues: LectureCue[]): LecturePart {
  return { ...part, cues, output: part.audioMode === "cues" ? undefined : part.output };
}

export function changePartCue(part: LecturePart, id: string, change: (cue: LectureCue) => LectureCue): LecturePart {
  return assignCues(part, part.cues.map((cue) => cue.id === id ? change(cue) : cue));
}

export function missingCueVoices(part: LecturePart): LectureCue[] {
  return part.cues.filter((cue) => cue.text.trim() && !cue.audio);
}

const TIMING_TOLERANCE = 0.08;

export function cueTimingError(cue: LectureCue, part: LecturePart): string | undefined {
  const start = Number(cue.start);
  const end = Number(cue.end);
  if (!cue.start.trim() || !cue.end.trim() || !Number.isFinite(start) || !Number.isFinite(end)
    || start < 0 || end <= start || end > part.duration + TIMING_TOLERANCE) {
    return `Enter a start and end within the ${part.duration.toFixed(1)} s recording.`;
  }
  if (cue.audio && cue.audio.duration > end - start + TIMING_TOLERANCE) {
    return `The voice clip is ${cue.audio.duration.toFixed(1)} s and the cue allows ${(end - start).toFixed(1)} s. Shorten the script or extend the cue.`;
  }
  if (part.cues.some((other) => other.id !== cue.id && other.start.trim() && other.end.trim()
    && Number(other.start) < end - TIMING_TOLERANCE && Number(other.end) > start + TIMING_TOLERANCE)) {
    return "This cue overlaps another cue.";
  }
}

export function renderBlocker(part: LecturePart): string | undefined {
  if (part.audioMode === "take") {
    if (!part.take) return "Import the finished voice take for this part.";
    if (part.take.duration > part.duration + TIMING_TOLERANCE) {
      return `The take is ${(part.take.duration - part.duration).toFixed(1)} s longer than the video. Trim it before rendering.`;
    }
    return;
  }
  if (!part.cues.length) return "Add narration cues or import a full take.";
  if (part.cues.some((cue) => cueTimingError(cue, part))) return "Resolve cue timing issues before rendering.";
  if (part.cues.some((cue) => !cue.audio)) return "Generate audio for every cue before rendering.";
}
