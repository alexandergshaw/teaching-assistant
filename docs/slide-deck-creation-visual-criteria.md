# Slide Deck Creation visual overhaul: acceptance criteria

## Scope and leverage

Improve the visual hierarchy and scanability of **Presentations > Slide Deck Creation** while preserving its current workflow and behavior. This is a presentational change to an existing capability, so no new leverage claim or diagnostic representation is owed: the screen adds no data path or failure mode (`docs/DEV_LOOP.md`, “Diagnostics representation”; `docs/loop/leverage.md`, “Re-deriving this list”). Do not describe visual polish as an advantage over a chat with an LLM.

## Existing flow to preserve

The current screen renders, in order, the `TabHeader`, `SourcesEditor`, `DeckTemplatePicker`, output/review selection and Generate action, then one `ArtifactCard` for each selected output (`src/app/components/presentations/index.tsx:144-205`). Preserve these behaviors and their data:

- Context text, uploaded/extracted sources, source renaming/removal, and upload errors remain available (`SourcesEditor.tsx:117-206,209-238`).
- Template upload, optional selection, clearing selection, and upload errors remain available (`DeckTemplatePicker.tsx:107-169`).
- Outline, activities, deck, and optional AI critique remain independently selectable; the chosen selection remains persisted (`index.tsx:41-46,161-190`). Generate remains disabled while generation is in progress or when no output is selected. Each selected artifact keeps its own loading, error/retry, success, critique, and regenerate state (`index.tsx:61-129,193-205`; `ArtifactCard.tsx:38-90,138-185`).
- Keep the existing deck preview, template fill behavior, and artifact-specific content intact. This activity changes presentation, not generation semantics, persistence, copy meaning, or navigation.

## Visual acceptance criteria

1. **A clear task hierarchy:** retain the page title, then group the interface into visibly distinct stages: (a) provide context and source material, (b) choose an optional PowerPoint template, (c) choose deliverables and review, and (d) generate and review results. Use concise section headings and consistent card or section boundaries so the stages can be identified without reading every helper sentence. The Generate action is the strongest action in the setup area; it must not visually compete with upload, template, rename, remove, or regenerate controls.

2. **A compact setup area:** context entry and source upload/readback should read as one source-material section. Show extracted sources and per-file extraction/error feedback adjacent to that section. Present the template as a clearly optional, separate stage with its current explanation that it supplies slide design and must have enough slides; retain the selected-template and “use the deck’s own design” affordances. Do not collapse or hide currently visible tasks behind a new interaction.

3. **Understandable output choices:** group the three output checkboxes together and visually distinguish the optional critique choice. Keep the selected state apparent and the existing Generate-disabled conditions apparent. Results should begin after setup as clearly separated, named artifact sections; loading/error/success/critique states remain visually distinguishable and each artifact keeps its own retry or regenerate action.

4. **Use the app’s visual language:** build on existing theme-aware tokens and nearby component patterns rather than introducing arbitrary colors, shadows, or type sizes. Relevant tokens include `--card-background`, `--card-border`, `--text-primary`, `--text-secondary`, `--field-border`, `--accent`, `--border-soft`, `--surface-subtle`, `--surface-muted`, the eight `--font-size-*` values, and the 4px-grid `--space-*` values (`src/app/globals.css:20-27,62-96`; dark-theme overrides at `:283-310`). State which nearby pattern is reused in the implementation review. The hierarchy must remain legible in both light and dark themes; do not rely on color alone for selection, status, or error meaning.

5. **Responsive behavior:** at narrow widths, every section and control remains available without horizontal page scrolling; form controls and action groups wrap or stack, and source-name/remove controls remain operable without overlap. At wider widths, use available space to improve scanability without stretching the context input or result text into unreadable full-width lines. Check the real containing page and its available width before choosing percentage sizing; the visual seat requires measuring actual container constraints (`docs/loop/seats.md`, “Visual / aesthetic”). Evaluate at 320px, 768px, and 1280px viewport widths in a real browser and record observed dimensions/results; these are test viewports, not claims about supported device breakpoints.

6. **No behavior regressions from styling:** retain semantic labels and descriptions for context, file inputs, template selection, checkboxes, and buttons. Keyboard focus remains visible, DOM/focus order follows the visual sequence, and upload drop target remains keyboard operable. Busy, disabled, error, and selected states remain understandable to assistive technology. Accessibility review must label findings as code-reading claims unless independently exercised in a rendered browser; this repository does not render components in its tests (`docs/loop/seats.md:374-385`; `docs/loop/this-repo.md`, test-framework limitations).

## Verification and limits

- Run the repository’s focused type, lint, structural, and relevant unit/wiring gates identified by `docs/loop/this-repo.md`; verify existing source, selection, generation, template, and artifact-state contracts still pass. Tests here do not render React components, so a passing test suite does not establish appearance, responsive layout, focus, or keyboard behavior (`docs/DEV_LOOP.md`, top-level rule; `docs/loop/this-repo.md`).
- Use an authenticated browser with the app configured to inspect the changed screen in both themes and the three viewport widths above. Capture evidence of the setup, generation/loading, error/retry, and generated-result states. If that browser/app configuration is unavailable, report those checks as unverified; do not infer them from source or test output.
- Residual owner/browser check: an owner with access to the authenticated app reviews the actual visual result and keyboard operation at the specified widths and themes. A screenshot or browser session is required to close that residual; unit tests alone cannot.

## Out of scope

Do not redesign Slide Deck Pipeline, PowerPoint Design, or other presentation tabs; add generation features; change which data is persisted; alter upload support or template semantics; or add a new visual/analytics diagnostic surface.
