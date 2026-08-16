# Recover the announcements from a Blackboard archive

Instructor request: after the body and rubric work (REGRESSION entries 301 and
302), recover the 16 weekly announcements the archive carries and currently
discards entirely.

## What the archive holds

Verified against the instructor's real file. Sixteen resources,
`res00031.dat` through `res00046.dat`, `type="resource/x-bb-announcement"`,
**none referenced from `<organizations>`** - so they are found by scanning
manifest resource types, exactly as the rubric resource is (entry 302), never by
walking the item tree.

```
ANNOUNCEMENT/TITLE/@value                 attribute - "Week 1 - Course Setup and Development Workflow"
ANNOUNCEMENT/DESCRIPTION/TEXT             element text, singly XML-escaped HTML
ANNOUNCEMENT/DATES/RESTRICTSTART/@value   attribute - "2026-08-17 04:30:00 MDT"
ANNOUNCEMENT/DATES/CREATED/@value         attribute
ANNOUNCEMENT/ORDERNUM/@value              attribute - "1" .. "16"
ANNOUNCEMENT/ISDRAFT/@value               attribute - "true" on all 16
```

Each body is a full weekly announcement: a greeting, a bolded "This week: X"
line, a framing paragraph, a "What to focus on this week:" heading and a list of
three bullets. Raw lengths run 739 to 1105 characters.

## Three decisions that each have a wrong answer that looks right

**1. ORDERNUM IS NOT A WEEK NUMBER.** It is a display-order ordinal. It happens
to run 1..16 alongside titles that say "Week 1".."Week 16", which is exactly
what makes inferring `week` from it tempting. Do not. Every draft and package
type in this app (`WeeklyAnnouncementDraft.week`, `PackagedAnnouncement.week`)
takes a REQUIRED week number, and a wrong week number is worse than no week
number - it would silently mis-schedule. Surface the value as "order in the
archive", and parse a week from the TITLE only if a later chunk needs one, using
the existing `extractModuleNumber` rather than a second parser.

**2. THE RELEASE DATE IS NOT ISO-8601.** `"2026-08-17 04:30:00 MDT"` carries a
zone ABBREVIATION. `new Date(s)` handling of `MDT` is engine-dependent, and a
silently-wrong-by-an-hour date on a scheduled announcement is a real defect.
Carry the raw string verbatim and display it verbatim. Do not convert, do not
produce an ISO string, and do not add a `Date` field that a future caller would
trust.

**3. THE BODY IS HTML, AND THE MODEL IS TEXT.** The decode pipeline from entry
301 (`decodeBlackboardHtmlPayload`) already turns singly-escaped Blackboard HTML
into clean text; it is currently private to
`cartridge-import-blackboard-body.ts` and needs exporting. Store plain TEXT,
consistent with how every item body in this parser family is stored, and accept
that bold and bullet structure is lost. Do NOT additionally store an `html`
field "for later": entry 302 already rejected a `maxValue` field on exactly this
ground - a field written by one parser and read by nobody. If a round trip into
`common-cartridge.ts`'s `announcements[].html` is wanted later, that chunk can
add it with a consumer attached.

## Acceptance criteria

**AC1. A new `CartridgeAnnouncement` type**, carrying only what is consumed:
title, body text, the raw release-date string, the order ordinal, and the draft
flag. No week number, no Date object, no html field.

**AC2. Parsed by resource-type scan, reusing what exists.**
`selfClosingAttrValue` for the attributes and `decodeBlackboardHtmlPayload` for
the body - no second attribute reader, no second decode. The resource scan
mirrors `resolveBlackboardRubrics`. CASE-INSENSITIVE MATCHING IS MANDATORY:
entry 302 records that Blackboard mixes casing within one file and that an
upper-only matcher passed every synthetic test while returning nothing from the
real archive. The observed casing here is `<ANNOUNCEMENT>`, `<TITLE>`,
`<DESCRIPTION>`, `<TEXT>`, `<DATES>`, `<RESTRICTSTART>`, `<ORDERNUM>`,
`<ISDRAFT>` - upper - but do not rely on that.

**AC3. Ordered by ORDERNUM**, numerically, not by resource filename and not by
zip iteration order. An announcement with no ORDERNUM sorts last rather than
being dropped.

**AC4. Optional on `CartridgeCourseData`, always-an-array on
`ExportCourseContent`.** The first mirrors `appGenerated?` and `description?`,
whose doc comments state that optionality is what keeps roughly twenty existing
fixtures valid with no edit. The second mirrors `rubrics`, whose doc comment
promises "always an array, never undefined, so every consumer can call .length
with no guard" - the adapter defaults it. Do not let the new field behave
differently from its neighbours in either interface.

**AC5. Visible to the instructor, not merely parsed.** A read-only section in
the Course Content tab's export view, sibling to the modules render, showing
each announcement's title, its raw release date, its order, and its body. This
is the acceptance criterion that matters most: `rubrics` has been on
`ExportCourseContent` since the adapter shipped and the Content tab still does
not display it, and entries 262 check 10 and 274 check 6a both record
capabilities that shipped unreachable with every gate green. Parsed-but-invisible
is the default outcome in this area unless a surface is built in the same chunk.

**AC6. NO POST CONTROL, in this chunk.** An announcement is the one export
artifact that would post cleanly to Canvas, which makes it the tempting mistake.
`contentSourceGating.ts` exists because export-sourced content has no Canvas
identity; a post button would sit one click from `createAnnouncementAction` with
no gating. Read-only, and the section states that these come from the stored
export.

**AC7. Render the body safely.** It is instructor-authored HTML from an external
archive, reduced to text by AC-2's pipeline. Render it as TEXT - no
`dangerouslySetInnerHTML`. Check how `syllabusHtml` is handled before choosing,
and match the safer precedent.

**AC8. Nothing regresses.** `parseRubrics` and the Canvas path stay untouched;
every existing `CartridgeCourseData` fixture stays valid without edit; the
announcement DRAFTING flow (`announcement-package-content.ts`,
`draftWeeklyAnnouncements`) is not rewired - archive announcements are data, not
drafting input. Feeding a finished announcement into a drafter would launder
existing prose through an LLM.

## Out of scope

- Posting or scheduling archive announcements to Canvas.
- Wiring them into `draftWeeklyAnnouncements` or the weekly-announcement
  package builder. `steps.weekly-announcement-schedule.ts` has a
  `draftFrom: "cartridge"` mode that uses a cartridge as MODULE MATERIAL to
  draft from; "use the announcements already written in the archive" is a
  fourth, unrepresented source and a larger chunk.
- Inferring a week number, or converting the release date to a Date.

## Verification

Fixtures synthetic and ASCII - the instructor's course content does not enter
the repo. Beyond the committed tests, this chunk is verified against the real
archive by a throwaway scratch run (written, run, deleted) the way entries 301
and 302 were: it must recover 16 announcements, in ORDERNUM order, each with a
non-empty body containing no tag noise and no `&lt;`, and the release date
string carried through byte-for-byte.
