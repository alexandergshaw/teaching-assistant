# Download a generated version from the preview modal (chunk 3c)

The preview modal that opens after any "Generate from selection" run
(`GeneratedPreviewModal.tsx`) can show a version and regenerate it, but
there is no way to get the content OUT of the app. This chunk adds a download
control to that modal.

Scope is the preview modal only. No Canvas write is added, nothing about
generation, refine, or version history changes.

## Reuse survey (vetted - every item read before this doc was written)

Existing code this chunk MUST reuse rather than reinvent:

| Need | Existing symbol | Path | Notes |
| --- | --- | --- | --- |
| Build a `.pptx` | `buildSlidesPptx({presentationTitle, slides, subtitle?, author?, theme?}): Promise<ArrayBuffer>` | `src/lib/pptx.ts:199` | CLIENT-SAFE: no `server-only`, no `fs`; `pptxgenjs` is a dynamic `await import` at `:213`. Already called from `"use client"` files (`ppt-design/index.tsx:27`, `moduleContentActions.ts:2`). |
| Slide input type | `PptxSlide {title, bullets, code?, codeLanguage?, notes?, graphic?}` | `src/lib/pptx.ts:19` | Structurally identical to `SlideData` (`actions-types.ts:6`) and to `DeckGeneratedSlide` (`kinds.ts:112`). |
| Build a `.docx` | `buildDocxFromPlainText(text, templateHeadings?, author?): Promise<ArrayBuffer>` | `src/lib/docx.ts:230` | Isomorphic; the `docx` package is a dynamic import at `:235`. Parses `# Title` / `## Section` / `- bullet`. |
| Read a deck's slides back off an artifact | `parseDeckSlidesFromStructured(structured: unknown): SlideData[]` | `src/lib/lms-generation/deck.ts:96` | Already the exact reader `refineGeneratedArtifactAction` uses. Pure. Returns `[]` for a non-array. |
| Trigger the browser download | `triggerFileDownload(blob, filename): void` | `src/app/components/course-planning/utils.ts:19` | The DOM dance exists 5x as named helpers + 19x inline. Reuse this one; do NOT add a 6th copy. |
| The record being downloaded | `GeneratedArtifact {kind, version, isCurrent, title, text, structured, prompt, createdAt, ...}` | `src/lib/supabase/generated-artifacts.ts:37` | `text` is set for EVERY kind. `structured` is populated ONLY by decks and holds a bare JSON ARRAY of slides. The deck's presentation title lives in `title`, NOT in `structured`. |
| Modal CSS | `previewBackdrop/previewModal/previewHeader/previewMeta/previewCloseButton/previewContent` | `src/app/page.module.css` | Already used by this modal. Add no new CSS. |

Deliberately NOT reused:

- `slidesToText` / `textToSlides` (`content-tab/utils.ts:185/193`) - that module imports
  `@/app/actions`, and `SlideDeck` (`content-tab/types.ts:9`) carries only
  `title` + `bullets`, so round-tripping a deck through it would DROP
  `notes`/`code`/`codeLanguage`/`graphic`. The `.pptx` path must read
  `structured` directly instead (see AC 4).
- `DocumentPreviewModal`'s own download (`:87-97`) - it is a hardcoded inline
  `text/plain` blob with no format choice and no deck awareness.

## Acceptance criteria

1. **THE MODAL OFFERS A DOWNLOAD FOR THE VERSION CURRENTLY ON SCREEN.** Not the
   newest version, not the current-marked one: whatever `preview.selectedVersion`
   points at. Switching the version picker and then downloading yields that
   version's bytes.

2. **EVERY KIND CAN DOWNLOAD MARKDOWN AND WORD.** `.md` is the artifact's `text`
   verbatim (it is already markdown-ish for every kind: `currentEvents` stores
   `reportMarkdown`, `decks` stores the `# / ## / -` projection, `qa` stores
   `Q1:/A:` blocks). `.docx` is `buildDocxFromPlainText(text)`.

3. **A DECK ALSO OFFERS POWERPOINT, AND ONLY A DECK DOES.** The `.pptx` option is
   shown when, and only when, the selected version actually has usable slides -
   i.e. `parseDeckSlidesFromStructured(version.structured).length > 0`. Gate on
   the PARSED RESULT, not on `kindId === "decks"`: a deck version saved before
   `structured` existed, or one whose `structured` failed to parse, must not
   offer a `.pptx` button that would produce an empty deck.

4. **THE POWERPOINT PATH IS THE LOSSLESS ONE.** It reads `structured` (which
   carries `notes`, `code`, `codeLanguage`, `graphic`) and passes those slides
   straight to `buildSlidesPptx`. It must NOT go through the `text` projection,
   which drops all four - that loss is exactly what `structured` was added for
   (REGRESSION.md entry 266 check 2). The presentation title comes from the
   artifact's `title` column, falling back to the kind label when null.

5. **FILENAMES ARE SAFE AND SAY WHICH VERSION.** `<name> v<version>.<ext>`, where
   `<name>` is the artifact `title` when set, else the kind label. Any character
   illegal in a Windows filename (`\ / : * ? " < > |`), plus control characters,
   is replaced; the result is never empty and never only dots/spaces. Downloading
   v2 and v3 of the same kind produces two distinct filenames.

6. **A FAILED BUILD REPORTS ITSELF AND LEAVES THE MODAL OPEN.** `.docx`/`.pptx`
   construction is async and can throw. A throw surfaces through the tab's
   existing `setNote({kind:"error"})` channel - the same one generate/refine
   already use - never an unhandled rejection, never a silently missing file, and
   never a closed modal.

7. **DOWNLOAD CANNOT COLLIDE WITH A GENERATE OR A REFINE.** The control is
   disabled while `busy !== ""`, matching the regenerate button. A download in
   flight also disables the download control itself so a double-click cannot
   start two builds.

8. **NOTHING IS WRITTEN ANYWHERE.** No Canvas call, no Supabase write, no new
   version row. The download is a pure client-side read of an already-saved
   version. The modal's existing "nothing was written to Canvas" promise holds.

9. **THE PURE HALF IS SEPARATELY TESTABLE.** Format availability and filename
   construction are pure functions exported from a new
   `src/lib/lms-generation/artifact-download.ts`, unit-testable with in-memory
   fixtures and no `vi.mock` - matching `useLmsGeneration.ts`'s own precedent of
   exporting its pure logic for `useLmsGeneration.test.ts`. That module must stay
   free of any `@/app/actions` or Supabase-client import.

10. **NO NEW CSS AND NO NEW VISUAL LANGUAGE.** The control reuses the modal's
    existing classes and MUI `Button`/`TextField select` idiom already in this
    file. Professional, minimal, no emoji.

## Limits (state, do not paper over)

- vitest here is node-env and renders no component (`src/**/*.test.ts` only), so
  the actual click-to-file behaviour is verified by reading, not by test. Tests
  cover the pure format/filename logic and the blob-building branch selection.
- `buildSlidesPptx` and `buildDocxFromPlainText` are exercised through their
  existing contracts; this chunk does not re-verify their output bytes.
