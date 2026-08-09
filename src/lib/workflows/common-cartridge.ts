// Builds IMS Common Cartridge 1.3 zips (.imscc) so course materials can be
// imported into Blackboard, Canvas, and other LMSs. Deliverables are emitted
// as native CC assignment resources (the IMS CC assignment extension), which
// importers turn into real assignments with rendered instructions.
//
// Two shapes: buildCommonCartridge packages the whole course (weeks as
// folders inside one cartridge, the Canvas path); buildWeekCartridge
// packages a single week with its content at the root, for importers that
// wrap each package in one folder (Blackboard Ultra) so the wrapper itself
// becomes the module.
//
// Both shapes also write an internal "this app built this" stamp
// (CARTRIDGE_STAMP_PATH, unconditionally, regardless of flavor) so the
// cartridge is still recognizable as app output after a download/re-upload
// round trip strips any external metadata - see cartridge-import-stamp.ts's
// header comment for the full design rationale.

import { buildCartridgeStampJson, CARTRIDGE_STAMP_PATH } from "@/lib/cartridge-import-stamp";

export interface CartridgeWeek {
  week: number;
  title: string;
  files: Array<{ name: string; blob: Blob }>;
  // HTML pages emitted as webcontent under wiki_content/: Canvas imports
  // those as Pages; Blackboard imports each as a Document rendered inline
  // when opened.
  pages: Array<{ title: string; html: string }>;
  // Deliverable assignments emitted via the CC assignment extension so LMS
  // imports create real assignments.
  // dueAt is an optional UTC ISO-8601 timestamp WITHOUT timezone suffix,
  // e.g. "2026-08-24T04:59:00": Canvas parses zoneless due_at values as UTC
  // and renders them back in the course timezone (Canvas flavor only).
  assignments: Array<{ title: string; html: string; points: number; dueAt?: string }>;
  // AC3 item 18 (docs/weekly-announcement-package-io-acceptance-criteria.md):
  // each in-session week becomes ONE announcement in the package. Optional
  // so every existing CartridgeWeek literal - steps.lms-export.ts's
  // blackboard-export step, buildWeekCartridge's own (unrelated) call
  // shape, and any test fixture that predates this field - compiles and
  // behaves identically when it is absent or empty; see emitAnnouncements
  // below, which is a no-op for both cases. postAtUtc mirrors
  // `assignments[].dueAt` above: the same zoneless-UTC timestamp form
  // steps.lms-export.ts:151's toUtcTimestamp already produces (e.g.
  // "2026-08-24T13:00:00") - Canvas parses a zoneless value as UTC and
  // renders it back in the course timezone. Reused as-is, not
  // reconverted here.
  //
  // emailCopy (AC4 item 27): the resolved "email a copy to students" choice
  // for THIS announcement - `resolveAnnouncementEmailCopy`'s `value` field
  // in src/lib/announcement-schedule.ts, a tri-state (true/false/null)
  // because a Canvas target always resolves to `honored: false` and this app
  // has no Canvas request field to carry it on regardless (AC4 item 26 - the
  // discussion-topic create endpoint accepts no notification parameter at
  // all). OPTIONAL, like postAtUtc above, so every existing caller and test
  // fixture that predates this field still compiles and behaves identically
  // when it is absent - emitAnnouncements below treats a missing emailCopy
  // exactly like an explicit `null` (see buildAnnouncementsSidecarJson's own
  // comment for where this value actually goes: the app-owned sidecar, NEVER
  // into <topicMeta>, which is Canvas's own namespace and has no such
  // element).
  announcements?: Array<{
    title: string;
    html: string;
    postAtUtc?: string;
    emailCopy?: boolean | null;
  }>;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizePath(s: string): string {
  return s.replace(/[^a-zA-Z0-9._ -]/g, "_");
}

// QTI 1.2 essay assessment (IMS CC profile): one manually graded essay item
// carrying the deliverable instructions. Blackboard Ultra imports these as
// gradable Tests inside the module; it silently drops the CC assignment
// extension, which is why cc-flavor deliverables ride QTI instead.
export function buildQtiAssessmentXml(a: {
  identifier: string;
  title: string;
  html: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/profile/cc/ccv1p3/ccv1p3_qtiasiv1p2p1_v1p0.xsd">
  <assessment ident="${a.identifier}" title="${esc(a.title)}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>cc_profile</fieldlabel>
        <fieldentry>cc.exam.v0p1</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>qmd_scoretype</fieldlabel>
        <fieldentry>Percentage</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
      <item ident="${a.identifier}_i1" title="${esc(a.title)}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>cc_profile</fieldlabel>
              <fieldentry>cc.essay.v0p1</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>qmd_scoringpermitted</fieldlabel>
              <fieldentry>Yes</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>qmd_computerscored</fieldlabel>
              <fieldentry>No</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html">${esc(a.html)}</mattext>
          </material>
          <response_str ident="response1" rcardinality="Single">
            <render_fib>
              <response_label ident="answer1" rshuffle="No"/>
            </render_fib>
          </response_str>
        </presentation>
      </item>
    </section>
  </assessment>
</questestinterop>`;
}

// Canvas course-export assignment settings; due_at omitted when absent.
export function buildAssignmentSettingsXml(a: {
  identifier: string;
  title: string;
  points: number;
  dueAt?: string;
}): string {
  const dueAtXml = a.dueAt ? `  <due_at>${esc(a.dueAt)}</due_at>\n` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<assignment identifier="${a.identifier}" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${esc(a.title)}</title>
${dueAtXml}  <points_possible>${a.points}</points_possible>
  <grading_type>points</grading_type>
  <submission_types>online_text_entry</submission_types>
  <workflow_state>published</workflow_state>
</assignment>`;
}

// AC3 item 18a (docs/weekly-announcement-package-io-acceptance-criteria.md):
// the standard IMS CC discussion-topic file, written for BOTH cartridge
// flavors so a non-Canvas LMS still imports the announcement's content as a
// topic. This is the wire format Canvas's own Common Cartridge exporter
// emits (`lib/cc/topic_resources.rb`), not invented. No <topic identifier=...>
// attribute - unlike buildQtiAssessmentXml/buildAssignmentSettingsXml above,
// Canvas's own exporter does not put an identifier on the <topic> root; the
// resource identifier lives only in imsmanifest.xml's <resource> element and
// (canvas flavor) topicMeta.xml's <topic_id>.
export function buildAnnouncementTopicXml(a: { title: string; html: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imsdt_v1p1.xsd">
  <title>${esc(a.title)}</title>
  <text texttype="text/html">${esc(a.html)}</text>
</topic>`;
}

// AC3 item 18b/c (same doc): the Canvas-only topicMeta sibling. Same
// CANVAS_NAMESPACE buildAssignmentSettingsXml above already uses
// ("http://canvas.instructure.com/xsd/cccv1p0"). Children are emitted IN
// CANVAS'S OWN FIXED ORDER - topic_id, title, delayed_post_at (omitted
// entirely when postAtUtc is absent, same conditional-line idiom
// buildAssignmentSettingsXml uses for due_at above), position, type,
// discussion_type, pinned, workflow_state. <type>announcement</type> is the
// literal that makes Canvas import this topic into Announcements instead of
// Discussions - it is not a placeholder or a configurable value.
export function buildAnnouncementTopicMetaXml(a: {
  identifier: string;
  title: string;
  position: number;
  postAtUtc?: string;
}): string {
  const delayedPostAtXml = a.postAtUtc
    ? `  <delayed_post_at>${esc(a.postAtUtc)}</delayed_post_at>\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<topicMeta xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <topic_id>${esc(a.identifier)}</topic_id>
  <title>${esc(a.title)}</title>
${delayedPostAtXml}  <position>${a.position}</position>
  <type>announcement</type>
  <discussion_type>side_comment</discussion_type>
  <pinned>false</pinned>
  <workflow_state>active</workflow_state>
</topicMeta>`;
}

// AC4 item 27 (docs/weekly-announcement-package-io-acceptance-criteria.md):
// the app's own sidecar recording, per announcement, the data that AC4 item
// 27 requires the package to carry but that has nowhere honest to live
// inside Canvas's own wire format: the resolved email-copy choice. Follows
// the EXACT precedent CARTRIDGE_STAMP_PATH / buildCartridgeStampJson
// (src/lib/cartridge-import-stamp.ts:38/:81) already set for this codebase -
// a fixed, dedicated zip path, written unconditionally-when-applicable and
// deliberately NEVER registered as a manifest <resource> (see
// buildManifestXml below - nothing pushes a resourceDef for this path, the
// same way the stamp never does), so every importer's manifest-driven import
// logic treats it as an inert extra file it never reads, exactly like the
// stamp. AC4 item 27 is explicit that this must NOT become an <email_copy>
// element inside <topicMeta>: that element does not exist in Canvas's own
// cccv1p0 schema (http://canvas.instructure.com/xsd/cccv1p0,
// buildAnnouncementTopicMetaXml above), and inventing one inside a namespace
// this app does not own risks Canvas's importer rejecting the whole
// topicMeta file rather than just ignoring an unknown extra file the way it
// ignores this sidecar. A separate, app-owned path is the only place this
// value can go without that risk - same reasoning as the stamp file's own
// header comment.
export const TA_ANNOUNCEMENTS_SIDECAR_PATH = "ta-announcements.json";

// One recorded announcement in the sidecar: title (so a human opening the
// file can match entries to the topic.xml/topicMeta.xml files sitting next
// to it), postAtUtc (null, not omitted, when the announcement carried none -
// this is machine-readable JSON, not prose, so absence is spelled out
// rather than left to a caller's key-existence check), the RESOLVED position
// (the same 1-based, whole-cartridge counter buildAnnouncementTopicMetaXml's
// canvas-flavor <position> element gets - see CartridgeState.announcementPosition
// below - recorded here for BOTH flavors even though only canvas flavor
// writes it into XML, so a cc-flavor package still has a durable record of
// announcement order), and emailCopy as a real JSON true/false/null (never a
// string), matching resolveAnnouncementEmailCopy's own tri-state `value`
// field (src/lib/announcement-schedule.ts) one-for-one.
export interface AnnouncementSidecarEntry {
  title: string;
  postAtUtc: string | null;
  position: number;
  emailCopy: boolean | null;
}

// Serializes the whole cartridge's announcement sidecar in one shot (called
// once per build, after every week has been emitted, mirroring
// buildCartridgeStampJson's one-shot-per-build shape). Wrapped in an object
// with a single `announcements` key - not a bare top-level array - so the
// shape can gain sibling fields later (a stamp-style `app`/`kind` pair, for
// instance) without every reader needing to distinguish "an array" from "an
// object" on parse; the stamp file took the object-from-the-start approach
// for the same reason (CartridgeStamp's `app`/`kind`/`stampVersion` fields).
export function buildAnnouncementsSidecarJson(entries: AnnouncementSidecarEntry[]): string {
  return JSON.stringify({ announcements: entries });
}

// Canvas module structure: one module per week, items in emission order.
export function buildModuleMetaXml(
  modules: Array<{
    identifier: string;
    title: string;
    position: number;
    items: Array<{
      identifier: string;
      title: string;
      contentType: "Assignment" | "Attachment";
      identifierref: string;
      position: number;
    }>;
  }>
): string {
  const modulesXml = modules
    .map((m) => {
      const itemsXml = m.items
        .map(
          (item) => `    <item identifier="${item.identifier}">
      <title>${esc(item.title)}</title>
      <content_type>${item.contentType}</content_type>
      <workflow_state>active</workflow_state>
      <identifierref>${item.identifierref}</identifierref>
      <position>${item.position}</position>
    </item>`
        )
        .join("\n");

      return `  <module identifier="${m.identifier}">
    <title>${esc(m.title)}</title>
    <workflow_state>active</workflow_state>
    <position>${m.position}</position>
    <items>
${itemsXml}
    </items>
  </module>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
${modulesXml}
</modules>`;
}

interface ResourceDef {
  id: string;
  type: string;
  href: string;
  files?: string[]; // Multiple files for Canvas assignments; single-file resources omit this
  // AC3 item 18d: set on a canvas-flavor announcement's topic resource,
  // pointing at its topicMeta sibling's OWN resource id (see
  // emitAnnouncements below) - Canvas's own linkage between the two files,
  // which stay two separate <resource> elements rather than one resource
  // with two <file> children (contrast the assignment resource above, which
  // DOES fold assignment.html + assignment_settings.xml into one resource's
  // `files` list). Left undefined by every other resource kind, so
  // buildManifestXml's <dependency> emission below is purely additive.
  dependency?: string;
}

// Mutable counters and collected resource definitions for one cartridge
// build; the emission helper writes payload files into the zip as it goes.
interface CartridgeState {
  zip: { file: (path: string, data: Blob | string) => unknown };
  resourceId: number;
  itemId: number;
  resourceDefs: ResourceDef[];
  // CONFIRMED-DEFECT FIX (adversarial-verification pass on AC3 item 18,
  // docs/weekly-announcement-package-io-acceptance-criteria.md; the earlier,
  // broken version of emitAnnouncements below computed
  // `position: index + 1` off `index`, the index into THAT WEEK's OWN
  // `announcements` array - since AC3 item 18 mandates exactly one
  // announcement per week, that index was always 0, so `position` was
  // literally always 1 for every week in every build). Living on
  // CartridgeState instead - the same place resourceId/itemId already live -
  // makes it a whole-cartridge counter the same way those two already are,
  // so positions come out 1, 2, 3, ... in the order weeks are emitted,
  // matching Canvas's own topicMeta <position> semantics (a course-wide
  // ordering field, not a per-week one). 1-based to match
  // buildAnnouncementTopicMetaXml's own 1-based `position` parameter and the
  // `index + 1` idiom this file already uses for weekPosition/moduleItems
  // below. Incremented once per announcement regardless of flavor (see
  // emitAnnouncements) because the RESOLVED position is recorded into
  // AnnouncementSidecarEntry for both flavors, not only written into XML for
  // the canvas flavor's <topicMeta>.
  announcementPosition: number;
  // Accumulates one AnnouncementSidecarEntry per announcement across every
  // week emitAnnouncements processes, in emission order - collected here
  // rather than threaded through emitAnnouncements's return value because
  // (like resourceDefs) it needs to survive across the whole per-week loop
  // in buildCommonCartridge, not just one call. Written out as
  // TA_ANNOUNCEMENTS_SIDECAR_PATH once, after the loop, and ONLY when
  // non-empty - see buildCommonCartridge's own comment at that call site for
  // why an empty array must never produce the file at all (the
  // no-announcements byte-identical invariant, REGRESSION entry 240).
  announcementSidecarEntries: AnnouncementSidecarEntry[];
}

// Emitted item metadata for Canvas module structure.
interface EmittedItem {
  itemId: string;
  resId: string;
  title: string;
  contentType: "Assignment" | "Attachment";
}

// Emit page, file, and assignment resources into the cartridge zip and
// return their organization <item> XML strings plus emitted item metadata for Canvas.
function emitContentItems(
  state: CartridgeState,
  files: CartridgeWeek["files"],
  assignments: CartridgeWeek["assignments"],
  pages: CartridgeWeek["pages"],
  flavor: "cc" | "canvas" = "cc"
): { items: string[]; emittedItems: EmittedItem[] } {
  const items: string[] = [];
  const emittedItems: EmittedItem[] = [];

  // Add page resources first so introductions lead their module. The
  // webcontent lives under wiki_content/: Canvas imports webcontent there
  // as Pages; Blackboard imports it as a Document rendered inline on open.
  for (const page of pages) {
    const num = String(state.resourceId++).padStart(4, "0");
    const resId = `r${num}`;

    const pageHtml = `<html><head><meta charset="utf-8"><title>${esc(
      page.title
    )}</title></head><body>${page.html}</body></html>`;

    const resPath = `wiki_content/p${num}.html`;
    state.zip.file(resPath, pageHtml);

    const pageItemId = `i${String(state.itemId++).padStart(4, "0")}`;
    state.resourceDefs.push({
      id: resId,
      type: "webcontent",
      href: resPath,
    });

    items.push(
      `<item identifier="${pageItemId}" identifierref="${resId}"><title>${esc(
        page.title
      )}</title></item>`
    );
  }

  // Add file resources. Canvas's cartridge converter (activated by
  // course_settings/canvas_export.txt) only maps files whose path starts
  // with web_resources/; anything else silently vanishes on import. The
  // res${resId} subfolder keeps names collision-free in both flavors.
  for (const file of files) {
    const resId = `r${String(state.resourceId++).padStart(4, "0")}`;
    const sanitizedName = sanitizePath(file.name);
    const resPath =
      flavor === "canvas"
        ? `web_resources/res${resId}/${sanitizedName}`
        : `res${resId}/${sanitizedName}`;

    state.zip.file(resPath, file.blob);

    const fileItemId = `i${String(state.itemId++).padStart(4, "0")}`;
    state.resourceDefs.push({
      id: resId,
      type: "webcontent",
      href: resPath,
    });

    items.push(
      `<item identifier="${fileItemId}" identifierref="${resId}"><title>${esc(
        file.name
      )}</title></item>`
    );

    emittedItems.push({
      itemId: fileItemId,
      resId,
      title: file.name,
      contentType: "Attachment",
    });
  }

  // Add assignment resources: Canvas uses learning-application-resource with
  // assignment_settings.xml; cc flavor uses QTI essay assessments because Blackboard
  // Ultra drops the CC assignment extension.
  for (const assignment of assignments) {
    const num = String(state.resourceId++).padStart(4, "0");
    const resId = `r${num}`;

    if (flavor === "canvas") {
      // Canvas flavor: assignment.html + assignment_settings.xml
      const assignmentHtml = `<html><head><meta charset="utf-8"><title>${esc(
        assignment.title
      )}</title></head><body>${assignment.html}</body></html>`;

      const assignmentSettingsXml = buildAssignmentSettingsXml({
        identifier: resId,
        title: assignment.title,
        points: assignment.points,
        dueAt: assignment.dueAt,
      });

      state.zip.file(`res${resId}/assignment.html`, assignmentHtml);
      state.zip.file(`res${resId}/assignment_settings.xml`, assignmentSettingsXml);

      const assignmentItemId = `i${String(state.itemId++).padStart(4, "0")}`;
      state.resourceDefs.push({
        id: resId,
        type: "associatedcontent/imscc_xmlv1p1/learning-application-resource",
        href: `res${resId}/assignment.html`,
        files: [`res${resId}/assignment.html`, `res${resId}/assignment_settings.xml`],
      });

      items.push(
        `<item identifier="${assignmentItemId}" identifierref="${resId}"><title>${esc(
          assignment.title
        )}</title></item>`
      );

      emittedItems.push({
        itemId: assignmentItemId,
        resId,
        title: assignment.title,
        contentType: "Assignment",
      });
    } else {
      // CC flavor: QTI essay assessment
      const assessmentXml = buildQtiAssessmentXml({
        identifier: resId,
        title: assignment.title,
        html: assignment.html,
      });

      const resPath = `res${resId}/assessment.xml`;
      state.zip.file(resPath, assessmentXml);

      const assignmentItemId = `i${String(state.itemId++).padStart(4, "0")}`;
      state.resourceDefs.push({
        id: resId,
        type: "imsqti_xmlv1p2/imscc_xmlv1p3/assessment",
        href: resPath,
      });

      items.push(
        `<item identifier="${assignmentItemId}" identifierref="${resId}"><title>${esc(
          assignment.title
        )}</title></item>`
      );
    }
  }

  return { items, emittedItems };
}

// AC3 items 18 and 20 (docs/weekly-announcement-package-io-acceptance-criteria.md):
// emit an announcement's topic (both flavors) and topicMeta (canvas flavor
// only) resources into the cartridge zip. Deliberately separate from
// emitContentItems above rather than a fourth loop folded into it, because
// announcements do not participate in either of that function's two return
// values: per AC3 item 20 ("Canvas announcements are not module items"),
// they are never given an organization <item> (contrast pages/files/
// assignments, which all push into `items`) and are never pushed into
// `emittedItems` either.
//
// That second point is the deliberate choice entry 240 check 4/5 and AC3
// item 19 flag as a trap: EmittedItem.contentType's "Assignment" |
// "Attachment" union (this file's :190-ish interface, buildModuleMetaXml's
// parameter type, and the `.filter((ei) => ei.contentType === "Assignment"
// || ei.contentType === "Attachment")` guard in buildCommonCartridge) is
// NOT widened with an "Announcement" member here. Widening it would only
// matter if announcements were ever pushed into `emittedItems` so they
// could reach course_settings/module_meta.xml - but AC3 item 20 says
// module_meta.xml must NOT be given announcement entries at all, so
// announcements never reach `emittedItems` in the first place (this
// function pushes only to `state.resourceDefs`, never to any `items`/
// `emittedItems` array passed in). Entry 240 check 5 separately pins that
// the pages loop above pushes to `items` but never to `emittedItems` as a
// REAL EXISTING DEFECT, not a pattern to imitate; this function avoids that
// mistake by design, not by accident - it has no `items` or `emittedItems`
// parameter to push into at all. All three contentType sites are therefore
// left untouched.
function emitAnnouncements(
  state: CartridgeState,
  announcements: CartridgeWeek["announcements"],
  flavor: "cc" | "canvas"
): void {
  if (!announcements || announcements.length === 0) return;

  announcements.forEach((announcement) => {
    // CONFIRMED-DEFECT FIX: the resolved position is minted from
    // state.announcementPosition (a whole-cartridge counter - see
    // CartridgeState's own comment) rather than from this forEach's own loop
    // index, which is scoped to just THAT WEEK's announcements array and
    // would therefore always be 0 (position 1) under AC3 item 18's
    // one-announcement-per-week rule. Incremented unconditionally, for both
    // flavors, because the RESOLVED position is recorded into every
    // announcement's AnnouncementSidecarEntry below regardless of flavor,
    // even though only the canvas flavor also writes it into <topicMeta>.
    const position = state.announcementPosition++;

    // AC3 item 18a: the standard CC topic file, written for BOTH flavors.
    const topicResId = `r${String(state.resourceId++).padStart(4, "0")}`;
    const topicPath = `res${topicResId}/topic.xml`;
    state.zip.file(
      topicPath,
      buildAnnouncementTopicXml({ title: announcement.title, html: announcement.html })
    );

    // AC3 item 18b/d: the Canvas-only topicMeta sibling, registered as its
    // OWN resource (never folded into the topic resource's `files` list -
    // see ResourceDef.dependency's comment above for why) with the topic
    // resource carrying a <dependency> that points at it.
    let metaResId: string | undefined;
    let metaPath: string | undefined;
    if (flavor === "canvas") {
      metaResId = `r${String(state.resourceId++).padStart(4, "0")}`;
      metaPath = `res${topicResId}/topicMeta.xml`;
      state.zip.file(
        metaPath,
        buildAnnouncementTopicMetaXml({
          identifier: topicResId,
          title: announcement.title,
          position,
          postAtUtc: announcement.postAtUtc,
        })
      );
    }

    state.resourceDefs.push({
      id: topicResId,
      type: "imsdt_xmlv1p1",
      href: topicPath,
      dependency: metaResId,
    });

    if (metaResId && metaPath) {
      state.resourceDefs.push({
        id: metaResId,
        type: "associatedcontent/imscc_xmlv1p1/learning-application-resource",
        href: metaPath,
      });
    }

    // AC4 item 27: record this announcement into the app-owned sidecar
    // (never into <topicMeta> - see TA_ANNOUNCEMENTS_SIDECAR_PATH's own
    // comment for why). `postAtUtc`/`emailCopy` are normalized from
    // "absent" (undefined) to explicit `null` here - JSON has no `undefined`
    // and JSON.stringify would otherwise silently DROP an undefined-valued
    // key, which would make an omitted emailCopy indistinguishable from a
    // sidecar-format bug that forgot the key entirely.
    state.announcementSidecarEntries.push({
      title: announcement.title,
      postAtUtc: announcement.postAtUtc ?? null,
      position,
      emailCopy: announcement.emailCopy ?? null,
    });
  });
}

function buildManifestXml(
  title: string,
  orgItemsXml: string,
  resourceDefs: ResourceDef[]
): string {
  const resourcesXml = resourceDefs
    .map((r) => {
      const fileHrefs = r.files || [r.href];
      const fileElements = fileHrefs.map((href) => `<file href="${href}"/>`).join("");
      // AC3 item 18d: a <dependency> child links an announcement's topic
      // resource to its canvas-flavor topicMeta resource - see
      // ResourceDef.dependency's own comment above. Every existing resource
      // kind leaves `dependency` undefined, so `dependencyElement` is always
      // "" for them and this line changes nothing about their output.
      const dependencyElement = r.dependency
        ? `<dependency identifierref="${r.dependency}"/>`
        : "";
      return `<resource identifier="${r.id}" type="${r.type}" href="${r.href}">${fileElements}${dependencyElement}</resource>`;
    })
    .join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="ta-cartridge" xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.3.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title>
          <lomimscc:string>${esc(title)}</lomimscc:string>
        </lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="root">
        ${orgItemsXml}
      </item>
    </organization>
  </organizations>
  <resources>
    ${resourcesXml}
  </resources>
</manifest>`;
}

export async function buildCommonCartridge(
  courseTitle: string,
  weeks: CartridgeWeek[],
  options?: { flavor?: "cc" | "canvas" }
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const flavor = options?.flavor ?? "cc";

  const state: CartridgeState = {
    zip,
    resourceId: 1,
    itemId: 1,
    resourceDefs: [],
    announcementPosition: 1,
    announcementSidecarEntries: [],
  };

  const orgItems: string[] = [];
  const canvasModules: Array<{
    identifier: string;
    title: string;
    position: number;
    items: Array<{
      identifier: string;
      title: string;
      contentType: "Assignment" | "Attachment";
      identifierref: string;
      position: number;
    }>;
  }> = [];

  // Process each week as a folder item inside the single cartridge.
  let weekPosition = 1;
  for (const week of weeks) {
    const weekItemId = `i${String(state.itemId++).padStart(4, "0")}`;
    const { items: weekItems, emittedItems } = emitContentItems(
      state,
      week.files,
      week.assignments,
      week.pages,
      flavor
    );

    // AC3 items 18/20: announcements are independent of whether the week has
    // any files/pages/assignments at all (a week could carry only an
    // announcement), so this runs unconditionally rather than nested inside
    // the `weekItems.length > 0` branch below - and, per emitAnnouncements's
    // own header comment, never touches `weekItems`/`emittedItems`/
    // `orgItems`/`canvasModules` in any way. A week with no announcements
    // (the pre-existing default: `announcements` absent or empty) makes this
    // a no-op, so it does not change any existing cartridge's output.
    emitAnnouncements(state, week.announcements, flavor);

    if (weekItems.length > 0) {
      orgItems.push(
        `<item identifier="${weekItemId}"><title>${esc(week.title)}</title>${weekItems.join(
          ""
        )}</item>`
      );

      // For Canvas: build module structure from emitted items
      if (flavor === "canvas") {
        const moduleItems = emittedItems
          .filter((ei) => ei.contentType === "Assignment" || ei.contentType === "Attachment")
          .map((ei, index) => ({
            identifier: ei.itemId,
            title: ei.title,
            contentType: ei.contentType as "Assignment" | "Attachment",
            identifierref: ei.resId,
            position: index + 1,
          }));

        if (moduleItems.length > 0) {
          canvasModules.push({
            identifier: `m${String(weekPosition).padStart(4, "0")}`,
            title: week.title,
            position: weekPosition,
            items: moduleItems,
          });
        }
      }
    }

    weekPosition++;
  }

  zip.file(
    "imsmanifest.xml",
    buildManifestXml(
      courseTitle,
      orgItems.join("\n        "),
      state.resourceDefs
    )
  );

  // Canvas flavor: add course_settings/canvas_export.txt and course_settings/module_meta.xml
  if (flavor === "canvas") {
    zip.file("course_settings/canvas_export.txt", "Generated by the teaching assistant app.");
    zip.file("course_settings/module_meta.xml", buildModuleMetaXml(canvasModules));

    // Register the settings resource
    state.resourceDefs.push({
      id: "co_settings",
      type: "associatedcontent/imscc_xmlv1p1/learning-application-resource",
      href: "course_settings/canvas_export.txt",
      files: ["course_settings/canvas_export.txt", "course_settings/module_meta.xml"],
    });

    // Rebuild manifest to include settings resource
    zip.file(
      "imsmanifest.xml",
      buildManifestXml(
        courseTitle,
        orgItems.join("\n        "),
        state.resourceDefs
      )
    );
  }

  // Internal app-generated stamp (see this file's header comment and
  // cartridge-import-stamp.ts). Written unconditionally, for both flavors,
  // and not registered as a manifest resource - it rides as an inert extra
  // file that no LMS importer's manifest-driven processing ever touches.
  zip.file(CARTRIDGE_STAMP_PATH, buildCartridgeStampJson({ title: courseTitle }));

  // AC4 item 27 sidecar - see TA_ANNOUNCEMENTS_SIDECAR_PATH's own comment.
  // Written ONLY when the cartridge actually contains at least one
  // announcement - a `weeks` list where every week's `announcements` is
  // absent or empty leaves state.announcementSidecarEntries empty, and this
  // stays a no-op, so a no-announcement build's zip is BYTE-IDENTICAL to the
  // pre-this-feature builder (REGRESSION entry 240's own invariant; pinned
  // by this file's "no-announcements regression" test group). Whenever
  // announcements exist, the sidecar is written even if every one of them
  // happens to omit emailCopy: the file also carries position and postAt,
  // both of which are real, always-present data the moment an announcement
  // exists at all - so "no emailCopy anywhere" is not the same condition as
  // "no announcements", and only the latter should suppress the file.
  if (state.announcementSidecarEntries.length > 0) {
    zip.file(
      TA_ANNOUNCEMENTS_SIDECAR_PATH,
      buildAnnouncementsSidecarJson(state.announcementSidecarEntries)
    );
  }

  return await zip.generateAsync({ type: "blob" });
}

// Single-week cartridge: the file and assignment items sit directly under
// the root item (no intermediate week folder), so an importer that wraps
// the whole package in one folder named after the package title (Blackboard
// Ultra) yields exactly one top-level module for the week.
export async function buildWeekCartridge(
  weekTitle: string,
  files: CartridgeWeek["files"],
  assignments: CartridgeWeek["assignments"],
  pages: CartridgeWeek["pages"]
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  // AC5 item 34: buildWeekCartridge itself is UNCHANGED behavior-wise - it
  // never has an `announcements` array to pass along (its parameters are
  // individual files/assignments/pages, not a whole CartridgeWeek) and never
  // calls emitAnnouncements, so announcementPosition/announcementSidecarEntries
  // below are dead weight that only exists to satisfy CartridgeState's
  // (now-widened) shape at compile time; nothing ever reads them here.
  const state: CartridgeState = {
    zip,
    resourceId: 1,
    itemId: 1,
    resourceDefs: [],
    announcementPosition: 1,
    announcementSidecarEntries: [],
  };

  const { items } = emitContentItems(state, files, assignments, pages, "cc");

  zip.file(
    "imsmanifest.xml",
    buildManifestXml(weekTitle, items.join("\n        "), state.resourceDefs)
  );

  // Internal app-generated stamp - see buildCommonCartridge's identical call
  // and this file's header comment.
  zip.file(CARTRIDGE_STAMP_PATH, buildCartridgeStampJson({ title: weekTitle }));

  return await zip.generateAsync({ type: "blob" });
}
