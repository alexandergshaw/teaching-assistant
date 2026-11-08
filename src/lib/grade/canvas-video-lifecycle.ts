import { stageCanvasVideos } from "./canvas-video-stage";

/**
 * All paths must be durably reserved before an upload can start. Reservations
 * survive success, failure, and process termination; a reconciler owns their
 * eventual release after it has fenced writers and consumers.
 */
export interface CanvasVideoLifecycleDependencies {
  allocate(extension: string): string;
  reserve(ownerId: string, path: string): Promise<boolean>;
  upload(path: string, bytes: Buffer, mime: string): Promise<boolean>;
  remove(paths: string[]): Promise<void>;
}

/** The owner id must come from server-side authentication, never the request body. */
export async function stageCanvasVideosWithLifecycle(
  ownerId: string,
  files: readonly { name: string; mimeType: string; base64: string }[],
  deps: CanvasVideoLifecycleDependencies,
) {
  const reserved = new Set<string>();
  return stageCanvasVideos(ownerId, files, {
    allocate: deps.allocate,
    upload: async (path, bytes, mime) => {
      if (!await deps.reserve(ownerId, path)) return false;
      reserved.add(path);
      return deps.upload(path, bytes, mime);
    },
    remove: async paths => { const owned = paths.filter(path => reserved.has(path)); if (owned.length) await deps.remove(owned); },
  });
}
