// Client-side step catalog: "fetch-deliverable-images" - adds one Unsplash
// photo (plus a companion credits file) to EVERY generated deliverable file
// (module materials, assignments, announcements, knowledge checks - every
// role except "image" itself, and excluding course-wide weekNumber-0 files,
// which have no week topic to key an image to), queried from that specific
// deliverable's own content rather than one photo shared by a whole week.
// Added ONCE to COURSE_REFRESH (reaching COURSE_BUILD, COURSE_KICKOFF, and
// COURSE_KICKOFF_NO_CODE via include-workflow), placed right after
// generate-knowledge-checks so it extends the SAME accumulated "files" chain
// both blackboard-export and save-zip-to-course read the tail of (see the
// placement comment on the preset wiring in presets/course-setup.ts).
//
// History: the original version of this step fetched one photo per WEEK
// (shared by every deliverable that week produced) specifically to stay
// inside Unsplash's Demo-tier 50-requests-per-hour quota. That was a
// reasonable engineering instinct but it silently narrowed the actual
// request - "a corresponding image for EVERY deliverable" - and the quota is
// not fixed: an approved Unsplash PRODUCTION application gets 5000
// requests/hour, comfortably enough for a per-deliverable course build (see
// MAX_UNSPLASH_REQUESTS_PER_RUN below for the defensive ceiling this version
// adds instead of relying on that headroom blindly). AC3 still outranks AC1:
// a course build must never fail because of images, on either tier.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  unsplashConfiguredAction,
  fetchUnsplashImageAction,
  type FetchUnsplashImageResult,
} from "@/app/actions";
import { type StepDefinition, base64ToBlob } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { deriveDeliverableImageQuery, buildUnsplashAttribution } from "@/lib/unsplash";

// AC3 (defensive request cap): per-deliverable fetching multiplies the old
// per-week request count by roughly however many deliverable roles a week
// produces - up to nine today (objectives, slides, instructions, opener,
// assignment, test, a weekly announcement, a knowledge check, plus whatever
// a course-wide "introduction" role contributes when present; see
// GeneratedCourseFile['role']). This app's own real-run audits
// (docs/REGRESSION.md) are all 16-week courses, so a full run could
// plausibly attempt on the order of 16 * 9 = 144 unique queries even before
// the same-query cache below (AC2) reduces that further. 200 is a
// DEFENSIVE ceiling, not the expected steady-state count: it exists so a
// pathological run (materially more weeks, or a future role that adds
// several more files per week) cannot silently burn a large fraction of even
// an approved production application's 5000-requests/hour budget in one
// course build, while still comfortably covering every real course this app
// generates today. Exported so steps.deliverable-images.test.ts can size its
// per-run-cap fixture off the real constant rather than a duplicated literal
// that could silently drift from it.
export const MAX_UNSPLASH_REQUESTS_PER_RUN = 200;

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-");
}

function stripFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** The text this deliverable's own image query is derived from first (AC1's
 * "own title/pageText" tier, deriveDeliverableImageQuery's tier 1): its
 * generated prose when it carries any (GeneratedCourseFile.pageText - see
 * that field's own doc comment for which roles set it), or - for a role that
 * ships no prose (a slides deck, an assignment/test handout) - a title
 * derived from its own file name, which already embeds that specific file's
 * identity rather than just its week's shared topic. */
function deliverablePrimaryText(file: GeneratedCourseFile): string {
  if (file.pageText && file.pageText.trim()) return file.pageText;
  return stripFileExtension(file.name);
}

export const deliverableImageSteps: StepDefinition[] = [
  {
    type: "fetch-deliverable-images",
    name: "Add deliverable images",
    description:
      "Add an Unsplash photo to every generated deliverable file (module materials, assignments, announcements, knowledge checks), each queried from that specific deliverable's own content - not one photo shared by a whole week. Each photo ships with a companion credits file naming the photographer, as Unsplash's API terms require. Needs UNSPLASH_ACCESS_KEY; without it, this step does nothing and the run continues unaffected.",
    inputs: [
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: false,
        help: "Used as a fallback when a deliverable's own content does not yield a usable search query.",
      },
      {
        key: "files",
        label: "Course files so far",
        type: "files",
        required: false,
        help: "One image is added for every deliverable file here (course-wide files, which have no single week's topic, are excluded).",
      },
    ],
    outputs: [
      { key: "files", label: "Course files", type: "files" },
      { key: "imageCount", label: "Images added", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const incoming = (values.files as GeneratedCourseFile[] | undefined) ?? [];
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];

      // AC0: a missing key is not a run failure - the chain passes through
      // untouched (byte-identical to today) and the run's own summary says
      // why there are no images, instead of silently omitting them or, worse,
      // throwing and taking the rest of the course build down with it.
      const { configured } = await unsplashConfiguredAction();
      if (!configured) {
        return {
          outputs: { files: incoming, imageCount: 0 },
          summary: {
            kind: "text",
            text: "Skipped - Unsplash is not configured (set UNSPLASH_ACCESS_KEY) - the run continues without images.",
          },
        };
      }

      // AC4/AC6: driven off the files that actually exist, not the schedule
      // or the output-selection booleans directly - a deselected output
      // family (isGeneratorSelected, checked by each generator step BEFORE
      // this one runs) never produces a file for that role, so it never
      // appears here and never costs a request. Course-wide (weekNumber 0)
      // entries (the rubric, the schedule CSV, generic course guides) are
      // excluded - an image is keyed to a WEEK's actual content, and week 0
      // has none. The "image"/credit files this step itself adds are never
      // in `incoming` (they only ever reach `newFiles` below), so there is
      // no risk of this step trying to illustrate its own output.
      const deliverables = incoming.filter((f) => f.weekNumber > 0 && f.role !== "image");

      if (deliverables.length === 0) {
        return {
          outputs: { files: incoming, imageCount: 0 },
          summary: { kind: "text", text: "Skipped - no per-week deliverables to attach an image to." },
        };
      }

      const topicByWeek = new Map(schedule.map((w) => [w.week, (w.topic ?? "").trim()]));

      const newFiles: GeneratedCourseFile[] = [];
      const reportLines: string[] = [];
      // AC3: once the hourly quota is hit, every remaining attempt would
      // fail identically - stop calling out entirely (never burn the rest of
      // this run on doomed requests) and report the whole run's rate-limit
      // outcome ONCE at the end, not once per deliverable.
      let rateLimited = false;
      let requestCount = 0;
      const skipReasonCounts = new Map<string, number>();
      const recordSkip = (reason: string) => {
        skipReasonCounts.set(reason, (skipReasonCounts.get(reason) ?? 0) + 1);
      };

      // AC2: cache keyed on the EXACT derived query string - never across
      // different queries (two deliverables that derive different queries
      // never share a photo just because they might be visually similar;
      // two that derive the SAME query genuinely have the same subject and
      // SHOULD share one). A cache hit reuses the already-fetched
      // FetchUnsplashImageResult wholesale (including its photo record and
      // downloaded bytes) without calling fetchUnsplashImageAction again -
      // so Unsplash's mandatory download_location usage-tracking trigger
      // (fetchUnsplashImageAction's own obligation, actions/unsplash.ts)
      // fires exactly ONCE per photo actually used by this run, not once per
      // deliverable that ends up embedding it. Reading of Unsplash's terms:
      // the trigger counts a photo as "used" by this application: two
      // deliverables in the SAME course build sharing one photo (because
      // their derived queries happened to coincide) is one usage decision by
      // this application, not two, so firing the trigger a second time for
      // the identical photo would double-count a single decision to use it.
      // Two deliverables that derive DIFFERENT queries each still fire their
      // own trigger exactly once - the ordinary case.
      const queryCache = new Map<string, FetchUnsplashImageResult>();

      onProgress("Adding an image for every deliverable that produced real content...");

      for (const file of deliverables) {
        const weekNumber = file.weekNumber;
        const topic = topicByWeek.get(weekNumber);
        const primaryText = deliverablePrimaryText(file);
        // Tier 3 (last-resort) fallback texts: every OTHER file this same
        // week carries pageText for - covers the rare case a deliverable's
        // own content AND the week's topic both come up empty.
        const fallbackTexts = incoming
          .filter((f) => f.weekNumber === weekNumber && f !== file && f.pageText)
          .map((f) => f.pageText!);

        const query = deriveDeliverableImageQuery(primaryText, topic, fallbackTexts);
        if (!query) {
          recordSkip("no_derivable_topic");
          continue;
        }

        let result: FetchUnsplashImageResult;
        if (queryCache.has(query)) {
          // AC2: a cache hit costs no request and is never subject to the
          // rate-limit short-circuit or the per-run cap below - reusing an
          // already-fetched result is exactly the behavior those two guards
          // exist to still allow once they trip.
          result = queryCache.get(query)!;
        } else if (rateLimited) {
          recordSkip("rate_limited");
          continue;
        } else if (requestCount >= MAX_UNSPLASH_REQUESTS_PER_RUN) {
          recordSkip("request_cap_reached");
          continue;
        } else {
          requestCount += 1;
          onProgress(`Finding an image for "${file.name}"...`);
          result = await fetchUnsplashImageAction(query);
          queryCache.set(query, result);
        }

        if ("error" in result) {
          if (result.rateLimited) rateLimited = true;
          recordSkip(result.rateLimited ? "rate_limited" : "error");
          continue;
        }

        if ("skipped" in result) {
          recordSkip(result.reason);
          continue;
        }

        const attribution = buildUnsplashAttribution(result.photo);
        const ext = extensionForMimeType(result.mimeType);
        const baseName = stripFileExtension(file.name);

        // AC4: sorted to sit immediately before the deliverable it
        // illustrates (image, then its credit, then the deliverable itself)
        // rather than bunched at the very start of the week as when this
        // step added a single shared photo per week - every existing
        // sortOrder value in this run is spaced at least 0.5 apart (see
        // GeneratedCourseFile.sortOrder's own doc comment), so subtracting
        // 0.02/0.01 can never collide with a neighboring deliverable's own
        // sortOrder.
        newFiles.push({
          name: sanitizeFileName(`${baseName} - Image.${ext}`),
          blob: base64ToBlob(result.base64, result.mimeType),
          mimeType: result.mimeType,
          weekNumber,
          sortOrder: file.sortOrder - 0.02,
          role: "image",
        });
        newFiles.push({
          name: sanitizeFileName(`${baseName} - Image Credit.txt`),
          blob: new Blob(
            [`${attribution.creditLine}\n\nUsed under the Unsplash License (https://unsplash.com/license). Search query: "${query}".`],
            { type: "text/plain" }
          ),
          mimeType: "text/plain",
          weekNumber,
          sortOrder: file.sortOrder - 0.01,
          role: "image",
        });

        reportLines.push(`Week ${weekNumber} - ${file.name}: added an image (photo by ${attribution.photographerName}).`);
      }

      const skippedTotal = [...skipReasonCounts.values()].reduce((a, b) => a + b, 0);
      if (skippedTotal > 0) {
        const parts = [...skipReasonCounts.entries()].map(([reason, count]) => `${count} ${reason.replace(/_/g, " ")}`);
        reportLines.push(`${skippedTotal} deliverable(s) got no image (${parts.join("; ")}).`);
      }

      const report = reportLines.join("\n");
      const imageCount = newFiles.length / 2;

      return {
        outputs: { files: [...incoming, ...newFiles], imageCount },
        summary:
          imageCount > 0
            ? { kind: "list", label: `Added ${imageCount} deliverable image(s)`, items: reportLines }
            : { kind: "text", text: report || "No images were added." },
      };
    },
  },
];
