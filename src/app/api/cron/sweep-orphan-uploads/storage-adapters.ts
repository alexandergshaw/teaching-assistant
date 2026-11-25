import type { OrphanSweepLister, OrphanSweepRemover } from "@/lib/orphan-upload-sweep";
import type { createServiceClient } from "@/lib/supabase/server";
import { listFilesAs, removeFilesAs } from "@/lib/supabase/storage";
import { SYLLABUS_UPLOAD_BUCKET } from "@/lib/syllabus-upload-source";

// Map SDK responses to the sweep's inputs. Preserve the names returned by
// Storage so the sweep can distinguish leaf names from full paths.
export function makeOrphanSweepLister(supabase: ReturnType<typeof createServiceClient>): OrphanSweepLister {
  return {
    async listPage(path, page) {
      const result = await listFilesAs(supabase, SYLLABUS_UPLOAD_BUCKET, path, page);
      if (result.error || result.data === null) {
        return { entries: [], error: result.error?.message ?? "Unknown listing error" };
      }
      return { entries: result.data, error: null };
    },
  };
}

export function makeOrphanSweepRemover(supabase: ReturnType<typeof createServiceClient>): OrphanSweepRemover {
  return {
    async remove(paths) {
      const result = await removeFilesAs(supabase, SYLLABUS_UPLOAD_BUCKET, paths);
      if (result.error || result.data === null) {
        return { removedNames: [], error: result.error?.message ?? "Unknown removal error" };
      }
      return { removedNames: result.data.map((entry) => entry.name), error: null };
    },
  };
}
