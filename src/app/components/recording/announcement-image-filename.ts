// Filename for the "Download image" control beside an announcement's
// generated companion image (TakeAnnouncementPanel.tsx, wired through this
// directory's useTakeAnnouncement.ts downloadImage). Pure and leaf-only so it
// is unit-tested with frozen literals with no DOM involved - vitest here is
// node-env and collects only src/**/*.test.ts (see docs/DEV_LOOP.md), so no
// component in this directory is ever rendered by a test.
//
// Slugging reuses this directory's own idiom, not a new one - see
// discussion-replies-log.ts's slugify (lowercase, collapse any run of
// non [a-z0-9] to one dash, trim leading/trailing dashes). The extension
// comes from src/lib/recording-files.ts's extForMime, the repo's one
// mime-type -> extension mapping - it already covers both mime types
// generateGeminiImage (src/lib/llm.ts) ever returns (image/png -> png,
// image/jpeg -> jpg), so no second mapping is invented here.
import { extForMime } from "@/lib/recording-files";

const FALLBACK_SUBJECT_SLUG = "announcement";
// Keeps the filename readable and comfortably under every filesystem's path
// component limit even for a long drafted subject line.
const MAX_SLUG_LENGTH = 60;

function slugifySubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    // The slice above can expose a fresh trailing dash (a cut landing right
    // after a run of non-alphanumeric characters) that the trim before it
    // never saw - strip it again so the filename never ends in "-image.ext".
    .replace(/-+$/g, "");
}

/**
 * `<subject-slug>-image.<ext>` for the announcement's downloaded companion
 * image. A blank or punctuation-only subject falls back to
 * FALLBACK_SUBJECT_SLUG rather than emitting a bare "-image.<ext>".
 */
export function announcementImageFileName(subject: string, mimeType: string): string {
  const slug = slugifySubject(subject) || FALLBACK_SUBJECT_SLUG;
  const ext = extForMime(mimeType);
  return `${slug}-image.${ext}`;
}
