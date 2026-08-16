"use client";

// Read-only announcements recovered from a Blackboard course archive - see
// docs/blackboard-announcements-acceptance-criteria.md AC5/AC6/AC7.
//
// AC5: this is the surface. `CartridgeAnnouncement[]` has existed on
// `ExportCourseContent` for exactly as long as this file has - the whole
// point of building it in the SAME chunk as the parser is docs/REGRESSION.md
// entries 262 check 10 and 274 check 6a: `rubrics` shipped on
// `ExportCourseContent` and STILL has no render path months later.
// "Parsed but invisible" is the default outcome here unless a surface ships
// alongside the parser, so this file exists.
//
// AC6: NO POST CONTROL. Nothing in this file renders a button, a link, or
// any control that could reach `createAnnouncementAction` - every
// announcement here is read-only text, and the section heading says so
// explicitly, because an announcement is the one export artifact that would
// otherwise post cleanly to Canvas (see contentSourceGating.ts's own header
// comment on why export-sourced content has no Canvas identity to write
// against).
//
// AC7: rendered as TEXT. `title`/`body`/`releaseDate` are interpolated
// directly into JSX (React escapes them), never through
// `dangerouslySetInnerHTML` - `body` is already plain text by the time it
// reaches this component (decodeBlackboardHtmlPayload ran at parse time), so
// there is no HTML here to render safely OR unsafely.
import type { CartridgeAnnouncement } from "@/lib/cartridge-import-shared";
import styles from "../../page.module.css";

export function AnnouncementsExportSection({ announcements }: { announcements: CartridgeAnnouncement[] }) {
  if (announcements.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
      <div>
        <h3 style={{ margin: "0 0 2px" }}>Announcements</h3>
        {/* AC6: states plainly that these are read-only, sourced from the
            stored export - never Canvas. */}
        <p className={styles.fieldHint}>
          Recovered from this course&apos;s stored export. Read-only - these were never posted to Canvas from here.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {announcements.map((announcement, i) => (
          <div key={i} className={styles.ccModule}>
            <div className={styles.ccHead} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>{announcement.title || "(untitled announcement)"}</span>
                <span className={styles.ccHint}>
                  Order {announcement.order ?? "(none)"}
                  {announcement.isDraft ? " - Draft" : ""}
                </span>
              </div>
              {/* Raw string, never parsed into a Date - see
                  CartridgeAnnouncement.releaseDate's own doc comment for why
                  ("2026-08-17 04:30:00 MDT" carries a zone abbreviation that
                  new Date() would resolve inconsistently). */}
              <span className={styles.ccHint}>
                {announcement.releaseDate ? `Release date: ${announcement.releaseDate}` : "No release date recorded"}
              </span>
            </div>
            <div className={styles.ccItems}>
              {announcement.body ? (
                <p style={{ margin: 0, lineHeight: 1.55, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                  {announcement.body}
                </p>
              ) : (
                <p className={styles.ccHint} style={{ margin: 0 }}>
                  This announcement has no body text.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
